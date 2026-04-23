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

// ── Stadium (racetrack) geometry ──────────────────────────────────────────────
//
//  Shape: two straight horizontal segments connected by two semicircles.
//
//    top-left (cx1, cy−R) ────── top-right (cx2, cy−R)
//           ╮                                   ╭
//  leftmost (cx1−R, cy)                rightmost (cx2+R, cy)
//           ╯                                   ╰
//    btm-left (cx1, cy+R) ────── btm-right (cx2, cy+R)
//
//  0 is at the leftmost point. Numbers go counterclockwise (upward first):
//  leftmost → up through left-upper quarter → top-straight (L→R) →
//  right semicircle (T→B) → bottom-straight (R→L) → left-lower quarter → back.
//
const SVG_W  = 560;
const SVG_H  = 170;
const CX     = SVG_W / 2;
const CY     = SVG_H / 2;
const R      = 52;          // semicircle radius
const HALF_L = 196;         // half-length of each straight segment

// Derived
const CX1 = CX - HALF_L;   // left semicircle center x
const CX2 = CX + HALF_L;   // right semicircle center x

// Section arc lengths
const ARC_QUARTER  = (Math.PI / 2) * R;         // quarter-circle
const ARC_STRAIGHT = 2 * HALF_L;                // one straight
const ARC_HALF     = Math.PI * R;               // half-circle (right/left full)
const PERIMETER    = 4 * HALF_L + 2 * Math.PI * R;

// Section cumulative endpoints (0 = leftmost, counterclockwise)
const S1 = ARC_QUARTER;                         // end of left-upper quarter
const S2 = S1 + ARC_STRAIGHT;                   // end of top straight
const S3 = S2 + ARC_HALF;                       // end of right semicircle
const S4 = S3 + ARC_STRAIGHT;                   // end of bottom straight
// S5 = PERIMETER (end of left-lower quarter → back to leftmost)

/** Map arc-length position s → {x, y, rot} on the stadium perimeter. */
function stadiumPoint(s: number): { x: number; y: number; rot: number } {
  let x: number, y: number, θ: number;

  if (s <= S1) {
    // Left-upper quarter: leftmost (θ=π) → top-left (θ=3π/2)
    θ = Math.PI + (s / S1) * (Math.PI / 2);
    x = CX1 + R * Math.cos(θ);
    y = CY  + R * Math.sin(θ);
  } else if (s <= S2) {
    // Top straight: left→right (y = CY−R)
    x = CX1 + (s - S1);
    y = CY - R;
    return { x, y, rot: 0 };
  } else if (s <= S3) {
    // Right semicircle: top (θ=−π/2) → bottom (θ=+π/2)
    θ = -Math.PI / 2 + (s - S2) / R;
    x = CX2 + R * Math.cos(θ);
    y = CY  + R * Math.sin(θ);
  } else if (s <= S4) {
    // Bottom straight: right→left (y = CY+R)
    x = CX2 - (s - S3);
    y = CY + R;
    return { x, y, rot: 0 };   // pills flat; text counter-rotates as usual
  } else {
    // Left-lower quarter: bottom-left (θ=π/2) → leftmost (θ=π)
    const t = (s - S4) / ARC_QUARTER;           // 0→1
    θ = Math.PI / 2 + t * (Math.PI / 2);
    x = CX1 + R * Math.cos(θ);
    y = CY  + R * Math.sin(θ);
  }

  // Tangent for circular sections: direction of travel = (−sinθ, cosθ)
  const rot = Math.atan2(Math.cos(θ!), -Math.sin(θ!)) * (180 / Math.PI);
  return { x, y, rot };
}

/** Positions for all 37 wheel numbers with equal arc-length spacing. */
const POSITIONS: { x: number; y: number; rot: number }[] = WHEEL_ORDER.map((_, i) =>
  stadiumPoint((i / 37) * PERIMETER)
);

