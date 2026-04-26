"use client"

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Cell,
} from "recharts"
import { Panel } from "@/components/diamond/Panel"
import type { HalfInningModelBreakdown } from "@/lib/types"

interface Props {
  home?: HalfInningModelBreakdown
  away?: HalfInningModelBreakdown
  homeLabel?: string
  awayLabel?: string
}

function pmf(lambda: number, k: number): number {
  // Poisson PMF: e^(-λ) * λ^k / k!
  let logFact = 0
  for (let i = 2; i <= k; i++) logFact += Math.log(i)
  return Math.exp(-lambda + k * Math.log(Math.max(lambda, 1e-9)) - logFact)
}

interface TooltipPayload {
  active?: boolean
  label?: string
  payload?: Array<{ name: string; value: number; color: string }>
}

function CustomTooltip({ active, payload, label }: TooltipPayload) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-[10px] border border-ds-line px-3 py-2 text-[11px]"
      style={{ background: "var(--ds-panel-2)" }}
    >
      <div className="font-display font-semibold text-ds-ink mb-1">{label} runs</div>
      {payload.map(p => (
        <div key={p.name} className="font-jet text-ds-muted">
          {p.name}: <span style={{ color: p.color }}>{(p.value * 100).toFixed(2)}%</span>
        </div>
      ))}
    </div>
  )
}

export function PoissonPanel({ home, away, homeLabel = "Home", awayLabel = "Away" }: Props) {
  // Derive λ from mapreLambdaAdj (actual model λ) or estimate from poissonNrfi
  const lambdaHome = home?.mapreLambdaAdj ?? (home ? -Math.log(Math.max(home.poissonNrfi, 0.01)) : 0.4)
  const lambdaAway = away?.mapreLambdaAdj ?? (away ? -Math.log(Math.max(away.poissonNrfi, 0.01)) : 0.4)

  const data = Array.from({ length: 7 }, (_, k) => ({
    k: String(k),
    [homeLabel]: pmf(lambdaHome, k),
    [awayLabel]: pmf(lambdaAway, k),
  }))

  return (
    <Panel title="Poisson Run Distribution" chip="PMF k=0..6">
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <div className="font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted">λ {homeLabel}</div>
          <div className="font-display text-[18px] font-semibold text-ds-cy">{lambdaHome.toFixed(3)}</div>
        </div>
        <div>
          <div className="font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted">λ {awayLabel}</div>
          <div className="font-display text-[18px] font-semibold text-ds-gr">{lambdaAway.toFixed(3)}</div>
        </div>
      </div>
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-line)" vertical={false} />
            <XAxis
              dataKey="k"
              tick={{ fill: "var(--ds-muted)", fontSize: 9, fontFamily: "var(--font-jet)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              tick={{ fill: "var(--ds-muted)", fontSize: 9, fontFamily: "var(--font-jet)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Legend
              formatter={(value: string) => (
                <span style={{ color: "var(--ds-muted)", fontSize: 9, fontFamily: "var(--font-jet)" }}>
                  {value}
                </span>
              )}
            />
            <Bar dataKey={homeLabel} fill="var(--ds-cy)" radius={[3, 3, 0, 0]} opacity={0.85}>
              {data.map((d) => (
                <Cell
                  key={d.k}
                  fill={d.k === "0" ? "var(--ds-cy)" : "var(--ds-cy)"}
                  opacity={d.k === "0" ? 1 : 0.6}
                />
              ))}
            </Bar>
            <Bar dataKey={awayLabel} fill="var(--ds-gr)" radius={[3, 3, 0, 0]} opacity={0.85}>
              {data.map((d) => (
                <Cell
                  key={d.k}
                  fill={d.k === "0" ? "var(--ds-gr)" : "var(--ds-gr)"}
                  opacity={d.k === "0" ? 1 : 0.6}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="font-jet text-[9px] text-ds-dim mt-2">
        k=0 bars (full opacity) represent P(NRFI) per half. λ derived from MAPRE adjusted scoring rate.
      </p>
    </Panel>
  )
}
