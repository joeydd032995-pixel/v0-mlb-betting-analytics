"use client"

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts"
import { Panel } from "@/components/diamond/Panel"
import type { TrackedPrediction } from "@/lib/prediction-store"

interface Props {
  predictions: TrackedPrediction[]
}

export function PnLChart({ predictions }: Props) {
  // Build cumulative P/L from completed predictions, oldest first
  const completed = [...predictions]
    .filter(p => p.status === "complete" && p.profitLoss !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date))

  if (completed.length === 0) {
    return (
      <Panel title="Cumulative P/L" chip="Flat stake">
        <div className="py-8 text-center">
          <p className="font-jet text-[11px] text-ds-muted">No settled bets yet. Results will appear here after recording game outcomes.</p>
        </div>
      </Panel>
    )
  }

  let cumulative = 0
  const chartData = completed.map((p, i) => {
    cumulative += p.profitLoss ?? 0
    return {
      index: i + 1,
      label: `${p.awayTeam} @ ${p.homeTeam}`,
      date: p.date,
      pnl: p.profitLoss ?? 0,
      cumPnl: cumulative,
    }
  })

  const maxAbs = Math.max(...chartData.map(d => Math.abs(d.cumPnl)), 1)
  const isProfit = cumulative >= 0

  const handleExportCSV = () => {
    const rows = [
      ["Bet #", "Date", "Game", "P/L", "Cumulative P/L"],
      ...chartData.map(d => [d.index, d.date, d.label, d.pnl.toFixed(2), d.cumPnl.toFixed(2)]),
    ]
    const csv = rows.map(r => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `diamond-stats-pnl-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Panel title="Cumulative P/L" chip={`${completed.length} settled bets`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted">Net P/L</div>
          <div
            className="font-display text-[24px] font-bold"
            style={{ color: isProfit ? "var(--ds-gr)" : "var(--ds-bad)" }}
          >
            {isProfit ? "+" : ""}{cumulative.toFixed(2)}u
          </div>
        </div>
        <button onClick={handleExportCSV} className="ds-chip text-[10px]">
          Export CSV
        </button>
      </div>

      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isProfit ? "var(--ds-gr)" : "var(--ds-bad)"} stopOpacity={0.25} />
                <stop offset="95%" stopColor={isProfit ? "var(--ds-gr)" : "var(--ds-bad)"} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-line)" vertical={false} />
            <XAxis
              dataKey="index"
              tick={{ fill: "var(--ds-muted)", fontSize: 9, fontFamily: "var(--font-jet)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[-maxAbs * 1.1, maxAbs * 1.1]}
              tick={{ fill: "var(--ds-muted)", fontSize: 9, fontFamily: "var(--font-jet)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}u`}
            />
            <ReferenceLine y={0} stroke="var(--ds-dim)" strokeWidth={1} />
            <Tooltip
              labelFormatter={(i: number) => chartData[i - 1]?.label ?? `Bet #${i}`}
              formatter={(v: number, name: string) => [
                `${v >= 0 ? "+" : ""}${v.toFixed(2)}u`,
                name === "cumPnl" ? "Cumulative P/L" : "Single Bet P/L",
              ]}
              contentStyle={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-line)", borderRadius: 8, fontSize: 10, fontFamily: "var(--font-jet)" }}
              cursor={{ stroke: "var(--ds-line)" }}
            />
            <Area
              type="monotone"
              dataKey="cumPnl"
              name="cumPnl"
              stroke={isProfit ? "var(--ds-gr)" : "var(--ds-bad)"}
              fill="url(#pnlGrad)"
              strokeWidth={2}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="font-jet text-[9px] text-ds-dim mt-2">
        Flat 1-unit stake on every high-confidence recommended bet. Does not account for vig.
      </p>
    </Panel>
  )
}
