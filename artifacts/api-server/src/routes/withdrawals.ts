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
import { verifyGameToken } from "../lib/gameToken.js";
import { getPriceUsd } from "../lib/prices.js";

const router = Router();

const SUPABASE_URL         = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const SUPABASE_ANON_KEY    = process.env.SUPABASE_ANON_KEY!;
const ADMIN_USERNAMES      = () =>
  (process.env.ADMIN_USERNAMES || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

// ── Supabase REST helper ──────────────────────────────────────────────────────

function sbAdmin(path: string, opts: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
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
  const r = await sbAdmin(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=id,mander_id,username,is_blocked&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (!r.ok) return null;
  const rows: any[] = await r.json();
  return rows[0] ?? null;
}

// ── Auth middlewares ──────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      authUser?: { id: string; email: string; user_metadata: Record<string, any> };
    }
  }
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ error: "Sesión expirada o inválida." });
  const token = authHeader.slice(7);
  if (!token) return res.status(401).json({ error: "Sesión expirada o inválida." });

  // Game token (local accounts)
  try {
    const gameUser = verifyGameToken(token) as any;
    if (gameUser) {
      req.authUser = { id: gameUser.profileId, email: "", user_metadata: { username: gameUser.username } };
      return next();
    }
  } catch {}

  // Supabase JWT
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return res.status(401).json({ error: "Sesión expirada o inválida." });
    const u = await r.json();
    req.authUser = { id: u.id, email: u.email ?? "", user_metadata: u.user_metadata ?? {} };
    return next();
  } catch {
    return res.status(401).json({ error: "Sesión expirada o inválida." });
  }
}

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
 * Uses conditional PATCH filter (balance >= amount) for race-condition safety.
 */
async function lockFunds(manderId: string, currency: string, amount: number): Promise<OpResult> {
  const row = await getBalanceRow(manderId, currency);
  if (!row) return { ok: false, reason: "Fila de balance no encontrada." };

  if (row.balance < amount)
    return { ok: false, reason: `Balance insuficiente: ${row.balance} disponibles, ${amount} requeridos.` };

  const newBalance = parseFloat((row.balance - amount).toFixed(8));
  const newLocked  = parseFloat((row.locked_amount + amount).toFixed(8));

  if (newBalance < 0) return { ok: false, reason: "El nuevo balance quedaría negativo." };

  // Conditional PATCH: only succeeds if balance is still >= amount (race protection)
  const p = await sbAdmin(
    `balances?id=eq.${row.id}&balance=gte.${amount}`,
    {
      method: "PATCH",
      body:   JSON.stringify({ balance: newBalance, locked_amount: newLocked, updated_at: new Date().toISOString() }),
    },
  );
  if (!p.ok) return { ok: false, reason: "Error al actualizar balance (db error)." };

  const patched: any[] = await p.json();
  if (!patched.length)
    return { ok: false, reason: "Balance ya no es suficiente (condición de carrera detectada)." };

  return { ok: true };
}

/**
 * UNLOCK: restore `amount` from locked_amount → balance (on reject).
 */
async function unlockFunds(manderId: string, currency: string, amount: number): Promise<OpResult> {
  const row = await getBalanceRow(manderId, currency);
  if (!row) return { ok: false, reason: "Fila de balance no encontrada." };

  const currentLocked = row.locked_amount;
  if (currentLocked < amount)
    return { ok: false, reason: `locked_amount insuficiente: ${currentLocked} < ${amount}.` };

  const newBalance = parseFloat((row.balance + amount).toFixed(8));
  const newLocked  = parseFloat((currentLocked - amount).toFixed(8));

  const p = await sbAdmin(
    `balances?id=eq.${row.id}&locked_amount=gte.${amount}`,
    {
      method: "PATCH",
      body:   JSON.stringify({ balance: newBalance, locked_amount: newLocked, updated_at: new Date().toISOString() }),
    },
  );
  if (!p.ok) return { ok: false, reason: "Error al restaurar balance (db error)." };

  const patched: any[] = await p.json();
  if (!patched.length)
    return { ok: false, reason: "locked_amount cambió durante la operación (condición de carrera)." };

  return { ok: true };
}

