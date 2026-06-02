"use client"

import { StackBars } from "@/components/diamond/StackBars"
import { Panel } from "@/components/diamond/Panel"
import { foldArsenalToBuckets } from "@/lib/pitcher/pitch-mix-display"
import type { Pitcher, StatcastPitchType } from "@/lib/types"

interface Props {
  pitchers: Pitcher[]
  /** Real Statcast arsenals keyed by pitcher id; pitchers without an entry fall back to a K%-based estimate. */
  arsenals?: Record<string, StatcastPitchType[]>
}

/** K%-driven fallback split used when a pitcher has no Statcast arsenal cached. */
function estimateBuckets(kRate: number) {
  const breakBonus = Math.max(0, (kRate - 0.20) * 2)
  const fb = Math.round(Math.max(30, 46 - breakBonus * 15))
  const sl = Math.round(Math.min(35, 22 + breakBonus * 10))
  const cb = Math.round(Math.min(20, 13 + breakBonus * 5))
  const ch = Math.round(Math.max(5, 100 - fb - sl - cb))
  return { fb, sl, cb, ch }
}

export function PitchMixStack({ pitchers, arsenals }: Props) {
  let anyReal = false
  const data = pitchers.slice(0, 6).map(p => {
    const arsenal = arsenals?.[p.id]
    let buckets
    if (arsenal && arsenal.length > 0) {
      anyReal = true
      buckets = foldArsenalToBuckets(arsenal)
    } else {
      buckets = estimateBuckets(p.firstInning.kRate)
    }
    return {
      name: p.name.split(" ").pop() ?? p.name,
      role: p.firstInning.startCount > 3 ? "SP" : "RP",
      ...buckets,
      ip: p.overall.innings.toFixed(0),
    }
  })

  return (
    <Panel title="Staff Pitch Mix" chip={anyReal ? "Statcast" : "IP-weighted estimate"}>
      {!anyReal && (
        <p className="font-jet text-[10px] text-ds-warn uppercase tracking-[0.12em] mb-3">
          ⚠ Pitch breakdown estimated — Statcast unavailable via free API
        </p>
      )}
      <StackBars data={data} />
    </Panel>
  )
}
