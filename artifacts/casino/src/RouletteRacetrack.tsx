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
  return RED_SET.has(n) ? "#c41c1c" : "#111";
}
function numActiveBg(n: number): string {
  if (n === 0) return "#22c55e";
  return RED_SET.has(n) ? "#ef4444" : "#374151";
}

// ── Stadium geometry ──────────────────────────────────────────────────────────
//  Two straight segments (top / bottom) + two semicircles (left / right).
//  0 is at the leftmost point; numbers go counterclockwise (upward first).
const SVG_W  = 560;
const SVG_H  = 155;
const CX     = SVG_W / 2;   // 280
const CY     = SVG_H / 2;   // 77.5
const R      = 50;           // semicircle radius
const HALF_L = 196;          // half-length of each straight segment

const CX1 = CX - HALF_L;    // left semicircle centre x
const CX2 = CX + HALF_L;    // right semicircle centre x

const PERIMETER = 4 * HALF_L + 2 * Math.PI * R;

// Cumulative arc positions for each section (0 = leftmost of left curve)
const S1 = (Math.PI / 2) * R;                // end of left-upper quarter
const S2 = S1 + 2 * HALF_L;                  // end of top straight
const S3 = S2 + Math.PI * R;                  // end of right semicircle
const S4 = S3 + 2 * HALF_L;                  // end of bottom straight

/** Arc-length → position + tangent angle on the stadium perimeter. */
function stadiumPoint(s: number): { x: number; y: number; rot: number } {
  let x: number, y: number, θ: number;

  if (s <= S1) {
    // Left-upper quarter: leftmost (π) → top-left (3π/2)
    θ = Math.PI + (s / S1) * (Math.PI / 2);
    x = CX1 + R * Math.cos(θ);
    y = CY  + R * Math.sin(θ);
  } else if (s <= S2) {
    // Top straight: left → right
    return { x: CX1 + (s - S1), y: CY - R, rot: 0 };
  } else if (s <= S3) {
    // Right semicircle: top (−π/2) → bottom (+π/2)
    θ = -Math.PI / 2 + (s - S2) / R;
    x = CX2 + R * Math.cos(θ);
    y = CY  + R * Math.sin(θ);
  } else if (s <= S4) {
    // Bottom straight: right → left
    return { x: CX2 - (s - S3), y: CY + R, rot: 0 };
  } else {
    // Left-lower quarter: bottom-left (π/2) → leftmost (π)
    θ = Math.PI / 2 + ((s - S4) / ((Math.PI / 2) * R)) * (Math.PI / 2);
    x = CX1 + R * Math.cos(θ);
    y = CY  + R * Math.sin(θ);
  }
  // Tangent for circular arcs: direction of travel = (−sinθ, cosθ)
  return { x, y, rot: Math.atan2(Math.cos(θ!), -Math.sin(θ!)) * (180 / Math.PI) };
}

// Pill dimensions — PW equals the arc-length step so pills touch with no gap
const PW = PERIMETER / 37;  // ≈ 29.9 SVG units
const PH = 22;               // pill height (uniform for all numbers)
const PR = 3;                // border-radius (max 4px as requested)

// Precomputed positions for all 37 numbers
const POSITIONS: { x: number; y: number; rot: number }[] =
  WHEEL_ORDER.map((_, i) => stadiumPoint((i / 37) * PERIMETER));

// Inner button area (foreignObject coords in SVG units)
const BTN_X  = CX1 + 1;
const BTN_Y  = CY - R + PH / 2 + 1;
const BTN_W  = 2 * HALF_L - 2;
const BTN_H  = 2 * R - PH - 2;

