"use client"

import { HfSpark } from "@/components/diamond/HfSpark"
import { Panel } from "@/components/diamond/Panel"
import type { Pitcher } from "@/lib/types"

interface Props {
  pitcher: Pitcher
}

export function RollingTrend({ pitcher }: Props) {
  const fi = pitcher.firstInning
  // Build a rolling trend from last5RunsAllowed (recent → older)
  const data = fi.last5RunsAllowed
    .slice()
    .reverse()
    .map((runs, i) => ({
      name: `GS-${fi.last5RunsAllowed.length - i}`,
      value: fi.era + (runs - fi.avgRunsAllowed) * 0.5,
      value2: fi.kRate * 9 + (runs === 0 ? 0.4 : -0.3),
    }))

  return (
    <Panel title="Rolling Trend" chip="Last 5 starts">
      {data.length > 0 ? (
        <HfSpark
          data={data}
          label="ERA (est.)"
          label2="K/9 (est.)"
          height={180}
          showGrid
        />
      ) : (
        <p className="font-jet text-[12px] text-ds-muted text-center py-8">
          Insufficient data for trend chart
        </p>
      )}
    </Panel>
  )
}
