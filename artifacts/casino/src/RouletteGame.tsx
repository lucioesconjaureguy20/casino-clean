import React, { useState, useRef, useEffect, useCallback } from "react";
import { gt } from "./lib/gameLabels";

// ── Constants ─────────────────────────────────────────────────────────────────
const WHEEL_NUMBERS = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const SEG_DEG = 360 / 37;
const SPIN_MS  = 1800;
const IDLE_DEG_PER_SEC = 22; // wheel idle rotation speed (°/s)

// Returns which WHEEL_NUMBERS entry is at the top pointer given a wheel angle
function getNumberAtAngle(angle: number): number {
  const localPointerDeg = ((-90 - angle) % 360 + 360) % 360;
  const localFrom0      = (localPointerDeg + 90 + 360) % 360;
  const idx             = Math.floor(localFrom0 / SEG_DEG) % 37;
  return WHEEL_NUMBERS[idx];
}

// ── Chip placement sound (Web Audio API) ──────────────────────────────────
function playChipSound(volPct: number) {
  if (volPct <= 0) return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const vol = volPct / 100;

    // Sharp click transient — high-frequency burst
    const clickBuf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
    const clickData = clickBuf.getChannelData(0);
    for (let i = 0; i < clickData.length; i++) {
      const t = i / ctx.sampleRate;
      clickData[i] = (Math.random() * 2 - 1) * Math.exp(-t * 320) * 0.9;
    }
    const clickSrc = ctx.createBufferSource();
    clickSrc.buffer = clickBuf;

    // High-pass filter to keep the crisp "tick"
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800;

    // Low tap body — felt resonance
    const tapOsc = ctx.createOscillator();
    tapOsc.type = "sine";
    tapOsc.frequency.setValueAtTime(520, ctx.currentTime);
    tapOsc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.06);
    const tapGain = ctx.createGain();
    tapGain.gain.setValueAtTime(0.28 * vol, ctx.currentTime);
    tapGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.07);

    // Chip spin wobble tone — short metallic shimmer
    const shimOsc = ctx.createOscillator();
    shimOsc.type = "triangle";
    shimOsc.frequency.setValueAtTime(3200, ctx.currentTime);
    shimOsc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.05);
    const shimGain = ctx.createGain();
    shimGain.gain.setValueAtTime(0.12 * vol, ctx.currentTime);
    shimGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);

    const master = ctx.createGain();
    master.gain.value = 0.85 * vol;

    clickSrc.connect(hp); hp.connect(master);
    tapOsc.connect(tapGain); tapGain.connect(master);
    shimOsc.connect(shimGain); shimGain.connect(master);
    master.connect(ctx.destination);

    clickSrc.start(ctx.currentTime);
    tapOsc.start(ctx.currentTime);
    shimOsc.start(ctx.currentTime);
    tapOsc.stop(ctx.currentTime + 0.08);
    shimOsc.stop(ctx.currentTime + 0.06);
    clickSrc.stop(ctx.currentTime + 0.05);

    setTimeout(() => ctx.close(), 300);
  } catch (_) {}
}

// ── SpinData: holds all per-spin animation parameters ──────────────────────
interface SpinData {
  startTime:       number;
  result:          number;
  resultIdx:       number;
  ballStartAngle:  number;   // canvas degrees, randomized each spin
  ballTotalDelta:  number;   // total CW rotation (positive)
  wobbleSeed:      number;
  fretSeed:        number;
  bounceMag:       number;   // degrees of overshoot before final settle (±)
  onComplete:      () => void;
}

// Chip display labels → actual USD amounts:
//   "1"    = $0.01  |  "10"  = $0.10  |  "100"  = $1.00
//   "1K"   = $10    |  "10K" = $100   |  "100K" = $1,000  |  "1M" = $10,000
const CHIP_VALUES = [0.01, 0.10, 1, 10, 100, 1_000, 10_000];
const CHIP_META: Record<string, { label: string; bg: string; border: string; txt: string }> = {
  "0.01":  { label:"1",    bg:"#d1d5db", border:"#9ca3af", txt:"#111827" },
  "0.1":   { label:"10",   bg:"#f4a91f", border:"#fbbf24", txt:"#111827" },
  "1":     { label:"100",  bg:"#15803d", border:"#22c55e", txt:"#fff"    },
  "10":    { label:"1K",   bg:"#111827", border:"#f4a91f", txt:"#f4a91f" },
  "100":   { label:"10K",  bg:"#6d28d9", border:"#a78bfa", txt:"#fff"    },
  "1000":  { label:"100K", bg:"#b91c1c", border:"#f87171", txt:"#fff"    },
  "10000": { label:"1M",   bg:"#92400e", border:"#fbbf24", txt:"#fef3c7" },
};
function chipKey(v: number): string { return String(v); }

// ── Casino chip SVG renderer ────────────────────────────────────────────────
function CasinoChipSVG({ bg, border, txt, label, size = 52, selected = false }: {
  bg: string; border: string; txt: string; label: string; size?: number; selected?: boolean;
}) {
  const cx = size / 2, cy = size / 2;
  const outerR = size / 2 - 2;
  const innerR = outerR * 0.68;
  const segCount = 8;
  const segs: string[] = [];
  for (let i = 0; i < segCount; i++) {
    const a1 = -Math.PI / 2 + (i / segCount) * Math.PI * 2;
    const a2 = -Math.PI / 2 + ((i + 0.56) / segCount) * Math.PI * 2;
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const c2 = Math.cos(a2), s2 = Math.sin(a2);
    const x1i = cx + c1 * innerR, y1i = cy + s1 * innerR;
    const x1o = cx + c1 * outerR, y1o = cy + s1 * outerR;
    const x2o = cx + c2 * outerR, y2o = cy + s2 * outerR;
    const x2i = cx + c2 * innerR, y2i = cy + s2 * innerR;
    segs.push(`M${x1i},${y1i} L${x1o},${y1o} A${outerR},${outerR} 0 0,1 ${x2o},${y2o} L${x2i},${y2i} A${innerR},${innerR} 0 0,0 ${x1i},${y1i} Z`);
  }
  const fs = label.length > 3 ? size * 0.21 : label.length > 2 ? size * 0.25 : label.length > 1 ? size * 0.3 : size * 0.34;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display:"block", flexShrink:0 }}>
      <circle cx={cx} cy={cy + 2} r={outerR} fill="rgba(0,0,0,0.4)" />
      <circle cx={cx} cy={cy} r={outerR} fill={bg} />
      {segs.map((d, i) => (
        <path key={i} d={d} fill={i % 2 === 0 ? "rgba(255,255,255,0.88)" : bg} />
      ))}
      <circle cx={cx} cy={cy} r={outerR} fill="none" stroke={border} strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={innerR} fill="none" stroke={border} strokeWidth="1" opacity="0.6" />
      <ellipse cx={cx - outerR * 0.18} cy={cy - outerR * 0.28} rx={outerR * 0.28} ry={outerR * 0.14} fill="rgba(255,255,255,0.13)" />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        fill={txt} fontWeight="900" fontSize={fs} fontFamily="Arial,sans-serif" letterSpacing="-0.5">
        {label}
      </text>
    </svg>
  );
}

function getBetChipMeta(usd: number) {
  if (usd >= 10_000) return CHIP_META["10000"];
  if (usd >= 1_000)  return CHIP_META["1000"];
  if (usd >= 100)    return CHIP_META["100"];
  if (usd >= 10)     return CHIP_META["10"];
  if (usd >= 1)      return CHIP_META["1"];
  if (usd >= 0.10)   return CHIP_META["0.1"];
  return CHIP_META["0.01"];
}

function fmtBetChipLabel(usd: number): string {
  // Convert to "coins" (label units, where $0.01 = 1 coin)
  const coins = Math.round(usd * 100);
  const buckets: [number, string][] = [
    [1_000_000, "1M"], [100_000, "100K"], [10_000, "10K"],
    [1_000, "1K"], [100, "100"], [10, "10"], [1, "1"],
  ];
  for (const [denom, label] of buckets) {
    if (coins >= denom) {
      const rem = coins % denom;
      if (rem === 0) {
        const total = coins; // total coins
        if (total >= 1_000_000) return `${total % 1_000_000 === 0 ? total/1_000_000 : (total/1_000_000).toFixed(1)}M`;
        if (total >= 1_000)     return `${total % 1_000 === 0 ? total/1_000 : (total/1_000).toFixed(1)}K`;
        return String(total);
      } else {
        return `+${label}`;
      }
    }
  }
  return "1";
}

function numColor(n: number) {
  if (n === 0) return "#1a6b30";
  return RED_NUMS.has(n) ? "#c0392b" : "#111827";
}

// Returns true if number `num` belongs to the given outside-bet group
function isInGroup(num: number, group: string): boolean {
  if (num === 0) return false;
  switch (group) {
    case "col_1":   return num % 3 === 1;
    case "col_2":   return num % 3 === 2;
    case "col_3":   return num % 3 === 0;
    case "dozen_1": return num >= 1  && num <= 12;
    case "dozen_2": return num >= 13 && num <= 24;
    case "dozen_3": return num >= 25 && num <= 36;
    case "red":     return RED_NUMS.has(num);
    case "black":   return !RED_NUMS.has(num);
    case "even":    return num % 2 === 0;
    case "odd":     return num % 2 !== 0;
    case "low":     return num >= 1  && num <= 18;
    case "high":    return num >= 19 && num <= 36;
    default:        return false;
  }
}


