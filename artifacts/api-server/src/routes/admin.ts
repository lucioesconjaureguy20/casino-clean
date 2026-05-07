import { Router, Request, Response, NextFunction } from "express";
import { verifyGameToken } from "../lib/gameToken.js";
import { fetchWithTimeout } from "../lib/fetchWithTimeout";
import OpenAI from "openai";
import { getPriceUsd } from "../lib/prices.js";
import { nextDepositDisplayId } from "../lib/counters.js";
import { getIpReport, recordIp, seedUser, flushSeeds } from "../lib/ipStore.js";
import { pool } from "@workspace/db";
import { getAuthUsers as getCachedAuthUsers, getCachedBetRows, fetchAllRows } from "../lib/supabaseCache";

const SB_URL = process.env.SUPABASE_URL ?? "";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";
function sbAdminRaw(path: string, opts: RequestInit = {}) {
  return fetchWithTimeout(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
}

// ── Column availability cache ──────────────────────────────────────────────────
let _isDemoColReady: boolean | null = null;
async function isDemoColAvailable(): Promise<boolean> {
  if (_isDemoColReady !== null) return _isDemoColReady;
  try {
    const r = await sbAdminRaw("game_bets?select=is_demo&limit=0", { headers: { Prefer: "count=none" } });
    _isDemoColReady = r.ok;
  } catch {
    _isDemoColReady = false;
  }
  console.log(`[admin] game_bets.is_demo column available: ${_isDemoColReady}`);
  return _isDemoColReady;
}

const router = Router();

// Build an OpenAI client + pick model: prefer direct OPENAI_API_KEY, fall back to Replit proxy
function buildOpenAI(): { client: OpenAI; model: string } {
  const directKey = process.env.OPENAI_API_KEY;
  const replitBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const replitKey  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (directKey) return { client: new OpenAI({ apiKey: directKey }), model: "gpt-4o-mini" };
  if (replitBase && replitKey) return { client: new OpenAI({ baseURL: replitBase, apiKey: replitKey }), model: "gpt-5-mini" };
  throw new Error("No se configuró una clave de IA. Agrega OPENAI_API_KEY en los secretos del proyecto.");
}

// Endpoint temporal para descubrir la IP pública del servidor (útil para whitelist de Plisio)
router.get("/server-ip", async (_req: Request, res: Response) => {
  try {
    const r = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(5000) });
    const data: any = await r.json();
    return res.json({ ip: data.ip, note: "Esta es la IP pública de salida del servidor. Agregala a la whitelist de Plisio." });
  } catch (e: any) {
    return res.status(502).json({ error: "No se pudo obtener la IP: " + e.message });
  }
});

