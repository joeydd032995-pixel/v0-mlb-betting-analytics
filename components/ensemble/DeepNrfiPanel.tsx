"use client"

/**
 * DeepNrfiPanel — recharts BarChart of the top SHAP-like contributions from
 * the DeepNRFI LightGBM model.  Renders nothing when `deepNrfi` is undefined,
 * so the component degrades silently when the artifact / feature flag is off.
 */

import { useMemo } from "react"
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Brain } from "lucide-react"
import type { DeepNrfiResult, FeatureContribution } from "@/lib/types"

interface DeepNrfiPanelProps {
  deepNrfi?: DeepNrfiResult | null
}

const NRFI_COLOR = "#10b981"     // emerald-500
const YRFI_COLOR = "#f43f5e"     // rose-500
const NEUTRAL_COLOR = "#71717a"  // zinc-500

/** Strip the home_/away_ prefix and lowercase underscore for display. */
function prettyName(key: string): string {
  return key.replace(/^home_/, "↑ ").replace(/^away_/, "↓ ").replace(/_/g, " ")
}

function colorFor(c: FeatureContribution): string {
  if (c.impact === "NRFI") return NRFI_COLOR
  if (c.impact === "YRFI") return YRFI_COLOR
  return NEUTRAL_COLOR
}

export function DeepNrfiPanel({ deepNrfi }: DeepNrfiPanelProps) {
  const data = useMemo(() => {
    if (!deepNrfi || deepNrfi.topFeatures.length === 0) return []
    // Use absolute value for bar length so direction is encoded in colour;
    // sign is implied by impact (NRFI = positive, YRFI = negative).
    return deepNrfi.topFeatures.map((f) => ({
      name: prettyName(String(f.name)),
      raw: f.value,
      magnitude: Math.abs(f.value),
      impact: f.impact,
      presence: f.presence,
      color: colorFor(f),
    }))
  }, [deepNrfi])

  if (!deepNrfi || data.length === 0) return null

  return (
    <div className="mt-3 rounded-md border border-violet-500/20 bg-violet-500/5 p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-300">
          <Brain className="h-3.5 w-3.5" />
          DeepNRFI · top features
        </p>
        <span className="text-[10px] text-muted-foreground">
          v{deepNrfi.modelVersion} · P(NRFI) {(deepNrfi.probability * 100).toFixed(1)}%
        </span>
      </div>

      <div className="h-[140px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis
              type="category"
              dataKey="name"
              width={130}
              tick={{ fontSize: 10, fill: "currentColor" }}
              tickLine={false}
              axisLine={false}
              className="text-violet-300/80"
            />
            <Tooltip
              cursor={{ fill: "rgba(139, 92, 246, 0.08)" }}
              contentStyle={{
                background: "var(--background, #0a0a0a)",
                border: "1px solid rgba(139, 92, 246, 0.3)",
                borderRadius: 6,
                fontSize: 11,
              }}
              formatter={(value: number, _name, item) => {
                const raw = item.payload?.raw ?? 0
                return [`${(raw * 100).toFixed(1)}% Δ`, item.payload?.impact ?? ""]
              }}
              labelFormatter={(label: string) => label}
            />
            <Bar dataKey="magnitude" radius={[0, 4, 4, 0]}>
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} fillOpacity={entry.presence ? 1 : 0.45} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground">
        Bars show ablation Δ (calibrated probability change when each feature is replaced
        by its training median).  Faded bars indicate imputed/default inputs.
      </p>
    </div>
  )
}
