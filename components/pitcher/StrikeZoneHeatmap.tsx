"use client"

import { HfZone } from "@/components/diamond/HfZone"
import { Panel } from "@/components/diamond/Panel"

interface Props {
  /** 25 whiff% values, row-major top-left to bottom-right */
  values?: number[]
  kRate: number
}

function estimateZone(kRate: number): number[] {
  const base = kRate * 0.9
  return [
    0.05, 0.12, 0.15, 0.12, 0.05,
    0.14, 0.28, 0.36, 0.29, 0.13,
    0.18, 0.38, base, 0.37, 0.17,
    0.15, 0.27, 0.33, 0.26, 0.14,
    0.06, 0.11, 0.14, 0.10, 0.05,
  ]
}

export function StrikeZoneHeatmap({ values, kRate }: Props) {
  const data = values ?? estimateZone(kRate)
  return (
    <Panel title="Strike Zone Whiff%" chip={values ? "Statcast" : "Est."} className="h-full">
      {!values && (
        <p className="font-jet text-[10px] text-ds-warn uppercase tracking-[0.12em] mb-3">
          ⚠ Estimated from K rate — Statcast unavailable
        </p>
      )}
      <HfZone
        values={data}
        caption="Whiff rate by zone location"
        maxValue={Math.max(...data)}
      />
    </Panel>
  )
}
