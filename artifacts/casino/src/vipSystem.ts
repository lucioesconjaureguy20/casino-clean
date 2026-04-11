export interface VipRank {
  name: string;
  tier: "Bronze" | "Silver" | "Gold" | "Platinum" | "Emerald";
  minWager: number;
  nextWager: number;
  rakebackPct: number;
  color: string;
  gradient: string;
  rewardMin: number;
  rewardMax: number;
  image: string;
}

export const VIP_RANKS: VipRank[] = [
  { name: "Bronze I",     tier: "Bronze",   minWager: 0,        nextWager: 500,      rakebackPct: 0.04,  color: "#cd7f32", gradient: "linear-gradient(135deg,#cd7f32,#8b4513)", rewardMin: 3,    rewardMax: 10,   image: "/ranks/bronze-i.png"     },
  { name: "Bronze II",    tier: "Bronze",   minWager: 500,      nextWager: 2000,     rakebackPct: 0.045, color: "#cd7f32", gradient: "linear-gradient(135deg,#cd7f32,#8b4513)", rewardMin: 3,    rewardMax: 10,   image: "/ranks/bronze-ii.png"    },
  { name: "Bronze III",   tier: "Bronze",   minWager: 2000,     nextWager: 8000,     rakebackPct: 0.05,  color: "#cd7f32", gradient: "linear-gradient(135deg,#cd7f32,#8b4513)", rewardMin: 3,    rewardMax: 10,   image: "/ranks/bronze-iii.png"   },
  { name: "Silver I",     tier: "Silver",   minWager: 8000,     nextWager: 25000,    rakebackPct: 0.06,  color: "#c0c0c0", gradient: "linear-gradient(135deg,#c0c0c0,#808090)", rewardMin: 10,   rewardMax: 40,   image: "/ranks/silver-i.png"     },
  { name: "Silver II",    tier: "Silver",   minWager: 25000,    nextWager: 60000,    rakebackPct: 0.07,  color: "#c0c0c0", gradient: "linear-gradient(135deg,#c0c0c0,#808090)", rewardMin: 10,   rewardMax: 40,   image: "/ranks/silver-ii.png"    },
  { name: "Silver III",   tier: "Silver",   minWager: 60000,    nextWager: 125000,   rakebackPct: 0.08,  color: "#c0c0c0", gradient: "linear-gradient(135deg,#c0c0c0,#808090)", rewardMin: 10,   rewardMax: 40,   image: "/ranks/silver-iii.png"   },
  { name: "Gold I",       tier: "Gold",     minWager: 125000,   nextWager: 250000,   rakebackPct: 0.09,  color: "#f4a91f", gradient: "linear-gradient(135deg,#f4a91f,#c07800)", rewardMin: 40,   rewardMax: 200,  image: "/ranks/gold-i.png"       },
  { name: "Gold II",      tier: "Gold",     minWager: 250000,   nextWager: 500000,   rakebackPct: 0.10,  color: "#f4a91f", gradient: "linear-gradient(135deg,#f4a91f,#c07800)", rewardMin: 40,   rewardMax: 200,  image: "/ranks/gold-ii.png"      },
  { name: "Gold III",     tier: "Gold",     minWager: 500000,   nextWager: 900000,   rakebackPct: 0.11,  color: "#f4a91f", gradient: "linear-gradient(135deg,#f4a91f,#c07800)", rewardMin: 40,   rewardMax: 200,  image: "/ranks/gold-iii.png"     },
  { name: "Platinum I",   tier: "Platinum", minWager: 900000,   nextWager: 1500000,  rakebackPct: 0.12,  color: "#b8c8e8", gradient: "linear-gradient(135deg,#b8c8e8,#7080a0)", rewardMin: 200,  rewardMax: 1000, image: "/ranks/platinum-i.png"   },
  { name: "Platinum II",  tier: "Platinum", minWager: 1500000,  nextWager: 2500000,  rakebackPct: 0.13,  color: "#b8c8e8", gradient: "linear-gradient(135deg,#b8c8e8,#7080a0)", rewardMin: 200,  rewardMax: 1000, image: "/ranks/platinum-ii.png"  },
  { name: "Platinum III", tier: "Platinum", minWager: 2500000,  nextWager: 4000000,  rakebackPct: 0.14,  color: "#b8c8e8", gradient: "linear-gradient(135deg,#b8c8e8,#7080a0)", rewardMin: 200,  rewardMax: 1000, image: "/ranks/platinum-iii.png" },
  { name: "Emerald I",    tier: "Emerald",  minWager: 4000000,  nextWager: 7000000,  rakebackPct: 0.15,  color: "#4dd890", gradient: "linear-gradient(135deg,#4dd890,#1a8850)", rewardMin: 1000, rewardMax: 7000, image: "/ranks/emerald-i.png"    },
  { name: "Emerald II",   tier: "Emerald",  minWager: 7000000,  nextWager: 12000000, rakebackPct: 0.16,  color: "#4dd890", gradient: "linear-gradient(135deg,#4dd890,#1a8850)", rewardMin: 1000, rewardMax: 7000, image: "/ranks/emerald-ii.png"   },
  { name: "Emerald III",  tier: "Emerald",  minWager: 12000000, nextWager: 12000000, rakebackPct: 0.17,  color: "#4dd890", gradient: "linear-gradient(135deg,#4dd890,#1a8850)", rewardMin: 1000, rewardMax: 7000, image: "/ranks/emerald-iii.png"  },
];

