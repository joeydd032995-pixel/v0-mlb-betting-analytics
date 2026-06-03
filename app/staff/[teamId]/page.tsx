// app/staff/[teamId]/page.tsx — Server Component

import { SectionLabel } from "@/components/diamond/SectionLabel"
import { TeamBand } from "@/components/staff/TeamBand"
import { EraSparkline } from "@/components/staff/EraSparkline"
import { WorkloadDonuts } from "@/components/staff/WorkloadDonuts"
import { RosterGrid } from "@/components/staff/RosterGrid"
import { PitchMixStack } from "@/components/staff/PitchMixStack"
import { fetchTeamPitchers, fetchPitcherStats } from "@/lib/api/mlb-stats"
import { fetchStatcastPitcher } from "@/lib/api/statcast"
import { buildPitcherFromStats } from "@/lib/pitcher/build-pitcher"
import { MLB_TEAMS, type MLBTeamInfo } from "@/lib/constants/mlb-teams"
import { mockTeams, mockPitchers } from "@/lib/mock-data"
import type { Pitcher, StatcastPitchType, Team, TeamFirstInningStats } from "@/lib/types"
import Link from "next/link"

// Reads the live MLB roster + Statcast cache per request.
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ teamId: string }>
}

// Neutral league-average first-inning offense profile, used to render TeamBand
// for teams not in the (6-team) mock set. Team-level offensive splits aren't
// available from the free API, so this is intentionally generic.
const LEAGUE_AVG_FIRST_INNING: TeamFirstInningStats = {
  runsPerGame: 0.52, offenseFactor: 1.0, ops: 0.715, woba: 0.312,
  kRate: 0.227, bbRate: 0.084, yrfiRate: 0.484, homeYrfiRate: 0.49,
  awayYrfiRate: 0.478, last10YrfiRate: 0.484, avgRunsVsRHP: 0.52, avgRunsVsLHP: 0.5,
}

function synthTeam(meta: MLBTeamInfo): Team {
  return {
    id: meta.id,
    name: meta.name,
    abbreviation: meta.abbreviation,
    city: meta.city,
    league: meta.league,
    division: meta.division,
    primaryColor: meta.primaryColor,
    firstInning: LEAGUE_AVG_FIRST_INNING,
  }
}

interface StaffData {
  team: Team | undefined
  pitchers: Pitcher[]
  arsenals: Record<string, StatcastPitchType[]>
}

/**
 * Build the team's pitching staff from the live MLB roster (real MLBAM ids) →
 * per-pitcher season stats + Statcast, so every staff card renders real data
 * and the Pitch Mix card resolves to Statcast. Falls back to the legacy mock
 * roster only when the team is unknown or the roster fetch fails.
 */
async function loadStaff(teamId: string): Promise<StaffData> {
  const meta = MLB_TEAMS[teamId]
  const team = mockTeams.get(teamId) ?? (meta ? synthTeam(meta) : undefined)

  const mockFallback = (): StaffData => ({
    team,
    pitchers: Array.from(mockPitchers.values()).filter((p) => p.teamId === teamId),
    arsenals: {},
  })

  if (!meta?.apiId) return mockFallback()

  const roster = await fetchTeamPitchers(meta.apiId).catch(() => [])
  if (roster.length === 0) return mockFallback()

  const built = await Promise.all(
    roster.map(async ({ id }) => {
      const [stats, sc] = await Promise.all([
        fetchPitcherStats(Number(id)).catch(() => null),
        fetchStatcastPitcher(id).catch(() => null),
      ])
      if (!stats) return null
      return { pitcher: buildPitcherFromStats(id, stats, [], teamId), pitchMix: sc?.pitchMix }
    })
  )

  const pitchers: Pitcher[] = []
  const arsenals: Record<string, StatcastPitchType[]> = {}
  for (const b of built) {
    if (!b) continue
    pitchers.push(b.pitcher)
    if (b.pitchMix && b.pitchMix.length > 0) arsenals[b.pitcher.id] = b.pitchMix
  }
  // Workhorses first — the cards slice the top 5–6.
  pitchers.sort((a, b) => b.overall.innings - a.overall.innings)

  return pitchers.length > 0 ? { team, pitchers, arsenals } : mockFallback()
}

export default async function StaffPage({ params }: PageProps) {
  const { teamId } = await params
  const { team, pitchers, arsenals } = await loadStaff(teamId)

  if (!team && pitchers.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--ds-bg)" }}>
        <div className="text-center space-y-3">
          <p className="font-display text-[20px] font-semibold text-ds-ink">Team Not Found</p>
          <p className="font-jet text-[12px] text-ds-muted">No data for team ID: {teamId}</p>
          <Link href="/staff" className="ds-chip ds-chip-active inline-block mt-2">← All Teams</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--ds-bg)" }}>
      <main className="mx-auto max-w-[1480px] px-7 py-7 space-y-6">
        <Link href="/staff" className="font-jet text-[11px] uppercase tracking-[0.2em] text-ds-muted hover:text-ds-cy transition-colors">
          ← All Teams
        </Link>

        {team && (
          <>
            <SectionLabel index="01">Team Overview · {team.name}</SectionLabel>
            <TeamBand team={team} pitcherCount={pitchers.length} />
          </>
        )}

        <SectionLabel index="02">Staff Analytics</SectionLabel>
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <EraSparkline pitchers={pitchers} />
          <WorkloadDonuts pitchers={pitchers} />
        </div>

        {pitchers.length > 0 && (
          <>
            <SectionLabel index="03">Pitching Staff</SectionLabel>
            <RosterGrid pitchers={pitchers} />

            <SectionLabel index="04">Pitch Mix</SectionLabel>
            <PitchMixStack pitchers={pitchers} arsenals={arsenals} />
          </>
        )}
      </main>
    </div>
  )
}
