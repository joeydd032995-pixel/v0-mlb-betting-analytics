"use client"

/**
 * MonteCarloHistogram — recharts BarChart of the simulated total-runs
 * distribution for a single first inning.  Highlights the NRFI bucket (0 runs)
 * and the 90th-percentile bucket so the user sees both the mode and the tail.
 */

import { useMemo } from "react"
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Sigma } from "lucide-react"
import type { MonteCarloResult } from "@/lib/types"

interface MonteCarloHistogramProps {
  mc?: MonteCarloResult | null
}

const NRFI_BUCKET_COLOR = "#10b981"  // emerald-500
const RUNS_BUCKET_COLOR = "#a78bfa"  // violet-400

export function MonteCarloHistogram({ mc }: MonteCarloHistogramProps) {
  const data = useMemo(() => {
    if (!mc || mc.runDistribution.length === 0) return []
    return mc.runDistribution.map((p, runs) => ({
      runs,
      p,
      label: runs === 10 ? "10+" : String(runs),
    }))
  }, [mc])

  if (!mc || data.length === 0) return null

  return (
    <div className="mt-3 rounded-md border border-indigo-500/20 bg-indigo-500/5 p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
          <Sigma className="h-3.5 w-3.5" />
          Monte Carlo · {mc.nSims.toLocaleString()} sims
        </p>
        <span className="text-[10px] text-muted-foreground">
          P(NRFI) {(mc.pNRFI * 100).toFixed(1)}% · μ {mc.meanRuns.toFixed(2)}R · σ² {mc.variance.toFixed(2)}
        </span>
      </div>

      <div className="h-[160px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "currentColor" }}
              tickLine={false}
              axisLine={false}
              className="text-indigo-300/80"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "currentColor" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              width={32}
              className="text-indigo-300/80"
            />
            <Tooltip
              cursor={{ fill: "rgba(99, 102, 241, 0.08)" }}
              contentStyle={{
                background: "var(--background, #0a0a0a)",
                border: "1px solid rgba(99, 102, 241, 0.3)",
                borderRadius: 6,
                fontSize: 11,
              }}
              formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, "P(runs)"]}
              labelFormatter={(label: string) => `${label} run${label === "1" ? "" : "s"}`}
            />
            <ReferenceLine
              x={String(mc.percentile90)}
              stroke="#fbbf24"
              strokeDasharray="3 3"
              label={{ value: "p90", position: "top", fontSize: 9, fill: "#fbbf24" }}
            />
            <Bar dataKey="p" radius={[3, 3, 0, 0]}>
              {data.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={entry.runs === 0 ? NRFI_BUCKET_COLOR : RUNS_BUCKET_COLOR}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground">
        Distribution of total first-inning runs across simulations.
        Bucket 0 = NRFI · dashed line marks the 90th-percentile outcome.
      </p>
    </div>
  )
}
