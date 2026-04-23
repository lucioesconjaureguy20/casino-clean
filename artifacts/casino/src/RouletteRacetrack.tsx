import React, { useState, useMemo, useRef } from "react";

// ── Wheel constants ────────────────────────────────────────────────────────────
const WHEEL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RED_SET     = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

// ── Bet groups ─────────────────────────────────────────────────────────────────
const VOISINS   = new Set([22,18,29,7,28,12,35,3,26,0,32,15,19,4,21,2,25]);
const TIERS     = new Set([27,13,36,11,30,8,23,10,5,24,16,33]);
const ORPHELINS = new Set([1,20,14,31,9,17,34,6]);

// Top row of the oval track: 0 → 20  (25 numbers, left to right)
const TOP_ROW    = WHEEL_ORDER.slice(0, 25);
// Bottom row: 26 → 14  reversed so it reads right → left under the top row
const BOTTOM_ROW = [...WHEEL_ORDER.slice(25)].reverse();

function getNeighbors(num: number, n = 2): number[] {
  const idx = WHEEL_ORDER.indexOf(num);
  const len = WHEEL_ORDER.length;
  return Array.from({ length: n * 2 + 1 }, (_, i) =>
    WHEEL_ORDER[(idx + i - n + len) % len]
  );
}

function numColor(n: number) {
  if (n === 0) return { bg: "#16a34a", hover: "#22c55e", text: "#fff" };
  if (RED_SET.has(n)) return { bg: "#991b1b", hover: "#ef4444", text: "#fff" };
  return { bg: "#111827", hover: "#374151", text: "#fff" };
}

interface Props {
  placeBet:  (key: string) => void;
  tableBets: Record<string, number>;
  chipUsd:   number;
  isSpinning: boolean;
  winNumber:  number | null;
}

