import React, { useState, useMemo } from "react";
import { gt } from "./lib/gameLabels";

// ── Wheel / group constants ────────────────────────────────────────────────────
const WHEEL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RED_SET     = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

const JUEGO_0   = new Set([12,35,3,26,0,32,15]);
const VOISINS   = new Set([22,18,29,7,28,12,35,3,26,0,32,15,19,4,21,2,25]);
const TIERS     = new Set([27,13,36,11,30,8,23,10,5,24,16,33]);
const ORPHELINS = new Set([1,20,14,31,9,17,34,6]);

// ── Helpers ────────────────────────────────────────────────────────────────────
function getNeighbors(num: number, n: number): number[] {
  const idx = WHEEL_ORDER.indexOf(num);
  const len = WHEEL_ORDER.length;
  return Array.from({ length: n * 2 + 1 }, (_, i) =>
    WHEEL_ORDER[(idx + i - n + len) % len]
  );
}

function numBg(n: number) {
  if (n === 0) return "#16a34a";
  return RED_SET.has(n) ? "#991b1b" : "#111827";
}
function numHoverBg(n: number) {
  if (n === 0) return "#22c55e";
  return RED_SET.has(n) ? "#ef4444" : "#374151";
}

// ── Layout ────────────────────────────────────────────────────────────────────
const SZ      = 340;          // SVG viewBox size
const CX      = SZ / 2;      // center x
const CY      = SZ / 2;      // center y
const TRACK_R = 147;          // radius of number pill centers
const NUM_R   = 14.5;         // radius of each number pill

