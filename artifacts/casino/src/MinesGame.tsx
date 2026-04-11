import React, { useState, useEffect, useRef, useCallback } from "react";
import { gt } from "./lib/gameLabels";

// ── Types ──────────────────────────────────────────────────────────────────
export interface MinesStats {
  wins: number; losses: number; profit: number; wagered: number;
  history: { profit: number; win: boolean }[];
}
export const minesStatsDefault: MinesStats = { wins:0, losses:0, profit:0, wagered:0, history:[] };

export interface MinesGameProps {
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
  minesStats: MinesStats;
  setMinesStats: React.Dispatch<React.SetStateAction<MinesStats>>;
  currentUser: string;
  onResetStats: () => void;
  onRequestLogin?: () => void;
  onGameActive?: (active: boolean) => void;
}

type Phase = "idle" | "playing" | "gameover" | "cashed";
// "safe" = unrevealed safe tile shown after game over
interface Cell { isMine: boolean; state: "hidden" | "gem" | "mine" | "safe"; }

// ── Grid sizes ─────────────────────────────────────────────────────────────
const GRID_SIZES = [5, 6, 7, 8] as const;
type GridSize = 5 | 6 | 7 | 8;
function maxMinesFor(gs: GridSize) { return gs * gs - 1; }

const MINE_PRESETS: Record<GridSize, number[]> = {
  5: [1,  5, 20],
  6: [1,  5, 20],
  7: [1,  5, 20],
  8: [1,  5, 20],
};

// ── Multiplier (Stake-style, 4% house edge) ────────────────────────────────
function calcMultiplier(totalCells: number, mines: number, revealed: number): number {
  if (revealed === 0) return 1.0;
  let prob = 1.0;
  for (let i = 0; i < revealed; i++) prob *= (totalCells - mines - i) / (totalCells - i);
  return Math.max(1.0, +(1 / prob * 0.96).toFixed(4));
}
function nextMultiplier(totalCells: number, mines: number, revealed: number): number {
  return calcMultiplier(totalCells, mines, revealed + 1);
}
function formatMult(m: number): string {
  return m >= 100 ? m.toFixed(1) + "×" : m >= 10 ? m.toFixed(2) + "×" : m.toFixed(4) + "×";
}

// ── Build a shuffled grid ──────────────────────────────────────────────────
function buildGrid(totalCells: number, mines: number): Cell[] {
  const cells: Cell[] = Array.from({ length: totalCells }, () => ({ isMine: false, state: "hidden" as const }));
  const pos = Array.from({ length: totalCells }, (_, i) => i);
  for (let i = pos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pos[i], pos[j]] = [pos[j], pos[i]];
  }
  for (let i = 0; i < mines; i++) cells[pos[i]].isMine = true;
  return cells;
}

const SAVE_KEY = "mines_game_state";

// ── Icons (PNG images) ─────────────────────────────────────────────────────
function GemIcon({ size = 36, dim = false }: { size?: number; dim?: boolean }) {
  return (
    <img
      src="/diamond.png"
      alt="gem"
      width={size}
      height={size}
      style={{
        objectFit:"contain", opacity: dim ? 0.3 : 1, display:"block", pointerEvents:"none",
        animation: dim ? undefined : "minesGemShimmer 2.8s ease-in-out infinite",
        filter: dim ? undefined : "drop-shadow(0 0 6px rgba(80,180,255,0.5))",
      }}
    />
  );
}

