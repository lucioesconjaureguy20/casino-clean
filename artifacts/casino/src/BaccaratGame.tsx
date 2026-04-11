import React, { useState, useEffect, useRef } from "react";
import { gt } from "./lib/gameLabels";

// ── Wait helper ────────────────────────────────────────────────────────────────
const wait = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

// ── Sound engine (Web Audio API) ───────────────────────────────────────────────
let _audioCtx: AudioContext | null = null;
let _baccaratSoundEnabled = false; // true only while BaccaratGame is mounted
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return _audioCtx;
}
function playChipSound(vol = 0.7) {
  if (!_baccaratSoundEnabled) return;
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(680, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.055);
    gain.gain.setValueAtTime(0.22 * vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.start(t); osc.stop(t + 0.08);
  } catch (_) {}
}
function playDealSound(vol = 0.7) {
  if (!_baccaratSoundEnabled) return;
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    const bufSize = Math.floor(ctx.sampleRate * 0.065);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter(); filt.type = "bandpass"; filt.frequency.value = 2400; filt.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18 * vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
    src.start(t); src.stop(t + 0.08);
  } catch (_) {}
}
function playFlipSound(vol = 0.7) {
  if (!_baccaratSoundEnabled) return;
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator(); osc.type = "triangle";
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(1100, t);
    osc.frequency.exponentialRampToValueAtTime(500, t + 0.04);
    gain.gain.setValueAtTime(0.14 * vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.start(t); osc.stop(t + 0.06);
  } catch (_) {}
}
function playWinSound(vol = 0.7) {
  if (!_baccaratSoundEnabled) return;
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    [0, 0.09, 0.18, 0.3].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = [440, 554, 660, 880][i];
      gain.gain.setValueAtTime(0.14 * vol, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.18);
      osc.start(t + delay); osc.stop(t + delay + 0.22);
    });
  } catch (_) {}
}
function playLoseSound(vol = 0.7) {
  if (!_baccaratSoundEnabled) return;
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator(); osc.type = "sawtooth";
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.25);
    gain.gain.setValueAtTime(0.11 * vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.start(t); osc.stop(t + 0.3);
  } catch (_) {}
}
function playTieSound(vol = 0.7) {
  if (!_baccaratSoundEnabled) return;
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    [0, 0.12].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = [500, 500][i];
      gain.gain.setValueAtTime(0.12 * vol, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.15);
      osc.start(t + delay); osc.stop(t + delay + 0.18);
    });
  } catch (_) {}
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Suit = "♠" | "♣" | "♥" | "♦";
type Rank = "A"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"|"10"|"J"|"Q"|"K";
interface Card { suit: Suit; rank: Rank; }

type BacPhase = "idle" | "dealing" | "result";
type BetZone = "player" | "tie" | "banker";

export interface BaccaratStats {
  wins: number; losses: number; ties: number; profit: number; wagered: number;
  history: { profit: number; win: boolean }[];
}
export const baccaratStatsDefault: BaccaratStats = { wins:0, losses:0, ties:0, profit:0, wagered:0, history:[] };

export interface BaccaratGameProps {
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
  baccaratStats: BaccaratStats;
  setBaccaratStats: React.Dispatch<React.SetStateAction<BaccaratStats>>;
  currentUser?: string;
  onRequestLogin?: () => void;
  stopAutoRef?: React.MutableRefObject<(() => void) | null>;
  onGameActive?: (active: boolean) => void;
}

// ── Deck helpers ──────────────────────────────────────────────────────────────
function makeDeck(): Card[] {
  const suits: Suit[] = ["♠","♣","♥","♦"];
  const ranks: Rank[] = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const deck: Card[] = [];
  for (let shoe = 0; shoe < 6; shoe++)
    for (const s of suits) for (const r of ranks) deck.push({ suit:s, rank:r });
  return deck;
}

function shuffled(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function bacVal(rank: Rank): number {
  if (rank === "A") return 1;
  if (["J","Q","K","10"].includes(rank)) return 0;
  return parseInt(rank, 10);
}

function handScore(cards: Card[]): number {
  return cards.reduce((sum, c) => (sum + bacVal(c.rank)) % 10, 0);
}

function isRed(suit: Suit): boolean { return suit === "♥" || suit === "♦"; }

function needsPlayerThird(pScore: number): boolean { return pScore <= 5; }
function needsBankerThird(bScore: number, _pScore: number, pThirdCard: Card | null): boolean {
  if (pThirdCard === null) return bScore <= 5;
  const pt = bacVal(pThirdCard.rank);
  if (bScore <= 2) return true;
  if (bScore === 3) return pt !== 8;
  if (bScore === 4) return pt >= 2 && pt <= 7;
  if (bScore === 5) return pt >= 4 && pt <= 7;
  if (bScore === 6) return pt === 6 || pt === 7;
  return false;
}

// ── Card component ────────────────────────────────────────────────────────────
function BacCard({ card, delay = 0, glow = false }: {
  card: Card; delay?: number; glow?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), delay);
    const t2 = setTimeout(() => setFlipped(true), delay + 80);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [delay]);

  const red = isRed(card.suit);
  const showFace = flipped;

  return (
    <div style={{
      width:"110px", height:"158px", borderRadius:"12px", flexShrink:0,
      position:"relative", perspective:"700px",
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0) scale(1)" : "translateY(-28px) scale(0.88)",
      transition:`opacity 0.25s ease ${delay}ms, transform 0.32s cubic-bezier(0.08,0.6,0.2,1) ${delay}ms`,
    }}>
      <div style={{
        width:"100%", height:"100%", position:"relative",
        transformStyle:"preserve-3d",
        transform: showFace ? "rotateY(0deg)" : "rotateY(180deg)",
        transition:"transform 0.35s ease",
      }}>
        <div style={{
          position:"absolute", inset:0, backfaceVisibility:"hidden",
          borderRadius:"12px", background:"#ffffff",
          border: glow ? "2.5px solid #00e064" : "2px solid #d0d8ea",
          boxShadow: glow ? "0 0 20px 4px rgba(0,224,100,0.5), 0 6px 20px rgba(0,0,0,.35)" : "0 6px 20px rgba(0,0,0,.32)",
          display:"flex", flexDirection:"column", padding:"7px 9px",
          justifyContent:"space-between",
        }}>
          <div style={{ fontSize:"19px", fontWeight:800, color: red ? "#d42020" : "#111", lineHeight:1 }}>
            {card.rank}<span style={{ fontSize:"14px" }}>{card.suit}</span>
          </div>
          <div style={{ fontSize:"36px", textAlign:"center", color: red ? "#d42020" : "#111", lineHeight:1 }}>
            {card.suit}
          </div>
          <div style={{ fontSize:"19px", fontWeight:800, color: red ? "#d42020" : "#111", transform:"rotate(180deg)", lineHeight:1 }}>
            {card.rank}<span style={{ fontSize:"14px" }}>{card.suit}</span>
          </div>
        </div>
        <div style={{
          position:"absolute", inset:0, backfaceVisibility:"hidden",
          transform:"rotateY(180deg)",
          borderRadius:"12px",
          background:"linear-gradient(135deg,#1e3d72 0%,#0d2248 50%,#0a1a38 100%)",
          border:"2px solid #2a5aaa",
          boxShadow:"0 8px 22px rgba(0,0,60,.55)",
          display:"flex", alignItems:"center", justifyContent:"center",
        }}>
          <div style={{
            position:"absolute", inset:"5px", borderRadius:"7px",
            background:"repeating-linear-gradient(45deg,#1a4080 0px,#1a4080 4px,#0e2855 4px,#0e2855 8px)",
            opacity:0.5,
          }} />
          <img src="/mander-logo.png" alt="" style={{ width:"40px", opacity:0.5, position:"relative", zIndex:1 }} />
        </div>
      </div>
    </div>
  );
}

// ── Casino chip SVG (identical to Roulette) ────────────────────────────────────
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

