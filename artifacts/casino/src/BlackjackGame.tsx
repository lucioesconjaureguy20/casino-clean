import React, { useState, useEffect, useRef, useCallback } from "react";
import { gt } from "./lib/gameLabels";

// ── Types ─────────────────────────────────────────────────────────────────────
type Suit = "♠" | "♣" | "♥" | "♦";
type Rank = "A"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"|"10"|"J"|"Q"|"K";
export interface Card { suit: Suit; rank: Rank; hidden?: boolean; }

type BJPhase = "idle" | "dealing" | "player" | "dealer" | "result" | "insurance";

interface BJRecord {
  bet: number; payout: number;
  result: "win"|"lose"|"push"|"blackjack";
  playerTotal: number; dealerTotal: number;
  createdAt: string;
}

export interface BJStats {
  wins: number; losses: number; pushes: number; profit: number; wagered: number;
  history: { profit: number; win: boolean }[];
}
export const bjStatsDefault: BJStats = { wins:0, losses:0, pushes:0, profit:0, wagered:0, history:[] };

export interface BlackjackGameProps {
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
  bjStats: BJStats;
  setBjStats: React.Dispatch<React.SetStateAction<BJStats>>;
  currentUser?: string;
  onRequestLogin?: () => void;
  onGameActive?: (active: boolean) => void;
}

// ── Deck helpers ──────────────────────────────────────────────────────────────
function makeDeck(): Card[] {
  const suits: Suit[] = ["♠","♣","♥","♦"];
  const ranks: Rank[] = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const deck: Card[] = [];
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

function cardVal(rank: Rank): number {
  if (rank === "A") return 11;
  if (["J","Q","K"].includes(rank)) return 10;
  return parseInt(rank, 10);
}

function handScore(cards: Card[]): number {
  const visible = cards.filter(c => !c.hidden);
  let total = 0, aces = 0;
  for (const c of visible) {
    total += cardVal(c.rank);
    if (c.rank === "A") aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isBJ(cards: Card[]): boolean {
  if (cards.length !== 2) return false;
  const ranks = cards.map(c => c.rank);
  return ranks.includes("A") && ranks.some(r => ["10","J","Q","K"].includes(r));
}

function isRed(suit: Suit): boolean { return suit === "♥" || suit === "♦"; }

// ── Subcomponents ─────────────────────────────────────────────────────────────
function PlayingCard({
  card, animDelay = 0, small = false, fromX = 0, fromY = 0, flipping = false, faceDownOverride = false,
}: {
  card: Card; animDelay?: number; small?: boolean; fromX?: number; fromY?: number; flipping?: boolean; faceDownOverride?: boolean;
}) {
  const showHidden = card.hidden || faceDownOverride;
  const red = isRed(card.suit);
  const w = small ? 86 : 110;
  const h = small ? 126 : 162;
  return (
    <div className={flipping ? "bj-flip-anim" : undefined} style={{ flexShrink:0, display:"inline-block" }}>
    <div style={{
      width: `${w}px`, height: `${h}px`, borderRadius:"10px", flexShrink:0,
      position:"relative",
      background: showHidden
        ? "linear-gradient(135deg,#1e3d72 0%,#0d2248 50%,#0a1a38 100%)"
        : "#ffffff",
      border: showHidden ? "2px solid #2a5aaa" : "2px solid #d0d8ea",
      boxShadow: showHidden
        ? "0 6px 20px rgba(0,0,60,.5), inset 0 1px rgba(255,255,255,.1)"
        : "0 4px 18px rgba(0,0,0,.3), 0 1px 4px rgba(0,0,0,.15)",
      animation: `bjCardIn 0.32s cubic-bezier(0.08,0.6,0.2,1) ${animDelay}ms both`,
      display:"flex", alignItems:"center", justifyContent:"center",
      userSelect:"none",
      // CSS custom properties for the FROM position
      ["--fx" as string]: `${fromX}px`,
      ["--fy" as string]: `${fromY}px`,
    }}>
      {showHidden ? (
        <>
          <div style={{
            position:"absolute", inset:"5px", borderRadius:"6px",
            background:"repeating-linear-gradient(45deg,#1a4080 0px,#1a4080 4px,#0e2855 4px,#0e2855 8px)",
            opacity:0.5, border:"1px solid rgba(255,255,255,.08)"
          }} />
          <img src="/mander-logo.png" alt="Mander"
            style={{
              position:"absolute", width: small ? "66px" : "90px",
              filter:"brightness(0) invert(1)", opacity:0.9,
              left:"50%", top:"50%", transform:"translate(-50%,-50%)",
              objectFit:"contain", pointerEvents:"none",
            }}
          />
        </>
      ) : (
        <>
          <span style={{
            position:"absolute", top:"5px", left:"7px",
            fontSize: small ? "13px" : "16px", fontWeight:900,
            color: red ? "#cc1a1a" : "#111",
            lineHeight:1.1, display:"flex", flexDirection:"column", alignItems:"center"
          }}>
            <span>{card.rank}</span>
            <span style={{ fontSize: small ? "11px" : "13px" }}>{card.suit}</span>
          </span>
          <span style={{ fontSize: small ? "26px" : "34px", color: red ? "#cc1a1a" : "#111", lineHeight:1 }}>
            {card.suit}
          </span>
          <span style={{
            position:"absolute", bottom:"5px", right:"7px",
            fontSize: small ? "13px" : "16px", fontWeight:900,
            color: red ? "#cc1a1a" : "#111",
            lineHeight:1.1, display:"flex", flexDirection:"column", alignItems:"center",
            transform:"rotate(180deg)"
          }}>
            <span>{card.rank}</span>
            <span style={{ fontSize: small ? "11px" : "13px" }}>{card.suit}</span>
          </span>
        </>
      )}
    </div>
    </div>
  );
}

function ScoreBadge({ score, bust, bj, win, lose, push, label, payout, fmtMoney }: {
  score: number; bust: boolean; bj?: boolean; win?: boolean; lose?: boolean; push?: boolean;
  label?: string; payout?: number; fmtMoney?: (n:number)=>string;
}) {
  // Score (left) background
  const scoreBg = win ? "#15803d" : lose ? "#991b1b" : push ? "#a16207" :
                  bj ? "#d97706" : bust ? "#991b1b" : score === 21 ? "#15803d" : "rgba(10,20,40,.85)";
  // Label (right) background — slightly brighter/lighter version
  const labelBg = win ? "#22c55e" : lose ? "#dc2626" : push ? "#eab308" :
                  bj ? "#f59e0b" : bust ? "#dc2626" : score === 21 ? "#22c55e" : "rgba(20,35,60,.9)";
  // Text color
  const scoreColor = win ? "#fff" : lose ? "#fff" : push ? "#000" :
                     bj || bust || score === 21 ? "#000" : "#fff";
  const labelColor = push ? "#000" : scoreColor;
  // Border
  const border = win ? "#22c55e" : lose ? "#dc2626" : push ? "#eab308" :
                 bj ? "#f59e0b" : bust ? "#dc2626" : score === 21 ? "#22c55e" : "rgba(255,255,255,.18)";
  const anim = win ? "bjWinPop 0.5s cubic-bezier(0.34,1.56,0.64,1) both" :
               lose ? "bjLosePop 0.4s cubic-bezier(0.34,1.56,0.64,1) both" :
               push ? "bjWinPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both" :
               bj || bust ? "bjScorePop 0.4s cubic-bezier(0.34,1.56,0.64,1) both" : undefined;
  const displayLabel = bj ? "Blackjack" : (label ?? undefined);
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"4px" }}>
      <div style={{
        display:"inline-flex", alignItems:"stretch", borderRadius:"20px",
        border:`1px solid ${border}`,
        backdropFilter:"blur(4px)", boxShadow:"0 2px 12px rgba(0,0,0,.35)",
        transition:"border-color 0.45s ease, box-shadow 0.45s ease",
      }}>
        <div style={{
          background: scoreBg, color: scoreColor, fontWeight:500, fontSize:"15px",
          padding:"5px 14px", minWidth:"44px", textAlign:"center",
          borderRadius: displayLabel ? "20px 0 0 20px" : "20px",
          animation: anim,
          transition:"background 0.45s ease, color 0.35s ease, border-radius 0.3s ease",
        }}>
          {score}
        </div>
        {displayLabel && (
          <div style={{
            background: labelBg, color: labelColor, fontWeight:500, fontSize:"13px",
            borderLeft:`1px solid rgba(0,0,0,.15)`,
            display:"flex", alignItems:"center", whiteSpace:"nowrap", overflow:"hidden",
            borderRadius:"0 20px 20px 0",
            animation:"bjLabelIn 0.5s 0.2s cubic-bezier(0.22,1,0.36,1) both",
            transition:"background 0.45s ease, color 0.35s ease",
          }}>
            {displayLabel}
          </div>
        )}
      </div>
      {payout !== undefined && fmtMoney && (
        <div style={{
          fontSize:"13px", fontWeight:500,
          color: payout > 0 ? "#22c55e" : "#dc2626",
          animation:"bjWinPop 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
        }}>
          {payout >= 0 ? "+" : ""}{fmtMoney(payout)}
        </div>
      )}
    </div>
  );
}