// ── Arc path between two wheel indices (clockwise) ────────────────────────────
function arcPath(firstIdx: number, lastIdx: number): string {
  const TAU = 2 * Math.PI;
  const θ1  = (firstIdx / 37) * TAU - Math.PI / 2;
  const θ2  = (lastIdx  / 37) * TAU - Math.PI / 2;
  const x1  = CX + TRACK_R * Math.cos(θ1);
  const y1  = CY + TRACK_R * Math.sin(θ1);
  const x2  = CX + TRACK_R * Math.cos(θ2);
  const y2  = CY + TRACK_R * Math.sin(θ2);
  // span is always ≤ 17/37 < 0.5 of the circle → largeArc = 0
  return `M ${x1} ${y1} A ${TRACK_R} ${TRACK_R} 0 0 1 ${x2} ${y2}`;
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

  // Set of numbers to highlight (preview before click)
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

  // Neighbor arc for hovered number
  const hoverArc = useMemo<string | null>(() => {
    if (hoverNum === null) return null;
    const neighbors = getNeighbors(hoverNum, neighborN);
    const firstIdx  = WHEEL_ORDER.indexOf(neighbors[0]);
    const lastIdx   = WHEEL_ORDER.indexOf(neighbors[neighbors.length - 1]);
    return arcPath(firstIdx, lastIdx);
  }, [hoverNum, neighborN]);

  // Group arc for hovered center button
  const groupArc = useMemo<string | null>(() => {
    let group: Set<number> | null = null;
    if (hoverGroup === "j0") group = JUEGO_0;
    else if (hoverGroup === "ve") group = VOISINS;
    else if (hoverGroup === "hu") group = ORPHELINS;
    else if (hoverGroup === "te") group = TIERS;
    if (!group) return null;
    const indices = [...group]
      .map(n => WHEEL_ORDER.indexOf(n))
      .sort((a, b) => a - b);
    return arcPath(indices[0], indices[indices.length - 1]);
  }, [hoverGroup]);

  const centerBtns = [
    { id: "j0", label: "Juego 0",   nums: JUEGO_0,   color: "#16a34a" },
    { id: "ve", label: "Vecinos",   nums: VOISINS,   color: "#1d4ed8" },
    { id: "hu", label: "Huérfanos", nums: ORPHELINS, color: "#b45309" },
    { id: "te", label: "Tercio",    nums: TIERS,     color: "#7c3aed" },
  ] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, userSelect: "none" }}>

      {/* ── Neighbor count control ─────────────────────────────────────── */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        background:   "#0d0f18",
        borderRadius: 8,
        border:       "1px solid rgba(255,255,255,0.12)",
        overflow:     "hidden",
      }}>
        <button
          onClick={() => setNeighborN(v => Math.max(1, v - 1))}
          disabled={isSpinning || neighborN <= 1}
          style={{
            padding:    "6px 16px",
            background: "transparent",
            border:     "none",
            color:      neighborN > 1 ? "#e2e8f0" : "#2a3850",
            cursor:     neighborN > 1 && !isSpinning ? "pointer" : "default",
            fontSize:   18,
            fontWeight: 700,
            fontFamily: "inherit",
            transition: "color .12s",
          }}
        >−</button>

        <div style={{
          padding:      "6px 14px",
          fontSize:     12,
          fontWeight:   700,
          color:        "#f59e0b",
          minWidth:     80,
          textAlign:    "center",
          borderLeft:   "1px solid rgba(255,255,255,0.08)",
          borderRight:  "1px solid rgba(255,255,255,0.08)",
          letterSpacing: "0.2px",
        }}>
          {neighborN} {neighborN === 1 ? "vecino" : "vecinos"}
        </div>

        <button
          onClick={() => setNeighborN(v => Math.min(8, v + 1))}
          disabled={isSpinning || neighborN >= 8}
          style={{
            padding:    "6px 16px",
            background: "transparent",
            border:     "none",
            color:      neighborN < 8 ? "#e2e8f0" : "#2a3850",
            cursor:     neighborN < 8 && !isSpinning ? "pointer" : "default",
            fontSize:   18,
            fontWeight: 700,
            fontFamily: "inherit",
            transition: "color .12s",
          }}
        >+</button>
      </div>

      {/* ── Circular SVG racetrack ─────────────────────────────────────── */}
      <div style={{ position: "relative", width: "100%", maxWidth: SZ }}>
        <svg
          viewBox={`0 0 ${SZ} ${SZ}`}
          width="100%"
          style={{ display: "block", overflow: "visible" }}
          aria-label="Racetrack de ruleta"
        >
          {/* ── Background disc ── */}
          <circle cx={CX} cy={CY} r={SZ / 2 - 1}
            fill="#0a0c14"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1.5}
          />

          {/* ── Track groove ── */}
          <circle cx={CX} cy={CY} r={TRACK_R}
            fill="none"
            stroke="#0f1117"
            strokeWidth={36}
          />
          {/* subtle inner edge */}
          <circle cx={CX} cy={CY} r={TRACK_R - 18}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={1}
          />
          {/* subtle outer edge */}
          <circle cx={CX} cy={CY} r={TRACK_R + 18}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={1}
          />

          {/* ── Center inner disc ── */}
          <circle cx={CX} cy={CY} r={TRACK_R - NUM_R - 14}
            fill="#0d0f1c"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={1}
          />

          {/* ── Neighbor arc highlight ── */}
          {hoverArc && (
            <path
              d={hoverArc}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={6}
              strokeLinecap="round"
              opacity={0.55}
            />
          )}
          {groupArc && !hoverArc && (
            <path
              d={groupArc}
              fill="none"
              stroke="#a78bfa"
              strokeWidth={6}
              strokeLinecap="round"
              opacity={0.4}
            />
          )}

          {/* ── Number pills ── */}
          {WHEEL_ORDER.map((num, i) => {
            const θ       = (i / 37) * 2 * Math.PI - Math.PI / 2;
            const x       = CX + TRACK_R * Math.cos(θ);
            const y       = CY + TRACK_R * Math.sin(θ);
            const isWin   = winNumber === num;
            const isPrev  = preview.has(num);
            const hasBet  = (tableBets[`n_${num}`] ?? 0) > 0;
            const bet     = tableBets[`n_${num}`] ?? 0;

            let fill      = numBg(num);
            let textFill  = "#fff";

            if (isWin) {
              fill     = "#22ee66";
              textFill = "#000";
            } else if (isPrev) {
              fill = numHoverBg(num);
            }

            return (
              <g
                key={num}
                onClick={() => { if (!isSpinning) betNums(getNeighbors(num, neighborN)); }}
                onMouseEnter={() => { if (!isSpinning) setHoverNum(num); }}
                onMouseLeave={() => setHoverNum(null)}
                style={{ cursor: isSpinning ? "default" : "pointer" }}
              >
                {/* Outer glow ring */}
                {(isWin || isPrev) && (
                  <circle
                    cx={x} cy={y}
                    r={NUM_R + 5}
                    fill={isWin ? "#22ee6618" : "#f59e0b14"}
                  />
                )}

                {/* Highlight ring */}
                {(isWin || isPrev || hasBet) && (
                  <circle
                    cx={x} cy={y}
                    r={NUM_R + 2.5}
                    fill="none"
                    stroke={isWin ? "#ffffff" : isPrev ? "#f59e0b" : "#f59e0b55"}
                    strokeWidth={isWin || isPrev ? 2 : 1.5}
                  />
                )}

                {/* Number circle */}
                <circle cx={x} cy={y} r={NUM_R} fill={fill} />

                {/* Bet indicator dot */}
                {hasBet && !isWin && (
                  <circle
                    cx={x + NUM_R * 0.62}
                    cy={y - NUM_R * 0.62}
                    r={4.5}
                    fill="#f59e0b"
                    stroke="#000"
                    strokeWidth={0.8}
                  />
                )}

                {/* Number text */}
                <text
                  x={x} y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={textFill}
                  fontSize={num >= 10 ? 8.5 : 10}
                  fontWeight="800"
                  fontFamily="Arial, sans-serif"
                  style={{ pointerEvents: "none" }}
                >
                  {num}
                </text>
              </g>
            );
          })}
        </svg>

        {/* ── Center buttons overlay ─────────────────────────────────── */}
        <div style={{
          position:            "absolute",
          top:                 "50%",
          left:                "50%",
          transform:           "translate(-50%, -50%)",
          display:             "grid",
          gridTemplateColumns: "1fr 1fr",
          gap:                 6,
          width:               "min(190px, 54%)",
        }}>
          {centerBtns.map(({ id, label, nums, color }) => (
            <button
              key={id}
              disabled={isSpinning}
              onClick={() => betNums(nums)}
              onMouseEnter={() => { if (!isSpinning) setHoverGroup(id); }}
              onMouseLeave={() => setHoverGroup(null)}
              style={{
                padding:       "8px 4px",
                borderRadius:  7,
                border:        `1.5px solid ${hoverGroup === id ? color : color + "55"}`,
                background:    hoverGroup === id ? color : color + "1a",
                color:         hoverGroup === id ? "#fff" : "#bbc",
                fontSize:      10,
                fontWeight:    700,
                cursor:        isSpinning ? "default" : "pointer",
                transition:    "all .15s",
                whiteSpace:    "nowrap",
                fontFamily:    "inherit",
                lineHeight:    1.2,
                textAlign:     "center",
                boxShadow:     hoverGroup === id ? `0 0 10px ${color}66` : "none",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Hover hint ─────────────────────────────────────────────────── */}
      {hoverNum !== null && (
        <div style={{
          fontSize:      10,
          color:         "rgba(255,255,255,0.35)",
          letterSpacing: "0.3px",
          textAlign:     "center",
        }}>
          {gt(lang, "rtNeighborHint")} {getNeighbors(hoverNum, neighborN).join(" · ")}
        </div>
      )}

    </div>
  );
}