export function getRankIndex(totalWager: number): number {
  for (let i = VIP_RANKS.length - 1; i >= 0; i--) {
    if (totalWager >= VIP_RANKS[i].minWager) return i;
  }
  return 0;
}

export function getVipInfo(totalWager: number) {
  const idx = getRankIndex(totalWager);
  const rank = VIP_RANKS[idx];
  const isMax = idx === VIP_RANKS.length - 1;
  const pct = isMax ? 100 : Math.min(100, ((totalWager - rank.minWager) / (rank.nextWager - rank.minWager)) * 100);
  const remaining = isMax ? 0 : rank.nextWager - totalWager;
  return { rank, idx, pct, remaining, isMax };
}

// ── Keys ──────────────────────────────────────────────────────────────────────
const rbKey            = (type: string, user: string) => `vip_rb_${type}_${user}`;
const weeklyUnlockKey  = (user: string)               => `vip_weekly_unlock_${user}`;
const monthlyUnlockKey = (user: string)               => `vip_monthly_unlock_${user}`;

// ── Instant: fixed UTC clock-hour periods (same schedule for ALL users) ───────
// Unlocks at 00:00, 01:00, 02:00 … 23:00 UTC every day (= each full hour boundary).
// Argentina (UTC-3): 21:00, 22:00, 23:00, 00:00 AR … etc.
const HOUR_MS = 60 * 60 * 1000;

// Global UTC period: increments at every top-of-hour (0:00, 1:00, 2:00 … UTC)
function instantCurrentPeriod(): number {
  return Math.floor(Date.now() / HOUR_MS);
}

// Milliseconds remaining until the next top-of-hour UTC
function msUntilNextHour(): number {
  return HOUR_MS - (Date.now() % HOUR_MS);
}

const instantClaimedKey = (user: string) => `vip_instant_period_${user}`;

export function canClaimInstant(user: string): boolean {
  if (!user) return false;
  const stored = localStorage.getItem(instantClaimedKey(user));
  if (stored === null) {
    // First time: persist the current period so the comparison is stable.
    // Next hour instantCurrentPeriod() increments → storedPeriod < newPeriod → true.
    localStorage.setItem(instantClaimedKey(user), String(instantCurrentPeriod()));
    return false;
  }
  const claimed = parseInt(stored);
  return claimed < instantCurrentPeriod();
}

export function timeUntilInstant(user: string): string {
  if (canClaimInstant(user)) return "";
  return fmtCountdown(msUntilNextHour());
}

export function claimInstantRakeback(user: string): number {
  if (!canClaimInstant(user)) return 0;
  const val = parseFloat(localStorage.getItem(rbKey("instant", user)) || "0");
  if (val <= 0) return 0;
  localStorage.setItem(rbKey("instant", user), "0");
  localStorage.setItem(instantClaimedKey(user), String(instantCurrentPeriod()));
  return val;
}

// ── Weekly: unlocks every Monday at 17:00 UTC ─────────────────────────────────
function nextMondayAt1700(): number {
  const now = new Date();
  const dow = now.getUTCDay(); // 0=Sun … 6=Sat
  // Days until next Monday (if today is Monday and before 17:00, use today)
  let daysAhead = dow === 1 ? 0 : (8 - dow) % 7;
  const candidate = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAhead,
    17, 0, 0, 0
  ));
  // If we're at or past that time, move to next week
  if (Date.now() >= candidate.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 7);
  }
  return candidate.getTime();
}

