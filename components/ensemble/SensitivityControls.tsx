"use client"

import { useEffect, useRef, useState } from "react"
import { Panel } from "@/components/diamond/Panel"
import { Slider } from "@/components/ui/slider"
import type { SensitivityAdjustments } from "@/lib/types"

interface Props {
  defaults?: Partial<SensitivityAdjustments>
  onResult: (adj: SensitivityAdjustments) => void
  isComputing?: boolean
}

const DEFAULT_ADJ: SensitivityAdjustments = {
  windSpeedDelta: 0,
  temperatureDelta: 0,
  umpireNrfiFactor: 0,
  sampleSizeMultiplier: 1,
}

export function SensitivityControls({ defaults, onResult, isComputing }: Props) {
  const [adj, setAdj] = useState<SensitivityAdjustments>({ ...DEFAULT_ADJ, ...defaults })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const update = (partial: Partial<SensitivityAdjustments>) => {
    const next = { ...adj, ...partial }
    setAdj(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onResult(next), 300)
  }

  // Emit defaults on mount; clean up debounce timer on unmount
  useEffect(() => {
    onResult({ ...DEFAULT_ADJ, ...defaults })
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reset = () => {
    const base = { ...DEFAULT_ADJ, ...defaults }
    setAdj(base)
    onResult(base)
  }

  return (
    <Panel title="Sensitivity Controls" chip={isComputing ? "Computing…" : "Debounced 300ms"}>
      <div className="space-y-5 mt-1">
        {/* Wind Speed */}
        <div>
          <div className="flex justify-between mb-1.5">
            <span className="font-jet text-[10px] uppercase tracking-[0.15em] text-ds-muted">Wind Speed Δ</span>
            <span className="font-jet text-[11px] font-semibold" style={{ color: adj.windSpeedDelta !== 0 ? "var(--ds-cy)" : "var(--ds-dim)" }}>
              {adj.windSpeedDelta >= 0 ? "+" : ""}{adj.windSpeedDelta} mph
            </span>
          </div>
          <Slider
            min={-15}
            max={15}
            step={1}
            value={[adj.windSpeedDelta]}
            onValueChange={([v]: number[]) => update({ windSpeedDelta: v })}
          />
          <div className="flex justify-between mt-0.5">
            <span className="font-jet text-[8px] text-ds-dim">−15 mph</span>
            <span className="font-jet text-[8px] text-ds-dim">+15 mph</span>
          </div>
        </div>

        {/* Temperature */}
        <div>
          <div className="flex justify-between mb-1.5">
            <span className="font-jet text-[10px] uppercase tracking-[0.15em] text-ds-muted">Temperature Δ</span>
            <span className="font-jet text-[11px] font-semibold" style={{ color: adj.temperatureDelta !== 0 ? "var(--ds-cy)" : "var(--ds-dim)" }}>
              {adj.temperatureDelta >= 0 ? "+" : ""}{adj.temperatureDelta}°F
            </span>
          </div>
          <Slider
            min={-20}
            max={20}
            step={1}
            value={[adj.temperatureDelta]}
            onValueChange={([v]: number[]) => update({ temperatureDelta: v })}
          />
          <div className="flex justify-between mt-0.5">
            <span className="font-jet text-[8px] text-ds-dim">−20°F</span>
            <span className="font-jet text-[8px] text-ds-dim">+20°F</span>
          </div>
        </div>

        {/* Umpire Zone */}
        <div>
          <div className="flex justify-between mb-1.5">
            <span className="font-jet text-[10px] uppercase tracking-[0.15em] text-ds-muted">Umpire Zone</span>
            <span className="font-jet text-[11px] font-semibold" style={{ color: adj.umpireNrfiFactor !== 0 ? "var(--ds-cy)" : "var(--ds-dim)" }}>
              {adj.umpireNrfiFactor >= 0 ? "+" : ""}{adj.umpireNrfiFactor.toFixed(2)}
            </span>
          </div>
          <Slider
            min={-0.5}
            max={0.5}
            step={0.05}
            value={[adj.umpireNrfiFactor]}
            onValueChange={([v]: number[]) => update({ umpireNrfiFactor: Math.round(v * 20) / 20 })}
          />
          <div className="flex justify-between mt-0.5">
            <span className="font-jet text-[8px] text-ds-dim">Pitcher-friendly</span>
            <span className="font-jet text-[8px] text-ds-dim">Batter-friendly</span>
          </div>
        </div>

        {/* Sample Size Multiplier */}
        <div>
          <div className="flex justify-between mb-1.5">
            <span className="font-jet text-[10px] uppercase tracking-[0.15em] text-ds-muted">Sample Weight</span>
            <span className="font-jet text-[11px] font-semibold" style={{ color: adj.sampleSizeMultiplier !== 1 ? "var(--ds-cy)" : "var(--ds-dim)" }}>
              {adj.sampleSizeMultiplier.toFixed(1)}×
            </span>
          </div>
          <Slider
            min={0.5}
            max={2.0}
            step={0.1}
            value={[adj.sampleSizeMultiplier]}
            onValueChange={([v]: number[]) => update({ sampleSizeMultiplier: Math.round(v * 10) / 10 })}
          />
          <div className="flex justify-between mt-0.5">
            <span className="font-jet text-[8px] text-ds-dim">0.5× (less data)</span>
            <span className="font-jet text-[8px] text-ds-dim">2.0× (more data)</span>
          </div>
        </div>

        <button
          onClick={reset}
          className="ds-chip w-full text-center mt-1"
        >
          Reset to Defaults
        </button>
      </div>
    </Panel>
  )
}
