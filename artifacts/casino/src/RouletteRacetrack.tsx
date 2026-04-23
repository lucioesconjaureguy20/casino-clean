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
  if (win)     return "#22ee66";
  if (n === 0) return active ? "#22c55e" : "#16a34a";
  if (RED_SET.has(n)) return active ? "#ef4444" : "#c41c1c";
  return active ? "#4b5563" : "#141420";
}

// ── Stadium geometry ──────────────────────────────────────────────────────────
const SVG_W  = 628;
const SVG_H  = 138;
const CX     = SVG_W / 2;   // 314
const CY     = SVG_H / 2;   // 69
const R      = 50;           // semicircle radius
const HALF_L = 226;          // half-length of straight segments

const CX1 = CX - HALF_L;    // left  semicircle centre x
const CX2 = CX + HALF_L;    // right semicircle centre x

const PERIMETER = 4 * HALF_L + 2 * Math.PI * R;

// Section arc-length boundaries (origin = leftmost of left curve)
const S1 = (Math.PI / 2) * R;           // end of left-upper quarter arc
const S2 = S1 + 2 * HALF_L;             // end of top straight
const S3 = S2 + Math.PI * R;            // end of right semicircle
const S4 = S3 + 2 * HALF_L;             // end of bottom straight

// Pill / ring dimensions
const PH  = 18;                          // ring thickness
const PW  = PERIMETER / 37;             // arc-step per number (no gaps)
const ORO = R + PH / 2 + 1.5;          // outer ring radius
const IRI = R - PH / 2 - 1.5;          // inner ring radius

// ── Boundary-point function ────────────────────────────────────────────────────
// Given arc-length s, returns the outer and inner boundary points on the ring.
// Handles wrapping so s can be slightly negative or > PERIMETER.
type BPt = { ox: number; oy: number; ix: number; iy: number };

function boundaryPt(s: number): BPt {
  const sm = ((s % PERIMETER) + PERIMETER) % PERIMETER;

  if (sm <= S1) {
    const θ = Math.PI + (sm / S1) * (Math.PI / 2);
    return {
      ox: CX1 + ORO * Math.cos(θ), oy: CY + ORO * Math.sin(θ),
      ix: CX1 + IRI * Math.cos(θ), iy: CY + IRI * Math.sin(θ),
    };
  }
  if (sm <= S2) {
    const x = CX1 + (sm - S1);
    return { ox: x, oy: CY - ORO, ix: x, iy: CY - IRI };
  }
  if (sm <= S3) {
    const θ = -Math.PI / 2 + (sm - S2) / R;
    return {
      ox: CX2 + ORO * Math.cos(θ), oy: CY + ORO * Math.sin(θ),
      ix: CX2 + IRI * Math.cos(θ), iy: CY + IRI * Math.sin(θ),
    };
  }
  if (sm <= S4) {
    const x = CX2 - (sm - S3);
    return { ox: x, oy: CY + ORO, ix: x, iy: CY + IRI };
  }
  // left-lower arc (back to start)
  const θ = Math.PI / 2 + ((sm - S4) / ((Math.PI / 2) * R)) * (Math.PI / 2);
  return {
    ox: CX1 + ORO * Math.cos(θ), oy: CY + ORO * Math.sin(θ),
    ix: CX1 + IRI * Math.cos(θ), iy: CY + IRI * Math.sin(θ),
  };
}

// ── Arc-segment path for one cell ─────────────────────────────────────────────
// Polygon approximation: N+1 points along outer edge (L→R) + N+1 points
// along inner edge (R→L).  For straight sections the samples are collinear
// (exact rectangle).  For curved sections the path follows the ring arc.
const SAMPLES = 6;
const F = (n: number) => n.toFixed(2);

function cellPath(cellIdx: number): string {
  const sC = (cellIdx / 37) * PERIMETER;
  const sL = sC - PW / 2;
  const sR = sC + PW / 2;

  const outerPts: BPt[] = [];
  const innerPts: BPt[] = [];
  for (let k = 0; k <= SAMPLES; k++) {
    const bp = boundaryPt(sL + (k / SAMPLES) * PW);
    outerPts.push(bp);
    innerPts.push(bp);
  }

  // outer L→R then inner R→L, close
  const pts: [number, number][] = [
    ...outerPts.map(p => [p.ox, p.oy] as [number, number]),
    ...[...innerPts].reverse().map(p => [p.ix, p.iy] as [number, number]),
  ];
  return pts.map(([x, y], j) => `${j === 0 ? "M" : "L"} ${F(x)} ${F(y)}`).join(" ") + " Z";
}

