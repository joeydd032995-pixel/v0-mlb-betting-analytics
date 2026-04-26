// app/staff/[teamId]/page.tsx — Server Component

import { SectionLabel } from "@/components/diamond/SectionLabel"
import { TeamBand } from "@/components/staff/TeamBand"
import { EraSparkline } from "@/components/staff/EraSparkline"
import { WorkloadDonuts } from "@/components/staff/WorkloadDonuts"
import { RosterGrid } from "@/components/staff/RosterGrid"
import { PitchMixStack } from "@/components/staff/PitchMixStack"
import { mockTeams, mockPitchers } from "@/lib/mock-data"
import Link from "next/link"

interface PageProps {
  params: Promise<{ teamId: string }>
}

export default async function StaffPage({ params }: PageProps) {
  const { teamId } = await params

  // Use mock data as the canonical data source
  // (real MLB Stats API team pitching roster is not available via free endpoints)
  const team = mockTeams.get(teamId)
  const allPitchers = Array.from(mockPitchers.values()).filter(p => p.teamId === teamId)

  // Fetch live predictions to pick up actual pitchers for today's games
  let livePitchers = allPitchers
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/predictions`, {
      next: { revalidate: 300 },
    })
    if (res.ok) {
      const data = await res.json()
      const pitchersById: Record<string, unknown> = data.pitchersById ?? {}
      const teamPitchers = Object.values(pitchersById).filter(
        (p: unknown) => (p as { teamId?: string }).teamId === teamId
      ) as typeof allPitchers
      if (teamPitchers.length > 0) livePitchers = teamPitchers
    }
  } catch {
    // Fall through to mock data
  }

  if (!team && livePitchers.length === 0) {
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
            <TeamBand team={team} pitcherCount={livePitchers.length} />
          </>
        )}

        <SectionLabel index="02">Staff Analytics</SectionLabel>
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <EraSparkline pitchers={livePitchers} />
          <WorkloadDonuts pitchers={livePitchers} />
        </div>

        {livePitchers.length > 0 && (
          <>
            <SectionLabel index="03">Pitching Staff</SectionLabel>
            <RosterGrid pitchers={livePitchers} />

            <SectionLabel index="04">Pitch Mix</SectionLabel>
            <PitchMixStack pitchers={livePitchers} />
          </>
        )}
      </main>
    </div>
  )
}
