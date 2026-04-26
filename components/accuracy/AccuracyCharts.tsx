"use client"

import { useMemo } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, ReferenceLine, Legend,
} from "recharts"
import { Panel } from "@/components/diamond/Panel"
import type { ExtendedModelAccuracy } from "@/lib/prediction-store"

interface Props {
  accuracy: ExtendedModelAccuracy
}

const MODEL_COLORS: Record<string, string> = {
  "Poisson":           "#3b82f6",
  "ZIP":               "#22d3ee",
  "Markov":            "#10b981",
  "Ensemble":          "#a78bfa",
  "Logistic Stack":    "#f59e0b",
  "NN Interaction":    "#f97373",
  "Hierarchical Bayes": "#8b5cf6",
}

// Reliability diagram (illustrative calibration curve).
// Real calibration requires raw prediction-by-prediction data; this approximates
// from ensemble accuracy and MAE — useful for shape, not exact values.
function buildCalibrationData(
  perModel: ExtendedModelAccuracy["perModelAccuracy"]
): { bucket: string; predicted: number; actual: number }[] {
  const BUCKETS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
  const ensembleModel = perModel.find(m => m.model === "Ensemble")
  const baseAcc = ensembleModel?.accuracy ?? 0.614

  return BUCKETS.map(p => ({
    bucket: `${(p * 100).toFixed(0)}%`,
    predicted: p,
    actual: Math.min(1, Math.max(0, p * baseAcc / 0.614)),
  }))
}

export function AccuracyCharts({ accuracy }: Props) {
  const perModelData = useMemo(() => accuracy.perModelAccuracy.map(m => ({
    name: m.model === "Logistic Stack" ? "LogMeta" : m.model === "Hierarchical Bayes" ? "HierBayes" : m.model === "NN Interaction" ? "NN Cross" : m.model,
    accuracy: m.accuracy,
    mae: m.mae,
    n: m.totalPredictions,
    fullName: m.model,
  })), [accuracy.perModelAccuracy])

  const perfectCal = useMemo(() => {
    const cal = buildCalibrationData(accuracy.perModelAccuracy)
    return cal.map(d => ({ ...d, perfect: d.predicted }))
  }, [accuracy.perModelAccuracy])

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Per-model accuracy bar chart */}
      <Panel title="Per-Model Accuracy" chip="% correct">
        {perModelData.length === 0 ? (
          <p className="font-jet text-[11px] text-ds-muted py-4 text-center">
            No tracked predictions with results yet.
          </p>
        ) : (
          <>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perModelData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-line)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "var(--ds-muted)", fontSize: 9, fontFamily: "var(--font-jet)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                    tick={{ fill: "var(--ds-muted)", fontSize: 9, fontFamily: "var(--font-jet)" }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0.4, 1]}
                  />
                  <ReferenceLine y={0.614} stroke="var(--ds-warn)" strokeDasharray="4 3" strokeWidth={1.5} />
                  <Tooltip
                    formatter={(v: number, name: string) => [
                      name === "accuracy" ? `${(v * 100).toFixed(1)}%` : v.toFixed(4),
                      name === "accuracy" ? "Accuracy" : "MAE",
                    ]}
                    contentStyle={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-line)", borderRadius: 8, fontSize: 10, fontFamily: "var(--font-jet)" }}
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  />
                  <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
                    {perModelData.map((d: typeof perModelData[0]) => (
                      <Cell key={d.fullName} fill={MODEL_COLORS[d.fullName] ?? "var(--ds-cy)"} opacity={0.9} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="font-jet text-[9px] text-ds-dim mt-2">
              Dashed line = league NRFI baseline (61.4%). Models above baseline add value.
            </p>
          </>
        )}
      </Panel>

      {/* Reliability / calibration diagram */}
      <Panel title="Calibration Curve" chip="Predicted vs Actual">
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={perfectCal} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-line)" />
              <XAxis
                dataKey="bucket"
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
              <Tooltip
                formatter={(v: number, name: string) => [`${(v * 100).toFixed(1)}%`, name === "actual" ? "Illustrative Rate" : name === "perfect" ? "Perfect Calibration" : "Predicted"]}
                contentStyle={{ background: "var(--ds-panel-2)", border: "1px solid var(--ds-line)", borderRadius: 8, fontSize: 10, fontFamily: "var(--font-jet)" }}
                cursor={{ stroke: "var(--ds-line)" }}
              />
              <Legend
                formatter={(value: string) => (
                  <span style={{ color: "var(--ds-muted)", fontSize: 9, fontFamily: "var(--font-jet)" }}>
                    {value === "actual" ? "Illustrative Rate" : value === "perfect" ? "Perfect" : value}
                  </span>
                )}
              />
              <Line
                type="monotone"
                dataKey="perfect"
                stroke="var(--ds-dim)"
                dot={false}
                strokeDasharray="4 3"
                strokeWidth={1.5}
                name="perfect"
              />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="var(--ds-cy)"
                dot={{ fill: "var(--ds-cy)", r: 3 }}
                strokeWidth={2}
                name="actual"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="font-jet text-[9px] text-ds-dim mt-2">
          Illustrative only — approximated from ensemble accuracy, not raw prediction-by-prediction data.
        </p>
      </Panel>
    </div>
  )
}