function getWeeklyUnlock(user: string): number {
  const stored = localStorage.getItem(weeklyUnlockKey(user));
  if (stored) return parseInt(stored);
  const next = nextMondayAt1700();
  localStorage.setItem(weeklyUnlockKey(user), String(next));
  return next;
}

// ── Monthly: unlocks on the 1st of each month at 00:00 UTC ───────────────────
function nextFirstOfMonth(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0);
}

function getMonthlyUnlock(user: string): number {
  const stored = localStorage.getItem(monthlyUnlockKey(user));
  if (stored) return parseInt(stored);
  const next = nextFirstOfMonth();
  localStorage.setItem(monthlyUnlockKey(user), String(next));
  return next;
}

// ── Can claim ─────────────────────────────────────────────────────────────────
export function canClaimPeriodic(type: "weekly" | "monthly", user: string): boolean {
  if (!user) return false;
  const unlock = type === "weekly" ? getWeeklyUnlock(user) : getMonthlyUnlock(user);
  return Date.now() >= unlock;
}

// ── Time until next unlock ────────────────────────────────────────────────────
export function timeUntilClaim(type: "weekly" | "monthly", user: string): string {
  if (!user) return "";
  const unlock = type === "weekly" ? getWeeklyUnlock(user) : getMonthlyUnlock(user);
  const rem = unlock - Date.now();
  if (rem <= 0) return "";
  return fmtCountdown(rem);
}

// ── Balance helpers ───────────────────────────────────────────────────────────
export function getRakebackBalances(user: string) {
  return {
    instant: parseFloat(localStorage.getItem(rbKey("instant", user)) || "0"),
    weekly:  parseFloat(localStorage.getItem(rbKey("weekly",  user)) || "0"),
    monthly: parseFloat(localStorage.getItem(rbKey("monthly", user)) || "0"),
  };
}

export function distributeRakeback(user: string, betAmount: number, rakebackPct: number, houseEdge: number) {
  const total = betAmount * houseEdge * rakebackPct;
  const prev  = getRakebackBalances(user);
  const next  = {
    instant: prev.instant + total * 0.40,
    weekly:  prev.weekly  + total * 0.35,
    monthly: prev.monthly + total * 0.25,
  };
  localStorage.setItem(rbKey("instant", user), String(next.instant));
  localStorage.setItem(rbKey("weekly",  user), String(next.weekly));
  localStorage.setItem(rbKey("monthly", user), String(next.monthly));
  return next;
}

// ── Claim ─────────────────────────────────────────────────────────────────────
export function claimPeriodicRakeback(type: "weekly" | "monthly", user: string): number {
  if (!canClaimPeriodic(type, user)) return 0;
  const val = parseFloat(localStorage.getItem(rbKey(type, user)) || "0");
  localStorage.setItem(rbKey(type, user), "0");
  // Advance the unlock to the next occurrence
  const nextUnlock = type === "weekly" ? nextMondayAt1700() : nextFirstOfMonth();
  localStorage.setItem(
    type === "weekly" ? weeklyUnlockKey(user) : monthlyUnlockKey(user),
    String(nextUnlock)
  );
  return val;
}

// ── Format countdown ──────────────────────────────────────────────────────────
function fmtCountdown(rem: number): string {
  if (rem <= 0) return "";
  const totalSec = Math.ceil(rem / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

// ── Reward Claim History ───────────────────────────────────────────────────────
export interface RewardRecord {
  id: string;
  date: number;
  amount: number;
  note: string;
}

const rewardHistoryKey = (user: string) => `rewardHistory_${user}`;

export function saveRewardClaim(user: string, amount: number, note: string): void {
  if (!user || amount <= 0) return;
  const key = rewardHistoryKey(user);
  const history: RewardRecord[] = JSON.parse(localStorage.getItem(key) || "[]");
  history.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    date: Date.now(),
    amount,
    note,
  });
  if (history.length > 500) history.splice(500);
  localStorage.setItem(key, JSON.stringify(history));
}

export function getRewardHistory(user: string): RewardRecord[] {
  if (!user) return [];
  return JSON.parse(localStorage.getItem(rewardHistoryKey(user)) || "[]");
}
