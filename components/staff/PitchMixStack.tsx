"use client"

import { StackBars } from "@/components/diamond/StackBars"
import { Panel } from "@/components/diamond/Panel"
import type { Pitcher } from "@/lib/types"

interface Props {
  pitchers: Pitcher[]
}

export function PitchMixStack({ pitchers }: Props) {
  const data = pitchers.slice(0, 6).map(p => {
    const kRate = p.firstInning.kRate
    const breakBonus = Math.max(0, (kRate - 0.20) * 2)
    const fb = Math.round(Math.max(30, 46 - breakBonus * 15))
    const sl = Math.round(Math.min(35, 22 + breakBonus * 10))
    const cb = Math.round(Math.min(20, 13 + breakBonus * 5))
    const ch = Math.round(Math.max(5, 100 - fb - sl - cb))
    return {
      name: p.name.split(" ").pop() ?? p.name,
      role: p.firstInning.startCount > 3 ? "SP" : "RP",
      fb,
      sl,
      cb,
      ch,
      ip: p.overall.innings.toFixed(0),
    }
  })

  return (
    <Panel title="Staff Pitch Mix" chip="IP-weighted estimate">
      <p className="font-jet text-[10px] text-ds-warn uppercase tracking-[0.12em] mb-3">
        ⚠ Pitch breakdown estimated — Statcast unavailable via free API
      </p>
      <StackBars data={data} />
    </Panel>
  )
}
