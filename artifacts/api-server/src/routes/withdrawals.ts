/**
 * withdrawals.ts
 *
 * Locked-balance flow:
 *   CREATE  → deduct from `balance`, add to `locked_amount`
 *   REJECT  → restore `balance`, clear `locked_amount`
 *   PAY     → clear `locked_amount` only (balance was already deducted on create)
 *             insert negative transaction for the record
 */

import { Router, Request, Response, NextFunction } from "express";
import { getPriceUsd } from "../lib/prices.js";
import { nextWithdrawalDisplayId } from "../lib/counters.js";
import { tryIdempotency } from "../lib/idempotency";
import { requireAuth } from "../lib/requireAuth";
import { lockFundsAtomic, unlockFundsAtomic, clearLockedAtomic } from "../lib/atomicBalance";
import { fetchWithTimeout } from "../lib/fetchWithTimeout";

const router = Router();

const SUPABASE_URL         = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const SUPABASE_ANON_KEY    = process.env.SUPABASE_ANON_KEY!;
const ADMIN_USERNAMES      = () =>
  (process.env.ADMIN_USERNAMES || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

// ── Supabase REST helper ──────────────────────────────────────────────────────

function sbAdmin(path: string, opts: RequestInit = {}) {
  return fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey:         SUPABASE_SERVICE_KEY,
      Authorization:  `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer:         "return=representation",
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
}

async function getProfile(userId: string) {
  const [profRes, authRes] = await Promise.all([
    sbAdmin(
      `profiles?id=eq.${encodeURIComponent(userId)}&select=id,mander_id,username,is_blocked&limit=1`,
      { headers: { Prefer: "count=none" } },
    ),
    fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    }),
  ]);
  if (!profRes.ok) return null;
  const rows: any[] = await profRes.json();
  const profile = rows[0] ?? null;
  if (!profile) return null;
  const authMeta = authRes.ok ? ((await authRes.json())?.app_metadata ?? {}) : {};
  return {
    ...profile,
    balance_demo: Number(authMeta.balance_demo ?? 0),
    is_streamer:  !!authMeta.is_streamer,
  };
}

// ── Auth middlewares ──────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      authUser?: { id: string; email: string; user_metadata: Record<string, any> };
    }
  }
}

// requireAuth imported from ../lib/requireAuth — shared single-session middleware

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    const profile = await getProfile(req.authUser!.id).catch(() => null);
    if (!profile) return res.status(403).json({ error: "Perfil no encontrado." });
    if (!ADMIN_USERNAMES().includes(profile.username.toLowerCase()))
      return res.status(403).json({ error: "Acceso denegado." });
    next();
  });
}

// ── Balance row helpers ───────────────────────────────────────────────────────

interface BalanceRow {
  id: string;
  balance: number;
  locked_amount: number;
}

async function getBalanceRow(manderId: string, currency: string): Promise<BalanceRow | null> {
  const cur = currency.trim().toUpperCase();
  const r = await sbAdmin(
    `balances?mander_id=eq.${encodeURIComponent(manderId)}&currency=eq.${encodeURIComponent(cur)}&select=id,balance,locked_amount&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (!r.ok) return null;
  const rows: any[] = await r.json();
  if (!rows[0]) return null;
  return {
    id:            rows[0].id,
    balance:       Number(rows[0].balance       ?? 0),
    locked_amount: Number(rows[0].locked_amount ?? 0),
  };
}

type OpResult = { ok: true } | { ok: false; reason: string };

/**
 * LOCK: move `amount` from balance → locked_amount.
 *
 * PRODUCTION-SAFE: delegates to the `lock_funds_atomic` PostgreSQL RPC which
 * uses a single UPDATE statement with the check in the WHERE clause:
 *   UPDATE balances SET balance = balance - p_amount, locked_amount = locked_amount + p_amount
 *   WHERE mander_id = ? AND currency = ? AND balance >= p_amount
 * This eliminates the read-modify-write race condition in the previous implementation.
 */
async function lockFunds(manderId: string, currency: string, amount: number): Promise<OpResult> {
  const result = await lockFundsAtomic(manderId, currency, amount);
  if (!result.ok) {
    const reason = result.error === "insufficient_balance"
      ? `Balance insuficiente: ${result.available ?? "?"} disponibles, ${amount} requeridos.`
      : result.error === "row_not_found"
        ? "Fila de balance no encontrada."
        : `Error al bloquear fondos: ${result.error ?? "unknown"}`;
    return { ok: false, reason };
  }
  return { ok: true };
}

/**
 * UNLOCK: restore `amount` from locked_amount → balance (on reject).
 *
 * PRODUCTION-SAFE: delegates to `unlock_funds_atomic` PostgreSQL RPC.
 * Single UPDATE — clamps locked_amount to 0 if lower than amount (never fails).
 */
async function unlockFunds(manderId: string, currency: string, amount: number): Promise<OpResult> {
  const result = await unlockFundsAtomic(manderId, currency, amount);
  if (!result.ok) {
    return { ok: false, reason: `Error al restaurar balance: ${result.error ?? "unknown"}` };
  }
  return { ok: true };
}

/**
 * CLEAR LOCKED: remove `amount` from locked_amount only (on pay).
 * Balance was already deducted when the withdrawal was created.
 *
 * PRODUCTION-SAFE: delegates to `clear_locked_atomic` PostgreSQL RPC.
 * Single UPDATE with GREATEST(0, locked_amount - p_amount) — never negative.
 */
async function clearLocked(manderId: string, currency: string, amount: number): Promise<OpResult> {
  const result = await clearLockedAtomic(manderId, currency, amount);
  if (!result.ok) {
    return { ok: false, reason: `Error al limpiar locked_amount: ${result.error ?? "unknown"}` };
  }
  return { ok: true };
}

// ── Wallet format validation ──────────────────────────────────────────────────

const WALLET_RULES: Record<string, { pattern: RegExp; hint: string }> = {
  TRC20:   { pattern: /^T[A-Za-z1-9]{33}$/,         hint: "Dirección TRC20 inválida (debe empezar con T, 34 caracteres)." },
  ERC20:   { pattern: /^0x[0-9a-fA-F]{40}$/,         hint: "Dirección ERC20 inválida (debe empezar con 0x, 42 caracteres)." },
  BEP20:   { pattern: /^0x[0-9a-fA-F]{40}$/,         hint: "Dirección BEP20 inválida (debe empezar con 0x, 42 caracteres)." },
  BTC:     { pattern: /^(1|3|bc1)[A-Za-z0-9]{10,90}$/, hint: "Dirección BTC inválida." },
  SOL:     { pattern: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, hint: "Dirección Solana inválida (32-44 caracteres base58)." },
  LTC:     { pattern: /^(L|M|ltc1)[A-Za-z0-9]{10,90}$/, hint: "Dirección LTC inválida." },
  POLYGON: { pattern: /^0x[0-9a-fA-F]{40}$/,         hint: "Dirección Polygon inválida (debe empezar con 0x, 42 caracteres)." },
};

function validateWallet(wallet: string, network: string): string | null {
  const w = wallet.trim();
  if (!w)          return "La wallet no puede estar vacía.";
  if (w.length < 10) return "La wallet debe tener al menos 10 caracteres.";
  if (w.length > 200) return "La wallet es demasiado larga.";
  const rule = WALLET_RULES[network.trim().toUpperCase()];
  if (rule && !rule.pattern.test(w)) return rule.hint;
  return null;
}

// ── Withdrawal helper ─────────────────────────────────────────────────────────

async function fetchWithdrawal(id: string) {
  const r = await sbAdmin(
    `withdrawals?id=eq.${encodeURIComponent(id)}&select=id,user_id,mander_id,amount,currency,network,wallet,status,tx_hash&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (!r.ok) return null;
  const rows: any[] = await r.json();
  return rows[0] ?? null;
}

// ── Withdrawal fees per network (USD, deducted before sending) ───────────────
const WITHDRAW_FEES: Record<string, number> = {
  TRC20: 1, ERC20: 2, BEP20: 0.5, BTC: 3, SOL: 0.1,
  LTC: 0.5, TRX: 0.5,
};

// ── Plisio: casino currency/network → psys_cid ───────────────────────────────
const PLISIO_CURRENCY_W: Record<string, Record<string, string>> = {
  USDT: { TRC20: "USDT_TRX", BEP20: "USDT_BSC", ERC20: "USDT", SOL: "USDT_SOL" },
  USDC: { BEP20: "USDC_BSC", ERC20: "USDC", SOL: "USDC_SOL" },
  ETH:  { ERC20: "ETH" },
  BTC:  { BTC:   "BTC" },
  LTC:  { LTC:   "LTC" },
  TRX:  { TRC20: "TRX" },
  BNB:  { BEP20: "BNB" },
  SOL:  { SOL:   "SOL" },
};

// ── Call Plisio Withdraw API ──────────────────────────────────────────────────
async function callPlisioPayout(
  address: string,
  currency: string,
  network: string,
  amountCrypto: number,
  withdrawalId: string | number,
): Promise<{ ok: true; txnId: string } | { ok: false; error: string }> {
  const apiKey = process.env.PLISIO_SECRET_KEY;
  if (!apiKey) return { ok: false, error: "PLISIO_SECRET_KEY no configurada." };

  const psysCid = PLISIO_CURRENCY_W[currency]?.[network];
  if (!psysCid) return { ok: false, error: `Moneda no soportada para retiro: ${currency}/${network}` };

  const appUrl = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");
  const callbackUrl = appUrl ? `${appUrl}/api/webhooks/plisio` : undefined;

  const params = new URLSearchParams({
    api_key:      apiKey,
    psys_cid:     psysCid,
    to:           address,
    amount:       String(amountCrypto),
    fee_plan:     "normal",
    type:         "cash_out",
    order_number: String(withdrawalId),
    ...(callbackUrl ? { callback_url: callbackUrl } : {}),
  });

  console.log(`[Plisio payout] → ${psysCid} ${amountCrypto} → ${address} (withdrawal #${withdrawalId})`);

  const res = await fetch(`https://plisio.net/api/v1/operations/withdraw?${params.toString()}`);
  const data: any = await res.json();

  console.log(`[Plisio payout] ← status=${res.status}`, JSON.stringify(data));

  if (!res.ok || data?.status === "error") {
    const rawMessage = data?.message ?? data?.data?.message ?? `Plisio error ${res.status}`;
    if (String(rawMessage).toLowerCase().includes("invalid ip")) {
      return {
        ok: false,
        error: "Plisio rechazó la solicitud porque la IP del servidor no está autorizada en la cuenta/API de Plisio.",
      };
    }
    return { ok: false, error: rawMessage };
  }

  const txnId = data?.data?.txn_id ?? data?.txn_id ?? `plisio_${Date.now()}`;
  return { ok: true, txnId: String(txnId) };
}

async function patchWithdrawal(id: string, patch: Record<string, unknown>) {
  return sbAdmin(`withdrawals?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body:   JSON.stringify(patch),
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 0. GET /api/withdraw/my-withdrawals
//    - Returns the authenticated user's withdrawals (for polling)
// ═════════════════════════════════════════════════════════════════════════════

router.get("/withdraw/my-withdrawals", requireAuth, async (req: Request, res: Response) => {
  const userId = req.authUser!.id;
  const r = await sbAdmin(
    `withdrawals?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&select=id,amount,currency,network,wallet,status,tx_hash,created_at&limit=20`,
    { headers: { Prefer: "count=none" } },
  );
  if (!r.ok) {
    const err = await r.text();
    console.error("[WITHDRAW my-withdrawals] error:", err);
    return res.status(502).json({ error: "Error al obtener retiros." });
  }
  const rows: any[] = await r.json();
  // Filtrar hashes internos de Plisio — el jugador solo debe ver hashes reales de blockchain
  const clean = rows.map((w: any) => ({
    ...w,
    tx_hash: w.tx_hash && !String(w.tx_hash).startsWith("plisio_") ? w.tx_hash : null,
  }));
  return res.json({ withdrawals: clean });
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. POST /api/withdraw/create
//    - Validate wallet + amount + balance
//    - Lock funds: balance -= amount, locked_amount += amount
//    - Create withdrawal as "pending"
// ═════════════════════════════════════════════════════════════════════════════

router.post("/withdraw/create", requireAuth, async (req: Request, res: Response) => {
  const { amount, currency, network, wallet, request_id } = req.body;

  // ── request_id is mandatory ───────────────────────────────────────────────
  if (!request_id || typeof request_id !== "string" || request_id.length < 1 || request_id.length > 128) {
    return res.status(400).json({ error: "request_id is required (unique UUID per request, max 128 chars)." });
  }

  // DB-backed idempotency — fail-open si el RPC no existe todavía en Supabase
  try {
    const iKey = `wd:${req.authUser!.id}:${request_id}`;
    const idem = await tryIdempotency(iKey, req.authUser!.id);
    if (idem.isDuplicate) {
      console.warn(`[WITHDRAW create] duplicate request_id=${request_id} user=${req.authUser!.id}`);
      return res.status(409).json({ error: "Solicitud duplicada. Esta operación ya fue procesada.", code: "duplicate_request" });
    }
  } catch (e: any) {
    console.warn("[WITHDRAW create] idempotency check unavailable (fail-open):", e.message);
  }

  // Field presence
  if (!amount || !currency || !network || !wallet)
    return res.status(400).json({ error: "Campos requeridos: amount, currency, network, wallet." });

  // Wallet format
  const walletError = validateWallet(String(wallet), String(network));
  if (walletError) return res.status(400).json({ error: walletError });

  // Amount
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0)
    return res.status(400).json({ error: "El monto debe ser un número positivo." });
  if (parsed < 0.000001)
    return res.status(400).json({ error: "El monto mínimo de retiro es 0.000001." });

  // Profile
  const profile = await getProfile(req.authUser!.id).catch(() => null);
  if (!profile) return res.status(404).json({ error: "Perfil no encontrado." });

  // Block check
  if (profile.is_blocked === true) {
    console.warn(`[WITHDRAW create] BLOCKED user attempted withdrawal: ${profile.username}`);
    return res.status(403).json({ error: "Tu cuenta está suspendida temporalmente. Contactá al soporte." });
  }

  // Wagering requirement check (skip for streamers and admins)
  const adminUsernames = (process.env.ADMIN_USERNAMES || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const isAdmin = adminUsernames.includes((profile.username || "").toLowerCase());
  const isStreamer = !!profile.is_streamer;
  if (!isAdmin && !isStreamer) {
    try {
      const mid   = encodeURIComponent(profile.mander_id);
      const uname = encodeURIComponent(profile.username);
      const [txRes, betsRes] = await Promise.all([
        // Exclude type=bet — game rounds tracked in game_bets
        sbAdmin(`transactions?mander_id=eq.${mid}&type=neq.bet&select=type,amount,status&limit=5000`, { headers: { Prefer: "count=none" } }),
        // Wagered total from game_bets (source of truth)
        sbAdmin(`game_bets?username=eq.${uname}&select=bet_usd&limit=100000`, { headers: { Prefer: "count=none" } }),
      ]);
      if (txRes.ok && betsRes.ok) {
        const txRows: { type: string; amount: number; status: string }[] = await txRes.json();
        const betRows: { bet_usd: number }[] = await betsRes.json();
        const totalDeposit = txRows
          .filter(t => t.type === "deposit" && (t.status === "completed" || t.status === "confirmed"))
          .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
        const wageredTotal = betRows.reduce((s, b) => s + Math.abs(Number(b.bet_usd)), 0);
        const remaining = Math.max(0, +(totalDeposit * 2 - wageredTotal).toFixed(4));
        if (remaining > 0.01) {
          console.warn(`[WITHDRAW create] wagering not met: user=${profile.username} deposited=${totalDeposit.toFixed(2)} wagered=${wageredTotal.toFixed(2)} remaining=${remaining.toFixed(2)}`);
          return res.status(402).json({
            error: "wagering_required",
            wagered: +wageredTotal.toFixed(2),
            required: +( totalDeposit * 2).toFixed(2),
            remaining: +remaining.toFixed(2),
          });
        }
      }
    } catch (e: any) {
      console.warn("[WITHDRAW create] wagering check failed, allowing:", e.message);
    }
  }

  const cur = (currency as string).trim().toUpperCase();

  // Check no existing pending/approved withdrawal in this currency
  const existingR = await sbAdmin(
    `withdrawals?user_id=eq.${req.authUser!.id}&currency=eq.${cur}&status=in.(pending,approved)&select=id&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (existingR.ok) {
    const existing: any[] = await existingR.json();
    if (existing.length > 0)
      return res.status(400).json({
        error: "Ya tenés un retiro pendiente o aprobado en esta moneda. Esperá a que se procese antes de solicitar otro.",
      });
  }

  // Detect streamer attempting to withdraw demo balance
  const isStreamerWithdrawal = !!(profile.is_streamer && (profile.balance_demo ?? 0) > 0);

  // Lock funds (balance → locked_amount) — this validates balance internally
  const lockResult = await lockFunds(profile.mander_id, cur, parsed);
  if (!lockResult.ok) {
    console.warn(`[WITHDRAW create] lockFunds failed: ${lockResult.reason}`);
    if (isStreamerWithdrawal) {
      // Streamers can request withdrawal of demo balance — allow it through
      // without locking real funds. Admin panel will flag it for partners dept.
      console.log(`[WITHDRAW create] STREAMER_WITHDRAWAL detected: user=${profile.username} amount=${parsed} ${cur} demo_balance=${profile.balance_demo}`);
    } else {
      return res.status(400).json({ error: lockResult.reason });
    }
  }

  // Create withdrawal record (mander_id omitted — UUID column incompatible with hex IDs)
  const r = await sbAdmin("withdrawals", {
    method: "POST",
    body: JSON.stringify({
      user_id:  req.authUser!.id,
      amount:   parsed,
      currency: cur,
      network:  (network as string).trim(),
      wallet:   (wallet as string).trim(),
      status:   "pending",
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    console.error("[WITHDRAW create] Supabase insert error:", err);
    // Rollback: restore the locked funds
    const rollback = await unlockFunds(profile.mander_id, cur, parsed);
    if (!rollback.ok) {
      console.error(`[WITHDRAW create] ROLLBACK FAILED for mander_id=${profile.mander_id}: ${rollback.reason}`);
    }
    return res.status(500).json({ error: "Error al registrar el retiro. Los fondos fueron restaurados." });
  }

  const [row] = await r.json();
  console.log(
    `[WITHDRAW create] id=${row?.id} user=${profile.username} amount=${parsed} ${cur} | balance locked`,
  );

  // Also insert into `transactions` so the user sees it in their history
  let txDisplayId: number | null = null;
  let txHistoryRow: any = null;
  try {
    // Use the atomic in-memory counter (Node.js single-thread = no race conditions)
    txDisplayId = nextWithdrawalDisplayId();
    const txInsert = await sbAdmin("transactions", {
      method: "POST",
      body: JSON.stringify({
        mander_id:       profile.mander_id,
        user_id:         req.authUser!.id,
        display_id:      txDisplayId,
        type:            "withdrawal",
        amount:          parsed,
        currency:        cur,
        network:         (network as string).trim(),
        status:          "pending",
        external_tx_id:  (wallet as string).trim(),
        notes:           isStreamerWithdrawal ? "STREAMER_WITHDRAWAL" : null,
      }),
    });
    if (!txInsert.ok) {
      console.error("[WITHDRAW create] Failed to insert tx history row:", await txInsert.text());
    } else {
      const inserted = await txInsert.json().catch(() => []);
      txHistoryRow = Array.isArray(inserted) ? inserted[0] : inserted;
    }
    console.log(`[WITHDRAW create] tx history row inserted display_id=${txDisplayId}`);
  } catch (e) {
    console.error("[WITHDRAW create] Failed to insert tx history row:", e);
    // Non-fatal — withdrawal row is already created
  }

  // Deduct demo balance for streamer withdrawals
  if (isStreamerWithdrawal) {
    try {
      const amountUsd = parsed * getPriceUsd(cur);
      const authFetch = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(req.authUser!.id)}`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } },
      );
      if (authFetch.ok) {
        const authUser = await authFetch.json();
        const currentDemo = Number(authUser.app_metadata?.balance_demo ?? 0);
        const newDemo     = Math.max(0, currentDemo - amountUsd);
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(req.authUser!.id)}`, {
          method: "PUT",
          headers: {
            "Content-Type":  "application/json",
            apikey:          SUPABASE_SERVICE_KEY,
            Authorization:   `Bearer ${SUPABASE_SERVICE_KEY}`,
          },
          body: JSON.stringify({ app_metadata: { ...authUser.app_metadata, balance_demo: newDemo } }),
        });
        console.log(`[WITHDRAW create] STREAMER demo deducted: $${currentDemo.toFixed(2)} → $${newDemo.toFixed(2)} (−$${amountUsd.toFixed(2)})`);
      }
    } catch (e) {
      console.error("[WITHDRAW create] Failed to deduct streamer balance_demo:", e);
      // Non-fatal — withdrawal is already recorded
    }
  }

  return res.json({
    ok: true,
    withdrawal: row,
    transaction: txHistoryRow,
    transaction_id: txHistoryRow?.id ?? null,
    transaction_display_id: txDisplayId,
    message: `Retiro de ${parsed} ${cur} solicitado. Tu balance fue actualizado.`,
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. GET /api/admin/withdrawals
// ═════════════════════════════════════════════════════════════════════════════

router.get("/admin/withdrawals", requireAdmin, async (_req: Request, res: Response) => {
  const r = await sbAdmin(
    "withdrawals?order=created_at.desc&select=id,user_id,mander_id,amount,currency,network,wallet,status,tx_hash,created_at",
    { headers: { Prefer: "count=none" } },
  );
  if (!r.ok) {
    const err = await r.text();
    console.error("[WITHDRAW list] error:", err);
    return res.status(502).json({ error: "Error al obtener retiros.", detail: err });
  }

  const withdrawals: any[] = await r.json();
  if (!withdrawals.length) return res.json({ withdrawals: [] });

  const ids = [...new Set(withdrawals.map((w) => w.user_id).filter(Boolean))];
  // PostgREST in() filter for UUIDs — no surrounding quotes
  const idsParam = `(${ids.join(",")})`;

  // Join usernames and is_flagged
  let pr = await sbAdmin(`profiles?id=in.${idsParam}&select=id,username,is_flagged`, { headers: { Prefer: "count=none" } });
  if (!pr.ok) pr = await sbAdmin(`profiles?id=in.${idsParam}&select=id,username`, { headers: { Prefer: "count=none" } });
  let profileMap: Record<string, { username: string; is_flagged?: boolean }> = {};
  if (pr.ok) {
    const profiles: any[] = await pr.json();
    for (const p of profiles) profileMap[p.id] = { username: p.username, is_flagged: p.is_flagged ?? false };
  }

  // Fetch last deposit per user (confirmed or pending with amount>0)
  let lastDepositMap: Record<string, { amount: number; currency: string; created_at: string; status: string }> = {};
  const dr = await sbAdmin(
    `deposits?user_id=in.${idsParam}&amount=gt.0&order=created_at.desc&select=user_id,amount,currency,created_at,status&limit=200`,
    { headers: { Prefer: "count=none" } },
  );
  if (dr.ok) {
    const deps: any[] = await dr.json();
    // Keep only the most recent deposit per user (prefer confirmed over pending)
    const confirmedMap: Record<string, any> = {};
    const anyMap: Record<string, any> = {};
    for (const d of deps) {
      if (!anyMap[d.user_id]) anyMap[d.user_id] = d;
      if (d.status === "confirmed" && !confirmedMap[d.user_id]) confirmedMap[d.user_id] = d;
    }
    for (const uid of ids) {
      const d = confirmedMap[uid] ?? anyMap[uid];
      if (d) lastDepositMap[uid] = { amount: d.amount, currency: d.currency, created_at: d.created_at, status: d.status };
    }
  }

  // Fetch is_streamer flag from auth metadata for each user (one batch call)
  const isStreamerMap: Record<string, boolean> = {};
  try {
    const authRes = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    if (authRes.ok) {
      const authData = await authRes.json();
      const authUsers: any[] = authData.users ?? [];
      const idsSet = new Set(ids);
      for (const u of authUsers) {
        if (idsSet.has(u.id)) {
          isStreamerMap[u.id] = !!(u.app_metadata?.is_streamer);
        }
      }
    }
  } catch { /* non-fatal */ }

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  return res.json({
    withdrawals: withdrawals.map((w) => ({
      ...w,
      username:               profileMap[w.user_id]?.username ?? w.user_id,
      is_flagged:             profileMap[w.user_id]?.is_flagged ?? false,
      last_deposit:           lastDepositMap[w.user_id] ?? null,
      amount_usd:             parseFloat((w.amount * getPriceUsd(String(w.currency ?? "").trim().toUpperCase())).toFixed(4)),
      is_streamer_withdrawal: isStreamerMap[w.user_id] ?? false,
    })),
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. POST /api/admin/withdraw/approve
// ═════════════════════════════════════════════════════════════════════════════

router.post("/admin/withdraw/approve", requireAdmin, async (req: Request, res: Response) => {
  const { withdrawal_id } = req.body;
  if (!withdrawal_id) return res.status(400).json({ error: "withdrawal_id requerido." });

  const w = await fetchWithdrawal(withdrawal_id);
  if (!w)                     return res.status(404).json({ error: "Retiro no encontrado." });
  if (w.status === "paid")    return res.status(400).json({ error: "No se puede aprobar un retiro ya pagado." });
  if (w.status === "rejected") return res.status(400).json({ error: "No se puede aprobar un retiro rechazado." });
  if (w.status === "approved") return res.status(400).json({ error: "El retiro ya está aprobado." });

  const r = await patchWithdrawal(withdrawal_id, { status: "approved" });
  if (!r.ok) {
    console.error("[WITHDRAW approve] patch error:", await r.text());
    return res.status(500).json({ error: "Error al aprobar el retiro." });
  }

  console.log(`[WITHDRAW approve] id=${withdrawal_id}`);
  return res.json({ ok: true, message: "Retiro aprobado." });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. POST /api/admin/withdraw/reject
//    - Unlock funds: locked_amount → balance (restore to user)
// ═════════════════════════════════════════════════════════════════════════════

router.post("/admin/withdraw/reject", requireAdmin, async (req: Request, res: Response) => {
  const { withdrawal_id } = req.body;
  if (!withdrawal_id) return res.status(400).json({ error: "withdrawal_id requerido." });

  const w = await fetchWithdrawal(withdrawal_id);
  if (!w)                     return res.status(404).json({ error: "Retiro no encontrado." });
  if (w.status === "paid")    return res.status(400).json({ error: "No se puede rechazar un retiro ya pagado." });
  if (w.status === "rejected") return res.status(400).json({ error: "El retiro ya está rechazado." });

  // Resolve mander_id from withdrawal or fallback to profile lookup
  let mander_id: string = w.mander_id;
  if (!mander_id && w.user_id) {
    const profile = await getProfile(w.user_id).catch(() => null);
    if (profile?.mander_id) mander_id = profile.mander_id;
  }

  const { amount, currency } = w;
  const cur    = (currency as string).trim().toUpperCase();
  const parsed = Number(amount);

  // Detect streamer withdrawal by looking up the matching transaction record
  // (STREAMER_WITHDRAWAL flag is stored in the transactions table, not withdrawals)
  let isStreamerWithdrawal = false;
  if (w.user_id) {
    try {
      const txCheckRes = await sbAdmin(
        `transactions?user_id=eq.${encodeURIComponent(w.user_id)}&type=eq.withdrawal&notes=eq.STREAMER_WITHDRAWAL&currency=eq.${encodeURIComponent(cur)}&status=eq.pending&order=created_at.desc&limit=1`,
        { headers: { Prefer: "count=none" } },
      );
      if (txCheckRes.ok) {
        const txRows: any[] = await txCheckRes.json();
        isStreamerWithdrawal = txRows.length > 0;
      }
    } catch (e) {
      console.warn("[WITHDRAW reject] Could not check STREAMER_WITHDRAWAL flag:", e);
    }
  }

  let unlockResult = { ok: true, reason: "" };

  if (isStreamerWithdrawal && w.user_id) {
    // Restore balance_demo in Supabase Auth app_metadata
    try {
      const authRes = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/admin/users/${w.user_id}`, {
        headers: { apikey: SUPABASE_SERVICE_KEY!, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
      });
      if (authRes.ok) {
        const authUser = await authRes.json();
        const currentDemo = Number(authUser.app_metadata?.balance_demo ?? 0);
        // Convert withdrawal amount back to USD (streamer withdrawals are stored in coin native units)
        const coinPrice = getPriceUsd(cur);
        const restoredUsd = parsed * coinPrice;
        const newDemo = currentDemo + restoredUsd;
        const putRes = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/admin/users/${w.user_id}`, {
          method: "PUT",
          headers: { apikey: SUPABASE_SERVICE_KEY!, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ app_metadata: { ...authUser.app_metadata, balance_demo: newDemo, balance_demo_restored_ts: new Date().toISOString() } }),
        });
        if (putRes.ok) {
          console.log(`[WITHDRAW reject] STREAMER demo restored: ${currentDemo} + ${restoredUsd} = ${newDemo} | user=${w.user_id}`);
        } else {
          unlockResult = { ok: false, reason: "Error restoring streamer balance_demo" };
          console.error(`[WITHDRAW reject] Failed to restore streamer balance_demo: ${await putRes.text()}`);
        }
      } else {
        unlockResult = { ok: false, reason: "Error fetching auth user for streamer restore" };
      }
    } catch (e: any) {
      unlockResult = { ok: false, reason: e.message };
      console.error("[WITHDRAW reject] Exception restoring streamer balance_demo:", e);
    }
  } else {
    // Restore funds: locked_amount → balance (normal user)
    unlockResult = await unlockFunds(mander_id, cur, parsed);
    if (!unlockResult.ok) {
      console.error(`[WITHDRAW reject] unlockFunds failed: ${unlockResult.reason} — id=${withdrawal_id}`);
      console.error(`[WITHDRAW reject] MANUAL RECONCILIATION NEEDED: mander_id=${mander_id} amount=${parsed} ${cur}`);
    } else {
      console.log(`[WITHDRAW reject] unlocked ${parsed} ${cur} → balance | mander_id=${mander_id}`);
    }
  }

  const r = await patchWithdrawal(withdrawal_id, { status: "rejected" });
  if (!r.ok) {
    console.error("[WITHDRAW reject] patch error:", await r.text());
    return res.status(500).json({ error: "Error al rechazar el retiro." });
  }

  // Update the pending transaction record to cancelled
  try {
    const existingTxRes = await sbAdmin(
      `transactions?user_id=eq.${encodeURIComponent(w.user_id)}&type=eq.withdrawal&status=eq.pending&currency=eq.${encodeURIComponent(cur)}&order=created_at.desc&limit=1`,
      { headers: { Prefer: "count=none" } },
    );
    if (existingTxRes.ok) {
      const existingRows: any[] = await existingTxRes.json();
      if (existingRows.length > 0) {
        await sbAdmin(`transactions?id=eq.${existingRows[0].id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "failed",
            notes: "Retiro rechazado por administrador. Fondos restaurados al balance.",
            completed_at: new Date().toISOString(),
          }),
        });
        console.log(`[WITHDRAW reject] TX record updated to cancelled — tx_id=${existingRows[0].id}`);
      }
    }
  } catch (e) {
    console.error("[WITHDRAW reject] Failed to update tx record (non-fatal):", e);
  }

  console.log(`[WITHDRAW reject] id=${withdrawal_id}`);
  return res.json({
    ok: true,
    message: unlockResult.ok
      ? `Retiro rechazado. ${parsed} ${cur} restaurados al balance del usuario.`
      : "Retiro rechazado. (Nota: error al restaurar fondos — revisar manualmente)",
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. POST /api/admin/withdraw/pay
//    - Anti double-pay via conditional PATCH (only if status IN pending|approved)
//    - Clear locked_amount only (balance was already deducted at create time)
//    - Insert negative transaction record
// ═════════════════════════════════════════════════════════════════════════════

router.post("/admin/withdraw/pay", requireAdmin, async (req: Request, res: Response) => {
  // tx_hash is now optional — if not provided, NOWPayments auto-payout is attempted
  const { withdrawal_id, tx_hash } = req.body;
  if (!withdrawal_id) return res.status(400).json({ error: "withdrawal_id requerido." });

  // ── Step 1: Fresh fetch + status guard ───────────────────────────────────
  const w = await fetchWithdrawal(withdrawal_id);
  if (!w)                     return res.status(404).json({ error: "Retiro no encontrado." });
  if (w.status === "paid")       return res.status(400).json({ error: "DOBLE PAGO BLOQUEADO: Este retiro ya fue pagado." });
  if (w.status === "processing") return res.status(400).json({ error: "DOBLE PAGO BLOQUEADO: Este retiro ya está siendo procesado." });
  if (w.status === "rejected")   return res.status(400).json({ error: "No se puede pagar un retiro rechazado." });

  // Resolve mander_id from withdrawal or fallback to profile lookup
  const { amount, currency, user_id } = w;
  let mander_id: string = w.mander_id;
  if (!mander_id && user_id) {
    const profile = await getProfile(user_id).catch(() => null);
    if (profile?.mander_id) mander_id = profile.mander_id;
  }
  if (!mander_id) {
    console.error(`[WITHDRAW pay] Cannot resolve mander_id for user_id=${user_id} withdrawal=${withdrawal_id}`);
    return res.status(500).json({ error: "No se pudo resolver el perfil del usuario." });
  }
  const cur    = (currency as string).trim().toUpperCase();
  const parsed = Number(amount);

  if (!Number.isFinite(parsed) || parsed <= 0)
    return res.status(400).json({ error: "El monto del retiro es inválido." });

  // ── Step 2: Verify locked_amount covers the withdrawal ───────────────────
  const balRow = await getBalanceRow(mander_id, cur);
  if (balRow && balRow.locked_amount < parsed) {
    console.warn(
      `[WITHDRAW pay] locked_amount (${balRow.locked_amount}) < amount (${parsed}) — ` +
      `id=${withdrawal_id}. Proceeding anyway (balance was deducted at create time).`,
    );
    // Non-blocking: locked_amount may be 0 if column was added after withdrawal was created
  }

  // ── Step 2b: Auto-payout via Plisio (if no manual tx_hash provided) ──────
  let finalTxHash: string | null = (tx_hash as string | undefined)?.trim() || null;
  let autoPaid = false;

  if (!finalTxHash && w.wallet) {
    const netFee = WITHDRAW_FEES[w.network ?? ""] ?? 0;
    const sendAmount = Math.max(0, parsed - netFee);

    if (sendAmount <= 0) {
      return res.status(400).json({ error: `El monto (${parsed}) es menor que el fee de red ($${netFee}). No se puede enviar.` });
    }

    console.log(`[WITHDRAW pay] auto-payout → ${sendAmount} ${cur} to ${w.wallet} via ${w.network}`);
    const payoutResult = await callPlisioPayout(
      w.wallet, cur, w.network ?? "", sendAmount, withdrawal_id,
    );

    if (!payoutResult.ok) {
      console.error(`[WITHDRAW pay] Plisio payout failed: ${payoutResult.error}`);
      const ipHint = payoutResult.error.toLowerCase().includes("ip del servidor")
        ? "En Plisio tenés que desactivar la restricción de IP para la API o agregar la IP saliente del servidor a la lista permitida. El retiro queda aprobado/pending y no se marca como pagado."
        : "Verificá que la cuenta Plisio tiene saldo suficiente y que PLISIO_SECRET_KEY es correcta.";
      return res.status(502).json({
        error: `Error al enviar vía Plisio: ${payoutResult.error}`,
        hint: ipHint,
      });
    }

    finalTxHash = `plisio_${payoutResult.txnId}`;
    autoPaid = true;
    console.log(`[WITHDRAW pay] auto-payout OK → txn_id=${payoutResult.txnId}`);
  }

  // ── Step 3: Atomic claim — conditional PATCH (prevents double-pay race) ──
  const claimRes = await sbAdmin(
    `withdrawals?id=eq.${encodeURIComponent(withdrawal_id)}&status=in.(pending,approved,failed)`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "processing", tx_hash: finalTxHash }),
    },
  );

  if (!claimRes.ok) {
    const err = await claimRes.text();
    console.error("[WITHDRAW pay] conditional PATCH failed:", err);
    return res.status(500).json({ error: "Error al actualizar el estado del retiro." });
  }

  const claimed: any[] = await claimRes.json();
  if (!claimed.length) {
    console.warn(`[WITHDRAW pay] DOUBLE-PAY PREVENTED — id=${withdrawal_id} (concurrent update detected)`);
    return res.status(409).json({
      error: "DOBLE PAGO BLOQUEADO: El retiro ya fue procesado por otra operación simultánea.",
    });
  }

  console.log(`[WITHDRAW pay] status → processing | id=${withdrawal_id}`);

  // ── Step 4: Clear locked_amount (balance was already deducted at create) ─
  const clearResult = await clearLocked(mander_id, cur, parsed);
  if (!clearResult.ok) {
    console.error(
      `[WITHDRAW pay] clearLocked failed: ${clearResult.reason} — ` +
      `id=${withdrawal_id} mander_id=${mander_id} amount=${parsed} ${cur}. ` +
      `Withdrawal is PAID, locked_amount may need manual reconciliation.`,
    );
    // Non-fatal: the withdrawal is already paid and status set — don't revert
  } else {
    console.log(`[WITHDRAW pay] cleared locked_amount -${parsed} ${cur} | mander_id=${mander_id}`);
  }

  // ── Step 5: Update existing pending transaction or insert new one ─────────
  // autoPaid → "pending" (esperando confirmación blockchain via webhook)
  // manual   → "completed" (admin confirmó con tx_hash real)
  const txPatch = {
    status:        autoPaid ? "pending" : "completed",
    amount:        -Math.abs(parsed),
    notes:         autoPaid
      ? `Retiro enviado vía Plisio, esperando confirmación. TXN: ${finalTxHash ?? "—"}`
      : `Retiro pagado manualmente. TX: ${finalTxHash ?? "—"}`,
    completed_at:  autoPaid ? null : new Date().toISOString(),
    // external_tx_id intentionally NOT updated — keeps the original wallet address
  };

  // Try to find the existing pending withdrawal transaction for this user+currency
  const existingTxRes = await sbAdmin(
    `transactions?user_id=eq.${encodeURIComponent(user_id)}&type=eq.withdrawal&status=eq.pending&currency=eq.${encodeURIComponent(cur)}&order=created_at.desc&limit=1`,
    { headers: { Prefer: "count=none" } },
  );

  let txUpdated = false;
  if (existingTxRes.ok) {
    const existingRows: any[] = await existingTxRes.json();
    if (existingRows.length > 0) {
      const patchRes = await sbAdmin(`transactions?id=eq.${existingRows[0].id}`, {
        method: "PATCH",
        body:   JSON.stringify(txPatch),
      });
      if (patchRes.ok) {
        txUpdated = true;
        console.log(`[WITHDRAW pay] TX record updated (pending→completed) tx_id=${existingRows[0].id}`);
      } else {
        console.error(`[WITHDRAW pay] TX patch failed:`, await patchRes.text());
      }
    }
  }

  if (!txUpdated) {
    // Fallback: insert new completed transaction (no pending row found)
    const txRes = await sbAdmin("transactions", {
      method: "POST",
      body: JSON.stringify({
        user_id,
        mander_id,
        type:    "withdrawal",
        network: w.network ?? "",
        currency: cur,
        ...txPatch,
      }),
    });
    if (!txRes.ok) {
      console.error(`[WITHDRAW pay] TX insert failed (non-fatal) id=${withdrawal_id}:`, await txRes.text());
    } else {
      console.log(`[WITHDRAW pay] TX record inserted (new) — id=${withdrawal_id} amount=-${parsed} ${cur}`);
    }
  }

  return res.json({
    ok: true,
    message: autoPaid
      ? `Retiro enviado automáticamente. ${parsed} ${cur} enviados a la wallet del usuario vía Plisio.`
      : `Retiro marcado como pagado. ${parsed} ${cur} procesados.`,
    tx_hash: finalTxHash,
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/admin/withdraw/mark-paid  — mark a processing withdrawal as paid
// ═════════════════════════════════════════════════════════════════════════════
// ── Helper: buscar el hash real de blockchain en Plisio para un txn_id interno ─
async function fetchPlisioBlockchainHash(plisioTxnId: string): Promise<string | null> {
  const apiKey = process.env.PLISIO_SECRET_KEY;
  if (!apiKey || !plisioTxnId) return null;
  try {
    const r = await fetch(
      `https://plisio.net/api/v1/operations/${encodeURIComponent(plisioTxnId)}?api_key=${apiKey}`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!r.ok) return null;
    const data: any = await r.json();
    const rawHash =
      data?.data?.tx_id   ??
      data?.data?.txid    ??
      data?.data?.hash    ??
      data?.data?.tx_hash ??
      null;
    // Plisio puede devolver tx_id como array ["0x..."] o como string directo
    const hash: string | null = Array.isArray(rawHash) ? (rawHash[0] ?? null) : rawHash;
    if (hash && typeof hash === "string" && hash.length > 10 && !hash.startsWith("plisio_")) {
      console.log(`[fetchPlisioBlockchainHash] txn=${plisioTxnId} → hash=${hash}`);
      return hash;
    }
    console.log(`[fetchPlisioBlockchainHash] txn=${plisioTxnId} hash no disponible aún:`, JSON.stringify(data?.data ?? {}).slice(0, 200));
    return null;
  } catch (e: any) {
    console.warn(`[fetchPlisioBlockchainHash] error:`, e.message);
    return null;
  }
}

// Retry en background: si Plisio no tiene el hash todavía, sigue intentando cada 30s hasta 10 veces
async function retryHashInBackground(
  plisioTxnId: string,
  withdrawalId: string,
  transactionId: string | null,
) {
  const MAX_ATTEMPTS = 10;
  const DELAY_MS = 30_000;
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, DELAY_MS));
    console.log(`[retryHash] intento ${i}/${MAX_ATTEMPTS} para txn=${plisioTxnId}`);
    const hash = await fetchPlisioBlockchainHash(plisioTxnId);
    if (!hash) continue;
    // Actualizar withdrawals.tx_hash con el hash real
    await sbAdmin(`withdrawals?id=eq.${encodeURIComponent(withdrawalId)}`, {
      method: "PATCH",
      body: JSON.stringify({ tx_hash: hash }),
    }).catch(() => {});
    // Actualizar notes de la transaction si tenemos su ID
    if (transactionId) {
      await sbAdmin(`transactions?id=eq.${encodeURIComponent(transactionId)}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: `Retiro pagado. TX: ${hash}` }),
      }).catch(() => {});
    }
    console.log(`[retryHash] hash real guardado: ${hash} para withdrawal=${withdrawalId}`);
    return;
  }
  console.warn(`[retryHash] no se pudo obtener hash real después de ${MAX_ATTEMPTS} intentos para txn=${plisioTxnId}`);
}

router.post("/admin/withdraw/mark-paid", requireAdmin, async (req: Request, res: Response) => {
  const { withdrawal_id, tx_hash: manualHash } = req.body;
  if (!withdrawal_id) return res.status(400).json({ error: "withdrawal_id requerido." });

  // 1. Fetch current withdrawal to get stored plisio txn_id
  const getRes = await sbAdmin(
    `withdrawals?id=eq.${encodeURIComponent(withdrawal_id)}&status=in.(processing,approved)&select=*&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  const getRows: any[] = getRes.ok ? await getRes.json().catch(() => []) : [];
  if (!getRows.length) {
    return res.status(404).json({ error: "Retiro no encontrado o ya está pagado." });
  }
  const w = getRows[0];

  // 2. Resolve the real blockchain tx hash
  let realHash: string | null = manualHash?.trim() || null;
  let plisioTxnIdForRetry: string | null = null;

  if (!realHash) {
    const storedHash: string = w.tx_hash ?? "";
    if (storedHash.startsWith("plisio_")) {
      plisioTxnIdForRetry = storedHash.replace(/^plisio_/, "");
      realHash = await fetchPlisioBlockchainHash(plisioTxnIdForRetry);
    } else if (storedHash && !storedHash.startsWith("plisio_")) {
      realHash = storedHash;
    }
  }

  const finalHash = realHash ?? null;
  console.log(`[WITHDRAW mark-paid] id=${withdrawal_id} blockchain_hash=${finalHash ?? "(no disponible aún)"}`);

  // 3. Update withdrawal to "paid" + store real hash if already available
  const patchRes = await sbAdmin(
    `withdrawals?id=eq.${encodeURIComponent(withdrawal_id)}&status=in.(processing,approved)`,
    {
      method:  "PATCH",
      body:    JSON.stringify({ status: "paid", ...(finalHash ? { tx_hash: finalHash } : {}) }),
      headers: { Prefer: "return=representation" },
    },
  );
  if (!patchRes.ok) {
    return res.status(500).json({ error: "Error al actualizar el retiro." });
  }
  const rows: any[] = await patchRes.json().catch(() => []);
  if (!rows.length) {
    return res.status(404).json({ error: "Retiro no encontrado o ya está pagado (concurrent update)." });
  }

  const cur = String(w.currency ?? "").toUpperCase();

  // 4. Update matching pending transaction → completed with real hash in notes
  let savedTransactionId: string | null = null;
  if (w.user_id && cur) {
    const txFindRes = await sbAdmin(
      `transactions?user_id=eq.${encodeURIComponent(w.user_id)}&type=eq.withdrawal&status=eq.pending&currency=eq.${encodeURIComponent(cur)}&order=created_at.desc&limit=1`,
      { headers: { Prefer: "count=none" } },
    ).catch(() => null);
    if (txFindRes?.ok) {
      const txRows: any[] = await txFindRes.json().catch(() => []);
      if (txRows.length > 0) {
        savedTransactionId = txRows[0].id;
        await sbAdmin(`transactions?id=eq.${txRows[0].id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status:       "completed",
            notes:        finalHash
              ? `Retiro pagado. TX: ${finalHash}`
              : `Retiro marcado como pagado manualmente. TX: —`,
            completed_at: new Date().toISOString(),
          }),
        }).catch(() => {});
      }
    }

    // 5. Clear locked_amount
    await sbAdmin(
      `balances?user_id=eq.${encodeURIComponent(w.user_id)}&currency=eq.${encodeURIComponent(cur)}`,
      { method: "PATCH", body: JSON.stringify({ locked_amount: 0 }) },
    ).catch(() => {});
  }

  // 6. Si no tenemos hash aún pero tenemos un txnId de Plisio, iniciar retry en background
  if (!finalHash && plisioTxnIdForRetry) {
    console.log(`[WITHDRAW mark-paid] hash no disponible aún, iniciando retry en background para txn=${plisioTxnIdForRetry}`);
    retryHashInBackground(plisioTxnIdForRetry, withdrawal_id, savedTransactionId);
  }

  return res.json({
    ok: true,
    message: finalHash
      ? "Retiro marcado como pagado."
      : "Retiro marcado como pagado. El hash de blockchain se actualizará automáticamente en unos minutos.",
    tx_hash: finalHash,
  });
});

export default router;
