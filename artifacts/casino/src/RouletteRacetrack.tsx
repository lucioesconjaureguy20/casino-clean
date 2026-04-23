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

function numBg(n: number, active: boolean, win: boolean): string {
  if (win)    return "#22ee66";
  if (n === 0) return active ? "#22c55e" : "#16a34a";
  if (RED_SET.has(n)) return active ? "#ef4444" : "#c41c1c";
  return active ? "#4b5563" : "#141420";
}

// ── Stadium geometry ──────────────────────────────────────────────────────────
const SVG_W  = 628;           // +15% wider container
const SVG_H  = 138;
const CX     = SVG_W / 2;    // 314
const CY     = SVG_H / 2;    // 69
const R      = 50;            // semicircle radius
const HALF_L = 226;           // +15% longer straights

const CX1 = CX - HALF_L;     // left semicircle centre x  (84)
const CX2 = CX + HALF_L;     // right semicircle centre x (476)

const PERIMETER = 4 * HALF_L + 2 * Math.PI * R;

// Section cumulative arc lengths (origin = leftmost of left curve)
const S1 = (Math.PI / 2) * R;           // end of left-upper quarter
const S2 = S1 + 2 * HALF_L;             // end of top straight
const S3 = S2 + Math.PI * R;            // end of right semicircle
const S4 = S3 + 2 * HALF_L;             // end of bottom straight

function stadiumPoint(s: number): { x: number; y: number; rot: number } {
  let x: number, y: number, θ: number;
  if (s <= S1) {
    θ = Math.PI + (s / S1) * (Math.PI / 2);
    x = CX1 + R * Math.cos(θ);
    y = CY  + R * Math.sin(θ);
  } else if (s <= S2) {
    return { x: CX1 + (s - S1), y: CY - R, rot: 0 };
  } else if (s <= S3) {
    θ = -Math.PI / 2 + (s - S2) / R;
    x = CX2 + R * Math.cos(θ);
    y = CY  + R * Math.sin(θ);
  } else if (s <= S4) {
    return { x: CX2 - (s - S3), y: CY + R, rot: 0 };
  } else {
    θ = Math.PI / 2 + ((s - S4) / ((Math.PI / 2) * R)) * (Math.PI / 2);
    x = CX1 + R * Math.cos(θ);
    y = CY  + R * Math.sin(θ);
  }
  return { x, y, rot: Math.atan2(Math.cos(θ!), -Math.sin(θ!)) * (180 / Math.PI) };
}

// Pill dimensions
const PH = 13;                           // thin ring (12-14px as requested)
const PW = PERIMETER / 37;              // width = arc-step → pills touch, no gaps

// Clip-path ring radii (slightly beyond pill edges for clean containment)
const ORO = R + PH / 2 + 1.5;          // outer ring radius
const IRI  = R - PH / 2 - 1.5;         // inner ring radius

// Precomputed number positions
const POSITIONS = WHEEL_ORDER.map((_, i) => stadiumPoint((i / 37) * PERIMETER));

// ForeignObject button area
const BTN_X = CX1 + 1;
const BTN_Y = CY - IRI + 1;
const BTN_W = 2 * HALF_L - 2;
const BTN_H = 2 * IRI - 2;

// ── Clip-path path strings ────────────────────────────────────────────────────
// Outer boundary (clockwise, sweep=1) + Inner boundary (counter-clockwise, sweep=0)
// Together with fill-rule="evenodd" this creates the ring clip region.
const OUTER_PATH = `
  M ${CX1} ${CY - ORO}
  L ${CX2} ${CY - ORO}
  A ${ORO} ${ORO} 0 0 1 ${CX2} ${CY + ORO}
  L ${CX1} ${CY + ORO}
  A ${ORO} ${ORO} 0 0 1 ${CX1} ${CY - ORO}
  Z
`.trim();

