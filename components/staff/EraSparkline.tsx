"use client"

import { HfSpark } from "@/components/diamond/HfSpark"
import { Panel } from "@/components/diamond/Panel"
import type { Pitcher } from "@/lib/types"

interface Props {
  pitchers: Pitcher[]
}

export function EraSparkline({ pitchers }: Props) {
  // Build rolling ERA trend from last5RunsAllowed across the staff
  const spPitchers = pitchers.slice(0, 5)
  const data = Array.from({ length: 5 }, (_, i) => {
    const spRuns = spPitchers.reduce((sum, p) => sum + (p.firstInning.last5RunsAllowed[i] ?? p.firstInning.avgRunsAllowed), 0)
    const spEra  = spPitchers.length > 0 ? (spRuns / spPitchers.length) * 9 : 4.0
    return {
      name: `GS-${5 - i}`,
      value: spEra,
      value2: spEra * 1.1, // RP estimate slightly higher
    }
  })

  return (
    <Panel title="Staff ERA Trend" chip="Last 5 starts avg">
      <HfSpark
        data={data}
        label="SP ERA"
        label2="RP ERA (est.)"
        height={180}
        showGrid
      />
    </Panel>
  )
}
