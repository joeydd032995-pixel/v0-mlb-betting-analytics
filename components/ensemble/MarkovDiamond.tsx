"use client"

import { useState } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import { Panel } from "@/components/diamond/Panel"
import type { MarkovStateSnapshot } from "@/lib/nrfi-models"

interface Props {
  snapshot: MarkovStateSnapshot
}

// Diamond coordinates for the 4 bases (SVG viewBox 0 0 200 200)
// Home plate = bottom centre, 1B = right, 2B = top, 3B = left
const BASE_COORDS = [
  { x: 100, y: 170 }, // home (reference only)
  { x: 155, y: 110 }, // 1st
  { x: 100, y:  50 }, // 2nd
  { x:  45, y: 110 }, // 3rd
]

// For each of the 8 runner configurations (0=empty..7=loaded),
// return which bases are occupied (1,2,3 indices into BASE_COORDS)
function occupiedBases(runners: number): number[] {
  const occupied: number[] = []
  if (runners & 1) occupied.push(1) // 1st
  if (runners & 2) occupied.push(2) // 2nd
  if (runners & 4) occupied.push(3) // 3rd
  return occupied
}

// Position for each state circle: 3 rows (outs) × 8 columns (runners)
// We lay them out in a compact 8×3 grid under the diamond
function stateCirclePos(outs: number, runners: number): { cx: number; cy: number } {
  const colW = 200 / 8
  const cx = colW * runners + colW / 2
  const cy = 195 + outs * 22 + 12
  return { cx, cy }
}

function nrfiColor(prob: number): string {
  if (prob >= 0.80) return "#10b981"
  if (prob >= 0.60) return "#22d3ee"
  if (prob >= 0.40) return "#f59e0b"
  return "#f97373"
}

function BASE_DESCRIPTIONS_SHORT(runners: number): string {
  if (runners === 0) return "Empty"
  if (runners === 1) return "1st"
  if (runners === 2) return "2nd"
  if (runners === 3) return "1st+2nd"
  if (runners === 4) return "3rd"
  if (runners === 5) return "1st+3rd"
  if (runners === 6) return "2nd+3rd"
  return "Loaded"
}

function pmf(lambda: number, k: number): number {
  let logFact = 0
  for (let i = 2; i <= k; i++) logFact += Math.log(i)
  return Math.exp(-lambda + k * Math.log(Math.max(lambda, 1e-9)) - logFact)
}

