import { Panel } from "@/components/diamond/Panel"
import { KpiCard } from "@/components/diamond/KpiCard"
import type { Pitcher, Team } from "@/lib/types"

interface Props {
  pitcher: Pitcher
  team?: Team
}

export function PitcherHero({ pitcher, team }: Props) {
  const initials = pitcher.name
    .split(" ")
    .map(w => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  const throws = pitcher.throws === "L" ? "LHP" : pitcher.throws === "R" ? "RHP" : "SHP"

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 2fr" }}>
      {/* Profile card */}
      <Panel title="Player" chip={team ? `${team.abbreviation} · ${throws}` : throws}>
        <div className="flex gap-4 items-center">
          {/* Initials avatar */}
          <div
            className="w-[100px] h-[100px] shrink-0 rounded-[22px] border border-ds-line grid place-items-center font-jet font-bold text-[32px] text-ds-cy"
            style={{
              background: "radial-gradient(circle at 30% 25%, #1d3457 0%, #0a1426 65%)",
              boxShadow: "inset 0 0 40px rgba(34,211,238,.15), 0 10px 40px -15px rgba(34,211,238,.3)",
            }}
          >
            {initials}
          </div>
          {/* Meta */}
          <div>
            <div className="font-display text-[30px] font-semibold tracking-[-0.02em] leading-none mb-1.5 text-ds-ink">
              {pitcher.name}
            </div>
            <div className="font-jet text-[13px] text-ds-muted">
              {throws} · Age {pitcher.age}
            </div>
            <div className="flex gap-1.5 mt-2.5 flex-wrap">
              {team && (
                <span className="ds-chip ds-chip-active">{team.name}</span>
              )}
              <span className="ds-chip">{throws}</span>
              <span className="ds-chip">Age {pitcher.age}</span>
              <span className="ds-chip">{pitcher.firstInning.startCount} GS</span>
            </div>
          </div>
        </div>
      </Panel>

      {/* KPI grid */}
      <Panel title="First-Inning KPIs" chip="2026 season">
        <div className="grid grid-cols-4 gap-2.5">
          <KpiCard
            metric="ERA (1st)"
            value={pitcher.firstInning.era.toFixed(2)}
            delta="1st inning only"
            deltaPositive={pitcher.firstInning.era < 3.0}
            variant="cy"
          />
          <KpiCard
            metric="WHIP"
            value={pitcher.firstInning.whip.toFixed(3)}
            delta={pitcher.firstInning.whip < 1.0 ? "Elite zone" : ""}
            deltaPositive={pitcher.firstInning.whip < 1.0}
            variant="gr"
          />
          <KpiCard
            metric="K Rate"
            value={`${(pitcher.firstInning.kRate * 100).toFixed(1)}%`}
            delta={pitcher.firstInning.kRate > 0.28 ? "Swing-miss ace" : ""}
            deltaPositive={pitcher.firstInning.kRate > 0.25}
            variant="bl"
          />
          <KpiCard
            metric="NRFI Rate"
            value={`${(pitcher.firstInning.nrfiRate * 100).toFixed(1)}%`}
            delta={`${pitcher.firstInning.startCount} starts`}
            deltaPositive={pitcher.firstInning.nrfiRate > 0.65}
            variant="tl"
          />
        </div>
      </Panel>
    </div>
  )
}
