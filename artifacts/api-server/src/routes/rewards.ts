/**
 * rewards.ts
 *
 * All endpoints are hardened to production financial grade:
 *
 * POST /api/claim-rakeback
 *   Body: { claim_type, period_key, currency }
 *
 *   Calls `claim_rakeback_atomic` — a single PostgreSQL function that in one
 *   database transaction atomically:
 *     1. Checks idempotency (INSERT ON CONFLICT DO NOTHING)
 *     2. Locks the rakeback_pool row (SELECT FOR UPDATE)
 *     3. Validates pool state (not claimed, amount > 0)
 *     4. Marks pool as claimed
 *     5. Locks + credits balance (SELECT FOR UPDATE + UPDATE SET balance += delta)
 *     6. Inserts audit transaction record
 *   If ANY step raises, Postgres rolls back everything — no partial state.
 *
 * POST /api/claim-rank-reward
 *   Body: { amount_usd, rank_name, currency }
 *
 *   Calls `credit_balance_with_audit` — a single PostgreSQL function that in
 *   one transaction: idempotency + balance credit + audit row.
 *
 * GET /api/rakeback-pools
 *   Returns server-side rakeback balances (source of truth: rakeback_pools table).
 */

import { Router, Request, Response, NextFunction } from "express";
import { createHash }                               from "crypto";

/**
 * Converts any string into a deterministic UUID v4-shaped string using MD5.
 * Required because the idempotency_keys table has a UUID primary key column —
 * passing a raw string (e.g. "rb:instant:19636:...") would throw a Postgres
 * type error.  MD5 output is 32 hex chars → maps cleanly to the UUID format.
 */
function stringToUUID(s: string): string {
  const h = createHash("md5").update(s).digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    "4" + h.slice(13, 16),
    ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32),
  ].join("-");
}

import { requireAuth }                              from "../lib/requireAuth";
import {
  claimRakebackAtomic,
  creditBalanceWithAudit,
  getRakebackPools,
  instantPeriodKey,
  instantHourBoundaryKey,
  instantClaimWindowStartKey,
  weeklyPeriodKey,
  monthlyPeriodKey,
  validateCurrency,
}                                                   from "../lib/atomicBalance";
import { rpc }                                      from "../lib/supabaseRpc";
import { fetchWithTimeout } from "../lib/fetchWithTimeout";

const router = Router();

const SUPABASE_URL         = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const SUPABASE_ANON_KEY    = process.env.SUPABASE_ANON_KEY!;

const MAX_CLAIM_USD  = 100_000;
const ALLOWED_TYPES  = ["instant", "instant_pending", "weekly", "monthly"] as const;
type ClaimType       = typeof ALLOWED_TYPES[number];

// ── Supabase REST helper ──────────────────────────────────────────────────────

