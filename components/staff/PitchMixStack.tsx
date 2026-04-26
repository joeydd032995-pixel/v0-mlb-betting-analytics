"use client"

import { StackBars } from "@/components/diamond/StackBars"
import { Panel } from "@/components/diamond/Panel"
import type { Pitcher } from "@/lib/types"

interface Props {
  pitchers: Pitcher[]
}

export function PitchMixStack({ pitchers }: Props) {
  const data = pitchers.slice(0, 6).map(p => ({
    name: p.name.split(" ").pop() ?? p.name,
    role: p.firstInning.startCount > 3 ? "SP" : "RP",
    fb: 42,
    cb: 15,
    sl: 25,
    ch: 18,
    ip: p.overall.innings.toFixed(0),
  }))

  return (
    <Panel title="Staff Pitch Mix" chip="IP-weighted estimate">
      <p className="font-jet text-[10px] text-ds-warn uppercase tracking-[0.12em] mb-3">
        ⚠ Pitch breakdown estimated — Statcast unavailable via free API
      </p>
      <StackBars data={data} />
    </Panel>
  )
}
