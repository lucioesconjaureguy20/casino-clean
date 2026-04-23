import React, { useState, useMemo } from "react";
import { gt } from "./lib/gameLabels";

// ── Wheel / group constants ────────────────────────────────────────────────────
const WHEEL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RED_SET     = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

const JUEGO_0   = new Set([12,35,3,26,0,32,15]);
const VOISINS   = new Set([22,18,29,7,28,12,35,3,26,0,32,15,19,4,21,2,25]);
const TIERS     = new Set([27,13,36,11,30,8,23,10,5,24,16,33]);
const ORPHELINS = new Set([1,20,14,31,9,17,34,6]);

function getNeighbors(num: number, n: number): number[] {
  const idx = WHEEL_ORDER.indexOf(num);
  const len = WHEEL_ORDER.length;
  return Array.from({ length: n * 2 + 1 }, (_, i) =>
    WHEEL_ORDER[(idx + i - n + len) % len]
  );
}

function numBg(n: number): string {
  if (n === 0) return "#16a34a";
  return RED_SET.has(n) ? "#b91c1c" : "#1c1c28";
}
function numActiveBg(n: number): string {
  if (n === 0) return "#22c55e";
  return RED_SET.has(n) ? "#ef4444" : "#4b5563";
}

// ── Oval layout constants ─────────────────────────────────────────────────────
// Numbers are placed in European wheel order starting from 0 at the left vertex,
// going counter-clockwise (upward) — same layout as Pragmatic Play.
//
//   θ_i = π + (i / 37) * 2π
//   x = CX + TRX * cos(θ_i)
//   y = CY + TRY * sin(θ_i)
//
const SVG_W = 600;
const SVG_H = 185;
const CX    = SVG_W / 2;   // 300
const CY    = SVG_H / 2;   // 92.5
const TRX   = 270;          // horizontal track radius
const TRY   = 68;           // vertical track radius
const PW    = 24;           // pill width
const PH    = 17;           // pill height
const PR    = 4.5;          // pill corner radius

function numPos(i: number): { x: number; y: number; rot: number } {
  const θ  = Math.PI + (i / 37) * 2 * Math.PI;
  const x  = CX + TRX * Math.cos(θ);
  const y  = CY + TRY * Math.sin(θ);
  // Tangent angle — rotates the pill to follow the oval edge
  const tx  = -TRX * Math.sin(θ);
  const ty  =  TRY * Math.cos(θ);
  const rot = Math.atan2(ty, tx) * (180 / Math.PI);
  return { x, y, rot };
}

// ── Component props ───────────────────────────────────────────────────────────
interface Props {
  placeBet:   (key: string) => void;
  tableBets:  Record<string, number>;
  chipUsd:    number;
  isSpinning: boolean;
  winNumber:  number | null;
  lang?:      string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function RouletteRacetrack({
  placeBet, tableBets, isSpinning, winNumber, lang = "es",
}: Props) {
  const [neighborN,  setNeighborN]  = useState(2);
  const [hoverNum,   setHoverNum]   = useState<number | null>(null);
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);

  const preview = useMemo<Set<number>>(() => {
    if (hoverNum   !== null)  return new Set(getNeighbors(hoverNum, neighborN));
    if (hoverGroup === "j0")  return JUEGO_0;
    if (hoverGroup === "ve")  return VOISINS;
    if (hoverGroup === "hu")  return ORPHELINS;
    if (hoverGroup === "te")  return TIERS;
    return new Set();
  }, [hoverNum, neighborN, hoverGroup]);

  function betNums(nums: Iterable<number>) {
    if (isSpinning) return;
    for (const n of nums) placeBet(`n_${n}`);
  }

  const centerBtns = [
    { id: "j0", label: "Juego 0",   nums: JUEGO_0,   border: "#16a34a", bg: "#14532d" },
    { id: "ve", label: "Vecinos",   nums: VOISINS,   border: "#1d4ed8", bg: "#1e3a8a" },
    { id: "hu", label: "Huérfanos", nums: ORPHELINS, border: "#b45309", bg: "#451a03" },
    { id: "te", label: "Tercio",    nums: TIERS,     border: "#7c3aed", bg: "#3b0764" },
  ] as const;

  return (
    <div style={{
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      gap:            8,
      userSelect:     "none",
      width:          "100%",
    }}>

      {/* ── Neighbor count control ─────────────────────────────────────── */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        background:   "#0d0d14",
        border:       "1px solid rgba(255,255,255,0.13)",
        borderRadius: 6,
        overflow:     "hidden",
      }}>
        <button
          onClick={() => setNeighborN(v => Math.max(1, v - 1))}
          disabled={isSpinning || neighborN <= 1}
          style={{
            padding:    "5px 15px",
            background: "none",
            border:     "none",
            color:      neighborN > 1 ? "#e2e8f0" : "#2a3040",
            fontSize:   17,
            fontWeight: 700,
            cursor:     neighborN > 1 && !isSpinning ? "pointer" : "default",
            fontFamily: "inherit",
            lineHeight: 1,
          }}
        >−</button>

        <span style={{
          padding:      "5px 14px",
          fontSize:     13,
          fontWeight:   700,
          color:        "#f59e0b",
          borderLeft:   "1px solid rgba(255,255,255,0.08)",
          borderRight:  "1px solid rgba(255,255,255,0.08)",
          minWidth:     24,
          textAlign:    "center",
        }}>
          {neighborN}
        </span>