export function MarkovDiamond({ snapshot }: Props) {
  const [selectedOuts, setSelectedOuts] = useState(0)
  const [selectedRunners, setSelectedRunners] = useState(0)

  const selectedState = snapshot.states.find(
    s => s.outs === selectedOuts && s.runners === selectedRunners
  )

  const pa = snapshot.paOutcomes

  const svgHeight = 195 + 3 * 22 + 24
  const totalHeight = svgHeight

  const runDist = Array.from({ length: 7 }, (_, k) => ({
    runs: String(k),
    prob: pmf(selectedState?.conditionalExpectedRuns ?? 0.35, k),
  }))

  return (
    <Panel title="Markov Diamond" chip="24-State Base-Out Matrix">
      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        {/* SVG Diamond */}
        <div style={{ minWidth: 220 }}>
          <svg
            viewBox={`0 0 200 ${totalHeight}`}
            width="100%"
            style={{ maxWidth: 260, display: "block", overflow: "visible" }}
          >
            {/* Diamond base lines */}
            <polygon
              points={`${BASE_COORDS[0].x},${BASE_COORDS[0].y} ${BASE_COORDS[1].x},${BASE_COORDS[1].y} ${BASE_COORDS[2].x},${BASE_COORDS[2].y} ${BASE_COORDS[3].x},${BASE_COORDS[3].y}`}
              fill="none"
              stroke="var(--ds-line)"
              strokeWidth="1"
              strokeDasharray="4 3"
            />

            {/* Base diamonds */}
            {BASE_COORDS.slice(1).map((b, i) => {
              const occ = occupiedBases(selectedRunners)
              const isOccupied = occ.includes(i + 1)
              return (
                <rect
                  key={i}
                  x={b.x - 7}
                  y={b.y - 7}
                  width={14}
                  height={14}
                  fill={isOccupied ? "var(--ds-cy)" : "var(--ds-panel-2)"}
                  stroke={isOccupied ? "var(--ds-cy)" : "var(--ds-line)"}
                  strokeWidth="1"
                  transform={`rotate(45, ${b.x}, ${b.y})`}
                  style={{
                    filter: isOccupied ? "drop-shadow(0 0 6px var(--ds-cy))" : "none",
                    transition: "all 0.3s",
                  }}
                />
              )
            })}

            {/* Home plate */}
            <polygon
              points={`${BASE_COORDS[0].x},${BASE_COORDS[0].y - 9} ${BASE_COORDS[0].x + 7},${BASE_COORDS[0].y - 4} ${BASE_COORDS[0].x + 7},${BASE_COORDS[0].y + 4} ${BASE_COORDS[0].x - 7},${BASE_COORDS[0].y + 4} ${BASE_COORDS[0].x - 7},${BASE_COORDS[0].y - 4}`}
              fill="var(--ds-panel-2)"
              stroke="var(--ds-dim)"
              strokeWidth="1"
            />

            {/* Outs counter */}
            <text x="100" y="145" textAnchor="middle" fill="var(--ds-muted)" fontSize="8" fontFamily="var(--font-jet)">
              {selectedOuts} OUT{selectedOuts !== 1 ? "S" : ""}
            </text>
            {Array.from({ length: 3 }, (_, i) => (
              <circle
                key={i}
                cx={88 + i * 12}
                cy={152}
                r={4}
                fill={i < selectedOuts ? "var(--ds-warn)" : "var(--ds-line)"}
                stroke="var(--ds-dim)"
                strokeWidth="0.5"
                style={{ transition: "fill 0.3s" }}
              />
            ))}

            {/* Separator line */}
            <line x1="0" y1="188" x2="200" y2="188" stroke="var(--ds-line)" strokeWidth="0.5" />

            {/* Runner config labels */}
            {Array.from({ length: 8 }, (_, runners) => {
              const colW = 200 / 8
              const cx = colW * runners + colW / 2
              return (
                <text
                  key={runners}
                  x={cx}
                  y={197}
                  textAnchor="middle"
                  fill="var(--ds-dim)"
                  fontSize="6"
                  fontFamily="var(--font-jet)"
                >
                  {runners}
                </text>
              )
            })}

            {/* State circles */}
            {snapshot.states.map(state => {
              const { cx, cy } = stateCirclePos(state.outs, state.runners)
              const isSelected = state.outs === selectedOuts && state.runners === selectedRunners
              const color = nrfiColor(state.conditionalNrfiProb)
              return (
                <g key={`${state.outs}-${state.runners}`}>
                  {isSelected && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={11}
                      fill="none"
                      stroke={color}
                      strokeWidth="1.5"
                      opacity={0.4}
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={8}
                    fill={color}
                    opacity={isSelected ? 1 : 0.6}
                    stroke={isSelected ? "white" : "transparent"}
                    strokeWidth={isSelected ? 1 : 0}
                    style={{
                      cursor: "pointer",
                      filter: isSelected ? `drop-shadow(0 0 6px ${color})` : "none",
                      transition: "all 0.2s",
                    }}
                    onClick={() => { setSelectedOuts(state.outs); setSelectedRunners(state.runners) }}
                  />
                  <text
                    x={cx}
                    y={cy + 3}
                    textAnchor="middle"
                    fill={isSelected ? "black" : "rgba(0,0,0,0.8)"}
                    fontSize="6"
                    fontFamily="var(--font-jet)"
                    fontWeight="bold"
                    style={{ pointerEvents: "none" }}
                  >
                    {(state.conditionalNrfiProb * 100).toFixed(0)}
                  </text>
                </g>
              )
            })}

            {/* Outs labels on left */}
            {[0, 1, 2].map(outs => {
              const cy = 195 + outs * 22 + 12
              return (
                <text
                  key={outs}
                  x={-2}
                  y={cy + 3}
                  textAnchor="end"
                  fill="var(--ds-dim)"
                  fontSize="6"
                  fontFamily="var(--font-jet)"
                >
                  {outs}O
                </text>
              )
            })}
          </svg>

          {/* Color legend */}
          <div className="flex gap-2 mt-1 flex-wrap">
            {[
              { label: "≥80%", color: "#10b981" },
              { label: "60–80%", color: "#22d3ee" },
              { label: "40–60%", color: "#f59e0b" },
              { label: "<40%", color: "#f97373" },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: l.color }} />
                <span className="font-jet text-[8px] text-ds-dim">{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-3">
          {/* Selected state info */}
          <div
            className="rounded-[10px] border border-ds-line p-3"
            style={{ background: "var(--ds-panel)" }}
          >
            <div className="font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted mb-2">
              Selected State
            </div>
            <div className="flex items-baseline gap-3 mb-1">
              <span className="font-display text-[22px] font-bold" style={{ color: nrfiColor(selectedState?.conditionalNrfiProb ?? 0) }}>
                {((selectedState?.conditionalNrfiProb ?? 0) * 100).toFixed(1)}%
              </span>
              <span className="font-jet text-[10px] text-ds-muted">P(NRFI from here)</span>
            </div>
            <div className="font-display text-[13px] text-ds-ink">
              {selectedOuts} out{selectedOuts !== 1 ? "s" : ""} · {BASE_DESCRIPTIONS_SHORT(selectedRunners)}
            </div>
            <div className="font-jet text-[9px] text-ds-muted mt-1">
              E[R] = {(selectedState?.conditionalExpectedRuns ?? 0).toFixed(3)}
            </div>
          </div>

          {/* Plain-English explanation */}
          <div
            className="rounded-[10px] border border-ds-line p-3"
            style={{ background: "var(--ds-panel)" }}
          >
            <div className="font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted mb-1">
              Interpretation
            </div>
            <p className="font-jet text-[10px] text-ds-ink-2 leading-relaxed">
              {selectedOuts === 2 && selectedRunners === 0
                ? "Two outs, bases empty — high NRFI probability. Third out likely before any scoring threat develops."
                : selectedRunners === 7
                ? `Bases loaded with ${selectedOuts} out${selectedOuts !== 1 ? "s" : ""} — scoring pressure is maximum. Any plate appearance has high run-scoring potential.`
                : `Starting from ${selectedOuts} out${selectedOuts !== 1 ? "s" : ""} with ${BASE_DESCRIPTIONS_SHORT(selectedRunners).toLowerCase()}, the Markov chain propagates forward through ${24 - selectedOuts * 8} reachable states. Expected runs from this configuration: ${(selectedState?.conditionalExpectedRuns ?? 0).toFixed(2)}.`
              }
            </p>
          </div>

          {/* PA outcomes */}
          <div
            className="rounded-[10px] border border-ds-line p-3"
            style={{ background: "var(--ds-panel)" }}
          >
            <div className="font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted mb-2">
              PA Outcome Rates
            </div>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1">
              {[
                { label: "Out", value: pa.out },
                { label: "Walk", value: pa.walk },
                { label: "1B", value: pa.single },
                { label: "2B", value: pa.double },
                { label: "3B", value: pa.triple },
                { label: "HR", value: pa.hr },
              ].map(r => (
                <div key={r.label}>
                  <div className="font-jet text-[8px] text-ds-dim">{r.label}</div>
                  <div className="font-jet text-[10px] text-ds-ink">{(r.value * 100).toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Run distribution from selected state */}
          <div>
            <div className="font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted mb-1.5">
              Run Distribution from State
            </div>
            <div style={{ height: 100 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={runDist} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-line)" vertical={false} />
                  <XAxis
                    dataKey="runs"
                    tick={{ fill: "var(--ds-muted)", fontSize: 8, fontFamily: "var(--font-jet)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                    tick={{ fill: "var(--ds-muted)", fontSize: 8, fontFamily: "var(--font-jet)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v: number) => [`${(v * 100).toFixed(2)}%`, "Prob"]}
                    contentStyle={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-line)", borderRadius: 8, fontSize: 10, fontFamily: "var(--font-jet)" }}
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  />
                  <Bar dataKey="prob" radius={[3, 3, 0, 0]}>
                    {runDist.map((d) => (
                      <Cell
                        key={d.runs}
                        fill={d.runs === "0" ? nrfiColor(selectedState?.conditionalNrfiProb ?? 0) : "var(--ds-dim)"}
                        opacity={d.runs === "0" ? 1 : 0.5}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  )
}
