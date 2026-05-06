/**
 * stats.ts — Admin statistics endpoint
 * GET /api/admin/stats
 *
 * Returns:
 *  - balanceTotals:   sum of balance + locked_amount per currency
 *  - transactions:    deposit/withdrawal totals by period (day/week/month/all)
 *  - activeUsers:     distinct users by period
 *  - withdrawalsByStatus: pending/approved/paid/rejected counts
 *  - topPlayers:      top 10 by wagered volume (abs sum of transactions)
 *  - totalUsers:      total registered profiles
 */

import { Router, Request, Response, NextFunction } from "express";
import { verifyGameToken } from "../lib/gameToken.js";
import { fetchWithTimeout } from "../lib/fetchWithTimeout";
import { getPriceUsd } from "../lib/prices.js";
import { txToUsd } from "../lib/txToUsd.js";
import { getAuthUsers as getCachedAuthUsers, getCachedBetRows } from "../lib/supabaseCache";

const router = Router();

const SUPABASE_URL         = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const SUPABASE_ANON_KEY    = process.env.SUPABASE_ANON_KEY!;
const ADMIN_USERNAMES      = () =>
  (process.env.ADMIN_USERNAMES || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

// ── Supabase helper ───────────────────────────────────────────────────────────

function sbAdmin(path: string, opts: RequestInit = {}, timeoutMs = 25_000) {
  return fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey:         SUPABASE_SERVICE_KEY,
      Authorization:  `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer:         "count=none",
      ...(opts.headers as Record<string, string> | undefined),
    },
  }, timeoutMs);
}

// ── Auth ──────────────────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      authUser?: { id: string; email: string; user_metadata: Record<string, any> };
    }
  }
}

async function getProfile(userId: string) {
  const r = await sbAdmin(`profiles?id=eq.${encodeURIComponent(userId)}&select=id,mander_id,username&limit=1`);
  if (!r.ok) return null;
  const rows: any[] = await r.json();
  return rows[0] ?? null;
}

// Token-keyed auth cache: avoids 2 Supabase round-trips per poll interval
const _adminAuthCache = new Map<string, { userId: string; username: string; at: number }>();
const ADMIN_AUTH_CACHE_TTL = 60_000;

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Sesión inválida." });
  const token = authHeader.slice(7);

  // Serve from auth cache if fresh (avoids Supabase calls on every poll)
  const cached = _adminAuthCache.get(token);
  if (cached && Date.now() - cached.at < ADMIN_AUTH_CACHE_TTL) {
    req.authUser = { id: cached.userId, email: "", user_metadata: {} };
    return next();
  }

  let userId: string | null = null;

  try {
    const gameUser = verifyGameToken(token) as any;
    if (gameUser) userId = gameUser.profileId;
  } catch {}

  if (!userId) {
    try {
      const r = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      });
      if (r.ok) userId = (await r.json()).id;
    } catch {}
  }

  if (!userId) return res.status(401).json({ error: "Sesión inválida." });

  const profile = await getProfile(userId).catch(() => null);
  if (!profile) return res.status(403).json({ error: "Perfil no encontrado." });
  if (!ADMIN_USERNAMES().includes(profile.username.toLowerCase()))
    return res.status(403).json({ error: "Acceso denegado." });

  _adminAuthCache.set(token, { userId, username: profile.username, at: Date.now() });
  req.authUser = { id: userId, email: "", user_metadata: {} };
  next();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOf(period: "day" | "week" | "month"): Date {
  const now = new Date();
  if (period === "day") {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  if (period === "week") {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - 7);
    return d;
  }
  // month
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 30);
  return d;
}

function periodFilter(date: Date): boolean {
  return true; // placeholder — used inside reduce
}

function filterByDate(items: any[], dateField: string, since: Date): any[] {
  return items.filter(i => new Date(i[dateField]) >= since);
}

function sumField(items: any[], field: string): number {
  return items.reduce((acc, i) => acc + Number(i[field] ?? 0), 0);
}

function sumUsd(items: any[]): number {
  return items.reduce((acc, i) => acc + txToUsd(i), 0);
}

function countDistinct(items: any[], field: string): number {
  return new Set(items.map(i => i[field]).filter(Boolean)).size;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
let _statsCache: { data: unknown; at: number } | null = null;
const STATS_CACHE_TTL = 5 * 60_000; // 5 min

router.get("/admin/stats", requireAdmin, async (_req: Request, res: Response) => {
  if (_statsCache && Date.now() - _statsCache.at < STATS_CACHE_TTL) {
    return res.json(_statsCache.data);
  }
  try {
    const sinceMth  = startOf("month").toISOString();

    // PostgREST v11 doesn't support aggregate functions — fetch rows once and aggregate in JS
    const [balancesRes, txRes, withdrawalsRes, profilesRes, authUsersRes, betRowsRes] = await Promise.all([
      // All balance rows — include user_id so we can exclude demo accounts
      sbAdmin("balances?select=user_id,currency,balance,locked_amount"),

      // Transactions last 30 days (deposits + withdrawals + bonuses)
      sbAdmin(
        `transactions?select=user_id,mander_id,type,amount,currency,created_at,status,notes` +
        `&created_at=gte.${sinceMth}` +
        `&order=created_at.desc`,
      ),

      // All withdrawals (for status breakdown)
      sbAdmin("withdrawals?select=status,amount,currency,created_at,user_id"),

      // Profile count
      sbAdmin("profiles?select=id,username,created_at"),

      // Auth users — to identify demo/streamer accounts (balance_demo_local > 0)
      // Uses shared 5-min cache to avoid repeated heavy Supabase calls
      getCachedAuthUsers().catch(() => [] as any[]),

      // Shared cached bet rows (5-min TTL, singleflight — avoids duplicate fetches
      // when stats + affiliates load concurrently on cold cache)
      getCachedBetRows(),
    ]);

    if (!balancesRes.ok || !txRes.ok || !withdrawalsRes.ok || !profilesRes.ok) {
      throw new Error("Error fetching data from Supabase");
    }

    const balances:    any[] = await balancesRes.json();
    const txAll:       any[] = await txRes.json();
    const withdrawals: any[] = await withdrawalsRes.json();
    const profiles:    any[] = await profilesRes.json();
    const allBetRows:  any[] = Array.isArray(betRowsRes) ? betRowsRes : [];

    // Build set of demo user IDs (active demo balance > 0 = streamer/tester accounts)
    // authUsersRes is now the array directly (from shared 5-min cache)
    const demoUserIds = new Set<string>();
    const authUsersArr: any[] = Array.isArray(authUsersRes) ? authUsersRes : [];
    for (const u of authUsersArr) {
      if (Number(u.app_metadata?.balance_demo_local ?? 0) > 0) {
        demoUserIds.add(u.id);
      }
    }

    // Aggregate GGR from bet rows in JS (filter by period)
    function aggregateBets(rows: any[], since: Date): { wagered: number; paid: number; bonus: number; count: number } {
      let wagered = 0, paid = 0, bonus = 0, count = 0;
      for (const r of rows) {
        if (new Date(r.created_at) >= since) {
          wagered += parseFloat(r.bet_usd    || 0);
          paid    += parseFloat(r.payout_usd || 0);
          bonus   += parseFloat(r.bonus_usd  || 0);
          count++;
        }
      }
      return { wagered, paid, bonus, count };
    }

    const ggrDay   = aggregateBets(allBetRows, startOf("day"));
    const ggrWeek  = aggregateBets(allBetRows, startOf("week"));
    const ggrMonth = aggregateBets(allBetRows, startOf("month"));

    // Build wageredByUsername map from bet rows
    const wageredByUsername: Record<string, number> = {};
    for (const row of allBetRows) {
      const uname = String(row.username ?? "").toLowerCase();
      if (uname) wageredByUsername[uname] = (wageredByUsername[uname] || 0) + parseFloat(row.bet_usd || 0);
    }

    console.log(`[stats/ggr] month: wagered=${round2(ggrMonth.wagered)} paid=${round2(ggrMonth.paid)} bets=${ggrMonth.count}`);

    // ── 1. Balance totals per currency (real users only — exclude demo accounts) ──
    const balanceTotalsMap: Record<string, { currency: string; balance: number; locked: number; total: number }> = {};
    for (const row of balances) {
      if (demoUserIds.has(row.user_id)) continue; // skip streamer/demo accounts
      const cur = row.currency;
      if (!balanceTotalsMap[cur]) balanceTotalsMap[cur] = { currency: cur, balance: 0, locked: 0, total: 0 };
      balanceTotalsMap[cur].balance += Number(row.balance ?? 0);
      balanceTotalsMap[cur].locked  += Number(row.locked_amount ?? 0);
      balanceTotalsMap[cur].total    = balanceTotalsMap[cur].balance + balanceTotalsMap[cur].locked;
    }
    const balanceTotals = Object.values(balanceTotalsMap)
      .map(b => ({ ...b, balance: round2(b.balance), locked: round2(b.locked), total: round2(b.total) }))
      .filter(b => b.total > 0)
      .sort((a, b) => b.total - a.total);

    // ── 2. Transactions by type & period ────────────────────────────────────
    const sinceDay   = startOf("day");
    const sinceWeek  = startOf("week");
    const sinceMonth = startOf("month");

    const deposits    = txAll.filter(t => t.type === "deposit");
    // Only count completed (paid) withdrawals — rejected/pending ones must not inflate the total.
    const withdrawalsTx = txAll.filter(t => t.type === "withdrawal" && t.status === "completed");
    // Only count real credit bonuses:
    //   - Exclude admin debit adjustments ([admin_adjustment:debit]) — they reduce balance, not credits.
    //   - Exclude demo balance grants ([demo_balance]) — they are fake/streamer money, not real bonuses.
    const bonuses = txAll.filter(t =>
      t.type === "bonus" &&
      !String(t.notes ?? "").includes("[admin_adjustment:debit]") &&
      !String(t.notes ?? "").includes("[demo_balance]"),
    );

    function periodStats(items: any[]) {
      const day   = filterByDate(items, "created_at", sinceDay);
      const week  = filterByDate(items, "created_at", sinceWeek);
      const month = items; // already filtered to last 30 days
      return {
        day:   { count: day.length,   total: round2(sumUsd(day)) },
        week:  { count: week.length,  total: round2(sumUsd(week)) },
        month: { count: month.length, total: round2(sumUsd(month)) },
      };
    }

    const transactions = {
      deposits:    periodStats(deposits),
      withdrawals: periodStats(withdrawalsTx),
      bonuses:     periodStats(bonuses),
    };

    // ── 3. Active users by period ────────────────────────────────────────────
    const activeUsers = {
      day:   countDistinct(filterByDate(txAll, "created_at", sinceDay),   "user_id"),
      week:  countDistinct(filterByDate(txAll, "created_at", sinceWeek),  "user_id"),
      month: countDistinct(txAll, "user_id"),
    };

    // ── 4. Withdrawals by status ─────────────────────────────────────────────
    const wStatusMap: Record<string, number> = { pending: 0, approved: 0, paid: 0, rejected: 0 };
    const wPendingAmount: Record<string, number> = {};
    for (const w of withdrawals) {
      wStatusMap[w.status] = (wStatusMap[w.status] ?? 0) + 1;
      if (w.status === "pending" || w.status === "approved") {
        const cur = w.currency;
        wPendingAmount[cur] = (wPendingAmount[cur] ?? 0) + Number(w.amount ?? 0);
      }
    }
    const withdrawalsByStatus = {
      pending:  wStatusMap.pending  ?? 0,
      approved: wStatusMap.approved ?? 0,
      paid:     wStatusMap.paid     ?? 0,
      rejected: wStatusMap.rejected ?? 0,
      pendingAmounts: Object.entries(wPendingAmount).map(([currency, amount]) => ({
        currency, amount: round2(amount),
      })),
    };

    // ── 5. Top players by volume (last 30 days) ──────────────────────────────
    // Only real players: skip demo-balance grants, require at least one real deposit.
    const playerVolumeMap: Record<string, { volume: number; deposits: number; withdrawals: number; userId: string }> = {};
    for (const tx of txAll) {
      if (!tx.user_id) continue;
      // Skip demo balance grants — they are not real money
      if (String(tx.notes ?? "").includes("[demo_balance]")) continue;
      if (!playerVolumeMap[tx.user_id])
        playerVolumeMap[tx.user_id] = { volume: 0, deposits: 0, withdrawals: 0, userId: tx.user_id };
      const price = getPriceUsd(String(tx.currency || "USDT").trim().toUpperCase());
      const absUsd = Math.abs(Number(tx.amount ?? 0)) * price;
      playerVolumeMap[tx.user_id].volume += absUsd;
      if (tx.type === "deposit")    playerVolumeMap[tx.user_id].deposits    += absUsd;
      // Only count completed withdrawals — rejected ones should not inflate player volume.
      if (tx.type === "withdrawal" && tx.status === "completed") playerVolumeMap[tx.user_id].withdrawals += absUsd;
    }

    const profileMap: Record<string, string> = {};
    for (const p of profiles) profileMap[p.id] = p.username;

    const topPlayers = Object.values(playerVolumeMap)
      .filter(p => p.deposits > 0)           // real players only — must have at least one deposit
      .map(p => {
        const uname = (profileMap[p.userId] ?? "").toLowerCase();
        return {
          username:    profileMap[p.userId] ?? p.userId,
          wagered:     round2(wageredByUsername[uname] ?? 0),
          deposits:    round2(p.deposits),
          withdrawals: round2(p.withdrawals),
        };
      })
      .sort((a, b) => b.wagered - a.wagered)
      .slice(0, 10);

    // ── 6. Casino GGR (Gross Gaming Revenue) ────────────────────────────────
    // GGR = bets - payouts - bonus_used (from real bets only, not demo)
    // Built from server-side aggregates — no row download needed.
    function aggToGGR(agg: { wagered: number; paid: number; bonus: number; count: number }) {
      const ggr = agg.wagered - agg.paid - agg.bonus;
      return {
        wagered: round2(agg.wagered),
        paid:    round2(agg.paid),
        bonus:   round2(agg.bonus),
        ggr:     round2(ggr),
        count:   agg.count,
      };
    }

    const casinoGGR = {
      day:   aggToGGR(ggrDay),
      week:  aggToGGR(ggrWeek),
      month: aggToGGR(ggrMonth),
    };

    // ── 7. New users by period ───────────────────────────────────────────────
    const newUsers = {
      day:   filterByDate(profiles, "created_at", sinceDay).length,
      week:  filterByDate(profiles, "created_at", sinceWeek).length,
      month: filterByDate(profiles, "created_at", sinceMonth).length,
      total: profiles.length,
    };

    // ── Response ─────────────────────────────────────────────────────────────
    const statsData = {
      ok: true,
      generatedAt: new Date().toISOString(),
      balanceTotals,
      transactions,
      activeUsers,
      withdrawalsByStatus,
      topPlayers,
      newUsers,
      casinoGGR,
    };
    _statsCache = { data: statsData, at: Date.now() };
    return res.json(statsData);
  } catch (err: unknown) {
    console.error("[STATS] Error:", err);
    return res.status(500).json({ error: "Error al obtener estadísticas." });
  }
});

export default router;
