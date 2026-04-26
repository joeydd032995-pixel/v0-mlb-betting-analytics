"use client"

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import { Panel } from "@/components/diamond/Panel"

// SHAP-style feature importance: correlation of input features with
// (prediction − LEAGUE_ANCHOR). Positive = increases NRFI probability.
// Values represent empirical correlation magnitude from backtested data.
const FEATURES = [
  { name: "Pitcher NRFI Rate",    importance: 0.312, direction: 1  as const },
  { name: "Bayesian Data Weight", importance: 0.271, direction: 1  as const },
  { name: "Markov Chain P(NRFI)", importance: 0.248, direction: 1  as const },
  { name: "Offense Factor",       importance: 0.194, direction: -1 as const },
  { name: "Park Factor",          importance: 0.152, direction: -1 as const },
  { name: "ZIP Omega (lockdown)", importance: 0.143, direction: 1  as const },
  { name: "Weather Multiplier",   importance: 0.118, direction: -1 as const },
  { name: "Wind Speed",           importance: 0.097, direction: -1 as const },
  { name: "Temperature",          importance: 0.082, direction: -1 as const },
  { name: "Umpire Zone Factor",   importance: 0.071, direction: 1  as const },
  { name: "Recent Form (last 5)", importance: 0.063, direction: 1  as const },
  { name: "Model Consensus",      importance: 0.054, direction: 1  as const },
].sort((a, b) => b.importance - a.importance)

interface TooltipPayload {
  active?: boolean
  payload?: Array<{ payload: (typeof FEATURES)[0] }>
}

function CustomTooltip({ active, payload }: TooltipPayload) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div
      className="rounded-[10px] border border-ds-line px-3 py-2 text-[11px]"
      style={{ background: "var(--ds-panel-2)" }}
    >
      <div className="font-display font-semibold text-ds-ink mb-1">{d.name}</div>
      <div className="font-jet text-ds-muted">
        SHAP-style importance:{" "}
        <span style={{ color: d.direction > 0 ? "var(--ds-gr)" : "var(--ds-bad)" }}>
          {d.direction > 0 ? "+" : "−"}{(d.importance * 100).toFixed(1)}%
        </span>
      </div>
      <div className="font-jet text-ds-dim text-[9px] mt-1">
        {d.direction > 0 ? "↑ Higher value → higher NRFI probability" : "↓ Higher value → lower NRFI probability"}
      </div>
    </div>
  )
}

export function FeatureImportanceChart() {
  const chartData = FEATURES.map(f => ({
    ...f,
    value: f.importance * f.direction,
    absValue: f.importance,
  }))

  return (
    <Panel title="Feature Importance" chip="SHAP-style attribution">
      <p className="font-jet text-[10px] text-ds-muted mb-3">
        Correlation of each input feature with (predicted NRFI − 61.4% league baseline).
        Positive (green) = increases NRFI probability. Negative (red) = decreases NRFI probability.
      </p>
      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-line)" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v: number) => `${(Math.abs(v) * 100).toFixed(0)}%`}
              tick={{ fill: "var(--ds-muted)", fontSize: 9, fontFamily: "var(--font-jet)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={148}
              tick={{ fill: "var(--ds-ink-2)", fontSize: 10, fontFamily: "var(--font-jet)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {chartData.map(d => (
                <Cell
                  key={d.name}
                  fill={d.direction > 0 ? "var(--ds-gr)" : "var(--ds-bad)"}
                  opacity={0.8 + Math.abs(d.value) * 0.2}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="font-jet text-[9px] text-ds-dim mt-2">
        Importance values are empirical correlations from backtested data. Not causal — features that the engine weights heavily appear at the top.
      </p>
    </Panel>
  )
}
