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

  // Fetch data (free MLB Stats API — may return null if not found)
  const [apiStats, last5] = await Promise.all([
    fetchPitcherStats(numericId).catch(() => null),
    fetchPitcherLast5FirstInnings(numericId).catch(() => []),
  ])

  // Build a Pitcher object from API stats (or show no-data state)
  const pitcher: Pitcher | null = apiStats
    ? {
        id: String(numericId),
        name: apiStats.fullName,
        teamId: "unknown",
        throws: "R",
        age: 0,
        firstInning: {
          era: apiStats.era ?? 4.0,
          whip: apiStats.whip ?? 1.25,
          kRate: apiStats.gamesStarted > 0
            ? (apiStats.strikeOuts / (apiStats.gamesStarted * 3.5 || 1))
            : 0.22,
          bbRate: apiStats.gamesStarted > 0
            ? (apiStats.baseOnBalls / (apiStats.gamesStarted * 3.5 || 1))
            : 0.08,
          hrPer9: (apiStats.inningsPitched ?? 0) > 0
            ? (apiStats.homeRuns / (apiStats.inningsPitched / 9))
            : 1.0,
          babip: 0.290,
          nrfiRate: Math.exp(-(apiStats.era ?? 4.0) * 0.95 / 9),
          avgRunsAllowed: (apiStats.era ?? 4.0) / 9,
          firstBatterOBP: 0.300,
          last5Results: last5.map(r => r.nrfi),
          last5RunsAllowed: last5.map(r => r.runs ?? 0),
          startCount: apiStats.gamesStarted,
          homeNrfiRate: Math.exp(-(apiStats.era ?? 4.0) * 0.95 / 9) * 1.02,
          awayNrfiRate: Math.exp(-(apiStats.era ?? 4.0) * 0.95 / 9) * 0.98,
        },
        overall: {
          era: apiStats.era ?? 4.0,
          fip: (apiStats.era ?? 4.0) - 0.2,
          xfip: (apiStats.era ?? 4.0) + 0.1,
          whip: apiStats.whip ?? 1.25,
          kPer9: (apiStats.inningsPitched ?? 0) > 0
            ? (apiStats.strikeOuts / (apiStats.inningsPitched / 9))
            : 8.5,
          bbPer9: (apiStats.inningsPitched ?? 0) > 0
            ? (apiStats.baseOnBalls / (apiStats.inningsPitched / 9))
            : 2.8,
          innings: apiStats.inningsPitched ?? 0,
          wins: apiStats.wins ?? 0,
          losses: apiStats.losses ?? 0,
        },
      }
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
              <PitchMixDonut kRate={pitcher.firstInning.kRate} />
              <StrikeZoneHeatmap kRate={pitcher.firstInning.kRate} />
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