// ── Deck pile visual ──────────────────────────────────────────────────────────
function DeckPile({ deckRef }: { deckRef: React.RefObject<HTMLDivElement | null> }) {
  const cardW = 72, cardH = 106;
  return (
    <div ref={deckRef} style={{
      position:"absolute", top:"22px", right:"22px", zIndex:10,
      width:`${cardW}px`, height:`${cardH}px`,
    }}>
      {/* Stacked card backs */}
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
      {/* Label below */}
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

// ── Main component ────────────────────────────────────────────────────────────
export default function BlackjackGame({
  balance, fmtMoney, convertUsd, displayCurrency, currencyFade,
  onBack, onBalanceChange, addBet, onBetRecord, liveRates, lang: _lang,
  bjStats = bjStatsDefault, setBjStats = () => {},
  currentUser, onRequestLogin, onGameActive,
}: BlackjackGameProps) {
  const T = (k: string) => gt(_lang, k);

  const [betDisplay, setBetDisplay]   = useState("1.00");
  const [phase, setPhase]             = useState<BJPhase>("idle");
  const [dealerHand, setDealerHand]   = useState<Card[]>([]);
  const [flippingKey, setFlippingKey] = useState<string | null>(null);
  const [revealPendingKeys, setRevealPendingKeys] = useState<string[]>([]);
  const revealPendingRef = useRef<string[]>([]);
  const [flipRevealKeys, setFlipRevealKeys] = useState<string[]>([]);
  const flipRevealRef = useRef<string[]>([]);
  const [playerHand, setPlayerHand]   = useState<Card[]>([]);
  const [splitHand, setSplitHand]     = useState<Card[]>([]);
  const [isSplit, setIsSplit]         = useState(false);
  const [activeIdx, setActiveIdx]     = useState<0|1>(0);
  const [result, setResult]           = useState<"win"|"lose"|"push"|"blackjack"|null>(null);
  const [splitResult, setSplitResult] = useState<"win"|"lose"|"push"|null>(null);
  const [history, setHistory]         = useState<BJRecord[]>([]);
  const [animKey, setAnimKey]         = useState(0);
  const [lastPayout, setLastPayout]   = useState(0);
  // Map from card key → FROM offset (deck position relative to card's natural position)
  const [cardOffsets, setCardOffsets] = useState<Record<string, { fx: number; fy: number }>>({});

  // ── Sound / Stats / UI controls ───────────────────────────────────────────
  const [bjVol, setBjVol]       = useState(70);
  const bjVolRef                 = useRef(70);
  bjVolRef.current               = bjVol;
  // Single persistent AudioContext — avoids browser per-context limits that cause BJ sound freeze
  const bjAudioCtxRef            = useRef<AudioContext | null>(null);
  const [showVol, setShowVol]    = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [statsPos, setStatsPos]  = useState({ x: 300, y: 180 });
  const statsDragOffset          = useRef({ x: 0, y: 0 });
  const [chartHoverBJ, setChartHoverBJ] = useState<number|null>(null);
  // Insurance state
  const [insuranceBet, setInsuranceBet]       = useState(0);
  const insuranceBetRef                        = useRef(0);
  const [insuranceResult, setInsuranceResult] = useState<"won"|"lost"|null>(null);
  const bjStatsRef = useRef<BJStats>(bjStats);
  // Keep ref in sync so async callbacks always read the latest accumulated stats
  useEffect(() => { bjStatsRef.current = bjStats; }, [bjStats]);
  // Notify parent whether a round is actively in progress (result/idle = unlocked)
  useEffect(() => { onGameActive?.(phase === "player" || phase === "dealer" || phase === "insurance"); }, [phase]);

  // Refs for values needed inside async dealer-play callbacks
  const localBalRef   = useRef(balance);
  const deckRef       = useRef<Card[]>([]);
  const dealerRef     = useRef<Card[]>([]);
  const playerRef     = useRef<Card[]>([]);
  const splitRef      = useRef<Card[]>([]);
  const mainBetRef    = useRef(0);
  const splitBetRef   = useRef(0);
  const isSplitRef    = useRef(false);
  const activeIdxRef  = useRef<0|1>(0);
  const timerRef      = useRef<ReturnType<typeof setTimeout>|null>(null);
  const dealTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const animKeyRef    = useRef(0);
  const dealingRef    = useRef(false); // true during the 840ms deal animation

  // DOM refs for measuring positions during deal animation
  const deckPileRef   = useRef<HTMLDivElement>(null);
  const tableAreaRef  = useRef<HTMLDivElement>(null);

  // Keep localBalRef in sync with the prop (handles external balance changes)
  useEffect(() => { localBalRef.current = balance; }, [balance]);

  // ── Persist in-progress hand to localStorage ──────────────────────────────
  const BJ_SAVE_KEY = "bj_game_state";

  // Save whenever the active hand changes
  useEffect(() => {
    if (phase === "idle") {
      // Don't clear on the initial render before the restore effect has had a chance to run
      if (!restoredRef.current) return;
      localStorage.removeItem(BJ_SAVE_KEY);
      return;
    }
    // Only persist while a hand is in progress (not after result is dismissed)
    try {
      localStorage.setItem(BJ_SAVE_KEY, JSON.stringify({
        phase,
        playerHand,
        dealerHand,
        splitHand,
        deck: deckRef.current,
        mainBet: mainBetRef.current,
        splitBet: splitBetRef.current,
        isSplit,
        activeIdx,
        insuranceBet,
        insuranceResult,
        result,
        splitResult,
        betDisplay,
      }));
    } catch { /* quota exceeded — ignore */ }
  }, [phase, playerHand, dealerHand, splitHand, isSplit, activeIdx, insuranceBet, insuranceResult, result, splitResult, betDisplay]);

  // Restore on mount if a hand was in progress
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(BJ_SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s || !s.phase || s.phase === "idle") return;

      // Reconstruct deck ref early — needed for dealing-phase completion
      deckRef.current = s.deck || [];
      mainBetRef.current = s.mainBet || 0;
      splitBetRef.current = s.splitBet || 0;
      isSplitRef.current = s.isSplit || false;
      activeIdxRef.current = s.activeIdx || 0;
      insuranceBetRef.current = s.insuranceBet || 0;

      // If interrupted during deal animation, complete the hand reconstruction
      // so the player can continue from where they left off (cards appear instantly)
      if (s.phase === "dealing") {
        const deck: Card[] = [...deckRef.current];
        // Fill any missing player cards (need exactly 2)
        const pHand: Card[] = [...(s.playerHand || [])];
        while (pHand.length < 2 && deck.length > 0) pHand.push(deck.shift()!);
        // Fill any missing dealer cards (need exactly 2)
        const dHand: Card[] = [...(s.dealerHand || [])];
        while (dHand.length < 1 && deck.length > 0) dHand.push(deck.shift()!);
        if (dHand.length < 2 && deck.length > 0) dHand.push({ ...deck.shift()!, hidden: true });
        // Ensure dealer's second card is hidden if not already
        if (dHand.length === 2 && dHand[1].hidden === undefined) dHand[1] = { ...dHand[1], hidden: true };

        deckRef.current = deck;
        playerRef.current = pHand;
        dealerRef.current = dHand;
        splitRef.current = [];

        setPlayerHand(pHand);
        setDealerHand(dHand);
        setSplitHand([]);
        setIsSplit(false);
        setActiveIdx(0);
        setInsuranceBet(0);
        setInsuranceResult(null);
        setResult(null);
        setSplitResult(null);
        if (s.betDisplay) setBetDisplay(s.betDisplay);
        // Deduct balance locally so display is accurate during restored hand
        if (s.mainBet > 0) deductBal(s.mainBet);

        // Determine which phase to enter (mirrors end-of-deal logic)
        if (pHand.length === 2 && isBJ(pHand)) {
          // Player has blackjack — reveal dealer and resolve immediately
          const fullDealer = dHand.map(c => ({ ...c, hidden: false }));
          dealerRef.current = fullDealer;
          setDealerHand(fullDealer);
          if (isBJ(fullDealer)) {
            creditBal(s.mainBet);
            addBet(s.mainBet, s.mainBet, "Blackjack");
            addRecord(s.mainBet, s.mainBet, "push", 21, handScore(fullDealer));
            setResult("push"); setLastPayout(0); setPhase("result");
          } else {
            const payout = +(s.mainBet * 2.5).toFixed(8);
            creditBal(payout);
            addBet(s.mainBet, payout, "Blackjack");
            addRecord(s.mainBet, payout, "blackjack", 21, handScore(fullDealer));
            setResult("blackjack"); setLastPayout(payout - s.mainBet); setPhase("result");
          }
        } else if (dHand[0]?.rank === "A") {
          setPhase("insurance");
        } else {
          setPhase("player");
        }
        return;
      }

      // Non-dealing phases: restore state as-is
      playerRef.current  = s.playerHand || [];
      dealerRef.current  = s.dealerHand || [];
      splitRef.current   = s.splitHand  || [];

      // Restore state (no card-fly animations — cards just appear)
      setPlayerHand(s.playerHand || []);
      setDealerHand(s.dealerHand || []);
      setSplitHand(s.splitHand   || []);
      setIsSplit(s.isSplit       || false);
      setActiveIdx(s.activeIdx   || 0);
      setInsuranceBet(s.insuranceBet || 0);
      setInsuranceResult(s.insuranceResult || null);
      setResult(s.result         || null);
      setSplitResult(s.splitResult || null);
      if (s.betDisplay) setBetDisplay(s.betDisplay);
      // Deduct balance locally for in-progress hands so display is accurate
      if (s.mainBet > 0 && s.phase !== "result") deductBal(s.mainBet);

      // If navigated away mid-dealer-play, trigger dealer play again
      if (s.phase === "dealer") {
        setPhase("dealer");
        setTimeout(() => triggerDealerPlay(), 400);
      } else {
        setPhase(s.phase);
      }
    } catch { localStorage.removeItem(BJ_SAVE_KEY); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Recalculate betDisplay when display currency changes ──────────────────
  // Same logic as dice/plinko/keno in App.tsx: multiply by ratio new/old rate
  const bjPrevRateRef  = useRef<number>(liveRates[displayCurrency] || 1);
  const bjFirstCurrRef = useRef(true);
  useEffect(() => {
    if (bjFirstCurrRef.current) {
      bjFirstCurrRef.current = false;
      bjPrevRateRef.current = liveRates[displayCurrency] || 1;
      return;
    }
    const oldRate = bjPrevRateRef.current;
    const newRate = liveRates[displayCurrency] || 1;
    bjPrevRateRef.current = newRate;
    const ratio = newRate / oldRate;
    if (!isFinite(ratio) || ratio === 1 || oldRate <= 0) return;
    setBetDisplay(v => {
      const n = parseFloat(v) || 0;
      return n > 0 ? (Math.round(n * ratio * 100) / 100).toFixed(2) : v;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayCurrency]);

  const rate           = liveRates[displayCurrency] || 1;
  const betNum         = parseFloat(betDisplay) || 0;
  const betUsd         = betNum / rate;
  const maxBetDisplay  = +(Math.floor(convertUsd(balance) * 100) / 100).toFixed(2);
  const minBetDisplay  = +(Math.ceil(convertUsd(0.01) * 100) / 100).toFixed(2);
  const betInvalid     = betNum < minBetDisplay - 0.001;
  const balInsuff      = betNum > maxBetDisplay + 0.001;

  // Balance helpers
  function deductBal(usd: number) {
    localBalRef.current -= usd;
    onBalanceChange(localBalRef.current);
  }
  function creditBal(usd: number) {
    localBalRef.current += usd;
    onBalanceChange(localBalRef.current);
  }

  // History helper
  function addRecord(bet: number, payout: number, res: BJRecord["result"], ps: number, ds: number) {
    setHistory(prev => [{ bet, payout, result:res, playerTotal:ps, dealerTotal:ds, createdAt:new Date().toISOString() }, ...prev].slice(0, 50));
  }

  // ── Compute FROM offset for a card flying from the deck ────────────────────
  function getCardFromOffset(isDealer: boolean, cardIdx: number, totalInHand: number): { fx: number; fy: number } {
    if (!deckPileRef.current || !tableAreaRef.current) return { fx: 0, fy: 0 };

    const deckRect  = deckPileRef.current.getBoundingClientRect();
    const tableRect = tableAreaRef.current.getBoundingClientRect();

    // Deck center position relative to table top-left
    const deckCX = deckRect.left - tableRect.left + deckRect.width  / 2;
    const deckCY = deckRect.top  - tableRect.top  + deckRect.height / 2;

    // Approximate card center in the hand
    const cardW = 82, cardH = 118, gap = 10;
    const handW = totalInHand * cardW + (totalInHand - 1) * gap;
    const cardCX = tableRect.width / 2 - handW / 2 + cardIdx * (cardW + gap) + cardW / 2;

    // Dealer cards sit ~120px from table top; player cards ~90px from table bottom
    const dealerCY  = 32 + 20 + 10 + cardH / 2;          // paddingTop + label + gap + half-card ≈ 121
    const playerCY  = tableRect.height - 90 - cardH / 2;  // paddingBottom area ≈ table_h - 149

    const cardCY = isDealer ? dealerCY : playerCY;

    return { fx: deckCX - cardCX, fy: deckCY - cardCY };
  }

  // ── Sound ─────────────────────────────────────────────────────────────────
  // Uses ONE persistent AudioContext for all sounds — avoids the browser cap on concurrent
  // contexts (Chrome ~6) that caused the BJ fanfare to freeze after 4 deal sounds.
  const playBJSound = useCallback((type: "deal"|"hit"|"win"|"lose"|"push"|"bj") => {
    if (bjVolRef.current === 0) return;
    try {
      // Create or reuse the shared context
      if (!bjAudioCtxRef.current || bjAudioCtxRef.current.state === "closed") {
        bjAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = bjAudioCtxRef.current;
      // Resume in case browser auto-suspended it (policy requires user gesture)
      if (ctx.state === "suspended") ctx.resume();

      const vol = bjVolRef.current / 100;
      const g = ctx.createGain();
      g.connect(ctx.destination);
      const now = ctx.currentTime;

      if (type === "deal" || type === "hit") {
        // Card swish — short noise burst
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random()*2-1) * (1 - i/data.length);
        const src = ctx.createBufferSource();
        const lp = ctx.createBiquadFilter(); lp.type = "bandpass"; lp.frequency.value = 3500; lp.Q.value = 0.8;
        src.buffer = buf; src.connect(lp); lp.connect(g);
        g.gain.setValueAtTime(0.18 * vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        src.start(now); src.stop(now + 0.09);
      } else if (type === "win") {
        [0,4,7,12].forEach((semi, i) => {
          const osc = ctx.createOscillator();
          osc.type = "triangle"; osc.frequency.value = 440 * Math.pow(2, semi/12);
          const og = ctx.createGain(); og.connect(ctx.destination);
          const t = now + i * 0.09;
          og.gain.setValueAtTime(0.22 * vol, t);
          og.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
          osc.connect(og); osc.start(t); osc.stop(t + 0.19);
        });
      } else if (type === "bj") {
        // 5-note fanfare — each note gets its own gain node so they don't fight over one gain
        [0,4,7,12,16].forEach((semi, i) => {
          const osc = ctx.createOscillator();
          osc.type = "sine"; osc.frequency.value = 523 * Math.pow(2, semi/12);
          const og = ctx.createGain(); og.connect(ctx.destination);
          const t = now + i * 0.1;
          og.gain.setValueAtTime(0.28 * vol, t);
          og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(og); osc.start(t); osc.stop(t + 0.23);
        });
        g.disconnect(); // shared g not used for bj/win
        return;
      } else if (type === "lose") {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth"; osc.frequency.setValueAtTime(330, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.35);
        osc.connect(g);
        g.gain.setValueAtTime(0.2 * vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now); osc.stop(now + 0.36);
      } else if (type === "push") {
        const osc = ctx.createOscillator();
        osc.type = "sine"; osc.frequency.value = 400;
        osc.connect(g);
        g.gain.setValueAtTime(0.15 * vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now); osc.stop(now + 0.26);
      }
      // No ctx.close() — context is reused across all sounds
    } catch {}
  }, []);

  // ── Stats drag ─────────────────────────────────────────────────────────────
  function handleStatsDragStart(e: React.MouseEvent) {
    statsDragOffset.current = { x: e.clientX - statsPos.x, y: e.clientY - statsPos.y };
    const onMove = (ev: MouseEvent) => setStatsPos({ x: ev.clientX - statsDragOffset.current.x, y: ev.clientY - statsDragOffset.current.y });
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ── Clear deal timers ──────────────────────────────────────────────────────
  function clearDealTimers() {
    dealTimersRef.current.forEach(t => clearTimeout(t));
    dealTimersRef.current = [];
    dealingRef.current = false;
  }

  // ── Queue a face-down → flip → face-up reveal for a card key ───────────────
  function queueReveal(key: string) {
    // Show face-down immediately
    revealPendingRef.current = [...revealPendingRef.current, key];
    setRevealPendingKeys([...revealPendingRef.current]);
    // After bjCardIn animation (320ms) + buffer (80ms), start flip
    dealTimersRef.current.push(setTimeout(() => {
      flipRevealRef.current = [...flipRevealRef.current, key];
      setFlipRevealKeys([...flipRevealRef.current]);
      // At ~42% of the 440ms flip (185ms), swap to face-up content
      dealTimersRef.current.push(setTimeout(() => {
        revealPendingRef.current = revealPendingRef.current.filter(k => k !== key);
        setRevealPendingKeys([...revealPendingRef.current]);
        // After flip finishes, remove flip class
        dealTimersRef.current.push(setTimeout(() => {
          flipRevealRef.current = flipRevealRef.current.filter(k => k !== key);
          setFlipRevealKeys([...flipRevealRef.current]);
        }, 260));
      }, 185));
    }, 400));
  }

  // ── Deal ──────────────────────────────────────────────────────────────────
  const deal = useCallback(() => {
    if (!currentUser) { onRequestLogin?.(); return; }
    if (phase === "player" || phase === "dealer" || phase === "dealing" || dealingRef.current) return;
    if (betUsd > localBalRef.current + 0.0001 || betUsd < 0.0099) return;

    // Mark as dealing immediately so localStorage captures a non-idle phase,
    // preventing re-bets if the user navigates away during animation.
    setPhase("dealing");

    if (timerRef.current) clearTimeout(timerRef.current);
    clearDealTimers();

    const newDeck = shuffled(makeDeck());
    const p: Card[] = [newDeck[0], newDeck[2]];
    const d: Card[] = [newDeck[1], { ...newDeck[3], hidden:true }];

    deckRef.current      = newDeck.slice(4);
    playerRef.current    = p;
    splitRef.current     = [];
    dealerRef.current    = d;
    mainBetRef.current   = betUsd;
    splitBetRef.current  = 0;
    isSplitRef.current   = false;
    activeIdxRef.current = 0;

    // Compute next animKey synchronously
    const nextKey = animKeyRef.current + 1;
    animKeyRef.current = nextKey;

    setAnimKey(nextKey);
    setPlayerHand([]);
    setDealerHand([]);
    setSplitHand([]);
    setIsSplit(false);
    setActiveIdx(0);
    setResult(null);
    setSplitResult(null);
    setLastPayout(0);
    setCardOffsets({});
    revealPendingRef.current = [];
    setRevealPendingKeys([]);
    flipRevealRef.current = [];
    setFlipRevealKeys([]);
    dealingRef.current = true;

    deductBal(betUsd);

    const INTERVAL = 280; // ms between each dealt card

    // Measure offsets synchronously before any timeouts
    const offsets = {
      p0: getCardFromOffset(false, 0, 2),
      d0: getCardFromOffset(true,  0, 2),
      p1: getCardFromOffset(false, 1, 2),
      d1: getCardFromOffset(true,  1, 2),
    };

    // Card 1: player's first card
    dealTimersRef.current.push(setTimeout(() => {
      playBJSound("deal");
      setCardOffsets(prev => ({ ...prev, [`${nextKey}-p0`]: offsets.p0 }));
      setPlayerHand([p[0]]);
      queueReveal(`${nextKey}-p0`);
    }, 0));

    // Card 2: dealer's first card
    dealTimersRef.current.push(setTimeout(() => {
      playBJSound("deal");
      setCardOffsets(prev => ({ ...prev, [`${nextKey}-d0`]: offsets.d0 }));
      setDealerHand([d[0]]);
      queueReveal(`${nextKey}-d0`);
    }, INTERVAL));

    // Card 3: player's second card
    dealTimersRef.current.push(setTimeout(() => {
      playBJSound("deal");
      setCardOffsets(prev => ({ ...prev, [`${nextKey}-p1`]: offsets.p1 }));
      setPlayerHand([p[0], p[1]]);
      queueReveal(`${nextKey}-p1`);
    }, INTERVAL * 2));

    // Card 4: dealer's hidden card, then resolve BJ or start player phase
    dealTimersRef.current.push(setTimeout(() => {
      playBJSound("deal");
      setCardOffsets(prev => ({ ...prev, [`${nextKey}-d1`]: offsets.d1 }));
      setDealerHand(d);
      // Only reveal d1 if not hidden (it's the dealer's visible card when BJ or revealed)
      if (!d[1]?.hidden) queueReveal(`${nextKey}-d1`);

      dealingRef.current = false;
      if (isBJ(p)) {
        const fullDealer = d.map(c => ({...c, hidden:false}));
        dealerRef.current = fullDealer;
        setDealerHand(fullDealer);
        // Delay so deal sound fully clears before BJ sound triggers, avoiding glitch/freeze
        setTimeout(() => {
          if (isBJ(fullDealer)) {
            playBJSound("push");
            creditBal(betUsd);
            addBet(betUsd, betUsd, "Blackjack");
            onBetRecord?.(betUsd, 1, false, betUsd);
            addRecord(betUsd, betUsd, "push", 21, handScore(fullDealer));
            bjStatsRef.current = { ...bjStatsRef.current, pushes: bjStatsRef.current.pushes+1, wagered: bjStatsRef.current.wagered+betUsd, history: [...bjStatsRef.current.history, {profit:0, win:false}] };
            setBjStats({ ...bjStatsRef.current });
            setResult("push"); setLastPayout(0); setPhase("result");
          } else {
            playBJSound("bj");
            const payout = +(betUsd * 2.5).toFixed(8);
            creditBal(payout);
            addBet(betUsd, payout, "Blackjack");
            onBetRecord?.(betUsd, 2.5, true, payout);
            addRecord(betUsd, payout, "blackjack", 21, handScore(fullDealer));
            bjStatsRef.current = { ...bjStatsRef.current, wins: bjStatsRef.current.wins+1, profit: bjStatsRef.current.profit+(payout-betUsd), wagered: bjStatsRef.current.wagered+betUsd, history: [...bjStatsRef.current.history, {profit:payout-betUsd, win:true}] };
            setBjStats({ ...bjStatsRef.current });
            setResult("blackjack"); setLastPayout(payout - betUsd); setPhase("result");
          }
        }, 320);
      } else if (d[0].rank === "A") {
        // Dealer's face-up card is an Ace → offer insurance before player acts
        insuranceBetRef.current = 0;
        setInsuranceBet(0);
        setInsuranceResult(null);
        setPhase("insurance");
      } else {
        setPhase("player");
      }
    }, INTERVAL * 3));

  }, [phase, betUsd, liveRates, displayCurrency]);

  // ── Player: Hit ──────────────────────────────────────────────────────────
  function hit() {
    if (phase !== "player") return;
    playBJSound("hit");
    const card = deckRef.current.shift()!;
    const ak = animKeyRef.current;

    if (activeIdxRef.current === 0) {
      const newHand = [...playerRef.current, card];
      playerRef.current = newHand;
      const idx = newHand.length - 1;
      const off = getCardFromOffset(false, idx, newHand.length);
      setCardOffsets(prev => ({ ...prev, [`${ak}-p${idx}`]: off }));
      setPlayerHand([...newHand]);
      queueReveal(`${ak}-p${idx}`);
      if (handScore(newHand) >= 21) {
        if (isSplitRef.current) { switchToSplitHand(); }
        else { triggerDealerPlay(); }
      }
    } else {
      const newHand = [...splitRef.current, card];
      splitRef.current = newHand;
      const idx = newHand.length - 1;
      const off = getCardFromOffset(false, idx, newHand.length);
      setCardOffsets(prev => ({ ...prev, [`${ak}-s${idx}`]: off }));
      setSplitHand([...newHand]);
      queueReveal(`${ak}-s${idx}`);
      if (handScore(newHand) >= 21) triggerDealerPlay();
    }
  }

  // ── Player: Stand ─────────────────────────────────────────────────────────
  function stand() {
    if (phase !== "player") return;
    if (isSplitRef.current && activeIdxRef.current === 0) {
      switchToSplitHand();
    } else {
      triggerDealerPlay();
    }
  }

  // ── Insurance ─────────────────────────────────────────────────────────────
  function takeInsurance() {
    if (phase !== "insurance") return;
    const insBet = +(mainBetRef.current / 2).toFixed(8);
    insuranceBetRef.current = insBet;
    setInsuranceBet(insBet);
    deductBal(insBet);

    // Peek at dealer's hidden card
    const fullDealer = dealerRef.current.map(c => ({ ...c, hidden: false }));

    if (isBJ(fullDealer)) {
      // Insurance wins 2:1 — reveal dealer cards, resolve hand
      dealerRef.current = fullDealer;
      setDealerHand(fullDealer);
      setInsuranceResult("won");
      setTimeout(() => {
        // Insurance payout: insBet × 3 (stake returned + 2:1 profit)
        // Main bet is forfeited (dealer BJ beats player)
        const insPayout = +(insBet * 3).toFixed(8);
        creditBal(insPayout);
        const netProfit = +(insPayout - insBet - mainBetRef.current).toFixed(8); // break-even = 0
        addBet(mainBetRef.current + insBet, insPayout, "Blackjack");
        addRecord(mainBetRef.current, insPayout - insBet, "lose", handScore(playerRef.current), handScore(fullDealer));
        bjStatsRef.current = {
          ...bjStatsRef.current,
          losses:  bjStatsRef.current.losses + 1,
          profit:  +(bjStatsRef.current.profit + netProfit).toFixed(8),
          wagered: +(bjStatsRef.current.wagered + mainBetRef.current + insBet).toFixed(8),
          history: [...bjStatsRef.current.history, { profit: netProfit, win: false }],
        };
        setBjStats({ ...bjStatsRef.current });
        playBJSound("push");
        setLastPayout(netProfit);
        setResult("lose");
        setPhase("result");
      }, 700);
    } else {
      // Insurance loses — brief feedback, then start player phase
      setInsuranceResult("lost");
      setTimeout(() => {
        setInsuranceResult(null);
        setPhase("player");
      }, 1100);
    }
  }

  function declineInsurance() {
    if (phase !== "insurance") return;
    setPhase("player");
  }

  function switchToSplitHand() {
    activeIdxRef.current = 1;
    setActiveIdx(1);
  }

  // ── Player: Double ────────────────────────────────────────────────────────
  function doubleDown() {
    if (phase !== "player") return;
    if (activeIdxRef.current === 0 && playerRef.current.length !== 2) return;
    if (localBalRef.current < mainBetRef.current - 0.0001) return;
    deductBal(mainBetRef.current);
    mainBetRef.current *= 2;
    const card = deckRef.current.shift()!;
    const newHand = [...playerRef.current, card];
    playerRef.current = newHand;
    const ak = animKeyRef.current;
    const idx = newHand.length - 1;
    const off = getCardFromOffset(false, idx, newHand.length);
    setCardOffsets(prev => ({ ...prev, [`${ak}-p${idx}`]: off }));
    setPlayerHand([...newHand]);
    queueReveal(`${ak}-p${idx}`);
    triggerDealerPlay();
  }

  // ── Player: Split ─────────────────────────────────────────────────────────
  function splitCards() {
    if (phase !== "player") return;
    if (playerRef.current.length !== 2) return;
    if (playerRef.current[0].rank !== playerRef.current[1].rank) return;
    if (localBalRef.current < mainBetRef.current - 0.0001) return;

    deductBal(mainBetRef.current);
    splitBetRef.current = mainBetRef.current;
    isSplitRef.current = true;

    const [c1, c2] = playerRef.current;
    const e1 = deckRef.current.shift()!;
    const e2 = deckRef.current.shift()!;
    playerRef.current = [c1, e1];
    splitRef.current  = [c2, e2];

    setPlayerHand([c1, e1]);
    setSplitHand([c2, e2]);
    setIsSplit(true);
    activeIdxRef.current = 0;
    setActiveIdx(0);
  }

  // ── Dealer play ──────────────────────────────────────────────────────────
  function triggerDealerPlay() {
    setPhase("dealer");
    const hiddenIdx = dealerRef.current.findIndex(c => c.hidden);
    if (hiddenIdx >= 0) {
      const flipKey = `${animKeyRef.current}-d${hiddenIdx}`;
      setFlippingKey(flipKey);
      // At ~50% of flip animation, reveal the card face
      timerRef.current = setTimeout(() => {
        const revealed = dealerRef.current.map(c => ({...c, hidden:false}));
        dealerRef.current = revealed;
        setDealerHand([...revealed]);
      }, 185);
      // After flip completes, clear and start dealer step
      timerRef.current = setTimeout(() => {
        setFlippingKey(null);
        timerRef.current = setTimeout(dealerStep, 180);
      }, 440);
    } else {
      const revealed = dealerRef.current.map(c => ({...c, hidden:false}));
      dealerRef.current = revealed;
      setDealerHand([...revealed]);
      timerRef.current = setTimeout(dealerStep, 650);
    }
  }

  function dealerStep() {
    const score = handScore(dealerRef.current);
    if (score >= 17) { settle(); return; }
    playBJSound("hit");
    const card = deckRef.current.shift()!;
    const newHand = [...dealerRef.current, card];
    const ak = animKeyRef.current;
    const idx = newHand.length - 1;
    const off = getCardFromOffset(true, idx, newHand.length);
    setCardOffsets(prev => ({ ...prev, [`${ak}-d${idx}`]: off }));
    dealerRef.current = newHand;
    setDealerHand([...newHand]);
    queueReveal(`${ak}-d${idx}`);
    timerRef.current = setTimeout(dealerStep, 650);
  }

  // ── Settle result ─────────────────────────────────────────────────────────
  function settle() {
    const ds = handScore(dealerRef.current);
    const dealerBust = ds > 21;

    const ps = handScore(playerRef.current);
    const pBust = ps > 21;
    let mainRes: BJRecord["result"] = "push";
    let mainPay = 0;
    if (pBust)                           { mainRes = "lose"; mainPay = 0; }
    else if (dealerBust || ps > ds)      { mainRes = "win";  mainPay = mainBetRef.current * 2; }
    else if (ps === ds)                  { mainRes = "push"; mainPay = mainBetRef.current; }
    else                                 { mainRes = "lose"; mainPay = 0; }

    // Play sound
    if (mainRes === "win") playBJSound("win");
    else if (mainRes === "lose") playBJSound("lose");
    else playBJSound("push");

    // Track stats
    const net = mainPay - mainBetRef.current;
    bjStatsRef.current = {
      wins: bjStatsRef.current.wins + (mainRes === "win" ? 1 : 0),
      losses: bjStatsRef.current.losses + (mainRes === "lose" ? 1 : 0),
      pushes: bjStatsRef.current.pushes + (mainRes === "push" ? 1 : 0),
      profit: bjStatsRef.current.profit + net,
      wagered: bjStatsRef.current.wagered + mainBetRef.current,
      history: [...bjStatsRef.current.history, { profit: net, win: mainRes === "win" }],
    };
    setBjStats({ ...bjStatsRef.current });

    creditBal(mainPay);
    addBet(mainBetRef.current, mainPay, "Blackjack");
    { const mb = mainBetRef.current; onBetRecord?.(mb, mb > 0 ? mainPay/mb : 1, mainRes==="win", mainPay); }
    addRecord(mainBetRef.current, mainPay, mainRes, ps, ds);
    setResult(mainRes);
    setLastPayout(mainPay - mainBetRef.current);

    if (isSplitRef.current && splitRef.current.length > 0) {
      const ss = handScore(splitRef.current);
      const sBust = ss > 21;
      let sRes: "win"|"lose"|"push" = "push";
      let sPay = 0;
      if (sBust)                           { sRes = "lose"; sPay = 0; }
      else if (dealerBust || ss > ds)      { sRes = "win";  sPay = splitBetRef.current * 2; }
      else if (ss === ds)                  { sRes = "push"; sPay = splitBetRef.current; }
      else                                 { sRes = "lose"; sPay = 0; }
      creditBal(sPay);
      addBet(splitBetRef.current, sPay, "Blackjack");
      setSplitResult(sRes);
      // Track split hand stats
      const sNet = sPay - splitBetRef.current;
      bjStatsRef.current = {
        wins: bjStatsRef.current.wins + (sRes === "win" ? 1 : 0),
        losses: bjStatsRef.current.losses + (sRes === "lose" ? 1 : 0),
        pushes: bjStatsRef.current.pushes + (sRes === "push" ? 1 : 0),
        profit: bjStatsRef.current.profit + sNet,
        wagered: bjStatsRef.current.wagered + splitBetRef.current,
        history: [...bjStatsRef.current.history, { profit: sNet, win: sRes === "win" }],
      };
      setBjStats({ ...bjStatsRef.current });
    }

    setPhase("result");
  }

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    dealTimersRef.current.forEach(t => clearTimeout(t));
  }, []);

  // ── Derived UI values ──────────────────────────────────────────────────────
  const playerScore = handScore(playerHand);
  const splitScore  = handScore(splitHand);
  const dealerScore = handScore(dealerHand);
  const dealerVisible = dealerHand.length > 0;

  const canHit    = phase === "player";
  const canStand  = phase === "player";
  const canDouble = phase === "player" && activeIdx === 0 && playerHand.length === 2 &&
                    localBalRef.current >= mainBetRef.current - 0.0001;
  const canSplit  = phase === "player" && activeIdx === 0 && playerHand.length === 2 &&
                    playerHand[0]?.rank === playerHand[1]?.rank &&
                    localBalRef.current >= mainBetRef.current - 0.0001 && !isSplit;
  const canInsurance = phase === "insurance" && insuranceResult === null;
  const insAmt       = insuranceBet > 0 ? insuranceBet : mainBetRef.current / 2;
  const disabled  = phase === "player" || phase === "dealer" || phase === "dealing" || phase === "insurance";

  function resultLabel(r: string|null) {
    if (!r) return "";
    if (r === "blackjack") return "¡BLACKJACK!";
    if (r === "win")       return "¡" + T("bjWin") + "!";
    if (r === "push")      return T("bjPush");
    return T("bjDealerWins");
  }
  function resultColor(r: string|null) {
    if (r === "win" || r === "blackjack") return "#22ee66";
    if (r === "push") return "#f4a91f";
    return "#e74c3c";
  }

  // ── Helper: get fromX/fromY for a card key ─────────────────────────────────
  function cardOff(key: string) {
    return cardOffsets[key] || { fx: 0, fy: 0 };
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", height:"100%", overflow:"hidden", background:"#0e1320", flexDirection:"column", userSelect:"none", WebkitUserSelect:"none" }}>

      {/* CSS keyframes */}
      <style>{`
        @keyframes bjCardIn {
          from {
            opacity: 0.85;
            transform: translate(var(--fx, 0px), var(--fy, 0px)) scale(0.55) rotate(-10deg);
          }
          70% { opacity: 1; }
          to {
            opacity: 1;
            transform: translate(0px, 0px) scale(1) rotate(0deg);
          }
        }
        @keyframes bjResultPop {
          from { opacity:0; transform:translate(-50%,-50%) scale(0.7); }
          to   { opacity:1; transform:translate(-50%,-50%) scale(1);   }
        }
        @keyframes bjScorePop {
          0%   { transform:scale(1); }
          40%  { transform:scale(1.3); }
          100% { transform:scale(1); }
        }
        @keyframes bjWinGlow {
          0%,100% { box-shadow: 0 0 20px #22ee6655; }
          50%      { box-shadow: 0 0 50px #22ee66cc; }
        }
        @keyframes bjWinPop {
          0%   { transform:scale(1); }
          35%  { transform:scale(1.07); }
          65%  { transform:scale(0.97); }
          100% { transform:scale(1); }
        }
        @keyframes bjLosePop {
          0%   { transform:scale(1); }
          30%  { transform:scale(1.05) rotate(-1.5deg); }
          60%  { transform:scale(0.97) rotate(1deg); }
          100% { transform:scale(1) rotate(0deg); }
        }
        @keyframes bjLabelIn {
          0%   { opacity:0; max-width:0; padding-left:0; padding-right:0; }
          30%  { opacity:0; }
          100% { opacity:1; max-width:160px; padding-left:14px; padding-right:14px; }
        }
      `}</style>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", alignItems:"center", gap:"10px", padding:"10px 20px", background:"#0e1826", borderBottom:"1px solid #1a2438", flexShrink:0 }}>
        <button onClick={onBack}
          style={{ background:"#131a28", border:"1px solid #252f45", color:"#8090b0", cursor:"pointer", fontSize:"18px", padding:"5px 12px", borderRadius:"8px", lineHeight:1 }}>
          ←
        </button>
        <div style={{ fontWeight:500, fontSize:"15px", letterSpacing:"1.5px", color:"#fff", display:"flex", alignItems:"center", gap:"8px" }}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="13" height="17" rx="2"/><rect x="9" y="2" width="13" height="17" rx="2"/></svg>BLACKJACK</div>
        <div style={{ marginLeft:"auto", fontSize:"12px", color:"#5a6a88", fontWeight:500 }}>{T("manderOriginals")}</div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

        {/* ── Left panel ─────────────────────────────────────────────────── */}
        <div style={{ width:"268px", flexShrink:0, background:"#131a28", borderRight:"1px solid #1a2438", display:"flex", flexDirection:"column", gap:0, padding:"16px" }}>

          {/* Bet amount label */}
          <div style={{ color:"#5a6a88", fontWeight:500, marginBottom:"6px", fontSize:"13px", paddingLeft:"4px" }}>{T("betAmount")}</div>

          {/* Bet input */}
          <div style={{ display:"flex", alignItems:"center", gap:"8px", background:"#0e1826", border:`1px solid ${betInvalid||balInsuff?"#e74c3c":"#252f45"}`, borderRadius:"10px", padding:"8px 14px", marginBottom:"8px", transition:"border .15s" }}>
            <span style={{ fontSize:"16px", color:"#5a6a88", fontWeight:500, whiteSpace:"nowrap", opacity:currencyFade, transition:"opacity .18s" }}>{displayCurrency}</span>
            <input type="number" value={betDisplay} min={minBetDisplay} max={maxBetDisplay} step="0.01"
              onChange={e => setBetDisplay(e.target.value)}
              onBlur={() => {
                const clamped = Math.max(minBetDisplay, Math.min(maxBetDisplay || minBetDisplay, parseFloat(betDisplay) || minBetDisplay));
                setBetDisplay(clamped.toFixed(2));
              }}
              disabled={disabled}
              style={{ flex:1, background:"transparent", border:"none", color:"#fff", fontSize:"22px", fontWeight:600, padding:0, minWidth:0, outline:"none", fontFamily:"inherit", opacity:currencyFade, transition:"opacity .18s" }}
            />
            <button onClick={() => setBetDisplay(minBetDisplay.toFixed(2))} disabled={disabled}
              style={{ background:"#0e1826", border:"1px solid #252f45", borderRadius:"6px", color:"#6db3f2", fontSize:"11px", fontWeight:500, padding:"4px 8px", cursor:disabled?"not-allowed":"pointer", textTransform:"uppercase", letterSpacing:"0.04em", whiteSpace:"nowrap" }}>
              {T("hiloClear")}
            </button>
          </div>

          {/* Validation messages */}
          {betInvalid && (
            <div style={{ fontSize:"11.5px", color:"#e74c3c", fontWeight:600, marginBottom:"8px", paddingLeft:"2px" }}>
              {T("bjMinBet")}{fmtMoney(0.01)}
            </div>
          )}
          {!betInvalid && balInsuff && (
            <div style={{ fontSize:"11.5px", color:"#e74c3c", fontWeight:600, marginBottom:"8px", paddingLeft:"2px" }}>
              {T("insufficientBal")}
            </div>
          )}
          {!betInvalid && !balInsuff && <div style={{ marginBottom:"6px" }} />}

          {/* Quick-bet buttons */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"6px", marginBottom:"14px" }}>
            {[
              { label:"Min", action:() => setBetDisplay(minBetDisplay.toFixed(2)) },
              { label:"½",   action:() => setBetDisplay(v => Math.max(minBetDisplay, (parseFloat(v)||0) / 2).toFixed(2)) },
              { label:"2×",  action:() => setBetDisplay(v => Math.min(maxBetDisplay || minBetDisplay, (parseFloat(v)||0) * 2).toFixed(2)) },
              { label:"Max", action:() => setBetDisplay((maxBetDisplay || minBetDisplay).toFixed(2)) },
            ].map(b => (
              <button key={b.label} onClick={b.action} disabled={disabled} className="bj-bet-btn"
                style={{ background:"#1a2438", color:disabled?"#3a4a60":"#d0dcea", border:"1px solid #252f45", borderRadius:"8px", padding:"8px 0", fontWeight:500, fontSize:"13px", transition:"all .12s" }}>
                {b.label}
              </button>
            ))}
          </div>

          {/* Insurance offer */}
          {(phase === "insurance" || insuranceResult !== null) && (
            <div style={{ marginBottom:"12px" }}>
              {insuranceResult === null ? (
                <>
                  <div style={{ textAlign:"center", color:"#cad2de", fontWeight:600, fontSize:"14px", marginBottom:"10px" }}>
                    {T("bjInsuranceQ")}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px" }}>
                    <button onClick={takeInsurance}
                      style={{ padding:"13px 8px", borderRadius:"10px", fontWeight:600, fontSize:"14px", border:"none",
                        background:"#2a3a55", color:"#fff", cursor:"pointer", transition:"background .15s" }}
                      onMouseEnter={e=>{ (e.currentTarget as HTMLButtonElement).style.background="#3a4e6e"; }}
                      onMouseLeave={e=>{ (e.currentTarget as HTMLButtonElement).style.background="#2a3a55"; }}>
                      {T("bjTakeIns")}
                    </button>
                    <button onClick={declineInsurance}
                      style={{ padding:"13px 8px", borderRadius:"10px", fontWeight:600, fontSize:"14px", border:"none",
                        background:"#2a3a55", color:"#fff", cursor:"pointer", transition:"background .15s" }}
                      onMouseEnter={e=>{ (e.currentTarget as HTMLButtonElement).style.background="#3a4e6e"; }}
                      onMouseLeave={e=>{ (e.currentTarget as HTMLButtonElement).style.background="#2a3a55"; }}>
                      {T("bjNoIns")}
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign:"center", padding:"10px 0", fontWeight:700, fontSize:"13.5px",
                  color: insuranceResult === "won" ? "#22ee66" : "#e74c3c" }}>
                  {insuranceResult === "won" ? T("bjInsWon") : T("bjInsLost")}
                </div>
              )}
            </div>
          )}

          {/* Hit / Stand / Double / Split — hidden during insurance phase */}
          {phase !== "insurance" && (
            <>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", marginBottom:"8px" }}>
                <button onClick={hit} disabled={!canHit} className="bj-action-btn"
                  style={{ padding:"14px 8px", borderRadius:"10px", fontWeight:500, fontSize:"15px", border:"none",
                    background:canHit?"linear-gradient(180deg,#1a9fff,#0d6fd4)":"#1a2438",
                    color:canHit?"#fff":"#3a4a60", transition:"all .15s",
                    boxShadow: canHit ? "0 4px 18px rgba(26,159,255,.3)" : "none" }}>
                  {T("bjHit")}
                </button>
                <button onClick={stand} disabled={!canStand} className="bj-action-btn"
                  style={{ padding:"14px 8px", borderRadius:"10px", fontWeight:500, fontSize:"15px", border:"none",
                    background:canStand?"linear-gradient(180deg,#1a9fff,#0d6fd4)":"#1a2438",
                    color:canStand?"#fff":"#3a4a60", transition:"all .15s",
                    boxShadow: canStand ? "0 4px 18px rgba(26,159,255,.3)" : "none" }}>
                  {T("bjStand")}
                </button>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", marginBottom:"14px" }}>
                <button onClick={doubleDown} disabled={!canDouble} className="bj-action-btn"
                  style={{ padding:"13px 6px", borderRadius:"10px", fontWeight:500, fontSize:"13px", border:"none",
                    background:canDouble?"linear-gradient(180deg,#1a9fff,#0d6fd4)":"#1a2438",
                    color:canDouble?"#fff":"#3a4a60", transition:"all .15s",
                    boxShadow: canDouble ? "0 4px 18px rgba(26,159,255,.3)" : "none" }}>
                  {T("bjDouble")}
                </button>
                <button onClick={splitCards} disabled={!canSplit} className="bj-action-btn"
                  style={{ padding:"13px 6px", borderRadius:"10px", fontWeight:500, fontSize:"13px", border:"none",
                    background:canSplit?"linear-gradient(180deg,#1a9fff,#0d6fd4)":"#1a2438",
                    color:canSplit?"#fff":"#3a4a60", transition:"all .15s",
                    boxShadow: canSplit ? "0 4px 18px rgba(26,159,255,.3)" : "none" }}>
                  {T("bjSplit")}
                </button>
              </div>
            </>
          )}

          {/* Deal / Apostar button */}
          {(() => {
            const dealDisabled = phase === "player" || phase === "dealer" || phase === "dealing" || phase === "insurance" || betInvalid || (!!currentUser && balInsuff);
            const dealLabel = (currentUser && balInsuff) ? T("insufficientBal") : betInvalid ? T("bjBetInvalid") : T("bjBet");
            return (
              <button onClick={deal} disabled={dealDisabled} className="bj-deal-btn"
                style={{ width:"100%", marginBottom:"14px", padding:"14px", borderRadius:"10px", fontWeight:500, fontSize:"15px", border:"none",
                  background: dealDisabled ? "#1a2438" : "linear-gradient(180deg,#1a9fff,#0d6fd4)",
                  color: dealDisabled ? "#3a4a60" : "#fff",
                  boxShadow: dealDisabled ? "none" : "0 4px 22px rgba(26,159,255,.35)",
                  transition:"all .2s" }}>
                {dealLabel}
              </button>
            );
          })()}

          {/* Icon buttons row — very bottom */}
          <div style={{ marginTop:"auto", display:"flex", gap:"8px", position:"relative" }}>
            <button
              onClick={()=>setShowStats(v=>!v)}
              title={T("statsTitle")}
              onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.transform="scale(1.12)";(e.currentTarget as HTMLButtonElement).style.filter="brightness(1.3)";}}
              onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.transform="scale(1)";(e.currentTarget as HTMLButtonElement).style.filter="brightness(1)";}}
              style={{ width:"38px",height:"38px",borderRadius:"8px",background:showStats?"#1f6fd0":"#0e1826",border:showStats?"1px solid #3a8aff":"1px solid #203a50",color:showStats?"#fff":"#7a9db8",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"17px",transition:"background .2s,border .2s,color .2s,transform .15s,filter .15s" }}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
            </button>

            <div style={{ position:"relative" }}>
              {showVol && (
                <div onClick={()=>setShowVol(false)}
                  style={{ position:"fixed",inset:0,zIndex:9998 }}/>
              )}
              <button
                onClick={()=>setShowVol(v=>!v)}
                title={T("volumeTitle")}
                onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.transform="scale(1.12)";(e.currentTarget as HTMLButtonElement).style.filter="brightness(1.3)";}}
                onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.transform="scale(1)";(e.currentTarget as HTMLButtonElement).style.filter="brightness(1)";}}
                style={{ position:"relative",zIndex:10000,width:"38px",height:"38px",borderRadius:"8px",background:showVol?"#1f6fd0":"#0e1826",border:showVol?"1px solid #3a8aff":"1px solid #203a50",color:showVol?"#fff":"#7a9db8",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"17px",transition:"background .2s,border .2s,color .2s,transform .15s,filter .15s" }}>
                {bjVol===0 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg> : bjVol<40 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}
              </button>

              {showVol && (
                <div style={{ position:"absolute",bottom:"48px",left:"0",background:"#0f1e2e",border:"1px solid #252f45",borderRadius:"12px",padding:"10px 16px",display:"flex",alignItems:"center",gap:"12px",minWidth:"200px",boxShadow:"0 4px 20px rgba(0,0,0,.5)",zIndex:10000 }}>
                  <span style={{ fontSize:"18px",flexShrink:0,color:"#5a6a88" }}>{bjVol===0 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg> : bjVol<40 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}</span>
                  <input type="range" min="0" max="100" step="1" value={bjVol}
                    onChange={e=>setBjVol(Number(e.target.value))}
                    style={{ flex:1,accentColor:"#f4a91f",cursor:"pointer",height:"4px" }} />
                  <span style={{ color:"#d0dcea",fontWeight:500,fontSize:"13px",minWidth:"24px",textAlign:"right" }}>{bjVol}</span>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* ── Table area ─────────────────────────────────────────────────── */}
        <div ref={tableAreaRef} style={{ flex:1, position:"relative", display:"flex", flexDirection:"column", overflow:"hidden",
          background:"#09141f" }}>

          {/* ── Deck pile (top-right corner) ── */}
          <DeckPile deckRef={deckPileRef} />

          {/* Center banner — Stake-style ribbon */}
          <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", display:"flex", alignItems:"center", pointerEvents:"none", zIndex:1, userSelect:"none", whiteSpace:"nowrap" }}>
            {/* Left ribbon tail */}
            <div style={{ width:"56px", height:"54px", background:"rgba(12,22,38,.82)", clipPath:"polygon(22px 0%, 100% 0%, 100% 100%, 22px 100%, 0% 50%)", flexShrink:0 }} />
            {/* Center text box */}
            <div style={{ background:"rgba(12,22,38,.82)", padding:"10px 20px", textAlign:"center" }}>
              <div style={{ fontSize:"11px", fontWeight:500, letterSpacing:"3.5px", color:"rgba(255,255,255,.72)", textTransform:"uppercase" }}>{T("bjBlackjackPays")}</div>
              <div style={{ fontSize:"10px", fontWeight:600, letterSpacing:"2.5px", color:"rgba(255,255,255,.45)", marginTop:"5px", textTransform:"uppercase" }}>{T("bjInsurancePays")}</div>
            </div>
            {/* Right ribbon tail */}
            <div style={{ width:"56px", height:"54px", background:"rgba(12,22,38,.82)", clipPath:"polygon(0% 0%, calc(100% - 22px) 0%, 100% 50%, calc(100% - 22px) 100%, 0% 100%)", flexShrink:0 }} />
          </div>

          {/* ── Dealer hand ── */}
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"10px", paddingTop:"32px", position:"relative", zIndex:2 }}>
            <div style={{ fontSize:"11px", fontWeight:500, color:"rgba(255,255,255,.45)", letterSpacing:"2px" }}>{T("bjDealer")}</div>
            <div style={{ display:"flex", gap:"10px", justifyContent:"center", minHeight:"120px", alignItems:"center", flexWrap:"wrap" }}>
              {dealerHand.map((card, i) => {
                const key = `${animKey}-d${i}`;
                const { fx, fy } = cardOff(key);
                return <PlayingCard key={key} card={card} fromX={fx} fromY={fy} flipping={flippingKey === key || flipRevealKeys.includes(key)} faceDownOverride={revealPendingKeys.includes(key)} />;
              })}
              {dealerHand.length === 0 && (
                <div style={{ width:"82px", height:"118px", borderRadius:"10px", border:"2px dashed rgba(255,255,255,.1)", opacity:.5 }} />
              )}
            </div>
            {dealerVisible && dealerHand.length > 0 && (
              <ScoreBadge score={dealerScore} bust={dealerScore > 21} />
            )}
          </div>


          {/* ── Player hands ── */}
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"10px", paddingBottom:"28px", position:"relative", zIndex:2, marginTop:"auto" }}>

            {/* Split layout */}
            {isSplit ? (
              <div style={{ display:"flex", gap:"32px", justifyContent:"center", alignItems:"flex-start", flexWrap:"wrap" }}>
                {/* Hand 1 */}
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"8px",
                  opacity: phase==="player" && activeIdx===1 ? 0.5 : 1, transition:"opacity .3s" }}>
                  {phase==="player" && activeIdx===0 && (
                    <div style={{ fontSize:"10px", color:"#f4a91f", fontWeight:500, letterSpacing:"1px", animation:"none" }}>{T("bjYourTurn")}</div>
                  )}
                  <ScoreBadge score={playerScore} bust={playerScore>21}
                    win={phase==="result"&&(result==="win"||result==="blackjack")}
                    lose={phase==="result"&&result==="lose"}
                    push={phase==="result"&&result==="push"}
                    label={phase==="result"?(result==="blackjack"?"Blackjack!":result==="win"?T("bjWin"):result==="push"?T("bjPush"):result==="lose"?T("bjLose"):undefined):undefined}
                  />
                  <div style={{ display:"flex", gap:"6px" }}>
                    {playerHand.map((card, i) => {
                      const key = `${animKey}-p${i}`;
                      const { fx, fy } = cardOff(key);
                      return <PlayingCard key={key} card={card} fromX={fx} fromY={fy} small flipping={flipRevealKeys.includes(key)} faceDownOverride={revealPendingKeys.includes(key)} />;
                    })}
                  </div>
                  <div style={{ fontSize:"10px", color:"#5a6a88", fontWeight:500 }}>{T("bjHand1")}</div>
                </div>
                {/* Hand 2 */}
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"8px",
                  opacity: phase==="player" && activeIdx===0 ? 0.5 : 1, transition:"opacity .3s" }}>
                  {phase==="player" && activeIdx===1 && (
                    <div style={{ fontSize:"10px", color:"#f4a91f", fontWeight:500, letterSpacing:"1px" }}>{T("bjYourTurn")}</div>
                  )}
                  <ScoreBadge score={splitScore} bust={splitScore>21}
                    win={phase==="result"&&splitResult==="win"}
                    lose={phase==="result"&&splitResult==="lose"}
                    push={phase==="result"&&splitResult==="push"}
                    label={phase==="result"?(splitResult==="win"?T("bjWin"):splitResult==="push"?T("bjPush"):splitResult==="lose"?T("bjLose"):undefined):undefined}
                  />
                  <div style={{ display:"flex", gap:"6px" }}>
                    {splitHand.map((card, i) => {
                      const key = `${animKey}-s${i}`;
                      const { fx, fy } = cardOff(key);
                      return <PlayingCard key={key} card={card} fromX={fx} fromY={fy} small flipping={flipRevealKeys.includes(key)} faceDownOverride={revealPendingKeys.includes(key)} />;
                    })}
                  </div>
                  <div style={{ fontSize:"10px", color:"#5a6a88", fontWeight:500 }}>{T("bjHand2")}</div>
                </div>
              </div>
            ) : (
              <>
                {playerHand.length > 0 && (
                  <ScoreBadge
                    score={playerScore}
                    bust={playerScore > 21}
                    win={(phase === "result" && (result === "win" || result === "blackjack")) || (phase !== "player" && phase !== "result" && isBJ(playerHand))}
                    lose={phase === "result" && result === "lose"}
                    push={phase === "result" && result === "push"}
                    label={phase === "result" ? (
                      result === "blackjack" ? "Blackjack!" :
                      result === "win" ? T("bjWin") :
                      result === "push" ? T("bjPush") :
                      result === "lose" ? T("bjLose") : undefined
                    ) : (phase !== "player" && phase !== "result" && isBJ(playerHand)) ? "Blackjack!" : undefined}
                  />
                )}
                <div style={{ display:"flex", gap:"10px", justifyContent:"center", alignItems:"flex-end", minHeight:"120px", flexWrap:"wrap" }}>
                  {playerHand.length > 0 ? (
                    playerHand.map((card, i) => {
                      const key = `${animKey}-p${i}`;
                      const { fx, fy } = cardOff(key);
                      return <PlayingCard key={key} card={card} fromX={fx} fromY={fy} flipping={flipRevealKeys.includes(key)} faceDownOverride={revealPendingKeys.includes(key)} />;
                    })
                  ) : (
                    <div style={{ width:"110px", height:"162px", borderRadius:"10px", border:"2px dashed rgba(255,255,255,.1)", opacity:.5 }} />
                  )}
                </div>
              </>
            )}

            <div style={{ fontSize:"11px", fontWeight:500, color:"rgba(255,255,255,.45)", letterSpacing:"2px" }}>{T("bjPlayer")}</div>
          </div>


        </div>
      </div>

      {/* ── Floating draggable stats panel ── */}
      {showStats && (
        <div style={{
          position:"fixed",
          left: statsPos.x,
          top: statsPos.y,
          zIndex:9999,
          width:"268px",
          background:"#0f1f2e",
          border:"1px solid #1e3a52",
          borderRadius:"14px",
          boxShadow:"0 8px 32px rgba(0,0,0,.7)",
          overflow:"hidden",
          userSelect:"none",
        }}>
          <div
            onMouseDown={handleStatsDragStart}
            style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",background:"#112232",borderBottom:"1px solid #1e3a52",cursor:"grab" }}>
            <div style={{ display:"flex",alignItems:"center",gap:"8px" }}>
              <span style={{ display:"flex",alignItems:"center",color:"#7a9db8" }}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg></span>
              <strong style={{ fontSize:"14px",color:"#d8e8f5" }}>{T("statsTitle")}</strong>
            </div>
            <button onClick={()=>setShowStats(false)} style={{ background:"none",border:"none",color:"#7a9db8",fontSize:"18px",cursor:"pointer",lineHeight:1,padding:"0 2px" }}>×</button>
          </div>
          <div style={{ padding:"12px" }}>
            <div style={{ background:"#0d1a28",borderRadius:"10px",padding:"12px",marginBottom:"8px",display:"flex",flexDirection:"column",gap:"8px" }}>
              {([
                { label:T("bjNetProfit"), value: fmtMoney(bjStats.profit), color: bjStats.profit>=0?"#16ff5c":"#ff5959" },
                { label:T("bjWins"),      value: String(bjStats.wins),      color:"#16ff5c" },
                { label:T("bjLosses"),    value: String(bjStats.losses),    color:"#ff5959" },
                { label:T("bjPushes"),    value: String(bjStats.pushes),    color:"#f4a91f" },
                { label:T("bjWagered"),   value: fmtMoney(bjStats.wagered), color:"#d8e8f5" },
              ] as {label:string;value:string;color:string}[]).map(s=>(
                <div key={s.label} style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <span style={{ color:"#7a9db8",fontSize:"11.5px" }}>{s.label}</span>
                  <span style={{ color:s.color,fontWeight:500,fontSize:"13px" }}>{s.value}</span>
                </div>
              ))}
            </div>
            <button
              onClick={()=>{ bjStatsRef.current={...bjStatsDefault}; setBjStats({...bjStatsDefault}); }}
              style={{ width:"100%",marginBottom:"8px",background:"transparent",border:"1px solid #1e3a52",borderRadius:"8px",color:"#7a9db8",fontSize:"12px",fontWeight:500,cursor:"pointer",padding:"6px 0",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px",transition:"color .15s,border-color .15s,background .15s" }}
              onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.color="#fff";(e.currentTarget as HTMLButtonElement).style.borderColor="#3a8aff";(e.currentTarget as HTMLButtonElement).style.background="#0d1f30";}}
              onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.color="#7a9db8";(e.currentTarget as HTMLButtonElement).style.borderColor="#1e3a52";(e.currentTarget as HTMLButtonElement).style.background="transparent";}}>
              <span style={{ fontSize:"14px" }}>↺</span> {T("bjResetStats")}
            </button>
            {/* Mini chart — cumulative profit */}
            {(()=>{
              const raw = bjStats.history.length>0 ? bjStats.history.slice().reverse() : null;
              const W=320, H=210, PAD_X=12, PAD_Y=20;
              const chartW = W-PAD_X*2, chartH = H-PAD_Y*2;
              interface BChartPt { cum:number; win:boolean; profit:number }
              let series: BChartPt[] = [];
              if(raw){
                let running = 0;
                series = raw.map(p=>{ running += (p.profit??0); return { cum:running, win:p.win, profit:p.profit??0 }; });
              }
              const allPts: BChartPt[] = raw ? [{ cum:0, win:false, profit:0 }, ...series] : [];
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
              const maxIdx = series.length>0 ? series.reduce((best,p,i)=>p.cum>series[best].cum?i:best,0)+1 : -1;
              const hIdx = chartHoverBJ;
              const hpt = hIdx!==null && hIdx>0 && hIdx<allPts.length ? allPts[hIdx] : null;
              const hx = hIdx!==null ? xs[hIdx] : 0;
              if (n < 2) return (
                <div style={{ position:"relative",background:"#0a1520",borderRadius:"12px",height:"190px",display:"flex",alignItems:"center",justifyContent:"center",border:"1px solid #1a3347" }}>
                  <span style={{ color:"#2a4a6a",fontSize:"12px" }}>{T("noHistory")}</span>
                </div>
              );
              const linePath = xs.map((x,i)=>`${i===0?"M":"L"}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
              const fillAbove = linePath + ` L${xs[n-1].toFixed(1)} ${zeroY.toFixed(1)} L${xs[0].toFixed(1)} ${zeroY.toFixed(1)} Z`;
              const fillBelow = linePath + ` L${xs[n-1].toFixed(1)} ${zeroY.toFixed(1)} L${xs[0].toFixed(1)} ${zeroY.toFixed(1)} Z`;
              const tipXpct = hIdx!==null && xs.length ? (xs[hIdx]/W)*100 : 0;
              const tipYpct = hIdx!==null && ys.length ? (ys[hIdx]/H)*100 : 0;
              const tipLeft = Math.min(Math.max(tipXpct, 12), 78);
              const tipTop  = Math.max(tipYpct - 14, 2);
              return (
                <div style={{ position:"relative",background:"#0a1520",borderRadius:"12px",height:"190px",overflow:"visible",border:"1px solid #1a3347" }}>
                  {hpt && (
                    <div style={{
                      position:"absolute",
                      left:`${tipLeft}%`,
                      top:`${tipTop}%`,
                      transform:"translateX(-50%) translateY(-100%)",
                      background:"#1a2a3a",
                      border:`1.5px solid ${hpt.profit>=0?"#19ff35":"#ff3350"}`,
                      borderRadius:"8px",
                      padding:"4px 10px",
                      fontSize:"12px",
                      fontWeight:500,
                      color: hpt.profit>=0?"#19ff35":"#ff3350",
                      whiteSpace:"nowrap",
                      pointerEvents:"none",
                      zIndex:20,
                      boxShadow:`0 2px 12px ${hpt.profit>=0?"rgba(25,255,53,.3)":"rgba(255,51,80,.3)"}`,
                    }}>
                      {hpt.profit>=0?"+":""}{fmtMoney(hpt.profit)}
                      <span style={{ color:"#7a9db8",fontWeight:400,fontSize:"10px",marginLeft:"6px" }}>
                        acum: {hpt.cum>=0?"+":""}{fmtMoney(hpt.cum)}
                      </span>
                    </div>
                  )}
                  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width:"100%",height:"100%",display:"block",cursor:"crosshair" }}
                    onMouseMove={e=>{
                      if(!xs.length) return;
                      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
                      const svgX = ((e.clientX - rect.left) / rect.width) * W;
                      let closest = 0, minDist = Infinity;
                      xs.forEach((x,i)=>{ const d=Math.abs(x-svgX); if(d<minDist){ minDist=d; closest=i; } });
                      setChartHoverBJ(closest);
                    }}
                    onMouseLeave={()=>setChartHoverBJ(null)}
                  >
                    <defs>
                      <clipPath id="bjClipAbove"><rect x={PAD_X} y={PAD_Y} width={chartW} height={zeroY-PAD_Y}/></clipPath>
                      <clipPath id="bjClipBelow"><rect x={PAD_X} y={zeroY} width={chartW} height={chartH-(zeroY-PAD_Y)}/></clipPath>
                    </defs>
                    {n>1 ? <>
                      <path d={fillBelow} fill="rgba(200,30,30,.35)" clipPath="url(#bjClipBelow)"/>
                      <path d={fillAbove} fill="rgba(25,255,80,.18)" clipPath="url(#bjClipAbove)"/>
                      <line x1={PAD_X} y1={zeroY} x2={W-PAD_X} y2={zeroY} stroke="#2a4055" strokeWidth="1.5"/>
                      <path d={linePath} fill="none" stroke="#19ff35" strokeWidth="2.5" strokeLinejoin="miter" strokeLinecap="square" clipPath="url(#bjClipAbove)"/>
                      <path d={linePath} fill="none" stroke="#e03030" strokeWidth="2.5" strokeLinejoin="miter" strokeLinecap="square" clipPath="url(#bjClipBelow)"/>
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
          </div>
        </div>
      )}
    </div>
  );
}