// ── Divider line at left boundary of each cell ────────────────────────────────
function dividerLine(cellIdx: number): string {
  const sL = (cellIdx / 37) * PERIMETER - PW / 2;
  const { ox, oy, ix, iy } = boundaryPt(sL);
  return `M ${F(ox)} ${F(oy)} L ${F(ix)} ${F(iy)}`;
}

// ── Centre-of-cell for text placement ────────────────────────────────────────
function cellCenter(cellIdx: number): { x: number; y: number } {
  const sC = (cellIdx / 37) * PERIMETER;
  const sm = ((sC % PERIMETER) + PERIMETER) % PERIMETER;
  if (sm <= S1) {
    const θ = Math.PI + (sm / S1) * (Math.PI / 2);
    const rm = (ORO + IRI) / 2;
    return { x: CX1 + rm * Math.cos(θ), y: CY + rm * Math.sin(θ) };
  }
  if (sm <= S2) return { x: CX1 + (sm - S1), y: CY - R };
  if (sm <= S3) {
    const θ = -Math.PI / 2 + (sm - S2) / R;
    const rm = (ORO + IRI) / 2;
    return { x: CX2 + rm * Math.cos(θ), y: CY + rm * Math.sin(θ) };
  }
  if (sm <= S4) return { x: CX2 - (sm - S3), y: CY + R };
  const θ = Math.PI / 2 + ((sm - S4) / ((Math.PI / 2) * R)) * (Math.PI / 2);
  const rm = (ORO + IRI) / 2;
  return { x: CX1 + rm * Math.cos(θ), y: CY + rm * Math.sin(θ) };
}

// All numbers always upright (horizontal)
function textRot(_cellIdx: number): number { return 0; }

// ── Precomputed geometry ──────────────────────────────────────────────────────
const CELL_PATHS   = WHEEL_ORDER.map((_, i) => cellPath(i));
const CELL_CENTERS = WHEEL_ORDER.map((_, i) => cellCenter(i));
const TEXT_ROTS    = WHEEL_ORDER.map((_, i) => textRot(i));
const DIV_LINES    = WHEEL_ORDER.map((_, i) => dividerLine(i));

// Outer / inner ring border paths (for the visible outline on top)
const OUTER_PATH = `M ${CX1} ${CY - ORO} L ${CX2} ${CY - ORO} A ${ORO} ${ORO} 0 0 1 ${CX2} ${CY + ORO} L ${CX1} ${CY + ORO} A ${ORO} ${ORO} 0 0 1 ${CX1} ${CY - ORO} Z`;
const INNER_PATH = `M ${CX2} ${CY - IRI} L ${CX1} ${CY - IRI} A ${IRI} ${IRI} 0 0 0 ${CX1} ${CY + IRI} L ${CX2} ${CY + IRI} A ${IRI} ${IRI} 0 0 0 ${CX2} ${CY - IRI} Z`;

// ── Interior section dividers (x positions along the straight interior) ────────
// X1: J0 | Vecinos (vertical),  X2: Vecinos | Huérfanos (vertical)
// X3T/X3B: Huérfanos | Tercio (diagonal — top is leftmost, bottom is rightmost)
const X1  = CX1 + 42;
const X2  = CX1 + 190;
const X3T = CX1 + 295;   // diagonal top-left
const X3B = CX1 + 345;   // diagonal bottom-right

// Smaller radius for J0's right arc (less bulge than the left inner-ring arc)
const J0_R = 16;

