import { KpiCard } from "@/components/diamond/KpiCard"
import type { Team } from "@/lib/types"

interface Props {
  team: Team
  pitcherCount?: number
}

export function TeamBand({ team, pitcherCount }: Props) {
  const fi = team.firstInning
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiCard
        metric="Team YRFI Rate"
        value={`${(fi.yrfiRate * 100).toFixed(1)}%`}
        delta="first-inning offense"
        deltaPositive={fi.yrfiRate < 0.42}
        variant="cy"
      />
      <KpiCard
        metric="Offense Factor"
        value={fi.offenseFactor.toFixed(3)}
        delta={fi.offenseFactor > 1.05 ? "Above avg lineup" : "Below avg lineup"}
        deltaPositive={fi.offenseFactor > 1.0}
        variant="gr"
      />
      <KpiCard
        metric="OPS"
        value={fi.ops.toFixed(3)}
        delta="batting line"
        deltaPositive={fi.ops >= 0.720}
        variant="bl"
      />
      <KpiCard
        metric="K Rate"
        value={`${(fi.kRate * 100).toFixed(1)}%`}
        delta={pitcherCount ? `${pitcherCount} pitchers` : "team avg"}
        deltaPositive={fi.kRate < 0.22}
        variant="tl"
      />
    </div>
  )
}