const INNER_PATH = `
  M ${CX2} ${CY - IRI}
  L ${CX1} ${CY - IRI}
  A ${IRI} ${IRI} 0 0 0 ${CX1} ${CY + IRI}
  L ${CX2} ${CY + IRI}
  A ${IRI} ${IRI} 0 0 0 ${CX2} ${CY - IRI}
  Z
`.trim();

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
            padding: "5px 15px", background: "none", border: "none",
            color:   neighborN > 1 ? "#e2e8f0" : "#2a3040",
            fontSize: 17, fontWeight: 700, lineHeight: 1,
            cursor:  neighborN > 1 && !isSpinning ? "pointer" : "default",
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
            padding: "5px 15px", background: "none", border: "none",
            color:   neighborN < 8 ? "#e2e8f0" : "#2a3040",
            fontSize: 17, fontWeight: 700, lineHeight: 1,
            cursor:  neighborN < 8 && !isSpinning ? "pointer" : "default",
            fontFamily: "'Inter', Arial, sans-serif",
          }}
        >+</button>
      </div>

      {/* ── SVG racetrack ─────────────────────────────────────────────── */}
      <div style={{ width: "100%", maxWidth: SVG_W }}>
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          width="100%"
          style={{ display: "block" }}
        >
          <defs>
            {/*
              Ring clipPath: outer stadium CW + inner stadium CCW.
              evenodd fill rule ⟹ region between the two paths is clipped TO.
              Pills protruding beyond the ring are cut cleanly.
            */}
            <clipPath id="rt-ring-clip">
              <path
                fillRule="evenodd"
                shapeRendering="geometricPrecision"
                d={`${OUTER_PATH} ${INNER_PATH}`}
              />
            </clipPath>
          </defs>

          {/* ── Track visual background (ring) ── */}
          <path
            d={`${OUTER_PATH} ${INNER_PATH}`}
            fillRule="evenodd"
            fill="#111"
            stroke="#222"
            strokeWidth={1}
          />

          {/* ── Number cells — all clipped cleanly to ring ── */}
          <g clipPath="url(#rt-ring-clip)">
            {WHEEL_ORDER.map((num, i) => {
              const { x, y, rot } = POSITIONS[i];
              const isWin  = winNumber === num;
              const isPrev = preview.has(num);
              const hasBet = (tableBets[`n_${num}`] ?? 0) > 0;
              const bg     = numBg(num, isPrev, isWin);
              const textColor = (isWin || (!isPrev && num === 0) || isPrev) && isWin ? "#000" : "#fff";

              return (
                <g
                  key={num}
                  transform={`rotate(${rot},${x},${y})`}
                  onClick={() => { if (!isSpinning) betNums(getNeighbors(num, neighborN)); }}
                  onMouseEnter={() => { if (!isSpinning) setHoverNum(num); }}
                  onMouseLeave={() => setHoverNum(null)}
                  style={{ cursor: isSpinning ? "default" : "pointer" }}
                >
                  {/* Solid color block — no individual border */}
                  <rect
                    x={x - PW / 2} y={y - PH / 2}
                    width={PW} height={PH}
                    fill={bg}
                  />

                  {/* Thin divider line between cells (1px on the right edge) */}
                  <line
                    x1={x + PW / 2} y1={y - PH / 2}
                    x2={x + PW / 2} y2={y + PH / 2}
                    stroke="rgba(0,0,0,0.35)"
                    strokeWidth={0.6}
                  />

                  {/* Win / preview highlight overlay */}
                  {(isWin || isPrev) && (
                    <rect
                      x={x - PW / 2} y={y - PH / 2}
                      width={PW} height={PH}
                      fill="none"
                      stroke={isWin ? "#fff" : "#f59e0b"}
                      strokeWidth={2}
                    />
                  )}

                  {/* Bet indicator dot */}
                  {hasBet && !isWin && (
                    <circle
                      cx={x + PW / 2 - 4} cy={y - PH / 2 + 4} r={2.8}
                      fill="#f59e0b" stroke="#000" strokeWidth={0.4}
                      transform={`rotate(${-rot},${x + PW / 2 - 4},${y - PH / 2 + 4})`}
                    />
                  )}

                  {/* Number text — always horizontal */}
                  <text
                    x={x} y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={isWin ? "#000" : "#fff"}
                    fontSize={8.5}
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
          </g>

          {/* ── Ring border lines (on top of cells) ── */}
          <path
            d={OUTER_PATH}
            fill="none"
            stroke="#2a2535"
            strokeWidth={1}
          />
          <path
            d={INNER_PATH}
            fill="none"
            stroke="#2a2535"
            strokeWidth={1}
          />

          {/* ── Center section — fills entire interior ── */}
          <foreignObject
            x={BTN_X} y={BTN_Y}
            width={BTN_W} height={BTN_H}
          >
            <div
              // @ts-ignore
              xmlns="http://www.w3.org/1999/xhtml"
              style={{
                display:      "flex",
                width:        "100%",
                height:       "100%",
                background:   "#050505",
                borderRadius: 0,
                overflow:     "hidden",
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
                      flex:        1,
                      padding:     0,
                      background:  active ? "rgba(255,255,255,0.14)" : "transparent",
                      border:      "none",
                      borderRight: idx < 3 ? "1px solid #222" : "none",
                      color:       active ? "#fff" : "rgba(255,255,255,0.6)",
                      fontSize:    10,
                      fontWeight:  700,
                      fontFamily:  "'Inter', Arial, sans-serif",
                      cursor:      isSpinning ? "default" : "pointer",
                      transition:  "background .12s, color .12s",
                      whiteSpace:  "nowrap",
                      textAlign:   "center",
                      letterSpacing: "0.1px",
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
          fontSize:   10,
          color:      "rgba(255,255,255,0.32)",
          textAlign:  "center",
          fontFamily: "'Inter', Arial, sans-serif",
        }}>
          {gt(lang, "rtNeighborHint")} {getNeighbors(hoverNum, neighborN).join(" · ")}
        </div>
      )}

    </div>
  );
}
