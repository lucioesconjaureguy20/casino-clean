import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { verifyGameToken } from "../lib/gameToken.js";

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const COMMISSION_RATE    = parseFloat(process.env.AFFILIATE_COMMISSION_RATE    || "0.15");
const MIN_COMMISSION_USD = parseFloat(process.env.AFFILIATE_MIN_COMMISSION_USD || "50");
// Timezone del negocio: America/Argentina/Buenos_Aires (UTC-3, sin horario de verano)
const TZ_OFFSET_HOURS = 3;
const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES || "").split(",").map(u => u.trim().toLowerCase()).filter(Boolean);

// ── Admin auth middleware ─────────────────────────────────────────────────────
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No autenticado." });

  // Try game token first
  const gt = verifyGameToken(token);
  if (gt && ADMIN_USERNAMES.includes(gt.username.toLowerCase())) return next();

  // Try Supabase JWT
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return res.status(401).json({ error: "Sesión inválida." });
    const data = await r.json();
    const username = (data?.user_metadata?.username || "").toLowerCase();
    if (!ADMIN_USERNAMES.includes(username)) return res.status(403).json({ error: "No autorizado." });
    return next();
  } catch {
    return res.status(401).json({ error: "Error de autenticación." });
  }
}

function supabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_KEY!,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

function generateRefCode(username: string): string {
  return username.toLowerCase().replace(/[^a-z0-9]/g, "") || crypto.randomBytes(4).toString("hex");
}

