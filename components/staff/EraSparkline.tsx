"use client"

import { HfSpark } from "@/components/diamond/HfSpark"
import { Panel } from "@/components/diamond/Panel"
import type { Pitcher } from "@/lib/types"

interface Props {
  pitchers: Pitcher[]
}

export function EraSparkline({ pitchers }: Props) {
  // Build rolling ERA trend from last5RunsAllowed across the staff
  // last5RunsAllowed is newest-first; reverse so chart reads oldest→newest
  const spPitchers = pitchers.slice(0, 5)
  const data = Array.from({ length: 5 }, (_, i) => {
    const revIdx = 4 - i  // convert oldest-first index to newest-first array index
    const spRuns = spPitchers.reduce((sum, p) => sum + (p.firstInning.last5RunsAllowed[revIdx] ?? p.firstInning.avgRunsAllowed), 0)
    const spEra  = spPitchers.length > 0 ? (spRuns / spPitchers.length) * 9 : 4.0
    return {
      name: `GS-${5 - i}`,
      value: spEra,
    }
  })

  return (
    <Panel title="Staff ERA Trend" chip="Last 5 starts avg">
      <HfSpark
        data={data}
        label="SP ERA (1st inn)"
        height={180}
        showGrid
      />
    </Panel>
  )
}