function MineIcon({ size = 34, exploding = false }: { size?: number; exploding?: boolean }) {
  return (
    <img
      src="/bomb2.png"
      alt="bomb"
      width={size}
      height={size}
      style={{
        objectFit:"contain", display:"block", pointerEvents:"none",
        animation: exploding ? "bombExplode 0.55s cubic-bezier(0.36,0.07,0.19,0.97) both" : undefined,
      }}
    />
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function MinesGame({
  balance, fmtMoney, convertUsd, displayCurrency, currencyFade,
  onBack, onBalanceChange, addBet, onBetRecord, liveRates,
  minesStats, setMinesStats, currentUser, onResetStats, onRequestLogin,
  onGameActive, lang,
}: MinesGameProps) {
  const T = (k: string) => gt(lang, k);

  const rate          = liveRates[displayCurrency] || 1;
  const maxBetDisplay = +(Math.floor(convertUsd(balance) * 100) / 100).toFixed(2);
  const minBetDisplay = +(Math.ceil(convertUsd(0.01) * 100) / 100).toFixed(2);

  const [betDisplay, setBetDisplay] = useState("1.00");
  const [gridSize, setGridSize]     = useState<GridSize>(5);
  const [mineCount, setMineCount]   = useState(3);
  const [phase, setPhase]           = useState<Phase>("idle");
  const [grid, setGrid]             = useState<Cell[]>([]);
  const [revealedSafe, setRevealedSafe] = useState(0);
  const [currentMult, setCurrentMult]   = useState(1.0);
  const [lastProfit, setLastProfit]     = useState(0);
  const [customMineOpen, setCustomMineOpen] = useState(false);
  const [customMineInput, setCustomMineInput] = useState("");
  const [revealingIdx, setRevealingIdx] = useState<number | null>(null);
  const [explodingIdx, setExplodingIdx] = useState<number | null>(null);
  const [resultOverlay, setResultOverlay] = useState<{ type: "win" | "loss"; amount: number } | null>(null);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto mode ─────────────────────────────────────────────────────────
  const [autoMode, setAutoMode]           = useState(false);
  const [autoSelectedCells, setAutoSelectedCells] = useState<Set<number>>(new Set());
  const [autoInfinite, setAutoInfinite]   = useState(true);
  const [autoNumBetsInput, setAutoNumBetsInput] = useState("10");
  const [autoRunning, setAutoRunning]     = useState(false);
  const [autoRoundsPlayed, setAutoRoundsPlayed] = useState(0);
  const [autoAdvOpen, setAutoAdvOpen]     = useState(false);
  const autoRunRef            = useRef(false);
  const autoLoopIdRef         = useRef(0);
  const autoSelectedCellsRef  = useRef<Set<number>>(new Set());
  const autoStartDebounceRef  = useRef(0); // timestamp of last startAutoMines call
  const autoInfiniteRef       = useRef(true);
  const autoNumBetsRef        = useRef(10);
  const [autoSelecting, setAutoSelecting] = useState(false);  // true while the "select all" animation is running
  const autoSelectAnimRef     = useRef(0);                    // increment to cancel in-flight animation
  const autoRoundsPlayedRef   = useRef(0);
  const phaseRef              = useRef<Phase>("idle");

  const localBalRef   = useRef(balance);
  const betUsdRef     = useRef(0);
  const minesRef      = useRef(mineCount);
  const gridSizeRef   = useRef<GridSize>(gridSize);
  const revealedRef   = useRef(0);
  const gridRef       = useRef<Cell[]>([]);

  // ── Sound & Stats UI ───────────────────────────────────────────────────────
  const [minesVol, setMinesVol]           = useState(70);
  const minesVolRef                       = useRef(70);
  const [showMinesVol, setShowMinesVol]   = useState(false);
  const [showMinesStats, setShowMinesStats] = useState(false);
  const [minesStatsPos, setMinesStatsPos] = useState({ x: 270, y: 180 });
  const [minesChartHover, setMinesChartHover] = useState<number|null>(null);
  const isDraggingMinesStats = useRef(false);
  const minesStatsDragOffset = useRef({ x: 0, y: 0 });

  // ── Advanced auto config ───────────────────────────────────────────────────
  const [autoOnWin, setAutoOnWin]         = useState<"reset"|"increase">("reset");
  const [autoOnWinPct, setAutoOnWinPct]   = useState("0");
  const [autoOnLose, setAutoOnLose]       = useState<"reset"|"increase">("reset");
  const [autoOnLosePct, setAutoOnLosePct] = useState("0");
  const [autoStopProfit, setAutoStopProfit] = useState("");
  const [autoStopLoss, setAutoStopLoss]   = useState("");

  const totalCells = gridSize * gridSize;
  const totalSafe  = totalCells - mineCount;

  useEffect(() => { localBalRef.current = balance; }, [balance]);
  useEffect(() => { gridRef.current = grid; }, [grid]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { minesRef.current = mineCount; }, [mineCount]);
  useEffect(() => { gridSizeRef.current = gridSize; }, [gridSize]);
  useEffect(() => { autoSelectedCellsRef.current = autoSelectedCells; }, [autoSelectedCells]);
  useEffect(() => { autoInfiniteRef.current = autoInfinite; autoNumBetsRef.current = parseInt(autoNumBetsInput)||10; }, [autoInfinite, autoNumBetsInput]);
  // Clear auto selected cells when grid size changes
  useEffect(() => { setAutoSelectedCells(new Set()); }, [gridSize]);
  // Notify parent whether a game round / auto session is in progress
  useEffect(() => { onGameActive?.(phase === "playing" || autoRunning); }, [phase, autoRunning]);

  // Stop auto loop and refund in-flight bet when component unmounts (user navigated away)
  useEffect(() => {
    return () => {
      if (autoRunRef.current) {
        autoRunRef.current = false;
        autoLoopIdRef.current++; // invalidate all pending setTimeout callbacks
        // Refund any bet that was deducted but not yet paid out
        if (phaseRef.current === "playing" && betUsdRef.current > 0) {
          onBalanceChange(localBalRef.current + betUsdRef.current);
        }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset board when mineCount changes outside an active game
  const prevMineCountRef = useRef(mineCount);
  useEffect(() => {
    if (prevMineCountRef.current !== mineCount) {
      prevMineCountRef.current = mineCount;
      if (phaseRef.current !== "playing") {
        setGrid([]); gridRef.current = [];
        setRevealedSafe(0); setCurrentMult(1.0);
        revealedRef.current = 0;
        setPhase("idle"); phaseRef.current = "idle";
        setAutoSelectedCells(new Set()); autoSelectedCellsRef.current = new Set();
        setResultOverlay(null);
        localStorage.removeItem(SAVE_KEY + "_" + currentUser);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineCount]);

  useEffect(() => {
    const mx = maxMinesFor(gridSize);
    if (mineCount > mx) setMineCount(mx);
    gridSizeRef.current = gridSize;
  }, [gridSize, mineCount]);

  // Clear board when grid size changes outside of playing phase
  const prevGridSizeRef = useRef<GridSize>(gridSize);
  useEffect(() => {
    if (prevGridSizeRef.current !== gridSize) {
      prevGridSizeRef.current = gridSize;
      if (phase !== "playing") {
        setGrid([]);
        gridRef.current = [];
        setRevealedSafe(0);
        setCurrentMult(1.0);
        revealedRef.current = 0;
        setPhase("idle");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridSize]);

  const betNum     = parseFloat(betDisplay) || 0;
  const betUsd     = betNum / rate;
  const betInvalid = betNum < minBetDisplay - 0.001;
  const balInsuff  = betNum > maxBetDisplay + 0.001;
  const disabled   = phase === "playing" || autoRunning;
  // helper: reset auto cell selection when user changes grid/mines in auto mode
  function resetAutoIfNeeded() {
    if (autoMode && (autoSelectedCells.size > 0 || autoSelecting)) {
      autoSelectAnimRef.current++; // cancel in-flight animation
      setAutoSelecting(false);
      setAutoSelectedCells(new Set());
      autoSelectedCellsRef.current = new Set();
    }
  }
  const canBet     = !betInvalid && !balInsuff;

  function deductBal(usd: number) { localBalRef.current -= usd; onBalanceChange(localBalRef.current); }
  function creditBal(usd: number) { localBalRef.current += usd; onBalanceChange(localBalRef.current); }

  // ── Currency recalculation ─────────────────────────────────────────────
  const prevRateRef  = useRef<number>(liveRates[displayCurrency] || 1);
  const firstCurrRef = useRef(true);
  useEffect(() => {
    if (firstCurrRef.current) { firstCurrRef.current = false; prevRateRef.current = liveRates[displayCurrency] || 1; return; }
    const oldRate = prevRateRef.current, newRate = liveRates[displayCurrency] || 1;
    prevRateRef.current = newRate;
    const ratio = newRate / oldRate;
    if (!isFinite(ratio) || ratio === 1 || oldRate <= 0) return;
    setBetDisplay(v => { const n = parseFloat(v) || 0; return n > 0 ? (Math.round(n * ratio * 100) / 100).toFixed(2) : v; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayCurrency]);

  // ── Sound ─────────────────────────────────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);
  useEffect(() => { minesVolRef.current = minesVol; }, [minesVol]);

  const playSound = useCallback((type: "gem" | "mine" | "cashout" | "click") => {
    const vol = minesVolRef.current / 100;
    if (vol === 0) return;
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed")
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const g = ctx.createGain(); g.connect(ctx.destination);
      if (type === "click") {
        const osc = ctx.createOscillator(); osc.connect(g); osc.type = "sine";
        osc.frequency.setValueAtTime(800 + Math.random()*400, ctx.currentTime);
        g.gain.setValueAtTime(0.08 * vol, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
        osc.start(); osc.stop(ctx.currentTime + 0.07);
      } else if (type === "gem") {
        const osc = ctx.createOscillator(); osc.connect(g); osc.type = "sine";
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.15);
        g.gain.setValueAtTime(0.22 * vol, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
      } else if (type === "mine") {
        const bufLen = ctx.sampleRate * 0.5;
        const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 3);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const bq = ctx.createBiquadFilter(); bq.type = "lowpass"; bq.frequency.value = 400;
        src.connect(bq); bq.connect(g);
        g.gain.setValueAtTime(0.4 * vol, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        src.start();
      } else {
        [523, 659, 784, 1047].forEach((f, i) => {
          const osc = ctx.createOscillator();
          const og = ctx.createGain(); og.connect(ctx.destination);
          osc.connect(og); osc.frequency.value = f;
          og.gain.setValueAtTime(0.18 * vol, ctx.currentTime + i * 0.1);
          og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.35);
          osc.start(ctx.currentTime + i * 0.1); osc.stop(ctx.currentTime + i * 0.1 + 0.38);
        });
      }
    } catch { }
  }, []);

  // ── Stats drag ────────────────────────────────────────────────────────────
  function handleMinesStatsDragStart(e: React.MouseEvent) {
    e.preventDefault();
    isDraggingMinesStats.current = true;
    minesStatsDragOffset.current = { x: e.clientX - minesStatsPos.x, y: e.clientY - minesStatsPos.y };
    const onMove = (ev: MouseEvent) => {
      if (!isDraggingMinesStats.current) return;
      setMinesStatsPos({ x: ev.clientX - minesStatsDragOffset.current.x, y: ev.clientY - minesStatsDragOffset.current.y });
    };
    const onUp = () => {
      isDraggingMinesStats.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Auto mode functions ────────────────────────────────────────────────
  function toggleAutoCell(idx: number) {
    if (autoRunning) return;
    const maxSafe = gridSizeRef.current * gridSizeRef.current - minesRef.current;
    setAutoSelectedCells(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        if (next.size >= maxSafe) return prev; // already at limit
        next.add(idx);
      }
      return next;
    });
  }

  function autoSelectAll() {
    if (autoRunning) return;
    // Cancel any in-flight animation
    const animId = ++autoSelectAnimRef.current;
    setAutoSelecting(true);
    // Reset grid to blank and clear selection immediately
    setAutoSelectedCells(new Set());
    autoSelectedCellsRef.current = new Set();
    setGrid([]); gridRef.current = [];
    setPhase("idle"); phaseRef.current = "idle";
    setRevealedSafe(0); setCurrentMult(1.0); setLastProfit(0);
    setResultOverlay(null);
    localStorage.removeItem(SAVE_KEY + "_" + currentUser);
    const tc = gridSize * gridSize;
    const indices = Array.from({ length: tc }, (_, i) => i);
    const shuffled = [...indices].sort(() => Math.random() - 0.5).slice(0, totalSafe);
    if (shuffled.length === 0) { setAutoSelecting(false); return; }
    const growing = new Set<number>();
    shuffled.forEach((idx, i) => {
      setTimeout(() => {
        if (autoSelectAnimRef.current !== animId) return; // cancelled — discard
        growing.add(idx);
        const snap = new Set(growing);
        setAutoSelectedCells(snap);
        autoSelectedCellsRef.current = snap;
        playSound("click");
        if (i === shuffled.length - 1) setAutoSelecting(false); // animation done
      }, i * 40);
    });
  }

  function clearAutoSelection() {
    if (autoRunning) return;
    setAutoSelectedCells(new Set());
    autoSelectedCellsRef.current = new Set();
    setGrid([]); gridRef.current = [];
    setPhase("idle"); phaseRef.current = "idle";
    setRevealedSafe(0); setCurrentMult(1.0); setLastProfit(0);
    setResultOverlay(null);
    localStorage.removeItem(SAVE_KEY + "_" + currentUser);
  }

  function stopAutoMines(clearState = false) {
    autoRunRef.current = false;
    autoLoopIdRef.current++;
    setAutoRunning(false);
    // Always reset grid to blank on stop so cells are not interactive
    setGrid([]); gridRef.current = [];
    setPhase("idle"); phaseRef.current = "idle";
    setRevealedSafe(0); setCurrentMult(1.0);
    setResultOverlay(null);
    localStorage.removeItem(SAVE_KEY + "_" + currentUser);
    if (clearState) {
      setAutoSelectedCells(new Set());
      autoSelectedCellsRef.current = new Set();
      setAutoRoundsPlayed(0);
      autoRoundsPlayedRef.current = 0;
    }
  }

  function startAutoMines() {
    if (!currentUser) { onRequestLogin?.(); return; }
    if (autoSelectedCellsRef.current.size === 0) return;
    if (autoRunRef.current) return;
    // Debounce: ignore rapid re-clicks within 800ms
    const now = Date.now();
    if (now - autoStartDebounceRef.current < 800) return;
    autoStartDebounceRef.current = now;

    const betU = (parseFloat(betDisplay)||0) / (liveRates[displayCurrency]||1);
    if (betU < 0.0099) return;

    autoRunRef.current = true;
    autoLoopIdRef.current++;
    const myId = autoLoopIdRef.current;
    autoRoundsPlayedRef.current = 0;
    setAutoRoundsPlayed(0);
    setAutoRunning(true);

    const displayRate = liveRates[displayCurrency] || 1;
    const stopP = parseFloat(autoStopProfit) > 0 ? parseFloat(autoStopProfit) : null;
    const stopL = parseFloat(autoStopLoss)   > 0 ? parseFloat(autoStopLoss)   : null;
    let sessionProfitDisplay = 0;

    function doRound() {
      if (!autoRunRef.current || autoLoopIdRef.current !== myId) return;
      const bal = localBalRef.current;
      const bu = (parseFloat(betDisplay)||0) / (liveRates[displayCurrency]||1);
      if (bu < 0.0099 || bal < bu - 0.0001) { stopAutoMines(); return; }

      const tc = gridSizeRef.current * gridSizeRef.current;
      const newGrid = buildGrid(tc, minesRef.current);

      // Deduct bet immediately
      localBalRef.current -= bu; onBalanceChange(localBalRef.current);
      betUsdRef.current = bu;
      revealedRef.current = 0;
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      setResultOverlay(null);

      const cells = [...autoSelectedCellsRef.current];
      const cellSet = new Set(cells);

      // Find first mine in selected cells (if any)
      let mineHitIdx = -1;
      let safeCount = 0;
      for (const idx of cells) {
        if (newGrid[idx]?.isMine) { mineHitIdx = idx; break; }
        safeCount++;
      }

      if (mineHitIdx >= 0) {
        // Mine hit — show all cells instantly
        const finalGrid = newGrid.map((c, i) => {
          if (cellSet.has(i)) return { ...c, state: (c.isMine ? "mine" : "gem") as "mine" | "gem" };
          if (c.isMine) return { ...c, state: "mine" as const };
          return { ...c, state: "safe" as const };
        });
        setGrid(finalGrid); gridRef.current = finalGrid;
        setRevealedSafe(0); setCurrentMult(1.0); revealedRef.current = 0;
        setPhase("gameover"); phaseRef.current = "gameover";
        setExplodingIdx(mineHitIdx);
        playSound("mine");
        setTimeout(() => setExplodingIdx(null), 600);

        const loss = bu;
        sessionProfitDisplay -= loss * displayRate;
        addBet(loss, 0, "Mines");
        onBetRecord?.(loss, 0, false, 0);
        setMinesStats(prev => ({
          ...prev, losses: prev.losses + 1, wagered: prev.wagered + loss,
          profit: prev.profit - loss,
          history: [{ profit: -loss, win: false }, ...prev.history].slice(0, 100),
        }));
        localStorage.removeItem(SAVE_KEY + "_" + currentUser);
        setTimeout(finishRound, 700);

      } else {
        // All safe — show win instantly
        const m = calcMultiplier(tc, minesRef.current, safeCount);
        const payout = +(bu * m).toFixed(8);
        const profit = payout - bu;
        const finalGrid = newGrid.map((c, i) => {
          if (cellSet.has(i)) return { ...c, state: "gem" as const };
          if (c.isMine) return { ...c, state: "mine" as const };
          return { ...c, state: "safe" as const };
        });
        setGrid(finalGrid); gridRef.current = finalGrid;
        setRevealedSafe(safeCount); setCurrentMult(m); revealedRef.current = safeCount;
        setPhase("cashed"); phaseRef.current = "cashed";

        localBalRef.current += payout; onBalanceChange(localBalRef.current);
        setLastProfit(profit);
        playSound("cashout");

        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        setResultOverlay({ type: "win", amount: profit });
        overlayTimerRef.current = setTimeout(() => setResultOverlay(null), 900);

        sessionProfitDisplay += profit * displayRate;
        addBet(bu, payout, "Mines");
        onBetRecord?.(bu, m, true, payout);
        setMinesStats(prev => ({
          ...prev, wins: prev.wins + 1, wagered: prev.wagered + bu,
          profit: prev.profit + profit,
          history: [{ profit, win: true }, ...prev.history].slice(0, 100),
        }));
        localStorage.removeItem(SAVE_KEY + "_" + currentUser);
        setTimeout(finishRound, 700);
      }

      function finishRound() {
        if (!autoRunRef.current || autoLoopIdRef.current !== myId) return;
        const newRounds = autoRoundsPlayedRef.current + 1;
        autoRoundsPlayedRef.current = newRounds;
        setAutoRoundsPlayed(newRounds);
        const limit = autoInfiniteRef.current ? null : autoNumBetsRef.current;
        if (limit !== null && newRounds >= limit) { stopAutoMines(); return; }
        if (stopP !== null && sessionProfitDisplay >= stopP) { stopAutoMines(); return; }
        if (stopL !== null && sessionProfitDisplay <= -stopL) { stopAutoMines(); return; }
        setTimeout(doRound, 700);
      }
    }

    doRound();
  }

  // ── Back button handler ───────────────────────────────────────────────
  function handleBack() {
    if (autoRunning || autoRunRef.current) {
      stopAutoMines(true);
    }
    if (phaseRef.current === "playing" && betUsdRef.current > 0) {
      const tc = gridSizeRef.current * gridSizeRef.current;
      const m = calcMultiplier(tc, minesRef.current, revealedRef.current);
      if (revealedRef.current > 0) {
        const payout = +(betUsdRef.current * m).toFixed(8);
        localBalRef.current += payout; onBalanceChange(localBalRef.current);
      }
      localStorage.removeItem(SAVE_KEY + "_" + currentUser);
    }
    onBack();
  }

  // ── Place bet ─────────────────────────────────────────────────────────
  function placeBet() {
    if (!currentUser) { onRequestLogin?.(); return; }
    if (!canBet || phase === "playing") return;
    const tc = gridSizeRef.current * gridSizeRef.current;
    const newGrid = buildGrid(tc, mineCount);
    deductBal(betUsd);
    betUsdRef.current = betUsd;
    minesRef.current  = mineCount;
    revealedRef.current = 0;
    setGrid(newGrid); gridRef.current = newGrid;
    setRevealedSafe(0); setCurrentMult(1.0);
    setPhase("playing");
    localStorage.setItem(SAVE_KEY + "_" + currentUser, JSON.stringify({
      grid: newGrid, mineCount, gridSize, betUsd, revealedSafe: 0, phase: "playing"
    }));
  }

  // ── Reveal cell ───────────────────────────────────────────────────────
  function revealCell(idx: number) {
    if (phase !== "playing") return;
    const cell = gridRef.current[idx];
    if (!cell || cell.state !== "hidden") return;
    const tc = gridSizeRef.current * gridSizeRef.current;

    if (cell.isMine) {
      // Reveal ALL cells simultaneously — clicked mine gets exploding animation
      setExplodingIdx(idx);
      playSound("mine");
      const withReveal = gridRef.current.map((c, i) => {
        if (i === idx) return { ...c, state: "mine" as const };
        if (c.state !== "hidden") return c;
        if (c.isMine) return { ...c, state: "mine" as const };
        return { ...c, state: "safe" as const };
      });
      setGrid(withReveal); gridRef.current = withReveal;
      setTimeout(() => setExplodingIdx(null), 600);

      const loss = betUsdRef.current;
      setLastProfit(-loss);
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      addBet(loss, 0, "Mines");
      onBetRecord?.(loss, 0, false, 0);
      setMinesStats(prev => ({
        ...prev, losses: prev.losses + 1, wagered: prev.wagered + loss,
        profit: prev.profit - loss,
        history: [{ profit: -loss, win: false }, ...prev.history].slice(0, 100),
      }));
      setPhase("gameover");
      localStorage.removeItem(SAVE_KEY + "_" + currentUser);
    } else {
      setRevealingIdx(idx);
      playSound("gem");
      const newRevealed = revealedRef.current + 1;
      revealedRef.current = newRevealed;
      const newMult = calcMultiplier(tc, minesRef.current, newRevealed);
      const newGrid = gridRef.current.map((c, i) => i === idx ? { ...c, state: "gem" as const } : c);
      setGrid(newGrid); gridRef.current = newGrid;
      setRevealedSafe(newRevealed); setCurrentMult(newMult);
      setTimeout(() => setRevealingIdx(null), 400);
      if (newRevealed >= tc - minesRef.current) {
        setTimeout(() => cashout(newMult, newRevealed, betUsdRef.current, minesRef.current, gridSizeRef.current), 200);
      } else {
        localStorage.setItem(SAVE_KEY + "_" + currentUser, JSON.stringify({
          grid: newGrid, mineCount: minesRef.current, gridSize: gridSizeRef.current,
          betUsd: betUsdRef.current, revealedSafe: newRevealed, phase: "playing"
        }));
      }
    }
  }

  // ── Cashout ───────────────────────────────────────────────────────────
  function cashout(mult?: number, revealed?: number, betU?: number, mines?: number, gs?: GridSize) {
    if (phase !== "playing") return;
    const m  = mult     ?? currentMult;
    const r  = revealed ?? revealedSafe;
    const bu = betU     ?? betUsdRef.current;
    const mc = mines    ?? minesRef.current;
    const g  = gs       ?? gridSizeRef.current;
    if (r === 0) { setPhase("idle"); return; }
    const payout = bu * m;
    creditBal(payout);
    const profit = payout - bu;
    setLastProfit(profit);
    playSound("cashout");
    // Show win overlay
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    setResultOverlay({ type: "win", amount: profit });
    overlayTimerRef.current = setTimeout(() => setResultOverlay(null), 2600);
    addBet(bu, payout, "Mines");
    onBetRecord?.(bu, m, true, payout);
    setMinesStats(prev => ({
      ...prev, wins: prev.wins + 1, wagered: prev.wagered + bu,
      profit: prev.profit + profit,
      history: [{ profit, win: true }, ...prev.history].slice(0, 100),
    }));
    // Reveal all remaining hidden cells on cashout too
    setGrid(prev => prev.map(c => {
      if (c.state !== "hidden") return c;
      if (c.isMine) return { ...c, state: "mine" as const };
      return { ...c, state: "safe" as const };
    }));
    setPhase("cashed");
    setMineCount(mc); setGridSize(g);
    localStorage.removeItem(SAVE_KEY + "_" + currentUser);
  }

  // ── Restore from localStorage ──────────────────────────────────────────
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(SAVE_KEY + "_" + currentUser);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s || s.phase !== "playing") return;
      const gs: GridSize = s.gridSize || 5;
      setGridSize(gs); gridSizeRef.current = gs;
      setGrid(s.grid); gridRef.current = s.grid;
      setMineCount(s.mineCount); minesRef.current = s.mineCount;
      betUsdRef.current = s.betUsd;
      setRevealedSafe(s.revealedSafe); revealedRef.current = s.revealedSafe;
      setCurrentMult(calcMultiplier(gs * gs, s.mineCount, s.revealedSafe));
      setPhase("playing");
      setBetDisplay((s.betUsd * (liveRates[displayCurrency] || 1)).toFixed(2));
    } catch { localStorage.removeItem(SAVE_KEY + "_" + currentUser); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cashoutAmount = betUsdRef.current * currentMult;
  const nextMult = nextMultiplier(totalCells, mineCount, revealedSafe);

  // ── Cell icon sizes per gridSize — fill ~93% of each cell ─────────────
  // 5→cell≈98px, 6→cell≈81px, 7→cell≈68px, 8→cell≈59px
  const iconSize = gridSize === 5 ? 104 : gridSize === 6 ? 86 : gridSize === 7 ? 72 : 62;

  // ── Cell style ────────────────────────────────────────────────────────
  function cellStyle(cell: Cell, idx: number): React.CSSProperties {
    const isRevealing = idx === revealingIdx;
    const isExploding = idx === explodingIdx;
    const isGem  = cell.state === "gem";
    const isMine = cell.state === "mine";
    const isSafe = cell.state === "safe";
    const isHidden = cell.state === "hidden";
    const isAutoSelected = autoMode && autoSelectedCells.has(idx) && isHidden;

    let bg = "#1c2436";
    let border = "1px solid #252f45";
    let boxShadow = "none";

    if (isAutoSelected) {
      bg = "linear-gradient(145deg,#2a1c00 0%,#3d2a00 100%)";
      border = "1px solid #f4a91faa";
      boxShadow = "0 0 10px rgba(244,169,31,0.3)";
    } else if (isGem) {
      bg = "linear-gradient(145deg,#031828 0%,#05284a 60%,#073d6e 100%)";
      border = "1px solid #1a9fff66";
      boxShadow = "0 0 18px rgba(26,159,255,0.5), inset 0 0 8px rgba(100,200,255,0.08)";
    } else if (isMine) {
      bg = "linear-gradient(145deg,#1a0606 0%,#2e0a0a 100%)";
      border = "1px solid #ef444455";
      boxShadow = isExploding
        ? "0 0 32px rgba(239,68,68,0.9), 0 0 64px rgba(239,68,68,0.5)"
        : "0 0 12px rgba(239,68,68,0.35)";
    } else if (isSafe) {
      bg = "linear-gradient(145deg,#030c16 0%,#050f1e 100%)";
      border = "1px solid #0d2030";
      boxShadow = "none";
    }

    const isClickable = autoMode
      ? (isHidden && !autoRunning)
      : (isHidden && phase === "playing");

    return {
      width: "100%", height: "100%",
      borderRadius: gridSize >= 7 ? "7px" : "10px",
      border, background: bg, boxShadow,
      display: "flex", alignItems: "center", justifyContent: "center",
      cursor: isClickable ? "pointer" : "default",
      transition: "all 0.18s ease", position: "relative",
      overflow: isExploding ? "visible" : "hidden",
      animation: isRevealing ? "minesGemEmerge 0.38s cubic-bezier(0.22,1,0.36,1) both"
               : isExploding ? "minesExplodeCell 0.55s cubic-bezier(0.36,0.07,0.19,0.97) both"
               : undefined,
    };
  }

  function cellHover(e: React.MouseEvent, cell: Cell) {
    if (cell.state !== "hidden" || phase !== "playing") return;
    const el = e.currentTarget as HTMLDivElement;
    el.style.background = "#242e42";
    el.style.border = "1px solid #3a4a60";
    el.style.transform = "scale(1.03)";
  }
  function cellLeave(e: React.MouseEvent, cell: Cell) {
    if (cell.state !== "hidden" || phase !== "playing") return;
    const el = e.currentTarget as HTMLDivElement;
    el.style.background = "#1c2436";
    el.style.border = "1px solid #252f45";
    el.style.transform = "scale(1)";
  }

  const presets = MINE_PRESETS[gridSize];

  // Grid to render: show blank only before any bet has been placed
  const displayGrid = grid.length > 0
    ? grid
    : Array.from({ length: totalCells }, () => ({ isMine: false, state: "hidden" as const }));

  function dismissOverlay() {
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    setResultOverlay(null);
  }

  return (
    <div className="mines-root" style={{ display:"flex", flexDirection:"column", width:"100%", height:"100%", background:"#09141f", overflow:"hidden", position:"relative", userSelect:"none", WebkitUserSelect:"none" }}>

      <style>{`
        @keyframes minesGemEmerge {
          0%   { transform: scale(0.35) translateY(12px); opacity: 0; filter: brightness(2.5) blur(3px); }
          40%  { filter: brightness(1.6) blur(0px); }
          65%  { transform: scale(1.1) translateY(-3px); opacity: 1; }
          82%  { transform: scale(0.96) translateY(1px); }
          100% { transform: scale(1) translateY(0px); opacity: 1; filter: brightness(1); }
        }
        @keyframes minesGemShimmer {
          0%,100% { filter: drop-shadow(0 0 6px rgba(30,160,255,0.5)) brightness(1); }
          50%     { filter: drop-shadow(0 0 16px rgba(80,200,255,0.9)) brightness(1.22); }
        }
        @keyframes minesExplodeCell {
          0%   { transform: scale(1); }
          10%  { transform: scale(1.25) rotate(-4deg); }
          25%  { transform: scale(0.85) rotate(4deg); }
          40%  { transform: scale(1.15) rotate(-2deg); }
          60%  { transform: scale(0.95) rotate(1deg); }
          80%  { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        @keyframes bombExplode {
          0%   { transform: scale(1);    filter: brightness(1) drop-shadow(0 0 0px transparent); }
          12%  { transform: scale(1.55); filter: brightness(4) drop-shadow(0 0 24px #ff6600) drop-shadow(0 0 48px #ffaa00); }
          28%  { transform: scale(0.80); filter: brightness(2) drop-shadow(0 0 12px #ff3300); }
          45%  { transform: scale(1.25); filter: brightness(3) drop-shadow(0 0 20px #ff5500); }
          65%  { transform: scale(0.95); filter: brightness(1.5); }
          100% { transform: scale(1);    filter: brightness(1); }
        }
        @keyframes explosionFlash {
          0%   { opacity: 0; transform: scale(0.3); }
          20%  { opacity: 0.85; transform: scale(1.2); }
          60%  { opacity: 0.4; transform: scale(1.5); }
          100% { opacity: 0; transform: scale(2); }
        }
        @keyframes minesFadeIn {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes minesPulse {
          0%,100% { opacity:1; }
          50%     { opacity:0.7; }
        }
        @keyframes minesOverlayIn {
          0%   { opacity:0; transform:scale(0.7); }
          60%  { transform:scale(1.06); }
          100% { opacity:1; transform:scale(1); }
        }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes scaleIn {
          0%   { opacity:0; transform:scale(0.7); }
          60%  { transform:scale(1.06); }
          100% { opacity:1; transform:scale(1); }
        }
      `}</style>

      {/* ── HEADER (Blackjack-style) ───────────────────────────────────── */}
      <div style={{ display:"flex", alignItems:"center", gap:"10px", padding:"10px 20px", background:"#0e1826", borderBottom:"1px solid #1a2438", flexShrink:0 }}>
        <button onClick={handleBack}
          style={{ background:"#131a28", border:"1px solid #252f45", color:"#8090b0", cursor:"pointer", fontSize:"18px", padding:"5px 12px", borderRadius:"8px", lineHeight:1 }}>
          ←
        </button>
        <div style={{ fontWeight:500, fontSize:"15px", letterSpacing:"1.5px", color:"#fff", display:"flex", alignItems:"center", gap:"8px" }}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="5"/><line x1="12" y1="8" x2="12" y2="5"/><line x1="7.5" y1="9.5" x2="5.5" y2="7.5"/><line x1="16.5" y1="9.5" x2="18.5" y2="7.5"/><line x1="7" y1="13" x2="4" y2="13"/><line x1="17" y1="13" x2="20" y2="13"/></svg>MINES</div>
        <div style={{ marginLeft:"auto" }}>
          <div style={{ fontSize:"12px", color:"#5a6a88", fontWeight:500 }}>Mander Originals</div>
        </div>
      </div>

      {/* ── BODY ─────────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

      {/* ── LEFT PANEL ────────────────────────────────────────────────── */}
      <div style={{ width:"260px", flexShrink:0, background:"#131a28", borderRight:"1px solid #1a2438", display:"flex", flexDirection:"column", padding:0, gap:0, overflow:"hidden" }}>

        {/* Scrollable controls area */}
        <div style={{ flex:1, overflowY:"auto", minHeight:0, padding:"16px 16px 0 16px" }}>

        {/* Manual / Auto tabs */}
        <div style={{ display:"flex", alignItems:"center", background:"#0e1826", borderRadius:"14px", padding:"5px", gap:"4px", marginBottom:"16px" }}>
          {(["Manual","Auto"] as const).map(tab=>{
            const active = (tab==="Auto") === autoMode;
            return (
              <button key={tab} onClick={()=>{
                if(autoRunning) return;
                const goingAuto = tab==="Auto";
                autoSelectAnimRef.current++;
                setAutoSelecting(false);
                setAutoSelectedCells(new Set());
                autoSelectedCellsRef.current = new Set();
                if(phaseRef.current==="playing") {
                  if(betUsdRef.current > 0) {
                    localBalRef.current += betUsdRef.current;
                    onBalanceChange(localBalRef.current);
                  }
                }
                setGrid([]); gridRef.current = [];
                setPhase("idle"); phaseRef.current = "idle";
                setRevealedSafe(0); setCurrentMult(1.0); setLastProfit(0);
                setResultOverlay(null);
                localStorage.removeItem(SAVE_KEY + "_" + currentUser);
                setAutoMode(goingAuto);
              }}
                style={{ flex:1, background:active?"#1e2c44":"transparent", border:active?"1px solid #3a4a60":"1px solid transparent", borderRadius:"10px", padding:"10px", color:active?"#eef3f8":"#5a6a88", fontWeight:500, fontSize:"14px", cursor:autoRunning?"not-allowed":"pointer", opacity:autoRunning&&!active?0.45:1, transition:"opacity .2s" }}>
                {tab}
              </button>
            );
          })}
        </div>

        {/* Bet amount */}
        <div style={{ color:"#5a6a88", fontWeight:500, marginBottom:"5px", fontSize:"13px", paddingLeft:"4px" }}>Monto de apuesta</div>
        <div style={{ display:"flex", alignItems:"center", gap:"8px", background:"#0e1826", border:`1px solid ${betInvalid||balInsuff?"#e74c3c":"#252f45"}`, borderRadius:"10px", padding:"8px 14px", marginBottom:"6px", transition:"border .15s" }}>
          <span style={{ fontSize:"15px", color:"#5a6a88", fontWeight:500, whiteSpace:"nowrap", opacity:currencyFade, transition:"opacity .18s" }}>{displayCurrency}</span>
          <input type="number" value={betDisplay} min={minBetDisplay} max={maxBetDisplay} step="0.01"
            onChange={e => setBetDisplay(e.target.value)}
            onBlur={() => {
              const c = Math.max(minBetDisplay, Math.min(maxBetDisplay || minBetDisplay, parseFloat(betDisplay) || minBetDisplay));
              setBetDisplay(c.toFixed(2));
            }}
            disabled={disabled}
            style={{ flex:1, background:"transparent", border:"none", color:"#fff", fontSize:"20px", fontWeight:600, padding:0, minWidth:0, outline:"none", fontFamily:"inherit", opacity:currencyFade, transition:"opacity .18s" }}
          />
          <button onClick={()=>!disabled&&setBetDisplay("0")} disabled={disabled}
            style={{ background:"#0e1826", border:"1px solid #252f45", borderRadius:"6px", color:"#6db3f2", fontSize:"11px", fontWeight:500, padding:"4px 8px", cursor:disabled?"not-allowed":"pointer", letterSpacing:"0.04em", whiteSpace:"nowrap", textTransform:"uppercase", opacity:disabled?0.5:1 }}>
            Limpiar
          </button>
        </div>
        {betInvalid && <div style={{ fontSize:"11px", color:"#e74c3c", fontWeight:600, marginBottom:"5px", paddingLeft:"2px" }}>Mín: {fmtMoney(0.01)}</div>}
        {!betInvalid && balInsuff && <div style={{ fontSize:"11px", color:"#e74c3c", fontWeight:600, marginBottom:"5px", paddingLeft:"2px" }}>Saldo insuficiente</div>}
        {!betInvalid && !balInsuff && <div style={{ marginBottom:"5px" }} />}

        {/* Quick bet */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"5px", marginBottom:"12px" }}>
          {[
            { label:"Min", action:()=>setBetDisplay(minBetDisplay.toFixed(2)) },
            { label:"½",   action:()=>setBetDisplay(v=>Math.max(minBetDisplay,(parseFloat(v)||0)/2).toFixed(2)) },
            { label:"2×",  action:()=>setBetDisplay(v=>Math.min(maxBetDisplay||(minBetDisplay),(parseFloat(v)||0)*2).toFixed(2)) },
            { label:"Max", action:()=>setBetDisplay(maxBetDisplay.toFixed(2)) },
          ].map(b=>(
            <button key={b.label} onClick={()=>!disabled&&b.action()} disabled={disabled}
              style={{ background:"#1a2438", color:disabled?"#3a4a66":"#d0dcea", border:"1px solid #252f45", borderRadius:"8px", padding:"7px 0", fontWeight:500, fontSize:"12px", cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.5:1 }}>
              {b.label}
            </button>
          ))}
        </div>

        {/* Grid size */}
        <div style={{ color:"#5a6a88", fontWeight:500, marginBottom:"6px", fontSize:"13px", paddingLeft:"4px" }}>Tamaño del tablero</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"5px", marginBottom:"12px" }}>
          {GRID_SIZES.map(gs=>(
            <button key={gs} onClick={()=>{ if(!disabled && !autoSelecting){ resetAutoIfNeeded(); setGridSize(gs); } }} disabled={disabled || autoSelecting}
              style={{
                background: gridSize===gs ? "linear-gradient(180deg,#1a9fff22,#0d6fd422)" : "#1a2438",
                border: `1px solid ${gridSize===gs ? "#1a9fff" : "#252f45"}`,
                borderRadius:"8px", padding:"7px 0",
                color: gridSize===gs ? "#1a9fff" : (disabled||autoSelecting)?"#3a4a66":"#aab4c5",
                fontWeight: gridSize===gs ? 700 : 500, fontSize:"12px",
                cursor: (disabled||autoSelecting)?"not-allowed":"pointer", opacity:(disabled||autoSelecting)?0.5:1,
              }}>
              {gs}×{gs}
            </button>
          ))}
        </div>

        {/* Mines count — preset buttons */}
        <div style={{ color:"#5a6a88", fontWeight:500, fontSize:"13px", marginBottom:"7px", paddingLeft:"4px" }}>Minas</div>
        <div style={{ display:"grid", gridTemplateColumns:`repeat(${presets.length + 1},1fr)`, gap:"5px", marginBottom:"14px" }}>
          {presets.map(n=>{
            const isSelected = mineCount===n && !customMineOpen;
            return (
              <button key={n} onClick={()=>{ if(!disabled && !autoSelecting){ resetAutoIfNeeded(); setMineCount(n); setCustomMineOpen(false); setCustomMineInput(""); } }} disabled={disabled || autoSelecting}
                style={{ background: isSelected?"#163050":"#131d2e", border:`1px solid ${isSelected?"#2a7abf":"#1e2c42"}`, borderRadius:"8px", padding:"9px 0", color:isSelected?"#5ab8ff":(disabled||autoSelecting)?"#2e3a50":"#8094b0", fontWeight:700, fontSize:"13px", cursor:(disabled||autoSelecting)?"not-allowed":"pointer", opacity:(disabled||autoSelecting)?0.5:1, transition:"all .15s" }}>
                {n}
              </button>
            );
          })}
          {/* Custom button — becomes inline input when open */}
          <div style={{ position:"relative" }}>
            {customMineOpen ? (
              <input
                type="number" min={1} max={maxMinesFor(gridSize)}
                value={customMineInput}
                autoFocus
                onChange={e=>{ setCustomMineInput(e.target.value); const v=parseInt(e.target.value); if(!isNaN(v)&&v>=1&&v<=maxMinesFor(gridSize)) setMineCount(v); }}
                onBlur={()=>{ const v=parseInt(customMineInput); if(isNaN(v)||v<1){ setCustomMineInput("1"); setMineCount(1); } else if(v>maxMinesFor(gridSize)){ const mx=maxMinesFor(gridSize); setCustomMineInput(String(mx)); setMineCount(mx); } }}
                style={{ width:"100%", boxSizing:"border-box", background:"#1e3050", border:"1px solid #2a7abf", borderRadius:"8px", padding:"9px 0", color:"#5ab8ff", fontWeight:700, fontSize:"14px", textAlign:"center", outline:"none", height:"100%" }}
              />
            ) : (
              <button onClick={()=>{ if(!disabled && !autoSelecting){ resetAutoIfNeeded(); setCustomMineOpen(true); setCustomMineInput(String(mineCount)); } }} disabled={disabled || autoSelecting}
                style={{ width:"100%", background:"#131d2e", border:"1px solid #1e2c42", borderRadius:"8px", padding:"9px 0", color:(disabled||autoSelecting)?"#2e3a50":"#8094b0", fontWeight:600, fontSize:"11px", cursor:(disabled||autoSelecting)?"not-allowed":"pointer", opacity:(disabled||autoSelecting)?0.5:1, transition:"all .15s" }}>
                Custom
              </button>
            )}
          </div>
        </div>

        {/* ── MANUAL MODE BUTTONS ── */}
        {!autoMode && (<>
          {phase !== "playing" && (
            <button onClick={placeBet} disabled={betInvalid||(!!currentUser&&balInsuff)}
              style={{
                width:"100%", border:"none", borderRadius:"10px", padding:"14px",
                fontWeight:500, fontSize:"15px", transition:"all .2s",
                background: (!betInvalid&&(!currentUser||!balInsuff)) ? "linear-gradient(180deg,#1a9fff,#0d6fd4)" : "#1a2438",
                color: (!betInvalid&&(!currentUser||!balInsuff)) ? "#fff" : "#3a4a60",
                boxShadow: (!betInvalid&&(!currentUser||!balInsuff)) ? "0 4px 22px rgba(26,159,255,.35)" : "none",
                cursor: (!betInvalid&&(!currentUser||!balInsuff)) ? "pointer" : "not-allowed",
                marginBottom:"12px",
              }}>
              {(currentUser&&balInsuff) ? "Saldo insuficiente" : "Apostar"}
            </button>
          )}
          {phase === "playing" && revealedSafe > 0 && (
            <button onClick={()=>cashout()}
              style={{ width:"100%", padding:"14px", borderRadius:"10px", border:"none", background:"linear-gradient(180deg,#f4a91f,#d4890f)", color:"#000", fontWeight:700, fontSize:"15px", cursor:"pointer", boxShadow:"0 4px 20px rgba(244,169,31,0.4)", animation:"minesPulse 2s ease infinite", marginBottom:"12px" }}>
              Cobrar {fmtMoney(cashoutAmount)}
            </button>
          )}
          {phase === "playing" && revealedSafe === 0 && (
            <div style={{ width:"100%", padding:"12px", borderRadius:"10px", background:"#0e1826", border:"1px solid #1a2438", color:"#5a6a88", fontWeight:600, fontSize:"13px", textAlign:"center", marginBottom:"12px" }}>
              Haz clic en una casilla
            </div>
          )}
          {phase === "playing" && (
            <div style={{ background:"#0a1420", border:"1px solid #1a2a40", borderRadius:"10px", padding:"10px 14px", animation:"minesFadeIn 0.25s ease" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"5px" }}>
                <span style={{ color:"#5a6a88", fontSize:"12px" }}>Multiplicador</span>
                <span style={{ color:"#22c55e", fontWeight:700, fontSize:"14px" }}>{formatMult(currentMult)}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"5px" }}>
                <span style={{ color:"#5a6a88", fontSize:"12px" }}>Próximo</span>
                <span style={{ color:"#f4a91f", fontWeight:600, fontSize:"13px" }}>{formatMult(nextMult)}</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ color:"#5a6a88", fontSize:"12px" }}>Revelados</span>
                <span style={{ color:"#dce3ee", fontWeight:600, fontSize:"13px" }}>{revealedSafe}/{totalSafe}</span>
              </div>
            </div>
          )}
        </>)}

        {/* ── AUTO MODE CONTROLS ── */}
        {autoMode && (<>
          {/* Auto-selection buttons */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px", marginBottom:"12px" }}>
            <button onClick={autoSelectAll} disabled={autoRunning}
              style={{ padding:"10px 4px", borderRadius:"9px", border:"1px solid #2a3a55", background:"#1a2438", color:autoRunning?"#3a4a66":"#d0dcea", fontWeight:600, fontSize:"12px", cursor:autoRunning?"not-allowed":"pointer", lineHeight:1.3 }}>
              Selección{"\n"}Automática
            </button>
            {(()=>{ const clearDis = autoRunning || (autoSelectedCells.size === 0 && !autoSelecting); return (
            <button onClick={clearAutoSelection} disabled={clearDis}
              style={{ padding:"10px 4px", borderRadius:"9px", border:"1px solid #2a3a55", background:"#1a2438", color:clearDis?"#3a4a66":"#d0dcea", fontWeight:600, fontSize:"12px", cursor:clearDis?"not-allowed":"pointer", opacity:clearDis?0.45:1 }}>
              Borrar Mesa
            </button>
            ); })()}
          </div>

          {/* Casillas seleccionadas */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"#0e1826", borderRadius:"9px", padding:"10px 14px", marginBottom:"12px" }}>
            <span style={{ color:"#5a6a88", fontSize:"12px" }}>Casillas Seleccionadas:</span>
            <span style={{ color:"#dce3ee", fontWeight:700, fontSize:"13px" }}>{autoSelectedCells.size} / {totalSafe}</span>
          </div>

          {/* Pago en Victoria + Nro Apuestas */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px", marginBottom:"12px" }}>
            <div style={{ minWidth:0 }}>
              <div style={{ color:"#5a6a88", fontSize:"10px", marginBottom:"4px", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>Pago en Victoria</div>
              <div style={{ display:"flex", alignItems:"center", background:"#0e1826", border:"1px solid #252f45", borderRadius:"8px", padding:"0 8px", height:"32px", overflow:"hidden" }}>
                <div style={{ color:"#22c55e", fontWeight:700, fontSize:"12px", opacity:currencyFade, lineHeight:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                  {autoSelectedCells.size > 0 ? fmtMoney((parseFloat(betDisplay)||0)/rate * calcMultiplier(totalCells,mineCount,autoSelectedCells.size)) : "—"}
                </div>
              </div>
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ color:"#5a6a88", fontSize:"10px", marginBottom:"4px", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>Nº Apuestas</div>
              <div style={{ display:"flex", alignItems:"center", background:"#0e1826", border:"1px solid #252f45", borderRadius:"8px", padding:"0 6px 0 8px", height:"32px", gap:"3px" }}>
                <input
                  value={autoInfinite ? "Infinite" : autoNumBetsInput}
                  readOnly={autoInfinite}
                  type={autoInfinite ? "text" : "number"}
                  min="1"
                  disabled={autoRunning}
                  onChange={e => { setAutoInfinite(false); setAutoNumBetsInput(e.target.value); }}
                  onBlur={() => { if (!autoInfinite && (!autoNumBetsInput || (parseInt(autoNumBetsInput)||0) <= 0)) setAutoNumBetsInput("1"); }}
                  style={{ flex:1, background:"transparent", border:"none", color:"#dce3ee", fontWeight:600, fontSize:"12px", padding:0, minWidth:0, outline:"none", fontFamily:"inherit", cursor:autoInfinite?"default":"text", lineHeight:1 }}
                />
                <span onClick={()=>{ if(!autoRunning) setAutoInfinite(v=>!v); }}
                  style={{ color:autoInfinite?"#5ab8ff":"#5a6a88", fontWeight:700, fontSize:"13px", lineHeight:1, cursor:autoRunning?"not-allowed":"pointer", flexShrink:0, userSelect:"none" }}>
                  ∞
                </span>
              </div>
            </div>
          </div>

          {/* Progress (only when running) */}
          {autoRunning && (
            <div style={{ textAlign:"center", color:"#5a6a88", fontSize:"12px", marginBottom:"10px" }}>
              {autoRoundsPlayed} / {autoInfinite ? "∞" : autoNumBetsRef.current}
            </div>
          )}

          {/* Configuración avanzada */}
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px",padding:"8px 12px",background:"#152334",borderRadius:"10px",border:"1px solid #1e3548" }}>
            <span style={{ color:"#5a6a88",fontWeight:500,fontSize:"13px" }}>Avanzado</span>
            <div onClick={()=>setAutoAdvOpen(v=>!v)}
              style={{ width:"42px",height:"24px",borderRadius:"12px",background:autoAdvOpen?"#1f6fd0":"#2a3f54",cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0 }}>
              <div style={{ position:"absolute",top:"3px",left:autoAdvOpen?"21px":"3px",width:"18px",height:"18px",borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 4px #0005" }}/>
            </div>
          </div>

          {autoAdvOpen && <div style={{ marginBottom:"10px" }}>
            {/* Al ganar */}
            <div style={{ marginBottom:"12px" }}>
              <div style={{ color:"#5a6a88",fontWeight:500,fontSize:"12px",marginBottom:"5px" }}>Al ganar</div>
              <div style={{ display:"flex",gap:"6px",marginBottom:"6px" }}>
                {(["reset","increase"] as const).map(mode=>(
                  <button key={mode} onClick={()=>setAutoOnWin(mode)}
                    style={{ flex:1,padding:"7px 0",borderRadius:"8px",fontSize:"12px",fontWeight:500,cursor:"pointer",border:"none",
                      background:autoOnWin===mode?"#1f6fd0":"#1a2438",color:autoOnWin===mode?"#fff":"#7a9db8",transition:"background .15s" }}>
                    {mode==="reset"?"Reiniciar":"Aumentar"}
                  </button>
                ))}
              </div>
              {autoOnWin==="increase" && (
                <div style={{ display:"flex",alignItems:"center",gap:"6px",background:"#0e1826",border:"1px solid #252f45",borderRadius:"8px",padding:"6px 10px" }}>
                  <input value={autoOnWinPct} onChange={e=>setAutoOnWinPct(e.target.value.replace(/[^\d.]/g,""))}
                    type="text" inputMode="decimal" placeholder="0"
                    style={{ flex:1,background:"transparent",border:"none",color:"#fff",fontSize:"16px",fontWeight:500,minWidth:0,outline:"none" }}/>
                  <span style={{ color:"#5a6a88",fontWeight:500,fontSize:"14px" }}>%</span>
                </div>
              )}
            </div>

            {/* Al perder */}
            <div style={{ marginBottom:"12px" }}>
              <div style={{ color:"#5a6a88",fontWeight:500,fontSize:"12px",marginBottom:"5px" }}>Al perder</div>
              <div style={{ display:"flex",gap:"6px",marginBottom:"6px" }}>
                {(["reset","increase"] as const).map(mode=>(
                  <button key={mode} onClick={()=>setAutoOnLose(mode)}
                    style={{ flex:1,padding:"7px 0",borderRadius:"8px",fontSize:"12px",fontWeight:500,cursor:"pointer",border:"none",
                      background:autoOnLose===mode?"#1f6fd0":"#1a2438",color:autoOnLose===mode?"#fff":"#7a9db8",transition:"background .15s" }}>
                    {mode==="reset"?"Reiniciar":"Aumentar"}
                  </button>
                ))}
              </div>
              {autoOnLose==="increase" && (
                <div style={{ display:"flex",alignItems:"center",gap:"6px",background:"#0e1826",border:"1px solid #252f45",borderRadius:"8px",padding:"6px 10px" }}>
                  <input value={autoOnLosePct} onChange={e=>setAutoOnLosePct(e.target.value.replace(/[^\d.]/g,""))}
                    type="text" inputMode="decimal" placeholder="0"
                    style={{ flex:1,background:"transparent",border:"none",color:"#fff",fontSize:"16px",fontWeight:500,minWidth:0,outline:"none" }}/>
                  <span style={{ color:"#5a6a88",fontWeight:500,fontSize:"14px" }}>%</span>
                </div>
              )}
            </div>

            {/* Parar al ganar */}
            <div style={{ marginBottom:"12px" }}>
              <div style={{ color:"#5a6a88",fontWeight:500,fontSize:"12px",marginBottom:"5px" }}>Parar al ganar</div>
              <div style={{ display:"flex",alignItems:"center",gap:"6px",background:"#0e1826",border:"1px solid #252f45",borderRadius:"8px",padding:"6px 10px" }}>
                <span style={{ color:"#5a6a88",fontWeight:500,fontSize:"13px",whiteSpace:"nowrap" }}>{displayCurrency}</span>
                <input value={autoStopProfit} onChange={e=>setAutoStopProfit(e.target.value.replace(/[^\d.]/g,""))}
                  type="text" inputMode="decimal" placeholder="0 = desactivado"
                  style={{ flex:1,background:"transparent",border:"none",color:"#fff",fontSize:"15px",fontWeight:500,minWidth:0,outline:"none" }}/>
              </div>
            </div>

            {/* Parar al perder */}
            <div style={{ marginBottom:"4px" }}>
              <div style={{ color:"#5a6a88",fontWeight:500,fontSize:"12px",marginBottom:"5px" }}>Parar al perder</div>
              <div style={{ display:"flex",alignItems:"center",gap:"6px",background:"#0e1826",border:"1px solid #252f45",borderRadius:"8px",padding:"6px 10px" }}>
                <span style={{ color:"#5a6a88",fontWeight:500,fontSize:"13px",whiteSpace:"nowrap" }}>{displayCurrency}</span>
                <input value={autoStopLoss} onChange={e=>setAutoStopLoss(e.target.value.replace(/[^\d.]/g,""))}
                  type="text" inputMode="decimal" placeholder="0 = desactivado"
                  style={{ flex:1,background:"transparent",border:"none",color:"#fff",fontSize:"15px",fontWeight:500,minWidth:0,outline:"none" }}/>
              </div>
            </div>
          </div>}

          {/* Iniciar Auto / Detener Auto */}
          {!autoRunning ? (
            <button onClick={startAutoMines} disabled={autoSelectedCells.size===0||betInvalid||(!!currentUser&&balInsuff)}
              style={{
                width:"100%", border:"none", borderRadius:"10px", padding:"14px",
                fontWeight:700, fontSize:"15px", transition:"all .2s",
                background:(autoSelectedCells.size>0&&!betInvalid&&(!currentUser||!balInsuff))?"linear-gradient(180deg,#1a9fff,#0d6fd4)":"#1a2438",
                color:(autoSelectedCells.size>0&&!betInvalid&&(!currentUser||!balInsuff))?"#fff":"#3a4a60",
                boxShadow:(autoSelectedCells.size>0&&!betInvalid&&(!currentUser||!balInsuff))?"0 4px 22px rgba(26,159,255,0.35)":"none",
                cursor:(autoSelectedCells.size>0&&!betInvalid&&(!currentUser||!balInsuff))?"pointer":"not-allowed",
              }}>
              {autoSelectedCells.size===0 ? "Selecciona casillas" : (currentUser&&balInsuff) ? "Saldo insuficiente" : "Iniciar Auto"}
            </button>
          ) : (
            <button onClick={()=>stopAutoMines()}
              style={{ width:"100%", border:"none", borderRadius:"10px", padding:"14px", fontWeight:700, fontSize:"15px", background:"linear-gradient(180deg,#ef4444,#b91c1c)", color:"#fff", cursor:"pointer", boxShadow:"0 4px 22px rgba(239,68,68,0.35)" }}>
              Detener Auto
            </button>
          )}
        </>)}

        </div>{/* end scrollable controls area */}

        {/* Icon buttons — fixed bottom of left panel */}
        <div style={{ flexShrink:0,padding:"8px 16px 16px 16px",display:"flex",gap:"8px",position:"relative" }}>
          <button onClick={()=>setShowMinesStats(v=>!v)} title="Estadísticas"
            style={{ width:"38px",height:"38px",borderRadius:"8px",background:showMinesStats?"#1f6fd0":"#0e1826",border:showMinesStats?"1px solid #3a8aff":"1px solid #203a50",color:showMinesStats?"#fff":"#7a9db8",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"17px",transition:"background .2s,border .2s,color .2s" }}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
          </button>
          <div style={{ position:"relative" }}>
            {showMinesVol && (
              <div onClick={()=>setShowMinesVol(false)}
                style={{ position:"fixed",inset:0,zIndex:9998 }}/>
            )}
            <button onClick={()=>setShowMinesVol(v=>!v)} title="Volumen"
              style={{ position:"relative",zIndex:10000,width:"38px",height:"38px",borderRadius:"8px",background:showMinesVol?"#1f6fd0":"#0e1826",border:showMinesVol?"1px solid #3a8aff":"1px solid #203a50",color:showMinesVol?"#fff":"#7a9db8",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"17px",transition:"background .2s,border .2s,color .2s" }}>
              {minesVol===0 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg> : minesVol<40 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}
            </button>
            {showMinesVol && (
              <div style={{ position:"absolute",bottom:"48px",left:"0",background:"#0f1e2e",border:"1px solid #252f45",borderRadius:"12px",padding:"10px 16px",display:"flex",alignItems:"center",gap:"12px",minWidth:"220px",boxShadow:"0 4px 20px rgba(0,0,0,.5)",zIndex:10000 }}>
                <span style={{ fontSize:"18px",flexShrink:0,color:"#5a6a88" }}>{minesVol===0 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg> : minesVol<40 ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}</span>
                <input type="range" min="0" max="100" step="1" value={minesVol}
                  onChange={e=>setMinesVol(Number(e.target.value))}
                  style={{ flex:1,accentColor:"#f4a91f",cursor:"pointer",height:"4px" }}/>
                <span style={{ color:"#d0dcea",fontWeight:500,fontSize:"13px",minWidth:"24px",textAlign:"right" }}>{minesVol}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── MAIN AREA ─────────────────────────────────────────────────── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"20px 28px", position:"relative", background:"#09141f" }}>

        {/* Grid — fixed 580×580 square, cells shrink as grid grows */}
        <div style={{ position:"relative", width:"580px", height:"580px", flexShrink:0 }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
            gridTemplateRows: `repeat(${gridSize}, 1fr)`,
            gap: "7px",
            width: "100%",
            height: "100%",
            userSelect: "none",
            WebkitUserSelect: "none",
          } as React.CSSProperties}>
            {displayGrid.map((cell, idx) => (
              <div key={idx}
                style={cellStyle(cell, idx)}
                onMouseDown={e=>e.preventDefault()}
                onClick={()=>{ if(autoMode) { if(!autoRunning && phase==="idle") toggleAutoCell(idx); } else revealCell(idx); }}
                onMouseEnter={e=>{ if(!autoMode) cellHover(e, cell); }}
                onMouseLeave={e=>{ if(!autoMode) cellLeave(e, cell); }}
              >
                {cell.state === "gem"  && <GemIcon size={iconSize}/>}
                {cell.state === "safe" && <GemIcon size={iconSize} dim/>}
                {cell.state === "mine" && (
                  <>
                    <MineIcon size={iconSize} exploding={idx === explodingIdx}/>
                    {idx === explodingIdx && (
                      <div style={{
                        position:"absolute", inset:"-20%",
                        borderRadius:"50%",
                        background:"radial-gradient(circle, #ffaa00 0%, #ff4400 40%, transparent 70%)",
                        animation:"explosionFlash 0.55s ease-out forwards",
                        pointerEvents:"none", zIndex:2,
                      }}/>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Win card — centered over the grid, no backdrop */}
          {resultOverlay && resultOverlay.type === "win" && (
            <div onClick={dismissOverlay} style={{
              position:"absolute", inset:0,
              display:"flex", alignItems:"center", justifyContent:"center",
              zIndex:20, cursor:"pointer",
            }}>
              <div style={{
                background:"rgba(8,22,14,0.92)", border:"2px solid #22c55e",
                borderRadius:"18px", padding:"28px 44px", textAlign:"center",
                boxShadow:"0 0 40px rgba(34,197,94,0.4), 0 0 80px rgba(34,197,94,0.18)",
                animation:"scaleIn .35s cubic-bezier(.34,1.56,.64,1)",
                backdropFilter:"blur(4px)",
              }}>
                <div style={{ fontSize:"38px", fontWeight:800, color:"#22c55e", letterSpacing:"1px", lineHeight:1.1, marginBottom:"10px" }}>
                  {formatMult(currentMult)}
                </div>
                <div style={{ width:"100%", height:"1px", background:"#22c55e44", marginBottom:"10px" }}/>
                <div style={{ fontSize:"20px", fontWeight:700, color:"#fff", opacity:currencyFade }}>
                  {fmtMoney(resultOverlay.amount)}
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      </div>{/* end body flex row */}

      {/* ── Floating draggable stats panel ── */}
      {showMinesStats && (
        <div style={{ position:"fixed",left:minesStatsPos.x,top:minesStatsPos.y,zIndex:9999,width:"280px",background:"#0f1f2e",border:"1px solid #1e3a52",borderRadius:"14px",boxShadow:"0 8px 32px rgba(0,0,0,.7)",overflow:"hidden",userSelect:"none" }}>
          <div onMouseDown={handleMinesStatsDragStart}
            style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",background:"#112232",borderBottom:"1px solid #1e3a52",cursor:"grab" }}>
            <div style={{ display:"flex",alignItems:"center",gap:"8px" }}>
              <span style={{ display:"flex",alignItems:"center",color:"#7a9db8" }}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg></span>
              <strong style={{ fontSize:"14px",color:"#d8e8f5" }}>Estadísticas en vivo</strong>
            </div>
            <button onClick={()=>setShowMinesStats(false)} style={{ background:"none",border:"none",color:"#7a9db8",fontSize:"18px",cursor:"pointer",lineHeight:1,padding:"0 2px" }}>×</button>
          </div>

          <div style={{ padding:"12px" }}>
            <div style={{ background:"#0d1a28",borderRadius:"10px",padding:"12px",marginBottom:"8px",display:"flex",flexDirection:"column",gap:"8px" }}>
              {([
                { label:"Beneficio", value:fmtMoney(minesStats.profit), color:minesStats.profit>=0?"#16ff5c":"#ff5959", extra:{ opacity:currencyFade,transition:"opacity .18s" } },
                { label:"Ganadas",   value:String(minesStats.wins),     color:"#16ff5c", extra:{} },
                { label:"Apostado",  value:fmtMoney(minesStats.wagered),color:"#d8e8f5", extra:{ opacity:currencyFade,transition:"opacity .18s" } },
                { label:"Perdidas",  value:String(minesStats.losses),   color:"#ff5959", extra:{} },
              ] as {label:string;value:string;color:string;extra:React.CSSProperties}[]).map(s=>(
                <div key={s.label} style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <span style={{ color:"#7a9db8",fontSize:"11.5px" }}>{s.label}</span>
                  <span style={{ color:s.color,fontWeight:500,fontSize:"13px",...s.extra }}>{s.value}</span>
                </div>
              ))}
            </div>

            <button onClick={onResetStats}
              style={{ width:"100%",marginBottom:"8px",background:"transparent",border:"1px solid #1e3a52",borderRadius:"8px",color:"#7a9db8",fontSize:"12px",cursor:"pointer",padding:"6px 0",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px",transition:"color .15s,border-color .15s,background .15s" }}
              onMouseEnter={e=>{const b=e.currentTarget as HTMLButtonElement;b.style.color="#fff";b.style.borderColor="#3a8aff";b.style.background="#0d1f30";}}
              onMouseLeave={e=>{const b=e.currentTarget as HTMLButtonElement;b.style.color="#7a9db8";b.style.borderColor="#1e3a52";b.style.background="transparent";}}
            ><span style={{ fontSize:"14px" }}>↺</span> Reiniciar estadísticas</button>

            {(()=>{
              const raw = minesStats.history.length>0 ? minesStats.history.slice().reverse() : null;
              const W=320, H=210, PAD_X=12, PAD_Y=20;
              const chartW=W-PAD_X*2, chartH=H-PAD_Y*2;
              interface ChartPt { cum:number; win:boolean; profit:number }
              let series: ChartPt[] = [];
              if(raw){ let r=0; series=raw.map(p=>{ r+=(p.profit??0); return {cum:r,win:p.win,profit:p.profit??0}; }); }
              const allPts: ChartPt[] = raw ? [{cum:0,win:false,profit:0},...series] : [];
              const n=allPts.length;
              if(n<2) return (
                <div style={{ position:"relative",background:"#0a1520",borderRadius:"12px",height:"190px",display:"flex",alignItems:"center",justifyContent:"center",border:"1px solid #1a3347" }}>
                  <span style={{ color:"#2a4a6a",fontSize:"12px" }}>Sin historial</span>
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
              const hIdx=minesChartHover;
              const hpt=hIdx!==null&&hIdx>0&&hIdx<allPts.length?allPts[hIdx]:null;
              const linePath=xs.map((x,i)=>`${i===0?"M":"L"}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
              const fillAbove=linePath+` L${xs[n-1].toFixed(1)} ${zeroY.toFixed(1)} L${xs[0].toFixed(1)} ${zeroY.toFixed(1)} Z`;
              const fillBelow=linePath+` L${xs[n-1].toFixed(1)} ${zeroY.toFixed(1)} L${xs[0].toFixed(1)} ${zeroY.toFixed(1)} Z`;
              const tipLeft=hIdx!==null&&xs.length?Math.min(Math.max((xs[hIdx]/W)*100,12),78):0;
              const tipTop=hIdx!==null&&ys.length?Math.max((ys[hIdx]/H)*100-14,2):0;
              return (
                <div style={{ position:"relative",background:"#0a1520",borderRadius:"12px",height:"190px",overflow:"visible",border:"1px solid #1a3347" }}>
                  {hpt && (
                    <div style={{ position:"absolute",left:`${tipLeft}%`,top:`${tipTop}%`,transform:"translateX(-50%) translateY(-100%)",background:"#1a2a3a",border:`1.5px solid ${hpt.profit>=0?"#19ff35":"#ff3350"}`,borderRadius:"8px",padding:"4px 10px",fontSize:"12px",fontWeight:500,color:hpt.profit>=0?"#19ff35":"#ff3350",whiteSpace:"nowrap",pointerEvents:"none",zIndex:20,boxShadow:`0 2px 12px ${hpt.profit>=0?"rgba(25,255,53,.3)":"rgba(255,51,80,.3)"}`}}>
                      {hpt.profit>=0?"+":""}{fmtMoney(hpt.profit)}
                      <span style={{ color:"#7a9db8",fontWeight:400,fontSize:"10px",marginLeft:"6px" }}>acum: {hpt.cum>=0?"+":""}{fmtMoney(hpt.cum)}</span>
                    </div>
                  )}
                  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width:"100%",height:"100%",display:"block",cursor:"crosshair" }}
                    onMouseMove={e=>{
                      if(!xs.length) return;
                      const rect=(e.currentTarget as SVGSVGElement).getBoundingClientRect();
                      const svgX=((e.clientX-rect.left)/rect.width)*W;
                      let closest=0,minDist=Infinity;
                      xs.forEach((x,i)=>{ const d=Math.abs(x-svgX); if(d<minDist){minDist=d;closest=i;} });
                      setMinesChartHover(closest);
                    }}
                    onMouseLeave={()=>setMinesChartHover(null)}
                  >
                    <defs>
                      <clipPath id="minesClipAbove"><rect x={PAD_X} y={PAD_Y} width={chartW} height={zeroY-PAD_Y}/></clipPath>
                      <clipPath id="minesClipBelow"><rect x={PAD_X} y={zeroY} width={chartW} height={chartH-(zeroY-PAD_Y)}/></clipPath>
                    </defs>
                    {n>1?<>
                      <path d={fillBelow} fill="rgba(200,30,30,.35)" clipPath="url(#minesClipBelow)"/>
                      <path d={fillAbove} fill="rgba(25,255,80,.18)" clipPath="url(#minesClipAbove)"/>
                      <line x1={PAD_X} y1={zeroY} x2={W-PAD_X} y2={zeroY} stroke="#2a4055" strokeWidth="1.5"/>
                      <path d={linePath} fill="none" stroke="#19ff35" strokeWidth="2.5" strokeLinejoin="miter" strokeLinecap="square" clipPath="url(#minesClipAbove)"/>
                      <path d={linePath} fill="none" stroke="#e03030" strokeWidth="2.5" strokeLinejoin="miter" strokeLinecap="square" clipPath="url(#minesClipBelow)"/>
                      <rect x={PAD_X} y={PAD_Y} width={chartW} height={chartH} fill="transparent"/>
                      {hIdx!==null&&hIdx<allPts.length&&<>
                        <line x1={xs[hIdx]} y1={PAD_Y} x2={xs[hIdx]} y2={H-PAD_Y} stroke="#3a5570" strokeWidth="1" strokeDasharray="4,3"/>
                        <circle cx={xs[hIdx]} cy={ys[hIdx]} r="5" fill={allPts[hIdx].profit>=0?"#19ff35":"#ff3350"} stroke="#0a1520" strokeWidth="2" style={{ pointerEvents:"none" }}/>
                      </>}
                    </>:<line x1={PAD_X} y1={H/2} x2={W-PAD_X} y2={H/2} stroke="#2a4055" strokeWidth="1.5"/>}
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
