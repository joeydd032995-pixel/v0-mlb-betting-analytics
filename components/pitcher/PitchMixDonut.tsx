"use client"

import { HfDonut } from "@/components/diamond/HfDonut"
import { Panel } from "@/components/diamond/Panel"

interface PitchEntry {
  name: string
  usage: number    // 0–1
  velocityMph?: number
  color: string
}

interface Props {
  pitches?: PitchEntry[]
  kRate: number
}

const ESTIMATED_PITCHES = (kRate: number): PitchEntry[] => [
  { name: "Four-Seam FB", usage: 0.42, velocityMph: 94.2, color: "var(--ds-cy)"  },
  { name: "Slider",       usage: 0.25, velocityMph: 86.5, color: "var(--ds-bl)"  },
  { name: "Changeup",     usage: 0.18, velocityMph: 83.1, color: "var(--ds-gr)"  },
  { name: "Curveball",    usage: 0.15, velocityMph: 78.8, color: "var(--ds-warn)" },
]

export function PitchMixDonut({ pitches, kRate }: Props) {
  const data = pitches ?? ESTIMATED_PITCHES(kRate)
  const topPitch = data.reduce((a, b) => a.usage > b.usage ? a : b)

  return (
    <Panel title="Pitch Mix" chip={pitches ? "Statcast" : "Est. from K%"} className="h-full">
      {!pitches && (
        <p className="font-jet text-[10px] text-ds-warn uppercase tracking-[0.12em] mb-3">
          ⚠ Estimated — real Statcast data unavailable via free MLB API
        </p>
      )}
      <div className="flex flex-col gap-3">
        <div className="flex justify-center">
          <HfDonut
            value={topPitch.usage}
            label={`${(topPitch.usage * 100).toFixed(0)}%`}
            sublabel={topPitch.name}
            size={180}
            color={topPitch.color}
          />
        </div>
        <div className="flex flex-col gap-2">
          {data.map((p, i) => (
            <div
              key={i}
              className="grid items-center gap-3 bg-[#0a1426] border border-ds-line rounded-lg px-3 py-2"
              style={{ gridTemplateColumns: "14px 1fr auto auto" }}
            >
              <span className="w-3 h-3 rounded-[3px]" style={{ background: p.color }} />
              <span className="font-display text-[13px] font-medium text-ds-ink">{p.name}</span>
              {p.velocityMph && (
                <span className="font-jet text-[11px] text-ds-muted">{p.velocityMph.toFixed(1)}</span>
              )}
              <span className="font-jet text-[11px] font-semibold text-ds-cy">
                {(p.usage * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}