// Section path strings (each fills its slice of the inner ring perfectly)
// J0: left arc bulges LEFT (inner ring), right arc bulges RIGHT with smaller radius
const J0_PATH = `M ${F(X1)} ${F(CY-IRI)} L ${F(CX1)} ${F(CY-IRI)} A ${F(IRI)} ${F(IRI)} 0 0 0 ${F(CX1)} ${F(CY+IRI)} L ${F(X1)} ${F(CY+IRI)} A ${F(J0_R)} ${F(J0_R)} 0 0 0 ${F(X1)} ${F(CY-IRI)} Z`;
// VECINOS: left edge matches J0's right arc (same J0_R, sweep=1 = concave from VECINOS side)
const VE_PATH = `M ${F(X2)} ${F(CY-IRI)} L ${F(X1)} ${F(CY-IRI)} A ${F(J0_R)} ${F(J0_R)} 0 0 1 ${F(X1)} ${F(CY+IRI)} L ${F(X2)} ${F(CY+IRI)} Z`;
const HU_PATH = `M ${F(X3T)} ${F(CY-IRI)} L ${F(X2)} ${F(CY-IRI)} L ${F(X2)} ${F(CY+IRI)} L ${F(X3B)} ${F(CY+IRI)} Z`;
const TE_PATH = `M ${F(X3T)} ${F(CY-IRI)} L ${F(CX2)} ${F(CY-IRI)} A ${F(IRI)} ${F(IRI)} 0 0 1 ${F(CX2)} ${F(CY+IRI)} L ${F(X3B)} ${F(CY+IRI)} Z`;