// ── Deck pile visual (identical to Blackjack) ─────────────────────────────────
function DeckPile() {
  const cardW = 72, cardH = 106;
  return (
    <div style={{
      position:"absolute", top:"22px", right:"22px", zIndex:10,
      width:`${cardW}px`, height:`${cardH}px`,
    }}>
      {[4,3,2,1,0].map(offset => (
        <div key={offset} style={{
          position:"absolute",
          top: -offset * 1.2,
          left: -offset * 0.8,
          width:`${cardW}px`, height:`${cardH}px`,
          borderRadius:"7px",
          background:"linear-gradient(135deg,#1e3d72 0%,#0d2248 50%,#0a1a38 100%)",
          border:"1.5px solid #2a5aaa",
          boxShadow:`0 ${offset+1}px ${(offset+1)*3}px rgba(0,0,60,.55)`,
        }}>
          {offset === 0 && (
            <>
              <div style={{
                position:"absolute", inset:"4px", borderRadius:"4px",
                background:"repeating-linear-gradient(45deg,#1a4080 0,#1a4080 3px,#0e2855 3px,#0e2855 6px)",
                opacity:0.55,
              }} />
              <img src="/mander-logo.png" alt="Mander"
                style={{
                  position:"absolute", width:"58px",
                  filter:"brightness(0) invert(1)", opacity:0.85,
                  left:"50%", top:"50%", transform:"translate(-50%,-50%)",
                  objectFit:"contain", pointerEvents:"none",
                }}
              />
            </>
          )}
        </div>
      ))}
      <div style={{
        position:"absolute", top:`${cardH + 5}px`, left:"50%",
        transform:"translateX(-50%)",
        fontSize:"9px", fontWeight:500, color:"rgba(255,255,255,.3)",
        letterSpacing:"0.5px", whiteSpace:"nowrap",
      }}>
        MAZO
      </div>
    </div>
  );
}