// Pill dimensions
const PW = 23;   // pill width
const PH = 16;   // pill height
const PR = 4;    // pill corner radius

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
            padding:    "5px 15px",
            background: "none", border: "none",
            color:      neighborN > 1 ? "#e2e8f0" : "#2a3040",
            fontSize: 17, fontWeight: 700,
            cursor:     neighborN > 1 && !isSpinning ? "pointer" : "default",
            fontFamily: "inherit", lineHeight: 1,
          }}
        >−</button>

        <span style={{
          padding:     "5px 14px",
          fontSize:    13, fontWeight: 700, color: "#f59e0b",
          borderLeft:  "1px solid rgba(255,255,255,0.08)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
          minWidth: 24, textAlign: "center",
        }}>
          {neighborN}
        </span>

        <button
          onClick={() => setNeighborN(v => Math.min(8, v + 1))}
          disabled={isSpinning || neighborN >= 8}
          style={{
            padding:    "5px 15px",
            background: "none", border: "none",
            color:      neighborN < 8 ? "#e2e8f0" : "#2a3040",
            fontSize: 17, fontWeight: 700,
            cursor:     neighborN < 8 && !isSpinning ? "pointer" : "default",
            fontFamily: "inherit", lineHeight: 1,
          }}
        >+</button>
      </div>

      {/* ── Stadium racetrack ──────────────────────────────────────────── */}
      <div style={{ position: "relative", width: "100%", maxWidth: SVG_W }}>

        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          width="100%"
          style={{ display: "block", overflow: "visible" }}
        >
          {/* ── Track outline (background of the ring) ── */}
          {/* Outer stadium path */}
          <path
            d={`
              M ${CX1} ${CY - R - PH / 2 - 5}
              L ${CX2} ${CY - R - PH / 2 - 5}
              A ${R + PH / 2 + 5} ${R + PH / 2 + 5} 0 0 1 ${CX2} ${CY + R + PH / 2 + 5}
              L ${CX1} ${CY + R + PH / 2 + 5}
              A ${R + PH / 2 + 5} ${R + PH / 2 + 5} 0 0 1 ${CX1} ${CY - R - PH / 2 - 5}
              Z
            `}
            fill="#0e0c10"
            stroke="#25203a"
            strokeWidth={1.5}
          />

          {/* Inner cutout (creates ring effect) */}
          <path
            d={`
              M ${CX1} ${CY - R + PH / 2 + 5}
              L ${CX2} ${CY - R + PH / 2 + 5}
              A ${R - PH / 2 - 5} ${R - PH / 2 - 5} 0 0 1 ${CX2} ${CY + R - PH / 2 - 5}
              L ${CX1} ${CY + R - PH / 2 - 5}
              A ${R - PH / 2 - 5} ${R - PH / 2 - 5} 0 0 1 ${CX1} ${CY - R + PH / 2 + 5}
              Z
            `}
            fill="#0a0810"
            stroke="#1a1528"
            strokeWidth={1}
          />

          {/* ── Number pills ── */}
          {WHEEL_ORDER.map((num, i) => {
            const { x, y, rot } = POSITIONS[i];
            const isWin   = winNumber === num;
            const isPrev  = preview.has(num);
            const hasBet  = (tableBets[`n_${num}`] ?? 0) > 0;

            let bg        = numBg(num);
            let textColor = "#fff";
            if      (isWin)  { bg = "#22ee66"; textColor = "#000"; }
            else if (isPrev) { bg = numActiveBg(num); }

            const showRing  = isWin || isPrev;
            const ringColor = isWin ? "#fff" : "#f59e0b";

            return (
              <g
                key={num}
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
                    width={PW + 6} height={PH + 6} rx={PR + 2}
                    fill={isWin ? "#22ee6628" : "#f59e0b20"}
                  />
                )}

                {/* Pill fill */}
                <rect
                  x={x - PW / 2} y={y - PH / 2}
                  width={PW} height={PH} rx={PR}
                  fill={bg}
                />

                {/* Pill ring */}
                {showRing && (
                  <rect
                    x={x - PW / 2} y={y - PH / 2}
                    width={PW} height={PH} rx={PR}
                    fill="none" stroke={ringColor} strokeWidth={1.5}
                  />
                )}

                {/* Bet dot */}
                {hasBet && !isWin && (
                  <circle
                    cx={x + PW / 2 - 3.5} cy={y - PH / 2 + 3.5} r={3}
                    fill="#f59e0b" stroke="#000" strokeWidth={0.5}
                    transform={`rotate(${-rot},${x + PW / 2 - 3.5},${y - PH / 2 + 3.5})`}
                  />
                )}

                {/* Number text — always horizontal */}
                <text
                  x={x} y={y}
                  textAnchor="middle" dominantBaseline="central"
                  fill={textColor}
                  fontSize={num >= 10 ? 7.5 : 9}
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
          position:  "absolute",
          top:       "50%",
          left:      "50%",
          transform: "translate(-50%, -50%)",
          display:   "flex",
          gap:       5,
          width:     "56%",
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
          fontSize:  10,
          color:     "rgba(255,255,255,0.32)",
          textAlign: "center",
        }}>
          {gt(lang, "rtNeighborHint")} {getNeighbors(hoverNum, neighborN).join(" · ")}
        </div>
      )}

    </div>
  );
}