// Label x-positions — centered in each section's visible interior
const J0_LX  = (CX1 + X1) / 2;                          // center of J0's straight body
const VE_LX  = (X1 + J0_R + X2) / 2;                    // account for J0 arc biting left
const HU_LX  = (X2 + (X3T + X3B) / 2) / 2;
const TE_LX  = ((X3T + X3B) / 2 + CX2 + IRI) / 2;

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

  const sections = [
    { id: "j0", label: "JUEGO 0",    path: J0_PATH, lx: J0_LX, nums: JUEGO_0   },
    { id: "ve", label: "VECINOS",    path: VE_PATH, lx: VE_LX, nums: VOISINS   },
    { id: "hu", label: "HUÉRFANOS", path: HU_PATH, lx: HU_LX, nums: ORPHELINS },
    { id: "te", label: "TERCIO",     path: TE_PATH, lx: TE_LX, nums: TIERS     },
  ] as const;

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      gap: 8, userSelect: "none", width: "100%",
    }}>

      {/* ── Neighbor count control ─────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center",
        background: "#0d0d14",
        border: "1px solid rgba(255,255,255,0.13)",
        borderRadius: 6, overflow: "hidden",
      }}>
        <button
          onClick={() => setNeighborN(v => Math.max(1, v - 1))}
          disabled={isSpinning || neighborN <= 1}
          style={{
            padding: "5px 15px", background: "none", border: "none",
            color: neighborN > 1 ? "#e2e8f0" : "#2a3040",
            fontSize: 17, fontWeight: 700, lineHeight: 1,
            cursor: neighborN > 1 && !isSpinning ? "pointer" : "default",
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
            color: neighborN < 8 ? "#e2e8f0" : "#2a3040",
            fontSize: 17, fontWeight: 700, lineHeight: 1,
            cursor: neighborN < 8 && !isSpinning ? "pointer" : "default",
            fontFamily: "'Inter', Arial, sans-serif",
          }}
        >+</button>
      </div>

      {/* ── SVG racetrack ─────────────────────────────────────────────── */}
      <div style={{ width: "100%", maxWidth: SVG_W }}>
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          width="100%"
          shapeRendering="geometricPrecision"
          style={{ display: "block" }}
        >
          {/* ── Track background ring ── */}
          <path
            d={`${OUTER_PATH} ${INNER_PATH}`}
            fillRule="evenodd"
            fill="#111"
          />

          {/* ── Arc-segment cells ── */}
          {WHEEL_ORDER.map((num, i) => {
            const isWin  = winNumber === num;
            const isPrev = preview.has(num);
            const hasBet = (tableBets[`n_${num}`] ?? 0) > 0;
            const { x, y } = CELL_CENTERS[i];
            const rot      = TEXT_ROTS[i];

            return (
              <g
                key={num}
                onClick={() => { if (!isSpinning) betNums(getNeighbors(num, neighborN)); }}
                onMouseEnter={() => { if (!isSpinning) setHoverNum(num); }}
                onMouseLeave={() => setHoverNum(null)}
                style={{ cursor: isSpinning ? "default" : "pointer" }}
              >
                {/* Arc-shaped fill — perfectly follows ring curvature */}
                <path
                  d={CELL_PATHS[i]}
                  fill={numBg(num, isPrev, isWin)}
                  shapeRendering="geometricPrecision"
                />

                {/* Win / preview highlight as arc path */}
                {(isWin || isPrev) && (
                  <path
                    d={CELL_PATHS[i]}
                    fill="none"
                    stroke={isWin ? "#fff" : "#f59e0b"}
                    strokeWidth={1.5}
                    shapeRendering="geometricPrecision"
                  />
                )}

                {/* Bet indicator dot */}
                {hasBet && !isWin && (
                  <circle cx={x} cy={y} r={2.5} fill="#f59e0b" stroke="#000" strokeWidth={0.5} />
                )}

                {/* Number — always horizontal (rot=0) on straights, radial on curves */}
                <text
                  x={x} y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={isWin ? "#000" : "#fff"}
                  fontSize={10}
                  fontWeight="700"
                  fontFamily="'Inter', Arial, sans-serif"
                  transform={rot !== 0 ? `rotate(${rot},${x},${y})` : undefined}
                  style={{ pointerEvents: "none" }}
                >
                  {num}
                </text>
              </g>
            );
          })}

          {/* ── Divider lines between cells (thin dark radial lines) ── */}
          <path
            d={DIV_LINES.join(" ")}
            fill="none"
            stroke="rgba(0,0,0,0.5)"
            strokeWidth={0.7}
            shapeRendering="geometricPrecision"
          />

          {/* ── Ring border on top of cells ── */}
          <path d={OUTER_PATH} fill="none" stroke="#1e1e28" strokeWidth={1} />
          <path d={INNER_PATH} fill="none" stroke="#1e1e28" strokeWidth={1} />

          {/* ── Interior sections — SVG-native shapes with exact ring geometry ── */}
          {sections.map(({ id, label, path, lx, nums }) => {
            const active = hoverGroup === id;
            return (
              <g
                key={id}
                onClick={() => betNums(nums)}
                onMouseEnter={() => { if (!isSpinning) setHoverGroup(id); }}
                onMouseLeave={() => setHoverGroup(null)}
                style={{ cursor: isSpinning ? "default" : "pointer" }}
              >
                {/* Section fill */}
                <path
                  d={path}
                  fill={active ? "rgba(255,255,255,0.10)" : "#050505"}
                  shapeRendering="geometricPrecision"
                />
                {/* Label */}
                <text
                  x={lx} y={CY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={active ? "#fff" : "rgba(255,255,255,0.55)"}
                  fontSize={8}
                  fontWeight="600"
                  fontFamily="'Inter', Arial, sans-serif"
                  letterSpacing="0.6"
                  style={{ pointerEvents: "none", transition: "fill .12s" }}
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Divider lines between sections (thin, dark) */}
          {/* J0 | VECINOS: small arc (same J0_R) */}
          <path
            d={`M ${F(X1)} ${F(CY-IRI)} A ${F(J0_R)} ${F(J0_R)} 0 0 1 ${F(X1)} ${F(CY+IRI)}`}
            fill="none" stroke="#2a2a2a" strokeWidth={0.5}
            shapeRendering="geometricPrecision"
          />
          <line x1={X2} y1={CY-IRI} x2={X2} y2={CY+IRI} stroke="#2a2a2a" strokeWidth={0.5} />
          <line x1={X3T} y1={CY-IRI} x2={X3B} y2={CY+IRI} stroke="#2a2a2a" strokeWidth={0.5} />
        </svg>
      </div>

      {/* ── Hover hint ─────────────────────────────────────────────────── */}
      {hoverNum !== null && (
        <div style={{
          fontSize: 10, color: "rgba(255,255,255,0.32)",
          textAlign: "center", fontFamily: "'Inter', Arial, sans-serif",
        }}>
          {gt(lang, "rtNeighborHint")} {getNeighbors(hoverNum, neighborN).join(" · ")}
        </div>
      )}
    </div>
  );
}