function sbAdmin(path: string, opts: RequestInit = {}) {
  return fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey:         SUPABASE_SERVICE_KEY,
      Authorization:  `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer:         "return=minimal",
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
}

// ── Auth middleware ───────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      authUser?: { id: string; email: string; user_metadata: Record<string, any> };
    }
  }
}

// requireAuth imported from ../lib/requireAuth — shared single-session middleware

// ── Profile helper ────────────────────────────────────────────────────────────

async function getProfile(userId: string) {
  const r = await sbAdmin(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=id,mander_id,username,is_blocked&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (!r.ok) return null;
  const rows: any[] = await r.json();
  return rows[0] ?? null;
}

/** Update the aggregate USD balance on profiles (display only — eventual consistency OK). */
function syncProfileBalanceAsync(manderId: string): void {
  sbAdmin(
    `balances?mander_id=eq.${encodeURIComponent(manderId)}&select=currency,balance`,
    { headers: { Prefer: "count=none" } },
  )
    .then(r => (r.ok ? r.json() : []))
    .then(async (rows: { currency: string; balance: number }[]) => {
      const { getPriceUsd } = await import("../lib/prices");
      const totalUsd = rows.reduce(
        (s, r) => s + Number(r.balance) * getPriceUsd(r.currency),
        0,
      );
      await sbAdmin(`profiles?mander_id=eq.${encodeURIComponent(manderId)}`, {
        method: "PATCH",
        body:   JSON.stringify({ balance: parseFloat(totalUsd.toFixed(4)) }),
      });
    })
    .catch((e: any) => console.warn("[rewards] syncProfileBalance failed:", e.message));
}

// ── Period key validation ─────────────────────────────────────────────────────
// Ensures the client cannot claim with a fabricated future or far-past key.

function validatePeriodKey(claimType: ClaimType, periodKey: string): boolean {
  switch (claimType) {
    case "instant": {
      const cur  = String(Math.floor(Date.now() / (60 * 60 * 1000)));
      const prev = String(Number(cur) - 1);
      return periodKey === cur || periodKey === prev;
    }
    case "instant_pending": {
      // Any numeric period key is valid — server enforces the correct filter
      return /^\d+$/.test(periodKey);
    }
    case "weekly": {
      return periodKey === weeklyPeriodKey();
    }
    case "monthly": {
      return periodKey === monthlyPeriodKey();
    }
  }
}

// ── POST /api/claim-rakeback ──────────────────────────────────────────────────

router.post("/claim-rakeback", requireAuth, async (req: Request, res: Response) => {
  const { claim_type, period_key, currency = "USDT" } = req.body ?? {};

  // ── Strict input validation ───────────────────────────────────────────────
  if (!ALLOWED_TYPES.includes(claim_type as ClaimType)) {
    return res.status(400).json({ error: "claim_type inválido. Debe ser: instant | instant_pending | weekly | monthly." });
  }
  if (!period_key || typeof period_key !== "string" || period_key.length > 80) {
    return res.status(400).json({ error: "period_key requerido (máx 80 caracteres)." });
  }

  const cur = String(currency).trim().toUpperCase();
  if (!validateCurrency(cur)) {
    return res.status(400).json({
      error: "Moneda no permitida. Aceptamos: USDT, USDC, BTC, ETH, BNB, SOL, LTC, TRX.",
    });
  }

  // Validate the period key belongs to the current (or recent) period
  if (!validatePeriodKey(claim_type as ClaimType, period_key)) {
    return res.status(400).json({ error: "period_key no corresponde al período actual." });
  }

  const userId = req.authUser!.id;

  // ── Profile fetch ─────────────────────────────────────────────────────────
  const profile = await getProfile(userId).catch(() => null);
  if (!profile) return res.status(404).json({ error: "Perfil no encontrado." });
  if (profile.is_blocked) return res.status(403).json({ error: "Cuenta bloqueada." });

  const { mander_id } = profile;

  // ── Generate caller-side idempotency key ──────────────────────────────────
  // Canonical form: rb:{type}:{period}:{userId} — deterministic, unique per claim window.
  // stringToUUID converts it to a valid UUID so Postgres won't reject it.
  const idempotencyKey = stringToUUID(`rb:${claim_type}:${period_key}:${userId}`);

  // ── Single atomic DB call — ALL or NOTHING ────────────────────────────────
  // claim_rakeback_atomic does idempotency + pool lock + claim mark +
  // balance credit + audit row in ONE PostgreSQL transaction.
  let result: Awaited<ReturnType<typeof claimRakebackAtomic>>;
  try {
    result = await claimRakebackAtomic(
      idempotencyKey,
      userId,
      mander_id,
      claim_type as ClaimType,
      period_key,
      cur,
    );
  } catch (e: any) {
    console.error("[CLAIM-RB] claimRakebackAtomic RPC error:", e.message);
    return res.status(503).json({ error: "Servicio temporalmente no disponible. Intentá de nuevo." });
  }

  // ── Map DB errors to HTTP responses ──────────────────────────────────────
  if (!result.ok) {
    const { error } = result;

    if (error === "already_processed" || error === "already_claimed") {
      return res.status(409).json({ error: "Ya reclamado.", code: "already_claimed" });
    }
    if (error === "pool_not_found" || error === "empty_pool") {
      return res.status(404).json({
        error: "No hay rakeback disponible para este período.",
        code:  error,
      });
    }
    if (error === "invalid_currency") {
      return res.status(400).json({ error: "Moneda no permitida." });
    }
    if (error === "invalid_pool_type") {
      return res.status(400).json({ error: "Tipo de pool inválido." });
    }

    console.error("[CLAIM-RB] unexpected error from DB:", error);
    return res.status(500).json({ error: "Error interno. Contactá soporte." });
  }

  const creditedUsd = Number(result.amount ?? 0);
  if (creditedUsd <= 0) {
    return res.status(400).json({ error: "Monto del servidor es cero o negativo." });
  }

  // Update aggregate profile balance (eventual consistency — display only)
  syncProfileBalanceAsync(mander_id);

  console.log(
    `[CLAIM-RB] ok user=${userId} type=${claim_type} period=${period_key} ` +
    `usd=${creditedUsd} native=${result.deltaNative} new_bal=${result.newBalance}`,
  );

  return res.json({
    ok:           true,
    credited_usd: creditedUsd,
    new_balance:  result.newBalance,
  });
});

// ── POST /api/claim-rank-reward ───────────────────────────────────────────────

router.post("/claim-rank-reward", requireAuth, async (req: Request, res: Response) => {
  const { amount_usd, rank_name, currency = "USDT" } = req.body ?? {};

  // ── Input validation ──────────────────────────────────────────────────────
  if (typeof amount_usd !== "number" || amount_usd <= 0 || amount_usd > MAX_CLAIM_USD) {
    return res.status(400).json({ error: "amount_usd inválido (debe ser > 0 y ≤ 100,000)." });
  }
  if (!rank_name || typeof rank_name !== "string" || rank_name.length > 60) {
    return res.status(400).json({ error: "rank_name requerido (máx 60 caracteres)." });
  }

  const cur = String(currency).trim().toUpperCase();
  if (!validateCurrency(cur)) {
    return res.status(400).json({
      error: "Moneda no permitida. Aceptamos: USDT, USDC, BTC, ETH, BNB, SOL, LTC, TRX.",
    });
  }

  const userId  = req.authUser!.id;
  const profile = await getProfile(userId).catch(() => null);
  if (!profile) return res.status(404).json({ error: "Perfil no encontrado." });
  if (profile.is_blocked) return res.status(403).json({ error: "Cuenta bloqueada." });

  const { mander_id } = profile;
  const safeRank      = rank_name.replace(/[^a-zA-Z0-9_\- ]/g, "").slice(0, 50);

  // Idempotency key is rank-scoped: one reward per rank per user, ever.
  // stringToUUID ensures it's a valid UUID for the idempotency_keys DB column.
  const idempotencyKey = stringToUUID(`rank:${safeRank}:${userId}`);

  // ── Single atomic DB call ─────────────────────────────────────────────────
  let credit: Awaited<ReturnType<typeof creditBalanceWithAudit>>;
  try {
    credit = await creditBalanceWithAudit(
      idempotencyKey,
      userId,
      mander_id,
      cur,
      amount_usd,
      "rank_reward",
      `rank:${safeRank}`,
    );
  } catch (e: any) {
    console.error("[RANK-REWARD] creditBalanceWithAudit RPC error:", e.message);
    return res.status(503).json({ error: "Servicio temporalmente no disponible." });
  }

  if (!credit.ok) {
    if (credit.error === "already_processed") {
      return res.status(409).json({ error: "Recompensa de rango ya reclamada.", code: "already_claimed" });
    }
    if (credit.error === "invalid_currency") {
      return res.status(400).json({ error: "Moneda no permitida." });
    }
    if (credit.error === "amount_must_be_positive" || credit.error === "amount_usd_must_be_positive") {
      return res.status(400).json({ error: "Monto inválido." });
    }
    console.error("[RANK-REWARD] unexpected DB error:", credit.error);
    return res.status(500).json({ error: "Error interno. Contactá soporte." });
  }

  syncProfileBalanceAsync(mander_id);

  console.log(`[RANK-REWARD] ok user=${userId} rank=${safeRank} usd=${amount_usd} new_bal=${credit.newBalance}`);

  return res.json({ ok: true, credited_usd: amount_usd, new_balance: credit.newBalance });
});

// ── POST /api/rewards/history-save ───────────────────────────────────────────
// Saves a reward claim record to user_reward_history table.
// Called by the frontend whenever a reward is claimed (API or local path).

router.post("/history-save", requireAuth, async (req: Request, res: Response) => {
  const userId = req.authUser!.id;
  const { id, amount, note, claimed_at } = req.body ?? {};

  if (!id || amount == null || !note) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const amountNum = parseFloat(String(amount));
  if (isNaN(amountNum) || amountNum <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  try {
    const r = await sbAdmin("user_reward_history", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({
        id:         String(id),
        user_id:    userId,
        amount:     amountNum,
        note:       String(note),
        claimed_at: claimed_at ?? new Date().toISOString(),
      }),
    });
    if (!r.ok && r.status !== 409) {
      const body = await r.text();
      if (body.includes("relation") && body.includes("does not exist")) {
        return res.json({ ok: true, skipped: true });
      }
      return res.status(500).json({ error: body });
    }
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── GET /api/my-rewards ──────────────────────────────────────────────────────
// Returns merged claim history from:
//   1. transactions table (API-claimed rewards)
//   2. user_reward_history table (local-path claims & all claims saved by frontend)
// Used to sync reward history across browsers/devices.

router.get("/my-rewards", requireAuth, async (req: Request, res: Response) => {
  const userId = req.authUser!.id;
  try {
    const rewardFilter = encodeURIComponent("(notes.like.[rakeback:*,notes.like.[rank_reward]*)");
    const [txRes, histRes] = await Promise.all([
      sbAdmin(
        `transactions?user_id=eq.${encodeURIComponent(userId)}&type=eq.bonus&or=${rewardFilter}&amount=gt.0&order=created_at.desc&limit=500`,
        { method: "GET", headers: { Prefer: "count=none" } },
      ),
      sbAdmin(
        `user_reward_history?user_id=eq.${encodeURIComponent(userId)}&order=claimed_at.desc&limit=500`,
        { method: "GET", headers: { Prefer: "count=none" } },
      ),
    ]);

    const txRows:   any[] = txRes.ok   ? await txRes.json()   : [];
    const histRows: any[] = histRes.ok ? await histRes.json() : [];

    const seen = new Set<string>();
    const rewards: any[] = [];

    // 1. From user_reward_history (highest priority — includes local claims)
    for (const row of histRows) {
      const id = `h-${row.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const amountUsd = parseFloat(row.amount) || 0;
      if (amountUsd <= 0) continue;
      rewards.push({
        id,
        date:   new Date(row.claimed_at).getTime(),
        amount: amountUsd,
        note:   String(row.note || "Reward Claim"),
        source: "history",
      });
    }

    // 2. From transactions table (API-claimed rewards)
    for (const row of txRows) {
      const id = `tx-${row.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const notes: string = String(row.notes || "");
      let note = notes;
      if      (notes.includes("[rakeback:instant:"))  note = "Rakeback Claim - Instant";
      else if (notes.includes("[rakeback:weekly:"))   note = "Rakeback Claim - Weekly";
      else if (notes.includes("[rakeback:monthly:"))  note = "Rakeback Claim - Monthly";
      else if (notes.startsWith("rakeback:instant:")) note = "Rakeback Claim - Instant";
      else if (notes.startsWith("rakeback:weekly:"))  note = "Rakeback Claim - Weekly";
      else if (notes.startsWith("rakeback:monthly:")) note = "Rakeback Claim - Monthly";
      else if (notes.includes("[rank_reward]")) {
        const rankName = notes.replace("[rank_reward]", "").trim().replace(/_/g, " ");
        note = `Rank Reward - ${rankName}`;
      }
      else if (notes.startsWith("rank:")) {
        const rankName = notes.slice(5).replace(/_/g, " ");
        note = `Rank Reward - ${rankName}`;
      }
      const amountUsd = parseFloat(row.amount) || 0;
      if (amountUsd <= 0) continue;
      rewards.push({
        id,
        date:   new Date(row.created_at).getTime(),
        amount: amountUsd,
        note,
        source: "transaction",
      });
    }

    rewards.sort((a, b) => b.date - a.date);
    const deduped: any[] = [];
    for (const reward of rewards) {
      const duplicateIndex = deduped.findIndex(existing =>
        existing.note === reward.note && Math.abs(existing.date - reward.date) <= 2 * 60 * 1000
      );
      if (duplicateIndex >= 0) {
        if (reward.source === "transaction" && deduped[duplicateIndex].source !== "transaction") {
          deduped[duplicateIndex] = reward;
        }
        continue;
      }
      deduped.push(reward);
    }
    return res.json({
      rewards: deduped.slice(0, 500).map(({ source, ...reward }) => reward),
    });
  } catch (e: any) {
    console.error("[MY-REWARDS] error:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ── GET /api/rakeback-pools ───────────────────────────────────────────────────
// Returns server-side rakeback balances.
// instant        = claimable now (the completed hour immediately before current hour)
// instant_accum  = currently accumulating this hour (not yet claimable)
// instant_pending = older completed hours whose 1-hour instant claim window expired
// Frontend should use these as the source of truth, not localStorage.

router.get("/rakeback-pools", requireAuth, async (req: Request, res: Response) => {
  const userId = req.authUser!.id;
  try {
    const claimWindowStart = instantClaimWindowStartKey();
    const hourBoundary     = instantHourBoundaryKey();
    const weeklyBoundary  = weeklyPeriodKey();
    const monthlyBoundary = monthlyPeriodKey();
    const enc = encodeURIComponent;

    // Fetch all seven splits in parallel:
    //   instant claimable = previous completed hour only
    //   instant pending   = older completed hours whose 1-hour claim window expired
    //   instant accum     = current hour
    //   weekly  claimable = past weeks   (period_key < this Monday's key)
    //   weekly  accum     = this week    (period_key = this Monday's key)
    //   monthly claimable = past months  (period_key < this month's key)
    //   monthly accum     = this month   (period_key = this month's key)
    const [iClaimRes, iPendingRes, iAccumRes, wClaimRes, wAccumRes, mClaimRes, mAccumRes] = await Promise.all([
      sbAdmin(`rakeback_pools?user_id=eq.${enc(userId)}&pool_type=eq.instant&claimed=eq.false&period_key=gte.${claimWindowStart}&period_key=lt.${hourBoundary}&select=amount_usd`,  { headers: { Prefer: "count=none" } }),
      sbAdmin(`rakeback_pools?user_id=eq.${enc(userId)}&pool_type=eq.instant&claimed=eq.false&period_key=lt.${claimWindowStart}&select=amount_usd`,  { headers: { Prefer: "count=none" } }),
      sbAdmin(`rakeback_pools?user_id=eq.${enc(userId)}&pool_type=eq.instant&claimed=eq.false&period_key=gte.${hourBoundary}&select=amount_usd`, { headers: { Prefer: "count=none" } }),
      sbAdmin(`rakeback_pools?user_id=eq.${enc(userId)}&pool_type=eq.weekly&claimed=eq.false&period_key=lt.${weeklyBoundary}&select=amount_usd`,  { headers: { Prefer: "count=none" } }),
      sbAdmin(`rakeback_pools?user_id=eq.${enc(userId)}&pool_type=eq.weekly&claimed=eq.false&period_key=eq.${weeklyBoundary}&select=amount_usd`,  { headers: { Prefer: "count=none" } }),
      sbAdmin(`rakeback_pools?user_id=eq.${enc(userId)}&pool_type=eq.monthly&claimed=eq.false&period_key=lt.${monthlyBoundary}&select=amount_usd`, { headers: { Prefer: "count=none" } }),
      sbAdmin(`rakeback_pools?user_id=eq.${enc(userId)}&pool_type=eq.monthly&claimed=eq.false&period_key=eq.${monthlyBoundary}&select=amount_usd`, { headers: { Prefer: "count=none" } }),
    ]);

    const sum = (res: Response, rows?: { amount_usd: number }[]) =>
      (rows ?? []).reduce((s, r) => s + Number(r.amount_usd), 0);

    const iClaimRows: { amount_usd: number }[] = iClaimRes.ok ? await iClaimRes.json() : [];
    const iPendingRows: { amount_usd: number }[] = iPendingRes.ok ? await iPendingRes.json() : [];
    const iAccumRows: { amount_usd: number }[] = iAccumRes.ok ? await iAccumRes.json() : [];
    const wClaimRows: { amount_usd: number }[] = wClaimRes.ok ? await wClaimRes.json() : [];
    const wAccumRows: { amount_usd: number }[] = wAccumRes.ok ? await wAccumRes.json() : [];
    const mClaimRows: { amount_usd: number }[] = mClaimRes.ok ? await mClaimRes.json() : [];
    const mAccumRows: { amount_usd: number }[] = mAccumRes.ok ? await mAccumRes.json() : [];

    return res.json({
      instant:        sum(iClaimRes, iClaimRows),
      instant_pending: sum(iPendingRes, iPendingRows),
      instant_accum:  sum(iAccumRes, iAccumRows),
      weekly:         sum(wClaimRes, wClaimRows),
      weekly_accum:   sum(wAccumRes, wAccumRows),
      monthly:        sum(mClaimRes, mClaimRows),
      monthly_accum:  sum(mAccumRes, mAccumRows),
      period_keys: {
        instant: String(Math.floor(Date.now() / (60 * 60 * 1000))),
        weekly:  weeklyBoundary,
        monthly: monthlyBoundary,
      },
    });
  } catch (e: any) {
    console.error("[RAKEBACK-POOLS] error:", e.message);
    return res.status(503).json({ error: "No se pudo obtener los pools de rakeback." });
  }
});

export default router;