// Returns total return per unit bet (0 = lose)
function evalBet(key: string, win: number): number {
  if (key.startsWith("n_")) return parseInt(key.slice(2)) === win ? 36 : 0;
  if (win === 0) return 0;
  if (key === "dozen_1") return win >= 1 && win <= 12  ? 3 : 0;
  if (key === "dozen_2") return win >= 13 && win <= 24 ? 3 : 0;
  if (key === "dozen_3") return win >= 25 && win <= 36 ? 3 : 0;
  if (key === "col_3")   return win % 3 === 0 ? 3 : 0;           // top row: 3,6,...36
  if (key === "col_2")   return win % 3 === 2 ? 3 : 0;           // mid row: 2,5,...35
  if (key === "col_1")   return win % 3 === 1 ? 3 : 0;           // bot row: 1,4,...34
  if (key === "low")     return win >= 1 && win <= 18 ? 2 : 0;
  if (key === "high")    return win >= 19 && win <= 36 ? 2 : 0;
  if (key === "even")    return win % 2 === 0 ? 2 : 0;
  if (key === "odd")     return win % 2 !== 0 ? 2 : 0;
  if (key === "red")     return RED_NUMS.has(win) ? 2 : 0;
  if (key === "black")   return !RED_NUMS.has(win) ? 2 : 0;
  return 0;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface RouletteStats {
  wins: number; losses: number; profit: number; wagered: number;
  history: { profit: number; win: boolean }[];
}
export const rouletteStatsDefault: RouletteStats = { wins:0, losses:0, profit:0, wagered:0, history:[] };

export interface RouletteGameProps {
  balance: number;
  fmtMoney: (n: number) => string;
  convertUsd: (usd: number) => number;
  displayCurrency: string;
  currencyFade: number;
  onBack: () => void;
  onBalanceChange: (newBal: number) => void;
  addBet: (wagered: number, finalWin: number, game: string) => void;
  onBetRecord?: (amount: number, multiplier: number, win: boolean, payout: number) => void;
  liveRates: Record<string, number>;
  lang?: string;
  rouletteStats: RouletteStats;
  setRouletteStats: React.Dispatch<React.SetStateAction<RouletteStats>>;
  onVerTodo?: () => void;
  onMoreGames?: Record<string, () => void>;
  currentUser?: string;
  onRequestLogin?: () => void;
  onGameActive?: (active: boolean) => void;
}

// ── Drawing helpers ───────────────────────────────────────────────────────────
interface BallState { angleDeg: number; radius: number; }

// ── Ball state at normalized time t ∈ [0,1] ──────────────────────────────────
function computeBallState(t: number, sd: SpinData, canvas: HTMLCanvasElement): BallState {
  const outerR  = Math.min(canvas.width, canvas.height) / 2 - 3;
  const trackR  = outerR * 0.910;
  const segOutR = outerR * 0.848;
  const segInR  = outerR * 0.540;
  const pocketR = (segOutR + segInR) * 0.52 - segInR * 0.04;

  // ── Angle: natural linear deceleration — starts fast, slows smoothly to stop ──
  // at = 2t - t²  →  velocity = 2(1-t): linear from 2 at start to 0 at end, no jumps
  const at       = t * (2 - t);
  let angleDeg   = sd.ballStartAngle + sd.ballTotalDelta * at;

  // ── Bounce effect: 1-2 segment overshoot right before settle ─────────────
  if (t > 0.86) {
    const bt     = (t - 0.86) / 0.14;
    const bounce = sd.bounceMag * Math.sin(bt * Math.PI) * (1 - bt * 0.55);
    angleDeg    += bounce;
  }

  // ── Radius: orbit → drift → fall → settle ────────────────────────────────
  let radius: number;
  if (t < 0.62) {
    // Stable orbit at outer groove
    radius = trackR;
  } else if (t < 0.78) {
    // Drift inward — wobble envelope starts and ends at 0 (no radius jump at t=0.62)
    const p      = (t - 0.62) / 0.16;
    const drift  = p * p * (trackR - segOutR) * 0.65;
    // sin(p*PI) envelope ensures continuity at p=0 and p=1
    const wobble = Math.sin(p * Math.PI) * Math.sin(p * Math.PI * 4 + sd.wobbleSeed) * outerR * 0.026;
    radius = trackR - drift + wobble;
  } else if (t < 0.91) {
    // Active fall: smoothstep + fret rebounds
    const p     = (t - 0.78) / 0.13;
    const drop  = p * p * (3 - 2 * p);
    const fromR = trackR - (trackR - segOutR) * 0.65;
    const fret  = Math.abs(Math.sin(p * Math.PI * 4 + sd.fretSeed)) * Math.pow(1 - p, 1.4) * outerR * 0.032;
    radius = fromR - (fromR - pocketR) * drop + fret;
  } else {
    // Dampened settle in pocket
    const p      = (t - 0.91) / 0.09;
    const settle = Math.sin(p * Math.PI * 3) * (1 - p) * outerR * 0.010;
    radius = pocketR + settle;
  }

  return { angleDeg, radius };
}

function drawWheel(canvas: HTMLCanvasElement, wheelAngleDeg: number, ball?: BallState) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const outerR     = Math.min(cx, cy) - 3;  // outer edge
  const ballTrackR = outerR * 0.910;         // ball orbit radius
  const segOutR    = outerR * 0.848;         // outer edge of number segments
  const segInR     = outerR * 0.540;         // inner edge of number segments
  const numR       = (segOutR + segInR) * 0.52;
  const innerR     = segInR * 0.94;          // inner bowl
  const hubR       = outerR * 0.115;         // center hub
  const segRad     = (2 * Math.PI) / 37;
  // (rimR unused — kept for compat)
  const rimR       = outerR * 0.955;

  ctx.clearRect(0, 0, W, H);

  // ── OUTER DARK RING (bezel, no gold) ─────────────────────────────────────
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fillStyle = "#0d0d10";
  ctx.fill();

  // Very subtle outer glow
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Ball track ring (dark groove, no gold borders)
  ctx.beginPath();
  ctx.arc(cx, cy, ballTrackR + outerR * 0.025, 0, Math.PI * 2);
  ctx.arc(cx, cy, segOutR + outerR * 0.005, 0, Math.PI * 2, true);
  ctx.fillStyle = "#141416";
  ctx.fill("evenodd");

  // Subtle inner edge of groove
  ctx.beginPath();
  ctx.arc(cx, cy, segOutR + outerR * 0.005, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // ── ROTATING WHEEL ────────────────────────────────────────────────────────
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((wheelAngleDeg * Math.PI) / 180);

  for (let i = 0; i < 37; i++) {
    const num = WHEEL_NUMBERS[i];
    const sa  = -Math.PI / 2 + i * segRad;
    const ea  = sa + segRad;
    const col = num === 0 ? "#166534" : RED_NUMS.has(num) ? "#991b1b" : "#0a0a0f";
    const midA = sa + segRad / 2;

    // Segment fill (from center up to segOutR)
    ctx.beginPath();
    ctx.moveTo(Math.cos(sa) * segInR, Math.sin(sa) * segInR);
    ctx.arc(0, 0, segOutR, sa, ea);
    ctx.arc(0, 0, segInR, ea, sa, true);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();

    // Thin white separator line on each edge
    ctx.beginPath();
    ctx.moveTo(Math.cos(sa) * segInR, Math.sin(sa) * segInR);
    ctx.lineTo(Math.cos(sa) * segOutR, Math.sin(sa) * segOutR);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // Number text — radial orientation
    const tx = numR * Math.cos(midA), ty = numR * Math.sin(midA);
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(midA + Math.PI / 2);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.round(segOutR * 0.10)}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(num), 0, 0);
    ctx.restore();
  }

  // ── INNER SEPARATOR RING (clean line, no gold) ───────────────────────────
  ctx.beginPath();
  ctx.arc(0, 0, segInR, 0, Math.PI * 2);
  ctx.fillStyle = "#0e1018";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // ── INNER BOWL ───────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.arc(0, 0, innerR, 0, Math.PI * 2);
  ctx.fillStyle = "#111520";
  ctx.fill();

  // ── 4 YELLOW ARMS (simple, clean) ────────────────────────────────────────
  const armLen = innerR * 0.88;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * hubR, Math.sin(a) * hubR);
    ctx.lineTo(Math.cos(a) * armLen, Math.sin(a) * armLen);
    ctx.strokeStyle = "#f4a91f";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  // ── CENTER HUB (small yellow circle) ─────────────────────────────────────
  ctx.beginPath();
  ctx.arc(0, 0, hubR, 0, Math.PI * 2);
  ctx.fillStyle = "#f4a91f";
  ctx.fill();

  ctx.restore(); // end rotating context

  // ── POINTER (fixed, simple yellow triangle) ───────────────────────────────
  ctx.save();
  ctx.translate(cx, cy - outerR + 2);
  ctx.beginPath();
  ctx.moveTo(0, 9); ctx.lineTo(-6, -5); ctx.lineTo(6, -5);
  ctx.closePath();
  ctx.fillStyle = "#f4a91f";
  ctx.fill();
  ctx.restore();

  // ── BALL ─────────────────────────────────────────────────────────────────
  const br = outerR * 0.048;
  let bx: number, by: number;
  if (ball) {
    const aRad = (ball.angleDeg * Math.PI) / 180;
    bx = cx + ball.radius * Math.cos(aRad);
    by = cy + ball.radius * Math.sin(aRad);
  } else {
    bx = cx;
    by = cy - ballTrackR;
  }
  const ballG = ctx.createRadialGradient(bx - br * 0.35, by - br * 0.35, 0, bx, by, br);
  ballG.addColorStop(0, "#ffffff");
  ballG.addColorStop(0.5, "#dddddd");
  ballG.addColorStop(1, "#777777");
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fillStyle = ballG;
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(bx - br * 0.28, by - br * 0.30, br * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fill();
  void rimR; // suppress unused warning
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function RouletteGame({
  balance, fmtMoney, convertUsd, displayCurrency, currencyFade,
  onBack, onBalanceChange, addBet, onBetRecord,
  liveRates, lang: _lang = "es", rouletteStats, setRouletteStats,
  currentUser, onRequestLogin, onGameActive,
}: RouletteGameProps) {
  const currRate   = liveRates[displayCurrency] || 1;

  // ── State ───────────────────────────────────────────────────────────────────
  const [mode, setMode]       = useState<"manual"|"auto">("manual");
  const [chipUsd, setChipUsd] = useState(0.01);        // selected chip value (USD)
  const [chipOffset, setChipOffset] = useState(0);     // chip selector page offset
  const [tableBets, setTableBets]   = useState<Record<string,number>>({});
  const [betStack, setBetStack]     = useState<Array<{key:string; chip:number}>>([]);
  const [lastBets, setLastBets]     = useState<Record<string,number>>({});  // repeat bet
  const [phase, setPhase]           = useState<"idle"|"spinning"|"result">("idle");
  const [winNumber, setWinNumber]   = useState<number|null>(null);
  const [winAmountUsd, setWinAmountUsd] = useState(0);
  const [totalWageredUsd, setTotalWageredUsd] = useState(0);
  const [resultHistory, setResultHistory] = useState<number[]>([]);
  const [showWinPop, setShowWinPop] = useState(false);
  const [autoCount, setAutoCount]   = useState("10");
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoStopping, setAutoStopping] = useState(false); // delay de 2s al detener
  const [winCells, setWinCells]     = useState<Set<string>>(new Set());

  // Stats / volume panel
  const [statsOpen, setStatsOpen] = useState(false);
  const [showVol, setShowVol]     = useState(false);
  const [statsPos, setStatsPos]   = useState({ x: 270, y: 180 });
  const [rouletteChartHover, setRouletteChartHover] = useState<number|null>(null);
  const isStatsDragging    = useRef(false);
  const statsDragOffset    = useRef({ x: 0, y: 0 });
  // Hover highlight group for outside bets
  const [hoverGroup, setHoverGroup] = useState<string|null>(null);

  // Canvas
  const canvasRef        = useRef<HTMLCanvasElement>(null);
  const angleRef         = useRef(0);
  const ballWheelOffsetRef = useRef<number|null>(null); // angle offset to wheel when ball locks
  const ballRef          = useRef<BallState | undefined>(undefined);
  const animFrameRef     = useRef<number>();
  const spinDataRef      = useRef<SpinData | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const volRef           = useRef(70);
  const autoRef          = useRef(false);
  const autoBtnLockRef   = useRef(false); // debounce: locked while spinning, released when phase changes
  const autoBetsRef      = useRef<Record<string,number>>({}); // always-current bets for the auto loop
  const autoCountRef     = useRef<string>("10");               // always-current count for the auto loop
  const popTimerRef      = useRef<ReturnType<typeof setTimeout>>();
  const ballClearTimer   = useRef<ReturnType<typeof setTimeout>>();
  const prevBetsRef      = useRef<Record<string,number>>({});
  const pendingWagerRef  = useRef(0);   // amount deducted from balance for the current spin (0 when idle)
  const balanceRef       = useRef(balance); // always-current mirror of the balance prop

  const [vol, setVol] = useState(70);
  volRef.current = vol;
  balanceRef.current = balance; // keep in sync on every render

  // Notify parent whether a spin / auto session is in progress
  useEffect(() => { onGameActive?.(phase === "spinning" || autoRunning); }, [phase, autoRunning]);

  // ── Single main loop: idle rotation + ball animation ─────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function mainLoop(now: number) {
      // Compute dt (seconds), avoid large jumps after tab-switch
      const dt = lastFrameTimeRef.current
        ? Math.min((now - lastFrameTimeRef.current) / 1000, 0.05)
        : 0;
      lastFrameTimeRef.current = now;

      // Wheel always rotates at constant idle speed (counter-clockwise)
      angleRef.current -= IDLE_DEG_PER_SEC * dt;

      // Ball animation if spinning
      const sd = spinDataRef.current;
      if (sd) {
        const elapsed = now - sd.startTime;
        const t       = Math.min(elapsed / SPIN_MS, 1);
        ballRef.current = computeBallState(t, sd, canvas);
        if (t >= 1) {
          // Lock ball to wheel: record offset from wheel angle at moment of landing
          const finalState = computeBallState(1, sd, canvas);
          ballWheelOffsetRef.current = finalState.angleDeg - angleRef.current;
          spinDataRef.current = null;
          sd.onComplete();
          // Ball stays locked to wheel until the NEXT spin starts (cleared in startSpin).
          ballRef.current = { ...finalState };
        }
      }

      // If ball is locked to wheel, rotate it with the wheel
      if (ballRef.current && ballWheelOffsetRef.current !== null && !spinDataRef.current) {
        ballRef.current = { ...ballRef.current, angleDeg: angleRef.current + ballWheelOffsetRef.current };
      }

      drawWheel(canvas, angleRef.current, ballRef.current);
      animFrameRef.current = requestAnimationFrame(mainLoop);
    }

    animFrameRef.current = requestAnimationFrame(mainLoop);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, []);

  // ── Sound helpers ─────────────────────────────────────────────────────────

  // Chip-click sound for the Apostar button
  const playBetClick = useCallback(() => {
    if (volRef.current === 0) return;
    try {
      const vol = volRef.current / 100;
      const ctx = new AudioContext();
      // Crisp click transient
      const clickBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.055), ctx.sampleRate);
      const cd = clickBuf.getChannelData(0);
      for (let i = 0; i < cd.length; i++) {
        const t = i / cd.length;
        cd[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 4) * 0.9;
      }
      const clickSrc = ctx.createBufferSource();
      clickSrc.buffer = clickBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 1100; bp.Q.value = 1.2;
      const clickGain = ctx.createGain();
      clickGain.gain.value = vol * 0.55;
      clickSrc.connect(bp); bp.connect(clickGain); clickGain.connect(ctx.destination);
      clickSrc.start();
      // Low punchy thump beneath the click
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.connect(oscGain); oscGain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.07);
      oscGain.gain.setValueAtTime(vol * 0.35, ctx.currentTime);
      oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
    } catch {}
  }, []);

  // Ball spinning ratchet sound — ticks start fast and slow down over SPIN_MS
  const playWheelSpin = useCallback(() => {
    if (volRef.current === 0) return;
    try {
      const vol = volRef.current / 100;
      const ctx = new AudioContext();
      const dur = SPIN_MS / 1000;
      const TICKS = 32;
      // Tick timing: dense at start (fast ball), sparse at end (slowing down)
      for (let i = 0; i < TICKS; i++) {
        const p = i / (TICKS - 1);            // 0→1
        const timing = dur * Math.pow(p, 0.45); // early ticks bunched together
        const fadeVol = (1 - p * 0.6) * 0.28 * vol;
        const tickLen = Math.floor(ctx.sampleRate * 0.022);
        const tbuf = ctx.createBuffer(1, tickLen, ctx.sampleRate);
        const td = tbuf.getChannelData(0);
        for (let j = 0; j < tickLen; j++) {
          td[j] = (Math.random() * 2 - 1) * Math.exp(-j / (tickLen * 0.18));
        }
        const tsrc = ctx.createBufferSource();
        tsrc.buffer = tbuf;
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass"; hp.frequency.value = 700;
        const tgain = ctx.createGain();
        tgain.gain.value = fadeVol;
        tsrc.connect(hp); hp.connect(tgain); tgain.connect(ctx.destination);
        tsrc.start(ctx.currentTime + timing);
      }
      // Continuous whoosh that fades — simulates ball rolling along track
      const whooshLen = Math.floor(ctx.sampleRate * dur * 0.65);
      const wbuf = ctx.createBuffer(1, whooshLen, ctx.sampleRate);
      const wd = wbuf.getChannelData(0);
      for (let i = 0; i < whooshLen; i++) wd[i] = (Math.random() * 2 - 1) * 0.07;
      const wsrc = ctx.createBufferSource();
      wsrc.buffer = wbuf;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 280;
      const wgain = ctx.createGain();
      wgain.gain.setValueAtTime(vol * 0.18, ctx.currentTime);
      wgain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur * 0.65);
      wsrc.connect(lp); lp.connect(wgain); wgain.connect(ctx.destination);
      wsrc.start();
    } catch {}
  }, []);

  const playWin = useCallback(() => {
    if (volRef.current === 0) return;
    try {
      const vol = volRef.current / 100;
      const ctx = new AudioContext();
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.09);
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.09);
        gain.gain.linearRampToValueAtTime(0.2 * vol, ctx.currentTime + i * 0.09 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.09 + 0.35);
        osc.start(ctx.currentTime + i * 0.09);
        osc.stop(ctx.currentTime + i * 0.09 + 0.4);
      });
    } catch {}
  }, []);

  const playLose = useCallback(() => {
    if (volRef.current === 0) return;
    try {
      const vol = volRef.current / 100;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.18 * vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start(); osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }, []);

  // ── Derived values ─────────────────────────────────────────────────────────
  const totalBetUsd = Object.values(tableBets).reduce((s, v) => s + v, 0);
  const hasBets     = totalBetUsd > 0;
  const isSpinning  = phase === "spinning";
  const isResult    = phase === "result";
  const canSpin     = hasBets && !isSpinning && !isResult && (!currentUser || balance >= totalBetUsd - 0.0001);
  const chipDisplay = convertUsd(chipUsd);

  // ── Spin logic ─────────────────────────────────────────────────────────────
  // pocketCanvasAngle = where the ball physically lands on canvas (ANY angle, fully random)
  function launchBall(result: number, pocketCanvasAngle: number, bets: Record<string, number>, balBefore: number) {
    const resultIdx = WHEEL_NUMBERS.indexOf(result);

    // Ball starts at a random position on the outer track
    const ballStartAngle = Math.random() * 360;
    const ballRevs = 2 + Math.floor(Math.random() * 2); // 2-3 full CW revs (fast ball)
    let diff = ((pocketCanvasAngle - ballStartAngle) % 360 + 360) % 360;
    if (diff < 30) diff += 360;
    const ballTotalDelta = ballRevs * 360 + diff;

    // Bounce: 1-2 segments overshoot randomly forward or backward
    const bounceDir = Math.random() > 0.5 ? 1 : -1;
    const bounceMag = bounceDir * (SEG_DEG * (1.0 + Math.random() * 1.5));

    playWheelSpin();

    spinDataRef.current = {
      startTime:      performance.now(),
      result,
      resultIdx,
      ballStartAngle,
      ballTotalDelta,
      wobbleSeed:     Math.random() * Math.PI * 2,
      fretSeed:       Math.random() * Math.PI * 2,
      bounceMag,
      onComplete:     () => resolveBets(result, bets, balBefore),
    };
  }

  function resolveBets(result: number, bets: Record<string, number>, balBefore: number) {
    pendingWagerRef.current = 0; // spin completed — no refund needed on exit
    let totalWin = 0;
    const winning = new Set<string>();
    for (const [key, amt] of Object.entries(bets)) {
      const mult = evalBet(key, result);
      if (mult > 0) {
        totalWin += amt * mult;
        winning.add(key);
      }
    }
    const totalWag = Object.values(bets).reduce((s, v) => s + v, 0);
    const profit   = totalWin - totalWag;
    const isWin    = totalWin > 0;
    const newBal   = balBefore + totalWin; // balBefore already had bet deducted

    onBalanceChange(newBal);
    addBet(totalWag, totalWin, "Ruleta");
    onBetRecord?.(totalWag, totalWin > 0 ? totalWin / totalWag : 0, isWin, totalWin);

    if (isWin) playWin(); else playLose();

    setRouletteStats(prev => ({
      wins:    prev.wins + (isWin ? 1 : 0),
      losses:  prev.losses + (isWin ? 0 : 1),
      profit:  prev.profit + profit,
      wagered: prev.wagered + totalWag,
      history: [{ profit, win: isWin }, ...prev.history].slice(0, 50),
    }));

    setWinNumber(result);
    setWinAmountUsd(totalWin);
    setTotalWageredUsd(totalWag);
    setResultHistory(prev => [result, ...prev].slice(0, 20));
    setWinCells(winning);
    setPhase("result");

    if (totalWin > 0) {
      setShowWinPop(true);
      popTimerRef.current = setTimeout(() => setShowWinPop(false), 3000);
    }

    // Auto-mode — use refs (always current, never stale closure)
    if (autoRef.current) {
      const curCount  = autoCountRef.current;
      const remaining = parseInt(curCount) - 1;
      if (remaining > 0 || curCount === "∞") {
        if (curCount !== "∞") {
          autoCountRef.current = String(remaining);
          setAutoCount(String(remaining));
        }
        const betsForNext = autoBetsRef.current;
        popTimerRef.current = setTimeout(() => {
          if (!autoRef.current) return;
          startSpin(betsForNext, newBal);
        }, 1600);
      } else {
        autoRef.current = false;
        autoCountRef.current = "10";
        setAutoRunning(false);
        setAutoCount("10");
      }
    }
  }

  function startSpin(bets: Record<string, number>, currentBal?: number) {
    const wagUsd = Object.values(bets).reduce((s, v) => s + v, 0);
    if (wagUsd <= 0) return;
    const bal = currentBal ?? balance;
    if (bal < wagUsd) return;

    pendingWagerRef.current = wagUsd; // track for refund-on-exit
    onBalanceChange(bal - wagUsd);
    setPhase("spinning");
    setWinCells(new Set());
    setShowWinPop(false);

    // Clear any ball left from the previous round before launching the new one
    clearTimeout(ballClearTimer.current);
    ballRef.current           = undefined;
    ballWheelOffsetRef.current = null;

    // ── TRUE RANDOM RESULT — ball lands at CENTER of winning segment ──────
    // 1) Pick a random winner
    const resultIdx = Math.floor(Math.random() * 37);
    const result    = WHEEL_NUMBERS[resultIdx];

    // 2) Wheel angle at spin end (CCW constant rotation)
    const futureWheelAngle = angleRef.current - IDLE_DEG_PER_SEC * (SPIN_MS / 1000);

    // 3) Compute canvas angle of the EXACT CENTER of the winning segment.
    //    In local wheel coords: segment i starts at -90° + i*SEG_DEG (matching drawWheel).
    //    Center of segment = -90 + resultIdx*SEG_DEG + SEG_DEG/2 → convert to localFrom0 → canvas.
    const localFrom0Center  = (resultIdx * SEG_DEG + SEG_DEG / 2 + 360) % 360;
    const localAngleCenter  = (localFrom0Center - 90 + 360) % 360;
    const pocketCanvasAngle = (localAngleCenter + futureWheelAngle + 360) % 360;

    launchBall(result, pocketCanvasAngle, bets, bal - wagUsd);
  }

  function handleSpin() {
    if (!currentUser) { onRequestLogin?.(); return; }
    if (!canSpin) return;
    playBetClick();
    setLastBets(tableBets);
    startSpin(tableBets);
  }

  function handleNewRound() {
    // Do NOT cancel animFrameRef — idle loop must keep running.
    spinDataRef.current = null;
    setPhase("idle");
    setWinNumber(null);
    setWinCells(new Set());
    setShowWinPop(false);
    // tableBets and betStack are intentionally kept — player re-uses same bets.
  }

  // One-click flow: dismiss result and immediately spin with current bets
  function handleNewRoundAndSpin() {
    const bets = tableBets;
    const totalWag = Object.values(bets).reduce((s, v) => s + v, 0);
    // Reset result state (no need to set "idle" — startSpin sets "spinning" directly)
    spinDataRef.current = null;
    setWinNumber(null);
    setWinCells(new Set());
    setShowWinPop(false);
    if (totalWag > 0) {
      playBetClick();
      setLastBets(bets);
      startSpin(bets);
    } else if (Object.keys(lastBets).length > 0) {
      // No current bets: re-use last bets
      setTableBets(lastBets);
      playBetClick();
      startSpin(lastBets);
    } else {
      setPhase("idle");
    }
  }

  function handleRepeatBet() {
    if (Object.keys(lastBets).length === 0) return;
    setTableBets(lastBets);
    setPhase("idle");
    setWinNumber(null);
    setWinCells(new Set());
    setShowWinPop(false);
  }

  function handleUndo() {
    if (betStack.length === 0) return;
    const last = betStack[betStack.length - 1];
    setBetStack(prev => prev.slice(0, -1));
    setTableBets(prev => {
      const next = { ...prev };
      const cur = next[last.key] || 0;
      const newVal = Math.round((cur - last.chip) * 10000) / 10000;
      if (newVal <= 0) delete next[last.key];
      else next[last.key] = newVal;
      return next;
    });
  }

  function handleClear() {
    setBetStack([]);
    setTableBets({});
  }

  function placeBet(key: string) {
    if (isSpinning) return;
    playChipSound(volRef.current);
    if (key === "red") {
      setBetStack(prev => [...prev, { key: "red", chip: chipUsd }]);
      setTableBets(prev => ({ ...prev, red: Math.round(((prev.red || 0) + chipUsd) * 10000) / 10000 }));
    } else if (key === "black") {
      setBetStack(prev => [...prev, { key: "black", chip: chipUsd }]);
      setTableBets(prev => ({ ...prev, black: Math.round(((prev.black || 0) + chipUsd) * 10000) / 10000 }));
    } else {
      setBetStack(prev => [...prev, { key, chip: chipUsd }]);
      setTableBets(prev => ({ ...prev, [key]: Math.round(((prev[key] || 0) + chipUsd) * 10000) / 10000 }));
    }
  }

  function handleAutoStart() {
    if (!currentUser) { onRequestLogin?.(); return; }
    if (isSpinning || autoRunning || autoRef.current) return;
    if (Object.keys(tableBets).length === 0 && Object.keys(lastBets).length === 0) return;
    const bets = hasBets ? tableBets : lastBets;
    setLastBets(bets);
    autoBetsRef.current = bets;  // store in ref so the auto loop never uses a stale closure
    autoRef.current = true;
    setAutoRunning(true);
    startSpin(bets);
  }

  function handleAutoStop() {
    if (autoStopping) return;
    autoRef.current = false; // frenar el loop de inmediato
    setAutoStopping(true);
    setTimeout(() => {
      setAutoRunning(false);
      setAutoStopping(false);
      autoBtnLockRef.current = false;
    }, 2000);
  }

  // Release the button lock as soon as the spin ends (phase goes idle/result)
  useEffect(() => {
    if (phase !== "spinning") autoBtnLockRef.current = false;
  }, [phase]);

  function handleAutoButton() {
    if (autoBtnLockRef.current) return;
    if (autoStopping) return; // countdown en curso, ignorar clicks extra
    if (phase === "spinning") return; // locked while ball is rolling
    autoBtnLockRef.current = true; // lock immediately — released only when spin ends
    if (autoRunning) handleAutoStop();
    else handleAutoStart();
  }

  function handleStatsDragStart(e: React.MouseEvent) {
    isStatsDragging.current = true;
    statsDragOffset.current = { x: e.clientX - statsPos.x, y: e.clientY - statsPos.y };
    const onMove = (ev: MouseEvent) => {
      if (!isStatsDragging.current) return;
      setStatsPos({ x: ev.clientX - statsDragOffset.current.x, y: ev.clientY - statsDragOffset.current.y });
    };
    const onUp = () => { isStatsDragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (popTimerRef.current) clearTimeout(popTimerRef.current);
    autoRef.current = false;
    // Refund any wager that was deducted but never resolved (exited mid-spin)
    if (pendingWagerRef.current > 0) {
      onBalanceChange(balanceRef.current + pendingWagerRef.current);
      pendingWagerRef.current = 0;
    }
  }, []);

  function handleBack() {
    // Stop auto play and refund any in-flight wager before leaving
    autoRef.current = false;
    setAutoRunning(false);
    if (popTimerRef.current) clearTimeout(popTimerRef.current);
    if (pendingWagerRef.current > 0) {
      onBalanceChange(balanceRef.current + pendingWagerRef.current);
      pendingWagerRef.current = 0;
    }
    onBack();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const fmtChip = (usd: number) => {
    const disp = usd * currRate;
    if (disp >= 1000) return `${(disp / 1000).toFixed(0)}K`;
    if (disp >= 1)    return disp.toFixed(0);
    return disp.toFixed(2);
  };
  const fmtBetCell = (usd: number) => {
    const disp = usd * currRate;
    if (disp >= 1000) return `${(disp / 1000).toFixed(1)}K`;
    if (disp >= 10)   return disp.toFixed(0);
    return disp.toFixed(2);
  };

  // ── Table cell renderer ────────────────────────────────────────────────────
  function NumCell({ num }: { num: number }) {
    const key      = `n_${num}`;
    const betAmt   = tableBets[key] || 0;
    const isWin    = winCells.has(key);
    const col      = numColor(num);
    const groupLit = hoverGroup !== null && isInGroup(num, hoverGroup);
    return (
      <div
        onClick={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.transform = "";
          el.style.zIndex = "";
          placeBet(key);
        }}
        style={{
          position:"relative", display:"flex", alignItems:"center", justifyContent:"center",
          background: col, color:"#fff", fontWeight:700, fontSize:"11px",
          cursor: isSpinning ? "default" : "pointer",
          borderRadius:"4px", border: isWin ? "2px solid #16ff5c" : "2px solid rgba(255,255,255,0.06)",
          boxShadow: isWin ? "0 0 10px rgba(22,255,92,0.5)" : "none",
          transition:"box-shadow .15s, border-color .15s, transform .12s",
          userSelect:"none", height:"44px",
        }}
        onMouseEnter={e => {
          if (!isSpinning) {
            const ov = e.currentTarget.firstChild as HTMLElement;
            if (ov?.dataset?.ov !== undefined) ov.style.background = "rgba(255,255,255,0.28)";
            e.currentTarget.style.transform = "scale(1.06)";
            e.currentTarget.style.zIndex = "5";
          }
        }}
        onMouseLeave={e => {
          const ov = e.currentTarget.firstChild as HTMLElement;
          if (ov?.dataset?.ov !== undefined)
            ov.style.background = groupLit ? "rgba(255,255,255,0.2)" : "transparent";
          e.currentTarget.style.transform = "";
          e.currentTarget.style.zIndex = "";
        }}
      >
        {/* Overlay: tints ONLY the cell background on hover/group-lit — never brightens chip above it */}
        <div data-ov="" style={{
          position:"absolute", inset:0, borderRadius:"4px",
          background: groupLit ? "rgba(255,255,255,0.2)" : "transparent",
          pointerEvents:"none", zIndex:1, transition:"background .12s"
        }}/>
        {betAmt > 0 ? (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", zIndex:3 }}>
            <CasinoChipSVG {...getBetChipMeta(betAmt)} label={fmtBetChipLabel(betAmt)} size={32} />
          </div>
        ) : (
          <span style={{ position:"relative", zIndex:2 }}>{num}</span>
        )}
      </div>
    );
  }

  function OutsideCell({ label, betKey, color, style = {}, groupKey }: {
    label: React.ReactNode; betKey: string; color?: string;
    style?: React.CSSProperties; groupKey?: string;
  }) {
    const betAmt = tableBets[betKey] || 0;
    const isWin  = winCells.has(betKey);
    const gKey   = groupKey ?? betKey; // which group to highlight on hover
    return (
      <div
        onClick={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.transform = "";
          el.style.filter = "";
          el.style.zIndex = "";
          placeBet(betKey);
        }}
        style={{
          position:"relative", display:"flex", alignItems:"center", justifyContent:"center",
          background: color || "#1a2438", color:"#c8d8f0", fontWeight:700, fontSize:"10px",
          cursor: isSpinning ? "default" : "pointer",
          borderRadius:"4px", border: isWin ? "2px solid #16ff5c" : "2px solid rgba(255,255,255,0.06)",
          boxShadow: isWin ? "0 0 10px rgba(22,255,92,0.5)" : "none",
          transition:"box-shadow .15s, border-color .15s, filter .12s, transform .12s",
          userSelect:"none", minHeight:"26px", padding:"2px 4px", textAlign:"center",
          ...style,
        }}
        onMouseEnter={e => {
          if (!isSpinning) {
            (e.currentTarget as HTMLElement).style.filter = "brightness(1.28)";
            (e.currentTarget as HTMLElement).style.transform = "scale(1.06)";
            (e.currentTarget as HTMLElement).style.zIndex = "5";
            setHoverGroup(gKey);
          }
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.filter = "";
          (e.currentTarget as HTMLElement).style.transform = "";
          (e.currentTarget as HTMLElement).style.zIndex = "";
          setHoverGroup(null);
        }}
      >
        {betAmt > 0 ? (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", zIndex:3 }}>
            <CasinoChipSVG {...getBetChipMeta(betAmt)} label={fmtBetChipLabel(betAmt)} size={28} />
          </div>
        ) : (
          <span style={{ position:"relative", zIndex:1 }}>{label}</span>
        )}
      </div>
    );
  }

  // ── JSX ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ width:"100%", display:"flex", fontFamily:"'Inter',sans-serif", position:"relative", background:"#0e1320", userSelect:"none", WebkitUserSelect:"none" }}>


      {/* ─── LEFT PANEL ──────────────────────────────────────────────────── */}
      <div style={{ width:"260px", flexShrink:0, background:"#131a28", borderRight:"1px solid #1a2438", padding:"16px", display:"flex", flexDirection:"column", gap:"12px" }}>

        {/* Tabs: Manual / Automático */}
        <div style={{ display:"flex", alignItems:"center", background:"#0e1826", borderRadius:"14px", padding:"5px", gap:"4px" }}>
          <button onClick={() => { if (!autoRunning) setMode("manual"); }} disabled={autoRunning}
            style={{ flex:1, background:mode==="manual"?"#1e2c44":"transparent", color:mode==="manual"?"#eef3f8":"#5a6a88", border:mode==="manual"?"1px solid #3a4a60":"1px solid transparent", borderRadius:"10px", padding:"10px", fontWeight:500, cursor:autoRunning?"not-allowed":"pointer", fontSize:"14px", opacity:autoRunning&&mode!=="manual"?0.45:1, transition:"opacity .2s" }}>
            Manual
          </button>
          <button onClick={() => { if (!autoRunning) setMode("auto"); }} disabled={autoRunning}
            style={{ flex:1, background:mode==="auto"?"#1e2c44":"transparent", color:mode==="auto"?"#eef3f8":"#5a6a88", border:mode==="auto"?"1px solid #3a4a60":"1px solid transparent", borderRadius:"10px", padding:"10px", fontWeight:500, cursor:autoRunning?"not-allowed":"pointer", fontSize:"14px", opacity:autoRunning&&mode!=="auto"?0.45:1, transition:"opacity .2s" }}>
            Automático
          </button>
        </div>

        {/* Chip selector — arrow-navigated with 4 visible chips */}
        {(() => {
          const VISIBLE = 4;
          const canLeft  = chipOffset > 0;
          const canRight = chipOffset + VISIBLE < CHIP_VALUES.length;
          const visChips = CHIP_VALUES.slice(chipOffset, chipOffset + VISIBLE);
          const arrowBtn = (enabled: boolean, onClick: () => void, label: string) => (
            <button onClick={onClick} disabled={!enabled}
              onMouseEnter={e => { if (enabled) e.currentTarget.style.color = "#ffffff"; e.currentTarget.style.textShadow = enabled ? "0 0 10px rgba(255,255,255,0.8)" : "none"; }}
              onMouseLeave={e => { e.currentTarget.style.color = enabled ? "#c0d0e0" : "#2a3a50"; e.currentTarget.style.textShadow = "none"; }}
              style={{ flexShrink:0, width:"26px", background:"none", border:"none", padding:0,
                color: enabled ? "#c0d0e0" : "#2a3a50", fontSize:"20px", fontWeight:800, fontFamily:"inherit",
                cursor: enabled ? "pointer" : "default", lineHeight:1,
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"color .15s, text-shadow .15s" }}>
              {label}
            </button>
          );
          return (
            <div>
              <div style={{ fontSize:"10px", color:"#5a7090", marginBottom:"5px", fontWeight:600, letterSpacing:"0.5px" }}>
                {gt(_lang, "chips")}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:"4px",
                background:"#0e1826", border:"1px solid #252f45", borderRadius:"10px", padding:"6px 4px", overflow:"visible" }}>
                {arrowBtn(canLeft, () => setChipOffset(o => o - 1), "‹")}
                <div style={{ display:"flex", flex:1, gap:"4px", justifyContent:"space-around", alignItems:"center", overflow:"visible" }}>
                  {visChips.map(v => {
                    const meta = CHIP_META[chipKey(v)];
                    const sel  = chipUsd === v;
                    return (
                      <button key={v} onClick={() => setChipUsd(v)}
                        title={`${meta.label} = $${v.toFixed(v < 1 ? 2 : 0)} USD`}
                        style={{ flexShrink:0, background:"none", border:"none", padding:0,
                          cursor:"pointer", outline:"none", fontFamily:"inherit",
                          filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.5))",
                          transform:"scale(1)",
                          transition:"filter .15s, transform .13s" }}
                        onMouseEnter={e => {
                          e.currentTarget.style.transform = "scale(1.2)";
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = "scale(1)";
                          e.currentTarget.style.filter = "drop-shadow(0 2px 3px rgba(0,0,0,0.5))";
                        }}>
                        <CasinoChipSVG {...meta} selected={sel} size={30} />
                      </button>
                    );
                  })}
                </div>
                {arrowBtn(canRight, () => setChipOffset(o => o + 1), "›")}
              </div>
            </div>
          );
        })()}

        {/* Total bet */}
        <div style={{ background:"#0e1826", border:"1px solid #252f45", borderRadius:"10px", padding:"10px 12px" }}>
          <div style={{ fontSize:"10px", color:"#4a6080", marginBottom:"4px", fontWeight:600, letterSpacing:"0.5px" }}>{gt(_lang, "totalBet")}</div>
          <div style={{ fontSize:"16px", fontWeight:800, color: totalBetUsd > 0 ? "#e0e8f4" : "#4a6080", opacity: currencyFade }}>
            {totalBetUsd > 0 ? fmtMoney(totalBetUsd) : `${fmtMoney(0)}`}
          </div>
        </div>

        {/* Half / Double — identical to Baccarat */}
        {(()=>{
          const canHD = phase === "idle" && hasBets;
          return (
            <div style={{ display:"flex", gap:"8px" }}>
              {([["½", 0.5],["2×", 2]] as [string,number][]).map(([label,mult]) => (
                <button key={label}
                  disabled={!canHD}
                  onClick={() => {
                    if (!canHD) return;
                    setTableBets(prev => {
                      const scaled: Record<string,number> = {};
                      let sum = 0;
                      for (const [k,v] of Object.entries(prev)) {
                        const nv = Math.round(v * mult * 10000) / 10000;
                        scaled[k] = nv;
                        sum += nv;
                      }
                      // Cap double at available balance
                      if (mult > 1 && sum > balance) {
                        const cap = balance / sum;
                        for (const k of Object.keys(scaled)) scaled[k] = Math.round(scaled[k] * cap * 10000) / 10000;
                      }
                      return scaled;
                    });
                  }}
                  style={{
                    flex:1, padding:"10px 0", borderRadius:"10px", fontSize:"15px",
                    fontWeight:700, border:"1px solid #252f45",
                    background: canHD ? "#1a2438" : "#101926",
                    color: canHD ? "#d0dcea" : "#2a3a50",
                    cursor: canHD ? "pointer" : "not-allowed",
                    transition:"background .15s", fontFamily:"inherit",
                  }}>
                  {label}
                </button>
              ))}
            </div>
          );
        })()}

        {hasBets && !isSpinning && !isResult && balance < totalBetUsd - 0.0001 && (
          <div style={{ fontSize:"11.5px", color:"#e74c3c", fontWeight:600, marginBottom:"6px", paddingLeft:"2px" }}>
            Saldo insuficiente
          </div>
        )}

        {/* Main action button */}
        {(!isResult || autoRunning || mode === "auto") ? (
          mode === "manual" ? (
            <button onClick={handleSpin} disabled={!canSpin}
              style={{ width:"100%", padding:"14px", borderRadius:"12px", border:"none", fontFamily:"inherit",
                background: canSpin ? "linear-gradient(180deg,#1a9fff,#0d6fd4)" : "#1a2438",
                color: canSpin ? "#fff" : "#3a4a60",
                fontWeight:800, fontSize:"14px", letterSpacing:"0.5px",
                cursor: canSpin ? "pointer" : "not-allowed",
                boxShadow: canSpin ? "0 4px 22px rgba(26,159,255,.35)" : "none",
                transition:"all .2s" }}
              onMouseEnter={e => { if (canSpin) { e.currentTarget.style.transform="scale(1.03)"; e.currentTarget.style.boxShadow="0 6px 32px rgba(26,159,255,.65)"; }}}
              onMouseLeave={e => { e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=canSpin?"0 4px 22px rgba(26,159,255,.35)":"none"; }}>
              {isSpinning ? gt(_lang, "rolling") : (hasBets && !!currentUser && balance < totalBetUsd - 0.0001) ? gt(_lang, "insufficientBalance") : gt(_lang, "bet")}
            </button>
          ) : (
            <button
              onClick={handleAutoButton}
              disabled={isSpinning || autoStopping || (!autoRunning && !hasBets && Object.keys(lastBets).length === 0)}
              style={{ width:"100%", padding:"14px", borderRadius:"12px", border:"none", fontFamily:"inherit",
                background: isSpinning ? "#1a2438" : autoStopping ? "linear-gradient(135deg,#b07d20,#8a6010)" : autoRunning ? "linear-gradient(135deg,#c0392b,#a93226)" : (hasBets || Object.keys(lastBets).length > 0) ? "linear-gradient(180deg,#1a9fff,#0d6fd4)" : "#1a2438",
                color: (isSpinning || (!autoRunning && !hasBets && Object.keys(lastBets).length === 0)) ? "#3a4a60" : "#fff",
                fontWeight:800, fontSize:"14px",
                cursor: (isSpinning || autoStopping || (!autoRunning && !hasBets && Object.keys(lastBets).length === 0)) ? "not-allowed" : "pointer",
                opacity: isSpinning ? 0.45 : 1,
                boxShadow: isSpinning ? "none" : autoStopping ? "0 4px 22px rgba(176,125,32,.4)" : autoRunning ? "0 4px 22px rgba(192,57,43,.4)" : (hasBets || Object.keys(lastBets).length > 0) ? "0 4px 22px rgba(26,159,255,.35)" : "none",
                transition:"all .2s" }}
              onMouseEnter={e => {
                if (!isSpinning && !autoStopping) {
                  e.currentTarget.style.transform = "scale(1.03)";
                  e.currentTarget.style.boxShadow = autoRunning
                    ? "0 6px 32px rgba(192,57,43,.7)"
                    : "0 6px 32px rgba(26,159,255,.65)";
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "";
                e.currentTarget.style.boxShadow = autoStopping ? "0 4px 22px rgba(176,125,32,.4)" : autoRunning
                  ? "0 4px 22px rgba(192,57,43,.4)"
                  : (hasBets || Object.keys(lastBets).length > 0) ? "0 4px 22px rgba(26,159,255,.35)" : "none";
              }}>
              {autoStopping ? gt(_lang, "stoppingAuto") : autoRunning ? gt(_lang, "stopAuto") : gt(_lang, "startAuto")}
            </button>
          )
        ) : (
          <button onClick={handleNewRoundAndSpin}
            style={{ width:"100%", padding:"14px", borderRadius:"12px", border:"none", fontFamily:"inherit",
              background:"linear-gradient(180deg,#1a9fff,#0d6fd4)", color:"#fff",
              fontWeight:800, fontSize:"14px", letterSpacing:"0.5px", cursor:"pointer",
              boxShadow:"0 4px 22px rgba(26,159,255,.35)", transition:"all .2s" }}
            onMouseEnter={e => { e.currentTarget.style.transform="scale(1.03)"; e.currentTarget.style.boxShadow="0 6px 32px rgba(26,159,255,.65)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow="0 4px 22px rgba(26,159,255,.35)"; }}>
            Apostar
          </button>
        )}

        {/* Stats panel (floating, draggable — identical to Hilo/Mines) */}
        {statsOpen && (
          <div style={{ position:"fixed", left:statsPos.x, top:statsPos.y, zIndex:9999, width:"280px",
            background:"#0f1f2e", border:"1px solid #1e3a52", borderRadius:"14px",
            boxShadow:"0 8px 32px rgba(0,0,0,.7)", overflow:"hidden", userSelect:"none" }}>
            {/* Title bar — drag handle */}
            <div onMouseDown={handleStatsDragStart}
              style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"12px 14px", background:"#112232", borderBottom:"1px solid #1e3a52", cursor:"grab" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                <span style={{ display:"flex", alignItems:"center", color:"#7a9db8" }}>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
                    <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
                  </svg>
                </span>
                <strong style={{ fontSize:"14px", color:"#d8e8f5" }}>{gt(_lang, "liveStats")}</strong>
              </div>
              <button onClick={() => setStatsOpen(false)}
                style={{ background:"none", border:"none", color:"#7a9db8", fontSize:"18px", cursor:"pointer", lineHeight:1, padding:"0 2px" }}>×</button>
            </div>

            <div style={{ padding:"12px" }}>
              {/* Stats rows */}
              <div style={{ background:"#0d1a28", borderRadius:"10px", padding:"12px", marginBottom:"8px", display:"flex", flexDirection:"column", gap:"8px" }}>
                {([
                  { label:"Ganancia",  value: fmtMoney(rouletteStats.profit),  color: rouletteStats.profit >= 0 ? "#16ff5c" : "#ff5959" },
                  { label:"Victorias", value: String(rouletteStats.wins),       color:"#16ff5c" },
                  { label:"Apostado",  value: fmtMoney(rouletteStats.wagered),  color:"#d8e8f5" },
                  { label:"Derrotas",  value: String(rouletteStats.losses),     color:"#ff5959" },
                ] as { label:string; value:string; color:string }[]).map(s => (
                  <div key={s.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ color:"#7a9db8", fontSize:"11.5px" }}>{s.label}</span>
                    <span style={{ color:s.color, fontWeight:500, fontSize:"13px" }}>{s.value}</span>
                  </div>
                ))}
              </div>

              {/* Reset button */}
              <button onClick={() => setRouletteStats(rouletteStatsDefault)}
                style={{ width:"100%", marginBottom:"8px", background:"transparent", border:"1px solid #1e3a52", borderRadius:"8px", color:"#7a9db8", fontSize:"12px", cursor:"pointer", padding:"6px 0", display:"flex", alignItems:"center", justifyContent:"center", gap:"6px", transition:"color .15s,border-color .15s,background .15s", fontFamily:"inherit" }}
                onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color="#fff"; b.style.borderColor="#3a8aff"; b.style.background="#0d1f30"; }}
                onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color="#7a9db8"; b.style.borderColor="#1e3a52"; b.style.background="transparent"; }}>
                <span style={{ fontSize:"14px" }}>↺</span> Reiniciar estadísticas
              </button>

              {/* Cumulative profit chart */}
              {(()=>{
                const raw = rouletteStats.history.length > 0 ? rouletteStats.history.slice().reverse() : null;
                const W=320, H=210, PAD_X=12, PAD_Y=20;
                const chartW = W - PAD_X*2, chartH = H - PAD_Y*2;
                interface RChartPt { cum:number; win:boolean; profit:number }
                let series: RChartPt[] = [];
                if (raw) { let r = 0; series = raw.map(p => { r += (p.profit??0); return { cum:r, win:p.win, profit:p.profit??0 }; }); }
                const allPts: RChartPt[] = raw ? [{ cum:0, win:false, profit:0 }, ...series] : [];
                const n = allPts.length;
                if (n < 2) return (
                  <div style={{ position:"relative", background:"#0a1520", borderRadius:"12px", height:"190px", display:"flex", alignItems:"center", justifyContent:"center", border:"1px solid #1a3347" }}>
                    <span style={{ color:"#2a4a6a", fontSize:"12px" }}>{gt(_lang, "noHistoryShort")}</span>
                  </div>
                );
                const cums = allPts.map(p => p.cum);
                const minC = Math.min(0, ...cums), maxC = Math.max(0, ...cums);
                const range = maxC - minC || 1;
                const toX = (i:number) => PAD_X + i * (chartW / Math.max(n-1,1));
                const toY = (v:number) => PAD_Y + chartH - ((v - minC) / range) * chartH;
                const zeroY = toY(0);
                const xs = allPts.map((_,i) => toX(i));
                const ys = allPts.map(p => toY(p.cum));
                const hIdx = rouletteChartHover;
                const hpt = hIdx !== null && hIdx > 0 && hIdx < allPts.length ? allPts[hIdx] : null;
                const tipLeft = hIdx !== null && xs.length ? Math.min(Math.max((xs[hIdx]/W)*100, 12), 78) : 0;
                const tipTop  = hIdx !== null && ys.length ? Math.max((ys[hIdx]/H)*100 - 14, 2) : 0;
                const linePath  = xs.map((x,i) => `${i===0?"M":"L"}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
                const fillAbove = linePath + ` L${xs[n-1].toFixed(1)} ${zeroY.toFixed(1)} L${xs[0].toFixed(1)} ${zeroY.toFixed(1)} Z`;
                const fillBelow = linePath + ` L${xs[n-1].toFixed(1)} ${zeroY.toFixed(1)} L${xs[0].toFixed(1)} ${zeroY.toFixed(1)} Z`;
                return (
                  <div style={{ position:"relative", background:"#0a1520", borderRadius:"12px", height:"190px", overflow:"visible", border:"1px solid #1a3347" }}>
                    {hpt && (
                      <div style={{ position:"absolute", left:`${tipLeft}%`, top:`${tipTop}%`,
                        transform:"translateX(-50%) translateY(-100%)",
                        background:"#1a2a3a", border:`1.5px solid ${hpt.profit>=0?"#19ff35":"#ff3350"}`,
                        borderRadius:"8px", padding:"4px 10px", fontSize:"12px", fontWeight:500,
                        color: hpt.profit>=0?"#19ff35":"#ff3350", whiteSpace:"nowrap",
                        pointerEvents:"none", zIndex:20,
                        boxShadow:`0 2px 12px ${hpt.profit>=0?"rgba(25,255,53,.3)":"rgba(255,51,80,.3)"}` }}>
                        {hpt.profit>=0?"+":""}{fmtMoney(hpt.profit)}
                        <span style={{ color:"#7a9db8", fontWeight:400, fontSize:"10px", marginLeft:"6px" }}>
                          acum: {hpt.cum>=0?"+":""}{fmtMoney(hpt.cum)}
                        </span>
                      </div>
                    )}
                    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
                      style={{ width:"100%", height:"100%", display:"block", cursor:"crosshair" }}
                      onMouseMove={e => {
                        if (!xs.length) return;
                        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
                        const svgX = ((e.clientX - rect.left) / rect.width) * W;
                        let closest = 0, minDist = Infinity;
                        xs.forEach((x,i) => { const d = Math.abs(x - svgX); if (d < minDist) { minDist=d; closest=i; } });
                        setRouletteChartHover(closest);
                      }}
                      onMouseLeave={() => setRouletteChartHover(null)}>
                      <defs>
                        <clipPath id="rouletteClipAbove"><rect x={PAD_X} y={PAD_Y} width={chartW} height={zeroY-PAD_Y}/></clipPath>
                        <clipPath id="rouletteClipBelow"><rect x={PAD_X} y={zeroY} width={chartW} height={chartH-(zeroY-PAD_Y)}/></clipPath>
                      </defs>
                      {n > 1 ? <>
                        <path d={fillBelow} fill="rgba(200,30,30,.35)" clipPath="url(#rouletteClipBelow)"/>
                        <path d={fillAbove} fill="rgba(25,255,80,.18)" clipPath="url(#rouletteClipAbove)"/>
                        <line x1={PAD_X} y1={zeroY} x2={W-PAD_X} y2={zeroY} stroke="#2a4055" strokeWidth="1.5"/>
                        <path d={linePath} fill="none" stroke="#19ff35" strokeWidth="2.5" strokeLinejoin="miter" strokeLinecap="square" clipPath="url(#rouletteClipAbove)"/>
                        <path d={linePath} fill="none" stroke="#e03030" strokeWidth="2.5" strokeLinejoin="miter" strokeLinecap="square" clipPath="url(#rouletteClipBelow)"/>
                        <rect x={PAD_X} y={PAD_Y} width={chartW} height={chartH} fill="transparent"/>
                        {hIdx !== null && hIdx < allPts.length && <>
                          <line x1={xs[hIdx]} y1={PAD_Y} x2={xs[hIdx]} y2={H-PAD_Y} stroke="#3a5570" strokeWidth="1" strokeDasharray="4,3"/>
                          <circle cx={xs[hIdx]} cy={ys[hIdx]} r="5"
                            fill={allPts[hIdx].profit>=0?"#19ff35":"#ff3350"} stroke="#0a1520" strokeWidth="2"
                            style={{ pointerEvents:"none" }}/>
                        </>}
                      </> : <line x1={PAD_X} y1={H/2} x2={W-PAD_X} y2={H/2} stroke="#2a4055" strokeWidth="1.5"/>}
                    </svg>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Footer: Stats + Volume icon buttons */}
        <div style={{ marginTop:"auto", display:"flex", gap:"8px", position:"relative" }}>
          <button onClick={() => { setStatsOpen(v => !v); setShowVol(false); }}
            title={gt(_lang, "liveStatsTitle")}
            style={{ width:"38px", height:"38px", borderRadius:"8px", fontFamily:"inherit",
              background: statsOpen ? "#1f6fd0" : "#0e1826",
              border: statsOpen ? "1px solid #3a8aff" : "1px solid #203a50",
              color: statsOpen ? "#fff" : "#7a9db8",
              cursor:"pointer", fontSize:"17px",
              display:"flex", alignItems:"center", justifyContent:"center",
              transition:"background .2s,border .2s,color .2s,transform .12s,filter .12s" }}
            onMouseEnter={e => { e.currentTarget.style.filter="brightness(1.4)"; e.currentTarget.style.transform="scale(1.12)"; }}
            onMouseLeave={e => { e.currentTarget.style.filter=""; e.currentTarget.style.transform=""; }}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
          </button>

          <div style={{ position:"relative" }}>
            {showVol && (
              <div onClick={() => setShowVol(false)}
                style={{ position:"fixed",inset:0,zIndex:9998 }}/>
            )}
            <button onClick={() => { setShowVol(v => !v); setStatsOpen(false); }}
              title={gt(_lang, "volume")}
              style={{ position:"relative", zIndex:10000, width:"38px", height:"38px", borderRadius:"8px", fontFamily:"inherit",
                background: showVol ? "#1f6fd0" : "#0e1826",
                border: showVol ? "1px solid #3a8aff" : "1px solid #203a50",
                color: showVol ? "#fff" : "#7a9db8",
                cursor:"pointer", fontSize:"17px",
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"background .2s,border .2s,color .2s,transform .12s,filter .12s" }}
              onMouseEnter={e => { e.currentTarget.style.filter="brightness(1.4)"; e.currentTarget.style.transform="scale(1.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.filter=""; e.currentTarget.style.transform=""; }}>
              {vol === 0 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg> : vol < 40 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}
            </button>
            {showVol && (
              <div style={{ position:"absolute", bottom:"48px", left:"0",
                background:"#0f1e2e", border:"1px solid #252f45",
                borderRadius:"12px", padding:"10px 16px",
                display:"flex", alignItems:"center", gap:"12px",
                minWidth:"200px", boxShadow:"0 4px 20px rgba(0,0,0,.5)", zIndex:10000 }}>
                <span style={{ fontSize:"18px", flexShrink:0, color:"#5a6a88" }}>
                  {vol === 0 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg> : vol < 40 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}
                </span>
                <input type="range" min={0} max={100} step={1} value={vol}
                  onChange={e => { const n = Number(e.target.value); setVol(n); volRef.current = n; }}
                  style={{ flex:1, accentColor:"#f4a91f", cursor:"pointer", height:"4px" }}/>
                <span style={{ color:"#d0dcea", fontWeight:500, fontSize:"13px", minWidth:"24px", textAlign:"right" }}>{vol}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── RIGHT AREA ──────────────────────────────────────────────────── */}
      <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:"16px", padding:"12px 16px 16px" }}>

        {/* Wheel row — CSS grid: [último nº] [wheel] [history] */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 245px 1fr", alignItems:"center", gap:"0", height:"265px" }}>

          {/* Left column: último número, centered */}
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"5px" }}>
            {resultHistory.length > 0 && (() => {
              const last = resultHistory[0];
              const bg = last === 0 ? "#1a6b30" : RED_NUMS.has(last) ? "#c0392b" : "#111827";
              return (
                <>
                  <div style={{ fontSize:"9px", color:"#4a6080", fontWeight:700, letterSpacing:"0.5px", textTransform:"uppercase" }}>{gt(_lang, "lastResult")}</div>
                  <div style={{ width:"72px", height:"72px", borderRadius:"50%", background:bg,
                    border:"3px solid rgba(255,255,255,0.3)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontWeight:900, fontSize:"28px", color:"#fff",
                    boxShadow:`0 0 28px ${bg}cc, 0 0 10px rgba(0,0,0,0.9)` }}>
                    {last}
                  </div>
                </>
              );
            })()}
          </div>

          {/* Center column: wheel canvas + win popup overlay */}
          <div style={{ position:"relative", width:"245px", height:"245px" }}>
            <canvas ref={canvasRef} width={245} height={245}
              style={{ borderRadius:"50%", boxShadow:"0 0 40px rgba(0,0,0,0.85), 0 0 16px rgba(244,169,31,0.18)", display:"block" }}/>

            {/* ── Win popup — Keno style, centered over wheel ── */}
            {showWinPop && winNumber !== null && totalWageredUsd > 0 && (
              <div style={{
                position:"absolute", inset:0,
                display:"flex", alignItems:"center", justifyContent:"center",
                zIndex:200, pointerEvents:"none",
              }}>
                <div style={{
                  background:"rgba(10,16,26,0.96)", border:"2.5px solid #22ee66",
                  borderRadius:"16px", padding:"18px 28px", textAlign:"center",
                  boxShadow:"0 0 52px rgba(34,238,102,.48), 0 8px 32px rgba(0,0,0,.8)",
                  animation:"kenoCenterPop .32s cubic-bezier(.34,1.56,.64,1) both",
                  minWidth:"130px", whiteSpace:"nowrap",
                }}>
                  <div style={{
                    width:"50px", height:"50px", borderRadius:"50%",
                    background: winNumber === 0 ? "#1a6b30" : RED_NUMS.has(winNumber) ? "#c0392b" : "#111827",
                    border:"3px solid rgba(255,255,255,0.32)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontWeight:900, fontSize:"22px", color:"#fff",
                    margin:"0 auto 12px",
                    boxShadow:"0 0 18px rgba(34,238,102,0.3)",
                  }}>
                    {winNumber}
                  </div>
                  <div style={{ fontSize:"30px", fontWeight:700, color:"#22ee66", lineHeight:1, letterSpacing:"-0.5px" }}>
                    {(winAmountUsd / totalWageredUsd).toLocaleString("es-AR", { minimumFractionDigits:2, maximumFractionDigits:2 })}×
                  </div>
                  <div style={{ height:"1px", background:"#1e3a28", margin:"11px 0" }}/>
                  <div style={{ fontSize:"15px", fontWeight:500, color:"#8aabb0" }}>
                    <span style={{ opacity:currencyFade, transition:"opacity .18s" }}>{fmtMoney(winAmountUsd)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right column: history strip, shifted left to align with num 36 */}
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
            gap:"4px", height:"280px", overflowY:"hidden", justifyContent:"flex-start",
            paddingTop:"5px", marginLeft:"-11px" }}>
            {resultHistory.slice(0, 12).map((n, i) => {
              const bg = n === 0 ? "#1a6b30" : RED_NUMS.has(n) ? "#c0392b" : "#111827";
              const opacity = Math.max(0.25, 1 - i * 0.07);
              return (
                <div key={i} style={{ flexShrink:0, width:"28px", height:"28px", borderRadius:"50%",
                  background:bg, border:"1.5px solid rgba(255,255,255,0.18)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontWeight:700, fontSize:"10px", color:"#fff", opacity,
                  boxShadow:`0 0 6px ${bg}88` }}>
                  {n}
                </div>
              );
            })}
          </div>

        </div>

        {/* ─── Betting Table ─────────────────────────────────────────────── */}
        <div style={{ overflowX:"auto", overflowY:"hidden", display:"flex", justifyContent:"center" }}>
          <div>

            {/* Main grid: 0 + 12 columns + 2:1 */}
            <div style={{ display:"grid", gridTemplateColumns:"36px repeat(12, 44px) 48px", gap:"3px", marginBottom:"3px" }}>
              {/* Zero */}
              <div style={{ gridRow:"1 / span 3" }}
                onClick={() => placeBet("n_0")}
                onMouseEnter={e => { if (!isSpinning && !isResult) { (e.currentTarget as HTMLElement).style.filter = "brightness(1.25)"; (e.currentTarget as HTMLElement).style.transform = "scale(1.06)"; (e.currentTarget as HTMLElement).style.zIndex = "5"; }}}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = ""; (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.zIndex = ""; }}>
                <div style={{ position:"relative", height:"100%", background:"#1a6b30", color:"#fff", fontWeight:800, fontSize:"15px", display:"flex", alignItems:"center", justifyContent:"center", borderRadius:"6px", cursor: isSpinning || isResult ? "default" : "pointer", userSelect:"none", border: winCells.has("n_0") ? "2px solid #16ff5c" : "2px solid rgba(255,255,255,0.08)", boxShadow: winCells.has("n_0") ? "0 0 10px rgba(22,255,92,0.5)" : "none" }}>
                  {(tableBets["n_0"]||0) > 0 ? (
                    <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", zIndex:3 }}>
                      <CasinoChipSVG {...getBetChipMeta(tableBets["n_0"])} label={fmtBetChipLabel(tableBets["n_0"])} size={30} />
                    </div>
                  ) : (
                    <span style={{ position:"relative", zIndex:1 }}>0</span>
                  )}
                </div>
              </div>

              {/* Top row: 3,6,9,...,36 */}
              {[3,6,9,12,15,18,21,24,27,30,33,36].map(n => (
                <div key={n} style={{ gridRow:"1" }}><NumCell num={n}/></div>
              ))}
              {/* Column 3 (top row) 2:1 */}
              <div style={{ gridRow:"1" }}>
                <OutsideCell label="2:1" betKey="col_3" style={{ height:"100%", fontSize:"11px", background:"#1a2438" }}/>
              </div>

              {/* Mid row: 2,5,8,...,35 */}
              {[2,5,8,11,14,17,20,23,26,29,32,35].map(n => (
                <div key={n} style={{ gridRow:"2" }}><NumCell num={n}/></div>
              ))}
              {/* Column 2 2:1 */}
              <div style={{ gridRow:"2" }}>
                <OutsideCell label="2:1" betKey="col_2" style={{ height:"100%", fontSize:"11px", background:"#1a2438" }}/>
              </div>

              {/* Bot row: 1,4,7,...,34 */}
              {[1,4,7,10,13,16,19,22,25,28,31,34].map(n => (
                <div key={n} style={{ gridRow:"3" }}><NumCell num={n}/></div>
              ))}
              {/* Column 1 2:1 */}
              <div style={{ gridRow:"3" }}>
                <OutsideCell label="2:1" betKey="col_1" style={{ height:"100%", fontSize:"11px", background:"#1a2438" }}/>
              </div>
            </div>

            {/* Dozens */}
            <div style={{ display:"grid", gridTemplateColumns:"36px repeat(12, 44px) 48px", gap:"3px", marginBottom:"3px" }}>
              <div/>
              <div style={{ gridColumn:"2 / span 4" }}><OutsideCell label="1 to 12" betKey="dozen_1"/></div>
              <div style={{ gridColumn:"6 / span 4" }}><OutsideCell label="13 to 24" betKey="dozen_2"/></div>
              <div style={{ gridColumn:"10 / span 4" }}><OutsideCell label="25 to 36" betKey="dozen_3"/></div>
              <div/>
            </div>

            {/* Even money */}
            <div style={{ display:"grid", gridTemplateColumns:"36px repeat(12, 44px) 48px", gap:"3px" }}>
              <div/>
              <div style={{ gridColumn:"2 / span 2" }}><OutsideCell label="1 to 18" betKey="low"/></div>
              <div style={{ gridColumn:"4 / span 2" }}><OutsideCell label="Even" betKey="even"/></div>
              <div style={{ gridColumn:"6 / span 2" }}><OutsideCell label="Rojo" betKey="red" color="#b91c1c"/></div>
              <div style={{ gridColumn:"8 / span 2" }}><OutsideCell label="Negro" betKey="black" color="#1a1a2e"/></div>
              <div style={{ gridColumn:"10 / span 2" }}><OutsideCell label="Odd" betKey="odd"/></div>
              <div style={{ gridColumn:"12 / span 2" }}><OutsideCell label="19 to 36" betKey="high"/></div>
              <div/>
            </div>
          </div>
        </div>

        {/* ─── Undo / Clear below betting table ────────────────────────── */}
        <div style={{ display:"flex", justifyContent:"space-between", gap:"8px" }}>
          <button onClick={handleUndo} disabled={isSpinning}
            style={{
              padding:"7px 18px", borderRadius:"8px",
              border:"1px solid", fontSize:"12px", fontWeight:600, fontFamily:"inherit",
              cursor: !isSpinning ? "pointer" : "not-allowed",
              background:"#0e1826",
              borderColor: !isSpinning ? "#2a3e58" : "#151f2c",
              color: !isSpinning ? "#7ab0d8" : "#2a3a50",
              transition:"all .15s",
            }}
            onMouseEnter={e => { if (!isSpinning) { e.currentTarget.style.filter="brightness(1.4)"; e.currentTarget.style.transform="scale(1.05)"; e.currentTarget.style.boxShadow="0 0 12px rgba(122,176,216,.35)"; }}}
            onMouseLeave={e => { e.currentTarget.style.filter=""; e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}>
            ↺ Deshacer
          </button>
          <button onClick={handleClear} disabled={isSpinning}
            style={{
              padding:"7px 18px", borderRadius:"8px",
              border:"1px solid", fontSize:"12px", fontWeight:600, fontFamily:"inherit",
              cursor: !isSpinning ? "pointer" : "not-allowed",
              background:"#0e1826",
              borderColor: !isSpinning ? "#582a2a" : "#151f2c",
              color: !isSpinning ? "#d87878" : "#2a3a50",
              transition:"all .15s",
            }}
            onMouseEnter={e => { if (!isSpinning) { e.currentTarget.style.filter="brightness(1.4)"; e.currentTarget.style.transform="scale(1.05)"; e.currentTarget.style.boxShadow="0 0 12px rgba(216,120,120,.35)"; }}}
            onMouseLeave={e => { e.currentTarget.style.filter=""; e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}>
            ✕ Limpiar
          </button>
        </div>

      </div>
    </div>
  );
}