// ── Props ─────────────────────────────────────────────────────────────────────
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
    { id: "j0", label: "Juego 0",   nums: JUEGO_0 },
    { id: "ve", label: "Vecinos",   nums: VOISINS },
    { id: "hu", label: "Huérfanos", nums: ORPHELINS },
    { id: "te", label: "Tercio",    nums: TIERS },
  ] as const;

  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      alignItems:    "center",
      gap:           8,
      userSelect:    "none",
      width:         "100%",
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
            padding:    "5px 15px", background: "none", border: "none",
            color:      neighborN > 1 ? "#e2e8f0" : "#2a3040",
            fontSize:   17, fontWeight: 700, lineHeight: 1,
            cursor:     neighborN > 1 && !isSpinning ? "pointer" : "default",
            fontFamily: "'Inter', Arial, sans-serif",
          }}
        >−</button>

        <span style={{
          padding: "5px 14px", fontSize: 13, fontWeight: 700, color: "#f59e0b",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
          minWidth: 24, textAlign: "center",
          fontFamily: "'Inter', Arial, sans-serif",
        }}>
          {neighborN}
        </span>

        <button
          onClick={() => setNeighborN(v => Math.min(8, v + 1))}
          disabled={isSpinning || neighborN >= 8}
          style={{
            padding:    "5px 15px", background: "none", border: "none",
            color:      neighborN < 8 ? "#e2e8f0" : "#2a3040",
            fontSize:   17, fontWeight: 700, lineHeight: 1,
            cursor:     neighborN < 8 && !isSpinning ? "pointer" : "default",
            fontFamily: "'Inter', Arial, sans-serif",
          }}
        >+</button>
      </div>

      {/* ── Stadium racetrack (SVG) ────────────────────────────────────── */}
      <div style={{ width: "100%", maxWidth: SVG_W }}>
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          width="100%"
          style={{ display: "block", overflow: "visible" }}
        >
          {/* ── Track background ring ── */}
          {/* Outer stadium outline */}
          <path
            d={`
              M ${CX1} ${CY - R - PH / 2 - 4}
              L ${CX2} ${CY - R - PH / 2 - 4}
              A ${R + PH / 2 + 4} ${R + PH / 2 + 4} 0 0 1
                ${CX2} ${CY + R + PH / 2 + 4}
              L ${CX1} ${CY + R + PH / 2 + 4}
              A ${R + PH / 2 + 4} ${R + PH / 2 + 4} 0 0 1
                ${CX1} ${CY - R - PH / 2 - 4}
              Z
            `}
            fill="#0e0c10"
            stroke="#222028"
            strokeWidth={1.5}
          />
          {/* Inner cutout */}
          <path
            d={`
              M ${CX1} ${CY - R + PH / 2 + 4}
              L ${CX2} ${CY - R + PH / 2 + 4}
              A ${R - PH / 2 - 4} ${R - PH / 2 - 4} 0 0 1
                ${CX2} ${CY + R - PH / 2 - 4}
              L ${CX1} ${CY + R - PH / 2 - 4}
              A ${R - PH / 2 - 4} ${R - PH / 2 - 4} 0 0 1
                ${CX1} ${CY - R + PH / 2 + 4}
              Z
            `}
            fill="#0a0810"
          />

          {/* ── Number pills — width = arc step → no gaps ── */}
          {WHEEL_ORDER.map((num, i) => {
            const { x, y, rot } = POSITIONS[i];
            const isWin   = winNumber === num;
            const isPrev  = preview.has(num);
            const hasBet  = (tableBets[`n_${num}`] ?? 0) > 0;

            let bg        = numBg(num);
            let textColor = "#fff";
            if      (isWin)  { bg = "#22ee66"; textColor = "#000"; }
            else if (isPrev) { bg = numActiveBg(num); }

            return (
              <g
                key={num}
                transform={`rotate(${rot},${x},${y})`}
                onClick={() => { if (!isSpinning) betNums(getNeighbors(num, neighborN)); }}
                onMouseEnter={() => { if (!isSpinning) setHoverNum(num); }}
                onMouseLeave={() => setHoverNum(null)}
                style={{ cursor: isSpinning ? "default" : "pointer" }}
              >
                {/* Win / preview glow */}
                {(isWin || isPrev) && (
                  <rect
                    x={x - PW / 2 - 2} y={y - PH / 2 - 2}
                    width={PW + 4} height={PH + 4} rx={PR + 1}
                    fill={isWin ? "#22ee6630" : "#f59e0b28"}
                  />
                )}

                {/* Pill */}
                <rect
                  x={x - PW / 2} y={y - PH / 2}
                  width={PW} height={PH} rx={PR}
                  fill={bg}
                  stroke={(isWin || isPrev) ? (isWin ? "#fff" : "#f59e0b") : "none"}
                  strokeWidth={1.5}
                />

                {/* Bet dot */}
                {hasBet && !isWin && (
                  <circle
                    cx={x + PW / 2 - 4} cy={y - PH / 2 + 4} r={3}
                    fill="#f59e0b" stroke="#000" strokeWidth={0.5}
                    transform={`rotate(${-rot},${x + PW / 2 - 4},${y - PH / 2 + 4})`}
                  />
                )}

                {/* Number — always horizontal via counter-rotation */}
                <text
                  x={x} y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={textColor}
                  fontSize={10}
                  fontWeight="700"
                  fontFamily="'Inter', Arial, sans-serif"
                  transform={`rotate(${-rot},${x},${y})`}
                  style={{ pointerEvents: "none" }}
                >
                  {num}
                </text>
              </g>
            );
          })}

          {/* ── Center section buttons (foreignObject for exact placement) ── */}
          <foreignObject
            x={BTN_X} y={BTN_Y}
            width={BTN_W} height={BTN_H}
          >
            <div
              // @ts-ignore (xmlns required for foreignObject in SVG)
              xmlns="http://www.w3.org/1999/xhtml"
              style={{
                display:         "flex",
                width:           "100%",
                height:          "100%",
                background:      "#0a0810",
                border:          "1px solid rgba(255,255,255,0.08)",
                borderRadius:    2,
                overflow:        "hidden",
              }}
            >
              {centerBtns.map(({ id, label, nums }, idx) => {
                const active = hoverGroup === id;
                return (
                  <button
                    key={id}
                    disabled={isSpinning}
                    onClick={() => betNums(nums)}
                    onMouseEnter={() => { if (!isSpinning) setHoverGroup(id); }}
                    onMouseLeave={() => setHoverGroup(null)}
                    style={{
                      flex:           1,
                      padding:        0,
                      background:     active ? "rgba(255,255,255,0.12)" : "transparent",
                      border:         "none",
                      borderRight:    idx < 3 ? "1px solid rgba(255,255,255,0.12)" : "none",
                      color:          active ? "#fff" : "rgba(255,255,255,0.65)",
                      fontSize:       10,
                      fontWeight:     700,
                      fontFamily:     "'Inter', Arial, sans-serif",
                      cursor:         isSpinning ? "default" : "pointer",
                      transition:     "background .13s, color .13s",
                      letterSpacing:  "0.2px",
                      whiteSpace:     "nowrap",
                      textAlign:      "center",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </foreignObject>
        </svg>
      </div>

      {/* ── Hover hint ─────────────────────────────────────────────────── */}
      {hoverNum !== null && (
        <div style={{
          fontSize:  10,
          color:     "rgba(255,255,255,0.32)",
          textAlign: "center",
          fontFamily: "'Inter', Arial, sans-serif",
        }}>
          {gt(lang, "rtNeighborHint")} {getNeighbors(hoverNum, neighborN).join(" · ")}
        </div>
      )}

    </div>
  );
}
