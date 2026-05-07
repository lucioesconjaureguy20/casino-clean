import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { getIpReport } from "./ipStore.js";
import { getDeviceReport } from "./deviceStore.js";
import { getAllTraces, getRootWalletGroups } from "./walletTracer.js";

const DATA_DIR    = join(process.cwd(), "data");
const WALLET_FILE = join(DATA_DIR, "wallet-alerts.json");

const SB_URL = process.env.SUPABASE_URL?.replace(/\/$/, "") ?? "";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";

function sbAdmin(path: string) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: {
      apikey:        SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
    },
  });
}

// ─── Prices (simplified, updated externally by prices.ts) ───────────────────
const PRICES: Record<string, number> = {
  USDT: 1, USDC: 1, BTC: 80000, ETH: 2300, BNB: 630, SOL: 88, LTC: 56, TRX: 0.35,
};
function toUsd(amount: number, currency: string): number {
  return parseFloat((amount * (PRICES[currency.toUpperCase()] ?? 1)).toFixed(2));
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DepositNode {
  depositId: number;
  userId:    string;
  username:  string;
  address:   string;
  txHash:    string;
  network:   string;
  currency:  string;
  amount:    number;
  amountUsd: number;
  createdAt: string;
  refCode:   string;
}

export interface RiskFactor {
  label: string;
  score: number;
}

export interface WalletCluster {
  id:          string;
  reason:      string;
  users:       string[];
  deposits:    DepositNode[];
  riskScore:   number;
  riskFactors: RiskFactor[];
  totalUsd:    number;
  detectedAt:  string;
}

export interface WalletAlert {
  id:         string;
  severity:   "high" | "medium" | "low";
  message:    string;
  users:      string[];
  clusterId:  string;
  detectedAt: string;
  resolved:   boolean;
}

export interface WalletReport {
  clusters:   WalletCluster[];
  alerts:     WalletAlert[];
  all:        DepositNode[];
  analyzedAt: string;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

let _cache: WalletReport | null = null;
let _cacheAt = 0;
const CACHE_TTL = 5 * 60_000;

// ─── Main analysis ───────────────────────────────────────────────────────────

export async function analyzeWallets(force = false): Promise<WalletReport> {
  if (_cache && !force && Date.now() - _cacheAt < CACHE_TTL) return _cache;

  // 1. Fetch confirmed deposits from Supabase
  let deposits: DepositNode[] = [];
  try {
    const r = await sbAdmin(
      "deposits?status=eq.confirmed&address=neq.pending&order=created_at.desc&limit=1000&select=id,user_id,amount,currency,network,address,tx_hash,created_at",
    );
    if (r.ok) {
      const rows: any[] = await r.json();
      const userIds = [...new Set(rows.map((d: any) => d.user_id as string))];
      const profileMap: Record<string, { username: string; refCode: string }> = {};
      const CHUNK = 80;
      for (let i = 0; i < userIds.length; i += CHUNK) {
        const chunk = userIds.slice(i, i + CHUNK);
        const pr = await sbAdmin(
          `profiles?id=in.(${chunk.join(",")})&select=id,username,ref_code_used`,
        );
        if (pr.ok) {
          const profiles: any[] = await pr.json();
          for (const p of profiles) {
            profileMap[p.id] = { username: p.username ?? p.id, refCode: p.ref_code_used ?? "" };
          }
        }
      }
      deposits = rows
        .map((d: any) => ({
          depositId: d.id as number,
          userId:    d.user_id as string,
          username:  profileMap[d.user_id]?.username ?? d.user_id,
          address:   (d.address ?? "") as string,
          txHash:    (d.tx_hash ?? "") as string,
          network:   (d.network ?? "") as string,
          currency:  (d.currency ?? "") as string,
          amount:    parseFloat(d.amount ?? 0),
          amountUsd: toUsd(parseFloat(d.amount ?? 0), d.currency ?? ""),
          createdAt: (d.created_at ?? "") as string,
          refCode:   profileMap[d.user_id]?.refCode ?? "",
        }))
        .filter(d => d.address.length > 5);
    }
  } catch (err) {
    console.error("[wallet-store] fetch error:", err);
  }

  // 2. Cross-reference IP + device stores
  const ipReport     = getIpReport();
  const deviceReport = getDeviceReport();
  const userIpMap    = new Map<string, string[]>();
  const userDevMap   = new Map<string, string[]>();
  for (const e of ipReport.all)     userIpMap.set(e.username, e.ips);
  for (const e of deviceReport.all) userDevMap.set(e.username, e.devices.map(d => d.hash));

  const clusters: WalletCluster[] = [];
  const alerts:   WalletAlert[]   = [];
  const seenPairs = new Set<string>();

  // ── 3a. Cluster by shared casino deposit address ──────────────────────────
  const byAddress = new Map<string, DepositNode[]>();
  for (const d of deposits) {
    if (!byAddress.has(d.address)) byAddress.set(d.address, []);
    byAddress.get(d.address)!.push(d);
  }
  for (const [addr, deps] of byAddress) {
    const uniqueUsers = [...new Set(deps.map(d => d.userId))];
    if (uniqueUsers.length < 2) continue;

    const factors: RiskFactor[] = [{ label: "Misma dirección de depósito casino", score: 50 }];
    let score = 50;

    // Same tx hash across different users
    const txMap = new Map<string, Set<string>>();
    for (const d of deps) {
      if (!d.txHash) continue;
      if (!txMap.has(d.txHash)) txMap.set(d.txHash, new Set());
      txMap.get(d.txHash)!.add(d.userId);
    }
    for (const [, users] of txMap) {
      if (users.size > 1) { factors.push({ label: "Mismo TX hash en múltiples cuentas", score: 70 }); score += 70; break; }
    }

    // IP overlap
    const allIps = uniqueUsers.flatMap(uid => {
      const u = deps.find(d => d.userId === uid);
      return u ? (userIpMap.get(u.username) ?? []) : [];
    });
    if (new Set(allIps).size < allIps.length) { factors.push({ label: "IP compartida", score: 40 }); score += 40; }

    // Device overlap
    const allDevs = uniqueUsers.flatMap(uid => {
      const u = deps.find(d => d.userId === uid);
      return u ? (userDevMap.get(u.username) ?? []) : [];
    });
    if (new Set(allDevs).size < allDevs.length) { factors.push({ label: "Mismo dispositivo", score: 40 }); score += 40; }

    // Same ref code
    const refCodes = new Set(deps.map(d => d.refCode).filter(Boolean));
    if (refCodes.size === 1 && [...refCodes][0]) { factors.push({ label: "Mismo código de afiliado", score: 30 }); score += 30; }

    const cluster: WalletCluster = {
      id: uid(), reason: "shared_address",
      users:       uniqueUsers.map(uid => deps.find(d => d.userId === uid)?.username ?? uid),
      deposits:    deps,
      riskScore:   Math.min(score, 220),
      riskFactors: factors,
      totalUsd:    deps.reduce((s, d) => s + d.amountUsd, 0),
      detectedAt:  new Date().toISOString(),
    };
    clusters.push(cluster);

    if (score >= 70) {
      alerts.push({
        id: uid(), severity: "high",
        message:    `Dirección ${addr.slice(0, 12)}… compartida por ${uniqueUsers.length} cuentas`,
        users:      cluster.users, clusterId: cluster.id,
        detectedAt: new Date().toISOString(), resolved: false,
      });
    }
  }

  // ── 3b. Cluster by same TX hash (different users, same tx) ───────────────
  const byTx = new Map<string, DepositNode[]>();
  for (const d of deposits) {
    if (!d.txHash) continue;
    if (!byTx.has(d.txHash)) byTx.set(d.txHash, []);
    byTx.get(d.txHash)!.push(d);
  }
  for (const [tx, deps] of byTx) {
    const uniqueUsers = [...new Set(deps.map(d => d.userId))];
    if (uniqueUsers.length < 2) continue;
    const factors: RiskFactor[] = [{ label: "TX hash idéntico en múltiples cuentas", score: 70 }];
    let score = 70;
    const cluster: WalletCluster = {
      id: uid(), reason: "same_tx",
      users:       uniqueUsers.map(uid => deps.find(d => d.userId === uid)?.username ?? uid),
      deposits:    deps,
      riskScore:   Math.min(score, 220),
      riskFactors: factors,
      totalUsd:    deps.reduce((s, d) => s + d.amountUsd, 0),
      detectedAt:  new Date().toISOString(),
    };
    clusters.push(cluster);
    alerts.push({
      id: uid(), severity: "high",
      message:    `TX ${tx.slice(0, 12)}… usada por ${uniqueUsers.length} cuentas distintas`,
      users:      cluster.users, clusterId: cluster.id,
      detectedAt: new Date().toISOString(), resolved: false,
    });
  }

  // ── 3c. Cluster by timing + amount (≤1h, ≤5% amount diff, same network) ──
  const sorted = [...deposits].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      if (a.userId === b.userId) continue;
      const timeDiff = Math.abs(new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      if (timeDiff > 3_600_000) break;
      if (a.network !== b.network) continue;
      const amtDiff = Math.abs(a.amountUsd - b.amountUsd) / Math.max(a.amountUsd, b.amountUsd, 0.01);
      if (amtDiff > 0.05) continue;

      const pairKey = [a.userId, b.userId].sort().join("|");
      if (seenPairs.has(pairKey)) continue;

      const factors: RiskFactor[] = [];
      let score = 0;
      const mins = Math.floor(timeDiff / 60000);
      factors.push({ label: `Montos similares (${a.amountUsd.toFixed(2)} ≈ ${b.amountUsd.toFixed(2)} USD)`, score: 20 });
      factors.push({ label: `Diferencia de tiempo: ${mins} min`, score: 20 });
      score += 40;

      const aIps = userIpMap.get(a.username) ?? [];
      const bIps = userIpMap.get(b.username) ?? [];
      if (aIps.some(ip => bIps.includes(ip))) { factors.push({ label: "IP compartida", score: 40 }); score += 40; }

      const aDevs = userDevMap.get(a.username) ?? [];
      const bDevs = userDevMap.get(b.username) ?? [];
      if (aDevs.some(dv => bDevs.includes(dv))) { factors.push({ label: "Mismo dispositivo", score: 40 }); score += 40; }

      if (a.refCode && a.refCode === b.refCode) { factors.push({ label: `Mismo código afiliado: ${a.refCode}`, score: 30 }); score += 30; }

      if (score < 60) continue;
      seenPairs.add(pairKey);

      const cluster: WalletCluster = {
        id: uid(), reason: "timing_amount",
        users:       [a.username, b.username],
        deposits:    [a, b],
        riskScore:   Math.min(score, 220),
        riskFactors: factors,
        totalUsd:    a.amountUsd + b.amountUsd,
        detectedAt:  new Date().toISOString(),
      };
      clusters.push(cluster);

      if (score >= 70) {
        alerts.push({
          id: uid(),
          severity:   score >= 110 ? "high" : "medium",
          message:    `Patrón timing+monto: ${a.username} y ${b.username} en ${mins}min (${a.network})`,
          users:      [a.username, b.username], clusterId: cluster.id,
          detectedAt: new Date().toISOString(), resolved: false,
        });
      }
    }
  }

  // ── 3d. Cluster by shared affiliate code + IP or device ──────────────────
  const byRefCode = new Map<string, DepositNode[]>();
  for (const d of deposits) {
    if (!d.refCode) continue;
    if (!byRefCode.has(d.refCode)) byRefCode.set(d.refCode, []);
    byRefCode.get(d.refCode)!.push(d);
  }
  for (const [code, deps] of byRefCode) {
    const uniqueUsers = [...new Set(deps.map(d => d.userId))];
    if (uniqueUsers.length < 2) continue;

    // Only flag if they also share IP or device
    const allIps = uniqueUsers.flatMap(uid => {
      const u = deps.find(d => d.userId === uid);
      return u ? (userIpMap.get(u.username) ?? []) : [];
    });
    const allDevs = uniqueUsers.flatMap(uid => {
      const u = deps.find(d => d.userId === uid);
      return u ? (userDevMap.get(u.username) ?? []) : [];
    });
    const sharedIp  = new Set(allIps).size < allIps.length;
    const sharedDev = new Set(allDevs).size < allDevs.length;
    if (!sharedIp && !sharedDev) continue;

    const pairKey = uniqueUsers.sort().join("|");
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    const factors: RiskFactor[] = [{ label: `Código afiliado compartido: ${code}`, score: 30 }];
    let score = 30;
    if (sharedIp)  { factors.push({ label: "IP compartida", score: 40 });         score += 40; }
    if (sharedDev) { factors.push({ label: "Mismo dispositivo", score: 40 });     score += 40; }

    const cluster: WalletCluster = {
      id: uid(), reason: "affiliate_ip_device",
      users:       uniqueUsers.map(uid => deps.find(d => d.userId === uid)?.username ?? uid),
      deposits:    deps,
      riskScore:   Math.min(score, 220),
      riskFactors: factors,
      totalUsd:    deps.reduce((s, d) => s + d.amountUsd, 0),
      detectedAt:  new Date().toISOString(),
    };
    clusters.push(cluster);

    if (score >= 70) {
      alerts.push({
        id: uid(), severity: score >= 100 ? "high" : "medium",
        message:    `Código afiliado "${code}" + IP/dispositivo compartido entre ${uniqueUsers.length} cuentas`,
        users:      cluster.users, clusterId: cluster.id,
        detectedAt: new Date().toISOString(), resolved: false,
      });
    }
  }

  // ── 3e. Root wallet clustering (shared blockchain ancestor) ─────────────────
  const rootGroups = getRootWalletGroups();
  const traces     = getAllTraces();

  for (const group of rootGroups) {
    if (group.usernames.length < 2) continue;
    const groupDeposits = group.traces
      .map(t => deposits.find(d => d.address === t.casinoAddr))
      .filter((d): d is DepositNode => !!d);
    if (groupDeposits.length < 2) continue;

    const uniqueUsers = [...new Set(groupDeposits.map(d => d.userId))];
    if (uniqueUsers.length < 2) continue;

    const pairKey = uniqueUsers.sort().join("|") + ":root:" + group.rootWallet;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    const factors: RiskFactor[] = [];
    let score = 0;

    // Shared root wallet
    const hasParentOnly = group.traces.every(t => t.ancestors.length === 1);
    if (hasParentOnly) {
      factors.push({ label: `Wallet padre compartida: ${group.rootWallet.slice(0,12)}…`, score: 60 });
      score += 60;
    } else {
      factors.push({ label: `Wallet raíz compartida: ${group.rootWallet.slice(0,12)}…`, score: 80 });
      score += 80;
    }

    // Fan-out pattern: root funded 3+ different depositor wallets
    if (group.fanOut >= 3) {
      factors.push({ label: `Patrón fan-out: ${group.fanOut} wallets financiadas desde la misma raíz`, score: 50 });
      score += 50;
    }

    // Additional signals
    const allIps2  = uniqueUsers.flatMap(uid => { const u = groupDeposits.find(d => d.userId === uid); return u ? (userIpMap.get(u.username) ?? []) : []; });
    const allDevs2 = uniqueUsers.flatMap(uid => { const u = groupDeposits.find(d => d.userId === uid); return u ? (userDevMap.get(u.username) ?? []) : []; });
    if (new Set(allIps2).size < allIps2.length)   { factors.push({ label: "IP compartida",      score: 40 }); score += 40; }
    if (new Set(allDevs2).size < allDevs2.length) { factors.push({ label: "Mismo dispositivo",  score: 40 }); score += 40; }

    const cluster: WalletCluster = {
      id: uid(), reason: "shared_root_wallet",
      users:       uniqueUsers.map(uid => groupDeposits.find(d => d.userId === uid)?.username ?? uid),
      deposits:    groupDeposits,
      riskScore:   Math.min(score, 220),
      riskFactors: factors,
      totalUsd:    groupDeposits.reduce((s, d) => s + d.amountUsd, 0),
      detectedAt:  new Date().toISOString(),
    };
    clusters.push(cluster);

    alerts.push({
      id: uid(),
      severity: score >= 100 ? "high" : "medium",
      message: `Una wallet raíz financió ${uniqueUsers.length} cuentas del casino (${group.rootWallet.slice(0,14)}…)`,
      users:      cluster.users, clusterId: cluster.id,
      detectedAt: new Date().toISOString(), resolved: false,
    });
  }

  clusters.sort((a, b) => b.riskScore - a.riskScore);

  _cache = {
    clusters:   clusters.slice(0, 300),
    alerts:     alerts.slice(0, 200),
    all:        deposits,
    analyzedAt: new Date().toISOString(),
  };
  _cacheAt = Date.now();

  // Persist alerts
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(WALLET_FILE, JSON.stringify({ alerts: _cache.alerts, analyzedAt: _cache.analyzedAt }, null, 2));
  } catch {}

  return _cache;
}

export function getWalletCache(): WalletReport | null { return _cache; }