async function supabaseFetch(path: string, options: RequestInit = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("Supabase not configured");
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...supabaseHeaders(), ...(options.headers as Record<string, string> || {}) },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase error ${resp.status}: ${text}`);
  }
  // 204 No Content (típico en DELETE con Prefer: return=minimal) — cuerpo vacío
  if (resp.status === 204) return null;
  const text = await resp.text();
  return text ? JSON.parse(text) : null;
}

router.get("/affiliate/link/:username", async (req, res) => {
  const { username } = req.params;
  if (!username) return res.status(400).json({ error: "Missing username" });

  try {
    const existing = await supabaseFetch(
      `affiliate_links?username=eq.${encodeURIComponent(username)}&select=*&limit=1`
    );
    if (existing && existing.length > 0) {
      return res.json({ ref_code: existing[0].ref_code, username });
    }
    return res.json({ ref_code: null, username });
  } catch (err: any) {
    return res.json({ ref_code: null, username, fallback: true });
  }
});

// ── PUT /api/affiliate/link/:username/set-code — el streamer elige su propio código ──
router.put("/affiliate/link/:username/set-code", async (req, res) => {
  const { username } = req.params;
  const { code } = req.body;
  if (!username || !code) return res.status(400).json({ error: "Faltan parámetros." });

  const cleanCode = String(code).toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 30);
  if (cleanCode.length < 3) return res.status(400).json({ error: "El código debe tener al menos 3 caracteres." });

  try {
    // Verificar que no esté en uso por otro usuario
    const taken = await supabaseFetch(
      `affiliate_links?ref_code=eq.${encodeURIComponent(cleanCode)}&select=username&limit=1`
    );
    if (taken && taken.length > 0 && taken[0].username.toLowerCase() !== username.toLowerCase()) {
      return res.status(409).json({ error: "Ese código ya está en uso por otro streamer." });
    }

    // Verificar si ya tiene un registro
    const userLink = await supabaseFetch(
      `affiliate_links?username=eq.${encodeURIComponent(username)}&select=id&limit=1`
    );
    if (userLink && userLink.length > 0) {
      await supabaseFetch(`affiliate_links?username=eq.${encodeURIComponent(username)}`, {
        method: "PATCH",
        body: JSON.stringify({ ref_code: cleanCode }),
      });
    } else {
      await supabaseFetch("affiliate_links", {
        method: "POST",
        body: JSON.stringify({ username, ref_code: cleanCode }),
      });
    }
    return res.json({ ref_code: cleanCode, username });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/affiliate/track-click", async (req, res) => {
  const { ref_code, visitor_ip } = req.body;
  if (!ref_code) return res.status(400).json({ error: "Missing ref_code" });

  const normalizedCode = String(ref_code).toUpperCase().trim();

  const visitor_hash = visitor_ip
    ? crypto.createHash("sha256").update(visitor_ip).digest("hex").slice(0, 16)
    : crypto.randomBytes(8).toString("hex");

  try {
    await supabaseFetch("affiliate_clicks", {
      method: "POST",
      body: JSON.stringify({ ref_code: normalizedCode, visitor_hash }),
    });
    return res.json({ ok: true });
  } catch {
    return res.json({ ok: true, fallback: true });
  }
});

router.get("/affiliate/stats/:username", async (req, res) => {
  const { username } = req.params;
  const { month } = req.query;

  try {
    const linkRows = await supabaseFetch(
      `affiliate_links?username=eq.${encodeURIComponent(username)}&select=ref_code&limit=1`
    );
    const ref_code = linkRows?.[0]?.ref_code || generateRefCode(username);

    let clicksQuery = `affiliate_clicks?ref_code=eq.${encodeURIComponent(ref_code)}&select=id`;
    let referralsQuery = `affiliate_referrals?referrer_username=eq.${encodeURIComponent(username)}&select=*`;
    let commissionsQuery = `affiliate_commissions?referrer_username=eq.${encodeURIComponent(username)}&select=*`;

    if (month) {
      const [year, mon] = (month as string).split("-");
      const from = `${year}-${mon}-01T00:00:00`;
      const daysInMonth = new Date(parseInt(year), parseInt(mon), 0).getDate();
      const to = `${year}-${mon}-${daysInMonth}T23:59:59`;
      clicksQuery += `&created_at=gte.${from}&created_at=lte.${to}`;
      referralsQuery += `&created_at=gte.${from}&created_at=lte.${to}`;
      commissionsQuery += `&created_at=gte.${from}&created_at=lte.${to}`;
    }

    const [clicks, referrals, commissions] = await Promise.all([
      supabaseFetch(clicksQuery),
      supabaseFetch(referralsQuery),
      supabaseFetch(commissionsQuery),
    ]);

    const ftds = (referrals || []).filter((r: any) => r.is_ftd);
    const totalDeposits = (referrals || []).reduce((s: number, r: any) => s + (r.deposit_count || 0), 0);
    const totalDepositAmount = (referrals || []).reduce((s: number, r: any) => s + parseFloat(r.deposit_amount || 0), 0);
    const totalWager = (referrals || []).reduce((s: number, r: any) => s + parseFloat(r.wager_amount || 0), 0);
    const totalNGR = (referrals || []).reduce((s: number, r: any) => s + parseFloat(r.ngr || 0), 0);
    const commissionEarned = (commissions || []).reduce((s: number, c: any) => s + parseFloat(c.amount || 0), 0);
    const commissionPaid = (commissions || []).filter((c: any) => c.status === "paid").reduce((s: number, c: any) => s + parseFloat(c.amount || 0), 0);

    return res.json({
      clicks: (clicks || []).length,
      signups: (referrals || []).length,
      ftds: ftds.length,
      ftd_conversion: (referrals || []).length > 0 ? ((ftds.length / (referrals || []).length) * 100).toFixed(2) : "0.00",
      deposit_count: totalDeposits,
      deposit_amount: totalDepositAmount.toFixed(2),
      wager_amount: totalWager.toFixed(2),
      ngr: totalNGR.toFixed(2),
      commission_earned: commissionEarned.toFixed(2),
      commission_paid: commissionPaid.toFixed(2),
      commission_balance: (commissionEarned - commissionPaid).toFixed(2),
      commission_rate: COMMISSION_RATE,
    });
  } catch {
    return res.json({
      clicks: 0,
      signups: 0,
      ftds: 0,
      ftd_conversion: "0.00",
      deposit_count: 0,
      deposit_amount: "0.00",
      wager_amount: "0.00",
      ngr: "0.00",
      commission_earned: "0.00",
      commission_paid: "0.00",
      commission_balance: "0.00",
      commission_rate: COMMISSION_RATE,
    });
  }
});

router.get("/affiliate/referrals/:username", async (req, res) => {
  const { username } = req.params;
  try {
    // 1. Base referrals list
    const rows: any[] = await supabaseFetch(
      `affiliate_referrals?referrer_username=eq.${encodeURIComponent(username)}&select=*&order=created_at.desc&limit=100`
    ) || [];

    if (!rows.length) return res.json([]);

    const usernames = rows.map((r: any) => r.referred_username);
    const inFilter = usernames.map((u: string) => encodeURIComponent(u)).join(",");

    // 2. Real-time NGR from game_bets (all users at once)
    const bets: any[] = await supabaseFetch(
      `game_bets?username=in.(${inFilter})&select=username,bet_usd,payout_usd,bonus_usd&limit=50000`
    ).catch(() => []) || [];

    // Aggregate NGR and wager per username
    const ngrMap: Record<string, number> = {};
    const wagerMap: Record<string, number> = {};
    for (const b of bets) {
      const u = b.username;
      const ngr = parseFloat(b.bet_usd || 0) - parseFloat(b.payout_usd || 0) - parseFloat(b.bonus_usd || 0);
      const wager = parseFloat(b.bet_usd || 0);
      ngrMap[u] = (ngrMap[u] || 0) + ngr;
      wagerMap[u] = (wagerMap[u] || 0) + wager;
    }

    // 3. Get mander_ids from profiles for deposit lookup
    const profiles: any[] = await supabaseFetch(
      `profiles?username=in.(${inFilter})&select=username,mander_id&limit=200`
    ).catch(() => []) || [];
    const manderMap: Record<string, string> = {};
    for (const p of profiles) manderMap[p.username] = p.mander_id;

    // 4. Fetch completed deposits for all referred users
    const manderIds = profiles.map((p: any) => encodeURIComponent(p.mander_id)).filter(Boolean);
    let depositRows: any[] = [];
    if (manderIds.length) {
      depositRows = await supabaseFetch(
        `transactions?mander_id=in.(${manderIds.join(",")})&type=eq.deposit&status=eq.completed&select=mander_id,amount&limit=50000`
      ).catch(() => []) || [];
    }

    // Map mander_id → username for deposit aggregation
    const manderToUser: Record<string, string> = {};
    for (const p of profiles) manderToUser[p.mander_id] = p.username;

    const depositAmtMap: Record<string, number> = {};
    const depositCntMap: Record<string, number> = {};
    for (const d of depositRows) {
      const u = manderToUser[d.mander_id];
      if (!u) continue;
      depositAmtMap[u] = (depositAmtMap[u] || 0) + parseFloat(d.amount || 0);
      depositCntMap[u] = (depositCntMap[u] || 0) + 1;
    }

    // 5. Merge everything
    const enriched = rows.map((r: any) => {
      const u = r.referred_username;
      const ngr = ngrMap[u] ?? 0;
      const deposit_amount = depositAmtMap[u] ?? 0;
      const deposit_count = depositCntMap[u] ?? 0;
      const wager_amount = wagerMap[u] ?? 0;
      return {
        referred_username: u,
        created_at: r.created_at,
        is_ftd: deposit_count > 0,
        deposit_count,
        deposit_amount: deposit_amount.toFixed(2),
        wager_amount: wager_amount.toFixed(2),
        ngr: ngr.toFixed(2),
      };
    });

    return res.json(enriched);
  } catch (err: any) {
    console.error("[affiliate/referrals] error:", err.message);
    return res.json([]);
  }
});

router.get("/affiliate/commissions/:username", async (req, res) => {
  const { username } = req.params;
  try {
    const rows = await supabaseFetch(
      `affiliate_commissions?referrer_username=eq.${encodeURIComponent(username)}&select=*&order=created_at.desc&limit=100`
    );
    return res.json(rows || []);
  } catch {
    return res.json([]);
  }
});

router.post("/affiliate/register-referral", async (req, res) => {
  const { referred_username, ref_code } = req.body;
  if (!referred_username || !ref_code) return res.status(400).json({ error: "Missing params" });

  const normalizedCode = String(ref_code).toUpperCase().trim();

  try {
    const linkRows = await supabaseFetch(
      `affiliate_links?ref_code=eq.${encodeURIComponent(normalizedCode)}&select=username&limit=1`
    );
    if (!linkRows || linkRows.length === 0) return res.status(404).json({ error: "Invalid ref_code" });

    const referrer_username = linkRows[0].username;

    if (referrer_username === referred_username) {
      return res.status(400).json({ error: "Self-referral not allowed" });
    }

    const existing = await supabaseFetch(
      `affiliate_referrals?referred_username=eq.${encodeURIComponent(referred_username)}&select=id&limit=1`
    );
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: "Already referred" });
    }

    await supabaseFetch("affiliate_referrals", {
      method: "POST",
      body: JSON.stringify({
        referrer_username,
        referred_username,
        is_ftd: false,
        deposit_count: 0,
        deposit_amount: 0,
        wager_amount: 0,
        ngr: 0,
      }),
    });

    return res.json({ ok: true, referrer: referrer_username });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Admin: POST /api/admin/affiliate/generate-commissions ────────────────────
// Body: { period: "YYYY-MM" }
// Fuente de verdad: game_bets. NGR = SUM(bet_usd - payout_usd - bonus_usd).
// Timezone: America/Argentina/Buenos_Aires (UTC-3, fijo sin DST).
// No genera comisión si NGR <= 0 o comisión < MIN_COMMISSION_USD.
// Constraint UNIQUE(referrer_username, period) previene duplicados a nivel DB.
router.post("/admin/affiliate/generate-commissions", requireAdmin, async (req: Request, res: Response) => {
  const { period, bypass_minimum } = req.body ?? {};
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "period requerido en formato YYYY-MM (ej: 2026-03)" });
  }
  const effectiveMin = bypass_minimum ? 0 : MIN_COMMISSION_USD;

  const [year, month] = period.split("-").map(Number);

  // Límites del mes en horario Argentina (UTC-3):
  // Inicio: primer día del mes a las 00:00:00 ART = primer día 03:00:00 UTC
  const fromUTC = new Date(Date.UTC(year, month - 1, 1, TZ_OFFSET_HOURS, 0, 0, 0));
  // Fin:    último día del mes a las 23:59:59.999 ART
  //         = primer día del mes siguiente 02:59:59.999 UTC
  const toUTC = new Date(Date.UTC(year, month, 1, TZ_OFFSET_HOURS, 0, 0, 0) - 1);
  const from = fromUTC.toISOString();
  const to   = toUTC.toISOString();

  console.log(`[generate-commissions] period=${period} from=${from} to=${to} minUSD=${MIN_COMMISSION_USD}`);

  try {
    // 1. Cargar todos los afiliados y todos sus referidos en una sola pasada
    const links: any[] = await supabaseFetch(
      "affiliate_links?select=username&limit=500"
    ).catch(() => []);
    if (!links?.length) return res.json({ generated: 0, skipped: 0, message: "No hay afiliados" });

    const referrals: any[] = await supabaseFetch(
      "affiliate_referrals?select=referrer_username,referred_username&limit=10000"
    ).catch(() => []);

    // Mapa: referrer → [referred_username, ...]
    const referrerMap: Record<string, string[]> = {};
    for (const r of referrals) {
      if (!referrerMap[r.referrer_username]) referrerMap[r.referrer_username] = [];
      referrerMap[r.referrer_username].push(r.referred_username);
    }

    // 2. Precargar comisiones ya existentes para este período (prevención de duplicados)
    const existingAll: any[] = await supabaseFetch(
      `affiliate_commissions?period=eq.${period}&select=referrer_username&limit=1000`
    ).catch(() => []);
    const alreadyPaid = new Set((existingAll || []).map((c: any) => c.referrer_username));

    let generated = 0;
    let skipped   = 0;
    const results: any[] = [];

    for (const link of links) {
      const referrer = link.username;
      const referred = referrerMap[referrer];
      if (!referred?.length) { skipped++; continue; }

      // Verificación en memoria (doble seguro además de la constraint UNIQUE)
      if (alreadyPaid.has(referrer)) {
        console.log(`[generate-commissions] ${referrer}: ya tiene comisión para ${period}, skip`);
        skipped++;
        continue;
      }

      // 3. Calcular NGR del período desde game_bets (única fuente de verdad)
      //    NGR = SUM(bet_usd - payout_usd - bonus_usd)
      //    Solo apuestas dentro del rango de fechas en timezone Argentina.
      let periodNGR = 0;

      for (const u of referred) {
        const bets: any[] = await supabaseFetch(
          `game_bets?username=eq.${encodeURIComponent(u)}&created_at=gte.${from}&created_at=lte.${to}&select=bet_usd,payout_usd,bonus_usd&limit=20000`
        ).catch(() => []);
        for (const b of (bets || [])) {
          const ngr = parseFloat(b.bet_usd || 0)
                    - parseFloat(b.payout_usd || 0)
                    - parseFloat(b.bonus_usd  || 0);
          periodNGR += ngr;
        }
      }

      // 4. Aplicar reglas de negocio: NGR <= 0 o comisión < mínimo → no generar
      if (periodNGR <= 0) {
        console.log(`[generate-commissions] ${referrer}: NGR=${periodNGR.toFixed(2)} <= 0, skip`);
        skipped++;
        continue;
      }

      const commAmount = parseFloat((periodNGR * COMMISSION_RATE).toFixed(2));
      if (commAmount < effectiveMin) {
        console.log(`[generate-commissions] ${referrer}: comisión $${commAmount} < mínimo $${effectiveMin}, skip`);
        results.push({ referrer, ngr: periodNGR.toFixed(2), commission: commAmount, skipped: true, reason: `Comisión $${commAmount} < mínimo $${effectiveMin}` });
        skipped++;
        continue;
      }

      // 5. Insertar comisión — la constraint UNIQUE (referrer_username, period) en
      //    la DB es el último firewall contra duplicados si esta función corre en paralelo.
      try {
        await supabaseFetch("affiliate_commissions", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            referrer_username: referrer,
            amount:            commAmount,
            ngr_period:        parseFloat(periodNGR.toFixed(2)),
            period,
            status:            "pending",
          }),
        });
        alreadyPaid.add(referrer); // marcar en memoria para evitar re-procesarlo
        generated++;
        results.push({ referrer, ngr: periodNGR.toFixed(2), commission: commAmount });
        console.log(`[generate-commissions] ${referrer}: NGR=$${periodNGR.toFixed(2)} comisión=$${commAmount} GENERADA`);
      } catch (dupErr: any) {
        // Si la constraint UNIQUE rechaza la inserción, contar como ya existente
        console.warn(`[generate-commissions] ${referrer}: insert rechazado (posible duplicado):`, dupErr.message);
        skipped++;
      }
    }

    return res.json({ generated, skipped, period, tz: "America/Argentina/Buenos_Aires", results });
  } catch (err: any) {
    console.error("[generate-commissions] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Admin: GET /api/admin/affiliate/commissions ───────────────────────────────
router.get("/admin/affiliate/commissions", requireAdmin, async (req: Request, res: Response) => {
  const { period, status } = req.query;
  try {
    let qs = "affiliate_commissions?select=id,referrer_username,amount,ngr_period,period,status,created_at&order=created_at.desc&limit=500";
    if (period) qs += `&period=eq.${encodeURIComponent(period as string)}`;
    if (status)  qs += `&status=eq.${encodeURIComponent(status as string)}`;
    const rows = await supabaseFetch(qs);
    return res.json(Array.isArray(rows) ? rows : []);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Admin: PATCH /api/admin/affiliate/commissions/:id/pay ─────────────────────
router.patch("/admin/affiliate/commissions/:id/pay", requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "id requerido" });
  try {
    const updated = await supabaseFetch(`affiliate_commissions?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "paid", paid_at: new Date().toISOString() }),
    });
    return res.json({ ok: true, commission: Array.isArray(updated) ? updated[0] : updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Admin: GET /api/admin/affiliates — list all affiliates with stats ─────────
// NGR calculado en tiempo real desde game_bets (fuente de verdad).
// FTD calculado desde transactions reales (no cache).
// last_activity = última apuesta o depósito del referido más reciente.
router.get("/admin/affiliates", requireAdmin, async (req: Request, res: Response) => {
  try {
    const links = await supabaseFetch(
      "affiliate_links?select=username,ref_code,created_at&order=created_at.desc&limit=200"
    );
    if (!Array.isArray(links) || links.length === 0) return res.json([]);

    const usernames = links.map((l: any) => l.username);
    const inList = `(${usernames.map((u: string) => `"${u}"`).join(",")})`;

    // 1. Referrals + commissions
    const [refRows, commRows] = await Promise.all([
      supabaseFetch(
        `affiliate_referrals?referrer_username=in.${inList}&select=referrer_username,referred_username&limit=10000`
      ).catch(() => []),
      supabaseFetch(
        `affiliate_commissions?referrer_username=in.${inList}&select=referrer_username,amount,status&limit=5000`
      ).catch(() => []),
    ]);

    // 2. Todos los usernames referidos
    const allReferred: string[] = (Array.isArray(refRows) ? refRows : []).map((r: any) => r.referred_username);
    if (allReferred.length === 0) {
      // No hay referidos: devolver solo estructura base
      return res.json(links.map((l: any) => ({
        username: l.username, ref_code: l.ref_code, created_at: l.created_at,
        signups: 0, ftds: 0, deposit_amount: "0.00", wager_amount: "0.00",
        ngr: "0.00", commission_earned: "0.00", commission_paid: "0.00", last_activity: null,
      })));
    }
    const referredInFilter = allReferred.map((u: string) => encodeURIComponent(u)).join(",");

    // 3. game_bets para NGR real + última apuesta
    const [bets, profiles] = await Promise.all([
      supabaseFetch(
        `game_bets?username=in.(${referredInFilter})&select=username,bet_usd,payout_usd,bonus_usd,created_at&limit=100000`
      ).catch(() => []),
      supabaseFetch(
        `profiles?username=in.(${referredInFilter})&select=username,mander_id&limit=500`
      ).catch(() => []),
    ]);

    // Mapas por username
    const ngrMap: Record<string, number>    = {};
    const wagerMap: Record<string, number>  = {};
    const lastBetMap: Record<string, string> = {};
    for (const b of (Array.isArray(bets) ? bets : [])) {
      const u = b.username;
      const ngr = parseFloat(b.bet_usd || 0) - parseFloat(b.payout_usd || 0) - parseFloat(b.bonus_usd || 0);
      ngrMap[u]   = (ngrMap[u]   || 0) + ngr;
      wagerMap[u] = (wagerMap[u] || 0) + parseFloat(b.bet_usd || 0);
      if (!lastBetMap[u] || b.created_at > lastBetMap[u]) lastBetMap[u] = b.created_at;
    }

    // mander_id → username
    const manderMap: Record<string, string> = {};
    for (const p of (Array.isArray(profiles) ? profiles : [])) manderMap[p.mander_id] = p.username;
    const manderIds = (Array.isArray(profiles) ? profiles : []).map((p: any) => encodeURIComponent(p.mander_id)).filter(Boolean);

    // 4. Depósitos reales (FTD desde transactions)
    let depositRows: any[] = [];
    if (manderIds.length) {
      depositRows = await supabaseFetch(
        `transactions?mander_id=in.(${manderIds.join(",")})&type=eq.deposit&status=eq.completed&select=mander_id,amount,created_at&limit=100000`
      ).catch(() => []) || [];
    }
    const depositAmtMap: Record<string, number> = {};
    const depositCntMap: Record<string, number> = {};
    const lastDepMap: Record<string, string>    = {};
    for (const d of depositRows) {
      const u = manderMap[d.mander_id];
      if (!u) continue;
      depositAmtMap[u] = (depositAmtMap[u] || 0) + parseFloat(d.amount || 0);
      depositCntMap[u] = (depositCntMap[u] || 0) + 1;
      if (!lastDepMap[u] || d.created_at > lastDepMap[u]) lastDepMap[u] = d.created_at;
    }

    // 5. Ensamblar por afiliado
    const result = links.map((link: any) => {
      const myRefs = (Array.isArray(refRows) ? refRows : []).filter((r: any) => r.referrer_username === link.username);
      const comms  = (Array.isArray(commRows) ? commRows : []).filter((c: any) => c.referrer_username === link.username);

      let signups = myRefs.length;
      let ftds = 0, deposit_amount = 0, wager_amount = 0, ngr = 0;
      let last_activity: string | null = null;

      for (const ref of myRefs) {
        const u = ref.referred_username;
        const depCount = depositCntMap[u] || 0;
        if (depCount > 0) ftds++;
        deposit_amount += depositAmtMap[u] || 0;
        wager_amount   += wagerMap[u]      || 0;
        ngr            += ngrMap[u]        || 0;

        // última actividad = max(última apuesta, último depósito)
        const candidates = [lastBetMap[u], lastDepMap[u]].filter(Boolean) as string[];
        for (const ts of candidates) {
          if (!last_activity || ts > last_activity) last_activity = ts;
        }
      }

      const commission_earned = comms.reduce((s: number, c: any) => s + parseFloat(c.amount || 0), 0);
      const commission_paid   = comms.filter((c: any) => c.status === "paid").reduce((s: number, c: any) => s + parseFloat(c.amount || 0), 0);

      return {
        username:          link.username,
        ref_code:          link.ref_code,
        created_at:        link.created_at,
        signups,
        ftds,
        deposit_amount:    deposit_amount.toFixed(2),
        wager_amount:      wager_amount.toFixed(2),
        ngr:               ngr.toFixed(2),
        commission_earned: commission_earned.toFixed(2),
        commission_paid:   commission_paid.toFixed(2),
        last_activity,
      };
    });

    return res.json(result);
  } catch (err: any) {
    console.error("[admin/affiliates] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Admin: GET /api/admin/affiliates/:username/players — jugadores del afiliado ─
router.get("/admin/affiliates/:username/players", requireAdmin, async (req: Request, res: Response) => {
  const { username } = req.params;
  if (!username?.trim()) return res.status(400).json({ error: "username requerido" });

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");

  try {
    const referrals = await supabaseFetch(
      `affiliate_referrals?referrer_username=eq.${encodeURIComponent(username.trim())}&select=referred_username,created_at&order=created_at.desc&limit=500`
    ).catch(() => []);
    if (!Array.isArray(referrals) || referrals.length === 0) return res.json([]);

    const referred = referrals.map((r: any) => r.referred_username);
    const referredFilter = referred.map((u: string) => encodeURIComponent(u)).join(",");

    // Profiles (mander_id, balance, created_at)
    const profiles = await supabaseFetch(
      `profiles?username=in.(${referredFilter})&select=username,mander_id,balance,created_at&limit=500`
    ).catch(() => []);

    const manderMap: Record<string, string> = {};
    const balanceMap: Record<string, number> = {};
    const joinedMap: Record<string, string> = {};
    for (const p of (Array.isArray(profiles) ? profiles : [])) {
      manderMap[p.username] = p.mander_id;
      balanceMap[p.username] = parseFloat(p.balance || 0);
      joinedMap[p.username] = p.created_at;
    }

    const manderIds = Object.values(manderMap).filter(Boolean).map(encodeURIComponent).join(",");

    // Depósitos
    let depositRows: any[] = [];
    if (manderIds) {
      depositRows = await supabaseFetch(
        `transactions?mander_id=in.(${manderIds})&type=eq.deposit&status=eq.completed&select=mander_id,amount,created_at&limit=100000`
      ).catch(() => []) || [];
    }
    const depAmtMap: Record<string, number> = {};
    const depCntMap: Record<string, number> = {};
    const lastDepMap: Record<string, string> = {};
    const manderToUser: Record<string, string> = {};
    for (const [u, m] of Object.entries(manderMap)) manderToUser[m] = u;
    for (const d of depositRows) {
      const u = manderToUser[d.mander_id];
      if (!u) continue;
      depAmtMap[u] = (depAmtMap[u] || 0) + parseFloat(d.amount || 0);
      depCntMap[u] = (depCntMap[u] || 0) + 1;
      if (!lastDepMap[u] || d.created_at > lastDepMap[u]) lastDepMap[u] = d.created_at;
    }

    // Apuestas (wager + NGR)
    const bets = await supabaseFetch(
      `game_bets?username=in.(${referredFilter})&select=username,bet_usd,payout_usd,bonus_usd&limit=100000`
    ).catch(() => []);
    const wagerMap: Record<string, number> = {};
    const ngrMap: Record<string, number> = {};
    for (const b of (Array.isArray(bets) ? bets : [])) {
      const u = b.username;
      const ngr = parseFloat(b.bet_usd || 0) - parseFloat(b.payout_usd || 0) - parseFloat(b.bonus_usd || 0);
      wagerMap[u] = (wagerMap[u] || 0) + parseFloat(b.bet_usd || 0);
      ngrMap[u]   = (ngrMap[u]   || 0) + ngr;
    }

    const result = referrals.map((r: any) => {
      const u = r.referred_username;
      return {
        username:       u,
        mander_id:      manderMap[u] || null,
        joined_at:      joinedMap[u] || r.created_at,
        referred_at:    r.created_at,
        balance:        (balanceMap[u] || 0).toFixed(2),
        deposit_count:  depCntMap[u] || 0,
        deposit_amount: (depAmtMap[u] || 0).toFixed(2),
        last_deposit:   lastDepMap[u] || null,
        wager_amount:   (wagerMap[u] || 0).toFixed(2),
        ngr:            (ngrMap[u] || 0).toFixed(2),
        is_ftd:         (depCntMap[u] || 0) > 0,
      };
    });

    return res.json(result);
  } catch (err: any) {
    console.error("[admin/affiliates/players] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Admin: DELETE /api/admin/affiliates/:username — remove affiliate code ─────
// Solo elimina affiliate_links. Referidos y comisiones se conservan como historial.
router.delete("/admin/affiliates/:username", requireAdmin, async (req: Request, res: Response) => {
  const { username } = req.params;
  if (!username?.trim()) return res.status(400).json({ error: "username requerido" });
  try {
    const encoded = encodeURIComponent(username.trim());
    // Verificar que existe
    const existing = await supabaseFetch(
      `affiliate_links?username=eq.${encoded}&select=ref_code&limit=1`
    ).catch(() => []);
    if (!Array.isArray(existing) || existing.length === 0) {
      return res.status(404).json({ error: "Afiliado no encontrado." });
    }
    const ref_code = existing[0].ref_code;
    // Borrar el link (solo el código, no los referidos ni comisiones históricas)
    await supabaseFetch(`affiliate_links?username=eq.${encoded}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    console.log(`[admin/affiliates] eliminado: ${username} (código: ${ref_code})`);
    return res.json({ success: true, username: username.trim(), ref_code });
  } catch (err: any) {
    console.error("[admin/affiliates DELETE] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Admin: POST /api/admin/affiliates/create — create affiliate link ──────────
router.post("/admin/affiliates/create", requireAdmin, async (req: Request, res: Response) => {
  const { username, ref_code: customCode } = req.body;
  if (!username?.trim()) return res.status(400).json({ error: "username requerido" });

  try {
    // Verificar si el usuario ya tiene código
    const existing = await supabaseFetch(
      `affiliate_links?username=eq.${encodeURIComponent(username.trim())}&select=ref_code&limit=1`
    ).catch(() => []);
    if (Array.isArray(existing) && existing.length > 0) {
      return res.json({ ref_code: existing[0].ref_code, username: username.trim(), already_exists: true });
    }

    let ref_code: string;
    if (customCode?.trim()) {
      // Validar código personalizado: solo letras, números y guión bajo, 2-30 chars
      const clean = customCode.trim().toUpperCase();
      if (!/^[A-Z0-9_]{2,30}$/.test(clean)) {
        return res.status(400).json({ error: "El código solo puede contener letras, números y guión bajo (2-30 caracteres)." });
      }
      // Verificar que no esté en uso
      const taken = await supabaseFetch(
        `affiliate_links?ref_code=eq.${encodeURIComponent(clean)}&select=username&limit=1`
      ).catch(() => []);
      if (Array.isArray(taken) && taken.length > 0) {
        return res.status(400).json({ error: `El código "${clean}" ya está en uso por otro afiliado.` });
      }
      ref_code = clean;
    } else {
      ref_code = generateRefCode(username.trim());
    }

    await supabaseFetch("affiliate_links", {
      method: "POST",
      body: JSON.stringify({ username: username.trim(), ref_code }),
    });
    return res.json({ ref_code, username: username.trim() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