const SUPABASE_URL          = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY!;
const SUPABASE_ANON_KEY     = process.env.SUPABASE_ANON_KEY!;
const ADMIN_USERNAMES       = () =>
  (process.env.ADMIN_USERNAMES || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

function sbAdmin(path: string, opts: RequestInit = {}) {
  return fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
}

// GET /api/admin/deposits?status=pending|confirmed|all  (default=all)
// Excluye depósitos con address=pending (son solo generaciones de wallet sin pago real)
const _depositsCache = new Map<string, { data: unknown; at: number }>();
const DEPOSITS_CACHE_TTL = 60_000;

router.get("/deposits", async (req: Request, res: Response) => {
  const status = (req.query.status as string) ?? "all";
  const cached = _depositsCache.get(status);
  if (cached && Date.now() - cached.at < DEPOSITS_CACHE_TTL) {
    return res.json(cached.data);
  }
  const baseSelect = "select=id,user_id,amount,currency,network,address,tx_hash,status,created_at&order=created_at.desc&limit=500&address=neq.pending";
  const statusFilter = status === "all"
    ? `deposits?${baseSelect}`
    : `deposits?status=eq.${encodeURIComponent(status)}&${baseSelect}`;
  try {
    const r = await sbAdmin(statusFilter);
    if (!r.ok) return res.status(502).json({ error: "supabase error" });
    const deposits: any[] = await r.json();
    if (!deposits.length) return res.json({ deposits: [] });
    const ids = [...new Set(deposits.map((d: any) => d.user_id))];
    const idsParam = `(${ids.map((id: string) => `"${id}"`).join(",")})`;
    const pr = await sbAdmin(`profiles?id=in.${idsParam}&select=id,username,mander_id,is_flagged`);
    let profileMap: Record<string, any> = {};
    if (pr.ok) { const profiles: any[] = await pr.json(); for (const p of profiles) profileMap[p.id] = p; }
    const depositsData = { deposits: deposits.map((d: any) => ({ ...d, username: profileMap[d.user_id]?.username ?? d.user_id, mander_id: profileMap[d.user_id]?.mander_id ?? "", is_flagged: profileMap[d.user_id]?.is_flagged ?? false, amount_usd: parseFloat((d.amount * getPriceUsd(String(d.currency ?? "").trim().toUpperCase())).toFixed(4)) })) };
    _depositsCache.set(status, { data: depositsData, at: Date.now() });
    return res.json(depositsData);
  } catch (err: unknown) { return res.status(500).json({ error: String(err) }); }
});

// GET /api/admin/pending-deposits
router.get("/pending-deposits", async (_req: Request, res: Response) => {
  try {
    const r = await sbAdmin(
      "deposits?status=eq.pending&address=neq.pending&order=created_at.asc&select=id,user_id,amount,currency,network,address,created_at",
    );
    if (!r.ok) {
      const txt = await r.text();
      console.error("[ADMIN] error fetching deposits:", txt);
      return res.status(502).json({ error: "supabase error", detail: txt });
    }

    const deposits: {
      id: number;
      user_id: string;
      amount: number;
      currency: string;
      network: string;
      address: string;
      created_at: string;
    }[] = await r.json();

    if (!deposits.length) return res.json({ deposits: [] });

    const ids = [...new Set(deposits.map((d) => d.user_id))];
    const idsParam = `(${ids.map((id) => `"${id}"`).join(",")})`;
    let pr = await sbAdmin(
      `profiles?id=in.${idsParam}&select=id,username,mander_id,is_flagged`,
    );
    if (!pr.ok) pr = await sbAdmin(`profiles?id=in.${idsParam}&select=id,username,mander_id`);

    let profileMap: Record<string, { username: string; mander_id: string; is_flagged?: boolean }> = {};
    if (pr.ok) {
      const profiles: { id: string; username: string; mander_id: string; is_flagged?: boolean }[] =
        await pr.json();
      for (const p of profiles) profileMap[p.id] = p;
    }

    const result = deposits.map((d) => ({
      ...d,
      username: profileMap[d.user_id]?.username ?? d.user_id,
      mander_id: profileMap[d.user_id]?.mander_id ?? "",
      is_flagged: profileMap[d.user_id]?.is_flagged ?? false,
      amount_usd: parseFloat((d.amount * getPriceUsd(String(d.currency ?? "").trim().toUpperCase())).toFixed(4)),
    }));

    return res.json({ deposits: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ADMIN] exception:", msg);
    return res.status(500).json({ error: msg });
  }
});

// POST /api/admin/force-confirm-deposit
// Fuerza la confirmación manual de un depósito pendiente (para casos donde Plisio no actualiza el status)
router.post("/force-confirm-deposit", async (req: Request, res: Response) => {
  const { deposit_id, amount_usd } = req.body as { deposit_id: number; amount_usd?: number };
  if (!deposit_id) return res.status(400).json({ error: "deposit_id requerido" });

  try {
    // 1. Obtener el depósito
    const dr = await sbAdmin(`deposits?id=eq.${deposit_id}&status=eq.pending&limit=1`);
    if (!dr.ok) return res.status(502).json({ error: "supabase error" });
    const [deposit] = await dr.json();
    if (!deposit) return res.status(404).json({ error: "Depósito no encontrado o ya confirmado" });

    // 2. Obtener el perfil del usuario
    const pr = await sbAdmin(`profiles?id=eq.${encodeURIComponent(deposit.user_id)}&limit=1`);
    if (!pr.ok) return res.status(502).json({ error: "supabase error profiles" });
    const [profile] = await pr.json();
    if (!profile) return res.status(404).json({ error: "Perfil no encontrado" });

    const manderId = profile.mander_id;
    const currency = (deposit.currency ?? "USDT").trim().toUpperCase();
    const network  = deposit.network ?? "BEP20";
    const now = new Date().toISOString();

    // 3. Calcular USD si no se pasó
    let deltaUsd = amount_usd ?? 0;
    if (!deltaUsd && deposit.amount > 0) {
      // Intentar obtener precio del último precio cacheado
      const pricesR = await fetch("http://localhost:8080/api/prices").catch(() => null);
      const prices: any = pricesR ? await pricesR.json().catch(() => ({})) : {};
      const price = prices?.[currency] ?? prices?.USDT ?? 1;
      deltaUsd = deposit.amount * price;
    }
    if (deltaUsd <= 0) return res.status(400).json({ error: "No se puede determinar el valor USD. Pasa amount_usd en el body." });

    // 4. Marcar el depósito como confirmed
    const patchR = await sbAdmin(`deposits?id=eq.${deposit_id}&status=eq.pending`, {
      method: "PATCH",
      body: JSON.stringify({ status: "confirmed", amount: deposit.amount }),
      headers: { Prefer: "return=representation" },
    });
    const patched = patchR.ok ? await patchR.json().catch(() => []) : [];
    if (!patchR.ok || patched.length === 0) return res.status(409).json({ error: "No se pudo confirmar (ya fue procesado?)" });

    // 5. Actualizar balance en tabla `balances`
    const getBalR = await sbAdmin(`balances?mander_id=eq.${encodeURIComponent(manderId)}&currency=eq.${encodeURIComponent(currency)}&select=id,balance&limit=1`);
    const balRows: any[] = getBalR.ok ? await getBalR.json() : [];
    if (balRows[0]) {
      const newBal = Number(balRows[0].balance) + deposit.amount;
      await sbAdmin(`balances?id=eq.${balRows[0].id}`, { method: "PATCH", body: JSON.stringify({ balance: newBal, updated_at: now }) });
    } else {
      await sbAdmin("balances", { method: "POST", body: JSON.stringify({ mander_id: manderId, user_id: deposit.user_id, currency, balance: deposit.amount, locked_amount: 0, updated_at: now }) });
    }

    // 6. Actualizar balance USD en `profiles`
    const newProfileBal = Math.max(0, Number(profile.balance ?? 0) + deltaUsd);
    await sbAdmin(`profiles?mander_id=eq.${encodeURIComponent(manderId)}`, { method: "PATCH", body: JSON.stringify({ balance: newProfileBal }) });

    // 7. Registrar transacción — amount en USD (el frontend lo muestra como $)
    const addrNote = deposit.address && deposit.address !== "pending" && deposit.address.length > 5
      ? ` ADDR:${deposit.address}` : "";
    await sbAdmin("transactions", {
      method: "POST",
      body: JSON.stringify({
        user_id: deposit.user_id, mander_id: manderId, type: "deposit",
        display_id: nextDepositDisplayId(),
        amount: parseFloat(deltaUsd.toFixed(2)), currency, network, status: "completed",
        external_tx_id: deposit.tx_hash,
        notes: `manual_confirm admin dep=${deposit_id} crypto=${deposit.amount} ${currency}${addrNote}`,
        completed_at: now,
      }),
    });

    console.log(`[ADMIN] force-confirm dep=${deposit_id} user=${profile.username} crypto=${deposit.amount} ${currency} usd=${deltaUsd.toFixed(2)}`);
    return res.json({ ok: true, deposit_id, username: profile.username, credited_crypto: deposit.amount, credited_usd: deltaUsd });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ADMIN] force-confirm error:", msg);
    return res.status(500).json({ error: msg });
  }
});

// GET /api/admin/users
// Returns all users with their balances per currency
// Cached for 60 s to avoid hammering Supabase on every admin panel load
let _usersCache: { data: unknown; at: number } | null = null;
const USERS_CACHE_TTL = 60_000;

/** Call this after any mutation that changes user profile state (block, flag, etc.) */
export function invalidateUsersCache() {
  _usersCache = null;
}

router.get("/users", async (_req: Request, res: Response) => {
  if (_usersCache && Date.now() - _usersCache.at < USERS_CACHE_TTL) {
    return res.json(_usersCache.data);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    return res.status(503).json({ error: "Servicio no disponible." });

  try {
    let pr = await sbAdmin(
      "profiles?select=id,mander_id,username,email,created_at,is_blocked,is_flagged&order=created_at.desc",
      { headers: { Prefer: "count=none" } },
    );
    // Fallback if is_flagged column not yet added
    if (!pr.ok) {
      pr = await sbAdmin(
        "profiles?select=id,mander_id,username,email,created_at,is_blocked&order=created_at.desc",
        { headers: { Prefer: "count=none" } },
      );
    }
    if (!pr.ok) {
      const txt = await pr.text();
      return res.status(502).json({ error: "Error fetching profiles", detail: txt });
    }

    const profiles: {
      id: string;
      mander_id: string;
      username: string;
      email?: string;
      created_at: string;
      is_blocked?: boolean;
      is_flagged?: boolean;
    }[] = await pr.json();

    if (!profiles.length) return res.json({ users: [] });

    const manderIdSet = new Set(profiles.map((p) => p.mander_id).filter(Boolean));
    const usernameSet = new Set(profiles.map((p) => p.username).filter(Boolean));

    // ── Run all independent queries in parallel ───────────────────────────────
    // Fetch ALL balances (no giant IN clause in URL — filter in memory instead)
    const [balRows, refRows, authUsersRes] = await Promise.all([
      fetchAllRows(`balances?select=mander_id,currency,balance&order=mander_id.asc`).catch(() => [] as any[]),
      fetchAllRows(`affiliate_referrals?select=referred_username,referrer_username&order=id.asc`).catch(() => [] as any[]),
      getCachedAuthUsers().catch(() => [] as any[]),
    ]);

    // ── Balances ──────────────────────────────────────────────────────────────
    const balanceMap: Record<string, { currency: string; balance: number }[]> = {};
    for (const b of (balRows as { mander_id: string; currency: string; balance: number }[])) {
      if (!manderIdSet.has(b.mander_id)) continue;
      if (!balanceMap[b.mander_id]) balanceMap[b.mander_id] = [];
      balanceMap[b.mander_id].push({ currency: b.currency, balance: Number(b.balance) });
    }

    // ── Referrals + affiliate links (links need referrers set first) ──────────
    const referralMap: Record<string, string> = {};
    const refCodeMap:  Record<string, string> = {};
    try {
      const allRefRows: { referred_username: string; referrer_username: string }[] =
        Array.isArray(refRows) ? refRows : [];
      const referrers = new Set<string>();
      for (const row of allRefRows) {
        if (!usernameSet.has(row.referred_username)) continue; // filter in memory
        referralMap[row.referred_username] = row.referrer_username;
        referrers.add(row.referrer_username);
      }
      if (referrers.size > 0) {
        const referrersParam = `(${[...referrers].map((u) => `"${encodeURIComponent(u)}"`).join(",")})`;
        const lr = await sbAdmin(`affiliate_links?username=in.${referrersParam}&select=username,ref_code`, { headers: { Prefer: "count=none" } });
        if (lr.ok) {
          const linkRows: { username: string; ref_code: string }[] = await lr.json();
          for (const row of linkRows) refCodeMap[row.username] = row.ref_code;
        }
      }
    } catch (_) { /* referral lookup is non-critical */ }

    // ── Auth metadata (demo balances) ─────────────────────────────────────────
    // authUsersRes is now the array directly (from shared 5-min cache)
    const balanceDemoMap: Record<string, number> = {};
    try {
      const authUsers: { id: string; app_metadata?: { balance_demo?: number; balance_demo_local?: number } }[] =
        Array.isArray(authUsersRes) ? authUsersRes : [];
      for (const u of authUsers) {
        const demo = u.app_metadata?.balance_demo_local ?? u.app_metadata?.balance_demo;
        if (demo && demo > 0) balanceDemoMap[u.id] = demo;
      }
    } catch (_) { /* non-critical */ }

    const users = profiles.map((p) => {
      const referrer = referralMap[p.username] ?? null;
      return {
        id: p.id,
        mander_id: p.mander_id,
        username: p.username,
        email: p.email ?? "",
        created_at: p.created_at,
        is_blocked: p.is_blocked ?? false,
        is_flagged: p.is_flagged ?? false,
        balances: (balanceMap[p.mander_id] ?? []).filter((b) => b.balance > 0),
        balance_demo: balanceDemoMap[p.id] ?? 0,
        referred_by: referrer,
        ref_code_used: referrer ? (refCodeMap[referrer] ?? null) : null,
      };
    });

    const payload = { users };
    _usersCache = { data: payload, at: Date.now() };
    console.log(`[ADMIN users] ${users.length} usuarios`);
    return res.json(payload);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ADMIN users] exception:", msg);
    return res.status(500).json({ error: msg });
  }
});

// GET /api/admin/user/:userId/stats
const _userStatsCache = new Map<string, { data: unknown; at: number }>();
const USER_STATS_CACHE_TTL = 60_000;

router.get("/user/:userId/stats", async (req: Request, res: Response) => {
  const { userId } = req.params;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    return res.status(503).json({ error: "Servicio no disponible." });

  const usc = _userStatsCache.get(userId);
  if (usc && Date.now() - usc.at < USER_STATS_CACHE_TTL) return res.json(usc.data);

  try {
    // Profile
    const profR = await sbAdmin(
      `profiles?id=eq.${encodeURIComponent(userId)}&select=id,mander_id,username,created_at,is_blocked&limit=1`,
    );
    if (!profR.ok) return res.status(502).json({ error: "Error fetching profile." });
    const profRows: any[] = await profR.json();
    const profile = profRows[0];
    if (!profile) return res.status(404).json({ error: "Usuario no encontrado." });

    const mid = encodeURIComponent(profile.mander_id);
    const uid = encodeURIComponent(userId);

    // All queries in parallel — bet rows come from shared 5-min cache (avoids 1000-row cap)
    const [txR, wR, depR, balR, allBets] = await Promise.all([
      sbAdmin(`transactions?mander_id=eq.${mid}&type=neq.bet&select=type,amount,currency,status,created_at&order=created_at.desc&limit=5000`, { headers: { Prefer: "count=none" } }),
      sbAdmin(`withdrawals?user_id=eq.${uid}&select=amount,currency,status,created_at&order=created_at.desc`, { headers: { Prefer: "count=none" } }),
      sbAdmin(`deposits?user_id=eq.${uid}&select=amount,currency,status,created_at&order=created_at.desc`, { headers: { Prefer: "count=none" } }),
      sbAdmin(`balances?mander_id=eq.${mid}&select=currency,balance,locked_amount`, { headers: { Prefer: "count=none" } }),
      getCachedBetRows(),
    ]);

    const txs:     any[] = txR.ok  ? await txR.json()  : [];
    const wds:     any[] = wR.ok   ? await wR.json()   : [];
    const deps:    any[] = depR.ok ? await depR.json()  : [];
    const balRows: any[] = balR.ok ? await balR.json()  : [];
    const usernameLower = profile.username.toLowerCase();
    const betRows: any[] = allBets.filter((b: any) =>
      (b.username ?? "").toLowerCase() === usernameLower
    );

    // Transactions breakdown
    const bonuses = txs.filter(t => t.type === "bonus");

    // Aggregate bets in JS
    let totalWagered = 0;
    let betCount = betRows.length;
    for (const b of betRows) {
      totalWagered += parseFloat(b.bet_usd || 0);
    }
    const totalBonus   = bonuses.reduce((s: number, t: any) => s + Math.abs(Number(t.amount)) * getPriceUsd(String(t.currency || "USDT").trim().toUpperCase()), 0);
    const bonusCount   = bonuses.length;

    // Withdrawals (converted to USD)
    const paidWds        = wds.filter(w => w.status === "paid");
    const pendingWds     = wds.filter(w => w.status === "pending" || w.status === "approved");
    const totalWithdrawn = paidWds.reduce((s: number, w: any) => s + Math.abs(Number(w.amount)) * getPriceUsd(String(w.currency || "USDT").trim().toUpperCase()), 0);

    // Deposits (confirmed, converted to USD)
    const confirmedDeps  = deps.filter(d => d.status === "confirmed" || d.status === "completed");
    const totalDeposited = confirmedDeps.reduce((s: number, d: any) => s + Math.abs(Number(d.amount)) * getPriceUsd(String(d.currency || "USDT").trim().toUpperCase()), 0);

    // Balances
    const balances = balRows
      .filter(b => Number(b.balance) > 0 || Number(b.locked_amount) > 0)
      .map(b => ({ currency: b.currency, balance: Number(b.balance), locked: Number(b.locked_amount) }));

    // First & last activity
    const allDates = txs.map(t => t.created_at).filter(Boolean).sort();
    const firstActivity = allDates[0] ?? null;
    const lastActivity  = allDates[allDates.length - 1] ?? null;

    const responseObj = {
      ok: true,
      profile: {
        id: profile.id,
        mander_id: profile.mander_id,
        username: profile.username,
        created_at: profile.created_at,
        is_blocked: profile.is_blocked ?? false,
      },
      stats: {
        totalWagered:   Math.round(totalWagered   * 100) / 100,
        betCount,
        totalDeposited: Math.round(totalDeposited * 100) / 100,
        depositCount:   confirmedDeps.length,
        totalWithdrawn: Math.round(totalWithdrawn * 100) / 100,
        withdrawalCount: paidWds.length,
        pendingWithdrawals: pendingWds.length,
        totalBonus:   Math.round(totalBonus * 100) / 100,
        bonusCount,
        txTotal: txs.length,
        firstActivity,
        lastActivity,
      },
      balances,
    };
    _userStatsCache.set(userId, { data: responseObj, at: Date.now() });
    return res.json(responseObj);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ADMIN user stats] exception:", msg);
    return res.status(500).json({ error: msg });
  }
});

