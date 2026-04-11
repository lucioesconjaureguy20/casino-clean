import React, { useState, useRef, useEffect } from "react";
import { Card } from "./BlackjackGame";

// ── Types ────────────────────────────────────────────────────────────────────
const HILO_SAVE_KEY = "hilo_active_session";

type Suit = "♠" | "♣" | "♥" | "♦";
type Rank = "A"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"|"10"|"J"|"Q"|"K";
type HiloPhase = "idle" | "playing" | "result";

export interface HiloStats {
  wins: number; losses: number; profit: number; wagered: number;
  history: { profit: number; win: boolean }[];
}
export const hiloStatsDefault: HiloStats = { wins:0, losses:0, profit:0, wagered:0, history:[] };

export interface HiloGameProps {
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
  hiloStats: HiloStats;
  setHiloStats: React.Dispatch<React.SetStateAction<HiloStats>>;
  onVerTodo?: () => void;
  onMoreGames?: Record<string, () => void>;
  currentUser?: string;
  onRequestLogin?: () => void;
  onGameActive?: (active: boolean) => void;
}

// ── Deck helpers ─────────────────────────────────────────────────────────────
function makeShuffledDeck(): Card[] {
  const suits: Suit[] = ["♠","♣","♥","♦"];
  const ranks: Rank[] = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const deck: Card[] = [];
  for (const s of suits) for (const r of ranks) deck.push({ suit:s, rank:r });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// A=1 (lowest), 2-10, J=11, Q=12, K=13 (highest)
function hiloRankVal(rank: Rank): number {
  if (rank === "A") return 1;
  if (rank === "J") return 11;
  if (rank === "Q") return 12;
  if (rank === "K") return 13;
  return parseInt(rank, 10);
}

function isRed(suit: string): boolean { return suit === "♥" || suit === "♦"; }

// ── Multiplier / probability logic ───────────────────────────────────────────
// Mayor o Igual = next card ≥ current  (inclusive, same as Stake)
// Menor o Igual = next card ≤ current  (inclusive, same as Stake)
// A=1 (lowest), K=13 (highest)
// Mayor favorable = cards ≥ current = 14 - v   (e.g. 10 → 4/13 = 30.77%)
// Menor favorable = cards ≤ current = v         (e.g. 10 → 10/13 = 76.92%)
const HILO_RTP = 0.99;

function calcMult(rank: Rank, dir: "higher" | "lower"): number {
  const v = hiloRankVal(rank);
  // Cap at 12 so A→Mayor and K→Menor show 92.31% (12/13) instead of 100% (13/13), matching Stake
  const favorable = Math.min(dir === "higher" ? (14 - v) : v, 12);
  return Math.max(1.01, (HILO_RTP * 13) / favorable);
}

function calcProb(rank: Rank, dir: "higher" | "lower"): number {
  const v = hiloRankVal(rank);
  const favorable = Math.min(dir === "higher" ? (14 - v) : v, 12);
  return (favorable / 13) * 100;
}

// ── Playing Card visual ───────────────────────────────────────────────────────
function HiloCard({ card, size = "large", animKey, animType = "deal", showBack = false, lose = false }: {
  card: Card | null;
  size?: "large" | "medium" | "small";
  animKey?: string | number;
  animType?: "deal" | "flip" | "flipReveal" | "small" | "exitUp" | "exitLeft" | "histFlipRight" | "backAppear";
  showBack?: boolean;
  lose?: boolean;
}) {
  const w = size === "large" ? 164 : size === "medium" ? 92 : 76;
  const h = size === "large" ? 230 : size === "medium" ? 128 : 106;

  const cardAnim =
    // second half of bjFlip — 0.14s delay so it waits while exit plays, then reveals exactly like BJ
    animType === "flip"         ? "hiloCardFlip 0.22s 0.14s cubic-bezier(0.4,0,0.6,1) both" :
    animType === "small"        ? "hiloCardSmallIn 0.3s cubic-bezier(0.22,1,0.36,1) both" :
    // abrupt yank upward (skip exit)
    animType === "exitUp"       ? "hiloCardExitUp 0.2s ease-in forwards" :
    // first half of bjFlip — face rotates to 90deg (edge) and disappears
    animType === "exitLeft"     ? "hiloCardExitLeft 0.18s cubic-bezier(0.4,0,0.6,1) forwards" :
    animType === "histFlipRight"? "hiloCardSmallFlipRight 0.36s cubic-bezier(0.22,1,0.36,1) both" :
    // back card appears instantly — exit card is flying over it so no entrance needed
    animType === "backAppear"   ? undefined :
    // immediate flip reveal (skip sequence — no delay since back card is visible right before)
    animType === "flipReveal"   ? "hiloCardFlip 0.26s cubic-bezier(0.4,0,0.6,1) both" :
                                  "hiloCardIn 0.42s cubic-bezier(0.22,1,0.36,1) both";

  // Render card back: when no card yet (idle placeholder) OR showBack=true (skip sequence)
  if (!card || showBack) {
    return (
      <div key={animKey} style={{
        width:`${w}px`, height:`${h}px`, borderRadius:"10px",
        background:"linear-gradient(135deg,#1e3d72 0%,#0d2248 50%,#0a1a38 100%)",
        border:"2px solid #2a5aaa",
        boxShadow: size === "large"
          ? "0 12px 40px rgba(0,0,60,.5), inset 0 1px rgba(255,255,255,.1)"
          : "0 4px 14px rgba(0,0,60,.4)",
        display:"flex", alignItems:"center", justifyContent:"center",
        flexShrink:0, position:"relative",
        willChange:"transform, opacity",
        animation: showBack ? cardAnim : undefined,
      }}>
        <div style={{
          position:"absolute", inset:"5px", borderRadius:"6px",
          background:"repeating-linear-gradient(45deg,#1a4080 0px,#1a4080 4px,#0e2855 4px,#0e2855 8px)",
          opacity:0.5, border:"1px solid rgba(255,255,255,.08)"
        }}/>
        <img src="/mander-logo.png" alt="Mander" style={{
          position:"relative", width: size==="large" ? "88px" : size==="medium" ? "52px" : "46px",
          filter:"brightness(0) invert(1)", opacity:0.9, objectFit:"contain"
        }}/>
      </div>
    );
  }

  const red = isRed(card.suit);
  const rankFs   = size === "large" ? "24px" : size === "medium" ? "14px" : "12px";
  const suitSmFs = size === "large" ? "18px" : size === "medium" ? "12px" : "10px";
  const centerFs = size === "large" ? "60px" : size === "medium" ? "32px" : "24px";

  return (
    <div key={animKey} style={{
      width:`${w}px`, height:`${h}px`, borderRadius:"10px",
      background:"#ffffff",
      border: lose ? "5px solid #e63e3e" : "2px solid #d0d8ea",
      boxShadow: lose
        ? "0 0 0 3px rgba(230,62,62,0.45), inset 0 0 16px rgba(230,62,62,0.35), 0 0 32px rgba(230,62,62,0.65)"
        : size === "large"
          ? "0 12px 40px rgba(0,0,0,.45), 0 4px 12px rgba(0,0,0,.25)"
          : "0 4px 14px rgba(0,0,0,.35)",
      display:"flex", alignItems:"center", justifyContent:"center",
      userSelect:"none", flexShrink:0, position:"relative",
      willChange:"transform, opacity",
      animation: cardAnim,
    }}>
      <span style={{
        position:"absolute", top:"5px", left:"7px",
        fontSize:rankFs, fontWeight:900,
        color: red ? "#cc1a1a" : "#111",
        lineHeight:1.1, display:"flex", flexDirection:"column", alignItems:"center"
      }}>
        <span>{card.rank}</span>
        <span style={{ fontSize:suitSmFs }}>{card.suit}</span>
      </span>
      <span style={{ fontSize:centerFs, color: red ? "#cc1a1a" : "#111", lineHeight:1 }}>
        {card.suit}
      </span>
      <span style={{
        position:"absolute", bottom:"5px", right:"7px",
        fontSize:rankFs, fontWeight:900,
        color: red ? "#cc1a1a" : "#111",
        lineHeight:1.1, display:"flex", flexDirection:"column", alignItems:"center",
        transform:"rotate(180deg)"
      }}>
        <span>{card.rank}</span>
        <span style={{ fontSize:suitSmFs }}>{card.suit}</span>
      </span>
    </div>
  );
}

// ── Main HiloGame Component ───────────────────────────────────────────────────
export default function HiloGame({
  balance, fmtMoney, convertUsd, displayCurrency, currencyFade,
  onBack, onBalanceChange, addBet, onBetRecord,
  liveRates, lang: _lang = "es", hiloStats, setHiloStats,
  currentUser, onRequestLogin, onGameActive,
}: HiloGameProps) {
  // ── Restore active session from localStorage (if the player navigated away mid-game) ──
  const _savedSession = (() => {
    try {
      const raw = localStorage.getItem(HILO_SAVE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s?.phase === "playing") return s;
      }
    } catch {}
    return null;
  })();

  const [phase, setPhase]             = useState<HiloPhase>(_savedSession?.phase ?? "idle");
  const [deck, setDeck]               = useState<Card[]>(_savedSession?.deck ?? []);
  const [currentCard, setCurrentCard] = useState<Card | null>(_savedSession?.currentCard ?? null);
  const [animKey, setAnimKey]         = useState(0);
  const [history, setHistory]         = useState<{ id:number; card: Card; guess: "higher"|"lower"|"skip"|null; won: boolean|null }[]>(_savedSession?.history ?? []);
  const [bet, setBet]                 = useState(() => {
    if (_savedSession?.betUsd) {
      const rate = liveRates[displayCurrency] ?? 1;
      return ((_savedSession.betUsd as number) * rate).toFixed(2);
    }
    return "1.00";
  });
  const [betUsd, setBetUsd]           = useState<number>(_savedSession?.betUsd ?? 1.00);
  const [accMult, setAccMult]         = useState<number>(_savedSession?.accMult ?? 1.0);
  const [outcome, setOutcome]         = useState<"win"|"lose"|null>(null);
  const [guessCount, setGuessCount]   = useState<number>(_savedSession?.guessCount ?? 0);
  const [lastAction, setLastAction]   = useState<"deal" | "flip" | "flipReveal" | "backAppear">("deal");
  const [exitCard, setExitCard]       = useState<Card | null>(null);
  const [exitAnimType, setExitAnimType] = useState<"exitUp" | "exitLeft">("exitUp");
  const [latestHistId, setLatestHistId] = useState<number>(-1);
  const [showingBack, setShowingBack] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const actionBusyRef  = useRef(false);
  const actionLockRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const histIdRef    = useRef<number>(_savedSession?.histIdCounter ?? 0);
  const exitTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flipTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const histScrollRef  = useRef<HTMLDivElement | null>(null);
  const prevCurrRef    = useRef(displayCurrency);
  const liveRatesRef   = useRef(liveRates);
  liveRatesRef.current = liveRates;
  const volRef         = useRef(70);

  // Convert bet amount when currency changes (same logic as dice/plinko/keno in App.tsx)
  useEffect(() => {
    const oldCur = prevCurrRef.current;
    prevCurrRef.current = displayCurrency;
    if (oldCur === displayCurrency) return;
    const oldRate = liveRatesRef.current[oldCur] || 1;
    const newRate = liveRatesRef.current[displayCurrency] || 1;
    const ratio = newRate / oldRate;
    if (ratio !== 1 && isFinite(ratio) && oldRate > 0) {
      setBet(v => { const n = parseFloat(v) || 0; return n > 0 ? (Math.round(n * ratio * 100) / 100).toFixed(2) : v; });
    }
  }, [displayCurrency]);

  // Notify parent whether a game round is in progress
  useEffect(() => { onGameActive?.(phase === "playing"); }, [phase]);

  // Auto-scroll history to the end whenever a new card is added
  useEffect(() => {
    if (histScrollRef.current) {
      histScrollRef.current.scrollTo({ left: histScrollRef.current.scrollWidth, behavior: "smooth" });
    }
  }, [history.length]);

  // ── Persist active session so the player can navigate away and come back ──
  useEffect(() => {
    if (phase === "playing" && currentCard) {
      try {
        localStorage.setItem(HILO_SAVE_KEY, JSON.stringify({
          phase, deck, currentCard, history, betUsd, accMult, guessCount,
          histIdCounter: histIdRef.current,
        }));
      } catch {}
    }
  }, [phase, deck, currentCard, history, betUsd, accMult, guessCount]);

  // Volume & stats
  const [vol, setVol]               = useState(70);
  volRef.current = vol;
  const [showVol, setShowVol]       = useState(false);

  // ── Sound helpers ──────────────────────────────────────────────────────────
  function playCardFlip() {
    if (volRef.current === 0) return;
    try {
      const ctx = new AudioContext();
      const vol = volRef.current / 100;
      [880, 1100].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine"; osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.05;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.12 * vol, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t); osc.stop(t + 0.12);
        if (i === 1) osc.onended = () => ctx.close();
      });
    } catch {}
  }

  function playCardSwoosh() {
    if (volRef.current === 0) return;
    try {
      const ctx = new AudioContext();
      const vol = volRef.current / 100;

      // White-noise burst filtered down to a papery swipe
      const bufLen = Math.floor(ctx.sampleRate * 0.18);
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        const t = i / bufLen;                          // 0→1
        const env = Math.sin(Math.PI * t) * (1 - t);  // rises then falls
        data[i] = (Math.random() * 2 - 1) * env;
      }
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = buf;

      // Band-pass: keep the papery mid-high crinkle
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 3800;
      bp.Q.value = 0.7;

      // High-pass to remove bass rumble
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1200;

      // Pitch-sweep oscillator — the "whoosh" glide
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(900, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.16);
      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.06 * vol, ctx.currentTime);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);

      // Master gain
      const master = ctx.createGain();
      master.gain.value = 0.7 * vol;

      noiseSrc.connect(hp); hp.connect(bp); bp.connect(master);
      osc.connect(oscGain); oscGain.connect(master);
      master.connect(ctx.destination);

      noiseSrc.start(ctx.currentTime);
      osc.start(ctx.currentTime);
      noiseSrc.stop(ctx.currentTime + 0.19);
      osc.stop(ctx.currentTime + 0.17);
      setTimeout(() => ctx.close(), 400);
    } catch {}
  }

  function playWin() {
    if (volRef.current === 0) return;
    try {
      const vol = volRef.current / 100;
      const ctx = new AudioContext();
      const notes = [523.25, 659.25, 783.99, 1046.5];
      const master = ctx.createGain();
      master.gain.value = 0.8 * vol;
      master.connect(ctx.destination);
      notes.forEach((freq, i) => {
        const t = ctx.currentTime + i * 0.1;
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.connect(g); g.connect(master);
        osc.type = "sine"; osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.5, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t); osc.stop(t + 0.35);
        if (i === notes.length - 1) osc.onended = () => ctx.close();
      });
    } catch {}
  }
  function playLose() {
    if (volRef.current === 0) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "triangle"; osc.frequency.value = 160;
      const vol = volRef.current / 100;
      gain.gain.setValueAtTime(0.18 * vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.25);
      osc.onended = () => ctx.close();
    } catch {}
  }
  const [showStats, setShowStats]   = useState(false);
  const [statsPos, setStatsPos]     = useState({ x: 310, y: 180 });
  const [chartHover, setChartHover] = useState<number|null>(null);
  const isDraggingStats             = useRef(false);
  const statsDragOffset             = useRef({ x:0, y:0 });

  const dMStyle: React.CSSProperties = { opacity: currencyFade, transition: "opacity 0.18s ease" };

  const betNum    = parseFloat(bet) || 0;
  const currRate  = liveRates[displayCurrency] || 1;
  const betUsdVal = betNum / currRate; // bet converted to USD for balance comparisons

  const isPlaying = phase === "playing";
  const isIdle    = phase === "idle" || phase === "result";

  const currentRank = currentCard?.rank as Rank | undefined;
  const higherMult  = currentRank ? calcMult(currentRank, "higher") : 1.07;
  const lowerMult   = currentRank ? calcMult(currentRank, "lower")  : 6.44;
  const higherProb  = currentRank ? calcProb(currentRank, "higher") : 92.31;
  const lowerProb   = currentRank ? calcProb(currentRank, "lower")  : 15.38;

  // With inclusive ≥/≤, every card has at least 1/13 probability in both directions — never disable
  const higherDis = false;
  const lowerDis  = false;

  const potentialPayout = betUsd * accMult;
  const canCashout = isPlaying && guessCount > 0;
  const canBet     = betNum > 0 && betUsdVal <= balance;

  // ── Bet helpers ───────────────────────────────────────────────────────────
  function halveBet() {
    setBet(v => Math.max(0.01, (parseFloat(v)||0) / 2).toFixed(2));
  }
  function doubleBet() {
    const maxD = Math.floor(convertUsd(balance) * 100) / 100;
    setBet(v => Math.min(maxD, (parseFloat(v)||0) * 2).toFixed(2));
  }
  function minBet() {
    setBet((Math.ceil(convertUsd(0.01) * 100) / 100).toFixed(2));
  }
  function maxBet() {
    setBet((Math.floor(convertUsd(balance) * 100) / 100).toFixed(2));
  }

  // ── Game logic ───────────────────────────────────────────────────────────
  function startGame() {
    if (!currentUser) { onRequestLogin?.(); return; }
    if (!canBet || isPlaying) return;
    const amountUsd = betUsdVal; // always in USD
    onBalanceChange(balance - amountUsd);
    setBetUsd(amountUsd);
    localStorage.removeItem(HILO_SAVE_KEY);
    const freshDeck = makeShuffledDeck();
    const firstCard = freshDeck[0];
    setDeck(freshDeck.slice(1));
    setCurrentCard(firstCard);
    const firstId = histIdRef.current++;
    setHistory([{ id: firstId, card: firstCard, guess: null, won: null }]);
    setAccMult(1.0);
    setGuessCount(0);
    setOutcome(null);
    setLastAction("deal");
    setLatestHistId(-1);
    setShowingBack(false);
    actionBusyRef.current = false;
    setActionBusy(false);
    if (actionLockRef.current) clearTimeout(actionLockRef.current);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    setExitCard(null);
    setAnimKey(k => k + 1);
    setPhase("playing");
  }

  function skipCard() {
    if (!isPlaying || actionBusyRef.current) return;
    playCardSwoosh();
    // Lock buttons until the back-reveal flip completes (~450ms delay + 260ms flip)
    actionBusyRef.current = true;
    setActionBusy(true);
    if (actionLockRef.current) clearTimeout(actionLockRef.current);
    actionLockRef.current = setTimeout(() => { actionBusyRef.current = false; setActionBusy(false); }, 760);
    const d = deck.length >= 1 ? deck : makeShuffledDeck();
    const nextCard = d[0];

    // ── Phase 1: abrupt exit of current card upward ──
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    if (flipTimerRef.current)  clearTimeout(flipTimerRef.current);
    setExitCard(currentCard!);
    setExitAnimType("exitUp");
    exitTimerRef.current = setTimeout(() => setExitCard(null), 230);

    // Show new card BACK immediately (peeking up from under the exiting card)
    const newId = histIdRef.current++;
    setDeck(d.slice(1));
    setCurrentCard(nextCard);
    setShowingBack(true);
    setLastAction("backAppear");
    setLatestHistId(-1);
    setAnimKey(k => k + 1);
    setHistory(prev => {
      const upd = [...prev];
      upd[upd.length - 1] = { ...upd[upd.length - 1], guess: "skip", won: null };
      upd.push({ id: newId, card: nextCard, guess: null, won: null });
      return upd;
    });

    // ── Phase 2: after 450ms, flip to reveal the face ──
    flipTimerRef.current = setTimeout(() => {
      setShowingBack(false);
      setLastAction("flipReveal");
      setAnimKey(k => k + 1);
    }, 450);
  }

  function guess(dir: "higher" | "lower") {
    if (!currentCard || !isPlaying || actionBusyRef.current) return;
    // Lock buttons until the flip animation completes (0.14s delay + 0.22s flip)
    actionBusyRef.current = true;
    setActionBusy(true);
    if (actionLockRef.current) clearTimeout(actionLockRef.current);
    actionLockRef.current = setTimeout(() => { actionBusyRef.current = false; setActionBusy(false); }, 420);
    const mult = dir === "higher"
      ? calcMult(currentCard.rank as Rank, "higher")
      : calcMult(currentCard.rank as Rank, "lower");
    const d = deck.length >= 1 ? deck : makeShuffledDeck();
    const nextCard = d[0];
    const curVal   = hiloRankVal(currentCard.rank as Rank);
    const nextVal  = hiloRankVal(nextCard.rank as Rank);
    // Inclusive comparison: Mayor o Igual = next ≥ current, Menor o Igual = next ≤ current
    const won = dir === "higher" ? nextVal >= curVal : nextVal <= curVal;

    // Clear any pending skip-reveal timer, reset back state
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    setShowingBack(false);
    // Exit animation for the current card (yanks upward — same as skip card)
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    setExitCard(currentCard!);
    setExitAnimType("exitUp");
    exitTimerRef.current = setTimeout(() => setExitCard(null), 200);
    const newId = won ? histIdRef.current++ : -1;
    setLastAction("flip");
    setLatestHistId(won ? newId : -1);
    setDeck(d.slice(1));
    setAnimKey(k => k + 1);
    setHistory(prev => {
      const upd = [...prev];
      upd[upd.length - 1] = { ...upd[upd.length - 1], guess: dir, won };
      if (won) upd.push({ id: newId, card: nextCard, guess: null, won: null });
      return upd;
    });

    if (won) {
      playCardFlip();
      setAccMult(accMult * mult);
      setCurrentCard(nextCard);
      setGuessCount(c => c + 1);
    } else {
      localStorage.removeItem(HILO_SAVE_KEY);
      playLose();
      setCurrentCard(nextCard);
      setOutcome("lose");
      setPhase("result");
      addBet(betUsd, 0, "Hilo");
      onBetRecord?.(betUsd, 0, false, 0);
      setHiloStats(prev => ({
        ...prev,
        losses: prev.losses + 1,
        profit: prev.profit - betUsd,
        wagered: prev.wagered + betUsd,
        history: [{ profit: -betUsd, win: false }, ...prev.history].slice(0, 50),
      }));
    }
  }

  function cashout() {
    if (!canCashout) return;
    localStorage.removeItem(HILO_SAVE_KEY);
    const payout = betUsd * accMult;
    onBalanceChange(balance + payout);
    addBet(betUsd, payout, "Hilo");
    onBetRecord?.(betUsd, accMult, true, payout);
    setHiloStats(prev => ({
      ...prev,
      wins: prev.wins + 1,
      profit: prev.profit + (payout - betUsd),
      wagered: prev.wagered + betUsd,
      history: [{ profit: payout - betUsd, win: true }, ...prev.history].slice(0, 50),
    }));
    playWin();
    setOutcome("win");
    setPhase("result");
  }

  // ── Stats drag ────────────────────────────────────────────────────────────
  function handleStatsDragStart(e: React.MouseEvent) {
    e.preventDefault();
    isDraggingStats.current = true;
    statsDragOffset.current = { x: e.clientX - statsPos.x, y: e.clientY - statsPos.y };
    const onMove = (ev: MouseEvent) => {
      if (!isDraggingStats.current) return;
      setStatsPos({ x: ev.clientX - statsDragOffset.current.x, y: ev.clientY - statsDragOffset.current.y });
    };
    const onUp = () => {
      isDraggingStats.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth:"1080px", margin:"0 auto", position:"relative", userSelect:"none", WebkitUserSelect:"none" }}>
      <div style={{
        display:"grid", gridTemplateColumns:"300px 1fr", gridTemplateRows:"auto 1fr",
        minHeight:"714px", background:"#0e1320", borderRadius:"16px",
        overflow:"hidden", border:"1px solid #153650",
      }}>

        {/* ── Header bar (full width) ── */}
        <div style={{
          gridColumn:"1/-1", display:"flex", alignItems:"center", gap:"10px",
          padding:"10px 20px", background:"#0e1826",
          borderBottom:"1px solid #1a2438", flexShrink:0,
        }}>
          <button onClick={onBack} style={{
            background:"#131a28", border:"1px solid #252f45", color:"#8090b0",
            cursor:"pointer", fontSize:"18px", padding:"5px 12px", borderRadius:"8px", lineHeight:1,
          }}>←</button>
          <div style={{ fontWeight:500, fontSize:"15px", letterSpacing:"1.5px", color:"#fff", display:"flex", alignItems:"center", gap:"8px" }}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="12" height="16" rx="2"/><polyline points="18 4 21 7 18 10"/><polyline points="18 14 21 17 18 20"/><line x1="21" y1="7" x2="21" y2="17"/></svg>HILO</div>
          <div style={{ marginLeft:"auto", fontSize:"12px", color:"#5a6a88", fontWeight:500 }}>Mander Originals</div>
        </div>

        {/* ── Left control panel ── */}
        <div style={{
          background:"#131a28", borderRight:"1px solid #1a2438",
          padding:"16px", display:"flex", flexDirection:"column", gap:"10px",
        }}>

          {/* Monto de Apuesta label */}
          <div style={{ display:"flex", alignItems:"center" }}>
            <span style={{ color:"#5a6a88", fontWeight:500, fontSize:"12px" }}>Monto de Apuesta</span>
          </div>

          {/* Bet input row */}
          <div style={{
            display:"flex", alignItems:"center", gap:"8px",
            background:"#0e1826", border:`1px solid ${!isPlaying && betNum > 0 && !!currentUser && !canBet ? "#c0392b" : "#252f45"}`,
            borderRadius:"10px", padding:"8px 14px", transition:"border .15s",
          }}>
            <span style={{ fontSize:"16px", color:"#5a6a88", fontWeight:500, flexShrink:0, whiteSpace:"nowrap", ...dMStyle }}>{displayCurrency}</span>
            <input
              value={(()=>{
                if(!bet) return "";
                const [int,dec] = bet.split(".");
                const fmtInt = (parseInt(int||"0")||0).toLocaleString("de-DE");
                return dec !== undefined ? `${fmtInt},${dec}` : fmtInt;
              })()}
              onChange={e => {
                const v = e.target.value.replace(/\./g,"").replace(",",".");
                if (/^\d*\.?\d*$/.test(v)) setBet(v);
              }}
              disabled={isPlaying}
              type="text" inputMode="decimal" placeholder="0,00"
              style={{
                flex:1, background:"transparent", border:"none",
                color: isPlaying ? "#4a6070" : "white",
                fontSize:"22px", fontWeight:600, padding:"0",
                minWidth:0, outline:"none", fontFamily:"inherit",
                cursor: isPlaying ? "not-allowed" : "text",
              }}
            />
            <button
              onClick={() => setBet("0.00")}
              disabled={isPlaying}
              style={{
                background:"#0e1826", border:"1px solid #252f45", borderRadius:"6px",
                color:"#6db3f2", fontSize:"11px", fontWeight:500,
                padding:"4px 8px", cursor: isPlaying ? "not-allowed" : "pointer",
                letterSpacing:"0.04em", whiteSpace:"nowrap", textTransform:"uppercase",
              }}
            >Limpiar</button>
          </div>

          {betNum > 0 && !!currentUser && !canBet && !isPlaying && (
            <div style={{ fontSize:"11.5px", color:"#e74c3c", fontWeight:600, marginBottom:"8px", paddingLeft:"2px" }}>
              Saldo insuficiente
            </div>
          )}
          {!(betNum > 0 && !!currentUser && !canBet && !isPlaying) && <div style={{ marginBottom:"6px" }} />}

          {/* Quick bet buttons */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"6px" }}>
            {[
              { label:"Min", action: minBet },
              { label:"½",   action: halveBet },
              { label:"2×",  action: doubleBet },
              { label:"Max", action: maxBet },
            ].map(b => (
              <button
                key={b.label}
                onClick={b.action}
                disabled={isPlaying}
                style={{
                  background:"#1a2438", color: isPlaying ? "#3a4a60" : "#d0dcea",
                  border:"1px solid #252f45", borderRadius:"8px",
                  padding:"8px 0", fontWeight:500, fontSize:"13px",
                  cursor: isPlaying ? "not-allowed" : "pointer",
                }}
              >{b.label}</button>
            ))}
          </div>

          {/* Apostar / Retirar button */}
          {isIdle ? (
            <button
              onClick={startGame}
              disabled={!(betNum > 0) || (!!currentUser && !canBet)}
              style={{
                width:"100%", padding:"14px", borderRadius:"10px", border:"none",
                background: (betNum>0 && (!currentUser || betUsdVal<=balance))
                  ? "linear-gradient(180deg,#1a9fff,#0d6fd4)"
                  : "#1a2438",
                color: (betNum>0 && (!currentUser || betUsdVal<=balance)) ? "#fff" : "#3a4a60",
                fontWeight:600, fontSize:"15px",
                cursor: (betNum>0 && (!currentUser || betUsdVal<=balance)) ? "pointer" : "not-allowed",
                boxShadow: (betNum>0 && (!currentUser || betUsdVal<=balance)) ? "0 4px 22px rgba(26,159,255,.35)" : "none",
                transition:"all .2s",
              }}
            >
              {(!!currentUser && betNum > 0 && !canBet) ? "Saldo insuficiente" : "Apostar"}
            </button>
          ) : (
            <button
              onClick={cashout}
              disabled={!canCashout}
              style={{
                width:"100%", padding:"14px", borderRadius:"10px", border:"none",
                background: canCashout
                  ? "linear-gradient(180deg,#f6b531,#ea9807)"
                  : "#1a2438",
                color: canCashout ? "#fff" : "#3a4a60",
                fontWeight:600, fontSize:"15px",
                cursor: canCashout ? "pointer" : "not-allowed",
                boxShadow: canCashout ? "0 4px 22px rgba(244,169,31,.35)" : "none",
                transition:"all .2s",
              }}
            >
              {canCashout ? `Retirar ${fmtMoney(potentialPayout)}` : "Apostar"}
            </button>
          )}

          {/* Saltar Carta button */}
          <button
            onClick={skipCard}
            disabled={!isPlaying || actionBusy}
            style={{
              width:"100%", padding:"12px 16px", borderRadius:"10px", border:"none",
              background: (isPlaying && !actionBusy) ? "#1e2a3e" : "#111822",
              color: (isPlaying && !actionBusy) ? "#c8d8f0" : "#3a4a60",
              fontWeight:500, fontSize:"14px",
              cursor: (isPlaying && !actionBusy) ? "pointer" : "not-allowed",
              display:"flex", alignItems:"center", justifyContent:"center", gap:"6px",
              transition:"background .15s",
            }}
            onMouseEnter={e => { if (isPlaying && !actionBusy) (e.currentTarget as HTMLElement).style.background = "#253550"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = (isPlaying && !actionBusy) ? "#1e2a3e" : "#111822"; }}
          >
            Saltar Carta <span style={{ fontSize:"15px", letterSpacing:"-1px" }}>»</span>
          </button>

          {/* Divider */}
          <div style={{ height:"1px", background:"#1a2438" }}/>

          {/* Mayor o Igual */}
          <button
            onClick={() => guess("higher")}
            disabled={!isPlaying || higherDis || actionBusy}
            style={{
              width:"100%", padding:"13px 14px", borderRadius:"10px", border:"none",
              background: (isPlaying && !higherDis && !actionBusy) ? "#1a2438" : "#111822",
              color: (isPlaying && !higherDis && !actionBusy) ? "#c8d8f0" : "#3a4a60",
              fontWeight:500, fontSize:"13px",
              cursor: (isPlaying && !higherDis && !actionBusy) ? "pointer" : "not-allowed",
              display:"flex", alignItems:"center", justifyContent:"space-between",
              transition:"background .15s",
            }}
            onMouseEnter={e => { if (isPlaying && !higherDis && !actionBusy) (e.currentTarget as HTMLElement).style.background = "#223048"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = (isPlaying && !higherDis && !actionBusy) ? "#1a2438" : "#111822"; }}
          >
            <span style={{ display:"flex", alignItems:"center", gap:"6px" }}>
              Mayor o Igual
              <span style={{ color:"#22c55e", fontSize:"14px" }}>↑</span>
            </span>
            <span style={{ fontSize:"13px", fontWeight:700, color:(isPlaying && !higherDis && !actionBusy) ? "#c8d8f0" : "#3a4a60" }}>
              {higherProb.toFixed(2)}%
            </span>
          </button>

          {/* Menor o Igual */}
          <button
            onClick={() => guess("lower")}
            disabled={!isPlaying || lowerDis || actionBusy}
            style={{
              width:"100%", padding:"13px 14px", borderRadius:"10px", border:"none",
              background: (isPlaying && !lowerDis && !actionBusy) ? "#1a2438" : "#111822",
              color: (isPlaying && !lowerDis && !actionBusy) ? "#c8d8f0" : "#3a4a60",
              fontWeight:500, fontSize:"13px",
              cursor: (isPlaying && !lowerDis && !actionBusy) ? "pointer" : "not-allowed",
              display:"flex", alignItems:"center", justifyContent:"space-between",
              transition:"background .15s",
            }}
            onMouseEnter={e => { if (isPlaying && !lowerDis && !actionBusy) (e.currentTarget as HTMLElement).style.background = "#223048"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = (isPlaying && !lowerDis && !actionBusy) ? "#1a2438" : "#111822"; }}
          >
            <span style={{ display:"flex", alignItems:"center", gap:"6px" }}>
              Menor o Igual
              <span style={{ color:"#e63e3e", fontSize:"14px" }}>↓</span>
            </span>
            <span style={{ fontSize:"13px", fontWeight:700, color:(isPlaying && !lowerDis) ? "#c8d8f0" : "#3a4a60" }}>
              {lowerProb.toFixed(2)}%
            </span>
          </button>

          {/* Divider */}
          <div style={{ height:"1px", background:"#1a2438" }}/>

          {/* Ganancia total */}
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"7px" }}>
              <span style={{ color:"#5a6a88", fontWeight:500, fontSize:"12px" }}>
                Ganancia total ({accMult.toFixed(2)}×)
              </span>
              <span style={{ color:"#5a6a88", fontSize:"12px", ...dMStyle }}>
                {potentialPayout > 0 ? `${convertUsd(potentialPayout).toLocaleString("de-DE", { minimumFractionDigits: currRate >= 10000 ? 0 : 2, maximumFractionDigits: currRate >= 10000 ? 0 : 2 })} ${displayCurrency}` : `0,00 ${displayCurrency}`}
              </span>
            </div>
            <div style={{
              display:"flex", alignItems:"center",
              background:"#0e1826", border:"1px solid #252f45",
              borderRadius:"10px", overflow:"hidden",
            }}>
              <span style={{ padding:"0 10px", color:"#7a9db8", fontWeight:600, fontSize:"15px", flexShrink:0 }}>{displayCurrency}</span>
              <input
                readOnly
                value={potentialPayout > 0 ? convertUsd(potentialPayout).toLocaleString("de-DE", { minimumFractionDigits: currRate >= 10000 ? 0 : 2, maximumFractionDigits: currRate >= 10000 ? 0 : 2 }) : "0,00"}
                style={{
                  flex:1, background:"transparent", border:"none",
                  color: potentialPayout > betUsd + 0.001 ? "#22c55e" : "#c8d8f0",
                  fontSize:"20px", fontWeight:600, padding:"10px 0",
                  minWidth:0, outline:"none", ...dMStyle,
                }}
              />
            </div>
          </div>

          {/* ── Volume & Stats footer ── */}
          <div style={{ marginTop:"auto", display:"flex", gap:"8px", position:"relative" }}>

            {/* Stats button */}
            <button
              onClick={() => { setShowStats(v => !v); setShowVol(false); }}
              title="Estadísticas"
              style={{
                width:"38px", height:"38px", borderRadius:"8px",
                background: showStats ? "#1f6fd0" : "#0e1826",
                border: showStats ? "1px solid #3a8aff" : "1px solid #203a50",
                color: showStats ? "#fff" : "#7a9db8",
                cursor:"pointer", fontSize:"17px",
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"background .2s,border .2s,color .2s",
              }}
            ><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg></button>

            {/* Volume button + popup */}
            <div style={{ position:"relative" }}>
              {showVol && (
                <div onClick={()=>setShowVol(false)}
                  style={{ position:"fixed",inset:0,zIndex:9998 }}/>
              )}
              <button
                onClick={() => { setShowVol(v => !v); setShowStats(false); }}
                title="Volumen"
                style={{
                  position:"relative", zIndex:10000,
                  width:"38px", height:"38px", borderRadius:"8px",
                  background: showVol ? "#1f6fd0" : "#0e1826",
                  border: showVol ? "1px solid #3a8aff" : "1px solid #203a50",
                  color: showVol ? "#fff" : "#7a9db8",
                  cursor:"pointer", fontSize:"17px",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  transition:"background .2s,border .2s,color .2s",
                }}
              >{vol === 0 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg> : vol < 40 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}</button>
              {showVol && (
                <div style={{
                  position:"absolute", bottom:"48px", left:"0",
                  background:"#0f1e2e", border:"1px solid #252f45",
                  borderRadius:"12px", padding:"10px 16px",
                  display:"flex", alignItems:"center", gap:"12px",
                  minWidth:"200px", boxShadow:"0 4px 20px rgba(0,0,0,.5)", zIndex:10000,
                }}>
                  <span style={{ fontSize:"18px", flexShrink:0, color:"#5a6a88" }}>
                    {vol === 0 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg> : vol < 40 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}
                  </span>
                  <input
                    type="range" min={0} max={100} step={1} value={vol}
                    onChange={e => setVol(Number(e.target.value))}
                    style={{ flex:1, accentColor:"#f4a91f", cursor:"pointer", height:"4px" }}
                  />
                  <span style={{ color:"#d0dcea", fontWeight:500, fontSize:"13px", minWidth:"24px", textAlign:"right" }}>{vol}</span>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ── Right game area ── */}
        <div style={{
          background:"#09141f", display:"flex", flexDirection:"column",
          position:"relative", overflow:"hidden", minWidth:0,
        }}>

          {/* Win popup overlay — same as Keno */}
          {outcome === "win" && (
            <div style={{
              position:"absolute", top:"50%", left:"50%",
              transform:"translate(-50%,-50%)",
              zIndex:200, pointerEvents:"none",
            }}>
              <div style={{
                background:"rgba(10,16,26,0.97)", border:"2.5px solid #22ee66",
                borderRadius:"14px", padding:"20px 32px", textAlign:"center",
                boxShadow:"0 0 48px rgba(34,238,102,.45), 0 8px 32px rgba(0,0,0,.7)",
                animation:"kenoCenterPop .32s cubic-bezier(.34,1.56,.64,1) both",
                minWidth:"140px", whiteSpace:"nowrap",
              }}>
                <div style={{ fontSize:"30px", fontWeight:700, color:"#22ee66", lineHeight:1, letterSpacing:"-0.5px" }}>
                  {accMult.toLocaleString("es-AR", { minimumFractionDigits:2, maximumFractionDigits:2 })}×
                </div>
                <div style={{ height:"1px", background:"#1e3a28", margin:"11px 0" }}/>
                <div style={{ fontSize:"15px", fontWeight:500, color:"#8aabb0", textAlign:"center" }}>
                  <span style={{ opacity:currencyFade, transition:"opacity .18s" }}>{fmtMoney(potentialPayout)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Main card canvas */}
          <div style={{
            flex:1, display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"flex-start",
            padding:"48px 24px 20px", position:"relative",
            minWidth:0, width:"100%",
          }}>

            {/* Card display: K ref | center card | A ref */}
            <div style={{
              display:"flex", alignItems:"center",
              width:"100%", justifyContent:"space-between",
              paddingLeft:"48px", paddingRight:"48px",
              marginBottom:"20px",
            }}>

              {/* K reference (highest) */}
              <div style={{ textAlign:"center", opacity:0.5 }}>
                <div style={{ fontSize:"10px", fontWeight:700, color:"#4a6080", letterSpacing:"1px", marginBottom:"8px", textTransform:"uppercase" }}>MAYOR</div>
                <div style={{
                  width:"78px", height:"108px", borderRadius:"8px",
                  background:"#111c2e", border:"1px solid #1e2e44",
                  display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"4px",
                }}>
                  <span style={{ fontSize:"22px", fontWeight:900, color:"#c8d8f0" }}>K</span>
                  <div style={{ width:"20px", height:"1px", background:"#2a3e58" }}/>
                  <span style={{ fontSize:"18px", color:"#c8d8f0" }}>↑</span>
                </div>
                <div style={{ fontSize:"8px", color:"#3a5070", marginTop:"6px", letterSpacing:"0.8px", lineHeight:1.4 }}>
                  KING BEING<br/>THE HIGHEST
                </div>
              </div>

              {/* Center large card + multiplier badge */}
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"28px" }}>
                {/* Card slot: relative container so exit card can overlay exactly */}
                <div style={{ position:"relative", width:"164px", height:"230px", flexShrink:0 }}>
                  {/* 3D deck layers — right+bottom offset, many layers for thick deck feel */}
                  {[8,7,6,5,4,3,2,1].map(offset => (
                    <div key={offset} style={{
                      position:"absolute",
                      top: offset * 1.4,
                      left: offset * 1.1,
                      width:"164px", height:"230px",
                      borderRadius:"10px",
                      background:"linear-gradient(135deg,#1e3d72 0%,#0d2248 50%,#0a1a38 100%)",
                      border:"1.5px solid #2a5aaa",
                      boxShadow:`${offset}px ${offset*1.5}px ${offset*4}px rgba(0,0,40,.4)`,
                      zIndex: 0,
                    }} />
                  ))}
                  {/* Base card: full card-back design, static behind the animating card */}
                  <div style={{
                    position:"absolute", inset:0, borderRadius:"10px", zIndex:1,
                    background:"linear-gradient(135deg,#1e3d72 0%,#0d2248 50%,#0a1a38 100%)",
                    border:"2px solid #2a5aaa",
                    boxShadow:"0 12px 40px rgba(0,0,60,.5), inset 0 1px rgba(255,255,255,.1)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>
                    <div style={{
                      position:"absolute", inset:"5px", borderRadius:"6px",
                      background:"repeating-linear-gradient(45deg,#1a4080 0px,#1a4080 4px,#0e2855 4px,#0e2855 8px)",
                      opacity:0.5, border:"1px solid rgba(255,255,255,.08)",
                    }}/>
                    <img src="/mander-logo.png" alt="Mander" style={{
                      position:"relative", width:"88px",
                      filter:"brightness(0) invert(1)", opacity:0.9, objectFit:"contain",
                    }}/>
                  </div>
                  {exitCard && (
                    <div style={{ position:"absolute", top:0, left:0, zIndex:3, pointerEvents:"none" }}>
                      <HiloCard card={exitCard} size="large" animKey={`exit-${animKey}`} animType={exitAnimType} />
                    </div>
                  )}
                  <div style={{ position:"relative", zIndex:2 }}>
                    <HiloCard
                      card={phase === "idle" ? null : currentCard}
                      size="large"
                      animKey={animKey}
                      animType={lastAction}
                      showBack={showingBack}
                      lose={outcome === "lose"}
                    />
                  </div>
                </div>
                <div style={{
                  fontSize:"13px", color:"#3a5070", fontStyle:"italic", textAlign:"center",
                  visibility: phase === "idle" ? "visible" : "hidden",
                  marginTop:"12px",
                }}>
                  Ingresa tu apuesta y<br/>presiona "Apostar"
                </div>
              </div>

              {/* A reference (lowest) */}
              <div style={{ textAlign:"center", opacity:0.5 }}>
                <div style={{ fontSize:"10px", fontWeight:700, color:"#4a6080", letterSpacing:"1px", marginBottom:"8px", textTransform:"uppercase" }}>MENOR</div>
                <div style={{
                  width:"78px", height:"108px", borderRadius:"8px",
                  background:"#111c2e", border:"1px solid #1e2e44",
                  display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"4px",
                }}>
                  <span style={{ fontSize:"22px", fontWeight:900, color:"#c8d8f0" }}>A</span>
                  <div style={{ width:"20px", height:"1px", background:"#2a3e58" }}/>
                  <span style={{ fontSize:"18px", color:"#c8d8f0" }}>↓</span>
                </div>
                <div style={{ fontSize:"8px", color:"#3a5070", marginTop:"6px", letterSpacing:"0.8px", lineHeight:1.4 }}>
                  ACE BEING<br/>THE LOWEST
                </div>
              </div>
            </div>

            {/* ── Beneficio a la Mayor / Menor ── */}
            <div style={{
              width:"100%", display:"flex", gap:"12px", marginBottom:"16px", marginTop:"10px",
            }}>
              {/* Mayor */}
              <div style={{
                flex:1, background:"#0e1826", border:"1px solid #1e2e44",
                borderRadius:"12px", padding:"12px 14px",
              }}>
                <div style={{ fontSize:"11px", fontWeight:600, color:"#5a7090", marginBottom:"8px" }}>
                  Beneficio a la Mayor ({higherMult.toFixed(2)}×)
                </div>
                <div style={{
                  display:"flex", alignItems:"center",
                  background:"#08111c", border:"1px solid #1a2a3e",
                  borderRadius:"8px", padding:"8px 10px",
                }}>
                  <span style={{
                    flex:1, fontSize:"18px", fontWeight:600,
                    color: isPlaying ? "#c8d8f0" : "#3a4a60",
                  }}>
                    {isPlaying ? fmtMoney(betUsd * accMult * higherMult) : fmtMoney(0)}
                  </span>
                </div>
              </div>
              {/* Menor */}
              <div style={{
                flex:1, background:"#0e1826", border:"1px solid #1e2e44",
                borderRadius:"12px", padding:"12px 14px",
              }}>
                <div style={{ fontSize:"11px", fontWeight:600, color:"#5a7090", marginBottom:"8px" }}>
                  Beneficio a la Menor ({lowerMult.toFixed(2)}×)
                </div>
                <div style={{
                  display:"flex", alignItems:"center",
                  background:"#08111c", border:"1px solid #1a2a3e",
                  borderRadius:"8px", padding:"8px 10px",
                }}>
                  <span style={{
                    flex:1, fontSize:"18px", fontWeight:600,
                    color: isPlaying ? "#c8d8f0" : "#3a4a60",
                  }}>
                    {isPlaying ? fmtMoney(betUsd * accMult * lowerMult) : fmtMoney(0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Card history strip */}
            {history.length > 0 && (
              <div style={{ width:"100%", minWidth:0 }}>
                <div style={{
                  fontSize:"10px", color:"#3a5070", marginBottom:"10px",
                  fontWeight:700, letterSpacing:"1.2px", textTransform:"uppercase",
                }}>
                  Historial de cartas
                </div>
                <div ref={histScrollRef} style={{
                  display:"flex", gap:"10px",
                  overflowX:"auto", overflowY:"visible",
                  paddingBottom:"14px",
                  paddingTop:"24px", marginTop:"-24px",
                  scrollbarWidth:"thin",
                  scrollbarColor:"#1e3050 transparent",
                }}>
                  {history.map((h, i) => (
                    <div key={i} style={{ flexShrink:0, position:"relative" }}>
                      <HiloCard
                        card={h.card}
                        size="medium"
                        animKey={`hist-${h.id}`}
                        animType={h.id === latestHistId ? "histFlipRight" : "small"}
                      />
                      {/* Arrow badge — right-center edge, straddling the gap to the next card */}
                      {h.guess && (
                        <div style={{
                          position:"absolute",
                          right:"-18px", top:"41%",
                          transform:"translateY(-50%)",
                          zIndex:10, pointerEvents:"none",
                          background: h.guess === "skip" ? "#c2650a" : h.guess === "higher" ? "#14532d" : "#7f1d1d",
                          border: h.guess === "skip"
                            ? "1px solid #f97316aa"
                            : h.guess === "higher" ? "1px solid #22c55e66" : "1px solid #ef444466",
                          borderRadius:"7px",
                          width:"28px", height:"28px",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          fontSize:"14px", fontWeight:900,
                          color: h.guess === "skip" ? "#fff" : h.guess === "higher" ? "#22c55e" : "#ef4444",
                          lineHeight:1,
                          boxShadow:"0 2px 8px rgba(0,0,0,0.5)",
                        }}>
                          {h.guess === "skip" ? "→" : h.guess === "higher" ? "↑" : "↓"}
                        </div>
                      )}
                      {i === 0 && (
                        <div style={{
                          marginTop:"6px", textAlign:"center", whiteSpace:"nowrap",
                          fontSize:"9px", fontWeight:700, color:"#f4a91f",
                          background:"rgba(244,169,31,0.15)", borderRadius:"4px",
                          padding:"2px 6px", border:"1px solid rgba(244,169,31,0.2)",
                          display:"inline-block",
                        }}>
                          Carta Inicial
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* ── Floating draggable stats panel ── */}
      {showStats && (
        <div style={{
          position:"fixed", left: statsPos.x, top: statsPos.y,
          zIndex:9999, width:"260px",
          background:"#0f1f2e", border:"1px solid #1e3a52",
          borderRadius:"14px", boxShadow:"0 8px 32px rgba(0,0,0,.7)",
          overflow:"hidden", userSelect:"none",
        }}>
          <div
            onMouseDown={handleStatsDragStart}
            style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"10px 14px", background:"#112232",
              borderBottom:"1px solid #1e3a52", cursor:"grab",
            }}
          >
            <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
              <span style={{ display:"flex",alignItems:"center",color:"#7a9db8" }}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg></span>
              <strong style={{ fontSize:"13px", color:"#d8e8f5" }}>Estadísticas</strong>
            </div>
            <button
              onClick={() => setShowStats(false)}
              style={{ background:"none", border:"none", color:"#7a9db8", fontSize:"18px", cursor:"pointer", lineHeight:1, padding:"0 2px" }}
            >×</button>
          </div>
          <div style={{ padding:"12px" }}>
            <div style={{ background:"#0d1a28", borderRadius:"10px", padding:"12px", display:"flex", flexDirection:"column", gap:"8px" }}>
              {([
                { label:"Ganancia",  value: fmtMoney(hiloStats.profit),  color: hiloStats.profit >= 0 ? "#16ff5c" : "#ff5959" },
                { label:"Victorias", value: String(hiloStats.wins),       color:"#16ff5c" },
                { label:"Apostado",  value: fmtMoney(hiloStats.wagered),  color:"#d8e8f5" },
                { label:"Derrotas",  value: String(hiloStats.losses),     color:"#ff5959" },
              ] as { label:string; value:string; color:string }[]).map(s => (
                <div key={s.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ color:"#7a9db8", fontSize:"11.5px" }}>{s.label}</span>
                  <span style={{ color:s.color, fontWeight:500, fontSize:"13px" }}>{s.value}</span>
                </div>
              ))}
            </div>
            {/* Mini chart — cumulative profit (identical to Dice) */}
            {(()=>{
              const raw = hiloStats.history.length>0 ? hiloStats.history.slice().reverse() : null;
              const W=320, H=210, PAD_X=12, PAD_Y=20;
              const chartW = W-PAD_X*2, chartH = H-PAD_Y*2;
              interface HChartPt { cum:number; win:boolean; profit:number }
              let series: HChartPt[] = [];
              if (raw) {
                let running = 0;
                series = raw.map(p => { running += (p.profit??0); return { cum:running, win:p.win, profit:p.profit??0 }; });
              }
              const allPts: HChartPt[] = raw ? [{ cum:0, win:false, profit:0 }, ...series] : [];
              const n = allPts.length;
              const cums = allPts.map(p=>p.cum);
              const minC = Math.min(0, ...cums);
              const maxC = Math.max(0, ...cums);
              const range = maxC - minC || 1;
              const toX = (i:number) => PAD_X + i * (chartW / Math.max(n-1,1));
              const toY = (v:number) => PAD_Y + chartH - ((v - minC) / range) * chartH;
              const zeroY = toY(0);
              const xs = allPts.map((_,i)=>toX(i));
              const ys = allPts.map(p=>toY(p.cum));
              const hIdx = chartHover;
              const hpt = hIdx!==null && hIdx>0 && hIdx<allPts.length ? allPts[hIdx] : null;
              const hx = hIdx!==null ? xs[hIdx] : 0;
              const tipXpct = hIdx!==null && xs.length ? (xs[hIdx]/W)*100 : 0;
              const tipYpct = hIdx!==null && ys.length ? (ys[hIdx]/H)*100 : 0;
              const tipLeft = Math.min(Math.max(tipXpct, 12), 78);
              const tipTop  = Math.max(tipYpct - 14, 2);
              if (n < 2) return (
                <div style={{ marginTop:"10px", position:"relative", background:"#0a1520", borderRadius:"12px", height:"190px", display:"flex", alignItems:"center", justifyContent:"center", border:"1px solid #1a3347" }}>
                  <span style={{ color:"#2a4a6a", fontSize:"12px" }}>Sin historial</span>
                </div>
              );
              const linePath = xs.map((x,i)=>`${i===0?"M":"L"}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
              const fillAbove = linePath + ` L${xs[n-1].toFixed(1)} ${zeroY.toFixed(1)} L${xs[0].toFixed(1)} ${zeroY.toFixed(1)} Z`;
              const fillBelow = linePath + ` L${xs[n-1].toFixed(1)} ${zeroY.toFixed(1)} L${xs[0].toFixed(1)} ${zeroY.toFixed(1)} Z`;
              return (
                <div style={{ marginTop:"10px", position:"relative", background:"#0a1520", borderRadius:"12px", height:"190px", overflow:"visible", border:"1px solid #1a3347" }}>
                  {hpt && (
                    <div style={{
                      position:"absolute", left:`${tipLeft}%`, top:`${tipTop}%`,
                      transform:"translateX(-50%) translateY(-100%)",
                      background:"#1a2a3a", border:`1.5px solid ${hpt.profit>=0?"#19ff35":"#ff3350"}`,
                      borderRadius:"8px", padding:"4px 10px", fontSize:"12px", fontWeight:500,
                      color: hpt.profit>=0?"#19ff35":"#ff3350", whiteSpace:"nowrap",
                      pointerEvents:"none", zIndex:20,
                      boxShadow:`0 2px 12px ${hpt.profit>=0?"rgba(25,255,53,.3)":"rgba(255,51,80,.3)"}`,
                    }}>
                      {hpt.profit>=0?"+":""}{fmtMoney(hpt.profit)}
                      <span style={{ color:"#7a9db8", fontWeight:400, fontSize:"10px", marginLeft:"6px" }}>
                        acum: {hpt.cum>=0?"+":""}{fmtMoney(hpt.cum)}
                      </span>
                    </div>
                  )}
                  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width:"100%", height:"100%", display:"block", cursor:"crosshair" }}
                    onMouseMove={e=>{
                      if (!xs.length) return;
                      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
                      const svgX = ((e.clientX - rect.left) / rect.width) * W;
                      let closest = 0, minDist = Infinity;
                      xs.forEach((x,i)=>{ const d=Math.abs(x-svgX); if(d<minDist){ minDist=d; closest=i; } });
                      setChartHover(closest);
                    }}
                    onMouseLeave={()=>setChartHover(null)}
                  >
                    <defs>
                      <clipPath id="hiloClipAbove"><rect x={PAD_X} y={PAD_Y} width={chartW} height={zeroY-PAD_Y}/></clipPath>
                      <clipPath id="hiloClipBelow"><rect x={PAD_X} y={zeroY} width={chartW} height={chartH-(zeroY-PAD_Y)}/></clipPath>
                    </defs>
                    {n>1 ? <>
                      <path d={fillBelow} fill="rgba(200,30,30,.35)" clipPath="url(#hiloClipBelow)"/>
                      <path d={fillAbove} fill="rgba(25,255,80,.18)" clipPath="url(#hiloClipAbove)"/>
                      <line x1={PAD_X} y1={zeroY} x2={W-PAD_X} y2={zeroY} stroke="#2a4055" strokeWidth="1.5"/>
                      <path d={linePath} fill="none" stroke="#19ff35" strokeWidth="2.5" strokeLinejoin="miter" strokeLinecap="square" clipPath="url(#hiloClipAbove)"/>
                      <path d={linePath} fill="none" stroke="#e03030" strokeWidth="2.5" strokeLinejoin="miter" strokeLinecap="square" clipPath="url(#hiloClipBelow)"/>
                      <rect x={PAD_X} y={PAD_Y} width={chartW} height={chartH} fill="transparent"/>
                      {hIdx!==null && hIdx<allPts.length && (
                        <>
                          <line x1={xs[hIdx]} y1={PAD_Y} x2={xs[hIdx]} y2={H-PAD_Y} stroke="#3a5570" strokeWidth="1" strokeDasharray="4,3"/>
                          <circle cx={xs[hIdx]} cy={ys[hIdx]} r="5"
                            fill={allPts[hIdx].profit>=0?"#19ff35":"#ff3350"}
                            stroke="#0a1520" strokeWidth="2"
                            style={{ pointerEvents:"none" }}/>
                        </>
                      )}
                    </> : (
                      <line x1={PAD_X} y1={H/2} x2={W-PAD_X} y2={H/2} stroke="#2a4055" strokeWidth="1.5"/>
                    )}
                  </svg>
                </div>
              );
            })()}

            <button
              onClick={() => setHiloStats(hiloStatsDefault)}
              style={{
                width:"100%", marginTop:"8px", background:"transparent",
                border:"1px solid #1e3a52", borderRadius:"8px", color:"#7a9db8",
                fontSize:"12px", cursor:"pointer", padding:"6px 0",
                display:"flex", alignItems:"center", justifyContent:"center", gap:"6px",
                transition:"color .15s,border-color .15s,background .15s",
              }}
              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color="#fff"; b.style.borderColor="#3a8aff"; b.style.background="#0d1f30"; }}
              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color="#7a9db8"; b.style.borderColor="#1e3a52"; b.style.background="transparent"; }}
            >
              <span style={{ fontSize:"13px" }}>↺</span> Reiniciar estadísticas
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
