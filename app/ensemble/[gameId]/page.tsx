// app/ensemble/[gameId]/page.tsx — Server Component

import { SectionLabel } from "@/components/diamond/SectionLabel"
import { EnsembleDeepDive } from "@/components/ensemble/EnsembleDeepDive"
import { computeNRFIPrediction } from "@/lib/nrfi-engine"
import { computeMarkovStateSnapshot } from "@/lib/nrfi-models"
import { getLiveGameSlate } from "@/lib/api/live-data"
import { mockGames, mockTeams, mockPitchers } from "@/lib/mock-data"
import Link from "next/link"

interface PageProps {
  params: Promise<{ gameId: string }>
}

export const revalidate = 300

export default async function EnsemblePage({ params }: PageProps) {
  const { gameId } = await params

  // 1. Try mock data first (dev / fallback)
  let game = mockGames.find(g => g.id === gameId)
  let pitchers = mockPitchers
  let teams = mockTeams

  // 2. If not in mock data, call getLiveGameSlate directly (no HTTP self-fetch)
  if (!game) {
    try {
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
      const live = await getLiveGameSlate(date)
      const liveGame = live.games.find(g => g.id === gameId)
      if (liveGame) {
        game = liveGame
        pitchers = live.pitchers
        teams = live.teams
      }
    } catch {
      // fall through to "not found"
    }
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--ds-bg)" }}>
        <div className="text-center space-y-3">
          <p className="font-display text-[20px] font-semibold text-ds-ink">Game Not Found</p>
          <p className="font-jet text-[12px] text-ds-muted">No data for game ID: {gameId}</p>
          <Link href="/" className="ds-chip ds-chip-active inline-block mt-2">← Today&apos;s Games</Link>
        </div>
      </div>
    )
  }

  // 3. Compute NRFI prediction server-side
  const prediction = computeNRFIPrediction(game, pitchers, teams)

  if (!prediction) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--ds-bg)" }}>
        <div className="text-center space-y-3">
          <p className="font-display text-[20px] font-semibold text-ds-ink">Prediction Unavailable</p>
          <p className="font-jet text-[12px] text-ds-muted">Could not compute prediction for: {gameId}</p>
          <Link href="/" className="ds-chip ds-chip-active inline-block mt-2">← Today&apos;s Games</Link>
        </div>
      </div>
    )
  }

  // 4. Compute Markov state snapshot server-side using PA outcomes from engine
  const homePA = prediction.modelBreakdown?.homeHalfInning?.paOutcomes
  const awayPA = prediction.modelBreakdown?.awayHalfInning?.paOutcomes

  // PAOutcomes (nrfi-models) uses { out, walk, single, double, triple, hr }
  // HalfInningModelBreakdown.paOutcomes uses { outProb, walkProb, ... } — map between them
  const defaultPA = {
    out: 0.70, walk: 0.08, single: 0.12, double: 0.05, triple: 0.005, hr: 0.045,
  }

  const toMarkovPA = (src: { outProb: number; walkProb: number; singleProb: number; doubleProb: number; tripleProb: number; hrProb: number }) => ({
    out: src.outProb, walk: src.walkProb, single: src.singleProb,
    double: src.doubleProb, triple: src.tripleProb, hr: src.hrProb,
  })

  const snapshotPA =
    homePA && awayPA
      ? {
          out:    (homePA.outProb    + awayPA.outProb)    / 2,
          walk:   (homePA.walkProb   + awayPA.walkProb)   / 2,
          single: (homePA.singleProb + awayPA.singleProb) / 2,
          double: (homePA.doubleProb + awayPA.doubleProb) / 2,
          triple: (homePA.tripleProb + awayPA.tripleProb) / 2,
          hr:     (homePA.hrProb     + awayPA.hrProb)     / 2,
        }
      : homePA ? toMarkovPA(homePA) : awayPA ? toMarkovPA(awayPA) : defaultPA

  const markovSnapshot = computeMarkovStateSnapshot(snapshotPA)

  // 5. Resolve team names for labels
  const homeTeam = teams.get(game.homeTeamId)
  const awayTeam = teams.get(game.awayTeamId)
  const homeLabel = homeTeam?.abbreviation ?? game.homeTeamId.toUpperCase()
  const awayLabel = awayTeam?.abbreviation ?? game.awayTeamId.toUpperCase()

  // Serialize pitchers/teams for client-side recomputeWithAdjustments
  // (Maps are not serializable across the Server→Client boundary)
  const pitchersRecord = Object.fromEntries(pitchers)
  const teamsRecord = Object.fromEntries(teams)

  return (
    <div className="min-h-screen" style={{ background: "var(--ds-bg)" }}>
      <main className="mx-auto max-w-[1480px] px-7 py-7 space-y-6">
        <Link
          href="/"
          className="font-jet text-[11px] uppercase tracking-[0.2em] text-ds-muted hover:text-ds-cy transition-colors"
        >
          ← Today&apos;s Games
        </Link>

        <SectionLabel index="01">
          Ensemble Deep Dive · {awayLabel} @ {homeLabel} · {game.venue}
        </SectionLabel>

        <EnsembleDeepDive
          initialPrediction={prediction}
          initialSnapshot={markovSnapshot}
          game={game}
          pitchersRecord={pitchersRecord}
          teamsRecord={teamsRecord}
          homeLabel={homeLabel}
          awayLabel={awayLabel}
        />
      </main>
    </div>
  )
}