/**
 * CLEAR LOCKED: remove `amount` from locked_amount only (on pay).
 * Balance was already deducted when the withdrawal was created.
 */
async function clearLocked(manderId: string, currency: string, amount: number): Promise<OpResult> {
  const row = await getBalanceRow(manderId, currency);
  if (!row) return { ok: false, reason: "Fila de balance no encontrada." };

  const newLocked = parseFloat((row.locked_amount - amount).toFixed(8));
  if (newLocked < 0) {
    console.warn(`[CLEAR LOCKED] locked_amount (${row.locked_amount}) < amount (${amount}) — clamping to 0`);
  }

  const safeNewLocked = Math.max(0, newLocked);
  const p = await sbAdmin(`balances?id=eq.${row.id}`, {
    method: "PATCH",
    body:   JSON.stringify({ locked_amount: safeNewLocked, updated_at: new Date().toISOString() }),
  });
  if (!p.ok) return { ok: false, reason: "Error al limpiar locked_amount (db error)." };

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
  USDC: { BEP20: "USDC_BSC", ERC20: "USDC" },
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
    return { ok: false, error: data?.message ?? data?.data?.message ?? `Plisio error ${res.status}` };
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
  const { amount, currency, network, wallet } = req.body;

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

  // Lock funds (balance → locked_amount) — this validates balance internally
  const lockResult = await lockFunds(profile.mander_id, cur, parsed);
  if (!lockResult.ok) {
    console.warn(`[WITHDRAW create] lockFunds failed: ${lockResult.reason}`);
    return res.status(400).json({ error: lockResult.reason });
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
  try {
    const TX_WITHDRAWAL_START = 2099;
    const dRes = await sbAdmin(
      `transactions?type=eq.withdrawal&display_id=not.is.null&select=display_id`,
      { headers: { Prefer: "count=none" } },
    );
    if (dRes.ok) {
      const dRows: { display_id: string }[] = await dRes.json();
      const ids = dRows
        .map((dr) => parseInt(dr.display_id, 10))
        .filter((n) => !isNaN(n) && n > TX_WITHDRAWAL_START && n < 1_000_000);
      txDisplayId = ids.length > 0 ? Math.max(...ids) + 1 : TX_WITHDRAWAL_START + 1;
    }
    await sbAdmin("transactions", {
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
        notes:           null,
      }),
    });
    console.log(`[WITHDRAW create] tx history row inserted display_id=${txDisplayId}`);
  } catch (e) {
    console.error("[WITHDRAW create] Failed to insert tx history row:", e);
    // Non-fatal — withdrawal row is already created
  }

  return res.json({
    ok: true,
    withdrawal: row,
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

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  return res.json({
    withdrawals: withdrawals.map((w) => ({
      ...w,
      username:          profileMap[w.user_id]?.username ?? w.user_id,
      is_flagged:        profileMap[w.user_id]?.is_flagged ?? false,
      last_deposit:      lastDepositMap[w.user_id] ?? null,
      amount_usd:        parseFloat((w.amount * getPriceUsd(String(w.currency ?? "").trim().toUpperCase())).toFixed(4)),
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

  // Restore funds: locked_amount → balance
  const unlockResult = await unlockFunds(mander_id, cur, parsed);
  if (!unlockResult.ok) {
    console.error(`[WITHDRAW reject] unlockFunds failed: ${unlockResult.reason} — id=${withdrawal_id}`);
    // Still mark as rejected even if unlock fails (log for manual reconciliation)
    console.error(`[WITHDRAW reject] MANUAL RECONCILIATION NEEDED: mander_id=${mander_id} amount=${parsed} ${cur}`);
  } else {
    console.log(`[WITHDRAW reject] unlocked ${parsed} ${cur} → balance | mander_id=${mander_id}`);
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
      return res.status(502).json({
        error: `Error al enviar vía Plisio: ${payoutResult.error}`,
        hint: "Verificá que la cuenta Plisio tiene saldo suficiente y que PLISIO_SECRET_KEY es correcta.",
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
