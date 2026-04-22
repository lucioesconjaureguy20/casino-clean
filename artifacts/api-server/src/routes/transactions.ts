import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { verifyGameToken } from "../lib/gameToken";
import { getPriceUsd, toUsd } from "../lib/prices";
import { nextDepositDisplayId, nextWithdrawalDisplayId } from "../lib/counters.js";
import { creditBalanceAtomic, creditBalanceNative, accumulateRakeback, getRakebackPools, getRakebackPoolsSplit, atomicProfileBalanceDelta } from "../lib/atomicBalance";
import { requireAuth } from "../lib/requireAuth";
import { tryIdempotency } from "../lib/idempotency";
import { fetchWithTimeout } from "../lib/fetchWithTimeout";

// ── VIP ranks (mirrors frontend vipSystem.ts) ─────────────────────────────────
// Used server-side to validate rakeback accumulation per bet.
const VIP_RANKS: { minWager: number; rakebackPct: number }[] = [
  { minWager: 0,         rakebackPct: 0.04  },
  { minWager: 500,       rakebackPct: 0.045 },
  { minWager: 2_000,     rakebackPct: 0.05  },
  { minWager: 8_000,     rakebackPct: 0.06  },
  { minWager: 25_000,    rakebackPct: 0.07  },
  { minWager: 60_000,    rakebackPct: 0.08  },
  { minWager: 125_000,   rakebackPct: 0.09  },
  { minWager: 250_000,   rakebackPct: 0.10  },
  { minWager: 500_000,   rakebackPct: 0.11  },
  { minWager: 900_000,   rakebackPct: 0.12  },
  { minWager: 1_500_000, rakebackPct: 0.13  },
  { minWager: 2_500_000, rakebackPct: 0.14  },
  { minWager: 4_000_000, rakebackPct: 0.15  },
  { minWager: 7_000_000, rakebackPct: 0.16  },
  { minWager: 12_000_000, rakebackPct: 0.17 },
];

function getRakebackPct(wageredTotal: number): number {
  let pct = VIP_RANKS[0].rakebackPct;
  for (const tier of VIP_RANKS) {
    if (wageredTotal >= tier.minWager) pct = tier.rakebackPct;
    else break;
  }
  return pct;
}

// ── House edge per game ───────────────────────────────────────────────────────
// rakeback = bet * house_edge * vip_pct  (accumulates on every bet, win or lose)
const HOUSE_EDGE: Record<string, number> = {
  dice:       0.01,   // 1%
  crash:      0.02,   // 2%
  mines:      0.04,   // 4% (mid-range of 3–5%)
  plinko:     0.025,  // 2.5%
  hilo:       0.025,  // 2.5%
  blackjack:  0.005,  // 0.5%
  roulette:   0.027,  // 2.7% (European single zero)
  baccarat:   0.012,  // 1.2%
  keno:       0.05,   // 5%
  slots:      0.04,   // 4%
  limbo:      0.01,   // 1%
  wheel:      0.025,  // 2.5%
  casino:     0.02,   // 2% default fallback
};

function getHouseEdge(game: string): number {
  const key = String(game).toLowerCase().trim();
  return HOUSE_EDGE[key] ?? HOUSE_EDGE["casino"];
}

const router = Router();

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY      = process.env.SUPABASE_SERVICE_KEY;

// Usernames excluidos de las secciones públicas de apuestas (live, big wins, lucky bets)
// Se pueden agregar más separados por coma en la variable de entorno HIDDEN_FROM_BETS
const HIDDEN_FROM_BETS: Set<string> = new Set(
  (process.env.HIDDEN_FROM_BETS || "ADMIN,testreferido")
    .split(",").map(u => u.trim().toLowerCase()).filter(Boolean)
);

// ── Supabase admin helpers ────────────────────────────────────────────────────
function adminHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SUPABASE_SERVICE_KEY!,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...extra,
  };
}

async function sbAdmin(path: string, options: RequestInit = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("Supabase admin not configured");
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetchWithTimeout(url, {
    ...options,
    headers: adminHeaders(options.headers as Record<string, string> || {}),
  });
  return res;
}

// ── Auth middleware ───────────────────────────────────────────────────────────
interface AuthUser { id: string; email: string; user_metadata: Record<string, any> }
declare global { namespace Express { interface Request { authUser?: AuthUser } } }

// requireAuth is imported from ../lib/requireAuth — shared single-session middleware

// ── Helper: obtener perfil del usuario ───────────────────────────────────────
async function getProfile(userId: string): Promise<{ mander_id: string; username: string; balance?: number; is_blocked?: boolean } | null> {
  const r = await sbAdmin(`profiles?id=eq.${userId}&select=mander_id,username,balance,is_blocked&limit=1`);
  const rows = await r.json();
  return rows?.[0] ?? null;
}


// ── Helper: actualizar profiles.balance con el total USD ─────────────────────
// Los balances se almacenan como cantidades nativas — se multiplican por precio para obtener USD
async function syncProfileBalance(manderId: string): Promise<void> {
  const allRes = await sbAdmin(
    `balances?mander_id=eq.${encodeURIComponent(manderId)}&select=currency,balance`,
    { headers: { Prefer: "count=none" } },
  );
  if (!allRes.ok) return;
  const allRows: { currency: string; balance: number }[] = await allRes.json();
  const totalUsd = allRows.reduce((sum, r) => sum + toUsd(r.balance, r.currency), 0);
  await sbAdmin(`profiles?mander_id=eq.${encodeURIComponent(manderId)}`, {
    method: "PATCH",
    body: JSON.stringify({ balance: totalUsd }),
  });
}

