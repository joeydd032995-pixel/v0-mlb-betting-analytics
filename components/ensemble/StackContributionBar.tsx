"use client"

/**
 * StackContributionBar — horizontal stacked bar showing the renormalised
 * weights of the 9-model stacker (ensemble7 / DeepNRFI / MonteCarlo).
 * Renders nothing for v1 predictions where ensembleWeights is undefined.
 */

import { Layers } from "lucide-react"

interface StackContributionBarProps {
  ensembleVersion?: "v1.7models" | "v2.9models"
  ensembleWeights?: Record<string, number>
}

interface Segment {
  key: string
  label: string
  color: string
}

const SEGMENTS: Segment[] = [
  { key: "ensemble7",  label: "7-Model",  color: "#0ea5e9" },  // sky-500
  { key: "deepNrfi",   label: "DeepNRFI", color: "#a78bfa" },  // violet-400
  { key: "monteCarlo", label: "MC",       color: "#6366f1" },  // indigo-500
]

export function StackContributionBar({ ensembleVersion, ensembleWeights }: StackContributionBarProps) {
  if (ensembleVersion !== "v2.9models" || !ensembleWeights) return null

  const total = SEGMENTS.reduce((s, seg) => s + (ensembleWeights[seg.key] ?? 0), 0)
  if (total <= 0) return null

  return (
    <div className="mt-3 rounded-md border border-fuchsia-500/20 bg-fuchsia-500/5 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-fuchsia-300">
        <Layers className="h-3.5 w-3.5" />
        Ensemble++ · final blend
      </p>

      <div className="flex h-3 w-full overflow-hidden rounded">
        {SEGMENTS.map((seg) => {
          const w = ensembleWeights[seg.key] ?? 0
          if (w <= 0) return null
          return (
            <div
              key={seg.key}
              className="h-full"
              style={{ width: `${(w / total) * 100}%`, background: seg.color }}
              title={`${seg.label}: ${(w * 100).toFixed(1)}%`}
            />
          )
        })}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
        {SEGMENTS.map((seg) => {
          const w = ensembleWeights[seg.key] ?? 0
          return (
            <div key={seg.key} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: seg.color }} />
              <span className="text-muted-foreground">{seg.label}</span>
              <span className="ml-auto font-semibold text-fuchsia-200">
                {(w * 100).toFixed(1)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
