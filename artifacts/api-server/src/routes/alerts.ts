/**
 * alerts.ts — Suspicious activity detection + user blocking
 *
 * Endpoints:
 *   GET  /api/admin/alerts          — analyze recent data, return flagged items
 *   POST /api/admin/user/block      — block user (requires is_blocked col in profiles)
 *   POST /api/admin/user/unblock    — unblock user
 *   GET  /api/admin/blocked-users   — list all blocked users
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
      Prefer:         "return=representation",
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
}

async function getProfile(userId: string) {
  const r = await sbAdmin(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=id,mander_id,username&limit=1`,
    { headers: { Prefer: "count=none" } },
  );
  if (!r.ok) return null;
  const rows: any[] = await r.json();
  return rows[0] ?? null;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      authUser?: { id: string; email: string; user_metadata: Record<string, any> };
    }
  }
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Sesión inválida." });
  const token = authHeader.slice(7);

  let userId: string | null = null;
  try {
    const g = verifyGameToken(token) as any;
    if (g) userId = g.profileId;
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

// ── Alert types ───────────────────────────────────────────────────────────────

type Severity = "critical" | "high" | "medium" | "low";

interface Alert {
  id:          string;
  severity:    Severity;
  type:        string;
  title:       string;
  detail:      string;
  username:    string;
  userId:      string;
  amount?:     number;
  currency?:   string;
  createdAt:   string;
}

// ── Approximate USD thresholds per currency ───────────────────────────────────

const APPROX_USD: Record<string, number> = {
  USDT: 1, USDC: 1, BTC: 65000, ETH: 2000, BNB: 580,
  SOL: 80, LTC: 50, TRX: 0.30, POL: 0.09,
};

function toUsd(amount: number, currency: string): number {
  return amount * (APPROX_USD[currency.toUpperCase()] ?? 1);
}

// Thresholds (USD equivalent)
const LARGE_WITHDRAWAL_USD   = 100;  // flag withdrawal above this
const LARGE_DEPOSIT_USD      = 250;  // flag deposit above this
const RAPID_WINDOW_MINUTES   = 60;   // window for rapid-transaction detection
const RAPID_TX_COUNT         = 5;    // flag user with > this many tx in window
const HIGH_BALANCE_PCT       = 0.80; // flag withdrawal > 80% of balance

// ── Price cache (refresh once per request batch) ──────────────────────────────

let cachedPrices: Record<string, number> = {};
let cacheTs = 0;

async function getPrices(): Promise<Record<string, number>> {
  if (Date.now() - cacheTs < 120_000) return cachedPrices;
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=tether,usd-coin,bitcoin,ethereum,binancecoin,solana,litecoin,tron,matic-network&vs_currencies=usd",
      { signal: AbortSignal.timeout(4000) },
    );
    if (r.ok) {
      const d = await r.json();
      cachedPrices = {
        USDT: d.tether?.usd ?? 1, USDC: d["usd-coin"]?.usd ?? 1,
        BTC: d.bitcoin?.usd ?? 65000, ETH: d.ethereum?.usd ?? 2000,
        BNB: d.binancecoin?.usd ?? 580, SOL: d.solana?.usd ?? 80,
        LTC: d.litecoin?.usd ?? 50, TRX: d.tron?.usd ?? 0.30,
        POL: d["matic-network"]?.usd ?? 0.09,
      };
      cacheTs = Date.now();
    }
  } catch {}
  return { ...APPROX_USD, ...cachedPrices };
}

// ── GET /api/admin/alerts ─────────────────────────────────────────────────────

router.get("/admin/alerts", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const since30d = new Date(Date.now() - 30 * 86400_000).toISOString();
    const since1h  = new Date(Date.now() -      3600_000).toISOString();

    const [prices, withdrawalsRes, txRes, profilesRes, balancesRes] = await Promise.all([
      getPrices(),
      sbAdmin(
        `withdrawals?select=id,user_id,amount,currency,status,created_at,wallet,network&order=created_at.desc`,
        { headers: { Prefer: "count=none" } },
      ),
      sbAdmin(
        `transactions?select=id,user_id,mander_id,type,amount,currency,created_at&created_at=gte.${since30d}&order=created_at.desc`,
        { headers: { Prefer: "count=none" } },
      ),
      sbAdmin(`profiles?select=id,username,is_blocked,created_at`, { headers: { Prefer: "count=none" } }),
      sbAdmin(`balances?select=user_id,mander_id,currency,balance,locked_amount`, { headers: { Prefer: "count=none" } }),
    ]);

    const withdrawals: any[] = withdrawalsRes.ok ? await withdrawalsRes.json() : [];
    const txAll:       any[] = txRes.ok       ? await txRes.json()       : [];
    const profilesRaw: any[] = profilesRes.ok ? await profilesRes.json() : [];
    const balancesRaw: any[] = balancesRes.ok ? await balancesRes.json() : [];

    // Build lookup maps
    const profileMap: Record<string, { username: string; is_blocked?: boolean }> = {};
    for (const p of profilesRaw) profileMap[p.id] = { username: p.username, is_blocked: p.is_blocked };

    // mander_id → user_id map (from balances)
    const manderToUser: Record<string, string> = {};
    for (const b of balancesRaw) if (b.user_id) manderToUser[b.mander_id] = b.user_id;

    // balance lookup: user_id+currency → { balance, locked }
    const balMap: Record<string, { balance: number; locked: number }> = {};
    for (const b of balancesRaw) {
      const uid = b.user_id ?? manderToUser[b.mander_id];
      if (!uid) continue;
      const key = `${uid}::${b.currency}`;
      balMap[key] = { balance: Number(b.balance ?? 0), locked: Number(b.locked_amount ?? 0) };
    }

    const alerts: Alert[] = [];
    let alertIdx = 0;
    function uid() { return `alert-${++alertIdx}`; }

    // ── Rule 1: Large withdrawals ───────────────────────────────────────────
    for (const w of withdrawals) {
      if (w.status === "rejected") continue;
      const usd = toUsd(Number(w.amount), w.currency);
      const username = profileMap[w.user_id]?.username ?? w.user_id;
      if (usd >= LARGE_WITHDRAWAL_USD) {
        const sev: Severity = usd >= 500 ? "critical" : usd >= 200 ? "high" : "medium";
        alerts.push({
          id: uid(), severity: sev, type: "large_withdrawal",
          title: `Retiro grande — ${w.amount} ${w.currency}`,
          detail: `≈ $${Math.round(usd)} USD · Red: ${w.network} · Wallet: ${w.wallet?.slice(0, 16)}…`,
          username, userId: w.user_id, amount: Number(w.amount), currency: w.currency,
          createdAt: w.created_at,
        });
      }
    }

    // ── Rule 2: Withdrawal > HIGH_BALANCE_PCT of total balance ─────────────
    for (const w of withdrawals) {
      if (w.status === "paid" || w.status === "rejected") continue;
      const key = `${w.user_id}::${w.currency}`;
      const bal = balMap[key];
      if (!bal) continue;
      const totalFunds = bal.balance + bal.locked;
      if (totalFunds <= 0) continue;
      const pct = Number(w.amount) / totalFunds;
      if (pct >= HIGH_BALANCE_PCT) {
        const username = profileMap[w.user_id]?.username ?? w.user_id;
        alerts.push({
          id: uid(), severity: "high", type: "balance_drain",
          title: `Retiro del ${Math.round(pct * 100)}% del balance total`,
          detail: `${w.amount} ${w.currency} de ${totalFunds.toFixed(4)} totales — status: ${w.status}`,
          username, userId: w.user_id, amount: Number(w.amount), currency: w.currency,
          createdAt: w.created_at,
        });
      }
    }

    // ── Rule 3: Large deposits ──────────────────────────────────────────────
    for (const tx of txAll) {
      if (tx.type !== "deposit") continue;
      const usd = toUsd(Math.abs(Number(tx.amount)), tx.currency);
      if (usd < LARGE_DEPOSIT_USD) continue;
      const userId = tx.user_id ?? manderToUser[tx.mander_id];
      const username = profileMap[userId]?.username ?? userId;
      alerts.push({
        id: uid(), severity: usd >= 1000 ? "high" : "medium", type: "large_deposit",
        title: `Depósito grande — ${Math.abs(Number(tx.amount))} ${tx.currency}`,
        detail: `≈ $${Math.round(usd)} USD`,
        username, userId, amount: Math.abs(Number(tx.amount)), currency: tx.currency,
        createdAt: tx.created_at,
      });
    }

    // ── Rule 4: Rapid transactions (> RAPID_TX_COUNT in last hour) ──────────
    const recentTx = txAll.filter(t => t.created_at >= since1h);
    const txCountByUser: Record<string, number> = {};
    for (const tx of recentTx) {
      const userId = tx.user_id ?? manderToUser[tx.mander_id];
      if (!userId) continue;
      txCountByUser[userId] = (txCountByUser[userId] ?? 0) + 1;
    }
    for (const [userId, count] of Object.entries(txCountByUser)) {
      if (count <= RAPID_TX_COUNT) continue;
      const username = profileMap[userId]?.username ?? userId;
      alerts.push({
        id: uid(), severity: count >= 10 ? "critical" : "high", type: "rapid_activity",
        title: `Actividad rápida — ${count} transacciones en 1 hora`,
        detail: `Usuario con ${count} movimientos en la última hora. Posible actividad automatizada.`,
        username, userId, createdAt: new Date().toISOString(),
      });
    }

    // ── Rule 5: Withdrawal right after deposit (< 30 min gap) ──────────────
    const depositsByUser: Record<string, Date[]> = {};
    for (const tx of txAll) {
      if (tx.type !== "deposit") continue;
      const userId = tx.user_id ?? manderToUser[tx.mander_id];
      if (!userId) continue;
      (depositsByUser[userId] ??= []).push(new Date(tx.created_at));
    }
    for (const w of withdrawals) {
      if (w.status === "rejected") continue;
      const depDates = depositsByUser[w.user_id] ?? [];
      const wDate = new Date(w.created_at);
      const closeDep = depDates.find(d => {
        const diff = (wDate.getTime() - d.getTime()) / 60000;
        return diff >= 0 && diff <= 30;
      });
      if (!closeDep) continue;
      const username = profileMap[w.user_id]?.username ?? w.user_id;
      const diffMin = Math.round((wDate.getTime() - closeDep.getTime()) / 60000);
      alerts.push({
        id: uid(), severity: "high", type: "instant_withdrawal",
        title: `Retiro ${diffMin} min después de depósito`,
        detail: `${w.amount} ${w.currency} retirados a los ${diffMin} minutos de un depósito. Posible cash-out.`,
        username, userId: w.user_id, amount: Number(w.amount), currency: w.currency,
        createdAt: w.created_at,
      });
    }

    // ── Rule 6: Multiple pending withdrawals (shouldn't happen, but guard) ──
    const pendingByUser: Record<string, number> = {};
    for (const w of withdrawals) {
      if (w.status !== "pending" && w.status !== "approved") continue;
      pendingByUser[w.user_id] = (pendingByUser[w.user_id] ?? 0) + 1;
    }
    for (const [userId, count] of Object.entries(pendingByUser)) {
      if (count < 2) continue;
      const username = profileMap[userId]?.username ?? userId;
      alerts.push({
        id: uid(), severity: "critical", type: "multiple_pending",
        title: `${count} retiros pendientes simultáneos`,
        detail: `Un usuario tiene ${count} retiros en estado pending/approved al mismo tiempo. Verificar manualmente.`,
        username, userId, createdAt: new Date().toISOString(),
      });
    }

    // Sort: critical → high → medium → low, then by date desc
    const SEV_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    alerts.sort((a, b) => {
      const diff = SEV_RANK[a.severity] - SEV_RANK[b.severity];
      if (diff !== 0) return diff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Summary
    const summary = {
      total:    alerts.length,
      critical: alerts.filter(a => a.severity === "critical").length,
      high:     alerts.filter(a => a.severity === "high").length,
      medium:   alerts.filter(a => a.severity === "medium").length,
      low:      alerts.filter(a => a.severity === "low").length,
    };

    // Blocked users
    const blockedUsers = profilesRaw
      .filter(p => p.is_blocked === true)
      .map(p => ({ id: p.id, username: p.username, blockedAt: p.created_at }));

    return res.json({ ok: true, alerts, summary, blockedUsers, generatedAt: new Date().toISOString() });
  } catch (err: unknown) {
    console.error("[ALERTS] Error:", err);
    return res.status(500).json({ error: "Error al generar alertas." });
  }
});

// ── POST /api/admin/user/block ────────────────────────────────────────────────

router.post("/admin/user/block", requireAdmin, async (req: Request, res: Response) => {
  const { user_id, username, reason } = req.body;
  const target = user_id || (username ? `eq.username.${username}` : null);
  if (!user_id && !username) return res.status(400).json({ error: "user_id o username requerido." });

  const filter = user_id
    ? `profiles?id=eq.${encodeURIComponent(user_id)}`
    : `profiles?username=eq.${encodeURIComponent(username)}`;

  const r = await sbAdmin(filter, {
    method: "PATCH",
    body: JSON.stringify({ is_blocked: true }),
    headers: { Prefer: "return=representation" },
  });

  if (!r.ok) {
    const err = await r.text();
    console.error("[BLOCK] PATCH error:", err);
    if (err.includes("is_blocked")) {
      return res.status(500).json({
        error: "La columna is_blocked no existe en la tabla profiles. Ejecutar en Supabase SQL Editor: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false;",
      });
    }
    return res.status(500).json({ error: "Error al bloquear el usuario." });
  }

  const [updated] = await r.json();
  if (!updated) return res.status(404).json({ error: "Usuario no encontrado." });

  const adminWho = req.authUser?.id ?? "unknown";
  console.log(`[BLOCK] user=${updated.username ?? user_id} blocked by admin=${adminWho}. Reason: ${reason ?? "—"}`);
  return res.json({ ok: true, message: `Usuario ${updated.username} bloqueado.` });
});

// ── POST /api/admin/user/unblock ──────────────────────────────────────────────

router.post("/admin/user/unblock", requireAdmin, async (req: Request, res: Response) => {
  const { user_id, username } = req.body;
  if (!user_id && !username) return res.status(400).json({ error: "user_id o username requerido." });

  const filter = user_id
    ? `profiles?id=eq.${encodeURIComponent(user_id)}`
    : `profiles?username=eq.${encodeURIComponent(username)}`;

  const r = await sbAdmin(filter, {
    method: "PATCH",
    body: JSON.stringify({ is_blocked: false }),
    headers: { Prefer: "return=representation" },
  });

  if (!r.ok) {
    const err = await r.text();
    if (err.includes("is_blocked"))
      return res.status(500).json({ error: "La columna is_blocked no existe aún en profiles." });
    return res.status(500).json({ error: "Error al desbloquear el usuario." });
  }

  const [updated] = await r.json();
  if (!updated) return res.status(404).json({ error: "Usuario no encontrado." });

  console.log(`[UNBLOCK] user=${updated.username ?? user_id}`);
  return res.json({ ok: true, message: `Usuario ${updated.username} desbloqueado.` });
});

// ── GET /api/admin/blocked-users ──────────────────────────────────────────────

router.get("/admin/blocked-users", requireAdmin, async (_req: Request, res: Response) => {
  const r = await sbAdmin(
    "profiles?is_blocked=eq.true&select=id,username,created_at",
    { headers: { Prefer: "count=none" } },
  );
  if (!r.ok) return res.json({ blockedUsers: [] }); // graceful if column doesn't exist
  const users: any[] = await r.json();
  return res.json({ blockedUsers: users });
});

export { requireAdmin as alertsRequireAdmin };
export default router;