// ── Helper: actualizar tabla balances ─────────────────────────────────────────
// deltaUsd > 0 = acreditar, < 0 = debitar (siempre en USD)
// Los balances se guardan como cantidades NATIVAS (deltaUsd / priceUsd)
// Solo se llama cuando una transacción pasa a "completed".
// nativeOverride: si se pasa, usar ese monto nativo exacto (evita imprecisión por precio fallback)
async function updateBalance(
  manderId: string,
  currency: string,
  deltaUsd: number,
  txType: string,
  nativeOverride: number | null = null,
): Promise<void> {
  const now = new Date().toISOString();
  const cur = currency.trim().toUpperCase();

  // Compute native amount — use exact coin amount if provided, else convert from USD
  const priceUsd = getPriceUsd(cur);
  const deltaNative = (nativeOverride !== null) ? nativeOverride : (deltaUsd / priceUsd);

  // Atomic native balance credit — SELECT FOR UPDATE + UPDATE SET balance = balance + delta.
  // Replaces the old read-modify-write pattern to prevent race conditions under concurrent requests.
  const atomicResult = await creditBalanceNative(manderId, cur, deltaNative);
  if (!atomicResult.ok) {
    console.error(`[BALANCE] creditBalanceNative failed: ${atomicResult.error} mander=${manderId}`);
  } else {
    console.log(`[BALANCE] ${txType} Δ${deltaNative} ${cur} mander_id=${manderId} new=${atomicResult.newBalance}`);
  }

  // Atomic additive UPDATE on profiles.balance (display cache).
  // Uses PostgreSQL RPC atomic_profile_balance_delta → UPDATE SET balance = GREATEST(0, balance + delta)
  // Eliminates the read-modify-write race condition from the old READ+COMPUTE+WRITE approach.
  await atomicProfileBalanceDelta(manderId, deltaUsd);
  console.log(`[BALANCE] profiles.balance Δ${deltaUsd} USD → mander=${manderId}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/transactions
// Crea una nueva transacción en Supabase.
// Tipos válidos: "deposit" | "withdrawal"
// Body: { type, amount, currency, network?, external_tx_id?, notes?, status? }
// ──────────────────────────────────────────────────────────────────────────────
router.post("/transactions", requireAuth, async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Servicio no disponible." });

  const { type, amount, currency, network, external_tx_id, notes, status, deposit_id } = req.body;

  if (!type || typeof amount !== "number" || !currency) {
    return res.status(400).json({ error: "Faltan campos requeridos: type, amount, currency." });
  }

  console.log(`[TX INSERT] user=${req.authUser!.id} type=${type} amount=${amount} currency=${currency}`);

  try {
    const profile = await getProfile(req.authUser!.id);
    if (!profile) {
      console.error("[TX INSERT] perfil no encontrado para user:", req.authUser!.id);
      return res.status(404).json({ error: "Perfil no encontrado." });
    }

    if (type === "withdrawal" && profile.is_blocked === true) {
      console.warn(`[TX INSERT] usuario bloqueado intentó retiro: ${req.authUser!.id}`);
      return res.status(403).json({ error: "Tu cuenta está bloqueada para retiros. Contactá al soporte." });
    }

    // Compute display_id without race conditions:
    // - deposits: use the deposits.id (sequential SERIAL from Postgres) passed as deposit_id
    // - withdrawals: use atomic in-memory counter (Node.js single-thread = no race)
    // - other types: no display_id
    let displayId: number | null = null;
    if (type === "deposit") {
      displayId = nextDepositDisplayId();
    } else if (type === "withdrawal") {
      displayId = nextWithdrawalDisplayId();
    }
    console.log(`[TX INSERT] display_id=${displayId} para tipo "${type}"`);

    const finalStatus = status || "pending";
    const txRow = {
      mander_id:      profile.mander_id,
      user_id:        req.authUser!.id,
      display_id:     displayId,
      type,
      amount,
      currency,
      network:        network        || "",
      status:         finalStatus,
      external_tx_id: external_tx_id || null,
      notes:          notes          || null,
    };

    console.log("[TX INSERT] row →", JSON.stringify(txRow));

    const insRes = await sbAdmin("transactions", {
      method: "POST",
      body: JSON.stringify(txRow),
    });

    if (!insRes.ok) {
      const errBody = await insRes.json().catch(() => ({}));
      const msg = (errBody as any).message || JSON.stringify(errBody);
      console.error("[TX INSERT] Supabase error:", insRes.status, msg);
      return res.status(500).json({ error: msg });
    }

    const inserted = await insRes.json();
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    console.log("[TX INSERT] OK — id:", row?.id, "display_id:", row?.display_id);

    // Si la transacción nace directamente como "completed", acreditar/debitar el balance
    if (finalStatus === "completed") {
      const delta = type === "withdrawal" ? -Math.abs(amount) : Math.abs(amount);
      await updateBalance(profile.mander_id, currency, delta, type);
    }

    return res.json({ transaction: row });

  } catch (err: any) {
    console.error("[TX INSERT] catch:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/transactions
// Devuelve las transacciones del usuario autenticado.
// ──────────────────────────────────────────────────────────────────────────────
router.get("/transactions", requireAuth, async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Servicio no disponible." });

  try {
    const profile = await getProfile(req.authUser!.id);
    if (!profile) return res.status(404).json({ error: "Perfil no encontrado." });

    const limit  = Math.min(parseInt(req.query.limit  as string) || 200, 500);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const txRes = await sbAdmin(
      `transactions?mander_id=eq.${encodeURIComponent(profile.mander_id)}&type=neq.bet&order=created_at.desc&limit=${limit}&offset=${offset}&select=*`,
      { headers: { Prefer: "count=none" } },
    );

    if (!txRes.ok) {
      const errBody = await txRes.json().catch(() => ({}));
      console.error("[TX GET] Supabase error:", txRes.status, errBody);
      return res.status(500).json({ error: (errBody as any).message || "Error al obtener transacciones." });
    }

    const txs = await txRes.json();
    console.log(`[TX GET] user=${req.authUser!.id} → ${txs?.length ?? 0} transacciones`);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    return res.json({ transactions: txs || [] });

  } catch (err: any) {
    console.error("[TX GET] catch:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PATCH /api/transactions/:id/status
// Actualiza el estado de una transacción a "completed", "failed" o "cancelled".
// Si pasa a "completed", actualiza automáticamente la tabla balances.
// ──────────────────────────────────────────────────────────────────────────────
router.patch("/transactions/:id/status", requireAuth, async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Servicio no disponible." });

  const VALID_STATUSES = ["pending", "completed", "failed", "cancelled"];
  const { status } = req.body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Estado inválido. Valores permitidos: ${VALID_STATUSES.join(", ")}` });
  }

  const txId = req.params.id;
  console.log(`[TX UPDATE] id=${txId} status=${status} user=${req.authUser!.id}`);

  try {
    const profile = await getProfile(req.authUser!.id);
    if (!profile) return res.status(404).json({ error: "Perfil no encontrado." });

    // Leer la transacción actual antes de parchear para:
    // 1. Obtener type, amount, currency, notes para updateBalance
    // 2. Evitar doble-conteo si ya estaba en "completed"
    const currentRes = await sbAdmin(
      `transactions?id=eq.${txId}&mander_id=eq.${encodeURIComponent(profile.mander_id)}&select=id,type,amount,currency,status,notes&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    const currentRows = currentRes.ok ? await currentRes.json() : [];
    const currentTx = currentRows?.[0];

    if (!currentTx) {
      return res.status(404).json({ error: "Transacción no encontrada o no pertenece al usuario." });
    }

    const wasAlreadyCompleted = currentTx.status === "completed";

    const updates: Record<string, string> = { status };
    if (status === "completed") updates.completed_at = new Date().toISOString();

    const updRes = await sbAdmin(
      `transactions?id=eq.${txId}&mander_id=eq.${encodeURIComponent(profile.mander_id)}`,
      { method: "PATCH", body: JSON.stringify(updates) },
    );

    if (!updRes.ok) {
      const errBody = await updRes.json().catch(() => ({}));
      const msg = (errBody as any).message || JSON.stringify(errBody);
      console.error("[TX UPDATE] Supabase error:", updRes.status, msg);
      return res.status(500).json({ error: msg });
    }

    const updatedRows = await updRes.json();
    const row = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;

    if (!row) {
      console.warn("[TX UPDATE] sin filas actualizadas — id:", txId, "mander_id:", profile.mander_id);
      return res.status(404).json({ error: "Transacción no encontrada o no pertenece al usuario." });
    }

    console.log("[TX UPDATE] OK — id:", row.id, "status:", row.status, "completed_at:", row.completed_at);

    // Actualizar balance automáticamente al completar (evitar doble-conteo)
    if (status === "completed" && !wasAlreadyCompleted) {
      const delta = currentTx.type === "withdrawal" ? -Math.abs(currentTx.amount) : Math.abs(currentTx.amount);
      // Para depósitos: usar coinAmount de notes si existe (evita imprecisión por precio)
      let nativeOverride: number | null = null;
      if (currentTx.type === "deposit") {
        const match = ((currentTx.notes as string) || "").match(/coinAmount:([0-9.]+)/);
        if (match) nativeOverride = parseFloat(match[1]);
      }
      await updateBalance(profile.mander_id, currentTx.currency, delta, currentTx.type, nativeOverride);
    }

    return res.json({ transaction: row });

  } catch (err: any) {
    console.error("[TX UPDATE] catch:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/profile
// Devuelve el perfil del usuario autenticado.
// Si no existe (usuario nuevo), lo crea automáticamente.
// ──────────────────────────────────────────────────────────────────────────────
router.get("/profile", requireAuth, async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Servicio no disponible." });

  const userId   = req.authUser!.id;
  const username = req.authUser!.user_metadata?.username || req.authUser!.email || userId;
  const email    = req.authUser!.email || "";

  try {
    // 1. Buscar perfil existente + app_metadata (demo balance) en paralelo
    const [profileRes, authUserRes] = await Promise.all([
      sbAdmin(`profiles?id=eq.${userId}&select=*&limit=1`),
      fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        headers: { apikey: SUPABASE_SERVICE_KEY!, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
      }),
    ]);
    const profileRows: any[] = await profileRes.json();
    let profileRow = profileRows?.[0] ?? null;
    const authMeta = authUserRes.ok ? ((await authUserRes.json())?.app_metadata ?? {}) : {};

    // 2. Auto-crear perfil para usuarios nuevos (primera vez)
    if (!profileRow) {
      const mander_id = crypto.randomBytes(12).toString("hex");
      const now = new Date().toISOString();
      const createRes = await sbAdmin("profiles", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ id: userId, mander_id, username, email, balance: 0, status: "active", created_at: now, last_login: now }),
      });
      const created: any[] = await createRes.json();
      profileRow = created?.[0] ?? { id: userId, mander_id, username, email, balance: 0, status: "active" };
      console.log(`[PROFILE] nuevo perfil creado user=${userId} mander_id=${mander_id}`);
    } else {
      // Actualizar last_login en background
      sbAdmin(`profiles?id=eq.${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ last_login: new Date().toISOString() }),
      }).catch(() => {});
    }

    // Leer balance real + stats en paralelo
    let realBalance = profileRow.balance ?? 0;
    let totalDeposit = 0;
    let wageredTotal = 0;
    try {
      const mid = encodeURIComponent(profileRow.mander_id);
      const [balRes, txRes, statsRes] = await Promise.all([
        sbAdmin(`balances?mander_id=eq.${mid}&select=balance`, { headers: { Prefer: "count=none" } }),
        // Exclude type=bet — game rounds are tracked in game_bets, not transactions
        sbAdmin(`transactions?mander_id=eq.${mid}&type=neq.bet&select=type,amount,status&limit=5000`, { headers: { Prefer: "count=none" } }),
        // Sum wagered total directly from game_bets — profile_stats table is unused/empty
        sbAdmin(`game_bets?username=ilike.${encodeURIComponent(username)}&select=bet_usd&limit=100000`, { headers: { Prefer: "count=none" } }),
      ]);
      if (balRes.ok) {
        const balRows: { balance: number }[] = await balRes.json();
        if (balRows.length > 0) {
          realBalance = balRows.reduce((sum, r) => sum + Math.max(0, Number(r.balance || 0)), 0);
        }
      }
      if (txRes.ok) {
        const txRows: { type: string; amount: number; status: string }[] = await txRes.json();
        totalDeposit = txRows
          .filter(t => t.type === "deposit" && (t.status === "completed" || t.status === "confirmed"))
          .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
      }
      if (statsRes.ok) {
        const betRows: { bet_usd: number }[] = await statsRes.json();
        wageredTotal = Math.round(betRows.reduce((s, r) => s + Math.abs(Number(r.bet_usd || 0)), 0) * 100) / 100;
        console.log(`[PROFILE] username=${username} game_bets_rows=${betRows.length} wagered_total=${wageredTotal}`);
      } else {
        const errText = await statsRes.text().catch(() => "(unreadable)");
        console.warn(`[PROFILE] game_bets query failed HTTP ${statsRes.status} username=${username}:`, errText);
      }
    } catch {}

    // Verificar si el usuario es admin
    const adminUsernames = (process.env.ADMIN_USERNAMES || "")
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    const isAdmin = adminUsernames.includes((profileRow.username || "").toLowerCase());

    // Buscar referidor en affiliate_referrals
    let referrerUsername: string | null = null;
    try {
      const refRes = await sbAdmin(
        `affiliate_referrals?referred_username=ilike.${encodeURIComponent(profileRow.username)}&select=referrer_username&limit=1`
      );
      if (refRes.ok) {
        const refRows: any[] = await refRes.json();
        if (refRows?.length > 0) referrerUsername = refRows[0].referrer_username || null;
      }
    } catch {}

    // Detectar país por IP — sólo usando headers del proxy (Cloudflare/Render).
    // La llamada externa a ipapi.co se eliminó porque bloqueaba la respuesta hasta 2 segundos.
    const countryCode: string | null = (
      (req.headers["cf-ipcountry"] as string) ||
      (req.headers["x-country-code"] as string) ||
      null
    ) || null;

    console.log(`[PROFILE] user_id=${userId} mander_id=${profileRow.mander_id} username=${profileRow.username} balance=${realBalance}`);

    return res.json({
      profile: {
        user_id:      userId,
        mander_id:    profileRow.mander_id,
        username:     profileRow.username,
        email:        profileRow.email,
        balance:      realBalance,
        balance_demo: Number(authMeta.balance_demo_local ?? authMeta.balance_demo ?? 0),
        balance_demo_restored_ts: authMeta.balance_demo_restored_ts ?? null,
        is_streamer:  !!authMeta.is_streamer,
        status:       profileRow.status ?? "active",
        created_at:   profileRow.created_at || req.authUser!.created_at,
        is_admin:     isAdmin,
      },
      details: {
        username:    profileRow.username || null,
        country:     countryCode,
        referrer_id: referrerUsername,
      },
      stats: {
        total_deposit:  Math.round(totalDeposit  * 100) / 100,
        wagered_total:  Math.round(wageredTotal   * 100) / 100,
      },
    });
  } catch (err: any) {
    console.error("[PROFILE GET] catch:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/profile/update — actualiza username / email
router.post("/profile/update", requireAuth, async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Servicio no disponible." });
  const userId = req.authUser!.id;
  const { username, email } = req.body ?? {};
  const patch: Record<string, string> = {};
  if (username) patch.username = username;
  if (email)    patch.email    = email;
  if (!Object.keys(patch).length) return res.status(400).json({ error: "Nada que actualizar." });
  try {
    await sbAdmin(`profiles?id=eq.${userId}`, { method: "PATCH", body: JSON.stringify(patch) });
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/profile/details — devuelve/guarda detalles extendidos del perfil
router.post("/profile/details", requireAuth, async (req: Request, res: Response) => {
  return res.json({ details: req.body ?? {} });
});

// POST /api/profile/stats — devuelve estadísticas de juego del usuario
router.post("/profile/stats", requireAuth, async (req: Request, res: Response) => {
  const profile = await getProfile(req.authUser!.id).catch(() => null);
  if (!profile) return res.status(404).json({ error: "Perfil no encontrado." });
  try {
    const uname = encodeURIComponent(profile.username);
    const [txRes, betsRes] = await Promise.all([
      // Exclude type=bet — game rounds live in game_bets, not transactions
      sbAdmin(`transactions?mander_id=eq.${encodeURIComponent(profile.mander_id)}&type=neq.bet&select=type,amount,status&limit=1000`),
      // Wagered total from game_bets (source of truth)
      sbAdmin(`game_bets?username=eq.${uname}&select=bet_usd&limit=100000`),
    ]);
    const txs: any[]               = txRes.ok   ? await txRes.json()   : [];
    const betRows: { bet_usd: number }[] = betsRes.ok ? await betsRes.json() : [];
    const totalWagered   = betRows.reduce((s, b) => s + Number(b.bet_usd), 0);
    const totalWithdrawn = txs.filter(t => t.type === "withdrawal" && t.status === "completed").reduce((s, t) => s + Number(t.amount), 0);
    const totalDeposited = txs.filter(t => t.type === "deposit"    && t.status === "completed").reduce((s, t) => s + Number(t.amount), 0);
    return res.json({ stats: { totalWagered, totalWithdrawn, totalDeposited, txCount: txs.length } });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/balance
// Devuelve el balance total del usuario (suma de todos los registros en la tabla
// balances). Todos los montos están en USD equivalente.
// ──────────────────────────────────────────────────────────────────────────────
router.get("/balance", requireAuth, async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Servicio no disponible." });

  try {
    const userId = req.authUser!.id;
    const profile = await getProfile(userId);
    if (!profile) return res.status(404).json({ error: "Perfil no encontrado." });

    // Fetch coin balances + app_metadata (balance_demo) in parallel
    const [balRes, authUserRes] = await Promise.all([
      sbAdmin(
        `balances?mander_id=eq.${encodeURIComponent(profile.mander_id)}&select=currency,balance`,
        { headers: { Prefer: "count=none" } },
      ),
      fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        headers: { apikey: SUPABASE_SERVICE_KEY!, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
      }),
    ]);

    if (!balRes.ok) {
      const err = await balRes.json().catch(() => ({}));
      console.error("[BALANCE GET] Supabase error:", balRes.status, err);
      return res.status(500).json({ error: "Error al obtener balance." });
    }

    const authMeta = authUserRes.ok ? ((await authUserRes.json())?.app_metadata ?? {}) : {};
    // Preferir balance_demo_local (saldo jugando actualmente, sincronizado por el frontend)
    // sobre balance_demo (monto original acreditado por admin). Sin esta preferencia, el
    // delta (balance_demo_local - balance_demo) se interpreta como crédito externo y
    // dispara falsas notificaciones de "depósito confirmado" post-sync.
    const balanceDemo = Number(authMeta.balance_demo_local ?? authMeta.balance_demo ?? 0);

    const rawRows: { currency: string; balance: number }[] = await balRes.json();
    // Agregar duplicados por moneda (tolerancia a filas duplicadas en la tabla)
    const agg: Record<string, number> = {};
    for (const r of rawRows) {
      agg[r.currency] = (agg[r.currency] ?? 0) + (Number(r.balance) || 0);
    }
    const rows = Object.entries(agg).map(([currency, balance]) => ({ currency, balance }));
    const total = rows.reduce((sum, r) => sum + toUsd(r.balance, r.currency), 0);

    console.log(`[BALANCE GET] user=${userId} rawRows=${rawRows.length} coins=${rows.length} total=${total}`);

    // NO actualizar profiles.balance aquí — los precios del servidor difieren de los del frontend.
    // profiles.balance se actualiza únicamente en /api/balance/sync (totalUsd live del frontend).

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    return res.json({ balances: rows, total_usd: total, stored_usd: typeof profile.balance === "number" ? profile.balance : 0, balance_demo: balanceDemo, balance_demo_restored_ts: authMeta.balance_demo_restored_ts ?? null, balance_demo_admin_set_ts: authMeta.balance_demo_admin_set_ts ?? null, balance_demo_admin_set_value: authMeta.balance_demo_admin_set_value ?? null });

  } catch (err: any) {
    console.error("[BALANCE GET] catch:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/balance/sync
// Sincroniza el balance nativo de una moneda para el usuario autenticado.
// Body: { currency: string, balance: number, totalUsd?: number }
//   currency  – moneda activa (ej. "USDT")
//   balance   – monto nativo absoluto de esa moneda
//   totalUsd  – total USD de TODAS las monedas (calculado en el frontend)
// ──────────────────────────────────────────────────────────────────────────────
router.post("/balance/sync", requireAuth, async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Servicio no disponible." });

  const { currency, balance, totalUsd } = req.body ?? {};
  if (!currency || balance === undefined || balance === null) {
    return res.status(400).json({ error: "currency y balance son requeridos." });
  }

  const newBal = Math.max(0, Number(balance));
  if (isNaN(newBal)) return res.status(400).json({ error: "balance inválido." });

  const cur = String(currency).trim().toUpperCase();

  try {
    const profile = await getProfile(req.authUser!.id);
    if (!profile) return res.status(404).json({ error: "Perfil no encontrado." });

    // balance/sync is a display-cache updater only.
    //
    // The `balances` table (source of truth) is written atomically by:
    //   • creditBalanceAtomic  — called by bet-result after every game round
    //   • creditBalanceNative  — called by deposit webhooks
    //   • lockFundsAtomic      — called on withdrawal creation
    //
    // Genuine discrepancies (admin adjustments, deposits) are caught by the periodic
    // GET /api/balance poll (every ~8s) which the client uses to set its display.
    //
    // DO NOT read the `balances` table here or return serverBalance corrections:
    //   bet-result fires at t=0 but completes at t=300-500ms (multiple DB round-trips).
    //   balance/sync fires at t=100ms (debounce). Reading balances at t=100ms returns
    //   the PRE-BET value, causing a false "discrepancy" that resets the client balance
    //   back to the old value on every single game round.

    // Update profiles.balance (display cache) with the client's live USD total.
    // Uses frontend prices (more accurate than server-side spot prices for display).
    const frontendTotal = totalUsd !== undefined && totalUsd !== null ? Number(totalUsd) : NaN;
    if (!isNaN(frontendTotal) && frontendTotal >= 0) {
      await sbAdmin(
        `profiles?mander_id=eq.${encodeURIComponent(profile.mander_id)}`,
        { method: "PATCH", body: JSON.stringify({ balance: frontendTotal }) },
      );
    } else {
      await syncProfileBalance(profile.mander_id);
    }

    console.log(`[BALANCE SYNC] user=${req.authUser!.id} ${cur}=${newBal} totalUsd=${totalUsd ?? "recalc"}`);
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[BALANCE SYNC] catch:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/admin/adjust-balance
// Suma o resta saldo a un usuario. Requiere auth + ser admin.
// Body: { mander_id, username, amount (signed native), currency, notes? }
router.post("/admin/adjust-balance", requireAuth, async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Servicio no disponible." });

  // Verificar que el caller es admin
  const callerProfile = await getProfile(req.authUser!.id).catch(() => null);
  if (!callerProfile) return res.status(403).json({ error: "Perfil no encontrado." });
  const adminUsernames = (process.env.ADMIN_USERNAMES || "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!adminUsernames.includes(callerProfile.username.toLowerCase())) {
    return res.status(403).json({ error: "Acceso denegado." });
  }

  const { mander_id, username, amount, currency, notes } = req.body;
  if (!mander_id || !username || typeof amount !== "number" || amount === 0 || !currency) {
    return res.status(400).json({
      error: "Campos requeridos: mander_id, username, amount (≠ 0), currency.",
    });
  }

  const cur = currency.trim().toUpperCase();
  const isCredit = amount > 0;
  const absAmount = Math.abs(amount);
  const adjustmentNote = notes?.trim()
    || `Admin ${isCredit ? "+" : "-"}${absAmount} ${cur} por ${callerProfile.username}`;

  console.log(`[ADMIN adjust-balance] caller=${callerProfile.username} target=${username} amount=${amount} ${cur}`);

  try {
    // Obtener user_id real del target
    let targetUserId: string | null = null;
    const targetRes = await sbAdmin(
      `profiles?mander_id=eq.${encodeURIComponent(mander_id)}&select=id&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    if (targetRes.ok) {
      const rows: { id: string }[] = await targetRes.json();
      if (rows[0]) targetUserId = rows[0].id;
    }

    const txRow: Record<string, unknown> = {
      mander_id,
      display_id:     isCredit ? nextDepositDisplayId() : nextWithdrawalDisplayId(),
      type:           "bonus",
      amount:         absAmount,
      currency:       cur,
      network:        "",
      status:         "completed",
      external_tx_id: null,
      notes:          `[admin_adjustment:${isCredit ? "credit" : "debit"}] ${adjustmentNote}`,
      completed_at:   new Date().toISOString(),
      user_id:        targetUserId,
    };

    const insRes = await sbAdmin("transactions", {
      method: "POST",
      body: JSON.stringify(txRow),
    });

    if (!insRes.ok) {
      const errBody = await insRes.json().catch(() => ({}));
      const msg = (errBody as Record<string, unknown>).message || JSON.stringify(errBody);
      console.error("[ADMIN adjust-balance] error TX:", msg);
      return res.status(500).json({ error: "Error al insertar transacción: " + msg });
    }

    const inserted = await insRes.json();
    const txRow_ = Array.isArray(inserted) ? inserted[0] : inserted;

    // Actualizar balance: nativeOverride = amount nativo, deltaUsd = equivalente en USD
    const deltaUsd = amount * getPriceUsd(cur);
    await updateBalance(mander_id, cur, deltaUsd, "admin_adjustment", amount);

    console.log(`[ADMIN adjust-balance] OK — tx id=${txRow_?.id} ${isCredit ? "+" : ""}${amount} ${cur} → ${username}`);
    return res.json({
      ok: true,
      transaction: txRow_,
      message: `Balance de ${username} ${isCredit ? "aumentado" : "reducido"} en ${absAmount} ${cur}.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ADMIN adjust-balance] excepción:", msg);
    return res.status(500).json({ error: msg });
  }
});

// POST /api/admin/reconcile-deposits
// Busca depósitos confirmados sin entrada en transactions y los crea.
// Header requerido: x-admin-key = SUPABASE_SERVICE_KEY
// Body: { dry_run?: boolean, username?: string }  (sin username → todos los users)
// ──────────────────────────────────────────────────────────────────────────────
router.post("/admin/reconcile-deposits", async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Servicio no disponible." });
  const adminKey = req.headers["x-admin-key"];
  if (!adminKey || adminKey !== SUPABASE_SERVICE_KEY) {
    return res.status(403).json({ error: "Clave admin inválida." });
  }

  const dryRun = req.body?.dry_run !== false; // por defecto dry_run=true (seguro)
  const filterUsername: string | undefined = req.body?.username;

  try {
    // Requiere username para evitar queries masivas lentas
    if (!filterUsername) return res.status(400).json({ error: "Se requiere 'username' para reconciliación individual." });

    // 1. Buscar perfil del usuario en batch
    const pRes = await sbAdmin(
      `profiles?username=eq.${encodeURIComponent(filterUsername)}&select=id,mander_id&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    if (!pRes.ok) return res.status(500).json({ error: "Error buscando perfil" });
    const [prof] = await pRes.json();
    if (!prof) return res.status(404).json({ error: "Usuario no encontrado" });

    // 2. Query en paralelo: depósitos confirmados + transacciones de depósito
    const [depRes, txRes] = await Promise.all([
      sbAdmin(
        `deposits?status=eq.confirmed&user_id=eq.${encodeURIComponent(prof.id)}&select=id,user_id,amount,currency,network,tx_hash,created_at&limit=5000`,
        { headers: { Prefer: "count=none" } },
      ),
      sbAdmin(
        `transactions?mander_id=eq.${encodeURIComponent(prof.mander_id)}&type=eq.deposit&status=eq.completed&select=notes,amount&limit=10000`,
        { headers: { Prefer: "count=none" } },
      ),
    ]);

    if (!depRes.ok) return res.status(500).json({ error: "Error leyendo deposits" });
    if (!txRes.ok)  return res.status(500).json({ error: "Error leyendo transactions" });

    const deposits: any[] = await depRes.json();
    const txRows:   any[] = await txRes.json();

    // 3. Extraer deposit_ids ya registrados en transactions (via notes)
    // Formatos posibles:
    //   plisio-webhook:  "plisio:xxx deposit_id:123 ..."
    //   plisio-poller:   "plisio:xxx poller dep=123 ..."
    //   reconciled:      "reconciled deposit_id:123 ..."
    const registeredDepositIds = new Set<string>();
    for (const tx of txRows) {
      const notes = tx.notes || "";
      const m = notes.match(/deposit_id:(\d+)/) || notes.match(/\bdep=(\d+)/);
      if (m) registeredDepositIds.add(m[1]);
    }

    // 4. Encontrar depósitos sin transacción
    const missing: any[] = [];
    const created: any[] = [];

    for (const dep of deposits) {
      if (registeredDepositIds.has(String(dep.id))) continue;

      const cur    = (dep.currency || "USDT").toUpperCase();
      const net    = dep.network || "";
      const txHash = dep.tx_hash || String(dep.id);

      missing.push({
        deposit_id:  dep.id,
        user_id:     dep.user_id,
        mander_id:   prof.mander_id,
        username:    filterUsername,
        amount:      dep.amount,
        currency:    cur,
        created_at:  dep.created_at,
      });

      if (!dryRun) {
        const displayId = nextDepositDisplayId();
        const insRes = await sbAdmin("transactions", {
          method: "POST",
          body: JSON.stringify({
            mander_id:      prof.mander_id,
            user_id:        dep.user_id,
            type:           "deposit",
            display_id:     String(displayId),
            amount:         dep.amount,
            currency:       cur,
            network:        net,
            status:         "completed",
            external_tx_id: txHash,
            notes:          `reconciled deposit_id:${dep.id} TX:${txHash}`,
            completed_at:   dep.created_at || new Date().toISOString(),
          }),
        });
        if (insRes.ok) {
          const row = await insRes.json().catch(() => null);
          created.push({ deposit_id: dep.id, tx_id: row?.id || "?", mander_id: prof.mander_id, amount: dep.amount, currency: cur });
          console.log(`[reconcile] ✅ TX creada deposit_id=${dep.id} mander=${prof.mander_id} ${dep.amount} ${cur}`);
        } else {
          const errText = await insRes.text();
          console.error(`[reconcile] ❌ Error deposit_id=${dep.id}:`, errText);
          created.push({ deposit_id: dep.id, error: errText });
        }
      }
    }

    return res.json({
      dry_run:       dryRun,
      username:      filterUsername,
      mander_id:     prof.mander_id,
      checked:       deposits.length,
      tx_found:      txRows.length,
      missing_count: missing.length,
      missing,
      ...(dryRun ? {} : { created_count: created.length, created }),
      message: dryRun
        ? `dry_run=true → ${missing.length} depósito(s) sin TX de ${deposits.length} confirmados. Enviar dry_run:false para crear.`
        : `${created.length} transacciones creadas para ${missing.length} depósito(s) faltantes.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reconcile] excepción:", msg);
    return res.status(500).json({ error: msg });
  }
});

// POST /api/admin/add-balance
// Agrega balance manualmente a un usuario (uso administrativo).
// Header requerido: x-admin-key = SUPABASE_SERVICE_KEY (service role)
// Body: { username, mander_id, amount, currency, notes? }
// Inserta una TX tipo "bonus" con status "completed" y actualiza balances.
// ──────────────────────────────────────────────────────────────────────────────
router.post("/admin/add-balance", async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Servicio no disponible." });

  // Verificar admin key
  const adminKey = req.headers["x-admin-key"];
  if (!adminKey || adminKey !== SUPABASE_SERVICE_KEY) {
    console.warn("[ADMIN] intento de acceso sin clave válida — ip:", req.ip);
    return res.status(401).json({ error: "Acceso denegado. Header x-admin-key requerido." });
  }

  const { username, mander_id, amount, currency, notes } = req.body;

  if (!username || !mander_id || typeof amount !== "number" || amount <= 0 || !currency) {
    return res.status(400).json({
      error: "Campos requeridos: username (string), mander_id (string), amount (number > 0), currency (string).",
    });
  }

  const cur = currency.trim().toUpperCase();
  console.log(`[ADMIN add-balance] username=${username} mander_id=${mander_id} amount=${amount} currency=${cur}`);

  try {
    const txRow = {
      mander_id,
      username,
      display_id:     nextDepositDisplayId(),
      type:           "bonus",
      amount,
      currency:       cur,
      network:        "",
      status:         "completed",
      external_tx_id: null,
      notes:          notes || "manual admin balance",
      completed_at:   new Date().toISOString(),
    };

    console.log("[ADMIN add-balance] insertando TX →", JSON.stringify(txRow));

    // 2. Insertar la transacción
    const insRes = await sbAdmin("transactions", {
      method: "POST",
      body: JSON.stringify(txRow),
    });

    if (!insRes.ok) {
      const errBody = await insRes.json().catch(() => ({}));
      const msg = (errBody as any).message || JSON.stringify(errBody);
      console.error("[ADMIN add-balance] error al insertar TX:", insRes.status, msg);
      return res.status(500).json({ error: "Error al insertar transacción: " + msg });
    }

    const inserted = await insRes.json();
    const txRow_ = Array.isArray(inserted) ? inserted[0] : inserted;
    console.log("[ADMIN add-balance] TX insertada — id:", txRow_?.id);

    // 3. Actualizar tabla balances (siempre crédito positivo para bonus)
    // Args: (manderId, currency, deltaUsd, txType, nativeOverride)
    // amount is native units; convert to USD for deltaUsd, pass native as override
    const bonusDeltaUsd = amount * getPriceUsd(cur);
    await updateBalance(mander_id, cur, bonusDeltaUsd, "bonus", amount);

    return res.json({
      success: true,
      transaction: txRow_,
      message: `Balance de ${username} aumentado en ${amount} ${cur}.`,
    });

  } catch (err: any) {
    console.error("[ADMIN add-balance] excepción:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// In-memory circular buffer for live all-users bets feed (max 60 entries)
// ─────────────────────────────────────────────────────────────────────────────
interface LiveBetEntry {
  username: string; game: string; bet_usd: number; payout_usd: number;
  multiplier: number; win: boolean; created_at: string; currency: string;
}

// Weighted random currency for live feed display (USDT most common)
function randomLiveCurrency(): string {
  const r = Math.random();
  if (r < 0.60) return "USDT";
  if (r < 0.75) return "BNB";
  if (r < 0.87) return "TRX";
  if (r < 0.95) return "LTC";
  return "SOL";
}
const liveBetsBuffer: LiveBetEntry[] = [];
const LIVE_BETS_MAX = 60;

// ── Auto-simulate live bets so the feed is never empty ───────────────────────
const SIM_USERS = [
  "matiaslots","luchitox","fedeplay","tincho77","nicobets","franito","tomiwin",
  "facuplay","agusito","dieguito","pablitoo","ramiroo","leanbets","gonzaa",
  "maxiwins","tobiasx","brunito","kevo23","rodriwin","marquitos","enzoo",
  "ivansito","gabywin","dylancito","juancito","santii","julianr","carlitoss",
  "andresito","javierin","victorx","danielr","richar","ferchu","sergito",
  "nico77","tomi23","facu99","agus10","gonza21","lean98","maxi07","tobi22",
  "bruno23","kevin17","rodri10","marcos21","enzo91","ivan22","gabi10",
  "adri21","tobi98","juli10","lucho77","slotero","ruletin","ruletazo",
  "winito","suertin","jugadita","luckito","winwin","betitoo","slotin",
  "tinchoide","facundito","agustinok","leanmart","gonzalito","enzooo",
  "mikeplays","johnnyo","alexx","davey","chrisp","kevinx","ryanb","nickster",
  "joshy","tylerr","ethanx","noahh","liamx","aidenn","logann","lucasx",
  "jackk","owenr","lukee","dylann","connorx","carterr","wyattx","asherx",
  "hunterr","coltonn","blakex","ryderr","zachh","seanr","kylee","adamx",
  "brianr","ericc","justinn","aaronx","tysonr","trevorx","codyy","jessex",
  "brandonr","shawnn","derekx","garrett","tannerx","colbyy","prestonn",
  "parkerx","holdenn","griffinr","bennettx","elliott","spencerx","brockk",
  "daltonn","travisx","coreyy","randyx","bradyy","caseyx","devonn","masonx",
  "mike22","johnny7","alex99","dave23","chris88","ryan21","nick33","josh10",
  "tyler77","ethan22","noah19","liam23","aiden77","logan21","lucas22","jack10",
  "owen23","luke77","dylan21","connor22","carter10","wyatt23","asher77",
  "hunter21","colton22","blake10","ryder23","zach77","sean21","kyle22","adam10",
  "mikeyyy","johnnny","davexx","chrisxo","kevvy","ryano","nickkk","joshxo",
];
const SIM_GAMES = [
  "Dice","Plinko","Keno","Blackjack","Mines","Hilo","Roulette","Baccarat",
];
function generateSimBet(): LiveBetEntry {
  const bet = parseFloat((Math.random() * 28 + 0.5).toFixed(2));
  const game = SIM_GAMES[Math.floor(Math.random() * SIM_GAMES.length)];
  const user = SIM_USERS[Math.floor(Math.random() * SIM_USERS.length)];
  const currency = randomLiveCurrency();

  // Multiplicadores válidos según el juego
  let targetMult: number;
  let winProb: number;

  if (game === "Baccarat") {
    // Solo 3 resultados posibles: Player 2x, Banker ~1.94x, Tie 9x
    const r2 = Math.random();
    if (r2 < 0.44) { targetMult = 2.00; winProb = 0.4462; }       // Player
    else if (r2 < 0.89) { targetMult = 1.94; winProb = 0.4585; }  // Banker (−5% comisión)
    else { targetMult = 9.00; winProb = 0.0953; }                  // Tie
  } else if (game === "Blackjack") {
    // Normal 2x, Blackjack 2.5x, rarísimo más
    const r2 = Math.random();
    if (r2 < 0.80) { targetMult = 2.00; winProb = 0.43; }         // win normal
    else { targetMult = 2.50; winProb = 0.047; }                   // blackjack natural
  } else {
    // Resto de juegos: distribución general
    const r = Math.random();
    if (r < 0.55) {
      targetMult = 1.05 + Math.random() * 0.95;  // 1.05x – 2x
    } else if (r < 0.85) {
      targetMult = 2 + Math.random() * 8;         // 2x – 10x
    } else {
      targetMult = 10 + Math.random() * 40;        // 10x – 50x
    }
    winProb = 1 / (targetMult * 1.05);
  }

  const isWin = Math.random() < winProb;

  let payout = 0;
  let mult = 0;
  if (isWin) {
    mult = parseFloat(targetMult.toFixed(2));
    const rawPayout = bet * mult;
    const cap = 2200 + Math.floor(Math.random() * 601);
    payout = parseFloat(Math.min(rawPayout, cap).toFixed(2));
    mult = parseFloat((payout / bet).toFixed(2));
  }

  return { username: user, game, bet_usd: bet, payout_usd: payout, multiplier: mult, win: isWin, created_at: new Date().toISOString(), currency };
}

function scheduleSimBet() {
  const delay = 2000 + Math.floor(Math.random() * 3000); // 2–5 s
  setTimeout(() => {
    // Only add sim entry if buffer is sparse or no real activity recently
    if (liveBetsBuffer.length < LIVE_BETS_MAX) {
      liveBetsBuffer.push(generateSimBet());
    } else {
      // Replace oldest entry (shift + push)
      liveBetsBuffer.shift();
      liveBetsBuffer.push(generateSimBet());
    }
    scheduleSimBet();
  }, delay);
}
// Pre-seed with 20 entries so feed is instantly populated on startup
for (let i = 0; i < 20; i++) {
  const entry = generateSimBet();
  // Spread timestamps over the last 5 minutes
  const ago = (20 - i) * 15 * 1000;
  entry.created_at = new Date(Date.now() - ago).toISOString();
  liveBetsBuffer.push(entry);
}
scheduleSimBet();
// ─────────────────────────────────────────────────────────────────────────────

// ── Cache para top-bets (todos los clientes ven los mismos datos) ─────────────
let topBetsCache: { bigWins: unknown[]; luckyBets: unknown[] } | null = null;
let topBetsCacheAt = 0;
const TOP_BETS_CACHE_TTL = 300_000; // 5 minutos — reduce carga en DB

// GET /api/top-bets — top Big Wins and Lucky Bets from DB + buffer (public)
router.get("/top-bets", async (_req: Request, res: Response) => {
  // Servir desde cache si no expiró — todos los dispositivos ven los mismos datos
  if (topBetsCache && Date.now() - topBetsCacheAt < TOP_BETS_CACHE_TTL) {
    return res.json(topBetsCache);
  }

  const TOP_N = 20;
  const MAX_USER_ENTRIES = 2; // max rows per username so one user doesn't dominate

  // ── Currencies to rotate through ─────────────────────────────────────────
  const DISPLAY_CURRENCIES = ["USDT","BTC","ETH","BNB","SOL","LTC","TRX","USDC"];

  // Deterministic "random" based on a string seed (stable across requests)
  const seededRand = (seed: string, salt = 0): number => {
    let h = salt;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(h ^ seed.charCodeAt(i), 0x9e3779b9);
      h ^= h >>> 16;
    }
    return ((h >>> 0) / 0xffffffff);
  };

  // Cap payout to a natural-looking distribution:
  //   ~55% → 200–1200  |  ~30% → 1200–2500  |  ~12% → 2500–4000  |  ~3% → 4000–5200
  const naturalCap = (payout: number, seed: string): number => {
    if (payout <= 1200) return payout; // small wins untouched
    const r = seededRand(seed);
    let cap: number;
    if (r < 0.55)       cap = 200  + seededRand(seed, 1) * 1000;   // 200–1200
    else if (r < 0.85)  cap = 1200 + seededRand(seed, 2) * 1300;   // 1200–2500
    else if (r < 0.97)  cap = 2500 + seededRand(seed, 3) * 1500;   // 2500–4000
    else                cap = 4000 + seededRand(seed, 4) * 1200;   // 4000–5200
    return parseFloat(Math.min(payout, cap).toFixed(2));
  };

  // Pick a display currency (stable per entry, varied across the list)
  const pickCurrency = (dbCurrency: string | undefined, seed: string): string => {
    if (dbCurrency && dbCurrency !== "USD" && dbCurrency !== "USDT") return dbCurrency;
    const idx = Math.floor(seededRand(seed, 7) * DISPLAY_CURRENCIES.length);
    return DISPLAY_CURRENCIES[idx];
  };

  // Helper: convert a buffer entry to the wire format
  const bufToWire = (b: LiveBetEntry) => {
    const seed = `${b.username}_${b.game}_${b.created_at}`;
    const dispPayout = naturalCap(b.payout_usd, seed);
    const dispBet    = Math.min(b.bet_usd, dispPayout - 0.01);
    const mult       = dispBet > 0 ? parseFloat((dispPayout / dispBet).toFixed(2)) : 1;
    return {
      username: b.username, game: b.game,
      bet_usd: dispBet, payout_usd: dispPayout,
      multiplier: mult, win: true,
      created_at: b.created_at,
      currency: pickCurrency(b.currency, seed),
    };
  };

  // ── 1. Query game_bets for real wins ──────────────────────────────────────
  let bigWins:   ReturnType<typeof bufToWire>[] = [];
  let luckyBets: ReturnType<typeof bufToWire>[] = [];

  try {
    const res2 = await sbAdmin(
      `game_bets?select=username,game,bet_usd,payout_usd,currency,created_at` +
      `&payout_usd=gt.0&order=created_at.desc&limit=2000`,
    );
    if (res2.ok) {
      const rows: Array<{
        username: string; game: string; bet_usd: number;
        payout_usd: number; currency?: string; created_at: string;
      }> = await res2.json();

      // Only real wins (payout > bet), excluding hidden users
      const wins = rows
        .filter(r => !HIDDEN_FROM_BETS.has(r.username.toLowerCase()))
        .filter(r => Number(r.payout_usd) > Number(r.bet_usd))
        .map(r => {
          const seed = `${r.username}_${r.game}_${r.created_at}`;
          const rawPayout = Number(r.payout_usd);
          const rawBet    = Number(r.bet_usd);
          const dispPayout = naturalCap(rawPayout, seed);
          const dispBet    = Math.min(rawBet, dispPayout - 0.01);
          const mult       = dispBet > 0 ? parseFloat((dispPayout / dispBet).toFixed(2)) : 1;
          return {
            username: r.username, game: r.game,
            bet_usd: dispBet, payout_usd: dispPayout,
            multiplier: mult, win: true as const,
            created_at: r.created_at,
            currency: pickCurrency(r.currency, seed),
          };
        });

      // Deduplicate: max MAX_USER_ENTRIES per username
      const dedup = (list: typeof wins) => {
        const counts: Record<string, number> = {};
        const out: typeof wins = [];
        for (const w of list) {
          const c = (counts[w.username] ?? 0);
          if (c < MAX_USER_ENTRIES) { counts[w.username] = c + 1; out.push(w); }
          if (out.length >= TOP_N) break;
        }
        return out;
      };

      bigWins  = dedup([...wins].sort((a, b) => (b.payout_usd - b.bet_usd) - (a.payout_usd - a.bet_usd)));
      luckyBets = dedup([...wins].sort((a, b) => b.multiplier - a.multiplier));
    }
  } catch (e: any) {
    console.warn("[top-bets] DB query failed:", e.message);
    // Si hay caché viejo, servir eso en vez de regenerar con datos falsos
    if (topBetsCache) {
      topBetsCacheAt = Date.now(); // extender TTL para no volver a intentar enseguida
      return res.json(topBetsCache);
    }
  }

  // ── 2. Pad con apuestas determinísticas (semilla diaria) si faltan entradas ──
  // Genera exactamente los mismos datos para todos los clientes el mismo día.
  // NO usa Math.random() — cada entrada es estable por nombre+día.
  if (bigWins.length < TOP_N || luckyBets.length < TOP_N) {
    const ALL_FAKE_USERS = [
      // Argentinos
      "matiaslots","luchitox","fedeplay","tincho77","nicobets","franito","tomiwin",
      "facuplay","agusito","dieguito","pablitoo","ramiroo","joaquin77","leanbets",
      "gonzaa","maxiwins","tobiasx","brunito","kevo23","rodriwin","marquitos",
      "enzoo","ivansito","gabywin","cristianr","dylancito","juancito","santii",
      "julianr","hernancito","oscarsito","carlitoss","andresito","miguelito",
      "javierin","victorx","danielr","richar","ferchu","sergito","walterin",
      "gustiwin","eduardito","luisito","raulito","maty77","lucasss","fran22",
      "nico77","tomi23","facu99","agus10","gonza21","lean98","maxi07","tobi22",
      "bruno23","kevin17","rodri10","marcos21","enzo91","ivan22","gabi10",
      "cristian23","dylan07","joaco99","lauta10","rami22","dami23","alex77",
      "adri21","tobi98","juli10","lucho77","slotero","ruletin","cartitas",
      "casinero","girito","suertudo","tirador","apuestin","spinero","ruletazo",
      "tragamon","winito","suertin","jugadita","platinero","doblete","luckito",
      "winwin","betitoo","slotin","fichitas","tiradita","platinito","suertetaa",
      "xLuchoX","matiux","nicozz","frannn","tomiux","facux","aguszz","leanz",
      "gonzita","maxii","tobita","brunox","kevito","rodrix","marqui","enzito",
      "ivancito","gabito","dylanz","joaquinn","lautii","ramirox","damianx",
      "alexito","adrianoo","julito","luchitoo","randomnico","elgonzita","matute",
      "tinchoide","facundito","agustinok","leanmart","gonzalito","maximil",
      "tobiasr","brunelli","kevind","rodrigox","marcosss","enzooo","ivand",
      "gabrielx","dylannn","joaquind","lautaron","ramirito","damianok","alexanderx",
      "adrianok","julianok","luchok",
      // Ingleses
      "mikeplays","johnnyo","alexx","davey","chrisp","kevinx","ryanb","nickster",
      "joshy","tylerr","ethanx","noahh","liamx","aidenn","logann","lucasx",
      "jackk","owenr","lukee","dylann","connorx","carterr","wyattx","asherx",
      "hunterr","coltonn","braydenx","jaxonr","blakex","ryderr","zachh","seanr",
      "kylee","adamx","brianr","ericc","justinn","aaronx","tysonr","trevorx",
      "codyy","deann","jessex","brandonr","shawnn","derekx","garrett","tannerx",
      "colbyy","prestonn","parkerx","holdenn","griffinr","bennettx","elliott",
      "spencerx","brockk","daltonn","travisx","coreyy","randyx","bradyy","caseyx",
      "devonn","jaydenx","kaydenn","landenx","haydenn","westonn","eastonn","masonx",
      "logan77","mike22","johnny7","alex99","dave23","chris88","ryan21","nick33",
      "josh10","tyler77","ethan22","noah19","liam23","aiden77","logan21","lucas22",
      "jack10","owen23","luke77","dylan21","connor22","carter10","wyatt23","asher77",
      "hunter21","colton22","blake10","ryder23","zach77","sean21","kyle22","adam10",
      "brian23","eric77","justin21","aaron22","tyson10","trevor23","cody77","jesse21",
      "brandon22","shawn10","derek23","garrett77","tanner21","colby22","preston10",
      "parker23","holden77","griffin21","bennett22","elliott10","spencer23","brock77",
      "dalton21","travis22","corey10","randy23","brady77","casey21","devon22",
      "jayden10","kayden23","landen77","hayden21","weston22","mason10",
      "mikeyyy","johnnny","davexx","chrisxo","kevvy","ryano","nickkk","joshxo",
    ];
    const FAKE_GAMES = ["Dice","Plinko","Keno","Blackjack","Mines","Hilo","Roulette","Baccarat"];
    const FAKE_COINS = ["USDT","BTC","ETH","BNB","SOL","LTC","TRX","USDC"];
    // Semilla fija para siempre — los bots no cambian nunca
    // Solo los usuarios reales que ganen más aparecen por encima
    const FIXED_SEED = "manderbet_v1_static";

    const genEntry = (idx: number) => {
      const seed  = `${FIXED_SEED}_${idx}`;
      const sr    = (salt: number) => seededRand(seed, salt);
      const userIdx = Math.floor(sr(0) * ALL_FAKE_USERS.length);
      const gameIdx = Math.floor(sr(1) * FAKE_GAMES.length);
      const coinIdx = Math.floor(sr(2) * FAKE_COINS.length);
      const username = ALL_FAKE_USERS[userIdx];
      const game     = FAKE_GAMES[gameIdx];
      const currency = FAKE_COINS[coinIdx];
      const bet_usd  = parseFloat((0.5 + sr(3) * 30).toFixed(2));
      // Pick multiplier respetando reglas de cada juego
      const r = sr(4);
      let mult: number;
      if (game === "Baccarat") {
        // Solo Player 2x, Banker 1.94x, Tie 9x
        mult = r < 0.44 ? 2.00 : r < 0.89 ? 1.94 : 9.00;
      } else if (game === "Blackjack") {
        // Normal 2x o Blackjack natural 2.5x
        mult = r < 0.85 ? 2.00 : 2.50;
      } else {
        if (r < 0.55)       mult = 1.05 + sr(5) * 0.95;
        else if (r < 0.85)  mult = 2    + sr(5) * 8;
        else                mult = 10   + sr(5) * 40;
      }
      mult = parseFloat(mult.toFixed(2));
      const payout_usd = parseFloat(Math.min(bet_usd * mult, 3000).toFixed(2));
      // Spread timestamps across past 24 h
      const created_at = new Date(Date.now() - Math.floor(sr(6) * 86_400_000)).toISOString();
      return { username, game, bet_usd, payout_usd, multiplier: mult, win: true as const, created_at, currency };
    };

    // Generate a stable pool of 60 fake entries for this day
    const fakePool = Array.from({ length: 60 }, (_, i) => genEntry(i));
    const existingUsersBW = new Set(bigWins.map(b => b.username));
    const existingUsersLB = new Set(luckyBets.map(b => b.username));

    if (bigWins.length < TOP_N) {
      const padded = [...fakePool]
        .sort((a, b) => (b.payout_usd - b.bet_usd) - (a.payout_usd - a.bet_usd))
        .filter(b => !existingUsersBW.has(b.username))
        .slice(0, TOP_N - bigWins.length);
      bigWins = [...bigWins, ...padded]
        .sort((a, b) => (b.payout_usd - b.bet_usd) - (a.payout_usd - a.bet_usd));
    }
    if (luckyBets.length < TOP_N) {
      const padded = [...fakePool]
        .sort((a, b) => b.multiplier - a.multiplier)
        .filter(b => !existingUsersLB.has(b.username))
        .slice(0, TOP_N - luckyBets.length);
      luckyBets = [...luckyBets, ...padded]
        .sort((a, b) => b.multiplier - a.multiplier);
    }
  }

  // Guardar en cache para que todos los clientes vean los mismos datos
  topBetsCache = { bigWins, luckyBets };
  topBetsCacheAt = Date.now();

  res.json(topBetsCache);
});

// GET /api/live-bets — public, no auth required
router.get("/live-bets", async (_req: Request, res: Response) => {
  // Return buffer newest-first (reverse insertion order).
  // If the buffer has fewer than 20 real entries, pad with recent rows from game_bets so
  // users always see real bets from all players, not just simulated ones.
  const bufferEntries = liveBetsBuffer.slice().reverse();

  // Count real (non-simulated) bets already in the buffer
  const realInBuffer = bufferEntries.filter(b => !b.username.startsWith("player_")).length;

  let dbRows: LiveBetEntry[] = [];
  if (realInBuffer < 20) {
    try {
      const dbRes = await sbAdmin(
        `game_bets?select=username,game,bet_usd,payout_usd,currency,created_at` +
        `&order=created_at.desc&limit=80`,
        { headers: { Prefer: "count=none" } },
      );
      if (dbRes.ok) {
        const rows: Array<{ username:string; game:string; bet_usd:number; payout_usd:number; currency?:string; created_at:string }> = await dbRes.json();
        const bufKeys = new Set(bufferEntries.map(b => `${b.username}_${b.created_at}`));
        dbRows = rows
          .filter(r => !HIDDEN_FROM_BETS.has(r.username.toLowerCase()))
          .filter(r => !bufKeys.has(`${r.username}_${r.created_at}`))
          .map(r => ({
            username:   r.username,
            game:       r.game,
            bet_usd:    Number(r.bet_usd),
            payout_usd: Number(r.payout_usd),
            multiplier: Number(r.bet_usd) > 0 ? parseFloat((Number(r.payout_usd) / Number(r.bet_usd)).toFixed(2)) : 1,
            win:        Number(r.payout_usd) > Number(r.bet_usd),
            created_at: r.created_at,
            currency:   r.currency ?? "USDT",
          }));
      }
    } catch { /* non-fatal */ }
  }

  // Merge buffer + DB rows, deduplicate, sort newest-first (excluir usuarios ocultos)
  const seen = new Set<string>();
  const merged = [...bufferEntries, ...dbRows].filter(b => {
    if (HIDDEN_FROM_BETS.has(b.username.toLowerCase())) return false;
    const k = `${b.username}_${b.created_at}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 120);

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.json({ bets: merged });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bet-result
// Registra el resultado de una apuesta. game_bets es la única fuente de verdad
// para NGR. affiliate_referrals.wager_amount se mantiene solo como cache de display.
// Body: { bet_usd, payout_usd, game, currency?, bonus_usd?, is_demo? }
// No crítico — nunca rompe el juego, siempre responde { ok: true }.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/bet-result", requireAuth, async (req: Request, res: Response) => {
  const {
    bet_usd,
    payout_usd  = 0,
    bonus_usd   = 0,
    game        = "casino",
    currency    = "USD",
    is_demo     = false,
    request_id,   // REQUIRED: caller-supplied UUID; prevents double balance delta on retry
  } = req.body ?? {};

  // ── request_id is mandatory ───────────────────────────────────────────────
  if (!request_id || typeof request_id !== "string" || request_id.length < 1 || request_id.length > 100) {
    return res.status(400).json({ ok: false, error: "request_id is required (unique string, max 100 chars)." });
  }

  if (typeof bet_usd !== "number" || bet_usd <= 0) {
    return res.json({ ok: true, skip: "invalid_amount" });
  }

  const username = req.authUser!.user_metadata?.username;
  if (!username) return res.json({ ok: true, skip: "no_username" });

  // ── Idempotency gate (fail-closed) ───────────────────────────────────────
  // Prevents double balance delta + double audit row on network retry.
  // Fail-open: si el RPC try_idempotency no existe en Supabase, continúa igualmente.
  try {
    const idem = await tryIdempotency(`bet:${req.authUser!.id}:${request_id}`, req.authUser!.id);
    if (idem.isDuplicate) {
      return res.json({ ok: true, duplicate: true });
    }
  } catch (e: any) {
    console.warn("[bet-result] idempotency check unavailable (fail-open):", e.message);
  }

  // Always push to live feed buffer (all users, regardless of referrer)
  const win = payout_usd > bet_usd;
  const gameStr = String(game).slice(0, 50);

  // Dedup: skip if same username+game already in last 8 entries (within 45 s)
  const cutoff = Date.now() - 45_000;
  const recentDup = liveBetsBuffer.slice(-8).some(
    b => b.username === username && b.game === gameStr && new Date(b.created_at).getTime() > cutoff
  );
  if (!recentDup && !HIDDEN_FROM_BETS.has(username.toLowerCase())) {
    // Cap large wins at a jittered limit so the feed looks natural (2200–2800)
    const jitteredCap = 2200 + Math.floor(Math.random() * 601);
    const displayPayout = win && payout_usd > jitteredCap ? parseFloat(jitteredCap.toFixed(2)) : payout_usd;
    const multiplier = win && bet_usd > 0 ? parseFloat((displayPayout / bet_usd).toFixed(2)) : 0;
    liveBetsBuffer.push({ username, game: gameStr, bet_usd, payout_usd: displayPayout, multiplier, win, created_at: new Date().toISOString(), currency: randomLiveCurrency() });
    if (liveBetsBuffer.length > LIVE_BETS_MAX) liveBetsBuffer.shift();
  }

  try {
    // 1. Fetch: referrer status + mander_id + wagered total from game_bets (profile_stats table unused)
    const userId = req.authUser!.id;
    const [refRes, profRes, statsRes] = await Promise.all([
      sbAdmin(
        `affiliate_referrals?referred_username=ilike.${encodeURIComponent(username)}&select=id,wager_amount&limit=1`,
        { headers: { Prefer: "count=none" } }
      ),
      sbAdmin(
        `profiles?username=ilike.${encodeURIComponent(username)}&select=mander_id&limit=1`,
        { headers: { Prefer: "count=none" } }
      ),
      // Sum game_bets directly — profile_stats is an empty table, not a live view
      sbAdmin(
        `game_bets?username=ilike.${encodeURIComponent(username)}&select=bet_usd&limit=100000`,
        { headers: { Prefer: "count=none" } }
      ),
    ]);
    const refRows: any[]   = refRes.ok   ? await refRes.json()   : [];
    const profRows: any[]  = profRes.ok  ? await profRes.json()  : [];
    const betRows: { bet_usd: number }[] = statsRes.ok ? await statsRes.json() : [];
    const hasReferrer  = refRows.length > 0;
    const mander_id: string | undefined = profRows[0]?.mander_id;
    const wageredTotal = betRows.reduce((s, r) => s + Math.abs(Number(r.bet_usd || 0)), 0);

    const isDemoBet = is_demo === true;

    // 2. Atomic balance credit (fire-and-forget — must not block the response)
    if (mander_id && !isDemoBet) {
      const deltaUsd = parseFloat(Number(payout_usd || 0).toFixed(6)) - parseFloat(Number(bet_usd).toFixed(6));
      const cur      = String(currency || "USDT").trim().toUpperCase();
      console.log(`[BET-RESULT] user_id=${userId} mander_id=${mander_id} username=${username} game=${game} bet=${bet_usd} payout=${payout_usd} delta=${deltaUsd} currency=${cur}`);
      creditBalanceAtomic(mander_id, cur, deltaUsd, userId).catch((e: any) =>
        console.warn("[bet-result] creditBalanceAtomic failed:", e.message)
      );
    } else if (mander_id && isDemoBet) {
      console.log(`[BET-RESULT] demo user_id=${userId} mander_id=${mander_id} username=${username} game=${game} bet=${bet_usd} payout=${payout_usd} — real balance unchanged`);
    }

    // 3. game_bets insert — awaited so the post-insert sum (step 6) includes this row
    const betRow = {
      username,
      game:       String(game).slice(0, 50),
      currency:   String(currency || "USD").slice(0, 10),
      bet_usd:    parseFloat(Number(bet_usd).toFixed(6)),
      payout_usd: parseFloat(Number(payout_usd || 0).toFixed(6)),
      bonus_usd:  parseFloat(Number(bonus_usd  || 0).toFixed(6)),
    };
    let betInserted = false;
    try {
      const insertRes = await sbAdmin("game_bets", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(betRow),
      });
      betInserted = insertRes.ok;
      if (!insertRes.ok) {
        const errBody = await insertRes.text().catch(() => "(unreadable)");
        console.warn("[bet-result] game_bets insert HTTP", insertRes.status, errBody);
      } else {
        console.log(`[bet-result] game_bets insert OK username=${username} bet=${bet_usd}`);
      }
    } catch (e: any) {
      console.warn("[bet-result] game_bets insert failed:", e.message);
    }

    // 4. Rakeback accumulation — awaited so pool balances are accurate in response
    // Formula: rakeback = bet * house_edge * vip_pct  (every bet, win or lose)
    if (mander_id && betInserted) {
      const rakebackPct = getRakebackPct(wageredTotal);
      const houseEdge   = getHouseEdge(game);
      try {
        await accumulateRakeback(userId, mander_id, Number(bet_usd), houseEdge, rakebackPct);
      } catch (e: any) {
        console.warn("[bet-result] accumulateRakeback failed:", e.message);
      }
    }

    // 5. Affiliate wager cache — fire-and-forget
    if (hasReferrer) {
      const ref = refRows[0];
      const newWager = parseFloat((parseFloat(ref.wager_amount || 0) + bet_usd).toFixed(6));
      sbAdmin(`affiliate_referrals?id=eq.${ref.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ wager_amount: newWager, updated_at: new Date().toISOString() }),
      }).catch(() => {});
    }

    // 6. Return updated stats so frontend can update without a second round-trip
    let updatedWagered = wageredTotal + Number(bet_usd); // fallback estimate (pre-insert sum + this bet)
    let updatedPools: { instant: number; instant_pending?: number; instant_accum?: number; weekly: number; monthly: number } = { instant: 0, instant_pending: 0, instant_accum: 0, weekly: 0, monthly: 0 };
    try {
      const [freshStatsRes, freshPools] = await Promise.all([
        // Re-read game_bets after insert — the new row is now included in the sum
        sbAdmin(`game_bets?username=ilike.${encodeURIComponent(username)}&select=bet_usd&limit=100000`, {
          headers: { Prefer: "count=none" },
        }),
        mander_id ? getRakebackPoolsSplit(userId) : Promise.resolve({ instant: 0, instant_pending: 0, instant_accum: 0, weekly: 0, monthly: 0 }),
      ]);
      if (freshStatsRes.ok) {
        const freshBets: { bet_usd: number }[] = await freshStatsRes.json();
        const freshSum = freshBets.reduce((s, r) => s + Math.abs(Number(r.bet_usd || 0)), 0);
        if (freshBets.length > 0) updatedWagered = freshSum;
      }
      updatedPools = freshPools;
    } catch (e: any) {
      console.warn("[bet-result] stats refresh failed:", e.message);
    }

    return res.json({
      ok: true,
      stats: {
        wagered_total: Math.round(updatedWagered * 100) / 100,
        rakeback: {
          instant:       Number(updatedPools.instant       ?? 0),
          instant_pending: Number((updatedPools as any).instant_pending ?? 0),
          instant_accum: Number((updatedPools as any).instant_accum ?? 0),
          weekly:        Number(updatedPools.weekly        ?? 0),
          monthly:       Number(updatedPools.monthly       ?? 0),
        },
      },
    });
  } catch (err: any) {
    console.error("[bet-result] error:", err.message);
    return res.json({ ok: true }); // no bloquear el juego
  }
});

// ── Sync local demo balance to server so admin panel shows current value ──────
router.post("/profile/sync-demo-balance", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).authUser?.id as string;
  const { current_balance } = req.body ?? {};
  if (typeof current_balance !== "number" || !Number.isFinite(current_balance) || current_balance < 0) {
    return res.status(400).json({ error: "current_balance must be a non-negative number" });
  }
  try {
    const authRes = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      headers: { apikey: SUPABASE_SERVICE_KEY!, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    if (!authRes.ok) return res.status(500).json({ error: "Failed to fetch user" });
    const authUser = await authRes.json();
    const currentMeta = authUser.app_metadata ?? {};
    const patchRes = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      headers: { apikey: SUPABASE_SERVICE_KEY!, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ app_metadata: { ...currentMeta, balance_demo_local: current_balance } }),
    });
    if (!patchRes.ok) return res.status(500).json({ error: "Failed to update demo balance" });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/my-bets — cursor-paginated bet history from game_bets
// Query params:
//   limit  — rows per page, default 50, max 100
//   cursor — ISO created_at of last item from previous page (exclusive upper bound)
// Response: { bets, nextCursor, gameSummary }
router.get("/my-bets", requireAuth, async (req: Request, res: Response) => {
  let username: string | undefined = req.authUser!.user_metadata?.username;
  if (!username) {
    const prof = await getProfile(req.authUser!.id).catch(() => null);
    username = prof?.username;
  }
  if (!username) return res.status(401).json({ error: "Unauthorized" });

  const limit  = Math.min(Math.max(1, parseInt(req.query.limit  as string) || 50), 100);
  const cursor = typeof req.query.cursor === "string" && req.query.cursor ? req.query.cursor : null;

  try {
    // Build PostgREST filter — cursor is exclusive (created_at strictly less than cursor value)
    let qs = `game_bets?select=bet_usd,payout_usd,game,created_at&username=ilike.${encodeURIComponent(username)}&order=created_at.desc&limit=${limit}`;
    if (cursor) qs += `&created_at=lt.${encodeURIComponent(cursor)}`;

    const r = await sbAdmin(qs, { method: "GET", headers: { Prefer: "count=none" } });
    if (!r.ok) return res.json({ bets: [], nextCursor: null, gameSummary: [] });
    const rows: any[] = await r.json();

    // Raw bets list
    const bets = rows.map((row: any) => {
      const amount     = parseFloat(row.bet_usd)    || 0;
      const winAmount  = parseFloat(row.payout_usd) || 0;
      const win        = winAmount > 0;
      const multiplier = amount > 0 && winAmount > 0 ? Math.round((winAmount / amount) * 100) / 100 : 0;
      return { amount, winAmount, win, multiplier, game: String(row.game || ""), createdAt: row.created_at };
    });

    // nextCursor: created_at of the last row, or null when no more pages
    const nextCursor: string | null = rows.length === limit ? (rows[rows.length - 1].created_at ?? null) : null;

    // Per-game summary from this page only
    const summaryMap: Record<string, { wagered: number; wins: number; losses: number; payout: number }> = {};
    for (const row of rows) {
      const g = String(row.game || "Unknown");
      if (!summaryMap[g]) summaryMap[g] = { wagered: 0, wins: 0, losses: 0, payout: 0 };
      const bet = parseFloat(row.bet_usd) || 0;
      const pay = parseFloat(row.payout_usd) || 0;
      summaryMap[g].wagered += bet;
      summaryMap[g].payout  += pay;
      if (pay > 0) summaryMap[g].wins++;
      else summaryMap[g].losses++;
    }
    const gameSummary = Object.entries(summaryMap).map(([game, s]) => ({ game, ...s }));

    return res.json({ bets, nextCursor, gameSummary });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/stats — estadísticas completas calculadas desde game_bets (fuente de verdad)
// Devuelve: total_wagered, total_won, total_bets, biggest_win, win_rate, game_summary, recent_bets
router.get("/stats", requireAuth, async (req: Request, res: Response) => {
  const username = req.authUser!.user_metadata?.username;
  if (!username) return res.status(401).json({ error: "Unauthorized" });

  try {
    const r = await sbAdmin(
      `game_bets?username=ilike.${encodeURIComponent(username)}&select=bet_usd,payout_usd,game,currency,created_at&order=created_at.desc&limit=5000`,
      { headers: { Prefer: "count=none" } },
    );
    if (!r.ok) return res.status(500).json({ error: "DB error" });
    const rows: any[] = await r.json();

    let totalWagered = 0;
    let totalWon     = 0;
    let biggestWin   = 0;
    let biggestWinBet = 0;
    let biggestWinGame = "";
    const gameSummary: Record<string, { wagered: number; won: number; bets: number; wins: number; losses: number }> = {};

    for (const row of rows) {
      const bet  = parseFloat(row.bet_usd)    || 0;
      const pay  = parseFloat(row.payout_usd) || 0;
      const g    = String(row.game || "Unknown");

      totalWagered += bet;
      totalWon     += pay;

      const profit = pay - bet;
      if (profit > biggestWin) {
        biggestWin     = profit;
        biggestWinBet  = bet;
        biggestWinGame = g;
      }

      if (!gameSummary[g]) gameSummary[g] = { wagered: 0, won: 0, bets: 0, wins: 0, losses: 0 };
      gameSummary[g].wagered += bet;
      gameSummary[g].won     += pay;
      gameSummary[g].bets    += 1;
      if (pay > bet) gameSummary[g].wins++;
      else           gameSummary[g].losses++;
    }

    const totalBets = rows.length;
    const wins      = rows.filter(r => parseFloat(r.payout_usd) > parseFloat(r.bet_usd)).length;
    const winRate   = totalBets > 0 ? Math.round((wins / totalBets) * 100) : 0;

    const gameSummaryArr = Object.entries(gameSummary)
      .map(([game, s]) => ({ game, ...s }))
      .sort((a, b) => b.wagered - a.wagered);

    // Recent bets (last 500 for the UI)
    const recentBets = rows.slice(0, 500).map(row => ({
      amount:    parseFloat(row.bet_usd)    || 0,
      winAmount: parseFloat(row.payout_usd) || 0,
      game:      String(row.game || ""),
      currency:  String(row.currency || "USDT"),
      createdAt: row.created_at,
    }));

    console.log(`[STATS] user=${username} total_bets=${totalBets} wagered=${totalWagered.toFixed(2)} won=${totalWon.toFixed(2)}`);

    return res.json({
      total_wagered:   Math.round(totalWagered   * 100) / 100,
      total_won:       Math.round(totalWon       * 100) / 100,
      total_bets:      totalBets,
      win_rate:        winRate,
      biggest_win:     Math.round(biggestWin     * 100) / 100,
      biggest_win_bet: Math.round(biggestWinBet  * 100) / 100,
      biggest_win_game: biggestWinGame,
      game_summary:    gameSummaryArr,
      recent_bets:     recentBets,
    });
  } catch (e: any) {
    console.error("[STATS] error:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

export default router;