// ── Auth middleware (admin only) ──────────────────────────────────────────────
// Token-keyed auth cache: avoids 2 Supabase round-trips per poll interval
const _adminAuthCache = new Map<string, { userId: string; username: string; at: number }>();
const ADMIN_AUTH_CACHE_TTL = 60_000;

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ error: "Sesión inválida." });
  const token = authHeader.slice(7);

  // Serve from auth cache if fresh (avoids Supabase calls on every poll)
  const cached = _adminAuthCache.get(token);
  if (cached && Date.now() - cached.at < ADMIN_AUTH_CACHE_TTL) {
    (req as any).adminUserId = cached.userId;
    (req as any).adminUsername = cached.username;
    return next();
  }

  let userId: string | null = null;
  try { const g = verifyGameToken(token) as any; if (g) userId = g.profileId; } catch {}

  if (!userId) {
    try {
      const r = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      });
      if (r.ok) userId = (await r.json()).id;
    } catch {}
  }

  if (!userId) return res.status(401).json({ error: "Sesión inválida." });

  let pr = await sbAdmin(`profiles?id=eq.${encodeURIComponent(userId)}&select=username&limit=1`);
  if (!pr.ok) return res.status(403).json({ error: "Perfil no encontrado." });
  const rows: any[] = await pr.json();
  if (!rows[0]) return res.status(403).json({ error: "Perfil no encontrado." });
  if (!ADMIN_USERNAMES().includes(rows[0].username.toLowerCase()))
    return res.status(403).json({ error: "Acceso denegado." });

  _adminAuthCache.set(token, { userId, username: rows[0].username, at: Date.now() });
  (req as any).adminUserId = userId;
  (req as any).adminUsername = rows[0].username;
  next();
}

