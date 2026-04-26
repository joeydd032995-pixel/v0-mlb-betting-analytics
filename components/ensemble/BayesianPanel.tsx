"use client"

import { useState } from "react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { Panel } from "@/components/diamond/Panel"
import type { HalfInningModelBreakdown } from "@/lib/types"

interface Props {
  home?: HalfInningModelBreakdown
  away?: HalfInningModelBreakdown
  homeLabel?: string
  awayLabel?: string
}

type ViewMode = "prior" | "likelihood" | "posterior"

function betaPdf(x: number, alpha: number, beta: number): number {
  if (x <= 0 || x >= 1) return 0
  // Approximation using log-Beta via lgamma approximation
  const logBeta = lgamma(alpha) + lgamma(beta) - lgamma(alpha + beta)
  return Math.exp((alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x) - logBeta)
}

function lgamma(z: number): number {
  // Lanczos approximation
  const g = 7
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z)
  z -= 1
  let x = c[0]
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i)
  const t = z + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

export function BayesianPanel({ home, away, homeLabel = "Home", awayLabel = "Away" }: Props) {
  const [view, setView] = useState<ViewMode>("posterior")

  // Bayesian update: prior Beta(αp, βp) + observed data → posterior
  // League prior: α=30*0.614=18.42, β=30*(1-0.614)=11.58 (k=30 for starters)
  const LEAGUE_NRFI = 0.614
  const K = 30
  const priorAlpha = K * LEAGUE_NRFI
  const priorBeta = K * (1 - LEAGUE_NRFI)

  // Derive observed start count and nrfi successes from bayesianDataWeight & shrunkNrfiRate
  const homeWeight = home?.bayesianDataWeight ?? 0.5
  const homeObsN = Math.round((homeWeight / (1 - homeWeight)) * K)
  const homeShrunk = home?.shrunkNrfiRate ?? LEAGUE_NRFI
  const homeObsNrfi = Math.round(homeObsN * homeShrunk)

  const awayWeight = away?.bayesianDataWeight ?? 0.5
  const awayObsN = Math.round((awayWeight / (1 - awayWeight)) * K)
  const awayShrunk = away?.shrunkNrfiRate ?? LEAGUE_NRFI
  const awayObsNrfi = Math.round(awayObsN * awayShrunk)

  const homePosteriorAlpha = priorAlpha + homeObsNrfi
  const homePosteriorBeta = priorBeta + (homeObsN - homeObsNrfi)
  const awayPosteriorAlpha = priorAlpha + awayObsNrfi
  const awayPosteriorBeta = priorBeta + (awayObsN - awayObsNrfi)

  const steps = 50
  const chartData = Array.from({ length: steps + 1 }, (_, i) => {
    const x = i / steps
    const prior = betaPdf(x, priorAlpha, priorBeta)
    const homeLike = betaPdf(x, homeObsNrfi + 1, homeObsN - homeObsNrfi + 1)
    const homePosterior = betaPdf(x, homePosteriorAlpha, homePosteriorBeta)
    const awayLike = betaPdf(x, awayObsNrfi + 1, awayObsN - awayObsNrfi + 1)
    const awayPosterior = betaPdf(x, awayPosteriorAlpha, awayPosteriorBeta)
    return { x: x.toFixed(2), prior, homeLike, homePosterior, awayLike, awayPosterior }
  })

  const VIEWS: { key: ViewMode; label: string }[] = [
    { key: "prior",      label: "Prior" },
    { key: "likelihood", label: "Likelihood" },
    { key: "posterior",  label: "Posterior" },
  ]

  return (
    <Panel title="Bayesian Shrinkage" chip="Beta-Binomial Update">
      <div className="flex gap-2 mb-3">
        {VIEWS.map(v => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`ds-chip ${view === v.key ? "ds-chip-active" : ""}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <div className="font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted">{homeLabel} Data Weight</div>
          <div className="font-display text-[16px] font-semibold text-ds-cy">{(homeWeight * 100).toFixed(0)}%</div>
          <div className="font-jet text-[9px] text-ds-dim">{homeObsN} starts observed</div>
        </div>
        <div>
          <div className="font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted">{awayLabel} Data Weight</div>
          <div className="font-display text-[16px] font-semibold text-ds-gr">{(awayWeight * 100).toFixed(0)}%</div>
          <div className="font-jet text-[9px] text-ds-dim">{awayObsN} starts observed</div>
        </div>
      </div>

      <div style={{ height: 170 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-line)" />
            <XAxis
              dataKey="x"
              ticks={["0.20", "0.40", "0.60", "0.80", "1.00"]}
              tick={{ fill: "var(--ds-muted)", fontSize: 9, fontFamily: "var(--font-jet)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "var(--ds-muted)", fontSize: 9, fontFamily: "var(--font-jet)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(v: number, name: string) => [v.toFixed(3), name]}
              contentStyle={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-line)", borderRadius: 8, fontSize: 10, fontFamily: "var(--font-jet)" }}
              cursor={{ stroke: "var(--ds-line)" }}
            />
            <Legend
              formatter={(value: string) => (
                <span style={{ color: "var(--ds-muted)", fontSize: 9, fontFamily: "var(--font-jet)" }}>
                  {value}
                </span>
              )}
            />
            {(view === "prior" || view === "posterior") && (
              <Line
                type="monotone"
                dataKey="prior"
                name="Prior (League)"
                stroke="var(--ds-dim)"
                dot={false}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}
            {(view === "likelihood" || view === "posterior") && (
              <Line
                type="monotone"
                dataKey="homeLike"
                name={`${homeLabel} Likelihood`}
                stroke="var(--ds-cy)"
                dot={false}
                strokeWidth={1.5}
                strokeDasharray={view === "posterior" ? "3 2" : undefined}
              />
            )}
            {(view === "likelihood" || view === "posterior") && (
              <Line
                type="monotone"
                dataKey="awayLike"
                name={`${awayLabel} Likelihood`}
                stroke="var(--ds-gr)"
                dot={false}
                strokeWidth={1.5}
                strokeDasharray={view === "posterior" ? "3 2" : undefined}
              />
            )}
            {view === "posterior" && (
              <Line
                type="monotone"
                dataKey="homePosterior"
                name={`${homeLabel} Posterior`}
                stroke="var(--ds-cy)"
                dot={false}
                strokeWidth={2.5}
              />
            )}
            {view === "posterior" && (
              <Line
                type="monotone"
                dataKey="awayPosterior"
                name={`${awayLabel} Posterior`}
                stroke="var(--ds-gr)"
                dot={false}
                strokeWidth={2.5}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="font-jet text-[9px] text-ds-dim mt-2">
        Prior: Beta({priorAlpha.toFixed(1)}, {priorBeta.toFixed(1)}) · League NRFI anchor {(LEAGUE_NRFI * 100).toFixed(1)}% · k={K}
      </p>
    </Panel>
  )
}
