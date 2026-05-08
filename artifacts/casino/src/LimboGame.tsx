import React, { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { gt } from "./lib/gameLabels";

// ── Types ────────────────────────────────────────────────────────────────────
export interface LimboStats {
  wins: number; losses: number; profit: number; wagered: number;
  history: { profit: number; win: boolean; amount: number; payout: number; multiplier: number; createdAt: string; currency?: string }[];
}
export const limboStatsDefault: LimboStats = { wins: 0, losses: 0, profit: 0, wagered: 0, history: [] };

export interface LimboGameProps {
  balance: number;
  fmtMoney: (n: number) => string;
  convertUsd: (usd: number) => number;
  displayCurrency: string;
  currencyFade: number;
  displayInFiat?: boolean;
  onBack: () => void;
  onBalanceChange: (newBal: number) => void;
  addBet: (wagered: number, finalWin: number, game: string) => void;
  onBetRecord?: (amount: number, multiplier: number, win: boolean, payout: number) => void;
  liveRates: Record<string, number>;
  lang?: string;
  limboStats: LimboStats;
  setLimboStats: React.Dispatch<React.SetStateAction<LimboStats>>;
  currentUser?: string;
  onRequestLogin?: () => void;
  onGameActive?: (active: boolean) => void;
}

// ── Constants ────────────────────────────────────────────────────────────────
const HOUSE_EDGE = 0.01; // 1%
const MAX_MULT = 1_000_000;
const MIN_MULT = 1.01;

// ── Provably-fair result generator ───────────────────────────────────────────
// Inverse distribution: high multipliers are exponentially rarer
function rollLimboResult(): number {
  const r = Math.random();
  const raw = (1 - HOUSE_EDGE) / r;
  const multiplier = Math.max(1.00, Math.min(raw, MAX_MULT));
  return Math.floor(multiplier * 100) / 100;
}

// ── Component ────────────────────────────────────────────────────────────────
const LimboGame: React.FC<LimboGameProps> = ({
  balance, fmtMoney, convertUsd, displayCurrency, currencyFade, displayInFiat = false,
  onBack, onBalanceChange, addBet, onBetRecord,
  liveRates, lang: _lang = "es", limboStats, setLimboStats,
  currentUser, onRequestLogin, onGameActive,
}) => {
  const T = (k: string) => gt(_lang, k);

  // ── State ──────────────────────────────────────────────────────────────────
  const [bet, setBet] = useState<string>("3.00");
  const [targetMult, setTargetMult] = useState<string>("2.00");
  const [resultMult, setResultMult] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "rolling" | "result">("idle");
  const [lastWin, setLastWin] = useState<boolean | null>(null);
  const [historyChips, setHistoryChips] = useState<{ mult: number; win: boolean }[]>([]);
  const rollTimerRef = useRef<number | null>(null);
  const tickIntervalRef = useRef<number | null>(null);
  const tickStartTimeoutRef = useRef<number | null>(null);
  const rampRafRef = useRef<number | null>(null);
  const pendingEndValRef = useRef<number>(1.00);
  // Stores a settlement callback for the in-flight bet so it can be resolved even if
  // the component unmounts before the animation timer fires (e.g. user navigates away).
  const pendingSettlementRef = useRef<(() => void) | null>(null);

  // ── Stats popup + volume state ────────────────────────────────────────────
  const [showStats, setShowStats] = useState(false);
  const [statsCollapsed, setStatsCollapsed] = useState(false);
  const [turbo, setTurboRaw] = useState(() => localStorage.getItem("limbo_turbo") === "1");
  const turboRef = useRef(localStorage.getItem("limbo_turbo") === "1");
  function toggleTurbo() {
    const next = !turboRef.current;
    turboRef.current = next;
    setTurboRaw(next);
    localStorage.setItem("limbo_turbo", next ? "1" : "0");
  }
  const [statsPos, setStatsPos] = useState({ x: 310, y: 180 });
  const [chartHover, setChartHover] = useState<number | null>(null);
  const [vol, setVol] = useState(70);
  const isDraggingStats = useRef(false);
  const statsDragOffset = useRef({ x: 0, y: 0 });

  // ── Audio (Web Audio API, like other games — no external files) ────────────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const volRef = useRef(vol);
  const tickAudioIntervalRef = useRef<number | null>(null);
  useEffect(() => { volRef.current = vol; }, [vol]);
  const playSound = React.useCallback((type: "bet" | "tick" | "win") => {
    const v = volRef.current / 100;
    if (v === 0) return;
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed")
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") { try { ctx.resume(); } catch {} }
      if (type === "win") {
        // Limbo win: bright ascending arpeggio (C-E-G-C) with a soft shimmer pad
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((f, i) => {
          const t0 = ctx.currentTime + i * 0.07;
          const og = ctx.createGain(); og.connect(ctx.destination);
          const o = ctx.createOscillator(); o.type = "triangle"; o.connect(og);
          o.frequency.setValueAtTime(f, t0);
          og.gain.setValueAtTime(0.0001, t0);
          og.gain.exponentialRampToValueAtTime(0.18 * v, t0 + 0.012);
          og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.32);
          o.start(t0); o.stop(t0 + 0.34);
        });
        // Soft shimmer pad (sine octave above, low gain)
        const padG = ctx.createGain(); padG.connect(ctx.destination);
        const pad = ctx.createOscillator(); pad.type = "sine"; pad.connect(padG);
        pad.frequency.setValueAtTime(1568, ctx.currentTime);
        padG.gain.setValueAtTime(0.0001, ctx.currentTime);
        padG.gain.exponentialRampToValueAtTime(0.05 * v, ctx.currentTime + 0.05);
        padG.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
        pad.start(ctx.currentTime); pad.stop(ctx.currentTime + 0.6);
        return;
      }
      const g = ctx.createGain(); g.connect(ctx.destination);
      const osc = ctx.createOscillator(); osc.connect(g);
      if (type === "bet") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.05);
        g.gain.setValueAtTime(0.10 * v, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start(); osc.stop(ctx.currentTime + 0.09);
      } else {
        osc.type = "square";
        osc.frequency.setValueAtTime(1600 + Math.random() * 400, ctx.currentTime);
        g.gain.setValueAtTime(0.045 * v, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.025);
        osc.start(); osc.stop(ctx.currentTime + 0.03);
      }
    } catch { }
  }, []);
  // Run rapid tick loop while a roll is animating — delayed by the hold phase
  useEffect(() => {
    if (phase !== "rolling" || turboRef.current) return;
    // Wait for the 500ms hold to finish before starting the tick sound
    const holdMs = 500;
    const startId = window.setTimeout(() => {
      tickStartTimeoutRef.current = null;
      // Skip tick if result is 1.00x — number never moves
      if (pendingEndValRef.current <= 1.00) return;
      playSound("tick");
      const intervalId = window.setInterval(() => playSound("tick"), 50);
      tickAudioIntervalRef.current = intervalId;
    }, holdMs);
    tickStartTimeoutRef.current = startId;
    return () => {
      window.clearTimeout(startId);
      tickStartTimeoutRef.current = null;
      if (tickAudioIntervalRef.current) {
        window.clearInterval(tickAudioIntervalRef.current);
        tickAudioIntervalRef.current = null;
      }
    };
  }, [phase, playSound]);

  // ── Auto-mode state ───────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"manual"|"auto">("manual");
  const [autoCount, setAutoCount] = useState<string>("10");
  const [autoRemaining, setAutoRemaining] = useState(0);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoInfinite, setAutoInfinite] = useState(false);
  const [autoOnWin, setAutoOnWin] = useState<"reset"|"increase">("reset");
  const [autoOnWinPct, setAutoOnWinPct] = useState("0");
  const [autoOnLose, setAutoOnLose] = useState<"reset"|"increase">("reset");
  const [autoOnLosePct, setAutoOnLosePct] = useState("0");
  const [autoStopProfit, setAutoStopProfit] = useState("");
  const [autoStopLoss, setAutoStopLoss] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const autoRunRef = useRef(false);
  const loopIdRef = useRef(0);
  const phaseRef = useRef<"idle" | "rolling" | "result">("idle");
  const startAutoCooldownRef = useRef(false);
  const balanceRef = useRef(balance);
  useEffect(() => { balanceRef.current = balance; }, [balance]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const chartHoverRafRef = useRef<number | null>(null);
  const statsDragRafRef = useRef<number | null>(null);
  function handleStatsDragStart(e: React.MouseEvent) {
    e.preventDefault();
    isDraggingStats.current = true;
    statsDragOffset.current = { x: e.clientX - statsPos.x, y: e.clientY - statsPos.y };
    const onMove = (ev: MouseEvent) => {
      if (!isDraggingStats.current) return;
      const cx = ev.clientX, cy = ev.clientY;
      if (statsDragRafRef.current !== null) cancelAnimationFrame(statsDragRafRef.current);
      statsDragRafRef.current = requestAnimationFrame(() => {
        setStatsPos({ x: cx - statsDragOffset.current.x, y: cy - statsDragOffset.current.y });
        statsDragRafRef.current = null;
      });
    };
    const onUp = () => {
      if (statsDragRafRef.current !== null) { cancelAnimationFrame(statsDragRafRef.current); statsDragRafRef.current = null; }
      isDraggingStats.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseup", onUp);
  }

  // ── Cleanup on unmount: stop auto-loop, timers, animations, and audio ──────
  useEffect(() => {
    return () => {
      // If there is an in-flight bet (user navigated away mid-roll), settle it
      // immediately so the balance/stats are credited before the timer would fire.
      if (pendingSettlementRef.current) {
        pendingSettlementRef.current();
      }
      // Stop auto loop immediately (any in-flight async iteration short-circuits)
      loopIdRef.current++;
      autoRunRef.current = false;
      // Cancel all pending timers / animations
      if (rollTimerRef.current) window.clearTimeout(rollTimerRef.current);
      if (tickStartTimeoutRef.current) window.clearTimeout(tickStartTimeoutRef.current);
      if (tickIntervalRef.current) window.clearInterval(tickIntervalRef.current);
      if (tickAudioIntervalRef.current) window.clearInterval(tickAudioIntervalRef.current);
      if (rampRafRef.current) cancelAnimationFrame(rampRafRef.current);
      // Close audio context so any scheduled oscillators stop immediately
      try { audioCtxRef.current?.close(); } catch { }
      audioCtxRef.current = null;
    };
  }, []);

  useEffect(() => { onGameActive?.(phase !== "idle" || autoRunning); }, [phase, autoRunning, onGameActive]);

  // ── Currency conversion ────────────────────────────────────────────────────
  const liveRatesRef = useRef(liveRates);
  useEffect(() => { liveRatesRef.current = liveRates; }, [liveRates]);
  const prevCurrRef = useRef(displayCurrency);
  useEffect(() => {
    const oldCur = prevCurrRef.current;
    prevCurrRef.current = displayCurrency;
    if (oldCur === displayCurrency) return;
    const oldRate = liveRatesRef.current[oldCur] || 1;
    const newRate = liveRatesRef.current[displayCurrency] || 1;
    const cur = parseFloat(bet) || 0;
    if (cur > 0) setBet(((cur / oldRate) * newRate).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayCurrency]);

  // ── Derived numbers ────────────────────────────────────────────────────────
  const currRate = liveRates[displayCurrency] || 1;
  const betDisplay = parseFloat(bet) || 0;
  const betUsd = betDisplay / currRate;
  const targetMultNum = Math.max(MIN_MULT, Math.min(MAX_MULT, parseFloat(targetMult) || 0));
  const balanceDisplay = convertUsd(balance);
  const canBet = !currentUser || (betUsd > 0.0099 && betUsd <= balance + 1e-9);
  const insuff = !!currentUser && betUsd > 0 && betUsd > balance + 1e-9;
  const chancePct = ((1 - HOUSE_EDGE) / targetMultNum) * 100;
  const profitOnWin = betDisplay * targetMultNum - betDisplay;

  // ── Bet input helpers ──────────────────────────────────────────────────────
  function clampBetStr(v: string) {
    if (!/^\d*\.?\d*$/.test(v)) return;
    setBet(v);
  }
  function commitBet() {
    if (phase !== "idle") return;
    const maxD = Math.floor(convertUsd(balance) * 100) / 100;
    const minD = Math.ceil(convertUsd(0.01) * 100) / 100;
    const raw = parseFloat(bet) || 0;
    if (maxD > 0) setBet((Math.max(minD, Math.min(maxD, raw || minD))).toFixed(2));
    else setBet((raw).toFixed(2));
  }
  function halveBet() {
    if (phase !== "idle") return;
    const raw = parseFloat(bet) || 0;
    setBet(Math.max(0, raw / 2).toFixed(2));
  }
  function doubleBet() {
    if (phase !== "idle") return;
    const raw = parseFloat(bet) || 0;
    const maxD = Math.floor(convertUsd(balance) * 100) / 100;
    setBet(Math.min(raw * 2, maxD || raw * 2).toFixed(2));
  }
  function minBet() {
    if (phase !== "idle") return;
    const minD = Math.ceil(convertUsd(0.01) * 100) / 100;
    setBet(minD.toFixed(2));
  }
  function maxBet() {
    if (phase !== "idle") return;
    const maxD = Math.floor(convertUsd(balance) * 100) / 100;
    if (maxD > 0) setBet(maxD.toFixed(2));
  }

  // ── Multiplier input helpers ───────────────────────────────────────────────
  function setMultStr(v: string) {
    if (!/^\d*\.?\d*$/.test(v)) return;
    setTargetMult(v);
  }
  function commitMult() {
    const raw = parseFloat(targetMult) || 0;
    const v = Math.max(MIN_MULT, Math.min(MAX_MULT, raw || MIN_MULT));
    setTargetMult(v.toFixed(2));
  }

  // ── Roll the limbo (single roll, Promise-based core) ──────────────────────
  function executeOneRoll(useBetDisplay: number): Promise<{success:boolean; win:boolean; profitUsd:number}> {
    return new Promise((resolve) => {
      const useBetUsd = useBetDisplay / currRate;
      const curBal = balanceRef.current;
      if (!currentUser || useBetUsd < 0.0099 || useBetUsd > curBal + 1e-9) {
        resolve({success:false, win:false, profitUsd:0});
        return;
      }
      const tgt = Math.max(MIN_MULT, Math.min(MAX_MULT, parseFloat(targetMult) || MIN_MULT));
      const result = rollLimboResult();
      const win = result >= tgt;
      const payout = win ? useBetUsd * tgt : 0;

      // Charge bet immediately
      balanceRef.current = curBal - useBetUsd;
      onBalanceChange(balanceRef.current);
      playSound("bet");
      setPhase("rolling");
      setLastWin(null);
      setResultMult(null);

      // Animation: hold at 1.00x for 500ms, then:
      //   turbo → instant result  |  normal → smooth ramp to result
      setResultMult(1.00);
      if (rampRafRef.current) cancelAnimationFrame(rampRafRef.current);
      const endVal = result;
      pendingEndValRef.current = endVal;
      const holdDuration  = turboRef.current ? 300 : 500; // ms to show 1.00x first
      // Scale move duration logarithmically: longer for bigger multipliers
      const MIN_MOVE = 400;
      const MAX_MOVE = 1200;
      const logScale     = Math.min(1, Math.log(Math.max(endVal, 1.001)) / Math.log(1_000_000));
      const moveDuration = turboRef.current ? 0 : MIN_MOVE + (MAX_MOVE - MIN_MOVE) * logScale;
      const totalDuration = holdDuration + moveDuration;

      if (!turboRef.current) {
        // Normal mode: exponential ramp — speed proportional to current value
        // easeInQuad so it starts slow and naturally accelerates
        const rampStart = performance.now();
        const animateRamp = () => {
          const t       = performance.now() - rampStart;
          const total_p = Math.min(1, t / totalDuration);

          if (t < holdDuration) {
            rampRafRef.current = requestAnimationFrame(animateRamp);
            return;
          }

          const mp    = Math.min(1, (t - holdDuration) / moveDuration);
          const eased = mp * mp; // easeInQuad: slow start, accelerates
          // Exponential interpolation: v = endVal^eased (= 1 at eased=0, endVal at eased=1)
          const v = endVal > 1.00
            ? Math.pow(Math.max(endVal, 1.001), eased)
            : 1.00;
          setResultMult(Math.floor(v * 100) / 100);

          if (total_p < 1) {
            rampRafRef.current = requestAnimationFrame(animateRamp);
          } else {
            rampRafRef.current = null;
            // Number reached final value — stop tick immediately
            if (tickAudioIntervalRef.current) {
              window.clearInterval(tickAudioIntervalRef.current);
              tickAudioIntervalRef.current = null;
            }
          }
        };
        rampRafRef.current = requestAnimationFrame(animateRamp);
      }
      // Turbo mode: no ramp — rollTimerRef fires at holdDuration and commits instantly

      // Settlement function: credits balance, records the bet, and updates stats.
      // Must be idempotent — guarded by pendingSettlementRef so it only runs once.
      const settle = () => {
        pendingSettlementRef.current = null;
        if (win) {
          balanceRef.current = balanceRef.current + payout;
          onBalanceChange(balanceRef.current);
        }
        addBet(useBetUsd, payout, "Limbo");
        onBetRecord?.(useBetUsd, win ? tgt : 0, win, payout);
        // Update localStorage directly (safe even if component is unmounted)
        if (currentUser) {
          try {
            const raw = localStorage.getItem("limbo_stats_" + currentUser);
            const prev = raw ? JSON.parse(raw) : { wins:0, losses:0, profit:0, wagered:0, history:[] };
            const next = {
              wins: prev.wins + (win ? 1 : 0),
              losses: prev.losses + (win ? 0 : 1),
              profit: prev.profit + (payout - useBetUsd),
              wagered: prev.wagered + useBetUsd,
              history: [{ profit: payout - useBetUsd, win, amount: useBetUsd, payout, multiplier: result, createdAt: new Date().toISOString(), currency: displayCurrency }, ...prev.history].slice(0, 50),
            };
            localStorage.setItem("limbo_stats_" + currentUser, JSON.stringify(next));
          } catch { /* non-fatal */ }
        }
      };
      pendingSettlementRef.current = settle;

      if (rollTimerRef.current) window.clearTimeout(rollTimerRef.current);
      rollTimerRef.current = window.setTimeout(() => {

        if (rampRafRef.current) {
          cancelAnimationFrame(rampRafRef.current);
          rampRafRef.current = null;
        }
        if (tickStartTimeoutRef.current) {
          window.clearTimeout(tickStartTimeoutRef.current);
          tickStartTimeoutRef.current = null;
        }
        if (tickAudioIntervalRef.current) {
          window.clearInterval(tickAudioIntervalRef.current);
          tickAudioIntervalRef.current = null;
        }
        setResultMult(result);
        setLastWin(win);
        setPhase("result");
        // Execute settlement (credits balance, records bet, saves stats)
        if (pendingSettlementRef.current) {
          settle();
          if (win) playSound("win");
        }
        setLimboStats(prev => {
          const raw = currentUser ? localStorage.getItem("limbo_stats_" + currentUser) : null;
          return raw ? JSON.parse(raw) : prev;
        });
        setHistoryChips(prev => [{ mult: result, win }, ...prev].slice(0, 12));
        window.setTimeout(() => {
          setPhase("idle");
          resolve({success:true, win, profitUsd: payout - useBetUsd});
        }, 300);
      }, totalDuration);
    });
  }

  function startRoll() {
    if (phase !== "idle" || autoRunning) return;
    if (!currentUser) { onRequestLogin?.(); return; }
    if (!canBet || betUsd <= 0) return;
    if (insuff) return;
    commitMult();
    executeOneRoll(betDisplay);
  }

  // ── Auto loop ──────────────────────────────────────────────────────────────
  function startAuto() {
    if (!currentUser) { onRequestLogin?.(); return; }
    if (autoRunRef.current) return;
    if (phaseRef.current !== "idle") return;
    if (startAutoCooldownRef.current) return;
    startAutoCooldownRef.current = true;
    window.setTimeout(() => { startAutoCooldownRef.current = false; }, 600);
    const count = autoInfinite ? 999999 : Math.max(0, parseInt(autoCount) || 0);
    if (count <= 0) return;

    const baseBetDisplay = parseFloat(bet) || 0;
    const baseBetUsd = baseBetDisplay / currRate;
    if (baseBetUsd < 0.0099) return;

    commitMult();

    autoRunRef.current = true;
    const myId = ++loopIdRef.current;
    setAutoRunning(true);

    let remaining = count;
    setAutoRemaining(remaining);
    let currentBetDisplay = baseBetDisplay;
    let sessionProfitDisplay = 0;

    const stop = (resetBet = true) => {
      autoRunRef.current = false;
      setAutoRunning(false);
      if (resetBet) setBet(baseBetDisplay.toFixed(2));
    };

    const loop = async () => {
      if (loopIdRef.current !== myId) return;
      if (!autoRunRef.current || remaining <= 0) { stop(); return; }

      const currentBetUsd = currentBetDisplay / currRate;
      if (currentBetUsd < 0.0099 || balanceRef.current < currentBetUsd - 0.0001) {
        stop();
        return;
      }
      setBet(currentBetDisplay.toFixed(2));

      const result = await executeOneRoll(currentBetDisplay);
      if (loopIdRef.current !== myId) return;
      if (!result.success) { stop(); return; }

      sessionProfitDisplay += result.profitUsd * currRate;

      if (result.win) {
        if (autoOnWin === "increase" && (parseFloat(autoOnWinPct) || 0) > 0) {
          currentBetDisplay = currentBetDisplay * (1 + (parseFloat(autoOnWinPct) || 0) / 100);
        } else {
          currentBetDisplay = baseBetDisplay;
        }
      } else {
        if (autoOnLose === "increase" && (parseFloat(autoOnLosePct) || 0) > 0) {
          currentBetDisplay = currentBetDisplay * (1 + (parseFloat(autoOnLosePct) || 0) / 100);
        } else {
          currentBetDisplay = baseBetDisplay;
        }
      }

      const maxBetDisplay = Math.floor(balanceRef.current * currRate * 100) / 100;
      const minBetDisplay = Math.ceil(0.01 * currRate * 100) / 100;
      currentBetDisplay = Math.max(minBetDisplay, Math.min(maxBetDisplay, currentBetDisplay));

      const stopProfit = autoStopProfit ? (parseFloat(autoStopProfit) || null) : null;
      const stopLoss = autoStopLoss ? (parseFloat(autoStopLoss) || null) : null;
      if (stopProfit !== null && sessionProfitDisplay >= stopProfit) { stop(); return; }
      if (stopLoss !== null && sessionProfitDisplay <= -stopLoss) { stop(); return; }

      remaining--;
      setAutoRemaining(remaining);
      window.setTimeout(loop, 50);
    };
    window.setTimeout(loop, 50);
  }

  function stopAuto() {
    loopIdRef.current++;
    autoRunRef.current = false;
    setAutoRunning(false);
  }

  // ── Display helpers ────────────────────────────────────────────────────────
  function fmtBetInput(v: string): string {
    if (!v) return "";
    if (!displayInFiat) return v;
    const [int, dec] = v.split(".");
    const fmtInt = (parseInt(int || "0") || 0).toLocaleString("de-DE");
    return dec !== undefined ? `${fmtInt},${dec}` : fmtInt;
  }
  function fmtBetAmountUsdt(): string {
    if (betDisplay <= 0) return "0,00000000 " + displayCurrency;
    return betDisplay.toLocaleString("es-AR", { minimumFractionDigits: 8, maximumFractionDigits: 8 }) + " " + displayCurrency;
  }
  function fmtProfitUsdt(): string {
    const v = phase === "result" && lastWin === true && resultMult !== null
      ? betDisplay * targetMultNum
      : 0;
    if (v <= 0) return "0,00000000 " + displayCurrency;
    return v.toLocaleString("es-AR", { minimumFractionDigits: 8, maximumFractionDigits: 8 }) + " " + displayCurrency;
  }

  // ── Result number color ────────────────────────────────────────────────────
  const resultColor = useMemo(() => {
    if (phase === "rolling") return "#ffffff";
    if (lastWin !== null) return lastWin ? "#22ee66" : "#ef4444";
    return "#ffffff";
  }, [phase, lastWin]);

  const showResultNumber = resultMult !== null ? resultMult : 1.00;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="game-ctrl-flex limbo-root" style={{
      width: "100%", display: "flex", fontFamily: "'Inter',sans-serif",
      position: "relative", background: "#0A0A12", userSelect: "none", WebkitUserSelect: "none",
      borderRadius: "0 0 6px 6px", overflow: "hidden",
      height: "714px",
    }}>

      {/* ─── LEFT PANEL ─── */}
      <div className="game-ctrl-sidebar" style={{
        width: "260px", flexShrink: 0, background: "#0D0F1A",
        borderRight: "1px solid #1a1035",
        display: "flex", flexDirection: "column",
        minHeight: 0, maxHeight: "100%", overflow: "hidden",
      }}>
        {/* Scrollable content area */}
        <div className="limbo-ctrl-inner" style={{
          flex: 1, overflowY: "auto", minHeight: 0,
          padding: "16px", display: "flex", flexDirection: "column", gap: "12px",
          overscrollBehavior: "contain",
        }}
        onWheel={e => { if (activeTab === "auto") e.stopPropagation(); }}>
        {/* Tabs Manual / Auto */}
        <div className="limbo-ctrl-tabs" style={{
          display: "flex", alignItems: "center", background: "#0D0F1A",
          borderRadius: "6px", padding: "5px", gap: "4px",
        }}>
          {(["manual", "auto"] as const).map(tab => {
            const locked = autoRunning || phase !== "idle";
            const active = activeTab === tab;
            return (
              <button key={tab}
                onClick={() => { if (!locked) setActiveTab(tab); }}
                disabled={locked}
                style={{
                  flex: 1,
                  background: active ? "#1a1035" : "transparent",
                  color: active ? "#ead4fc" : "#7c6d9e",
                  border: active ? "1px solid #2d1f52" : "1px solid transparent",
                  borderRadius: "6px",
                  padding: "10px", fontWeight: 500,
                  cursor: locked ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  opacity: locked && !active ? 0.45 : 1,
                  transition: "opacity .2s",
                }}
              >{tab === "manual" ? T("tabManual") : T("tabAuto")}</button>
            );
          })}
        </div>

        {activeTab === "manual" && <>

        {/* Monto de apuesta */}
        <div className="limbo-ctrl-amount" style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#7c6d9e", fontWeight: 500, marginBottom: "6px", fontSize: "13px", paddingLeft: "4px" }}>{T("betAmount")}</div>

          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: "#0D0F1A",
            border: `1px solid ${insuff ? "#c0392b" : "#1e1535"}`,
            borderRadius: "6px", padding: "8px 14px", marginBottom: "8px", transition: "border .15s",
          }}>
            <span style={{
              fontSize: "13px", color: "#7c6d9e", fontWeight: 500, whiteSpace: "nowrap",
              opacity: currencyFade, transition: "opacity 0.18s ease",
            }}>{displayCurrency}</span>
            <input
              value={fmtBetInput(bet)}
              onChange={e => {
                const v = displayInFiat
                  ? e.target.value.replace(/\./g, "").replace(",", ".")
                  : e.target.value;
                clampBetStr(v);
              }}
              onBlur={commitBet}
              disabled={phase !== "idle"}
              type="text" inputMode="decimal" placeholder={displayInFiat ? "0,00" : "0.00"}
              style={{
                flex: 1, background: "transparent", border: "none",
                color: phase !== "idle" ? "#4a3070" : "white",
                fontSize: "17px", fontWeight: 600, padding: "0",
                minWidth: 0, outline: "none", fontFamily: "inherit",
                opacity: currencyFade, transition: "opacity 0.18s ease",
              }}
            />
            <button
              onClick={() => setBet("0.00")}
              disabled={phase !== "idle"}
              style={{
                background: "#0D0F1A", border: "1px solid #1e1535", borderRadius: "6px",
                color: "#818cf8", fontSize: "11px", fontWeight: 500,
                padding: "4px 8px", cursor: phase !== "idle" ? "not-allowed" : "pointer",
                letterSpacing: "0.04em", whiteSpace: "nowrap", textTransform: "uppercase",
                marginRight: "-8px",
              }}
            >{T("limboClear")}</button>
          </div>

          {insuff && (
            <div style={{ fontSize: "11.5px", color: "#e74c3c", fontWeight: 600, paddingLeft: "2px", marginBottom: "8px" }}>
              {T("insufficientBal")}
            </div>
          )}

          {/* Quick buttons: Min, ½, 2×, Max */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "6px", marginBottom: "8px" }}>
            <button onClick={minBet} disabled={phase !== "idle"} style={{
              background: "#1a1035", color: "#ddd0f8", border: "1px solid #1e1535",
              borderRadius: "6px", padding: "8px 0", fontWeight: 500, fontSize: "13px",
              cursor: phase !== "idle" ? "not-allowed" : "pointer",
            }}>{T("btnMin")}</button>
            <button onClick={halveBet} disabled={phase !== "idle"} style={{
              background: "#1a1035", color: "#ddd0f8", border: "1px solid #1e1535",
              borderRadius: "6px", padding: "8px 0", fontWeight: 500, fontSize: "13px",
              cursor: phase !== "idle" ? "not-allowed" : "pointer",
            }}>½</button>
            <button onClick={doubleBet} disabled={phase !== "idle"} style={{
              background: "#1a1035", color: "#ddd0f8", border: "1px solid #1e1535",
              borderRadius: "6px", padding: "8px 0", fontWeight: 500, fontSize: "13px",
              cursor: phase !== "idle" ? "not-allowed" : "pointer",
            }}>2×</button>
            <button onClick={maxBet} disabled={phase !== "idle"} style={{
              background: "#1a1035", color: "#ddd0f8", border: "1px solid #1e1535",
              borderRadius: "6px", padding: "8px 0", fontWeight: 500, fontSize: "13px",
              cursor: phase !== "idle" ? "not-allowed" : "pointer",
            }}>{T("btnMax")}</button>
          </div>
        </div>

        {/* Apuesta button */}
        <button
          className="limbo-ctrl-bet-btn"
          onClick={startRoll}
          disabled={phase !== "idle" || (!!currentUser && (betUsd <= 0 || insuff))}
          style={{
            width: "100%", padding: "14px", borderRadius: "6px", border: "none",
            background: (phase === "idle" && canBet && betUsd > 0)
              ? "linear-gradient(180deg,#A855F7,#7C3AED)"
              : (phase === "idle" && !currentUser)
                ? "linear-gradient(180deg,#A855F7,#7C3AED)"
                : "#1a1035",
            color: ((phase === "idle" && canBet && betUsd > 0) || (phase === "idle" && !currentUser)) ? "#fff" : "#2d1f52",
            fontWeight: 600, fontSize: "15px",
            cursor: (phase === "idle") ? "pointer" : "not-allowed",
            boxShadow: ((phase === "idle" && canBet && betUsd > 0) || (phase === "idle" && !currentUser))
              ? "0 4px 22px rgba(26,159,255,.35)" : "none",
            transition: "all .2s",
            marginTop: "4px",
          }}
        >
          {insuff ? T("insufficientBal") : T("limboBet")}
        </button>

        {/* Ganancias */}
        <div className="limbo-ctrl-profit" style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#7c6d9e", fontWeight: 500, marginBottom: "6px", fontSize: "12px", paddingLeft: "4px" }}>{T("limboProfit")}</div>

          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: "#0D0F1A", border: "1px solid #1e1535",
            borderRadius: "6px", padding: "8px 14px",
          }}>
            <span style={{
              fontSize: "16px", color: "#7c6d9e", fontWeight: 500, whiteSpace: "nowrap",
              opacity: currencyFade, transition: "opacity 0.18s ease",
            }}>{displayCurrency}</span>
            <input
              readOnly
              value={(() => {
                if (betDisplay <= 0) return "—";
                const v = betDisplay * targetMultNum;
                return v > 0 ? v.toFixed(2) : "—";
              })()}
              style={{
                flex: 1, background: "transparent", border: "none",
                color: betDisplay > 0 ? "#00d95f" : "#4a3070",
                fontSize: "17px", fontWeight: 600, padding: "0",
                minWidth: 0, outline: "none", fontFamily: "inherit",
                opacity: currencyFade, transition: "opacity 0.18s ease",
              }}
            />
          </div>
        </div>
        </>}

        {activeTab === "auto" && <>

        {/* Monto de apuesta (auto) */}
        <div className="limbo-ctrl-amount" style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#7c6d9e", fontWeight: 500, marginBottom: "6px", fontSize: "13px", paddingLeft: "4px" }}>{T("betAmount")}</div>

          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: "#0D0F1A",
            border: `1px solid ${insuff ? "#c0392b" : "#1e1535"}`,
            borderRadius: "6px", padding: "8px 14px", marginBottom: "8px", transition: "border .15s",
          }}>
            <span style={{
              fontSize: "13px", color: "#7c6d9e", fontWeight: 500, whiteSpace: "nowrap",
              opacity: currencyFade, transition: "opacity 0.18s ease",
            }}>{displayCurrency}</span>
            <input
              value={fmtBetInput(bet)}
              onChange={e => {
                const v = displayInFiat
                  ? e.target.value.replace(/\./g, "").replace(",", ".")
                  : e.target.value;
                clampBetStr(v);
              }}
              onBlur={commitBet}
              disabled={autoRunning}
              type="text" inputMode="decimal" placeholder={displayInFiat ? "0,00" : "0.00"}
              style={{
                flex: 1, background: "transparent", border: "none",
                color: autoRunning ? "#4a3070" : "white",
                fontSize: "17px", fontWeight: 600, padding: "0",
                minWidth: 0, outline: "none", fontFamily: "inherit",
                opacity: currencyFade, transition: "opacity 0.18s ease",
              }}
            />
            <button
              onClick={() => setBet("0.00")}
              disabled={autoRunning}
              style={{
                background: "#0D0F1A", border: "1px solid #1e1535", borderRadius: "6px",
                color: "#818cf8", fontSize: "11px", fontWeight: 500,
                padding: "4px 8px", cursor: autoRunning ? "not-allowed" : "pointer",
                letterSpacing: "0.04em", whiteSpace: "nowrap", textTransform: "uppercase",
                marginRight: "-8px",
              }}
            >{T("limboClear")}</button>
          </div>

          {insuff && (
            <div style={{ fontSize: "11.5px", color: "#e74c3c", fontWeight: 600, paddingLeft: "2px", marginBottom: "8px" }}>
              {T("insufficientBal")}
            </div>
          )}

          {/* Quick buttons: Min, ½, 2×, Max */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "6px", marginBottom: "8px" }}>
            <button onClick={minBet} disabled={autoRunning || phase !== "idle"} style={{
              background: "#1a1035", color: "#ddd0f8", border: "1px solid #1e1535",
              borderRadius: "6px", padding: "8px 0", fontWeight: 500, fontSize: "13px",
              cursor: (autoRunning || phase !== "idle") ? "not-allowed" : "pointer",
              opacity: (autoRunning || phase !== "idle") ? 0.45 : 1,
            }}>{T("btnMin")}</button>
            <button onClick={halveBet} disabled={autoRunning || phase !== "idle"} style={{
              background: "#1a1035", color: "#ddd0f8", border: "1px solid #1e1535",
              borderRadius: "6px", padding: "8px 0", fontWeight: 500, fontSize: "13px",
              cursor: (autoRunning || phase !== "idle") ? "not-allowed" : "pointer",
              opacity: (autoRunning || phase !== "idle") ? 0.45 : 1,
            }}>½</button>
            <button onClick={doubleBet} disabled={autoRunning || phase !== "idle"} style={{
              background: "#1a1035", color: "#ddd0f8", border: "1px solid #1e1535",
              borderRadius: "6px", padding: "8px 0", fontWeight: 500, fontSize: "13px",
              cursor: (autoRunning || phase !== "idle") ? "not-allowed" : "pointer",
              opacity: (autoRunning || phase !== "idle") ? 0.45 : 1,
            }}>2×</button>
            <button onClick={maxBet} disabled={autoRunning || phase !== "idle"} style={{
              background: "#1a1035", color: "#ddd0f8", border: "1px solid #1e1535",
              borderRadius: "6px", padding: "8px 0", fontWeight: 500, fontSize: "13px",
              cursor: (autoRunning || phase !== "idle") ? "not-allowed" : "pointer",
              opacity: (autoRunning || phase !== "idle") ? 0.45 : 1,
            }}>{T("btnMax")}</button>
          </div>
        </div>

        {/* Start / Stop button */}
        {autoRunning ? (
          <button className="limbo-ctrl-startbtn" onClick={stopAuto} style={{
            width: "100%", padding: "14px", background: "#c0392b",
            color: "#fff", border: "none", borderRadius: "6px",
            fontWeight: 500, fontSize: "16px", cursor: "pointer",
            marginTop: "4px",
          }}>{T("stopAuto")}</button>
        ) : (
          <button
            className="limbo-ctrl-startbtn"
            onClick={startAuto}
            disabled={
              betUsd < 0.0099 || insuff
              || (!autoInfinite && (autoCount === "" || (parseInt(autoCount) || 0) <= 0))
            }
            style={{
              width: "100%", padding: "14px", borderRadius: "6px", border: "none",
              background: (betUsd < 0.0099 || insuff
                || (!autoInfinite && (autoCount === "" || (parseInt(autoCount) || 0) <= 0)))
                ? "#1a1035" : "linear-gradient(180deg,#A855F7,#7C3AED)",
              color: (betUsd < 0.0099 || insuff
                || (!autoInfinite && (autoCount === "" || (parseInt(autoCount) || 0) <= 0)))
                ? "#2d1f52" : "#fff",
              fontWeight: 600, fontSize: "15px",
              cursor: (betUsd < 0.0099 || insuff
                || (!autoInfinite && (autoCount === "" || (parseInt(autoCount) || 0) <= 0)))
                ? "not-allowed" : "pointer",
              boxShadow: (betUsd < 0.0099 || insuff
                || (!autoInfinite && (autoCount === "" || (parseInt(autoCount) || 0) <= 0)))
                ? "none" : "0 4px 22px rgba(26,159,255,.35)",
              transition: "all .2s",
              marginTop: "4px",
            }}
          >{insuff ? T("insufficientBal") : T("startAuto")}</button>
        )}

        <div className="limbo-ctrl-advanced-wrap" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {/* Advanced toggle */}
        <div
          onClick={() => setShowAdvanced(v => !v)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", background: "#0D0F1A",
            borderRadius: "6px", border: "1px solid #1a1035",
            cursor: "pointer", userSelect: "none",
          }}>
          <span style={{ color: "#7c6d9e", fontWeight: 500, fontSize: "13px" }}>{T("limboAdvanced")}</span>
          <div
            style={{
              width: "42px", height: "24px", borderRadius: "6px",
              background: showAdvanced ? "#7C3AED" : "#2d1f52",
              position: "relative", transition: "background .2s", flexShrink: 0,
            }}>
            <div style={{
              position: "absolute", top: "3px", left: showAdvanced ? "21px" : "3px",
              width: "18px", height: "18px", borderRadius: "50%",
              background: "#fff", transition: "left .2s", boxShadow: "0 1px 4px #0005",
            }} />
          </div>
        </div>

        {showAdvanced && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* On Win */}
            <div>
              <div style={{ color: "#7c6d9e", fontWeight: 500, fontSize: "12px", marginBottom: "5px" }}>{T("limboOnWin")}</div>
              <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
                {(["reset", "increase"] as const).map(m => (
                  <button key={m} onClick={() => setAutoOnWin(m)}
                    style={{
                      flex: 1, padding: "7px 0", borderRadius: "6px",
                      fontSize: "12px", fontWeight: 500, cursor: "pointer", border: "none",
                      background: autoOnWin === m ? "#7C3AED" : "#1a1035",
                      color: autoOnWin === m ? "#fff" : "#a78bfa",
                      transition: "background .15s",
                    }}>
                    {m === "reset" ? T("limboReset") : T("limboIncrease")}
                  </button>
                ))}
              </div>
              {autoOnWin === "increase" && (
                <div style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  background: "#0D0F1A", border: "1px solid #1e1535",
                  borderRadius: "6px", padding: "6px 10px",
                }}>
                  <input value={autoOnWinPct}
                    onChange={e => setAutoOnWinPct(e.target.value.replace(/[^\d.]/g, ""))}
                    type="text" inputMode="decimal" placeholder="0"
                    style={{
                      flex: 1, background: "transparent", border: "none", color: "#fff",
                      fontSize: "16px", fontWeight: 500, minWidth: 0, outline: "none",
                    }} />
                  <span style={{ color: "#7c6d9e", fontWeight: 500, fontSize: "14px" }}>%</span>
                </div>
              )}
            </div>

            {/* On Lose */}
            <div>
              <div style={{ color: "#7c6d9e", fontWeight: 500, fontSize: "12px", marginBottom: "5px" }}>{T("limboOnLose")}</div>
              <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
                {(["reset", "increase"] as const).map(m => (
                  <button key={m} onClick={() => setAutoOnLose(m)}
                    style={{
                      flex: 1, padding: "7px 0", borderRadius: "6px",
                      fontSize: "12px", fontWeight: 500, cursor: "pointer", border: "none",
                      background: autoOnLose === m ? "#7C3AED" : "#1a1035",
                      color: autoOnLose === m ? "#fff" : "#a78bfa",
                      transition: "background .15s",
                    }}>
                    {m === "reset" ? T("limboReset") : T("limboIncrease")}
                  </button>
                ))}
              </div>
              {autoOnLose === "increase" && (
                <div style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  background: "#0D0F1A", border: "1px solid #1e1535",
                  borderRadius: "6px", padding: "6px 10px",
                }}>
                  <input value={autoOnLosePct}
                    onChange={e => setAutoOnLosePct(e.target.value.replace(/[^\d.]/g, ""))}
                    type="text" inputMode="decimal" placeholder="0"
                    style={{
                      flex: 1, background: "transparent", border: "none", color: "#fff",
                      fontSize: "16px", fontWeight: 500, minWidth: 0, outline: "none",
                    }} />
                  <span style={{ color: "#7c6d9e", fontWeight: 500, fontSize: "14px" }}>%</span>
                </div>
              )}
            </div>

            {/* Stop on Profit */}
            <div>
              <div style={{ color: "#7c6d9e", fontWeight: 500, fontSize: "12px", marginBottom: "5px" }}>{T("limboStopWin")}</div>
              <div style={{
                display: "flex", alignItems: "center", gap: "6px",
                background: "#0D0F1A", border: "1px solid #1e1535",
                borderRadius: "6px", padding: "6px 10px",
              }}>
                <span style={{ color: "#7c6d9e", fontWeight: 500, fontSize: "13px", whiteSpace: "nowrap" }}>{displayCurrency}</span>
                <input value={autoStopProfit}
                  onChange={e => setAutoStopProfit(e.target.value.replace(/[^\d.]/g, ""))}
                  type="text" inputMode="decimal" placeholder="0.00"
                  style={{
                    flex: 1, background: "transparent", border: "none", color: "#fff",
                    fontSize: "15px", fontWeight: 500, minWidth: 0, outline: "none",
                  }} />
              </div>
            </div>

            {/* Stop on Loss */}
            <div>
              <div style={{ color: "#7c6d9e", fontWeight: 500, fontSize: "12px", marginBottom: "5px" }}>{T("limboStopLose")}</div>
              <div style={{
                display: "flex", alignItems: "center", gap: "6px",
                background: "#0D0F1A", border: "1px solid #1e1535",
                borderRadius: "6px", padding: "6px 10px",
              }}>
                <span style={{ color: "#7c6d9e", fontWeight: 500, fontSize: "13px", whiteSpace: "nowrap" }}>{displayCurrency}</span>
                <input value={autoStopLoss}
                  onChange={e => setAutoStopLoss(e.target.value.replace(/[^\d.]/g, ""))}
                  type="text" inputMode="decimal" placeholder="0.00"
                  style={{
                    flex: 1, background: "transparent", border: "none", color: "#fff",
                    fontSize: "15px", fontWeight: 500, minWidth: 0, outline: "none",
                  }} />
              </div>
            </div>
          </div>
        )}
        </div>{/* end limbo-ctrl-advanced-wrap */}

        {/* Number of bets + ∞ */}
        <div className="limbo-ctrl-numbets" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ color: "#7c6d9e", fontWeight: 500, fontSize: "12px" }}>{T("limboNumBets")}</span>
          {(() => {
            const countInvalid = !autoInfinite && (autoCount === "" || (parseInt(autoCount) || 0) <= 0);
            return (
              <>
                <div style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  background: "#0D0F1A",
                  border: `1px solid ${countInvalid ? "#c0392b" : "#1e1535"}`,
                  borderRadius: "6px", padding: "6px 10px",
                }}>
                  <input
                    value={autoRunning
                      ? (autoInfinite ? `${999999 - autoRemaining}/∞` : `${(parseInt(autoCount) || 0) - autoRemaining}/${autoCount}`)
                      : (autoInfinite ? "∞" : autoCount)}
                    onChange={e => { setAutoInfinite(false); setAutoCount(e.target.value); }}
                    onBlur={() => { if (!autoInfinite && (autoCount === "" || (parseInt(autoCount) || 0) <= 0)) setAutoCount("1"); }}
                    type={(autoInfinite || autoRunning) ? "text" : "number"} min="1"
                    readOnly={autoInfinite || autoRunning}
                    style={{
                      flex: 1, background: "transparent", border: "none",
                      color: "white", fontSize: "17px", padding: "4px",
                      minWidth: 0, outline: "none", fontFamily: "inherit",
                    }}
                  />
                  <button
                    onClick={() => { if (!autoRunning) setAutoInfinite(v => !v); }}
                    disabled={autoRunning}
                    style={{
                      padding: "4px 10px", borderRadius: "6px",
                      background: autoInfinite ? "#7C3AED" : "#1e1535",
                      color: "#ddd0f8", border: "none", fontWeight: 500,
                      cursor: autoRunning ? "not-allowed" : "pointer",
                      fontSize: "16px", opacity: autoRunning ? 0.5 : 1,
                    }}
                  >∞</button>
                </div>
                {countInvalid && (
                  <div style={{ fontSize: "11.5px", color: "#e74c3c", fontWeight: 600, paddingLeft: "2px" }}>
                    {T("limboMinOneBet")}
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Ganancias (auto) */}
        <div className="limbo-ctrl-profit" style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#7c6d9e", fontWeight: 500, marginBottom: "6px", fontSize: "12px", paddingLeft: "4px" }}>{T("limboProfit")}</div>
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: "#0D0F1A", border: "1px solid #1e1535",
            borderRadius: "6px", padding: "8px 14px",
          }}>
            <span style={{
              fontSize: "16px", color: "#7c6d9e", fontWeight: 500, whiteSpace: "nowrap",
              opacity: currencyFade, transition: "opacity 0.18s ease",
            }}>{displayCurrency}</span>
            <input
              readOnly
              value={(() => {
                if (betDisplay <= 0) return "—";
                const v = betDisplay * targetMultNum;
                return v > 0 ? v.toFixed(2) : "—";
              })()}
              style={{
                flex: 1, background: "transparent", border: "none",
                color: betDisplay > 0 ? "#00d95f" : "#4a3070",
                fontSize: "17px", fontWeight: 600, padding: "0",
                minWidth: 0, outline: "none", fontFamily: "inherit",
                opacity: currencyFade, transition: "opacity 0.18s ease",
              }}
            />
          </div>
        </div>
        </>}

        </div>{/* end scrollable content */}

        {/* Stats + volume buttons (footer) — always visible, not scrollable */}
        <div className="limbo-icon-footer" style={{ flexShrink:0, display:"flex", alignItems:"center", justifyContent:"flex-start", gap:"8px", padding:"12px 16px", borderTop:(activeTab === "auto" && showAdvanced) ? "1px solid #1a1035" : "none" }}>
          <button
            onClick={() => setShowStats(v => !v)}
            title={T("statsTitle")}
            style={{
              width:"38px", height:"38px", minHeight:"38px", maxHeight:"38px", borderRadius:"8px", padding:0, overflow:"hidden", boxSizing:"border-box",
              background: showStats ? "#7C3AED" : "#0D0F1A",
              border: showStats ? "1px solid #A855F7" : "1px solid #1a1035",
              color: showStats ? "#fff" : "#a78bfa",
              cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
              transition:"background .15s,border-color .15s,color .15s",
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
            </svg>
          </button>
          <button
            onClick={() => setVol(v => v > 0 ? 0 : 70)}
            title={T("volumeTitle")}
            style={{
              width:"38px", height:"38px", minHeight:"38px", maxHeight:"38px", borderRadius:"8px", padding:0, overflow:"hidden", boxSizing:"border-box",
              background:"#0D0F1A", border:"1px solid #1a1035", color:"#a78bfa",
              cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
              transition:"background .15s,border-color .15s,color .15s",
            }}
          >
            {vol === 0 ? (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
            ) : vol < 50 ? (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            )}
          </button>
          {/* Turbo button */}
          <button
            onClick={toggleTurbo}
            title={turbo ? "Turbo: ON" : "Turbo: OFF"}
            style={{
              width:"38px", height:"38px", minHeight:"38px", maxHeight:"38px", borderRadius:"8px", padding:0, overflow:"hidden", boxSizing:"border-box",
              background: turbo ? "linear-gradient(135deg,#A855F7,#7C3AED)" : "#0D0F1A",
              border: turbo ? "1px solid #A855F7" : "1px solid #1a1035",
              color: turbo ? "#fff" : "#a78bfa",
              cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
              transition:"background .2s,border .2s,color .2s,box-shadow .2s",
              boxShadow: turbo ? "0 0 14px rgba(168,85,247,.45)" : "none",
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ─── RIGHT / MAIN AREA ─── */}
      <div className="limbo-game-area" style={{
        flex: 1, display: "flex", flexDirection: "column",
        background: "#0A0A12", padding: "20px",
        minHeight: "560px", position: "relative",
        boxSizing: "border-box", minWidth: 0,
      }}>
        {/* History pills (matches Dice style) */}
        {(() => {
          const pillCount = window.innerWidth < 768 ? 6 : 10;
          const pct = 100 / pillCount;
          const gapTotal = (pillCount - 1) * 6;
          const pillW = `calc(${pct}% - ${(gapTotal / pillCount).toFixed(2)}px)`;
          return (
            <div style={{
              display: "flex", gap: "6px", flexWrap: "nowrap",
              minHeight: "38px", overflow: "hidden", marginBottom: "6px",
            }}>
              {historyChips.slice(0, pillCount).map((h, i) => (
                <div key={`${h.win}_${h.mult}_${i}`} style={{
                  flex: `0 0 ${pillW}`, minWidth: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "7px 2px", borderRadius: "6px",
                  fontWeight: 800, fontFamily: "'Inter',sans-serif",
                  background: h.win ? "#1eff00" : "#ef4444",
                  fontSize: "11.7px",
                  color: h.win ? "#0A0A12" : "white",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {h.mult.toFixed(2)}
                </div>
              ))}
            </div>
          );
        })()}

        {/* Big result number — centered */}
        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            fontSize: "clamp(72px, 14vw, 150px)",
            fontWeight: 800, color: resultColor,
            fontFamily: "'Inter', Arial, sans-serif",
            letterSpacing: "-0.04em",
            transition: "color .25s",
            textAlign: "center",
            textShadow: "none",
            animation: "none",
          }}>
            {showResultNumber.toFixed(2)}x
          </div>
        </div>

        {/* Bottom: Multiplicador + Chance */}
        <div className="limbo-stat-grid" style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px",
          marginTop: "20px", maxWidth: "720px",
          marginLeft: "auto", marginRight: "auto", width: "100%",
          boxSizing: "border-box",
        }}>
          {/* Multiplicador */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ color: "#7c6d9e", fontWeight: 500, fontSize: "12px" }}>{T("limboMultiplier")}</span>
            <div style={{
              display: "flex", alignItems: "center",
              background: "#0D0F1A", border: "1px solid #1e1535",
              borderRadius: "6px", padding: "10px 14px",
            }}>
              <input
                value={targetMult}
                onChange={e => setMultStr(e.target.value)}
                onBlur={commitMult}
                disabled={phase !== "idle"}
                type="text" inputMode="decimal"
                style={{
                  flex: 1, background: "transparent", border: "none",
                  color: phase !== "idle" ? "#4a3070" : "white",
                  fontSize: "17px", fontWeight: 600, padding: "0",
                  minWidth: 0, outline: "none", fontFamily: "inherit",
                }}
              />
              <span style={{ color: "#818cf8", fontSize: "13px", fontWeight: 600 }}>×</span>
            </div>
          </div>

          {/* Chance */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ color: "#7c6d9e", fontWeight: 500, fontSize: "12px" }}>{T("limboChance")}</span>
            <div style={{
              display: "flex", alignItems: "center",
              background: "#0D0F1A", border: "1px solid #1e1535",
              borderRadius: "6px", padding: "10px 14px",
            }}>
              <input
                value={chancePct.toFixed(2)}
                readOnly
                style={{
                  flex: 1, background: "transparent", border: "none",
                  color: "white", fontSize: "17px", fontWeight: 600, padding: "0",
                  minWidth: 0, outline: "none", fontFamily: "inherit",
                }}
              />
              <span style={{ color: "#7c6d9e", fontSize: "13px", fontWeight: 600 }}>%</span>
            </div>
          </div>
        </div>

        {/* Inline keyframes */}
        <style>{`
        `}</style>
      </div>

      {/* ── Stats popup (portal) ── */}
      {showStats && createPortal(
        <div style={{
          position:"fixed", left: statsPos.x, top: statsPos.y,
          zIndex:9999, width:"260px",
          background:"#0A0A12", border:"1px solid #1e1535",
          borderRadius:"6px", boxShadow:"0 8px 32px rgba(0,0,0,.7)",
          overflow:"hidden", userSelect:"none",
        }}>
          <div
            onMouseDown={handleStatsDragStart}
            style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"10px 14px", background:"#0D0F1A",
              borderBottom: statsCollapsed ? "none" : "1px solid #1e1535", cursor:"grab", touchAction:"none",
            }}
          >
            <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
              <span style={{ display:"flex",alignItems:"center",color:"#a78bfa" }}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
              </span>
              <strong style={{ fontSize:"13px", color:"#ead4fc" }}>{T("statsTitle")}</strong>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:"4px" }}>
              <button onClick={() => setStatsCollapsed(v=>!v)} style={{ background:"none",border:"none",color:"#a78bfa",cursor:"pointer",lineHeight:1,padding:"2px 4px",display:"flex",alignItems:"center" }}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{statsCollapsed ? <polyline points="6 9 12 15 18 9"/> : <polyline points="6 15 12 9 18 15"/>}</svg>
              </button>
              <button onClick={() => setShowStats(false)} style={{ background:"none", border:"none", color:"#a78bfa", fontSize:"18px", cursor:"pointer", lineHeight:1, padding:"0 2px" }}>×</button>
            </div>
          </div>
          <div style={{ padding:"12px", display: statsCollapsed ? "none" : "block" }}>
            <div style={{ background:"#0A0A12", borderRadius:"6px", padding:"12px", display:"flex", flexDirection:"column", gap:"8px" }}>
              {([
                { label:T("bjNetProfit"), value: fmtMoney(convertUsd(limboStats.profit)), color: limboStats.profit >= 0 ? "#16ff5c" : "#ff5959" },
                { label:T("bjWins"),      value: String(limboStats.wins),                   color:"#16ff5c" },
                { label:T("bjWagered"),   value: fmtMoney(convertUsd(limboStats.wagered)), color:"#ead4fc" },
                { label:T("bjLosses"),    value: String(limboStats.losses),                 color:"#ff5959" },
              ] as { label:string; value:string; color:string }[]).map(s => (
                <div key={s.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ color:"#a78bfa", fontSize:"11.5px" }}>{s.label}</span>
                  <span style={{ color:s.color, fontWeight:500, fontSize:"13px" }}>{s.value}</span>
                </div>
              ))}
            </div>
            {/* Mini chart — cumulative profit */}
            {(()=>{
              const raw = limboStats.history.length>0 ? limboStats.history.slice().reverse() : null;
              const W=320, H=210, PAD_X=12, PAD_Y=20;
              const chartW = W-PAD_X*2, chartH = H-PAD_Y*2;
              interface LChartPt { cum:number; win:boolean; profit:number }
              let series: LChartPt[] = [];
              if (raw) {
                let running = 0;
                series = raw.map(p => { running += (p.profit??0); return { cum:running, win:p.win, profit:p.profit??0 }; });
              }
              const allPts: LChartPt[] = raw ? [{ cum:0, win:false, profit:0 }, ...series] : [];
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
              const tipXpct = hIdx!==null && xs.length ? (xs[hIdx]/W)*100 : 0;
              const tipYpct = hIdx!==null && ys.length ? (ys[hIdx]/H)*100 : 0;
              const tipLeft = Math.min(Math.max(tipXpct, 12), 78);
              const tipTop  = Math.max(tipYpct - 14, 2);
              if (n < 2) return (
                <div style={{ marginTop:"10px", position:"relative", background:"#0A0A12", borderRadius:"6px", height:"190px", display:"flex", alignItems:"center", justifyContent:"center", border:"1px solid #1e1535" }}>
                  <span style={{ color:"#2d1f52", fontSize:"12px" }}>{T("noHistory")}</span>
                </div>
              );
              const linePath = xs.map((x,i)=>`${i===0?"M":"L"}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
              const fillAbove = linePath + ` L${xs[n-1].toFixed(1)} ${zeroY.toFixed(1)} L${xs[0].toFixed(1)} ${zeroY.toFixed(1)} Z`;
              const fillBelow = linePath + ` L${xs[n-1].toFixed(1)} ${zeroY.toFixed(1)} L${xs[0].toFixed(1)} ${zeroY.toFixed(1)} Z`;
              return (
                <div style={{ marginTop:"10px", position:"relative", background:"#0A0A12", borderRadius:"6px", height:"190px", overflow:"visible", border:"1px solid #1e1535" }}>
                  {hpt && (
                    <div style={{
                      position:"absolute", left:`${tipLeft}%`, top:`${tipTop}%`,
                      transform:"translateX(-50%) translateY(-100%)",
                      background:"#1a1035", border:`1.5px solid ${hpt.profit>=0?"#19ff35":"#ff3350"}`,
                      borderRadius:"8px", padding:"4px 10px", fontSize:"12px", fontWeight:500,
                      color: hpt.profit>=0?"#19ff35":"#ff3350", whiteSpace:"nowrap",
                      pointerEvents:"none", zIndex:20,
                      boxShadow:`0 2px 12px ${hpt.profit>=0?"rgba(25,255,53,.3)":"rgba(255,51,80,.3)"}`,
                    }}>
                      {hpt.profit>=0?"+":""}{fmtMoney(convertUsd(hpt.profit))}
                      <span style={{ color:"#a78bfa", fontWeight:400, fontSize:"10px", marginLeft:"6px" }}>
                        acum: {hpt.cum>=0?"+":""}{fmtMoney(convertUsd(hpt.cum))}
                      </span>
                    </div>
                  )}
                  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width:"100%", height:"100%", display:"block", cursor:"crosshair" }}
                    onMouseMove={e=>{
                      if (!xs.length) return;
                      const cx = e.clientX;
                      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
                      const rLeft = rect.left, rWidth = rect.width;
                      if (chartHoverRafRef.current !== null) cancelAnimationFrame(chartHoverRafRef.current);
                      chartHoverRafRef.current = requestAnimationFrame(() => {
                        const svgX = ((cx - rLeft) / rWidth) * W;
                        let closest = 0, minDist = Infinity;
                        xs.forEach((x,i)=>{ const d=Math.abs(x-svgX); if(d<minDist){ minDist=d; closest=i; } });
                        setChartHover(closest);
                        chartHoverRafRef.current = null;
                      });
                    }}
                    onMouseLeave={()=>{ if(chartHoverRafRef.current!==null){cancelAnimationFrame(chartHoverRafRef.current);chartHoverRafRef.current=null;} setChartHover(null); }}
                  >
                    <defs>
                      <clipPath id="limboClipAbove"><rect x={PAD_X} y={PAD_Y} width={chartW} height={zeroY-PAD_Y}/></clipPath>
                      <clipPath id="limboClipBelow"><rect x={PAD_X} y={zeroY} width={chartW} height={chartH-(zeroY-PAD_Y)}/></clipPath>
                    </defs>
                    {n>1 ? <>
                      <path d={fillBelow} fill="rgba(200,30,30,.35)" clipPath="url(#limboClipBelow)"/>
                      <path d={fillAbove} fill="rgba(25,255,80,.18)" clipPath="url(#limboClipAbove)"/>
                      <line x1={PAD_X} y1={zeroY} x2={W-PAD_X} y2={zeroY} stroke="#1e1535" strokeWidth="1.5"/>
                      <path d={linePath} fill="none" stroke="#19ff35" strokeWidth="2.5" strokeLinejoin="miter" strokeLinecap="square" clipPath="url(#limboClipAbove)"/>
                      <path d={linePath} fill="none" stroke="#e03030" strokeWidth="2.5" strokeLinejoin="miter" strokeLinecap="square" clipPath="url(#limboClipBelow)"/>
                      <rect x={PAD_X} y={PAD_Y} width={chartW} height={chartH} fill="transparent"/>
                      {hIdx!==null && hIdx<allPts.length && (
                        <>
                          <line x1={xs[hIdx]} y1={PAD_Y} x2={xs[hIdx]} y2={H-PAD_Y} stroke="#2d1f52" strokeWidth="1" strokeDasharray="4,3"/>
                          <circle cx={xs[hIdx]} cy={ys[hIdx]} r="5"
                            fill={allPts[hIdx].profit>=0?"#19ff35":"#ff3350"}
                            stroke="#0A0A12" strokeWidth="2"
                            style={{ pointerEvents:"none" }}/>
                        </>
                      )}
                    </> : (
                      <line x1={PAD_X} y1={H/2} x2={W-PAD_X} y2={H/2} stroke="#1e1535" strokeWidth="1.5"/>
                    )}
                  </svg>
                </div>
              );
            })()}

            <button
              onClick={() => setLimboStats(limboStatsDefault)}
              style={{
                width:"100%", marginTop:"8px", background:"transparent",
                border:"1px solid #1e1535", borderRadius:"8px", color:"#a78bfa",
                fontSize:"12px", cursor:"pointer", padding:"6px 0",
                display:"flex", alignItems:"center", justifyContent:"center", gap:"6px",
                transition:"color .15s,border-color .15s,background .15s",
              }}
              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color="#fff"; b.style.borderColor="#A855F7"; b.style.background="#0A0A12"; }}
              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color="#a78bfa"; b.style.borderColor="#1e1535"; b.style.background="transparent"; }}
            >
              <span style={{ fontSize:"13px" }}>↺</span> {T("resetStats")}
            </button>
          </div>
        </div>
      , document.body)}
    </div>
  );
};

export default LimboGame;