// ── GET /api/admin/transactions-search ───────────────────────────────────────
// Query params: username, type, status, from, to, limit (default 50), offset (default 0)
router.get("/transactions-search", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { username, type, status, from, to } = req.query as Record<string, string>;
    const limit  = Math.min(parseInt((req.query.limit  as string) || "40", 10), 200);
    const offset = Math.max(parseInt((req.query.offset as string) || "0",  10), 0);

    // If username filter — resolve mander_id first
    let manderFilter = "";
    let resolvedUsername = "";
    if (username?.trim()) {
      const uname = username.trim().toLowerCase();
      const pr = await sbAdmin(
        `profiles?username=ilike.${encodeURIComponent(uname)}&select=mander_id,username&limit=1`,
        { headers: { Prefer: "count=none" } },
      );
      if (pr.ok) {
        const rows: any[] = await pr.json();
        if (rows[0]) {
          manderFilter    = `&mander_id=eq.${encodeURIComponent(rows[0].mander_id)}`;
          resolvedUsername = rows[0].username;
        } else {
          return res.json({ transactions: [], total: 0, limit, offset });
        }
      }
    }

    // Build filter string — bets are never shown in the admin transactions view
    let filters = manderFilter;
    if (type && type !== "all") {
      filters += `&type=eq.${encodeURIComponent(type)}`;
    } else {
      filters += `&type=neq.bet`;
    }
    if (status && status !== "all") filters += `&status=eq.${encodeURIComponent(status)}`;
    if (from)  filters += `&created_at=gte.${encodeURIComponent(from)}`;
    if (to) {
      // to = end of that day
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      filters += `&created_at=lte.${encodeURIComponent(toDate.toISOString())}`;
    }

    const txRes = await sbAdmin(
      `transactions?select=id,display_id,mander_id,type,status,amount,currency,created_at,notes,external_tx_id${filters}&order=created_at.desc&limit=${limit}&offset=${offset}`,
      { headers: { Prefer: "count=exact" } },
    );
    if (!txRes.ok) {
      const txt = await txRes.text();
      return res.status(502).json({ error: "Error al buscar transacciones.", detail: txt });
    }

    // Parse total from Content-Range header e.g. "0-49/1234"
    const contentRange = txRes.headers.get("content-range") ?? "";
    const total = parseInt(contentRange.split("/")[1] ?? "0", 10) || 0;

    const txs: any[] = await txRes.json();

    // If no username filter, look up usernames for all mander_ids in result
    let usernameMap: Record<string, string> = {};
    if (resolvedUsername) {
      const mid = txs[0]?.mander_id;
      if (mid) usernameMap[mid] = resolvedUsername;
    } else if (txs.length > 0) {
      const mids = [...new Set(txs.map((t: any) => t.mander_id).filter(Boolean))];
      const idsParam = `(${mids.map(id => `"${id}"`).join(",")})`;
      const pr = await sbAdmin(
        `profiles?mander_id=in.${idsParam}&select=mander_id,username`,
        { headers: { Prefer: "count=none" } },
      );
      if (pr.ok) {
        const rows: any[] = await pr.json();
        for (const r of rows) usernameMap[r.mander_id] = r.username;
      }
    }

    const result = txs.map((t: any) => ({
      id:           t.id,
      display_id:   t.display_id ?? null,
      mander_id:    t.mander_id,
      username:     usernameMap[t.mander_id] ?? t.mander_id,
      type:         t.type,
      status:       t.status,
      amount:       t.amount,
      currency:     t.currency,
      created_at:   t.created_at,
      notes:        t.notes ?? null,
      wallet:       t.external_tx_id ?? null,
    }));

    return res.json({ transactions: result, total, limit, offset });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ADMIN tx-search] exception:", msg);
    return res.status(500).json({ error: msg });
  }
});

// ── GET /api/admin/users/search?q=texto — búsqueda de usuarios para autocomplete ──
router.get("/users/search", requireAdmin, async (req: Request, res: Response) => {
  const q = (req.query.q as string || "").trim();
  if (q.length < 2) return res.json([]);
  try {
    const encoded = encodeURIComponent(`*${q}*`);
    const [profR, linksR] = await Promise.all([
      sbAdmin(
        `profiles?username=ilike.${encoded}&select=id,mander_id,username,created_at&order=username.asc&limit=15`
      ),
      sbAdmin(
        `affiliate_links?select=username&limit=500`
      ),
    ]);
    if (!profR.ok) return res.json([]);
    const profiles = await profR.json();
    const linksRaw = linksR.ok ? await linksR.json() : [];
    const existingCodes = new Set((Array.isArray(linksRaw) ? linksRaw : []).map((l: any) => l.username));

    // Depósitos completados por mander_id para mostrar count
    const mids = (Array.isArray(profiles) ? profiles : []).map((p: any) => encodeURIComponent(p.mander_id)).filter(Boolean);
    let depMap: Record<string, number> = {};
    if (mids.length) {
      const depR = await sbAdmin(
        `transactions?mander_id=in.(${mids.join(",")})&type=eq.deposit&status=eq.completed&select=mander_id&limit=10000`
      );
      if (depR.ok) {
        const deps = await depR.json();
        for (const d of (Array.isArray(deps) ? deps : [])) {
          depMap[d.mander_id] = (depMap[d.mander_id] || 0) + 1;
        }
      }
    }

    const result = (Array.isArray(profiles) ? profiles : []).map((p: any) => ({
      username:          p.username,
      mander_id:         p.mander_id,
      created_at:        p.created_at,
      deposit_count:     depMap[p.mander_id] || 0,
      has_affiliate_code: existingCodes.has(p.username),
    }));

    return res.json(result);
  } catch (err: any) {
    console.error("[admin/users/search] error:", err.message);
    return res.json([]);
  }
});

// ── Support chats cache (short TTL + singleflight to absorb polling bursts) ──
let _supportChatsCache: { data: unknown; at: number } | null = null;
const SUPPORT_CHATS_TTL = 6_000;
let _supportChatsFlight: Promise<unknown> | null = null;

const _supportMsgsCache = new Map<string, { data: unknown; at: number }>();
const SUPPORT_MSGS_TTL = 6_000;
const _supportMsgsFlight = new Map<string, Promise<unknown>>();

function invalidateSupportChatsCache() { _supportChatsCache = null; }
function invalidateSupportMsgsCache(chatId: string) { _supportMsgsCache.delete(chatId); }

async function fetchSupportChats(): Promise<unknown> {
  const chatsRes = await sbAdmin(
    `support_chats?order=updated_at.desc&limit=100`,
    { headers: { Prefer: "count=none" } },
  );
  if (!chatsRes.ok) throw new Error(`Supabase error ${chatsRes.status}`);
  const chats: any[] = await chatsRes.json();
  if (!chats.length) return [];

  const chatIds = chats.map(c => `"${c.id}"`).join(",");
  const msgsRes = await sbAdmin(
    `support_messages?chat_id=in.(${chatIds})&order=created_at.desc&limit=1000`,
    { headers: { Prefer: "count=none" } },
  );
  const msgs: any[] = msgsRes.ok ? await msgsRes.json() : [];

  const unreadMap: Record<string, number> = {};
  const lastMsgMap: Record<string, any> = {};
  for (const m of msgs) {
    if (!lastMsgMap[m.chat_id]) lastMsgMap[m.chat_id] = m;
    if (m.sender === "user" && !m.is_read) {
      unreadMap[m.chat_id] = (unreadMap[m.chat_id] || 0) + 1;
    }
  }
  return chats.map(c => ({
    chat_id:      c.id,
    username:     c.username,
    status:       c.status ?? "open",
    last_message: lastMsgMap[c.id]?.message?.slice(0, 100) ?? "",
    last_sender:  lastMsgMap[c.id]?.sender ?? "",
    updated_at:   c.updated_at,
    unread_count: unreadMap[c.id] ?? 0,
  }));
}

