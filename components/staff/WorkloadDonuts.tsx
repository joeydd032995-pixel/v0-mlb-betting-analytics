"use client"

import { HfDonut } from "@/components/diamond/HfDonut"
import { Panel } from "@/components/diamond/Panel"
import type { Pitcher } from "@/lib/types"

interface Props {
  pitchers: Pitcher[]
}

export function WorkloadDonuts({ pitchers }: Props) {
  const total = pitchers.reduce((s, p) => s + p.overall.innings, 0)
  const spInnings = pitchers.filter(p => p.firstInning.startCount > 3).reduce((s, p) => s + p.overall.innings, 0)
  const rpInnings = total - spInnings
  const spFrac = total > 0 ? spInnings / total : 0.65
  const rpFrac = 1 - spFrac

  return (
    <Panel title="Workload Split" chip="Innings pitched">
      <div className="grid grid-cols-2 gap-4 mt-2">
        <div className="flex flex-col items-center gap-2">
          <HfDonut
            value={spFrac}
            label={`${(spFrac * 100).toFixed(0)}%`}
            sublabel="Starters"
            size={120}
            color="var(--ds-cy)"
          />
          <span className="font-jet text-[10px] uppercase tracking-[0.18em] text-ds-muted mt-1">
            {spInnings.toFixed(0)} IP
          </span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <HfDonut
            value={rpFrac}
            label={`${(rpFrac * 100).toFixed(0)}%`}
            sublabel="Bullpen"
            size={120}
            color="var(--ds-gr)"
          />
          <span className="font-jet text-[10px] uppercase tracking-[0.18em] text-ds-muted mt-1">
            {rpInnings.toFixed(0)} IP
          </span>
        </div>
      </div>
    </Panel>
  )
}
