// app/pitcher/[playerId]/page.tsx — Server Component
// Fetches pitcher data and renders the full deep-dive view.

import { SectionLabel } from "@/components/diamond/SectionLabel"
import { PitcherHero } from "@/components/pitcher/PitcherHero"
import { PitchMixDonut } from "@/components/pitcher/PitchMixDonut"
import { StrikeZoneHeatmap } from "@/components/pitcher/StrikeZoneHeatmap"
import { SituationalRadar } from "@/components/pitcher/SituationalRadar"
import { RollingTrend } from "@/components/pitcher/RollingTrend"
import { GameLogGrid } from "@/components/pitcher/GameLogGrid"
import { fetchPitcherStats, fetchPitcherLast5FirstInnings } from "@/lib/api/mlb-stats"
import { fetchStatcastPitcher } from "@/lib/api/statcast"
import { toPitchEntries } from "@/lib/pitcher/pitch-mix-display"
import { buildPitcherFromStats } from "@/lib/pitcher/build-pitcher"
import type { Pitcher } from "@/lib/types"
import Link from "next/link"

interface PageProps {
  params: Promise<{ playerId: string }>
}

export default async function PitcherPage({ params }: PageProps) {
  const { playerId } = await params
  const numericId = parseInt(playerId, 10)

  if (isNaN(numericId)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--ds-bg)" }}>
        <p className="font-jet text-ds-bad">Invalid player ID: {playerId}</p>
      </div>
    )
  }

  // Fetch data (free MLB Stats API — may return null if not found).
  // Statcast pitch-mix/zone come from the pitcher_statcast cache (pybaseball
  // backfill); null when absent, so the panels fall back to estimates.
  const [apiStats, last5, statcast] = await Promise.all([
    fetchPitcherStats(numericId).catch(() => null),
    fetchPitcherLast5FirstInnings(numericId).catch(() => []),
    fetchStatcastPitcher(String(numericId)).catch(() => null),
  ])

  // Build a Pitcher object from API stats (or show no-data state)
  const pitcher: Pitcher | null = apiStats
    ? buildPitcherFromStats(String(numericId), apiStats, last5)
    : null

  return (
    <div className="min-h-screen" style={{ background: "var(--ds-bg)" }}>
      <main className="mx-auto max-w-[1480px] px-7 py-7 space-y-6">

        {/* Back link */}
        <Link
          href="/pitcher"
          className="font-jet text-[11px] uppercase tracking-[0.2em] text-ds-muted hover:text-ds-cy transition-colors"
        >
          ← All Pitchers
        </Link>

        {pitcher ? (
          <>
            <SectionLabel index="01">Player Snapshot</SectionLabel>
            <PitcherHero pitcher={pitcher} />

            <SectionLabel index="02">Quality of Stuff</SectionLabel>
            <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <PitchMixDonut
                kRate={pitcher.firstInning.kRate}
                pitches={statcast?.pitchMix?.length ? toPitchEntries(statcast.pitchMix) : undefined}
              />
              <StrikeZoneHeatmap kRate={pitcher.firstInning.kRate} values={statcast?.zoneWhiff} />
              <SituationalRadar pitcher={pitcher} />
            </div>

            <SectionLabel index="03">Situation &amp; Trend</SectionLabel>
            <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <RollingTrend pitcher={pitcher} />
              <GameLogGrid pitcher={pitcher} />
            </div>
          </>
        ) : (
          <div
            className="rounded-xl border border-ds-line p-12 text-center space-y-2"
            style={{ background: "var(--ds-panel)" }}
          >
            <p className="font-display text-[18px] font-semibold text-ds-ink">Pitcher Not Found</p>
            <p className="font-jet text-[12px] text-ds-muted">
              No data available for player ID {playerId}. The pitcher may not be active in 2026.
            </p>
            <Link
              href="/pitcher"
              className="inline-block mt-4 ds-chip ds-chip-active"
            >
              ← Back to Pitcher List
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