        <button
          onClick={() => setNeighborN(v => Math.min(8, v + 1))}
          disabled={isSpinning || neighborN >= 8}
          style={{
            padding:    "5px 15px",
            background: "none",
            border:     "none",
            color:      neighborN < 8 ? "#e2e8f0" : "#2a3040",
            fontSize:   17,
            fontWeight: 700,
            cursor:     neighborN < 8 && !isSpinning ? "pointer" : "default",
            fontFamily: "inherit",
            lineHeight: 1,
          }}
        >+</button>
      </div>

      {/* ── Oval racetrack ─────────────────────────────────────────────── */}
      <div style={{ position: "relative", width: "100%", maxWidth: SVG_W }}>

        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          width="100%"
          style={{ display: "block", overflow: "visible" }}
        >
          {/* ── Track background (outer ellipse) ── */}
          <ellipse
            cx={CX} cy={CY}
            rx={TRX + PW / 2 + 6}
            ry={TRY + PH / 2 + 6}
            fill="#0e0c10"
            stroke="#2a2030"
            strokeWidth={1.5}
          />

          {/* ── Inner clear area ── */}
          <ellipse
            cx={CX} cy={CY}
            rx={TRX - PW / 2 - 5}
            ry={TRY - PH / 2 - 5}
            fill="#0a0810"
            stroke="#1a1525"
            strokeWidth={1}
          />

          {/* ── Number pills ── */}
          {WHEEL_ORDER.map((num, i) => {
            const { x, y, rot } = numPos(i);
            const isWin   = winNumber === num;
            const isPrev  = preview.has(num);
            const hasBet  = (tableBets[`n_${num}`] ?? 0) > 0;

            let bg        = numBg(num);
            let textColor = "#fff";
            if      (isWin)  { bg = "#22ee66"; textColor = "#000"; }
            else if (isPrev) { bg = numActiveBg(num); }

            const ringColor = isWin ? "#ffffff" : "#f59e0b";
            const showRing  = isWin || isPrev;

            return (
              <g
                key={num}
                // rotate pill to follow oval tangent; text is counter-rotated
                transform={`rotate(${rot},${x},${y})`}
                onClick={() => { if (!isSpinning) betNums(getNeighbors(num, neighborN)); }}
                onMouseEnter={() => { if (!isSpinning) setHoverNum(num); }}
                onMouseLeave={() => setHoverNum(null)}
                style={{ cursor: isSpinning ? "default" : "pointer" }}
              >
                {/* Glow halo */}
                {showRing && (
                  <rect
                    x={x - PW / 2 - 3} y={y - PH / 2 - 3}
                    width={PW + 6} height={PH + 6}
                    rx={PR + 2}
                    fill={isWin ? "#22ee6628" : "#f59e0b20"}
                  />
                )}

                {/* Pill fill */}
                <rect
                  x={x - PW / 2} y={y - PH / 2}
                  width={PW} height={PH}
                  rx={PR}
                  fill={bg}
                />

                {/* Pill ring */}
                {showRing && (
                  <rect
                    x={x - PW / 2} y={y - PH / 2}
                    width={PW} height={PH}
                    rx={PR}
                    fill="none"
                    stroke={ringColor}
                    strokeWidth={1.5}
                  />
                )}

                {/* Bet dot */}
                {hasBet && !isWin && (
                  <circle
                    cx={x + PW / 2 - 3.5}
                    cy={y - PH / 2 + 3.5}
                    r={3.2}
                    fill="#f59e0b"
                    stroke="#000"
                    strokeWidth={0.6}
                    transform={`rotate(${-rot},${x + PW / 2 - 3.5},${y - PH / 2 + 3.5})`}
                  />
                )}

                {/* Number text — always horizontal via counter-rotation */}
                <text
                  x={x} y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={textColor}
                  fontSize={num >= 10 ? 8 : 9.5}
                  fontWeight="800"
                  fontFamily="Arial, sans-serif"
                  transform={`rotate(${-rot},${x},${y})`}
                  style={{ pointerEvents: "none" }}
                >
                  {num}
                </text>
              </g>
            );
          })}
        </svg>

        {/* ── Center overlay — 4 bet group buttons ───────────────────── */}
        <div style={{
          position:            "absolute",
          top:                 "50%",
          left:                "50%",
          transform:           "translate(-50%, -50%)",
          display:             "flex",
          flexDirection:       "row",
          gap:                 5,
          width:               "58%",
        }}>
          {centerBtns.map(({ id, label, nums, border, bg }) => {
            const active = hoverGroup === id;
            return (
              <button
                key={id}
                disabled={isSpinning}
                onClick={() => betNums(nums)}
                onMouseEnter={() => { if (!isSpinning) setHoverGroup(id); }}
                onMouseLeave={() => setHoverGroup(null)}
                style={{
                  flex:          1,
                  padding:       "7px 3px",
                  borderRadius:  5,
                  border:        `1.5px solid ${active ? border : border + "55"}`,
                  background:    active ? bg : bg + "88",
                  color:         active ? "#fff" : "#99a",
                  fontSize:      9.5,
                  fontWeight:    700,
                  cursor:        isSpinning ? "default" : "pointer",
                  transition:    "all .13s",
                  whiteSpace:    "nowrap",
                  fontFamily:    "inherit",
                  textAlign:     "center",
                  lineHeight:    1.2,
                  boxShadow:     active ? `0 0 8px ${border}55` : "none",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Hover hint ─────────────────────────────────────────────────── */}
      {hoverNum !== null && (
        <div style={{
          fontSize:      10,
          color:         "rgba(255,255,255,0.32)",
          textAlign:     "center",
          letterSpacing: "0.3px",
        }}>
          {gt(lang, "rtNeighborHint")} {getNeighbors(hoverNum, neighborN).join(" · ")}
        </div>
      )}

    </div>
  );
}
