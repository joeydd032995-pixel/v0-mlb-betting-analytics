"use client"

import { useState, useCallback } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts"
import { Panel } from "@/components/diamond/Panel"

interface Props {
  homeNrfiProb: number
  awayNrfiProb: number
  homeLabel?: string
  awayLabel?: string
}

interface SimResult {
  nrfiCount: number
  total: number
  ci95Low: number
  ci95High: number
  histogram: { bucket: string; count: number }[]
}

const N = 10_000

function runSimulation(homeP: number, awayP: number): SimResult {
  // Generate correlated random values using Box-Muller for speed
  const buckets = new Array(21).fill(0) // 0%..100% in 5% increments
  let nrfiCount = 0

  // Batch Bernoulli draws
  for (let i = 0; i < N; i++) {
    const homeNrfi = Math.random() < homeP
    const awayNrfi = Math.random() < awayP
    if (homeNrfi && awayNrfi) {
      nrfiCount++
    }
  }

  // Bootstrap CI: sample nrfiCount from Binomial(N, p)
  const p = nrfiCount / N
  const se = Math.sqrt((p * (1 - p)) / N)
  const ci95Low = Math.max(0, p - 1.96 * se)
  const ci95High = Math.min(1, p + 1.96 * se)

  // Build histogram via repeated simulation
  const simProbs: number[] = []
  const HIST_SIMS = 200
  const HIST_N = 50
  for (let s = 0; s < HIST_SIMS; s++) {
    let c = 0
    for (let i = 0; i < HIST_N; i++) {
      if (Math.random() < homeP && Math.random() < awayP) c++
    }
    simProbs.push(c / HIST_N)
  }

  simProbs.forEach(p => {
    const bucket = Math.min(20, Math.floor(p * 20))
    buckets[bucket]++
  })

  const histogram = buckets.map((count, i) => ({
    bucket: `${(i * 5).toFixed(0)}%`,
    count,
  }))

  return { nrfiCount, total: N, ci95Low, ci95High, histogram }
}

export function MonteCarloButton({
  homeNrfiProb,
  awayNrfiProb,
  homeLabel = "Home",
  awayLabel = "Away",
}: Props) {
  const [result, setResult] = useState<SimResult | null>(null)
  const [running, setRunning] = useState(false)

  const run = useCallback(() => {
    setRunning(true)
    // Defer to next frame so button updates first
    requestAnimationFrame(() => {
      const r = runSimulation(homeNrfiProb, awayNrfiProb)
      setResult(r)
      setRunning(false)
    })
  }, [homeNrfiProb, awayNrfiProb])

  const pct = result ? ((result.nrfiCount / result.total) * 100).toFixed(2) : null

  return (
    <Panel title="Monte Carlo Simulation" chip={result ? `${N.toLocaleString()} trials` : "Click to run"}>
      <div className="space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <div className="font-jet text-[9px] uppercase tracking-[0.18em] text-ds-muted">{homeLabel} P(NRFI)</div>
            <div className="font-display text-[16px] font-semibold text-ds-cy">{(homeNrfiProb * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div className="font-jet text-[9px] uppercase tracking-[0.18em] text-ds-muted">{awayLabel} P(NRFI)</div>
            <div className="font-display text-[16px] font-semibold text-ds-gr">{(awayNrfiProb * 100).toFixed(1)}%</div>
          </div>
          {result && (
            <div>
              <div className="font-jet text-[9px] uppercase tracking-[0.18em] text-ds-muted">Combined NRFI</div>
              <div
                className="font-display text-[20px] font-bold"
                style={{ color: parseFloat(pct ?? "0") >= 50 ? "var(--ds-gr)" : "var(--ds-bad)" }}
              >
                {pct}%
              </div>
            </div>
          )}

          <button
            onClick={run}
            disabled={running}
            className="ml-auto px-5 py-2.5 rounded-[10px] font-display font-semibold text-[13px] transition-all"
            style={{
              background: running
                ? "var(--ds-panel-2)"
                : "linear-gradient(135deg, var(--ds-cy), var(--ds-gr))",
              color: running ? "var(--ds-muted)" : "black",
              border: "1px solid var(--ds-line)",
              cursor: running ? "not-allowed" : "pointer",
            }}
          >
            {running ? "Running…" : `Run ${N.toLocaleString()} Simulations`}
          </button>
        </div>

        {result && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="font-jet text-[9px] uppercase tracking-[0.18em] text-ds-muted">NRFI Hits</div>
                <div className="font-display text-[15px] font-semibold text-ds-ink">
                  {result.nrfiCount.toLocaleString()} / {result.total.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="font-jet text-[9px] uppercase tracking-[0.18em] text-ds-muted">95% CI Low</div>
                <div className="font-display text-[15px] font-semibold text-ds-cy">
                  {(result.ci95Low * 100).toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="font-jet text-[9px] uppercase tracking-[0.18em] text-ds-muted">95% CI High</div>
                <div className="font-display text-[15px] font-semibold text-ds-gr">
                  {(result.ci95High * 100).toFixed(2)}%
                </div>
              </div>
            </div>

            <div>
              <div className="font-jet text-[9px] uppercase tracking-[0.18em] text-ds-muted mb-2">
                NRFI Rate Distribution (200 bootstrap samples of 50)
              </div>
              <div style={{ height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={result.histogram} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-line)" vertical={false} />
                    <XAxis
                      dataKey="bucket"
                      tick={{ fill: "var(--ds-muted)", fontSize: 8, fontFamily: "var(--font-jet)" }}
                      axisLine={false}
                      tickLine={false}
                      interval={3}
                    />
                    <YAxis
                      tick={{ fill: "var(--ds-muted)", fontSize: 8, fontFamily: "var(--font-jet)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v: number) => [v, "samples"]}
                      contentStyle={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-line)", borderRadius: 8, fontSize: 10, fontFamily: "var(--font-jet)" }}
                      cursor={{ fill: "rgba(255,255,255,0.03)" }}
                    />
                    <ReferenceLine
                      x={`${(Math.round(result.nrfiCount / result.total * 20) * 5).toFixed(0)}%`}
                      stroke="var(--ds-cy)"
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                    />
                    <Bar dataKey="count" fill="var(--ds-cy)" radius={[3, 3, 0, 0]} opacity={0.7} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        <p className="font-jet text-[9px] text-ds-dim">
          Runs {N.toLocaleString()} independent Bernoulli trials for home and away half-innings. CI via normal approximation to Binomial. All computation is in-browser — no server call.
        </p>
      </div>
    </Panel>
  )
}