export function RouletteRacetrack({ placeBet, tableBets, isSpinning, winNumber }: Props) {
  const [hoverNum,   setHoverNum]   = useState<number | null>(null);
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const preview = useMemo<Set<number>>(() => {
    if (hoverNum !== null)      return new Set(getNeighbors(hoverNum, 2));
    if (hoverGroup === "v")     return VOISINS;
    if (hoverGroup === "t")     return TIERS;
    if (hoverGroup === "o")     return ORPHELINS;
    return new Set();
  }, [hoverNum, hoverGroup]);

  function betNums(nums: Iterable<number>) {
    if (isSpinning) return;
    for (const n of nums) placeBet(`n_${n}`);
  }

  function cellState(n: number) {
    const isWin      = winNumber === n;
    const isPreview  = preview.has(n);
    const hasBet     = (tableBets[`n_${n}`] ?? 0) > 0;
    const col        = numColor(n);
    let bg           = col.bg;
    let border       = "1.5px solid rgba(255,255,255,0.10)";
    let shadow       = "none";
    let textColor    = col.text;

    if (isWin) {
      bg     = "#22ee66";
      border = "2px solid #ffffff";
      shadow = "0 0 10px #22ee6699";
      textColor = "#000";
    } else if (isPreview) {
      bg     = col.hover;
      border = "1.5px solid rgba(255,255,255,0.5)";
      shadow = `0 0 6px ${col.hover}88`;
    }
    return { bg, border, shadow, textColor, hasBet };
  }

  const CELL_W = 36;
  const CELL_H = 26;

  function NumCell({ n, style }: { n: number; style?: React.CSSProperties }) {
    const { bg, border, shadow, textColor, hasBet } = cellState(n);
    const bet = tableBets[`n_${n}`] ?? 0;
    return (
      <div
        onClick={() => betNums(getNeighbors(n, 2))}
        onMouseEnter={() => { if (!isSpinning) setHoverNum(n); }}
        onMouseLeave={() => setHoverNum(null)}
        title={`Número ${n} — click para apostar en sus 5 vecinos`}
        style={{
          position:       "relative",
          width:          CELL_W,
          minWidth:       CELL_W,
          height:         CELL_H,
          background:     bg,
          border,
          boxShadow:      shadow,
          borderRadius:   5,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          cursor:         isSpinning ? "default" : "pointer",
          userSelect:     "none",
          fontWeight:     700,
          fontSize:       11,
          color:          textColor,
          transition:     "background .12s, border-color .12s, box-shadow .12s, transform .08s",
          transform:      hoverNum !== null && getNeighbors(hoverNum,2).includes(n) && !isSpinning ? "scale(1.08)" : "scale(1)",
          flexShrink:     0,
          ...style,
        }}
      >
        {n}
        {hasBet && (
          <div style={{
            position:  "absolute",
            top:        -5,
            right:      -5,
            width:      12,
            height:     12,
            borderRadius: "50%",
            background:  "#f59e0b",
            border:      "1.5px solid #fff",
            display:     "flex",
            alignItems:  "center",
            justifyContent: "center",
            fontSize:    7,
            fontWeight:  900,
            color:       "#000",
            lineHeight:  1,
          }}>
            {bet >= 1000 ? `${Math.round(bet/1000)}k` : bet >= 10 ? Math.round(bet) : bet.toFixed(bet < 0.1 ? 2 : 1)}
          </div>
        )}
      </div>
    );
  }

  const trackPad  = 8;   // horizontal padding inside the track
  const gapX      = 3;   // gap between cells
  const topW      = TOP_ROW.length * (CELL_W + gapX) - gapX;
  const botW      = BOTTOM_ROW.length * (CELL_W + gapX) - gapX;
  const trackW    = Math.max(topW, botW) + trackPad * 2;

  return (
    <div style={{ width: "100%", userSelect: "none" }}>

      {/* ── Quick-bet buttons ──────────────────────────────────────────── */}
      <div style={{
        display:        "flex",
        gap:            6,
        marginBottom:   8,
        flexWrap:       "wrap",
      }}>
        {([ 
          { id:"v", label:"Voisins du Zéro",   nums: VOISINS,   color:"#1d4ed8" },
          { id:"t", label:"Tiers du Cylindre",  nums: TIERS,     color:"#7c3aed" },
          { id:"o", label:"Orphelins",          nums: ORPHELINS, color:"#b45309" },
        ] as const).map(({ id, label, nums, color }) => (
          <button
            key={id}
            disabled={isSpinning}
            onClick={() => betNums(nums)}
            onMouseEnter={() => { if (!isSpinning) setHoverGroup(id); }}
            onMouseLeave={() => setHoverGroup(null)}
            style={{
              flex:           "1 1 0",
              minWidth:       100,
              padding:        "6px 10px",
              borderRadius:   7,
              border:         `1.5px solid ${color}88`,
              background:     hoverGroup === id ? color : `${color}22`,
              color:          hoverGroup === id ? "#fff" : "#ccd",
              fontSize:       11,
              fontWeight:     700,
              cursor:         isSpinning ? "default" : "pointer",
              transition:     "all .15s",
              letterSpacing:  "0.2px",
              whiteSpace:     "nowrap",
              fontFamily:     "inherit",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Racetrack oval ────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        style={{
          overflowX:    "auto",
          overflowY:    "visible",
          paddingBottom: 4,
          /* hide scrollbar but keep functionality */
          scrollbarWidth: "none",
        }}
      >
        {/* Oval wrapper */}
        <div style={{
          position:    "relative",
          display:     "inline-flex",
          flexDirection: "column",
          alignItems:  "center",
          gap:          4,
          background:  "#0a0c12",
          borderRadius: 20,
          padding:     `${trackPad}px ${trackPad + 14}px`,
          border:      "1.5px solid rgba(255,255,255,0.08)",
          boxShadow:   "inset 0 0 24px rgba(0,0,0,0.5)",
          minWidth:    trackW,
        }}>

          {/* Label */}
          <div style={{
            fontSize:     9,
            letterSpacing: "1.5px",
            color:        "rgba(255,255,255,0.25)",
            fontWeight:   700,
            textTransform: "uppercase",
            alignSelf:    "flex-start",
            marginBottom: -2,
          }}>
            Racetrack
          </div>

          {/* Top row: 0 → 20 */}
          <div style={{ display:"flex", gap: gapX, alignItems:"center" }}>
            {TOP_ROW.map(n => <NumCell key={n} n={n} />)}
          </div>

          {/* Bottom row: 26 → 14 (reversed = displayed right-to-left under top) */}
          <div style={{ display:"flex", gap: gapX, alignItems:"center", paddingLeft: (topW - botW) / 2 }}>
            {BOTTOM_ROW.map(n => <NumCell key={n} n={n} />)}
          </div>

        </div>
      </div>

      {/* Neighbor hint */}
      {hoverNum !== null && (
        <div style={{
          marginTop:  4,
          fontSize:   10,
          color:      "rgba(255,255,255,0.35)",
          textAlign:  "center",
          letterSpacing: "0.3px",
        }}>
          Apostando en 5 números: {getNeighbors(hoverNum, 2).join(" · ")}
        </div>
      )}

    </div>
  );
}
