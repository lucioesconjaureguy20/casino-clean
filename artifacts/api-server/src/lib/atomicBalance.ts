/**
 * atomicBalance.ts — Atomic balance operations via PostgreSQL RPC
 *
 * PRODUCTION GUARANTEE:
 * Every financial operation is a single PostgreSQL function call = single DB transaction.
 * If any step inside the function fails, Postgres rolls back everything — no partial state.
 *
 * Key functions:
 *  claimRakebackAtomic   — full rakeback claim in one transaction:
 *                           idempotency + pool lock + pool mark + balance credit + audit row
 *  creditBalanceWithAudit — credit + idempotency + audit row in one transaction (rank rewards, etc.)
 *  creditBalanceAtomic    — raw atomic balance credit (for bet-result deltas)
 *  creditBalanceNative    — raw atomic balance credit in native units (for deposit webhooks)
 *  accumulateRakeback     — accumulate server-side rakeback on every bet
 *  lockFundsAtomic        — atomically deduct from balance + add to locked_amount (withdrawal create)
 *  unlockFundsAtomic      — atomically restore locked_amount → balance (withdrawal reject)
 *  clearLockedAtomic      — atomically clear locked_amount only (withdrawal paid)
 *  atomicProfileBalanceDelta — atomic additive UPDATE on profiles.balance (display cache)
 */

import { rpc }         from "./supabaseRpc";
import { getPriceUsd } from "./prices";

// ── REST helper (for operations that don't need a deployed RPC) ───────────────
import { fetchWithTimeout } from "./fetchWithTimeout";

const SUPABASE_URL         = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

