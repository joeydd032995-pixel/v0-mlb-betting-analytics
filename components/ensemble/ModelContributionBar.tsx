"use client"

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import { Panel } from "@/components/diamond/Panel"
import { ENSEMBLE_WEIGHTS } from "@/lib/nrfi-models"
import type { ModelBreakdown } from "@/lib/types"

interface Props {
  modelBreakdown?: ModelBreakdown
}

const MODEL_META: Record<string, { label: string; color: string }> = {
  poisson:           { label: "Poisson",     color: "#3b82f6" },
  zip:               { label: "ZIP",          color: "#22d3ee" },
  markov:            { label: "Markov",       color: "#10b981" },
  mapre:             { label: "MAPRE",        color: "#8b5cf6" },
  logisticMeta:      { label: "LogMeta",      color: "#f59e0b" },
  nnInteraction:     { label: "NN Cross",     color: "#f97373" },
  hierarchicalBayes: { label: "HierBayes",   color: "#a78bfa" },
}

interface TooltipPayload {
  active?: boolean
  payload?: Array<{ payload: { key: string; weight: number; homeNrfi?: number; awayNrfi?: number } }>
}

function CustomTooltip({ active, payload }: TooltipPayload) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const meta = MODEL_META[d.key] ?? { label: d.key, color: "var(--ds-cy)" }
  return (
    <div
      className="rounded-[10px] border border-ds-line px-3 py-2 text-[11px]"
      style={{ background: "var(--ds-panel-2)" }}
    >
      <div className="font-display font-semibold mb-1" style={{ color: meta.color }}>{meta.label}</div>
      <div className="font-jet text-ds-muted">Weight: <span className="text-ds-ink">{(d.weight * 100).toFixed(2)}%</span></div>
      {d.homeNrfi !== undefined && (
        <div className="font-jet text-ds-muted">Home P(NRFI): <span className="text-ds-cy">{(d.homeNrfi * 100).toFixed(1)}%</span></div>
      )}
      {d.awayNrfi !== undefined && (
        <div className="font-jet text-ds-muted">Away P(NRFI): <span className="text-ds-gr">{(d.awayNrfi * 100).toFixed(1)}%</span></div>
      )}
    </div>
  )
}

export function ModelContributionBar({ modelBreakdown }: Props) {
  const home = modelBreakdown?.homeHalfInning
  const away = modelBreakdown?.awayHalfInning

  const data = (Object.entries(ENSEMBLE_WEIGHTS) as [keyof typeof ENSEMBLE_WEIGHTS, number][]).map(
    ([key, weight]) => {
      const homeNrfi =
        key === "poisson" ? home?.poissonNrfi :
        key === "zip" ? home?.zipNrfi :
        key === "markov" ? home?.markovNrfi :
        key === "mapre" ? home?.mapreNrfi :
        key === "logisticMeta" ? home?.logisticMetaNrfi :
        key === "nnInteraction" ? home?.nnInteractionNrfi :
        key === "hierarchicalBayes" ? home?.hierarchicalBayesNrfi : undefined

      const awayNrfi =
        key === "poisson" ? away?.poissonNrfi :
        key === "zip" ? away?.zipNrfi :
        key === "markov" ? away?.markovNrfi :
        key === "mapre" ? away?.mapreNrfi :
        key === "logisticMeta" ? away?.logisticMetaNrfi :
        key === "nnInteraction" ? away?.nnInteractionNrfi :
        key === "hierarchicalBayes" ? away?.hierarchicalBayesNrfi : undefined

      return { key, weight, homeNrfi, awayNrfi }
    }
  )

  const consensus = modelBreakdown?.modelConsensus

  return (
    <Panel
      title="7-Model Ensemble Weights"
      chip={consensus !== undefined ? `Consensus ${(consensus * 100).toFixed(0)}%` : "Ensemble"}
    >
      {modelBreakdown?.consensusNote && (
        <p className="font-jet text-[10px] text-ds-warn uppercase tracking-[0.1em] mb-2">
          ⚠ {modelBreakdown.consensusNote}
        </p>
      )}
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-line)" vertical={false} />
            <XAxis
              dataKey="key"
              tickFormatter={(k: string) => MODEL_META[k]?.label ?? k}
              tick={{ fill: "var(--ds-muted)", fontSize: 9, fontFamily: "var(--font-jet)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              tick={{ fill: "var(--ds-muted)", fontSize: 9, fontFamily: "var(--font-jet)" }}
              axisLine={false}
              tickLine={false}
              domain={[0, 0.5]}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Bar dataKey="weight" radius={[4, 4, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.key} fill={MODEL_META[d.key]?.color ?? "var(--ds-cy)"} opacity={0.9} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {data.map(d => (
          <div key={d.key} className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ background: MODEL_META[d.key]?.color ?? "var(--ds-cy)" }}
            />
            <span className="font-jet text-[9px] text-ds-muted">{MODEL_META[d.key]?.label}</span>
            <span className="font-jet text-[9px] text-ds-dim">{(d.weight * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </Panel>
  )
}
