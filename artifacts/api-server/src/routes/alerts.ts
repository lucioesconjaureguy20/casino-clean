/**
 * alerts.ts — Suspicious activity detection + user blocking
 *
 * GET  /api/admin/alerts?period=today|7d|30d  — analyze + return flagged items
 * POST /api/admin/user/block                  — block user
 * POST /api/admin/user/unblock                — unblock user
 * GET  /api/admin/blocked-users               — list blocked users
 */

import { Router, Request, Response, NextFunction } from "express";
import { verifyGameToken } from "../lib/gameToken.js";
import fs from "node:fs";
import path from "node:path";

const AUDIT_LOG      = path.join(process.cwd(), "block_audit.jsonl");
const FLAG_AUDIT_LOG = path.join(process.cwd(), "flag_audit.jsonl");

function writeAudit(entry: Record<string, unknown>, file = AUDIT_LOG) {
  try {
    fs.appendFileSync(file, JSON.stringify({ ...entry, ts: new Date().toISOString() }) + "\n");
  } catch (e) {
    console.error("[AUDIT] write failed:", e);
  }
}

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

async function getProfile(userId: string) {
  const r = await sbAdmin(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=id,mander_id,username,is_blocked&limit=1`,
  );
  if (!r.ok) return null;
  const rows: any[] = await r.json();
  return rows[0] ?? null;
}

// ── Auth middleware ───────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      authUser?: { id: string; email: string; user_metadata: Record<string, any> };
    }
  }
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ error: "Sesión inválida." });
  const token = authHeader.slice(7);

  let userId: string | null = null;
  try { const g = verifyGameToken(token) as any; if (g) userId = g.profileId; } catch {}

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

// ── Types ─────────────────────────────────────────────────────────────────────

export type AlertSeverity = "critical" | "medium" | "low";
export type AlertType =
  | "large_withdrawal"
  | "large_deposit"
  | "balance_drain"
  | "rapid_activity"
  | "instant_withdrawal"
  | "multiple_pending"
  | "flagged_wallet"
  | "high_locked"
  | "low_wagering_cashout";

export interface Alert {
  id:          string;          // deterministic, stable across refreshes
  severity:    AlertSeverity;
  type:        AlertType;
  title:       string;
  detail:      string;
  username:    string;
  userId:      string;
  amount?:     number;
  currency?:   string;
  wallet?:     string;
  network?:    string;
  txId?:       string;
  createdAt:   string;
}

// ── USD thresholds per currency ───────────────────────────────────────────────

const PRICE_APPROX: Record<string, number> = {
  USDT: 1, USDC: 1, BTC: 65000, ETH: 2000, BNB: 580,
  SOL: 80, LTC: 50, TRX: 0.30,
};

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
        USDT: d.tether?.usd ?? 1,       USDC: d["usd-coin"]?.usd ?? 1,
        BTC:  d.bitcoin?.usd ?? 65000,  ETH: d.ethereum?.usd ?? 2000,
        BNB:  d.binancecoin?.usd ?? 580, SOL: d.solana?.usd ?? 80,
        LTC:  d.litecoin?.usd ?? 50,    TRX: d.tron?.usd ?? 0.30,
      };
      cacheTs = Date.now();
    }
  } catch {}
  return { ...PRICE_APPROX, ...cachedPrices };
}

function toUsd(amount: number, currency: string, prices: Record<string, number>): number {
  return Math.abs(amount) * (prices[currency?.toUpperCase()] ?? 1);
}

// ── Deterministic alert ID ────────────────────────────────────────────────────

function makeId(type: string, userId: string, extra: string): string {
  return `${type}__${userId}__${extra}`.replace(/[^a-zA-Z0-9_\-.]/g, "_");
}

// ── Thresholds ────────────────────────────────────────────────────────────────

const THR = {
  WITHDRAW_CRITICAL_USD:    500,
  WITHDRAW_HIGH_USD:        100,
  DEPOSIT_HIGH_USD:         500,
  DEPOSIT_MEDIUM_USD:       200,
  BALANCE_DRAIN_PCT:        0.80,
  RAPID_WINDOW_MS:          3600_000,   // 1 hour
  RAPID_TX_COUNT:           5,
  INSTANT_WITHDRAW_MIN:     30,         // withdraw within N minutes of deposit
  HIGH_LOCKED_USD:          50,         // flag locked_amount above this
  HIGH_LOCKED_PCT:          0.60,       // or above 60% of total funds
  LOW_WAGERING_RATIO:       0.80,       // withdrew >= 80% of what was deposited
  LOW_WAGERING_WINDOW_H:    24,         // within this many hours
  LOW_WAGERING_MIN_USD:     10,         // ignore micro-amounts
};

// ── Period helper ─────────────────────────────────────────────────────────────

function periodStart(period: string): Date {
  const now = Date.now();
  if (period === "today") return new Date(now - 86_400_000);
  if (period === "7d")    return new Date(now - 7  * 86_400_000);
  return                         new Date(now - 30 * 86_400_000);
}

// ── GET /api/admin/alerts ─────────────────────────────────────────────────────

router.get("/admin/alerts", requireAdmin, async (req: Request, res: Response) => {
  try {
    const period   = (req.query.period as string) || "30d";
    const since    = periodStart(period).toISOString();
    // For wallet duplicates we always scan ALL history
    const sinceAll = new Date(Date.now() - 365 * 86_400_000).toISOString();

    const [prices, wRes, txRes, profResRaw, balRes] = await Promise.all([
      getPrices(),
      sbAdmin(`withdrawals?select=id,user_id,amount,currency,status,wallet,network,created_at&order=created_at.desc`),
      sbAdmin(`transactions?select=id,user_id,mander_id,type,amount,currency,created_at&created_at=gte.${since}&order=created_at.desc`),
      sbAdmin(`profiles?select=id,username,is_blocked,is_flagged`),
      sbAdmin(`balances?select=user_id,mander_id,currency,balance,locked_amount`),
    ]);

    // If is_flagged column doesn't exist yet, fall back to query without it
    const profRes = profResRaw.ok
      ? profResRaw
      : await sbAdmin(`profiles?select=id,username,is_blocked`);

    const withdrawals: any[] = wRes.ok  ? await wRes.json()  : [];
    const txAll:       any[] = txRes.ok ? await txRes.json() : [];
    const profiles:    any[] = profRes.ok ? await profRes.json() : [];
    const balances:    any[] = balRes.ok  ? await balRes.json()  : [];

    // ── Build lookup maps ─────────────────────────────────────────────────────

    const profMap: Record<string, { username: string; is_blocked?: boolean; is_flagged?: boolean }> = {};
    for (const p of profiles) profMap[p.id] = { username: p.username, is_blocked: p.is_blocked, is_flagged: p.is_flagged };

    const manderToUser: Record<string, string> = {};
    for (const b of balances) if (b.user_id) manderToUser[b.mander_id] = b.user_id;

    const balMap: Record<string, { balance: number; locked: number }> = {};
    for (const b of balances) {
      const uid = b.user_id ?? manderToUser[b.mander_id];
      if (!uid) continue;
      const key = `${uid}::${b.currency}`;
      balMap[key] = { balance: Number(b.balance ?? 0), locked: Number(b.locked_amount ?? 0) };
    }

    // Period-filtered withdrawals
    const wFiltered = withdrawals.filter(w => w.created_at >= since);

    function username(userId: string) {
      return profMap[userId]?.username ?? userId?.slice(0, 8) ?? "?";
    }

    const alerts: Alert[] = [];

    // ── Rule 1: Large withdrawals ─────────────────────────────────────────────
    for (const w of wFiltered) {
      if (w.status === "rejected") continue;
      const usd = toUsd(w.amount, w.currency, prices);
      if (usd < THR.WITHDRAW_HIGH_USD) continue;
      const sev: AlertSeverity = usd >= THR.WITHDRAW_CRITICAL_USD ? "critical" : "medium";
      alerts.push({
        id:        makeId("large_withdrawal", w.user_id, `${w.currency}_${Math.round(usd)}_${w.created_at.slice(0,13)}`),
        severity:  sev, type: "large_withdrawal",
        title:     `Retiro grande — ${Number(w.amount).toFixed(4)} ${w.currency}`,
        detail:    `≈ $${Math.round(usd)} USD · Red: ${w.network ?? "—"} · Status: ${w.status}`,
        username:  username(w.user_id), userId: w.user_id,
        amount:    Number(w.amount), currency: w.currency,
        wallet:    w.wallet, network: w.network, txId: w.id,
        createdAt: w.created_at,
      });
    }

    // ── Rule 2: Balance drain (withdrawal > 80% of total funds) ───────────────
    for (const w of wFiltered) {
      if (w.status === "paid" || w.status === "rejected") continue;
      const bal = balMap[`${w.user_id}::${w.currency}`];
      if (!bal) continue;
      const total = bal.balance + bal.locked;
      if (total <= 0) continue;
      const pct = Number(w.amount) / total;
      if (pct < THR.BALANCE_DRAIN_PCT) continue;
      alerts.push({
        id:        makeId("balance_drain", w.user_id, `${w.currency}_${w.created_at.slice(0,10)}`),
        severity:  "critical", type: "balance_drain",
        title:     `Retiro del ${Math.round(pct * 100)}% del balance total`,
        detail:    `${Number(w.amount).toFixed(4)} ${w.currency} de ${total.toFixed(4)} disponibles · Status: ${w.status}`,
        username:  username(w.user_id), userId: w.user_id,
        amount:    Number(w.amount), currency: w.currency,
        wallet:    w.wallet, network: w.network, txId: w.id,
        createdAt: w.created_at,
      });
    }

    // ── Rule 3: Large deposits ────────────────────────────────────────────────
    for (const tx of txAll) {
      if (tx.type !== "deposit") continue;
      const usd = toUsd(tx.amount, tx.currency, prices);
      if (usd < THR.DEPOSIT_MEDIUM_USD) continue;
      const uid = tx.user_id ?? manderToUser[tx.mander_id];
      const sev: AlertSeverity = usd >= THR.DEPOSIT_HIGH_USD ? "medium" : "low";
      alerts.push({
        id:        makeId("large_deposit", uid, `${tx.currency}_${Math.round(usd)}_${tx.created_at.slice(0,13)}`),
        severity:  sev, type: "large_deposit",
        title:     `Depósito grande — ${Math.abs(Number(tx.amount)).toFixed(4)} ${tx.currency}`,
        detail:    `≈ $${Math.round(usd)} USD`,
        username:  username(uid), userId: uid,
        amount:    Math.abs(Number(tx.amount)), currency: tx.currency,
        txId:      tx.id, createdAt: tx.created_at,
      });
    }

    // ── Rule 4: Rapid activity (> N transactions in 1 hour) ───────────────────
    const since1h = new Date(Date.now() - THR.RAPID_WINDOW_MS).toISOString();
    const recentTx = txAll.filter(t => t.created_at >= since1h);
    const txCountByUser: Record<string, number> = {};
    for (const tx of recentTx) {
      const uid = tx.user_id ?? manderToUser[tx.mander_id];
      if (uid) txCountByUser[uid] = (txCountByUser[uid] ?? 0) + 1;
    }
    for (const [uid, count] of Object.entries(txCountByUser)) {
      if (count <= THR.RAPID_TX_COUNT) continue;
      const sev: AlertSeverity = count >= 10 ? "critical" : "medium";
      alerts.push({
        id:        makeId("rapid_activity", uid, `count${count}_${new Date().toISOString().slice(0,10)}`),
        severity:  sev, type: "rapid_activity",
        title:     `Actividad rápida — ${count} transacciones en 1 hora`,
        detail:    `Posible bot o actividad automatizada. ${count} movimientos en los últimos 60 minutos.`,
        username:  username(uid), userId: uid,
        createdAt: new Date().toISOString(),
      });
    }

    // ── Rule 5: Instant withdrawal (< 30 min after deposit) ───────────────────
    const depositsByUser: Record<string, { date: Date; txId: string }[]> = {};
    for (const tx of txAll) {
      if (tx.type !== "deposit") continue;
      const uid = tx.user_id ?? manderToUser[tx.mander_id];
      if (!uid) continue;
      (depositsByUser[uid] ??= []).push({ date: new Date(tx.created_at), txId: tx.id });
    }
    for (const w of wFiltered) {
      if (w.status === "rejected") continue;
      const deps = depositsByUser[w.user_id] ?? [];
      const wDate = new Date(w.created_at);
      const close = deps.find(d => {
        const diff = (wDate.getTime() - d.date.getTime()) / 60000;
        return diff >= 0 && diff <= THR.INSTANT_WITHDRAW_MIN;
      });
      if (!close) continue;
      const diffMin = Math.round((wDate.getTime() - close.date.getTime()) / 60000);
      alerts.push({
        id:        makeId("instant_withdrawal", w.user_id, `${w.currency}_${w.created_at.slice(0,13)}`),
        severity:  "medium", type: "instant_withdrawal",
        title:     `Retiro ${diffMin} min después de depósito`,
        detail:    `${Number(w.amount).toFixed(4)} ${w.currency} retirados a los ${diffMin} min de un depósito · Posible cash-out.`,
        username:  username(w.user_id), userId: w.user_id,
        amount:    Number(w.amount), currency: w.currency,
        wallet:    w.wallet, network: w.network, txId: w.id,
        createdAt: w.created_at,
      });
    }

    // ── Rule 5b: Low-wagering cashout (deposit → near-full withdrawal, minimal play) ──────
    // Detects: user deposits X, then withdraws ≥80% of X within 24h in same currency
    // Classic pattern for: referral fraud, fake-deposit cashout, money-pass-through
    {
      const windowMs = THR.LOW_WAGERING_WINDOW_H * 3600_000;

      // Build per-user, per-currency deposit list from period transactions
      const depsByUserCur: Record<string, { amount: number; usd: number; date: Date; txId: string }[]> = {};
      for (const tx of txAll) {
        if (tx.type !== "deposit") continue;
        const uid = tx.user_id ?? manderToUser[tx.mander_id];
        if (!uid) continue;
        const amt = Math.abs(Number(tx.amount));
        const usd = toUsd(amt, tx.currency, prices);
        if (usd < THR.LOW_WAGERING_MIN_USD) continue;
        const key = `${uid}::${tx.currency}`;
        (depsByUserCur[key] ??= []).push({ amount: amt, usd, date: new Date(tx.created_at), txId: tx.id });
      }

      // Check each withdrawal against deposits in the same currency within the window
      for (const w of wFiltered) {
        if (w.status === "rejected") continue;
        const wAmt = Number(w.amount);
        const wUsd = toUsd(wAmt, w.currency, prices);
        if (wUsd < THR.LOW_WAGERING_MIN_USD) continue;
        const wDate = new Date(w.created_at);
        const key = `${w.user_id}::${w.currency}`;
        const deps = depsByUserCur[key] ?? [];

        // Sum all deposits in this currency within the window BEFORE this withdrawal
        const windowDeposits = deps.filter(d => {
          const diff = wDate.getTime() - d.date.getTime();
          return diff >= 0 && diff <= windowMs;
        });
        if (windowDeposits.length === 0) continue;

        const totalDeposited = windowDeposits.reduce((s, d) => s + d.amount, 0);
        const totalDepUsd    = windowDeposits.reduce((s, d) => s + d.usd, 0);
        const ratio = wAmt / totalDeposited;

        if (ratio < THR.LOW_WAGERING_RATIO) continue;

        // Check if a referral bonus was received between first deposit and withdrawal
        const firstDep = windowDeposits.reduce((min, d) => d.date < min.date ? d : min, windowDeposits[0]);
        const gotReferralBonus = txAll.some(tx => {
          if (tx.type !== "bonus") return false;
          const txUid = tx.user_id ?? manderToUser[tx.mander_id];
          if (txUid !== w.user_id) return false;
          const txDate = new Date(tx.created_at);
          return txDate >= firstDep.date && txDate <= wDate;
        });

        const hoursAfter = Math.round((wDate.getTime() - firstDep.date.getTime()) / 3600_000 * 10) / 10;
        const sev: AlertSeverity = gotReferralBonus ? "critical" : ratio >= 0.95 ? "critical" : "medium";

        alerts.push({
          id:        makeId("low_wagering_cashout", w.user_id, `${w.currency}_${w.created_at.slice(0,13)}`),
          severity:  sev, type: "low_wagering_cashout",
          title:     `Cash-out con wager mínimo — ${Math.round(ratio * 100)}% del depósito`,
          detail:    [
            `Depositó ${totalDeposited.toFixed(4)} ${w.currency} (≈$${Math.round(totalDepUsd)} USD)`,
            `y retiró ${wAmt.toFixed(4)} ${w.currency} ${hoursAfter < 1 ? `en ${Math.round(hoursAfter * 60)} min` : `en ${hoursAfter}h`}.`,
            gotReferralBonus ? "⚠️ Recibió bono entre depósito y retiro — posible fraude de referido." : "Wager casi nulo antes del retiro.",
          ].join(" "),
          username:  username(w.user_id), userId: w.user_id,
          amount:    wAmt, currency: w.currency,
          wallet:    w.wallet, network: w.network, txId: w.id,
          createdAt: w.created_at,
        });
      }
    }

    // ── Rule 6: Multiple pending withdrawals ──────────────────────────────────
    const pendingByUser: Record<string, number> = {};
    for (const w of withdrawals) {
      if (w.status !== "pending" && w.status !== "approved") continue;
      pendingByUser[w.user_id] = (pendingByUser[w.user_id] ?? 0) + 1;
    }
    for (const [uid, count] of Object.entries(pendingByUser)) {
      if (count < 2) continue;
      alerts.push({
        id:        makeId("multiple_pending", uid, `count${count}`),
        severity:  "critical", type: "multiple_pending",
        title:     `${count} retiros pendientes simultáneos`,
        detail:    `Un mismo usuario tiene ${count} retiros en estado pending/approved. Verificar manualmente.`,
        username:  username(uid), userId: uid,
        createdAt: new Date().toISOString(),
      });
    }

    // ── Rule 7: Flagged wallet — same wallet used by 2+ accounts ─────────────
    // Collect all wallets from ALL withdrawals (full history)
    const walletToUsers: Record<string, Set<string>> = {};
    for (const w of withdrawals) {
      if (!w.wallet || w.wallet.length < 10) continue;
      const wKey = w.wallet.trim().toLowerCase();
      (walletToUsers[wKey] ??= new Set()).add(w.user_id);
    }
    for (const [wallet, userSet] of Object.entries(walletToUsers)) {
      if (userSet.size < 2) continue;
      const usersArr = [...userSet];
      // Only flag if at least one of these users had activity in the period
      const hasRecentActivity = usersArr.some(uid => {
        return wFiltered.some(w => w.user_id === uid) || txAll.some(t => {
          const txUid = t.user_id ?? manderToUser[t.mander_id];
          return txUid === uid;
        });
      });
      if (!hasRecentActivity) continue;

      const usernames = usersArr.map(uid => username(uid)).join(", ");
      const displayWallet = wallet.slice(0, 10) + "…" + wallet.slice(-6);

      // Generate one alert per affected user
      for (const uid of usersArr) {
        const others = usersArr.filter(u => u !== uid).map(u => username(u)).join(", ");
        alerts.push({
          id:        makeId("flagged_wallet", uid, wallet.slice(0, 20)),
          severity:  "medium", type: "flagged_wallet",
          title:     `Wallet compartida — ${displayWallet}`,
          detail:    `Esta wallet también es usada por: ${others}. Posible multi-cuenta.`,
          username:  username(uid), userId: uid,
          wallet:    wallet,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // ── Rule 8: High locked_amount ────────────────────────────────────────────
    for (const [key, bal] of Object.entries(balMap)) {
      if (bal.locked <= 0) continue;
      const [uid, currency] = key.split("::");
      const lockedUsd = toUsd(bal.locked, currency, prices);
      const total = bal.balance + bal.locked;
      const lockedPct = total > 0 ? bal.locked / total : 0;
      if (lockedUsd < THR.HIGH_LOCKED_USD && lockedPct < THR.HIGH_LOCKED_PCT) continue;
      alerts.push({
        id:        makeId("high_locked", uid, `${currency}_${Math.round(lockedUsd)}`),
        severity:  lockedUsd >= 200 ? "medium" : "low", type: "high_locked",
        title:     `Fondos bloqueados — ${bal.locked.toFixed(4)} ${currency}`,
        detail:    `≈ $${Math.round(lockedUsd)} USD en retiros pendientes · ${Math.round(lockedPct * 100)}% del balance total.`,
        username:  username(uid), userId: uid,
        amount:    bal.locked, currency,
        createdAt: new Date().toISOString(),
      });
    }

    // ── Deduplicate by id ─────────────────────────────────────────────────────
    const seen = new Set<string>();
    const unique = alerts.filter(a => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });

    // ── Sort: critical → medium → low, then by date desc ─────────────────────
    const RANK: Record<AlertSeverity, number> = { critical: 0, medium: 1, low: 2 };
    unique.sort((a, b) => {
      const d = RANK[a.severity] - RANK[b.severity];
      if (d !== 0) return d;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const summary = {
      total:    unique.length,
      critical: unique.filter(a => a.severity === "critical").length,
      medium:   unique.filter(a => a.severity === "medium").length,
      low:      unique.filter(a => a.severity === "low").length,
    };

    // ── Leer audit logs para timestamps de bloqueo y flagging ─────────────────
    function readAuditTimestamps(file: string, action: string): Record<string, string> {
      const ts: Record<string, string> = {};
      try {
        const raw = fs.readFileSync(file, "utf8");
        for (const line of raw.split("\n").filter(Boolean)) {
          try {
            const e = JSON.parse(line);
            if (e.action === action && e.target_user_id && e.ts) {
              if (!ts[e.target_user_id] || e.ts > ts[e.target_user_id]) ts[e.target_user_id] = e.ts;
            }
          } catch {}
        }
      } catch {}
      return ts;
    }

    const blockTimestamps = readAuditTimestamps(AUDIT_LOG,      "block");
    const flagTimestamps  = readAuditTimestamps(FLAG_AUDIT_LOG, "flag");

    const blockedUsers = profiles
      .filter(p => p.is_blocked === true)
      .map(p => ({ id: p.id, username: p.username, blocked_at: blockTimestamps[p.id] ?? null }));

    const flaggedUsers = profiles
      .filter(p => p.is_flagged === true && p.is_blocked !== true)
      .map(p => ({ id: p.id, username: p.username, flagged_at: flagTimestamps[p.id] ?? null }));

    return res.json({ ok: true, alerts: unique, summary, blockedUsers, flaggedUsers, period, generatedAt: new Date().toISOString() });
  } catch (err: unknown) {
    console.error("[ALERTS]", err);
    return res.status(500).json({ error: "Error al generar alertas." });
  }
});

// ── POST /api/admin/user/block ────────────────────────────────────────────────

router.post("/admin/user/block", requireAdmin, async (req: Request, res: Response) => {
  const { user_id, username, reason } = req.body;
  if (!user_id && !username) return res.status(400).json({ error: "user_id o username requerido." });

  const filter = user_id
    ? `profiles?id=eq.${encodeURIComponent(user_id)}`
    : `profiles?username=eq.${encodeURIComponent(username)}`;

  const r = await sbAdmin(filter, {
    method:  "PATCH",
    body:    JSON.stringify({ is_blocked: true }),
    headers: { Prefer: "return=representation" },
  });

  if (!r.ok) {
    const err = await r.text();
    if (err.includes("is_blocked"))
      return res.status(500).json({ error: "Columna is_blocked falta. Ejecutar en Supabase SQL Editor: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false;" });
    return res.status(500).json({ error: "Error al bloquear." });
  }

  const [updated] = await r.json();
  if (!updated) return res.status(404).json({ error: "Usuario no encontrado." });
  console.log(`[BLOCK] ${updated.username} by admin=${req.authUser?.id}. Reason: ${reason ?? "—"}`);
  writeAudit({ action: "block", target_user_id: updated.id, target_username: updated.username, admin_id: req.authUser?.id, reason: reason ?? null });
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
    method:  "PATCH",
    body:    JSON.stringify({ is_blocked: false }),
    headers: { Prefer: "return=representation" },
  });

  if (!r.ok) {
    const err = await r.text();
    if (err.includes("is_blocked"))
      return res.status(500).json({ error: "Columna is_blocked falta en profiles." });
    return res.status(500).json({ error: "Error al desbloquear." });
  }
  const [updated] = await r.json();
  if (!updated) return res.status(404).json({ error: "Usuario no encontrado." });
  console.log(`[UNBLOCK] ${updated.username} by admin=${req.authUser?.id}`);
  writeAudit({ action: "unblock", target_user_id: updated.id, target_username: updated.username, admin_id: req.authUser?.id });
  return res.json({ ok: true, message: `Usuario ${updated.username} desbloqueado.` });
});

// ── GET /api/admin/blocked-users ──────────────────────────────────────────────

router.get("/admin/blocked-users", requireAdmin, async (_req: Request, res: Response) => {
  const r = await sbAdmin("profiles?is_blocked=eq.true&select=id,username,created_at");
  if (!r.ok) return res.json({ blockedUsers: [] });
  return res.json({ blockedUsers: await r.json() });
});

// ── POST /api/admin/user/flag ─────────────────────────────────────────────────

router.post("/admin/user/flag", requireAdmin, async (req: Request, res: Response) => {
  const { user_id, reason } = req.body;
  if (!user_id) return res.status(400).json({ error: "user_id requerido." });

  const r = await sbAdmin(`profiles?id=eq.${encodeURIComponent(user_id)}`, {
    method:  "PATCH",
    body:    JSON.stringify({ is_flagged: true }),
    headers: { Prefer: "return=representation" },
  });

  if (!r.ok) {
    const err = await r.text();
    if (err.includes("is_flagged"))
      return res.status(500).json({ error: "Columna is_flagged falta. Ejecutar en Supabase SQL Editor: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_flagged boolean DEFAULT false;" });
    return res.status(500).json({ error: "Error al marcar usuario." });
  }

  const [updated] = await r.json();
  if (!updated) return res.status(404).json({ error: "Usuario no encontrado." });
  console.log(`[FLAG] ${updated.username} by admin=${req.authUser?.id}. Reason: ${reason ?? "—"}`);
  writeAudit({ action: "flag", target_user_id: updated.id, target_username: updated.username, admin_id: req.authUser?.id, reason: reason ?? null }, FLAG_AUDIT_LOG);
  return res.json({ ok: true, message: `Usuario ${updated.username} marcado como flagged.` });
});

// ── POST /api/admin/user/unflag ───────────────────────────────────────────────

router.post("/admin/user/unflag", requireAdmin, async (req: Request, res: Response) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: "user_id requerido." });

  const r = await sbAdmin(`profiles?id=eq.${encodeURIComponent(user_id)}`, {
    method:  "PATCH",
    body:    JSON.stringify({ is_flagged: false }),
    headers: { Prefer: "return=representation" },
  });

  if (!r.ok) return res.status(500).json({ error: "Error al desmarcar usuario." });
  const [updated] = await r.json();
  if (!updated) return res.status(404).json({ error: "Usuario no encontrado." });
  console.log(`[UNFLAG] ${updated.username} by admin=${req.authUser?.id}`);
  writeAudit({ action: "unflag", target_user_id: updated.id, target_username: updated.username, admin_id: req.authUser?.id }, FLAG_AUDIT_LOG);
  return res.json({ ok: true, message: `Usuario ${updated.username} removido de flagged.` });
});

export { requireAdmin as alertsRequireAdmin };
export default router;