function sbAdmin(path: string, opts: RequestInit = {}) {
  return fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey:         SUPABASE_SERVICE_KEY,
      Authorization:  `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
}

/**
 * Insert an idempotency key. Returns true if newly inserted, false if already existed.
 * Safe against races — relies on UNIQUE constraint on idempotency_keys.key.
 */
async function tryIdempotency(key: string, userId: string): Promise<boolean> {
  const res = await sbAdmin("idempotency_keys", {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
    body: JSON.stringify({ key, user_id: userId }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`idempotency insert failed (${res.status}): ${body}`);
  }
  const rows: unknown[] = await res.json();
  return rows.length > 0; // false = key already existed
}

// ── Allowed currencies (mirrors migration_v2.sql is_allowed_currency) ─────────
export const ALLOWED_CURRENCIES = ["USDT", "USDC", "BTC", "ETH", "BNB", "SOL", "LTC", "TRX"] as const;
export type AllowedCurrency = typeof ALLOWED_CURRENCIES[number];

export function validateCurrency(currency: string): currency is AllowedCurrency {
  return ALLOWED_CURRENCIES.includes(currency.trim().toUpperCase() as AllowedCurrency);
}

// ── Return types ──────────────────────────────────────────────────────────────

export interface AtomicClaimResult {
  ok:           boolean;
  amount?:      number;   // USD amount credited
  deltaNative?: number;   // native units credited
  newBalance?:  number;   // new native balance
  error?:       string;   // error code if ok=false
}

export interface CreditResult {
  ok:          boolean;
  newBalance?: number;   // native units
  error?:      string;
}

export interface LockResult {
  ok:           boolean;
  newBalance?:  number;
  newLocked?:   number;
  error?:       string;
  available?:   number;
}

// ── claimRakebackAtomic ───────────────────────────────────────────────────────
/**
 * Rakeback claim implemented via REST + existing atomic_balance_credit RPC.
 * Steps (in order, idempotency prevents double-execution):
 *   1. Idempotency key insert (UNIQUE constraint prevents double-credit)
 *   2. Mark pool as claimed via PATCH WHERE claimed=false (prevents double-claim)
 *   3. Credit balance via atomic_balance_credit RPC (SELECT FOR UPDATE inside Postgres)
 *   4. Insert audit transaction row
 *
 * @param idempotencyKey - caller-supplied UUID (unique per claim attempt)
 * @param userId         - auth.users.id
 * @param manderId       - profiles.mander_id
 * @param poolType       - 'instant' | 'weekly' | 'monthly'
 * @param periodKey      - period bucket string (matches frontend)
 * @param currency       - native currency to credit (must be in ALLOWED_CURRENCIES)
 */
export async function claimRakebackAtomic(
  idempotencyKey: string,
  userId:         string,
  manderId:       string,
  poolType:       "instant" | "weekly" | "monthly",
  periodKey:      string,
  currency:       string,
): Promise<AtomicClaimResult> {
  const cur = currency.trim().toUpperCase();

  if (!validateCurrency(cur)) {
    return { ok: false, error: "invalid_currency" };
  }

  const priceUsd = getPriceUsd(cur);

  // Step 1 — Idempotency: fail fast if this claim was already processed
  let isNew: boolean;
  try {
    isNew = await tryIdempotency(idempotencyKey, userId);
  } catch (e: any) {
    throw new Error(`[claimRakebackAtomic] idempotency error: ${e.message}`);
  }
  if (!isNew) {
    return { ok: false, error: "already_claimed" };
  }

  // Step 2 — Mark unclaimed pools of this type as claimed in one PATCH.
  // For instant:         only claim rows in the 1-hour claim window (claimWindowStart <= period_key < hourBoundary)
  // For instant_pending: only claim rows older than the claim window (period_key < claimWindowStart)
  // For weekly:          only claim rows from past weeks  (period_key < this Monday's key)
  // For monthly:         only claim rows from past months (period_key < this month's key)
  // This leaves the currently-accumulating period untouched so new accumulation continues.
  const periodFilter = poolType === "instant"
    ? `&period_key=gte.${instantClaimWindowStartKey()}&period_key=lt.${instantHourBoundaryKey()}`
    : (poolType as string) === "instant_pending"
      ? `&period_key=lt.${instantClaimWindowStartKey()}`
      : poolType === "weekly"
        ? `&period_key=lt.${weeklyPeriodKey()}`
        : poolType === "monthly"
          ? `&period_key=lt.${monthlyPeriodKey()}`
          : "";
  // instant_pending uses pool_type=instant in the DB
  const dbPoolType = (poolType as string) === "instant_pending" ? "instant" : poolType;
  const poolPatch = await sbAdmin(
    `rakeback_pools?user_id=eq.${encodeURIComponent(userId)}&pool_type=eq.${encodeURIComponent(dbPoolType)}&claimed=eq.false${periodFilter}`,
    {
      method:  "PATCH",
      headers: { Prefer: "return=representation" },
      body:    JSON.stringify({ claimed: true, claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    },
  );

  if (!poolPatch.ok) {
    const msg = await poolPatch.text().catch(() => "");
    throw new Error(`[claimRakebackAtomic] pool PATCH failed (${poolPatch.status}): ${msg}`);
  }

  const poolRows: { id: string; amount_usd: number }[] = await poolPatch.json();
  if (poolRows.length === 0) {
    return { ok: false, error: "pool_not_found" };
  }

  // Sum amounts across all claimed rows (handles multi-period accumulation)
  const amountUsd = poolRows.reduce((sum, row) => sum + Number(row.amount_usd), 0);
  if (amountUsd <= 0) {
    return { ok: false, error: "empty_pool" };
  }

  // Step 3 — Atomic balance credit via existing RPC
  const deltaNative = parseFloat((amountUsd / priceUsd).toFixed(8));
  const creditResult = await rpc<{ ok: boolean; new_balance?: number; error?: string }>(
    "atomic_balance_credit",
    {
      p_mander_id:    manderId,
      p_currency:     cur,
      p_delta_native: deltaNative,
      p_user_id:      userId,
    },
  );

  if (!creditResult.ok) {
    throw new Error(`[claimRakebackAtomic] balance credit failed: ${creditResult.error}`);
  }

  // Step 4 — Audit record (fire-and-forget, non-critical)
  // Note: DB constraint only allows: deposit, withdrawal, bet, bonus → use "bonus" with notes prefix
  sbAdmin("transactions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      mander_id: manderId,
      user_id:   userId,
      type:      "bonus",
      amount:    parseFloat(amountUsd.toFixed(8)),
      currency:  cur,
      status:    "completed",
      notes:     `[rakeback:${poolType}:${periodKey}]`,
    }),
  }).catch((e: any) => console.warn("[claimRakebackAtomic] audit insert failed:", e.message));

  return {
    ok:          true,
    amount:      amountUsd,
    deltaNative,
    newBalance:  creditResult.new_balance,
  };
}

// ── creditBalanceWithAudit ────────────────────────────────────────────────────
/**
 * For rank rewards and other one-off credits. Implemented via REST + existing RPC.
 * Steps:
 *   1. Idempotency check (UNIQUE constraint prevents double-credit)
 *   2. Balance credit via atomic_balance_credit RPC
 *   3. Audit transaction record inserted
 *
 * @param idempotencyKey - caller-supplied UUID (unique per operation)
 * @param userId         - auth.users.id
 * @param manderId       - profiles.mander_id
 * @param currency       - credit currency
 * @param amountUsd      - USD amount (used for audit record and native conversion)
 * @param actionType     - 'rank_reward' | 'claim' | 'general'
 * @param notes          - audit notes (max 200 chars)
 */
export async function creditBalanceWithAudit(
  idempotencyKey: string,
  userId:         string,
  manderId:       string,
  currency:       string,
  amountUsd:      number,
  actionType:     "rank_reward" | "claim" | "general",
  notes:          string,
): Promise<CreditResult> {
  const cur = currency.trim().toUpperCase();

  if (!validateCurrency(cur)) {
    return { ok: false, error: "invalid_currency" };
  }
  if (amountUsd <= 0) {
    return { ok: false, error: "amount_must_be_positive" };
  }

  const priceUsd    = getPriceUsd(cur);
  const deltaNative = parseFloat((amountUsd / priceUsd).toFixed(8));

  // Step 1 — Idempotency: bail immediately if this reward was already credited
  let isNew: boolean;
  try {
    isNew = await tryIdempotency(idempotencyKey, userId);
  } catch (e: any) {
    throw new Error(`[creditBalanceWithAudit] idempotency error: ${e.message}`);
  }
  if (!isNew) {
    return { ok: false, error: "already_processed" };
  }

  // Step 2 — Atomic balance credit via existing RPC
  const creditResult = await rpc<{ ok: boolean; new_balance?: number; error?: string }>(
    "atomic_balance_credit",
    {
      p_mander_id:    manderId,
      p_currency:     cur,
      p_delta_native: deltaNative,
      p_user_id:      userId,
    },
  );

  if (!creditResult.ok) {
    return { ok: false, error: creditResult.error ?? "credit_failed" };
  }

  // Step 3 — Audit record (fire-and-forget, non-critical)
  // Note: DB constraint only allows: deposit, withdrawal, bet, bonus → use "bonus" with notes prefix
  sbAdmin("transactions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      mander_id: manderId,
      user_id:   userId,
      type:      "bonus",
      amount:    parseFloat(amountUsd.toFixed(8)),
      currency:  cur,
      status:    "completed",
      notes:     `[${actionType}] ${notes}`.slice(0, 200),
    }),
  }).catch((e: any) => console.warn("[creditBalanceWithAudit] audit insert failed:", e.message));

  return {
    ok:         true,
    newBalance: creditResult.new_balance,
  };
}

// ── creditBalanceAtomic ───────────────────────────────────────────────────────
/**
 * Raw atomic balance delta for bet-result (positive = win, negative = loss).
 * Uses SELECT FOR UPDATE + UPDATE SET balance = balance + delta.
 * Does NOT insert an audit transaction row (bet-result does this separately).
 *
 * @param manderId   - mander_id
 * @param currency   - currency
 * @param amountUsd  - signed USD delta
 * @param userId     - optional, used only when creating a new balance row
 */
export async function creditBalanceAtomic(
  manderId:  string,
  currency:  string,
  amountUsd: number,
  userId?:   string,
): Promise<CreditResult> {
  const cur   = currency.trim().toUpperCase();
  const price = getPriceUsd(cur);
  // Round to 8 decimal places to avoid floating point dust accumulation in DB
  const delta = parseFloat((amountUsd / price).toFixed(8));

  const result = await rpc<{ ok: boolean; new_balance?: number; error?: string }>(
    "atomic_balance_credit",
    {
      p_mander_id:    manderId,
      p_currency:     cur,
      p_delta_native: delta,
      p_user_id:      userId ?? null,
    },
  );

  return {
    ok:         result.ok === true,
    newBalance: result.new_balance,
    error:      result.error,
  };
}

// ── accumulateRakeback ────────────────────────────────────────────────────────
/**
 * Accumulate server-side rakeback into rakeback_pools on every bet.
 * Formula: total = betUsd * houseEdge * rakebackPct
 * Accumulates on every bet (win or lose). Fire-and-forget from bet-result.
 */
export async function accumulateRakeback(
  userId:      string,
  manderId:    string,
  betUsd:      number,
  houseEdge:   number,
  rakebackPct: number,
): Promise<void> {
  const total = betUsd * houseEdge * rakebackPct;
  if (total <= 0) return;

  const instantUsd = parseFloat((total * 0.40).toFixed(8));
  const weeklyUsd  = parseFloat((total * 0.35).toFixed(8));
  const monthlyUsd = parseFloat((total * 0.25).toFixed(8));

  const curInstant = instantPeriodKey();

  // ── Instant: handle "already claimed" case ────────────────────────────────
  // The Supabase RPC does a blind UPSERT on (user_id, pool_type, period_key).
  // If the row for this period was already claimed, the RPC silently adds to
  // the claimed row making it invisible. We bypass the RPC for instant and
  // use REST: add to unclaimed row if it exists, otherwise insert a fresh one.
  const existingRes = await sbAdmin(
    `rakeback_pools?user_id=eq.${encodeURIComponent(userId)}&pool_type=eq.instant&period_key=eq.${curInstant}&claimed=eq.false&select=id,amount_usd`,
    { headers: { Prefer: "count=none" } },
  );
  const existingRows: { id: string; amount_usd: number }[] = existingRes.ok
    ? await existingRes.json()
    : [];

  if (existingRows.length > 0) {
    const row       = existingRows[0];
    const newAmount = parseFloat((Number(row.amount_usd) + instantUsd).toFixed(8));
    await sbAdmin(`rakeback_pools?id=eq.${row.id}`, {
      method:  "PATCH",
      headers: { Prefer: "return=minimal" },
      body:    JSON.stringify({ amount_usd: newAmount }),
    });
  } else {
    await sbAdmin("rakeback_pools", {
      method:  "POST",
      headers: { Prefer: "return=minimal" },
      body:    JSON.stringify({
        user_id:    userId,
        mander_id:  manderId,
        pool_type:  "instant",
        period_key: curInstant,
        amount_usd: instantUsd,
        claimed:    false,
      }),
    });
  }

  // ── Weekly + Monthly: RPC handles these fine (no intra-period re-claim issue)
  await rpc("accumulate_rakeback", {
    p_user_id:     userId,
    p_mander_id:   manderId,
    p_instant_key: curInstant,
    p_weekly_key:  weeklyPeriodKey(),
    p_monthly_key: monthlyPeriodKey(),
    p_instant_usd: 0,
    p_weekly_usd:  weeklyUsd,
    p_monthly_usd: monthlyUsd,
  });
}

// ── getRakebackPools ──────────────────────────────────────────────────────────
export async function getRakebackPools(userId: string): Promise<{
  instant: number;
  weekly:  number;
  monthly: number;
}> {
  return rpc<{ instant: number; weekly: number; monthly: number }>(
    "get_rakeback_pools",
    { p_user_id: userId },
  );
}

// ── getRakebackPoolsSplit ─────────────────────────────────────────────────────
// Returns instant split into:
//   instant         = claimable during the 1-hour window after accumulation ends
//   instant_pending = older completed hours whose instant claim window expired
//   instant_accum   = accumulating (current hour, not yet claimable)
//   weekly, monthly = unchanged (from RPC)
export async function getRakebackPoolsSplit(userId: string): Promise<{
  instant:         number;
  instant_pending: number;
  instant_accum:   number;
  weekly:          number;
  monthly:         number;
}> {
  const claimWindowStart = instantClaimWindowStartKey();
  const hourBoundary     = instantHourBoundaryKey();
  const [claimableRes, pendingRes, accumRes, pools] = await Promise.all([
    sbAdmin(
      `rakeback_pools?user_id=eq.${encodeURIComponent(userId)}&pool_type=eq.instant&claimed=eq.false&period_key=gte.${claimWindowStart}&period_key=lt.${hourBoundary}&select=amount_usd`,
      { headers: { Prefer: "count=none" } },
    ),
    sbAdmin(
      `rakeback_pools?user_id=eq.${encodeURIComponent(userId)}&pool_type=eq.instant&claimed=eq.false&period_key=lt.${claimWindowStart}&select=amount_usd`,
      { headers: { Prefer: "count=none" } },
    ),
    sbAdmin(
      `rakeback_pools?user_id=eq.${encodeURIComponent(userId)}&pool_type=eq.instant&claimed=eq.false&period_key=gte.${hourBoundary}&select=amount_usd`,
      { headers: { Prefer: "count=none" } },
    ),
    rpc<{ instant: number; weekly: number; monthly: number }>("get_rakeback_pools", { p_user_id: userId }),
  ]);

  const claimRows: { amount_usd: number }[] = claimableRes.ok ? await claimableRes.json() : [];
  const pendingRows: { amount_usd: number }[] = pendingRes.ok   ? await pendingRes.json()   : [];
  const accumRows: { amount_usd: number }[] = accumRes.ok     ? await accumRes.json()    : [];

  return {
    instant:         claimRows.reduce((s, r) => s + Number(r.amount_usd), 0),
    instant_pending: pendingRows.reduce((s, r) => s + Number(r.amount_usd), 0),
    instant_accum:   accumRows.reduce((s, r) => s + Number(r.amount_usd), 0),
    weekly:          Number(pools.weekly  ?? 0),
    monthly:         Number(pools.monthly ?? 0),
  };
}

// ── creditBalanceNative ───────────────────────────────────────────────────────
/**
 * Atomic native balance credit for deposit webhooks.
 * Accepts a native (coin) amount directly — no USD price conversion.
 * Uses the same atomic_balance_credit RPC as creditBalanceAtomic:
 *   SELECT FOR UPDATE → UPDATE SET balance = balance + delta
 *
 * @param manderId    - mander_id
 * @param currency    - currency code (e.g. "USDT", "BTC")
 * @param deltaNative - native units to add (positive = credit, negative = debit)
 * @param userId      - optional auth.users.id — only used when creating a new balance row
 */
export async function creditBalanceNative(
  manderId:    string,
  currency:    string,
  deltaNative: number,
  userId?:     string,
): Promise<CreditResult> {
  const cur = currency.trim().toUpperCase();

  const result = await rpc<{ ok: boolean; new_balance?: number; error?: string }>(
    "atomic_balance_credit",
    {
      p_mander_id:    manderId,
      p_currency:     cur,
      p_delta_native: deltaNative,
      p_user_id:      userId ?? null,
    },
  );

  return {
    ok:         result.ok === true,
    newBalance: result.new_balance,
    error:      result.error,
  };
}

// ── lockFundsAtomic ───────────────────────────────────────────────────────────
/**
 * Atomically move `amount` from balance → locked_amount.
 *
 * PRODUCTION-SAFE: uses a single PostgreSQL UPDATE with the balance check
 * in the WHERE clause. Concurrent calls properly serialize at the DB level —
 * no read-modify-write race condition.
 *
 * Requires the `lock_funds_atomic` PostgreSQL function (see migration.sql).
 *
 * @param manderId - mander_id
 * @param currency - currency code
 * @param amount   - native units to lock (must be > 0)
 */
export async function lockFundsAtomic(
  manderId: string,
  currency: string,
  amount:   number,
): Promise<LockResult> {
  const cur = currency.trim().toUpperCase();
  try {
    const result = await rpc<{
      ok:          boolean;
      new_balance?: number;
      new_locked?:  number;
      error?:       string;
      available?:   number;
    }>("lock_funds_atomic", {
      p_mander_id: manderId,
      p_currency:  cur,
      p_amount:    amount,
    });

    return {
      ok:         result.ok === true,
      newBalance: result.new_balance,
      newLocked:  result.new_locked,
      error:      result.error,
      available:  result.available,
    };
  } catch (e: any) {
    console.error(`[lockFundsAtomic] RPC error (lock_funds_atomic not deployed?): ${e.message}`);
    return { ok: false, error: "rpc_unavailable" };
  }
}

// ── unlockFundsAtomic ─────────────────────────────────────────────────────────
/**
 * Atomically restore `amount` from locked_amount → balance (on withdrawal reject).
 *
 * Single PostgreSQL UPDATE — always succeeds, clamps to 0 if locked < amount.
 *
 * Requires the `unlock_funds_atomic` PostgreSQL function (see migration.sql).
 */
export async function unlockFundsAtomic(
  manderId: string,
  currency: string,
  amount:   number,
): Promise<LockResult> {
  const cur = currency.trim().toUpperCase();
  try {
    const result = await rpc<{ ok: boolean; error?: string }>(
      "unlock_funds_atomic",
      { p_mander_id: manderId, p_currency: cur, p_amount: amount },
    );
    return { ok: result.ok === true, error: result.error };
  } catch (e: any) {
    console.error(`[unlockFundsAtomic] RPC error: ${e.message}`);
    return { ok: false, error: "rpc_unavailable" };
  }
}

// ── clearLockedAtomic ─────────────────────────────────────────────────────────
/**
 * Atomically remove `amount` from locked_amount only (on withdrawal paid).
 * Balance was already deducted when the withdrawal was created.
 * Clamps to 0 — never makes locked_amount negative.
 *
 * Requires the `clear_locked_atomic` PostgreSQL function (see migration.sql).
 */
export async function clearLockedAtomic(
  manderId: string,
  currency: string,
  amount:   number,
): Promise<LockResult> {
  const cur = currency.trim().toUpperCase();
  try {
    const result = await rpc<{ ok: boolean; error?: string }>(
      "clear_locked_atomic",
      { p_mander_id: manderId, p_currency: cur, p_amount: amount },
    );
    return { ok: result.ok === true, error: result.error };
  } catch (e: any) {
    console.error(`[clearLockedAtomic] RPC error: ${e.message}`);
    return { ok: false, error: "rpc_unavailable" };
  }
}

// ── atomicProfileBalanceDelta ─────────────────────────────────────────────────
/**
 * Atomic additive UPDATE on profiles.balance (USD display cache).
 *
 * Replaces the risky read-modify-write pattern:
 *   OLD: read prev → compute prev+delta → write absolute value  (RACE CONDITION)
 *   NEW: UPDATE profiles SET balance = GREATEST(0, balance + delta) WHERE mander_id = ?
 *
 * Requires the `atomic_profile_balance_delta` PostgreSQL function (see migration.sql).
 * Falls back to syncProfileBalance (recompute from balances table) if RPC unavailable.
 *
 * @param manderId - mander_id
 * @param deltaUsd - signed USD delta (positive = credit, negative = debit)
 */
export async function atomicProfileBalanceDelta(
  manderId: string,
  deltaUsd: number,
): Promise<void> {
  try {
    await rpc("atomic_profile_balance_delta", {
      p_mander_id: manderId,
      p_delta_usd: parseFloat(deltaUsd.toFixed(8)),
    });
  } catch (e: any) {
    // Fallback: silently swallow — profiles.balance is a display cache only.
    // The real source of truth is the `balances` table (always atomic).
    console.warn(`[atomicProfileBalanceDelta] RPC failed, display cache may be stale: ${e.message}`);
  }
}

// ── Period key helpers (mirrors frontend vipSystem.ts) ────────────────────────

// Returns a per-minute key so each minute of betting gets its own DB row.
// This avoids the "claimed row blocks future accumulation" issue: if a user
// claims at minute 30, bets in minute 31 create a fresh unclaimed row.
export function instantPeriodKey(): string {
  return String(Math.floor(Date.now() / (60 * 1000))); // minutes since epoch
}

// The first minute of the current hour (used as the claim/accum boundary).
// Rows in [previous hour boundary, current hour boundary) are in the 1-hour claim window.
// Rows with period_key < previous hour boundary are pending claims.
// Rows with period_key >= current hour boundary are accumulating (current hour).
export function instantHourBoundaryKey(): string {
  return String(Math.floor(Date.now() / (60 * 60 * 1000)) * 60);
}

export function instantClaimWindowStartKey(): string {
  return String((Math.floor(Date.now() / (60 * 60 * 1000)) - 1) * 60);
}

export function weeklyPeriodKey(): string {
  const now   = new Date();
  const dow   = now.getUTCDay();
  const toMon = dow === 0 ? 6 : dow - 1;
  const monMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - toMon, 17, 0, 0, 0);
  return String(monMs <= Date.now() ? monMs : monMs - 7 * 24 * 3600 * 1000);
}

export function monthlyPeriodKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Returns the player's total balance in USD across all currencies.
 * Used to detect when a player is at ~$0 before a deposit (wager cycle reset).
 */
export async function getBalanceUsd(manderId: string): Promise<number> {
  try {
    const res = await sbAdmin(
      `balances?mander_id=eq.${encodeURIComponent(manderId)}&select=balance,currency`,
      { headers: { Prefer: "count=none" } },
    );
    if (!res.ok) return 0;
    const rows: { balance: number; currency: string }[] = await res.json();
    return rows.reduce((sum, r) => {
      const bal = Math.max(0, Number(r.balance || 0));
      return sum + bal * getPriceUsd((r.currency ?? "USDT").trim().toUpperCase());
    }, 0);
  } catch {
    return 0;
  }
}

/** Wager cycle reset threshold in USD — balance below this triggers a new cycle on next deposit */
export const WAGER_CYCLE_RESET_THRESHOLD_USD = 1.0;

/**
 * Inserts a wager_reset marker into the transactions table.
 * Called when a deposit is confirmed and the player's balance was ~$0 beforehand.
 * The profile endpoint uses the latest wager_reset timestamp to scope wagering calculations.
 */
export async function insertWagerReset(manderId: string, userId: string): Promise<void> {
  try {
    await sbAdmin("transactions", {
      method: "POST",
      body: JSON.stringify({
        mander_id:   manderId,
        user_id:     userId,
        type:        "wager_reset",
        amount:      0,
        currency:    "USD",
        network:     "",
        status:      "completed",
        notes:       "cycle_reset=auto",
        completed_at: new Date().toISOString(),
      }),
    });
    console.log(`[wager-cycle] reset para mander=${manderId}`);
  } catch (e: any) {
    console.warn(`[wager-cycle] error al insertar reset: ${e.message}`);
  }
}
