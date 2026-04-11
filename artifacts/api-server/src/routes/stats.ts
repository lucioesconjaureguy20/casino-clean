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

const router = Router();

const SUPABASE_URL         = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const SUPABASE_ANON_KEY    = process.env.SUPABASE_ANON_KEY!;
const ADMIN_USERNAMES      = () =>
  (process.env.ADMIN_USERNAMES || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

// ── Supabase helper ───────────────────────────────────────────────────────────

function sbAdmin(path: string, opts: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey:         SUPABASE_SERVICE_KEY,
      Authorization:  `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer:         "count=none",
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
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

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Sesión inválida." });
  const token = authHeader.slice(7);

  let userId: string | null = null;

  try {
    const gameUser = verifyGameToken(token) as any;
    if (gameUser) userId = gameUser.profileId;
  } catch {}

  if (!userId) {
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
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

function countDistinct(items: any[], field: string): number {
  return new Set(items.map(i => i[field]).filter(Boolean)).size;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── GET /api/admin/stats ──────────────────────────────────────────────────────

router.get("/admin/stats", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [balancesRes, txRes, withdrawalsRes, profilesRes] = await Promise.all([
      // All balance rows
      sbAdmin("balances?select=currency,balance,locked_amount"),

      // Transactions last 30 days (deposits + withdrawals)
      sbAdmin(
        `transactions?select=user_id,mander_id,type,amount,currency,created_at,status` +
        `&created_at=gte.${startOf("month").toISOString()}` +
        `&order=created_at.desc`,
      ),

      // All withdrawals (for status breakdown)
      sbAdmin("withdrawals?select=status,amount,currency,created_at,user_id"),

      // Profile count
      sbAdmin("profiles?select=id,username,created_at"),
    ]);

    if (!balancesRes.ok || !txRes.ok || !withdrawalsRes.ok || !profilesRes.ok) {
      throw new Error("Error fetching data from Supabase");
    }

    const balances:    any[] = await balancesRes.json();
    const txAll:       any[] = await txRes.json();
    const withdrawals: any[] = await withdrawalsRes.json();
    const profiles:    any[] = await profilesRes.json();

    // ── 1. Balance totals per currency ──────────────────────────────────────
    const balanceTotalsMap: Record<string, { currency: string; balance: number; locked: number; total: number }> = {};
    for (const row of balances) {
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
    const withdrawalsTx = txAll.filter(t => t.type === "withdrawal");
    const bonuses     = txAll.filter(t => t.type === "bonus");

    function periodStats(items: any[]) {
      const day   = filterByDate(items, "created_at", sinceDay);
      const week  = filterByDate(items, "created_at", sinceWeek);
      const month = items; // already filtered to last 30 days
      return {
        day:   { count: day.length,   total: round2(Math.abs(sumField(day, "amount"))) },
        week:  { count: week.length,  total: round2(Math.abs(sumField(week, "amount"))) },
        month: { count: month.length, total: round2(Math.abs(sumField(month, "amount"))) },
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
    const playerVolumeMap: Record<string, { volume: number; deposits: number; withdrawals: number; userId: string }> = {};
    for (const tx of txAll) {
      if (!tx.user_id) continue;
      if (!playerVolumeMap[tx.user_id])
        playerVolumeMap[tx.user_id] = { volume: 0, deposits: 0, withdrawals: 0, userId: tx.user_id };
      const abs = Math.abs(Number(tx.amount ?? 0));
      playerVolumeMap[tx.user_id].volume += abs;
      if (tx.type === "deposit")    playerVolumeMap[tx.user_id].deposits    += abs;
      if (tx.type === "withdrawal") playerVolumeMap[tx.user_id].withdrawals += abs;
    }

    const profileMap: Record<string, string> = {};
    for (const p of profiles) profileMap[p.id] = p.username;

    const topPlayers = Object.values(playerVolumeMap)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10)
      .map(p => ({
        username:    profileMap[p.userId] ?? p.userId,
        volume:      round2(p.volume),
        deposits:    round2(p.deposits),
        withdrawals: round2(p.withdrawals),
      }));

    // ── 6. New users by period ───────────────────────────────────────────────
    const newUsers = {
      day:   filterByDate(profiles, "created_at", sinceDay).length,
      week:  filterByDate(profiles, "created_at", sinceWeek).length,
      month: filterByDate(profiles, "created_at", sinceMonth).length,
      total: profiles.length,
    };

    // ── Response ─────────────────────────────────────────────────────────────
    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      balanceTotals,
      transactions,
      activeUsers,
      withdrawalsByStatus,
      topPlayers,
      newUsers,
    });
  } catch (err: unknown) {
    console.error("[STATS] Error:", err);
    return res.status(500).json({ error: "Error al obtener estadísticas." });
  }
});

export default router;
