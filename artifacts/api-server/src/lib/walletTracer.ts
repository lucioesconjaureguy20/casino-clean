/**
 * Wallet Ancestry Tracer
 * Traces inbound transactions up to 3 hops to detect shared root/parent wallets.
 * Supports: BEP20 (BSC), TRC20 (TRON), ERC20 (Ethereum), LTC, SOL
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const DATA_DIR   = join(process.cwd(), "data");
const TRACE_FILE = join(DATA_DIR, "wallet-traces.json");

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DepositInfo {
  depositId:  number;
  casinoAddr: string;
  network:    string;
  currency:   string;
  amount:     number;   // in crypto units
  timestamp:  string;
  userId:     string;
  username:   string;
}

export interface WalletTrace {
  depositId:       number;
  casinoAddr:      string;
  network:         string;
  depositorWallet: string | null;  // hop0: who sent to casinoAddr
  ancestors:       string[];       // [hop1, hop2, hop3] from depositorWallet upward
  rootWallet:      string | null;  // deepest ancestor (or depositorWallet if no ancestors)
  userId:          string;
  username:        string;
  tracedAt:        string;
  hops:            number;
  pending:         boolean;
  error?:          string;
}

export interface RootWalletGroup {
  rootWallet: string;
  network:    string;
  usernames:  string[];
  traces:     WalletTrace[];
  fanOut:     number;      // distinct depositor wallets this root funds
  detectedAt: string;
}

// ─── In-memory store + queue ─────────────────────────────────────────────────

const traceMap   = new Map<string, WalletTrace>(); // key = casinoAddr
let   traceQueue: DepositInfo[] = [];
let   workerBusy = false;

// ─── Network helpers ─────────────────────────────────────────────────────────

function normNet(network: string): string {
  const n = network.toUpperCase();
  if (n.includes("TRC") || n.includes("TRON")) return "TRC20";
  if (n.includes("BEP") || n.includes("BSC"))  return "BEP20";
  if (n.includes("ERC") || n.includes("ETH"))  return "ERC20";
  if (n === "LTC")                              return "LTC";
  if (n === "SOL")                              return "SOL";
  if (n === "BTC")                              return "BTC";
  return n;
}

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

async function safeFetch(url: string, timeout = 10_000): Promise<any | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// ─── TRON / TRC20 (Tronscan, no API key) ─────────────────────────────────────

async function tronInboundSenders(addr: string, amountCrypto?: number, ts?: string): Promise<string[]> {
  // Get TRC20 USDT transfers TO addr
  const url = `https://apilist.tronscanapi.com/api/token_trc20/transfers?limit=50&start=0&toAddress=${addr}&sort=-timestamp`;
  const data = await safeFetch(url);
  const txs: any[] = data?.token_transfers ?? data?.data ?? [];
  if (!txs.length) return [];

  if (amountCrypto && ts) {
    const amtSun  = Math.round(amountCrypto * 1_000_000);
    const tsMs    = new Date(ts).getTime();
    const match   = txs.find(t => {
      const a = parseInt(t.quant ?? t.amount ?? "0");
      const d = parseInt(t.block_ts ?? t.timestamp ?? "0");
      return Math.abs(a - amtSun) < amtSun * 0.12 && Math.abs(d - tsMs) < 5 * 3600_000;
    });
    if (match) return [match.from_address ?? match.from].filter(Boolean);
  }
  // Return up to 5 unique senders
  return [...new Set(txs.map((t: any) => t.from_address ?? t.from).filter(Boolean))].slice(0, 5) as string[];
}

// ─── BSC / BEP20 (BSCScan public, no key needed at low rate) ─────────────────

const BSC_USDT = "0x55d398326f99059ff775485246999027b3197955"; // USDT BEP20

async function bscInboundSenders(addr: string, amountCrypto?: number, ts?: string): Promise<string[]> {
  const url = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${BSC_USDT}&address=${encodeURIComponent(addr)}&sort=desc&offset=50&page=1`;
  const data = await safeFetch(url);
  const txs: any[] = Array.isArray(data?.result) ? data.result : [];
  const inbound = txs.filter((t: any) => t.to?.toLowerCase() === addr.toLowerCase());
  if (!inbound.length) return [];

  if (amountCrypto && ts) {
    const amtWei = BigInt(Math.round(amountCrypto * 1e6));          // USDT 6 decimals
    const tsMs   = new Date(ts).getTime();
    const match  = inbound.find((t: any) => {
      const a = BigInt(t.value ?? "0");
      const d = parseInt(t.timeStamp ?? "0") * 1000;
      const diff = a > amtWei ? a - amtWei : amtWei - a;
      return diff < amtWei / 10n && Math.abs(d - tsMs) < 5 * 3600_000;
    });
    if (match) return [match.from].filter(Boolean);
  }
  return [...new Set(inbound.map((t: any) => t.from).filter(Boolean))].slice(0, 5) as string[];
}

// BNB native transfers (to find who funded a BSC wallet)
async function bscNativeInboundSenders(addr: string): Promise<string[]> {
  const url = `https://api.bscscan.com/api?module=account&action=txlist&address=${encodeURIComponent(addr)}&sort=desc&offset=20&page=1`;
  const data = await safeFetch(url);
  const txs: any[] = Array.isArray(data?.result) ? data.result : [];
  const inbound = txs.filter((t: any) => t.to?.toLowerCase() === addr.toLowerCase() && parseFloat(t.value ?? "0") > 0);
  return [...new Set(inbound.map((t: any) => t.from).filter(Boolean))].slice(0, 5) as string[];
}

// ─── Ethereum / ERC20 (Ethplorer, freekey) ────────────────────────────────────

const ETH_USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";

async function ethInboundSenders(addr: string, amountCrypto?: number, ts?: string): Promise<string[]> {
  // Token transfers
  const url = `https://api.ethplorer.io/getAddressHistory/${addr}?apiKey=freekey&limit=50&type=transfer`;
  const data = await safeFetch(url);
  const ops: any[] = (data?.operations ?? []).filter((op: any) =>
    op.to?.toLowerCase() === addr.toLowerCase() &&
    op.tokenInfo?.address?.toLowerCase() === ETH_USDT.toLowerCase()
  );

  if (!ops.length) {
    // Fallback: try tx list
    const url2 = `https://api.ethplorer.io/getAddressTransactions/${addr}?apiKey=freekey&limit=50`;
    const d2   = await safeFetch(url2);
    const txs2: any[] = (d2 ?? []).filter((t: any) => t.to?.toLowerCase() === addr.toLowerCase() && t.value > 0);
    return [...new Set(txs2.map((t: any) => t.from).filter(Boolean))].slice(0, 5) as string[];
  }

  if (amountCrypto && ts) {
    const amtRaw = amountCrypto * 1e6;
    const tsMs   = new Date(ts).getTime();
    const match  = ops.find(op => {
      const a = parseFloat(op.value ?? "0");
      const d = (op.timestamp ?? 0) * 1000;
      return Math.abs(a - amtRaw) < amtRaw * 0.12 && Math.abs(d - tsMs) < 5 * 3600_000;
    });
    if (match) return [match.from].filter(Boolean);
  }
  return [...new Set(ops.map((op: any) => op.from).filter(Boolean))].slice(0, 5) as string[];
}

// ─── LTC (SoChain) ───────────────────────────────────────────────────────────

async function ltcInboundSenders(addr: string): Promise<string[]> {
  const url = `https://sochain.com/api/v2/get_tx_received/LTC/${encodeURIComponent(addr)}`;
  const data = await safeFetch(url);
  const txs: any[] = data?.data?.txs ?? [];
  const senders = new Set<string>();
  for (const tx of txs.slice(0, 10)) {
    (tx.incoming?.inputs ?? []).forEach((inp: any) => { if (inp.address) senders.add(inp.address); });
  }
  return [...senders].slice(0, 5);
}

// ─── Solana (Solscan public) ──────────────────────────────────────────────────

async function solInboundSenders(addr: string): Promise<string[]> {
  const url = `https://public-api.solscan.io/account/transactions?account=${encodeURIComponent(addr)}&limit=20`;
  const data = await safeFetch(url);
  const txs: any[] = Array.isArray(data) ? data : [];
  return [...new Set(txs.map((t: any) => t.signer?.[0] ?? t.from).filter(Boolean).filter((s: string) => s !== addr))].slice(0, 5) as string[];
}

// ─── Unified: find inbound senders ────────────────────────────────────────────

async function findInboundSenders(addr: string, network: string, amountCrypto?: number, ts?: string): Promise<string[]> {
  const net = normNet(network);
  switch (net) {
    case "TRC20": return tronInboundSenders(addr, amountCrypto, ts);
    case "BEP20": return bscInboundSenders(addr, amountCrypto, ts);
    case "ERC20": return ethInboundSenders(addr, amountCrypto, ts);
    case "LTC":   return ltcInboundSenders(addr);
    case "SOL":   return solInboundSenders(addr);
    default:      return [];
  }
}

// For tracing ancestry (who funded a wallet — use native/any inbound)
async function findFundingSenders(addr: string, network: string): Promise<string[]> {
  const net = normNet(network);
  switch (net) {
    case "TRC20": return tronInboundSenders(addr);       // TRX or TRC20 inbound
    case "BEP20": return bscNativeInboundSenders(addr);  // BNB native inbound (gas providers = likely same entity)
    case "ERC20": return ethInboundSenders(addr);
    case "LTC":   return ltcInboundSenders(addr);
    case "SOL":   return solInboundSenders(addr);
    default:      return [];
  }
}

// ─── Full trace for one deposit ───────────────────────────────────────────────

async function traceOne(info: DepositInfo): Promise<WalletTrace> {
  const trace: WalletTrace = {
    depositId: info.depositId, casinoAddr: info.casinoAddr,
    network: info.network, depositorWallet: null,
    ancestors: [], rootWallet: null,
    userId: info.userId, username: info.username,
    tracedAt: new Date().toISOString(), hops: 0, pending: false,
  };

  try {
    // Hop 0: who sent to the casino address?
    const hop0 = await findInboundSenders(info.casinoAddr, info.network, info.amount, info.timestamp);
    await sleep(1800);
    if (!hop0.length) {
      trace.error = "no_depositor_found";
      trace.rootWallet = null;
      return trace;
    }
    trace.depositorWallet = hop0[0];
    trace.hops = 1;

    // Hops 1-3: trace the depositor wallet ancestry
    let current = trace.depositorWallet;
    for (let h = 1; h <= 3; h++) {
      const parents = await findFundingSenders(current, info.network);
      await sleep(1800);
      const parent = parents[0] ?? null;
      if (!parent || parent === current || trace.ancestors.includes(parent)) break;
      trace.ancestors.push(parent);
      current = parent;
      trace.hops++;
    }

    trace.rootWallet = trace.ancestors.length > 0
      ? trace.ancestors[trace.ancestors.length - 1]
      : trace.depositorWallet;

  } catch (err) {
    trace.error = String(err);
  }
  return trace;
}

// ─── Background worker ────────────────────────────────────────────────────────

function persist() {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(TRACE_FILE, JSON.stringify([...traceMap.values()], null, 2));
  } catch {}
}

async function runWorker() {
  if (workerBusy) return;
  workerBusy = true;
  while (traceQueue.length > 0) {
    const item = traceQueue.shift()!;
    if (traceMap.has(item.casinoAddr)) continue;
    console.log(`[wallet-tracer] tracing ${item.network} ${item.casinoAddr.slice(0, 14)}… (${item.username})`);
    const result = await traceOne(item);
    traceMap.set(result.casinoAddr, result);
    persist();
    const dep = result.depositorWallet?.slice(0, 12) ?? "none";
    const root = result.rootWallet?.slice(0, 12) ?? "none";
    console.log(`[wallet-tracer] ✓ depositor=${dep} root=${root} hops=${result.hops}${result.error ? ` err=${result.error}` : ""}`);
    await sleep(2500); // rate limit between deposits
  }
  workerBusy = false;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function initWalletTracer(): void {
  try {
    const entries = JSON.parse(readFileSync(TRACE_FILE, "utf-8")) as WalletTrace[];
    for (const e of entries) traceMap.set(e.casinoAddr, e);
    console.log(`[wallet-tracer] loaded ${entries.length} traces from disk`);
  } catch { console.log("[wallet-tracer] no existing traces on disk"); }
}

export function queueDeposit(info: DepositInfo): void {
  if (traceMap.has(info.casinoAddr)) return;
  if (traceQueue.some(q => q.casinoAddr === info.casinoAddr)) return;
  traceQueue.push(info);
  runWorker().catch(() => { workerBusy = false; });
}

export function queueMultiple(deposits: DepositInfo[]): number {
  let added = 0;
  for (const d of deposits) {
    if (!traceMap.has(d.casinoAddr) && !traceQueue.some(q => q.casinoAddr === d.casinoAddr)) {
      traceQueue.push(d);
      added++;
    }
  }
  if (added > 0) runWorker().catch(() => { workerBusy = false; });
  return added;
}

export function getAllTraces(): WalletTrace[] {
  return [...traceMap.values()];
}

export function getQueueLength(): number {
  return traceQueue.length;
}

export function isWorkerBusy(): boolean {
  return workerBusy;
}

export function getRootWalletGroups(): RootWalletGroup[] {
  const groups = new Map<string, RootWalletGroup>();

  for (const trace of traceMap.values()) {
    if (!trace.rootWallet || trace.rootWallet === trace.depositorWallet) continue;
    const key = trace.rootWallet;
    if (!groups.has(key)) {
      groups.set(key, {
        rootWallet: trace.rootWallet,
        network:    trace.network,
        usernames:  [],
        traces:     [],
        fanOut:     0,
        detectedAt: new Date().toISOString(),
      });
    }
    const g = groups.get(key)!;
    if (!g.usernames.includes(trace.username)) g.usernames.push(trace.username);
    g.traces.push(trace);
    g.fanOut = new Set(g.traces.map(t => t.depositorWallet).filter(Boolean)).size;
  }

  return [...groups.values()]
    .filter(g => g.usernames.length >= 2 || g.fanOut >= 2)
    .sort((a, b) => b.usernames.length - a.usernames.length);
}

export function getAncestryReport() {
  const traces     = getAllTraces();
  const rootGroups = getRootWalletGroups();
  return {
    traces,
    rootGroups,
    queueLength: getQueueLength(),
    workerBusy:  isWorkerBusy(),
    totalTraced: traces.length,
    analyzedAt:  new Date().toISOString(),
  };
}