// ── GET /api/admin/support/chats ─────────────────────────────────────────────
router.get("/support/chats", requireAdmin, async (_req: Request, res: Response) => {
  if (_supportChatsCache && Date.now() - _supportChatsCache.at < SUPPORT_CHATS_TTL) {
    return res.json(_supportChatsCache.data);
  }
  try {
    if (!_supportChatsFlight) {
      _supportChatsFlight = fetchSupportChats().finally(() => { _supportChatsFlight = null; });
    }
    const result = await _supportChatsFlight;
    _supportChatsCache = { data: result, at: Date.now() };
    return res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── GET /api/admin/support/chats/:chatId ─────────────────────────────────────
router.get("/support/chats/:chatId", requireAdmin, async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const cached = _supportMsgsCache.get(chatId);
  if (cached && Date.now() - cached.at < SUPPORT_MSGS_TTL) {
    return res.json(cached.data);
  }
  try {
    let flight = _supportMsgsFlight.get(chatId);
    if (!flight) {
      flight = sbAdmin(
        `support_messages?chat_id=eq.${encodeURIComponent(chatId)}&order=created_at.asc&limit=500`,
        { headers: { Prefer: "count=none" } },
      ).then(async r => {
        if (!r.ok) { const t = await r.text(); throw new Error(`Supabase error ${r.status}: ${t}`); }
        return r.json();
      }).finally(() => { _supportMsgsFlight.delete(chatId); });
      _supportMsgsFlight.set(chatId, flight);
    }
    const data = await flight;
    _supportMsgsCache.set(chatId, { data, at: Date.now() });
    return res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── POST /api/admin/support/chats/:chatId ────────────────────────────────────
router.post("/support/chats/:chatId", requireAdmin, async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { message, managerName } = req.body as { message?: string; managerName?: string };
  if (!message?.trim()) return res.status(400).json({ error: "message required" });
  const opName = managerName?.trim() || (req as any).adminUsername || "Support";

  try {
    const chatRes = await sbAdmin(
      `support_chats?id=eq.${encodeURIComponent(chatId)}&select=username&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    if (!chatRes.ok) return res.status(502).json({ error: "Chat not found." });
    const chatRows: any[] = await chatRes.json();
    if (!chatRows[0]) return res.status(404).json({ error: "Chat not found." });

    const saveRes = await sbAdmin("support_messages", {
      method: "POST",
      body: JSON.stringify({
        chat_id: chatId,
        username: chatRows[0].username,
        sender: "admin",
        message: `${message.trim()}\n---MANDER_OP:${opName}---`,
        is_read: true,
      }),
    });
    if (!saveRes.ok) {
      const txt = await saveRes.text();
      return res.status(502).json({ error: "Error saving message.", detail: txt });
    }

    await sbAdmin(`support_chats?id=eq.${encodeURIComponent(chatId)}`, {
      method: "PATCH",
      body: JSON.stringify({ updated_at: new Date().toISOString() }),
      headers: { Prefer: "return=minimal" },
    });

    invalidateSupportChatsCache();
    invalidateSupportMsgsCache(chatId);
    const saved: any[] = await saveRes.json();
    return res.json({ ok: true, message: saved[0] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── POST /api/admin/support/chats/:chatId/join ───────────────────────────────
router.post("/support/chats/:chatId/join", requireAdmin, async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { managerName } = req.body as { managerName?: string };
  const joinName = managerName?.trim() || (req as any).adminUsername || "Support";
  try {
    const chatRes = await sbAdmin(
      `support_chats?id=eq.${encodeURIComponent(chatId)}&select=username&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    if (!chatRes.ok) return res.status(502).json({ error: "Chat not found." });
    const chatRows: any[] = await chatRes.json();
    if (!chatRows[0]) return res.status(404).json({ error: "Chat not found." });

    const msgInsert = await sbAdmin("support_messages", {
      method: "POST",
      body: JSON.stringify({
        chat_id: chatId,
        username: chatRows[0].username,
        sender: "admin",
        message: `🔵 ${joinName} joined the conversation`,
        is_read: true,
      }),
    });
    if (!msgInsert.ok) {
      const errText = await msgInsert.text();
      console.error("[join] failed to insert system message:", errText);
    }
    // When admin joins, reset "escalated" status back to "open" so the ticket
    // is no longer flagged as needing a human (a human has now joined)
    await sbAdmin(`support_chats?id=eq.${encodeURIComponent(chatId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "open", updated_at: new Date().toISOString() }),
      headers: { Prefer: "return=minimal" },
    });
    invalidateSupportChatsCache();
    invalidateSupportMsgsCache(chatId);
    return res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── PATCH /api/admin/support/chats/:chatId/close ─────────────────────────────
router.patch("/support/chats/:chatId/close", requireAdmin, async (req: Request, res: Response) => {
  const { chatId } = req.params;
  try {
    const chatRes = await sbAdmin(
      `support_chats?id=eq.${encodeURIComponent(chatId)}&select=username&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    const chatRows: any[] = chatRes.ok ? await chatRes.json() : [];
    const username = chatRows[0]?.username ?? "user";

    await sbAdmin("support_messages", {
      method: "POST",
      body: JSON.stringify({
        chat_id: chatId,
        username,
        sender: "admin",
        message: "🔒 The operator has closed the chat",
        is_read: true,
      }),
    });

    await sbAdmin(`support_chats?id=eq.${encodeURIComponent(chatId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "closed", updated_at: new Date().toISOString() }),
      headers: { Prefer: "return=minimal" },
    });
    invalidateSupportChatsCache();
    invalidateSupportMsgsCache(chatId);
    return res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── PATCH /api/admin/support/chats/:chatId/read ──────────────────────────────
router.patch("/support/chats/:chatId/read", requireAdmin, async (req: Request, res: Response) => {
  const { chatId } = req.params;
  try {
    await sbAdmin(
      `support_messages?chat_id=eq.${encodeURIComponent(chatId)}&sender=eq.user&is_read=eq.false`,
      { method: "PATCH", body: JSON.stringify({ is_read: true }), headers: { Prefer: "return=minimal" } },
    );
    invalidateSupportChatsCache();
    invalidateSupportMsgsCache(chatId);
    return res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── GET /api/admin/bets ───────────────────────────────────────────────────────
// Query: username, game, from, to, min_bet, max_bet, is_demo, limit, offset
const _betsCache = new Map<string, { data: unknown; at: number }>();
const BETS_CACHE_TTL = 60_000;

router.get("/bets", requireAdmin, async (req: Request, res: Response) => {
  const cacheKey = JSON.stringify(req.query);
  const bc = _betsCache.get(cacheKey);
  if (bc && Date.now() - bc.at < BETS_CACHE_TTL) return res.json(bc.data);
  try {
    const { username, game, from, to, min_bet, max_bet } = req.query as Record<string, string>;
    const is_demo = (req.query.is_demo as string) ?? "false";
    const limit  = Math.min(parseInt((req.query.limit  as string) || "50", 10), 200);
    const offset = Math.max(parseInt((req.query.offset as string) || "0",  10), 0);

    const demoCol = await isDemoColAvailable();

    let filters = "";
    if (username?.trim()) filters += `&username=ilike.${encodeURIComponent("*" + username.trim() + "*")}`;
    if (game?.trim())     filters += `&game=eq.${encodeURIComponent(game.trim())}`;
    if (from?.trim())     filters += `&created_at=gte.${encodeURIComponent(from.trim())}`;
    if (to?.trim()) {
      const toDate = new Date(to.trim());
      toDate.setHours(23, 59, 59, 999);
      filters += `&created_at=lte.${encodeURIComponent(toDate.toISOString())}`;
    }
    if (min_bet?.trim()) filters += `&bet_usd=gte.${encodeURIComponent(min_bet.trim())}`;
    if (max_bet?.trim()) filters += `&bet_usd=lte.${encodeURIComponent(max_bet.trim())}`;
    if (demoCol) {
      // NULL rows (old bets before migration) are treated as real (false)
      if (is_demo === "true")  filters += `&is_demo=eq.true`;
      if (is_demo === "false") filters += `&or=(is_demo.eq.false,is_demo.is.null)`;
    }

    const selectFields = `id,username,game,currency,bet_usd,payout_usd,bonus_usd${demoCol ? ",is_demo" : ""},created_at`;

    const r = await sbAdmin(
      `game_bets?select=${selectFields}${filters}&order=created_at.desc&limit=${limit}&offset=${offset}`,
      { headers: { Prefer: "count=exact" } },
    );
    if (!r.ok) {
      const txt = await r.text();
      return res.status(502).json({ error: "Error al buscar apuestas.", detail: txt });
    }

    const contentRange = r.headers.get("content-range") ?? "";
    const total = parseInt(contentRange.split("/")[1] ?? "0", 10) || 0;

    const rows: any[] = await r.json();
    if (is_demo === "false" && rows.length > 0) {
      const sample = rows.slice(0, 3).map((b: any) => `${b.username}/${b.game}/is_demo=${b.is_demo}`).join(", ");
      console.log(`[admin/bets] Apuestas Reales total=${total} sample: ${sample}`);
    }
    const bets = rows.map(b => {
      const bet    = Number(b.bet_usd);
      const payout = Number(b.payout_usd);
      const bonus  = Number(b.bonus_usd ?? 0);
      return {
        id:         b.id,
        username:   b.username,
        game:       b.game,
        currency:   b.currency,
        bet_usd:    bet,
        payout_usd: payout,
        bonus_usd:  bonus,
        profit_usd: bet - payout - bonus,
        multiplier: bet > 0 ? parseFloat((payout / bet).toFixed(2)) : 0,
        is_demo:    demoCol ? (b.is_demo ?? false) : false,
        created_at: b.created_at,
      };
    });

    const betsData = { bets, total, limit, offset, is_demo_supported: demoCol };
    _betsCache.set(cacheKey, { data: betsData, at: Date.now() });
    return res.json(betsData);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ADMIN bets] exception:", msg);
    return res.status(500).json({ error: msg });
  }
});

// ── GET /api/admin/bets/summary ───────────────────────────────────────────────
const _betsSummaryCache = new Map<string, { data: unknown; at: number }>();
const BETS_SUMMARY_CACHE_TTL = 60_000;

router.get("/bets/summary", requireAdmin, async (req: Request, res: Response) => {
  const cacheKey = JSON.stringify(req.query);
  const bsc = _betsSummaryCache.get(cacheKey);
  if (bsc && Date.now() - bsc.at < BETS_SUMMARY_CACHE_TTL) return res.json(bsc.data);
  try {
    const { username, game, from, to, min_bet, max_bet } = req.query as Record<string, string>;
    const is_demo = (req.query.is_demo as string) ?? "false";

    const demoCol = await isDemoColAvailable();

    let filters = "";
    if (username?.trim()) filters += `&username=ilike.${encodeURIComponent("*" + username.trim() + "*")}`;
    if (game?.trim())     filters += `&game=eq.${encodeURIComponent(game.trim())}`;
    if (from?.trim())     filters += `&created_at=gte.${encodeURIComponent(from.trim())}`;
    if (to?.trim()) {
      const toDate = new Date(to.trim());
      toDate.setHours(23, 59, 59, 999);
      filters += `&created_at=lte.${encodeURIComponent(toDate.toISOString())}`;
    }
    if (min_bet?.trim()) filters += `&bet_usd=gte.${encodeURIComponent(min_bet.trim())}`;
    if (max_bet?.trim()) filters += `&bet_usd=lte.${encodeURIComponent(max_bet.trim())}`;
    if (demoCol) {
      if (is_demo === "true")  filters += `&is_demo=eq.true`;
      if (is_demo === "false") filters += `&or=(is_demo.eq.false,is_demo.is.null)`;
    }

    // Paginate through all matching bets (PostgREST caps at 1000 rows per request)
    let total_bet = 0, total_payout = 0, total_bonus = 0, count = 0;
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      const r = await sbAdmin(
        `game_bets?select=bet_usd,payout_usd,bonus_usd${filters}&limit=${PAGE}&offset=${offset}`,
        { headers: { Prefer: "count=none" } },
      );
      if (!r.ok) {
        const txt = await r.text();
        return res.status(502).json({ error: "Error al obtener resumen.", detail: txt });
      }
      const rows: any[] = await r.json();
      for (const b of rows) {
        total_bet    += Number(b.bet_usd);
        total_payout += Number(b.payout_usd);
        total_bonus  += Number(b.bonus_usd ?? 0);
      }
      count += rows.length;
      if (rows.length < PAGE) break;
      offset += PAGE;
    }
    const total_profit = total_bet - total_payout - total_bonus;

    const summaryData = {
      total_bet:    Math.round(total_bet    * 100) / 100,
      total_payout: Math.round(total_payout * 100) / 100,
      total_bonus:  Math.round(total_bonus  * 100) / 100,
      total_profit: Math.round(total_profit * 100) / 100,
      count,
    };
    _betsSummaryCache.set(cacheKey, { data: summaryData, at: Date.now() });
    return res.json(summaryData);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ADMIN bets/summary] exception:", msg);
    return res.status(500).json({ error: msg });
  }
});

// ── POST /api/admin/ai/translate ──────────────────────────────────────────────
// Translates a player message to English
router.post("/ai/translate", requireAdmin, async (req: Request, res: Response) => {
  const { message } = req.body as { message?: string };
  if (!message?.trim()) return res.status(400).json({ error: "message required" });

  try {
    const { client: openai, model } = buildOpenAI();

    const completion = await openai.chat.completions.create({
      model,
      max_completion_tokens: 512,
      messages: [
        {
          role: "system",
          content:
            "You are a translator for a casino support system. Follow these rules strictly:\n" +
            "- If the text is in Spanish → translate it to English, then reply: EN:<translation>\n" +
            "- If the text is in English → translate it to Spanish, then reply: ES:<translation>\n" +
            "- If the text is in any other language → translate it to Spanish, then reply: ES:<translation>\n" +
            "- If the text is already in both languages or is untranslatable (e.g. a single emoji, a number, a URL), reply: SKIP\n" +
            "Return ONLY the formatted reply, nothing else. No explanations, no quotes.",
        },
        { role: "user", content: message.trim() },
      ],
    });

    const result = completion.choices[0]?.message?.content?.trim() ?? "";
    if (result === "SKIP" || !result) return res.json({ translation: null, lang: null });
    const enMatch = result.match(/^EN:(.+)$/s);
    const esMatch = result.match(/^ES:(.+)$/s);
    if (enMatch) return res.json({ translation: enMatch[1].trim(), lang: "en" });
    if (esMatch) return res.json({ translation: esMatch[1].trim(), lang: "es" });
    return res.json({ translation: null, lang: null });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── POST /api/admin/ai/polish ─────────────────────────────────────────────────
// Rewrites a draft support reply to sound formal and professional
router.post("/ai/polish", requireAdmin, async (req: Request, res: Response) => {
  const { message } = req.body as { message?: string };
  if (!message?.trim()) return res.status(400).json({ error: "message required" });

  try {
    const { client: openai, model } = buildOpenAI();

    const completion = await openai.chat.completions.create({
      model,
      max_completion_tokens: 512,
      messages: [
        {
          role: "system",
          content:
            "You are a professional customer support manager at Manderbet Casino. " +
            "Rewrite the given draft message to sound formal, friendly, and professional, as an experienced manager would write to a customer. " +
            "ALWAYS respond in English, regardless of the language of the input. If the input is in Spanish or any other language, translate it to English as part of the rewrite. " +
            "Do NOT add greetings like 'Dear customer' unless they were already present. " +
            "Keep it concise and natural. Return ONLY the improved English message text, nothing else.",
        },
        { role: "user", content: message.trim() },
      ],
    });

    const polished = completion.choices[0]?.message?.content?.trim() ?? message;

    // Also translate the polished English text back to Spanish for the admin's reference
    const trCompletion = await openai.chat.completions.create({
      model,
      max_completion_tokens: 512,
      messages: [
        { role: "system", content: "Translate the following English text to Spanish. Return ONLY the translated text, nothing else." },
        { role: "user", content: polished },
      ],
    });
    const translation = trCompletion.choices[0]?.message?.content?.trim() ?? null;

    return res.json({ polished, translation });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── POST /api/admin/credit-balance ───────────────────────────────────────────
// Acredita balance manual a un usuario (emergencias, depósitos perdidos, etc.)
// Body: { username, currency, amount_usd, note? }
router.post("/credit-balance", requireAdmin, async (req: Request, res: Response) => {
  const { username, currency, amount_usd, note } = req.body ?? {};
  if (!username || !currency || !amount_usd) {
    return res.status(400).json({ error: "Faltan campos: username, currency, amount_usd." });
  }
  const parsedAmount = Number(amount_usd);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "amount_usd debe ser un número positivo." });
  }
  const cur = String(currency).trim().toUpperCase();

  try {
    // 1. Buscar el perfil — primero exact ilike, luego wildcard, luego por Auth email
    let profile: any = null;

    const profRes = await sbAdmin(
      `profiles?username=ilike.${encodeURIComponent(username)}&select=id,mander_id,username&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    if (profRes.ok) {
      const profRows: any[] = await profRes.json();
      profile = profRows?.[0] ?? null;
    }

    // Fallback: wildcard match (handles partial username or whitespace differences)
    if (!profile) {
      const wild = encodeURIComponent(`*${username.trim()}*`);
      const wildRes = await sbAdmin(
        `profiles?username=ilike.${wild}&select=id,mander_id,username&order=created_at.desc&limit=1`,
        { headers: { Prefer: "count=none" } },
      );
      if (wildRes.ok) {
        const wildRows: any[] = await wildRes.json();
        profile = wildRows?.[0] ?? null;
      }
    }

    // Fallback: search Supabase Auth users by email containing the username
    if (!profile) {
      const authUsers: any[] = await getCachedAuthUsers().catch(() => []);
      const match = authUsers.find((u: any) =>
          (u.user_metadata?.username ?? "").toLowerCase() === username.toLowerCase() ||
          (u.email ?? "").toLowerCase() === username.toLowerCase()
        );
      if (match) {
        // Try to get profile by auth user id
        const pr2 = await sbAdmin(
          `profiles?id=eq.${encodeURIComponent(match.id)}&select=id,mander_id,username&limit=1`,
          { headers: { Prefer: "count=none" } },
        );
        if (pr2.ok) {
          const pr2Rows: any[] = await pr2.json();
          profile = pr2Rows?.[0] ?? null;
        }
      }
    }

    if (!profile) return res.status(404).json({ error: `Usuario '${username}' no encontrado.` });

    // 2. Actualizar balance (upsert en tabla balances)
    const getBalRes = await sbAdmin(
      `balances?mander_id=eq.${encodeURIComponent(profile.mander_id)}&currency=eq.${encodeURIComponent(cur)}&select=id,balance&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    const balRows: any[] = getBalRes.ok ? await getBalRes.json() : [];
    const existing = balRows?.[0];
    const now = new Date().toISOString();

    if (existing) {
      await sbAdmin(`balances?id=eq.${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ balance: Number(existing.balance) + parsedAmount, updated_at: now }),
      });
    } else {
      await sbAdmin("balances", {
        method: "POST",
        body: JSON.stringify({ mander_id: profile.mander_id, currency: cur, balance: parsedAmount, locked_amount: 0, updated_at: now }),
      });
    }

    // 3. Crear transacción de registro
    await sbAdmin("transactions", {
      method: "POST",
      body: JSON.stringify({
        user_id:    profile.id,
        type:       "deposit",
        display_id: nextDepositDisplayId(),
        amount:     parsedAmount,
        currency:   cur,
        status:     "completed",
        notes:      note ?? `Acreditación manual por admin. Monto: $${parsedAmount} ${cur}.`,
        completed_at: now,
      }),
    });

    const adminUser = (req as any).adminUsername ?? "admin";
    console.log(`[ADMIN credit-balance] admin=${adminUser} user=${username} amount=${parsedAmount} ${cur} note=${note ?? ""}`);

    return res.json({
      ok: true,
      message: `Balance de ${username} acreditado: +${parsedAmount} ${cur}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ADMIN credit-balance] error:", msg);
    return res.status(500).json({ error: msg });
  }
});

// ── POST /api/admin/add-streamer-balance ─────────────────────────────────────
// Adds demo balance to a user (streamer mode). Cannot be withdrawn.
// Body: { userId?, username?, amount_usd, note? }
router.post("/add-streamer-balance", requireAdmin, async (req: Request, res: Response) => {
  const { userId, username, amount_usd, note } = req.body ?? {};
  if ((!userId && !username) || !amount_usd) {
    return res.status(400).json({ error: "Faltan campos: userId o username, y amount_usd." });
  }
  const parsedAmount = Number(amount_usd);
  if (!Number.isFinite(parsedAmount) || parsedAmount === 0) {
    return res.status(400).json({ error: "amount_usd debe ser distinto de cero (positivo para agregar, negativo para descontar)." });
  }

  try {
    // 1. Buscar el perfil por userId o username
    let profRes;
    if (userId) {
      profRes = await sbAdmin(
        `profiles?id=eq.${encodeURIComponent(userId)}&select=id,mander_id,username&limit=1`,
        { headers: { Prefer: "count=none" } },
      );
    } else {
      profRes = await sbAdmin(
        `profiles?username=ilike.${encodeURIComponent(username)}&select=id,mander_id,username&limit=1`,
        { headers: { Prefer: "count=none" } },
      );
    }
    if (!profRes.ok) throw new Error("Error leyendo perfil");
    const profRows: any[] = await profRes.json();
    const profile = profRows?.[0];
    if (!profile) return res.status(404).json({ error: `Usuario no encontrado.` });

    // Guard: admin accounts cannot receive demo/streamer balance
    if (ADMIN_USERNAMES().includes(profile.username.toLowerCase())) {
      return res.status(400).json({ error: `No se puede asignar balance demo a una cuenta de administrador (${profile.username}).` });
    }

    // 2. Leer balance_demo actual desde app_metadata del usuario en Auth
    const authUserRes = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(profile.id)}`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    if (!authUserRes.ok) throw new Error("Error leyendo usuario en Auth");
    const authUser: any = await authUserRes.json();
    const currentDemo = Number(authUser.app_metadata?.balance_demo_local ?? authUser.app_metadata?.balance_demo ?? 0);
    const newDemo = parseFloat(Math.max(0, currentDemo + parsedAmount).toFixed(8));

    // 3. Actualizar balance_demo e is_streamer en app_metadata de Auth
    const adminSetTs = new Date().toISOString();
    const patchRes = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(profile.id)}`, {
      method: "PUT",
      headers: {
        apikey:          SUPABASE_SERVICE_KEY,
        Authorization:   `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        app_metadata: {
          ...authUser.app_metadata,
          balance_demo: newDemo,
          // Reset balance_demo_local to match new credited amount so admin panel always
          // reflects the authoritative post-credit balance immediately
          balance_demo_local: newDemo,
          is_streamer:  true,
          // When admin explicitly changes balance_demo, record the authoritative target
          // value + timestamp so the client can apply it absolutely instead of relying
          // on a local delta that may diverge from gameplay.
          balance_demo_admin_set_ts:    adminSetTs,
          balance_demo_admin_set_value: newDemo,
        },
      }),
    });
    if (!patchRes.ok) {
      const err = await patchRes.text();
      throw new Error(`Error actualizando balance_demo: ${err}`);
    }

    // 4. Registrar en transactions SOLO cuando se acredita (no cuando se descuenta)
    const now = adminSetTs;
    if (parsedAmount > 0) {
      const displayId = await nextDepositDisplayId();
      await sbAdmin("transactions", {
        method: "POST",
        body: JSON.stringify({
          user_id:      profile.id,
          mander_id:    profile.mander_id,
          type:         "bonus",
          amount:       parsedAmount,
          currency:     "USDT",
          network:      "",
          status:       "completed",
          notes:        note ?? `[demo_balance] Saldo demo acreditado por admin. $${parsedAmount} USDT.`,
          display_id:   displayId,
          completed_at: now,
        }),
      }).catch(() => {});
    }

    if (parsedAmount > 0) {
      const amountLabel = Math.abs(parsedAmount).toFixed(2);
      await sbAdmin("user_notifications", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({
          id:         `admin-demo-${profile.id}-${Date.parse(now)}`,
          user_id:    profile.id,
          type:       "deposit",
          title:      "Depósito confirmado",
          message:    `+$${amountLabel} USDT acreditado en tu cuenta.`,
          title_key:  "depConfTitle",
          msg_key:    "depConfMsg",
          params:     [amountLabel, "USDT"],
          read:       false,
          created_at: now,
        }),
      }).catch(() => {});
    }

    const adminUser = (req as any).adminUsername ?? "admin";
    console.log(`[ADMIN add-streamer-balance] admin=${adminUser} user=${profile.username} amount=${parsedAmount} demo_total=${newDemo}`);

    return res.json({
      ok: true,
      username: profile.username,
      balance_demo: newDemo,
      message: `Balance demo de ${profile.username} acreditado: +$${parsedAmount} DEMO (total: $${newDemo})`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ADMIN add-streamer-balance] error:", msg);
    return res.status(500).json({ error: msg });
  }
});

// ── POST /api/admin/add-wagering ─────────────────────────────────────────────
// Acredita wagering retroactivo para un usuario (útil cuando apostaron antes del
// fix que empezó a registrar bets en transactions).
// Body: { username, amount_usd }
router.post("/admin/add-wagering", requireAdmin, async (req: Request, res: Response) => {
  const { username, amount_usd } = req.body as { username?: string; amount_usd?: number };
  if (!username?.trim()) return res.status(400).json({ error: "username requerido" });
  const parsed = parseFloat(String(amount_usd));
  if (!isFinite(parsed) || parsed <= 0) return res.status(400).json({ error: "amount_usd inválido" });

  try {
    const profRes = await sbAdmin(
      `profiles?username=ilike.${encodeURIComponent(username.trim())}&select=mander_id,username&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    if (!profRes.ok) return res.status(502).json({ error: "Error consultando perfil" });
    const profRows: any[] = await profRes.json();
    if (!profRows[0]) return res.status(404).json({ error: "Usuario no encontrado" });
    const { mander_id, username: resolvedUsername } = profRows[0];

    // Insert into game_bets (source of truth for wagered stats) — NOT transactions
    const insRes = await sbAdmin("game_bets", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        username:   resolvedUsername,
        game:       "admin_wagering_credit",
        currency:   "USD",
        bet_usd:    parseFloat(parsed.toFixed(6)),
        payout_usd: 0,
        bonus_usd:  0,
      }),
    });
    if (!insRes.ok) {
      const txt = await insRes.text().catch(() => "");
      return res.status(502).json({ error: "Error insertando wagering", detail: txt });
    }

    console.log(`[ADMIN add-wagering] +$${parsed} wagering creditado a ${username.trim()} (mander_id=${mander_id})`);
    return res.json({ ok: true, username: username.trim(), amount_usd: parsed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

// ── GET /api/admin/ip-report ──────────────────────────────────────────────────
// Returns all tracked IPs and highlights accounts sharing the same IP.
// Also enriches each entry with referral code used at signup.
router.get("/ip-report", requireAdmin, async (_req: Request, res: Response) => {
  const base = getIpReport();

  try {
    const usernames = base.all.map(e => e.username).filter(Boolean);
    if (usernames.length === 0) return res.json(base);

    const usernamesParam = `(${usernames.map(u => `"${encodeURIComponent(u)}"`).join(",")})`;

    // referred_username → referrer_username
    const referralMap: Record<string, string> = {};
    // referrer_username → ref_code
    const refCodeMap: Record<string, string> = {};

    const rr = await sbAdminRaw(
      `affiliate_referrals?referred_username=in.${usernamesParam}&select=referred_username,referrer_username`,
      { headers: { Prefer: "count=none" } }
    );
    if (rr.ok) {
      const refRows: { referred_username: string; referrer_username: string }[] = await rr.json();
      const referrers = new Set<string>();
      for (const row of refRows) {
        referralMap[row.referred_username.toLowerCase()] = row.referrer_username;
        referrers.add(row.referrer_username);
      }
      if (referrers.size > 0) {
        const referrersParam = `(${[...referrers].map(u => `"${encodeURIComponent(u)}"`).join(",")})`;
        const lr = await sbAdminRaw(
          `affiliate_links?username=in.${referrersParam}&select=username,ref_code`,
          { headers: { Prefer: "count=none" } }
        );
        if (lr.ok) {
          const linkRows: { username: string; ref_code: string }[] = await lr.json();
          for (const row of linkRows) refCodeMap[row.username] = row.ref_code;
        }
      }
    }

    const enriched = {
      ...base,
      all: base.all.map(e => {
        const referrer = referralMap[e.username.toLowerCase()] ?? null;
        return {
          ...e,
          referred_by:    referrer,
          ref_code_used:  referrer ? (refCodeMap[referrer] ?? null) : null,
        };
      }),
    };
    return res.json(enriched);
  } catch (_) {
    return res.json(base);
  }
});

// ── POST /api/admin/ip-import ─────────────────────────────────────────────────
// Seeds all existing users from profiles into the IP store (without IP).
// IPs are not available historically — they are captured at login going forward.
router.post("/ip-import", requireAdmin, async (_req: Request, res: Response) => {
  try {
    // Page through all profiles from Supabase REST (max 1000 per page).
    let seeded = 0;
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      const r = await fetchWithTimeout(
        `${SB_URL}/rest/v1/profiles?select=id,username,created_at&limit=${pageSize}&offset=${offset}`,
        {
          headers: {
            apikey: SB_KEY,
            Authorization: `Bearer ${SB_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!r.ok) {
        const txt = await r.text();
        return res.status(500).json({ error: `Error al leer profiles: ${txt}` });
      }
      const rows: { id: string; username: string; created_at: string }[] = await r.json();
      if (!rows.length) break;

      for (const row of rows) {
        if (row.id && row.username) {
          seedUser(row.id, row.username, row.created_at ?? new Date().toISOString());
          seeded++;
        }
      }

      if (rows.length < pageSize) break;
      offset += pageSize;
    }

    flushSeeds();
    return res.json({ seeded, note: "IPs históricas no disponibles — se capturan en tiempo real al hacer login." });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Error desconocido" });
  }
});

export default router;