// ── Banker payout resolver ─────────────────────────────────────────────────────
// Paga 1:1 con comisión del 5% SOLO sobre la ganancia
// resolverBanker(0.20, "banker") → { ganancia_neta: 0.19, total_devuelto: 0.39 }
// resolverBanker(0.20, "player") → { ganancia_neta: -0.20, total_devuelto: 0 }
// resolverBanker(0.20, "tie")    → { ganancia_neta: 0,     total_devuelto: 0.20 }
function resolverBanker(apuesta: number, resultado: "banker" | "player" | "tie"): { ganancia_neta: number; total_devuelto: number } {
  if (resultado === "banker") {
    const ganancia_bruta = apuesta;
    const comision       = Math.round(ganancia_bruta * 0.05 * 10000) / 10000;
    const ganancia_neta  = Math.round((ganancia_bruta - comision) * 10000) / 10000;
    const total_devuelto = Math.round((apuesta + ganancia_neta) * 10000) / 10000;
    return { ganancia_neta, total_devuelto };
  }
  if (resultado === "tie") {
    return { ganancia_neta: 0, total_devuelto: apuesta };
  }
  // resultado === "player" → banker pierde
  return { ganancia_neta: -apuesta, total_devuelto: 0 };
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BaccaratGame({
  balance, fmtMoney, currencyFade,
  onBalanceChange, addBet, onBetRecord,
  baccaratStats, setBaccaratStats, currentUser, onRequestLogin,
  stopAutoRef, onGameActive, lang,
}: BaccaratGameProps) {

  // Enable sounds only while this component is mounted (navigating away silences everything)
  useEffect(() => {
    _baccaratSoundEnabled = true;
    return () => { _baccaratSoundEnabled = false; };
  }, []);

  const [tab, setTab] = useState<"manual"|"auto">("manual");
  const [chipUsd, setChipUsd] = useState(0.10);
  const [chipOffset, setChipOffset] = useState(0);

  const [autoCount, setAutoCount] = useState("10");
  const [autoInfinite, setAutoInfinite] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoStopping, setAutoStopping] = useState(false); // delay de 2s al detener
  const [autoRemaining, setAutoRemaining] = useState(0);
  const autoRef = useRef(false);
  const autoBtnLockRef = useRef(false); // debounce: prevents rapid multi-clicks

  const [phase, setPhase] = useState<BacPhase>("idle");
  // Notify parent whether a deal / auto session is in progress
  useEffect(() => { onGameActive?.(phase === "dealing" || autoRunning); }, [phase, autoRunning]);
  // Use a ref so auto-play always reads the latest remaining cards (avoids stale closure)
  const deckRef = useRef<Card[]>(shuffled(makeDeck()));
  const [playerCards, setPlayerCards] = useState<Card[]>([]);
  const [bankerCards, setBankerCards] = useState<Card[]>([]);
  const [result, setResult] = useState<"player"|"banker"|"tie"|null>(null);
  const [payout, setPayout] = useState(0);
  const [winMult, setWinMult] = useState(0);
  const [isPush, setIsPush] = useState(false);

  const [zoneBets, setZoneBets] = useState<Record<BetZone, number>>({ player:0, tie:0, banker:0 });
  const [lastZoneBets, setLastZoneBets] = useState<Record<BetZone, number>>({ player:0, tie:0, banker:0 });

  type ChipEntry = { value: number; id: number };
  const [zoneChips, setZoneChips] = useState<Record<BetZone, ChipEntry[]>>({ player:[], tie:[], banker:[] });
  const chipIdRef = useRef(0);

  // Decompose a USD amount into up to 5 chip entries (largest denominations first)
  function computeChipsFromAmount(usd: number): ChipEntry[] {
    const chips: ChipEntry[] = [];
    let rem = usd;
    for (const v of [...CHIP_VALUES].reverse()) {
      while (rem >= v - 0.000001 && chips.length < 5) {
        chips.push({ value: v, id: ++chipIdRef.current });
        rem = Math.round((rem - v) * 10000) / 10000;
      }
    }
    return chips;
  }

  // Stats panel (identical to Roulette)
  const [statsOpen, setStatsOpen] = useState(false);
  const [showVol, setShowVol] = useState(false);
  const [statsPos, setStatsPos] = useState({ x: 270, y: 160 });
  const [chartHover, setChartHover] = useState<number|null>(null);
  const isStatsDragging = useRef(false);
  const statsDragOffset = useRef({ x: 0, y: 0 });
  const [vol, setVol] = useState(70);
  const balanceRef = useRef(balance);
  balanceRef.current = balance;

  const totalBet = zoneBets.player + zoneBets.tie + zoneBets.banker;
  const hasBets = totalBet > 0;
  const isDealing = phase === "dealing";

  // ── Persist last result so the player sees it when returning ───────────────
  const BAC_SAVE_KEY = "bac_last_result";
  const bacRestoredRef = useRef(false);

  // Save when a result is available; clear otherwise
  useEffect(() => {
    if (phase === "result" && result !== null) {
      try {
        localStorage.setItem(BAC_SAVE_KEY, JSON.stringify({
          playerCards, bankerCards, result, payout, winMult, isPush, lastZoneBets,
        }));
      } catch { /* quota — ignore */ }
    } else if (phase === "idle") {
      if (bacRestoredRef.current) localStorage.removeItem(BAC_SAVE_KEY);
    }
  }, [phase, result, playerCards, bankerCards, payout, winMult, isPush, lastZoneBets]);

  // Restore on mount (shows last result so the player can review it)
  useEffect(() => {
    if (bacRestoredRef.current) return;
    bacRestoredRef.current = true;
    try {
      const raw = localStorage.getItem(BAC_SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s || !s.result || !s.playerCards?.length) return;
      setPlayerCards(s.playerCards);
      setBankerCards(s.bankerCards || []);
      setResult(s.result);
      setPayout(s.payout ?? 0);
      setWinMult(s.winMult ?? 0);
      setIsPush(s.isPush ?? false);
      if (s.lastZoneBets) setLastZoneBets(s.lastZoneBets);
      setPhase("result");
    } catch { localStorage.removeItem(BAC_SAVE_KEY); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const VISIBLE = 4;
  const canLeft  = chipOffset > 0;
  const canRight = chipOffset + VISIBLE < CHIP_VALUES.length;
  const visChips = CHIP_VALUES.slice(chipOffset, chipOffset + VISIBLE);

  function clearResult() {
    // Called when user interacts with bets while result is showing — wipes the last round display
    setPhase("idle");
    setPlayerCards([]); setBankerCards([]);
    setResult(null); setWinMult(0); setPayout(0); setIsPush(false);
  }

  function placeChip(zone: BetZone) {
    if (phase !== "idle" && phase !== "result") return;
    if (phase === "result") clearResult();
    playChipSound(vol / 100);
    setZoneBets(prev => ({ ...prev, [zone]: Math.round((prev[zone] + chipUsd) * 10000) / 10000 }));
    setZoneChips(prev => ({
      ...prev,
      [zone]: [...prev[zone], { value: chipUsd, id: ++chipIdRef.current }],
    }));
  }

  function handleUndo() {
    if (phase !== "idle" && phase !== "result") return;
    if (phase === "result") clearResult();
    setZoneBets(prev => {
      const entries = Object.entries(prev) as [BetZone, number][];
      const lastFilled = [...entries].reverse().find(([,v]) => v >= chipUsd);
      if (!lastFilled) return prev;
      const [z] = lastFilled;
      setZoneChips(cp => ({ ...cp, [z]: cp[z as BetZone].slice(0, -1) }));
      return { ...prev, [z]: Math.max(0, Math.round((lastFilled[1] - chipUsd) * 10000) / 10000) };
    });
  }

  function handleClear() {
    if (phase !== "idle" && phase !== "result") return;
    if (phase === "result") clearResult();
    setZoneBets({ player:0, tie:0, banker:0 });
    setZoneChips({ player:[], tie:[], banker:[] });
  }

  function handleRepeat() {
    if (phase !== "idle") return;
    setZoneBets(lastZoneBets);
    setZoneChips({
      player: computeChipsFromAmount(lastZoneBets.player),
      tie:    computeChipsFromAmount(lastZoneBets.tie),
      banker: computeChipsFromAmount(lastZoneBets.banker),
    });
  }

  function handleStatsDragStart(e: React.MouseEvent) {
    isStatsDragging.current = true;
    statsDragOffset.current = { x: e.clientX - statsPos.x, y: e.clientY - statsPos.y };
    const onMove = (ev: MouseEvent) => {
      if (isStatsDragging.current)
        setStatsPos({ x: ev.clientX - statsDragOffset.current.x, y: ev.clientY - statsDragOffset.current.y });
    };
    const onUp = () => { isStatsDragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  async function dealRound(zb: Record<BetZone, number>) {
    const total = zb.player + zb.tie + zb.banker;
    if (total <= 0) return;
    if (!currentUser) { onRequestLogin?.(); return; }
    const curBal = balanceRef.current;
    if (curBal < total) return;

    // ── 1. Pre-calculate ALL cards and result BEFORE any animation ────────────
    let d = deckRef.current;
    if (d.length < 15) { d = shuffled(makeDeck()); }

    const p1 = d[0], b1 = d[1], p2 = d[2], b2 = d[3];
    let idx = 4;
    const pHand: Card[] = [p1, p2];
    const bHand: Card[] = [b1, b2];

    const pScore0 = handScore(pHand);
    const bScore0 = handScore(bHand);
    let p3: Card | null = null;
    let b3: Card | null = null;
    if (pScore0 < 8 && bScore0 < 8) {
      if (needsPlayerThird(pScore0)) { p3 = d[idx++]; pHand.push(p3); }
      if (needsBankerThird(bScore0, pScore0, p3)) { b3 = d[idx++]; bHand.push(b3); }
    }
    deckRef.current = d.slice(idx);

    const pFinal = handScore(pHand);
    const bFinal = handScore(bHand);
    const winner: "player"|"banker"|"tie" = pFinal > bFinal ? "player" : bFinal > pFinal ? "banker" : "tie";

    let winAmt = 0;
    if (winner === "player" && zb.player > 0) winAmt += zb.player * 2;
    if (zb.banker > 0) winAmt += resolverBanker(zb.banker, winner).total_devuelto;
    if (winner === "tie" && zb.tie > 0) winAmt += zb.tie * 9;
    if (winner === "tie" && zb.player > 0) winAmt += zb.player;

    const has_win =
      (winner === "player" && zb.player > 0) ||
      (winner === "banker" && zb.banker > 0) ||
      (winner === "tie"    && zb.tie    > 0);
    const is_push = winner === "tie" && !has_win;
    const mult = winner === "player" ? 2 : winner === "banker" ? 1.95 : 9;
    const netProfit = winAmt - total;

    // ── 2. Save to localStorage IMMEDIATELY (before animation) ───────────────
    // This ensures if the user navigates away at any point during the animation,
    // the result is already persisted and can be restored when they return.
    try {
      localStorage.setItem("bac_last_result", JSON.stringify({
        playerCards: pHand, bankerCards: bHand, result: winner,
        payout: netProfit, winMult: has_win ? mult : 0, isPush: is_push, lastZoneBets: zb,
      }));
    } catch { /* quota — ignore */ }

    // ── 3. Charge balance and start animation ────────────────────────────────
    onBalanceChange(curBal - total);
    setPhase("dealing");
    setResult(null);
    setPayout(0);

    const sv = vol / 100;
    // Deal one card at a time: P1 → B1 → P2 → B2
    setPlayerCards([p1]); playDealSound(sv); setTimeout(() => playFlipSound(sv), 85); await wait(340);
    setBankerCards([b1]); playDealSound(sv); setTimeout(() => playFlipSound(sv), 85); await wait(340);
    setPlayerCards([p1, p2]); playDealSound(sv); setTimeout(() => playFlipSound(sv), 85); await wait(340);
    setBankerCards([b1, b2]); playDealSound(sv); setTimeout(() => playFlipSound(sv), 85); await wait(400);

    if (p3) { setPlayerCards([...pHand.slice(0, 3)]); playDealSound(sv); setTimeout(() => playFlipSound(sv), 85); await wait(380); }
    if (b3) { setBankerCards([...bHand.slice(0, 3)]); playDealSound(sv); setTimeout(() => playFlipSound(sv), 85); await wait(380); }

    // ── 4. Show result ────────────────────────────────────────────────────────
    setResult(winner);
    setWinMult(has_win ? mult : 0);
    setPayout(netProfit);
    setTimeout(() => {
      if (is_push)      playTieSound(sv);
      else if (has_win) playWinSound(sv);
      else              playLoseSound(sv);
    }, 120);

    onBalanceChange(curBal - total + winAmt);
    addBet(total, winAmt, "Baccarat");
    onBetRecord?.(total, winAmt > 0 ? winAmt / total : 0, has_win, winAmt);

    setBaccaratStats(prev => ({
      wins:    prev.wins    + (has_win ? 1 : 0),
      losses:  prev.losses  + (!has_win && !is_push && winner !== "tie" ? 1 : 0),
      ties:    prev.ties    + (winner === "tie" ? 1 : 0),
      profit:  prev.profit  + netProfit,
      wagered: prev.wagered + total,
      history: [...prev.history, { profit: netProfit, win: has_win }].slice(-200),
    }));

    setIsPush(is_push);
    setLastZoneBets(zb);
    setPhase("result");
  }

  function resetRound() {
    setPhase("idle");
    setPlayerCards([]);
    setBankerCards([]);
    setResult(null);
    setWinMult(0);
    setPayout(0);
    setIsPush(false);
  }

  function handleDeal() {
    if (phase === "result") { resetRound(); return; }
    if (phase !== "idle") return;
    if (totalBet <= 0) return;
    dealRound(zoneBets);
  }

  async function startAuto() {
    if ((phase !== "idle" && phase !== "result") || autoRunning || autoRef.current) return;
    if (!currentUser) { onRequestLogin?.(); return; }
    const bets = { ...zoneBets };
    const total = bets.player + bets.tie + bets.banker;
    if (total <= 0) return;
    // If coming from a completed manual round, clear the result state first
    if (phase === "result") {
      setPhase("idle");
      setPlayerCards([]); setBankerCards([]);
      setResult(null); setWinMult(0); setPayout(0); setIsPush(false);
    }
    autoRef.current = true;
    setAutoRunning(true);
    await wait(800); // small delay before first round
    if (!autoRef.current) { setAutoRunning(false); return; }
    let remaining = autoInfinite ? Infinity : parseInt(autoCount) || 10;
    if (!autoInfinite) setAutoRemaining(remaining);
    while (autoRef.current && remaining > 0) {
      if (balanceRef.current < total) break;
      if (!autoInfinite) { remaining--; setAutoRemaining(remaining); }
      await dealRound(bets);
      await wait(1800);
      setPhase("idle"); setPlayerCards([]); setBankerCards([]); setResult(null); setWinMult(0); setPayout(0); setIsPush(false);
      await wait(400);
    }
    autoRef.current = false;
    setAutoRunning(false);
  }

  function stopAuto() {
    if (autoStopping) return; // ya hay un countdown en curso
    autoRef.current = false; // frenar el loop de inmediato — sin nuevas rondas
    setAutoStopping(true);
    setTimeout(() => {
      setAutoRunning(false);
      setAutoStopping(false);
      autoBtnLockRef.current = false;
    }, 2000);
  }

  // Release the button lock as soon as dealing ends (phase goes idle/result)
  useEffect(() => {
    if (phase !== "dealing") autoBtnLockRef.current = false;
  }, [phase]);

  function handleAutoButton() {
    if (autoBtnLockRef.current) return;
    if (autoStopping) return; // countdown en curso, ignorar clicks extra
    if (phase === "dealing") return;
    autoBtnLockRef.current = true; // lock immediately — released only when dealing ends
    if (autoRunning) stopAuto();
    else startAuto();
  }

  // Expose stopAuto to parent (App.tsx) so navigation can halt the auto loop
  useEffect(() => {
    if (stopAutoRef) stopAutoRef.current = stopAuto;
    return () => { if (stopAutoRef) stopAutoRef.current = null; };
  });  // no deps — always keep ref in sync

  const pScore = handScore(playerCards);
  const bScore = handScore(bankerCards);

  const canDeal = (phase === "idle" && hasBets && balance >= totalBet) || phase === "result";

  const arrowBtn = (enabled: boolean, onClick: () => void, label: string) => (
    <button onClick={onClick} disabled={!enabled}
      onMouseEnter={e => { if (enabled) { e.currentTarget.style.color="#ffffff"; e.currentTarget.style.textShadow="0 0 10px rgba(255,255,255,0.8)"; }}}
      onMouseLeave={e => { e.currentTarget.style.color=enabled?"#c0d0e0":"#2a3a50"; e.currentTarget.style.textShadow="none"; }}
      style={{ flexShrink:0, width:"26px", background:"none", border:"none", padding:0,
        color: enabled?"#c0d0e0":"#2a3a50", fontSize:"20px", fontWeight:800, fontFamily:"inherit",
        cursor: enabled?"pointer":"default", lineHeight:1,
        display:"flex", alignItems:"center", justifyContent:"center",
        transition:"color .15s, text-shadow .15s" }}>
      {label}
    </button>
  );

  return (
    <div style={{ display:"grid", gridTemplateColumns:"300px 1fr", background:"#0e1320", height:"100%", fontFamily:"'Inter',sans-serif", userSelect:"none", WebkitUserSelect:"none" }}>

      {/* ─── LEFT PANEL ──────────────────────────────────────────────────── */}
      <div style={{ background:"#131a28", borderRight:"1px solid #1a2438", display:"flex", flexDirection:"column", overflowY:"auto" }}>

        <div style={{ padding:"16px 14px", flex:1, display:"flex", flexDirection:"column", gap:"14px" }}>

          {/* Mode tabs — same style as Dice */}
          <div style={{ display:"flex", alignItems:"center", background:"#0e1826", borderRadius:"14px", padding:"5px", gap:"4px" }}>
            {(["manual","auto"] as const).map(m => (
              <button key={m} onClick={() => { if (!autoRunning && !isDealing) setTab(m); }} disabled={autoRunning || isDealing}
                style={{ flex:1, background:tab===m?"#1e2c44":"transparent", color:tab===m?"#eef3f8":"#5a6a88",
                  border:tab===m?"1px solid #3a4a60":"1px solid transparent", borderRadius:"10px", padding:"10px",
                  fontWeight:500, cursor:(autoRunning||isDealing)?"not-allowed":"pointer", fontSize:"14px",
                  opacity:(autoRunning||isDealing)&&tab!==m?0.45:1, transition:"opacity .2s", fontFamily:"inherit" }}>
                {m==="manual"?gt(lang,"tabManual"):gt(lang,"tabAuto")}
              </button>
            ))}
          </div>

          {/* Chip selector — Roulette-identical */}
          <div>
            <div style={{ fontSize:"10px", color:"#5a7090", marginBottom:"5px", fontWeight:600, letterSpacing:"0.5px" }}>{gt(lang, "chips")}</div>
            <div style={{ display:"flex", alignItems:"center", gap:"4px",
              background:"#0e1826", border:"1px solid #252f45", borderRadius:"10px", padding:"6px 4px", overflow:"visible" }}>
              {arrowBtn(canLeft && !isDealing, () => setChipOffset(o => o - 1), "‹")}
              <div style={{ display:"flex", flex:1, gap:"4px", justifyContent:"space-around", alignItems:"center", overflow:"visible" }}>
                {visChips.map(v => {
                  const meta = CHIP_META[chipKey(v)];
                  const sel  = chipUsd === v;
                  return (
                    <button key={v} onClick={() => { if (!isDealing) setChipUsd(v); }} disabled={isDealing}
                      title={`${meta.label} = $${v.toFixed(v < 1 ? 2 : 0)} USD`}
                      style={{ flexShrink:0, background:"none", border:"none", padding:0,
                        cursor: isDealing ? "not-allowed" : "pointer", outline:"none", fontFamily:"inherit",
                        filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.5))",
                        opacity: isDealing ? 0.5 : 1,
                        transform:"scale(1)",
                        transition:"filter .15s, transform .13s, opacity .15s" }}
                      onMouseEnter={e => { if (!isDealing) { e.currentTarget.style.transform="scale(1.2)"; } }}
                      onMouseLeave={e => { e.currentTarget.style.transform="scale(1)"; e.currentTarget.style.filter="drop-shadow(0 2px 3px rgba(0,0,0,0.5))"; }}>
                      <CasinoChipSVG {...meta} selected={sel} size={30} />
                    </button>
                  );
                })}
              </div>
              {arrowBtn(canRight && !isDealing, () => setChipOffset(o => o + 1), "›")}
            </div>
          </div>

          {/* Total bet — Roulette-identical box */}
          <div style={{ background:"#0e1826", border:"1px solid #252f45", borderRadius:"10px", padding:"10px 12px" }}>
            <div style={{ fontSize:"10px", color:"#4a6080", marginBottom:"4px", fontWeight:600, letterSpacing:"0.5px" }}>{gt(lang, "totalBet")}</div>
            <div style={{ fontSize:"16px", fontWeight:800, color: hasBets?"#e0e8f4":"#4a6080", opacity:currencyFade }}>
              {fmtMoney(totalBet)}
            </div>
          </div>

          {tab === "manual" ? (
            <>
              {/* Half / Double */}
              <div style={{ display:"flex", gap:"8px" }}>
                {([["½", 0.5],["2×", 2]] as [string,number][]).map(([label,mult]) => {
                  const canHalfDouble = phase === "idle" && hasBets && !isDealing;
                  return (
                  <button key={label} onClick={() => {
                    if (phase !== "idle" || isDealing) return;
                    setZoneBets(prev => {
                      const next = {
                        player: Math.round(prev.player * mult * 10000) / 10000,
                        tie:    Math.round(prev.tie    * mult * 10000) / 10000,
                        banker: Math.round(prev.banker * mult * 10000) / 10000,
                      };
                      setZoneChips({
                        player: computeChipsFromAmount(next.player),
                        tie:    computeChipsFromAmount(next.tie),
                        banker: computeChipsFromAmount(next.banker),
                      });
                      return next;
                    });
                  }}
                    disabled={!canHalfDouble}
                    style={{ flex:1, padding:"9px 0", background:"#0e1826", border:"1px solid #252f45", borderRadius:"8px", color: canHalfDouble ? "#9ab0d0" : "#3a4a60", fontSize:"13px", fontWeight:700, cursor: canHalfDouble ? "pointer" : "not-allowed", opacity: isDealing ? 0.45 : 1, transition:"opacity .15s" }}>
                    {label}
                  </button>
                  );
                })}
              </div>

              {phase === "idle" && hasBets && balance < totalBet && (
                <div style={{ fontSize:"11.5px", color:"#e74c3c", fontWeight:600, marginBottom:"6px", paddingLeft:"2px" }}>
                  Saldo insuficiente
                </div>
              )}

              {/* Deal button */}
              <button onClick={handleDeal} disabled={!canDeal}
                style={{ width:"100%", padding:"14px", borderRadius:"12px", border:"none", fontFamily:"inherit",
                  background: canDeal ? "linear-gradient(180deg,#1a9fff,#0d6fd4)" : "#1a2438",
                  color: canDeal ? "#fff" : "#3a4a60",
                  fontWeight:800, fontSize:"14px", letterSpacing:"0.5px",
                  cursor: canDeal ? "pointer" : "not-allowed",
                  boxShadow: canDeal ? "0 4px 22px rgba(26,159,255,.35)" : "none",
                  transition:"all .2s" }}
                onMouseEnter={e => { if (canDeal) { e.currentTarget.style.transform="scale(1.03)"; e.currentTarget.style.boxShadow="0 6px 32px rgba(26,159,255,.65)"; }}}
                onMouseLeave={e => { e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=canDeal?"0 4px 22px rgba(26,159,255,.35)":"none"; }}>
                {phase === "dealing" ? (
                  <span style={{display:"flex",alignItems:"center",gap:"6px",justifyContent:"center"}}>
                    <img src={`${import.meta.env.BASE_URL}emoji-repartiendo.png`} style={{width:20,height:20,objectFit:"contain",flexShrink:0,filter:"drop-shadow(0 0 4px rgba(26,159,255,.5))"}}/>
                    {gt(lang,"bacDealing")}
                  </span>
                ) : gt(lang,"bjBet")}
              </button>

            </>
          ) : (
            <>
              <div>
                <div style={{ fontSize:"10px", color:"#5a7090", fontWeight:600, letterSpacing:"0.5px", marginBottom:"6px" }}>{gt(lang, "numRounds")}</div>
                <div style={{ display:"flex", alignItems:"center", gap:"6px", background:"#0e1826", border:"1px solid #252f45", borderRadius:"10px", padding:"6px 10px" }}>
                  <input
                    value={autoRunning ? (autoInfinite ? "∞" : String(autoRemaining)) : (autoInfinite ? "∞" : autoCount)}
                    onChange={e => { setAutoInfinite(false); setAutoCount(e.target.value); }}
                    onBlur={() => { if (!autoInfinite && (autoCount === "" || (parseInt(autoCount)||0) <= 0)) setAutoCount("1"); }}
                    type={autoInfinite ? "text" : "number"}
                    min="1"
                    readOnly={autoInfinite || autoRunning}
                    disabled={autoRunning}
                    style={{ flex:1, background:"transparent", border:"none", color:"white", fontSize:"20px", padding:"4px", minWidth:0, outline:"none", fontFamily:"inherit" }}
                  />
                  <button onClick={() => setAutoInfinite(v => !v)} disabled={autoRunning}
                    style={{ padding:"4px 10px", borderRadius:"6px", background:autoInfinite?"#1f6fd0":"#2a4155", color:"#d0dcea", border:"none", fontWeight:500, cursor:autoRunning?"not-allowed":"pointer", fontSize:"16px", fontFamily:"inherit" }}>
                    ∞
                  </button>
                </div>
              </div>
              {/* Half / Double — same as manual tab */}
              <div style={{ display:"flex", gap:"8px" }}>
                {([["½", 0.5],["2×", 2]] as [string,number][]).map(([label,mult]) => {
                  const canHD = hasBets && !autoRunning;
                  return (
                    <button key={label} onClick={() => {
                      if (!canHD) return;
                      setZoneBets(prev => {
                        const next = {
                          player: Math.round(prev.player * mult * 10000) / 10000,
                          tie:    Math.round(prev.tie    * mult * 10000) / 10000,
                          banker: Math.round(prev.banker * mult * 10000) / 10000,
                        };
                        setZoneChips({
                          player: computeChipsFromAmount(next.player),
                          tie:    computeChipsFromAmount(next.tie),
                          banker: computeChipsFromAmount(next.banker),
                        });
                        return next;
                      });
                    }}
                      disabled={!canHD}
                      style={{ flex:1, padding:"9px 0", background:"#0e1826", border:"1px solid #252f45", borderRadius:"8px", color: canHD ? "#9ab0d0" : "#3a4a60", fontSize:"13px", fontWeight:700, cursor: canHD ? "pointer" : "not-allowed", opacity: autoRunning ? 0.45 : 1, transition:"opacity .15s", fontFamily:"inherit" }}>
                      {label}
                    </button>
                  );
                })}
              </div>

              {(()=>{
                const isDealing = phase === "dealing";
                const btnDisabled = isDealing || autoStopping || (!autoRunning && (!hasBets || balance < totalBet));
                const btnBg = btnDisabled && !autoStopping
                  ? "#1a2438"
                  : autoStopping
                    ? "linear-gradient(135deg,#b07d20,#8a6010)"
                    : autoRunning
                      ? "linear-gradient(135deg,#c0392b,#a93226)"
                      : "linear-gradient(180deg,#1a9fff,#0d6fd4)";
                const btnColor = (btnDisabled && !autoStopping) ? "#3a4a60" : "#fff";
                return (
                  <button onClick={handleAutoButton} disabled={btnDisabled}
                    style={{ width:"100%", padding:"14px", borderRadius:"12px", border:"none", fontFamily:"inherit",
                      background: btnBg, color: btnColor,
                      fontWeight:800, fontSize:"14px",
                      cursor: btnDisabled ? "not-allowed" : "pointer",
                      transition:"all .2s", opacity: isDealing ? 0.45 : 1 }}>
                    {gt(lang, autoStopping ? "bacStopping" : autoRunning ? "stopAuto" : "startAuto")}
                  </button>
                );
              })()}
            </>
          )}

          {/* Stats floating panel (identical to Roulette) */}
          {statsOpen && (
            <div style={{ position:"fixed", left:statsPos.x, top:statsPos.y, zIndex:9999, width:"280px",
              background:"#0f1f2e", border:"1px solid #1e3a52", borderRadius:"14px",
              boxShadow:"0 8px 32px rgba(0,0,0,.7)", overflow:"hidden", userSelect:"none" }}>
              <div onMouseDown={handleStatsDragStart}
                style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                  padding:"12px 14px", background:"#112232", borderBottom:"1px solid #1e3a52", cursor:"grab" }}>
                <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                  <span style={{ color:"#7a9db8" }}>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
                      <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
                    </svg>
                  </span>
                  <strong style={{ fontSize:"14px", color:"#d8e8f5" }}>{gt(lang, "liveStats")}</strong>
                </div>
                <button onClick={() => setStatsOpen(false)}
                  style={{ background:"none", border:"none", color:"#7a9db8", fontSize:"18px", cursor:"pointer", lineHeight:1 }}>×</button>
              </div>
              <div style={{ padding:"12px" }}>
                <div style={{ background:"#0d1a28", borderRadius:"10px", padding:"12px", marginBottom:"8px", display:"flex", flexDirection:"column", gap:"8px" }}>
                  {([
                    { label:"Ganancia",  value: fmtMoney(baccaratStats.profit),  color: baccaratStats.profit >= 0 ? "#16ff5c" : "#ff5959" },
                    { label:"Victorias", value: String(baccaratStats.wins),       color:"#16ff5c" },
                    { label:"Empates",   value: String(baccaratStats.ties),       color:"#f4a91f" },
                    { label:"Apostado",  value: fmtMoney(baccaratStats.wagered),  color:"#d8e8f5" },
                    { label:"Derrotas",  value: String(baccaratStats.losses),     color:"#ff5959" },
                  ] as {label:string;value:string;color:string}[]).map(s => (
                    <div key={s.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ color:"#7a9db8", fontSize:"11.5px" }}>{s.label}</span>
                      <span style={{ color:s.color, fontWeight:500, fontSize:"13px" }}>{s.value}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setBaccaratStats(baccaratStatsDefault)}
                  style={{ width:"100%", marginBottom:"8px", background:"transparent", border:"1px solid #1e3a52", borderRadius:"8px", color:"#7a9db8", fontSize:"12px", cursor:"pointer", padding:"6px 0", display:"flex", alignItems:"center", justifyContent:"center", gap:"6px", fontFamily:"inherit" }}
                  onMouseEnter={e => { const b=e.currentTarget as HTMLButtonElement; b.style.color="#fff"; b.style.borderColor="#3a8aff"; b.style.background="#0d1f30"; }}
                  onMouseLeave={e => { const b=e.currentTarget as HTMLButtonElement; b.style.color="#7a9db8"; b.style.borderColor="#1e3a52"; b.style.background="transparent"; }}>
                  <span style={{ fontSize:"14px" }}>↺</span> Reiniciar estadísticas
                </button>
                {/* Profit chart */}
                {(() => {
                  const raw = baccaratStats.history.length > 0 ? baccaratStats.history.slice().reverse() : null;
                  const W=256, H=180, PAD_X=10, PAD_Y=16;
                  const chartW=W-PAD_X*2, chartH=H-PAD_Y*2;
                  let series: {cum:number;win:boolean;profit:number}[] = [];
                  if (raw) { let r=0; series=raw.map(p=>{r+=(p.profit??0);return{cum:r,win:p.win,profit:p.profit??0};}); }
                  const allPts = raw ? [{cum:0,win:false,profit:0},...series] : [];
                  const n=allPts.length;
                  if (n<2) return (
                    <div style={{ height:"160px", display:"flex", alignItems:"center", justifyContent:"center", background:"#0a1520", borderRadius:"10px", border:"1px solid #1a3347" }}>
                      <span style={{ color:"#2a4a6a", fontSize:"12px" }}>{gt(lang, "noHistoryShort")}</span>
                    </div>
                  );
                  const cums=allPts.map(p=>p.cum);
                  const minC=Math.min(0,...cums), maxC=Math.max(0,...cums);
                  const range=maxC-minC||1;
                  const toX=(i:number)=>PAD_X+i*(chartW/Math.max(n-1,1));
                  const toY=(v:number)=>PAD_Y+chartH-((v-minC)/range)*chartH;
                  const zeroY=toY(0);
                  const xs=allPts.map((_,i)=>toX(i));
                  const ys=allPts.map(p=>toY(p.cum));
                  const hIdx=chartHover;
                  const hpt=hIdx!==null&&hIdx>0&&hIdx<allPts.length?allPts[hIdx]:null;
                  const linePath=xs.map((x,i)=>`${i===0?"M":"L"}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
                  const fillPath=linePath+` L${xs[n-1].toFixed(1)} ${zeroY.toFixed(1)} L${xs[0].toFixed(1)} ${zeroY.toFixed(1)} Z`;
                  return (
                    <div style={{ position:"relative", background:"#0a1520", borderRadius:"10px", height:"160px", border:"1px solid #1a3347", overflow:"visible" }}>
                      {hpt && (
                        <div style={{ position:"absolute", left:`${Math.min(Math.max((xs[hIdx!]/W)*100,10),80)}%`, top:`${Math.max((ys[hIdx!]/H)*100-14,2)}%`,
                          transform:"translateX(-50%) translateY(-100%)",
                          background:"#1a2a3a", border:`1.5px solid ${hpt.profit>=0?"#19ff35":"#ff3350"}`,
                          borderRadius:"8px", padding:"4px 10px", fontSize:"11px", fontWeight:500,
                          color:hpt.profit>=0?"#19ff35":"#ff3350", whiteSpace:"nowrap", pointerEvents:"none", zIndex:20 }}>
                          {hpt.profit>=0?"+":""}{fmtMoney(hpt.profit)}
                        </div>
                      )}
                      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
                        style={{ width:"100%", height:"100%", display:"block", cursor:"crosshair" }}
                        onMouseMove={e => {
                          const rect=(e.currentTarget as SVGSVGElement).getBoundingClientRect();
                          const svgX=((e.clientX-rect.left)/rect.width)*W;
                          let closest=0, minDist=Infinity;
                          xs.forEach((x,i)=>{const d=Math.abs(x-svgX);if(d<minDist){minDist=d;closest=i;}});
                          setChartHover(closest);
                        }}
                        onMouseLeave={()=>setChartHover(null)}>
                        <defs>
                          <clipPath id="bacClipAbove"><rect x={PAD_X} y={PAD_Y} width={chartW} height={zeroY-PAD_Y}/></clipPath>
                          <clipPath id="bacClipBelow"><rect x={PAD_X} y={zeroY} width={chartW} height={chartH-(zeroY-PAD_Y)}/></clipPath>
                        </defs>
                        <path d={fillPath} fill="rgba(200,30,30,.35)" clipPath="url(#bacClipBelow)"/>
                        <path d={fillPath} fill="rgba(25,255,80,.18)" clipPath="url(#bacClipAbove)"/>
                        <line x1={PAD_X} y1={zeroY} x2={W-PAD_X} y2={zeroY} stroke="#2a4055" strokeWidth="1.5"/>
                        <path d={linePath} fill="none" stroke="#19ff35" strokeWidth="2" strokeLinecap="square" clipPath="url(#bacClipAbove)"/>
                        <path d={linePath} fill="none" stroke="#e03030" strokeWidth="2" strokeLinecap="square" clipPath="url(#bacClipBelow)"/>
                        {hIdx!==null&&hIdx<allPts.length&&<>
                          <line x1={xs[hIdx]} y1={PAD_Y} x2={xs[hIdx]} y2={H-PAD_Y} stroke="#3a5570" strokeWidth="1" strokeDasharray="4,3"/>
                          <circle cx={xs[hIdx]} cy={ys[hIdx]} r="4" fill={allPts[hIdx].profit>=0?"#19ff35":"#ff3350"} stroke="#0a1520" strokeWidth="1.5" style={{pointerEvents:"none"}}/>
                        </>}
                      </svg>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Footer: Stats + Volume (identical to Roulette) */}
          <div style={{ marginTop:"auto", display:"flex", gap:"8px", position:"relative" }}>
            <button onClick={() => { setStatsOpen(v=>!v); setShowVol(false); }}
              title={gt(lang, "liveStatsTitle")}
              style={{ width:"38px", height:"38px", borderRadius:"8px", fontFamily:"inherit",
                background: statsOpen?"#1f6fd0":"#0e1826",
                border: statsOpen?"1px solid #3a8aff":"1px solid #203a50",
                color: statsOpen?"#fff":"#7a9db8",
                cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
                transition:"background .2s,border .2s,color .2s,transform .12s,filter .12s" }}
              onMouseEnter={e=>{e.currentTarget.style.filter="brightness(1.4)";e.currentTarget.style.transform="scale(1.12)";}}
              onMouseLeave={e=>{e.currentTarget.style.filter="";e.currentTarget.style.transform="";}}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
              </svg>
            </button>

            <div style={{ position:"relative" }}>
              {showVol && <div onClick={()=>setShowVol(false)} style={{ position:"fixed", inset:0, zIndex:9998 }}/>}
              <button onClick={()=>{setShowVol(v=>!v);setStatsOpen(false);}}
                title="Volumen"
                style={{ position:"relative", zIndex:10000, width:"38px", height:"38px", borderRadius:"8px", fontFamily:"inherit",
                  background:showVol?"#1f6fd0":"#0e1826",
                  border:showVol?"1px solid #3a8aff":"1px solid #203a50",
                  color:showVol?"#fff":"#7a9db8",
                  cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
                  transition:"background .2s,border .2s,color .2s,transform .12s,filter .12s" }}
                onMouseEnter={e=>{e.currentTarget.style.filter="brightness(1.4)";e.currentTarget.style.transform="scale(1.12)";}}
                onMouseLeave={e=>{e.currentTarget.style.filter="";e.currentTarget.style.transform="";}}>
                {vol===0
                  ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                  : vol<40
                  ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                  : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}
              </button>
              {showVol && (
                <div style={{ position:"absolute", bottom:"48px", left:"0",
                  background:"#0f1e2e", border:"1px solid #252f45",
                  borderRadius:"12px", padding:"10px 16px",
                  display:"flex", alignItems:"center", gap:"12px",
                  minWidth:"200px", boxShadow:"0 4px 20px rgba(0,0,0,.5)", zIndex:10000 }}>
                  <span style={{ fontSize:"18px", flexShrink:0, color:"#5a6a88" }}>
                    {vol===0
                      ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                      : vol<40
                      ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                      : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}
                  </span>
                  <input type="range" min={0} max={100} step={1} value={vol}
                    onChange={e=>setVol(Number(e.target.value))}
                    style={{ flex:1, accentColor:"#f4a91f", cursor:"pointer", height:"4px" }}/>
                  <span style={{ color:"#d0dcea", fontWeight:500, fontSize:"13px", minWidth:"24px", textAlign:"right" }}>{vol}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── RIGHT: GAME AREA ─────────────────────────────────────────────── */}
      <div style={{ display:"flex", flexDirection:"column", background:"#09141f", position:"relative", overflow:"hidden" }}>

        {/* Deck pile — top right, identical to Blackjack */}
        <DeckPile />

        {/* TIE badge */}
        <div style={{ position:"absolute", top:"16px", left:"50%", transform:"translateX(-50%)",
          background:"rgba(20,36,70,0.75)", border:"1px solid #2a4a80",
          borderRadius:"6px", padding:"4px 16px",
          fontSize:"11px", color:"#6a8ab0", fontWeight:700, letterSpacing:"1.5px",
          textTransform:"uppercase", zIndex:10 }}>
          TIE PAYS 8 TO 1
        </div>

        {/* ── WIN / TIE POPUP ──────────────────────────────────────────── */}
        {phase === "result" && (winMult > 0 && payout > 0 || result === "tie") && (
          <div style={{
            position:"absolute", top:0, left:0, right:0, bottom:"200px",
            display:"flex", alignItems:"center", justifyContent:"center",
            zIndex:200, pointerEvents:"none",
          }}>
            {(() => {
              const isTie = result === "tie";
              const accentColor = isTie ? "#f4c430" : "#22ee66";
              const shadowColor = isTie ? "rgba(244,196,48,.45)" : "rgba(34,238,102,.45)";
              const dividerColor = isTie ? "#3a2e08" : "#1e3a28";
              return (
                <div style={{
                  background:"rgba(10,16,26,0.97)",
                  border:`2.5px solid ${accentColor}`,
                  borderRadius:"14px",
                  padding:"20px 36px",
                  textAlign:"center",
                  boxShadow:`0 0 48px ${shadowColor}, 0 8px 32px rgba(0,0,0,.7)`,
                  animation:"kenoCenterPop .32s cubic-bezier(.34,1.56,.64,1) both",
                  minWidth:"150px",
                  whiteSpace:"nowrap",
                }}>
                  {isTie && isPush ? (
                    <>
                      <div style={{ fontSize:"22px", fontWeight:800, color:accentColor, lineHeight:1, letterSpacing:"-0.5px" }}>
                        Empate
                      </div>
                      <div style={{ height:"1px", background:dividerColor, margin:"11px 0" }}/>
                      <div style={{ fontSize:"15px", fontWeight:500, color:"#8aabb0" }}>
                        1,00× — Devolución
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize:"30px", fontWeight:700, color:accentColor, lineHeight:1, letterSpacing:"-0.5px" }}>
                        {(isTie ? 9 : winMult).toLocaleString("es-AR", { minimumFractionDigits:2, maximumFractionDigits:2 })}×
                      </div>
                      <div style={{ height:"1px", background:dividerColor, margin:"11px 0" }}/>
                      <div style={{ fontSize:"15px", fontWeight:500, color:"#8aabb0" }}>
                        +{fmtMoney(payout)}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── CARD DISPLAY ─────────────────────────────────────────────── */}
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"50px 32px 16px" }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:"24px", width:"100%", maxWidth:"780px" }}>

            {/* Player hand */}
            <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:"12px" }}>
              <div style={{ fontSize:"11px", fontWeight:700, letterSpacing:"2px", color:"#7a9ac0",
                textTransform:"uppercase", display:"flex", alignItems:"center", gap:"8px" }}>
                <span style={{ background:"rgba(30,80,200,0.25)", border:"1px solid #2a5ae0",
                  borderRadius:"999px", padding:"2px 10px",
                  color: result==="player"?"#00e064":"#7a9ac0" }}>
                  {playerCards.length > 0 ? pScore : "–"}
                </span>
                Jugador
              </div>
              {(() => {
                const n = playerCards.length;
                const FO = 44, CW = 110, CH = 158;
                const fw = n > 0 ? CW + (n-1)*FO : CW;
                return (
                  <div style={{ position:"relative", width:fw, height:CH, flexShrink:0 }}>
                    {playerCards.map((c,i) => (
                      <div key={i} style={{ position:"absolute", left:i*FO, top:0, zIndex:i+1 }}>
                        <BacCard card={c} delay={0} glow={result==="player"} />
                      </div>
                    ))}
                    {n===0 && phase==="idle" && (
                      <div style={{ width:CW, height:CH, borderRadius:"12px", border:"2px dashed #1a2e50", opacity:0.35 }}/>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Divider + result — fixed height so cards don't jump */}
            <div style={{ width:"110px", flexShrink:0, position:"relative", height:"210px" }}>
              {/* top line */}
              <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:"1px", height:"68px", background:"linear-gradient(to bottom,transparent,#2a4a70)" }}/>
              {/* result badge — absolutely centered */}
              <div style={{ position:"absolute", top:"68px", left:0, right:0, display:"flex", flexDirection:"column", alignItems:"center", gap:"6px", minHeight:"74px", justifyContent:"center" }}>
                {result && (
                  <div style={{ padding:"5px 12px", borderRadius:"8px", fontSize:"11px", fontWeight:800,
                    letterSpacing:"1px", textTransform:"uppercase", whiteSpace:"nowrap",
                    background: result==="tie"?"rgba(244,169,31,0.15)":result==="player"?"rgba(0,100,224,0.15)":"rgba(224,30,80,0.15)",
                    border:`1px solid ${result==="tie"?"#f4a91f":result==="player"?"#1a64e0":"#e01a50"}`,
                    color: result==="tie"?"#f4a91f":result==="player"?"#4a90ff":"#ff4a7a",
                    animation:"bacResultPop 0.35s cubic-bezier(0.08,0.6,0.2,1) both",
                  }}>
                    {result==="player"?gt(lang,"bacPlayer"):result==="banker"?gt(lang,"bacBanker"):gt(lang,"bacTie")}
                  </div>
                )}
              </div>
              {/* bottom line */}
              <div style={{ position:"absolute", bottom:0, left:"50%", transform:"translateX(-50%)", width:"1px", height:"68px", background:"linear-gradient(to top,transparent,#2a4a70)" }}/>
            </div>

            {/* Banker hand */}
            <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:"12px" }}>
              <div style={{ fontSize:"11px", fontWeight:700, letterSpacing:"2px", color:"#7a9ac0",
                textTransform:"uppercase", display:"flex", alignItems:"center", gap:"8px" }}>
                Banca
                <span style={{ background:"rgba(200,30,80,0.2)", border:"1px solid #e01a50",
                  borderRadius:"999px", padding:"2px 10px",
                  color: result==="banker"?"#00e064":"#7a9ac0" }}>
                  {bankerCards.length > 0 ? bScore : "–"}
                </span>
              </div>
              {(() => {
                const n = bankerCards.length;
                const FO = 44, CW = 110, CH = 158;
                const fw = n > 0 ? CW + (n-1)*FO : CW;
                return (
                  <div style={{ position:"relative", width:fw, height:CH, flexShrink:0 }}>
                    {bankerCards.map((c,i) => (
                      <div key={i} style={{ position:"absolute", left:i*FO, top:0, zIndex:i+1 }}>
                        <BacCard card={c} delay={0} glow={result==="banker"} />
                      </div>
                    ))}
                    {n===0 && phase==="idle" && (
                      <div style={{ width:CW, height:CH, borderRadius:"12px", border:"2px dashed #1a2e50", opacity:0.35 }}/>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* ── BETTING TABLE ─────────────────────────────────────────────── */}
        <div style={{ padding:"12px 20px 0", background:"rgba(9,20,31,0.75)" }}>
          {/* 3 separate zone rectangles */}
          <div style={{ display:"flex", gap:"10px", marginBottom:"10px" }}>
            {([
              { zone:"player"  as BetZone, label:"Jugador", pay:"1:1",    accent:"#2563eb", glow:"rgba(37,99,235,0.45)" },
              { zone:"tie"     as BetZone, label:"Empate",  pay:"8:1",    accent:"#d97706", glow:"rgba(217,119,6,0.45)"  },
              { zone:"banker"  as BetZone, label:"Banca",   pay:"0.95:1", accent:"#dc2626", glow:"rgba(220,38,38,0.45)"  },
            ]).map(({ zone, label, pay, accent, glow }) => {
              const betHere = zoneBets[zone];
              const isWinner = result === zone;
              return (
                <div key={zone}
                  onClick={() => placeChip(zone)}
                  onMouseDown={e => e.preventDefault()}
                  style={{
                    flex:1, borderRadius:"12px", padding:"16px 12px", textAlign:"center",
                    cursor: (phase==="idle" || phase==="result") ? "pointer" : "default",
                    border: isWinner ? `2px solid ${accent}` : `1px solid ${betHere>0?accent+"88":"#1e3050"}`,
                    background: isWinner
                      ? `radial-gradient(ellipse at center, ${glow.replace("0.45","0.18")} 0%, rgba(9,20,31,0.96) 70%)`
                      : betHere>0
                      ? `radial-gradient(ellipse at center, ${glow.replace("0.45","0.08")} 0%, rgba(9,20,31,0.92) 70%)`
                      : "rgba(11,20,33,0.88)",
                    transition:"all .2s",
                    boxShadow: isWinner ? `0 0 24px ${glow}` : betHere>0 ? `0 0 12px ${glow.replace("0.45","0.25")}` : "none",
                    position:"relative", minHeight:"130px", display:"flex", flexDirection:"column",
                    alignItems:"center", justifyContent:"center", gap:"6px",
                  }}
                  onMouseEnter={e => { if (phase==="idle" || phase==="result") { e.currentTarget.style.border=`1px solid ${accent}aa`; e.currentTarget.style.boxShadow=`0 0 16px ${glow.replace("0.45","0.3")}`; }}}
                  onMouseLeave={e => {
                    if (phase==="idle" || phase==="result") {
                      const b = isWinner;
                      e.currentTarget.style.border = b ? `2px solid ${accent}` : betHere>0 ? `1px solid ${accent}88` : "1px solid #1e3050";
                      e.currentTarget.style.boxShadow = b ? `0 0 24px ${glow}` : betHere>0 ? `0 0 12px ${glow.replace("0.45","0.25")}` : "none";
                    }
                  }}>
                  <div style={{ fontSize:"13px", fontWeight:700, color: isWinner ? "#fff" : "#8aa8d0", letterSpacing:"0.5px" }}>{label}</div>
                  <div style={{ fontSize:"11px", color: accent, fontWeight:600, letterSpacing:"0.5px" }}>{pay}</div>
                  {betHere > 0 && (
                    <div style={{ fontSize:"11px", fontWeight:700, color:"#c8daf0", letterSpacing:"0.3px", marginTop:"2px" }}>
                      {fmtMoney(betHere)}
                    </div>
                  )}
                  {(() => {
                    const stack = zoneChips[zone];
                    if (stack.length === 0) return null;
                    const visible = stack.slice(-5);
                    const CHIP_SIZE = 34;
                    const CHIP_V_OFFSET = 10;
                    const stackH = CHIP_SIZE + (visible.length - 1) * CHIP_V_OFFSET;
                    return (
                      <div style={{ position:"absolute", right:"10px", bottom:"10px", display:"flex", flexDirection:"column", alignItems:"center", gap:"3px" }}>
                        <div style={{ position:"relative", width:CHIP_SIZE, height:stackH, flexShrink:0 }}>
                          {visible.map((chip, i) => {
                            const meta = getBetChipMeta(chip.value);
                            const isNewest = i === visible.length - 1;
                            return (
                              <div key={chip.id} style={{
                                position:"absolute",
                                bottom: i * CHIP_V_OFFSET,
                                left: 0,
                                animation: isNewest ? "chipDrop 0.22s cubic-bezier(0.22,1.5,0.5,1) both" : "none",
                                filter: `drop-shadow(0 ${i > 0 ? 2 : 4}px ${i > 0 ? 3 : 8}px rgba(0,0,0,0.6))`,
                              }}>
                                <CasinoChipSVG {...meta} size={CHIP_SIZE} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>

          {/* Undo / Clear at bottom corners */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingBottom:"14px" }}>
            {(()=>{ const canEdit = (phase==="idle"||phase==="result") && hasBets; return (<>
            <button onClick={handleUndo} disabled={!canEdit}
              style={{ padding:"7px 16px", background:"transparent",
                border:`1px solid ${canEdit?"#1e3050":"#131d30"}`,
                borderRadius:"8px", color:canEdit?"#8aa8d0":"#2a3a50",
                fontSize:"12px", cursor:canEdit?"pointer":"default", fontWeight:600,
                transition:"all .15s" }}
              onMouseEnter={e=>{ if(canEdit){e.currentTarget.style.borderColor="#3a5a80";e.currentTarget.style.color="#b0c8e8";}}}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor=canEdit?"#1e3050":"#131d30"; e.currentTarget.style.color=canEdit?"#8aa8d0":"#2a3a50";}}>
              ↩ Deshacer
            </button>
            <button onClick={handleClear} disabled={!canEdit}
              style={{ padding:"7px 16px", background:"transparent",
                border:`1px solid ${canEdit?"#1e3050":"#131d30"}`,
                borderRadius:"8px", color:canEdit?"#8aa8d0":"#2a3a50",
                fontSize:"12px", cursor:canEdit?"pointer":"default", fontWeight:600,
                transition:"all .15s" }}
              onMouseEnter={e=>{ if(canEdit){e.currentTarget.style.borderColor="#3a5a80";e.currentTarget.style.color="#b0c8e8";}}}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor=canEdit?"#1e3050":"#131d30"; e.currentTarget.style.color=canEdit?"#8aa8d0":"#2a3a50";}}>
              Limpiar ↺
            </button>
            </>); })()}
          </div>
        </div>

        {/* keyframes */}
        <style>{`
          @keyframes bacResultPop {
            from { opacity:0; transform:scale(0.7); }
            to   { opacity:1; transform:scale(1); }
          }
          @keyframes chipDrop {
            from { opacity:0; transform:translateY(-18px) scale(0.82); }
            to   { opacity:1; transform:translateY(0)    scale(1); }
          }
        `}</style>
      </div>
    </div>
  );
}
