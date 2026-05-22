/**
 * GET /api/monte-carlo?gameId=...&nSims=...
 *
 * Returns the Monte Carlo first-inning run distribution for a single game.
 *
 * Two paths:
 *   1. If ENABLE_MONTECARLO is on, the engine has already simulated and
 *      persisted the result on `ModelPrediction.monteCarloDistribution`.
 *      We just read it.
 *   2. Otherwise (or when the persisted row is older than the requested
 *      nSims), we re-simulate on the fly.  Server-side compute caps nSims
 *      at MAX_SIMS (100k) inside the simulator.
 *
 * The route degrades to `{ available: false, ... }` when the game / pitcher
 * data isn't available rather than 500-ing.
 */

import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { getLiveGameSlate } from "@/lib/api/live-data"
import { simulateGameFirstInning } from "@/lib/monte-carlo"
import { paProbsFromContext } from "@/lib/monte-carlo-bridge"
import { precomputePitcherContext } from "@/lib/nrfi-models"
import type { MonteCarloResult } from "@/lib/types"
import { hashGameId } from "@/lib/utils/hash"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

async function readPersisted(gameId: string): Promise<MonteCarloResult | null> {
  try {
    const row = await prisma.modelPrediction.findFirst({
      where:   { id: gameId },
      orderBy: { createdAt: "desc" },
      select: {
        monteCarloPNrfi:        true,
        monteCarloMeanRuns:     true,
        monteCarloVariance:     true,
        monteCarloDistribution: true,
      },
    })
    if (!row || row.monteCarloPNrfi == null || row.monteCarloDistribution == null) return null
    const dist = row.monteCarloDistribution as unknown as number[]
    const cumulative = dist.reduce<number[]>((acc, p, i) => {
      acc.push(p + (acc[i - 1] ?? 0))
      return acc
    }, [])
    const percentile90 = cumulative.findIndex((c) => c >= 0.9)
    return {
      pNRFI:           row.monteCarloPNrfi,
      meanRuns:        row.monteCarloMeanRuns ?? 0,
      variance:        row.monteCarloVariance ?? 0,
      runDistribution: dist,
      percentile90:    percentile90 >= 0 ? percentile90 : dist.length - 1,
      nSims:           0,  // unknown after persistence; UI shouldn't depend on this
      seed:            hashGameId(gameId),
    }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const gameId = url.searchParams.get("gameId")
  const nSimsRaw = Number.parseInt(url.searchParams.get("nSims") ?? "8000", 10)
  const nSims = Number.isFinite(nSimsRaw) && nSimsRaw > 0 ? Math.min(nSimsRaw, 50_000) : 8000
  const force = url.searchParams.get("force") === "true"

  if (!gameId) {
    return NextResponse.json({ error: "Provide ?gameId=..." }, { status: 400 })
  }

  // 1. Persisted result wins unless the caller asks to recompute.
  if (!force) {
    const persisted = await readPersisted(gameId)
    if (persisted) {
      return NextResponse.json({ available: true, source: "persisted", ...persisted })
    }
  }

  // 2. Fall back to live recomputation against today's slate.
  try {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
    const slate = await getLiveGameSlate(today)
    const game = slate.games.find((g) => g.id === gameId)
    if (!game) {
      return NextResponse.json({ available: false, reason: "Game not on today's slate." })
    }
    const homePitcher = slate.pitchers.get(game.homePitcherId)
    const awayPitcher = slate.pitchers.get(game.awayPitcherId)
    const homeTeam    = slate.teams.get(game.homeTeamId)
    const awayTeam    = slate.teams.get(game.awayTeamId)
    if (!homePitcher || !awayPitcher || !homeTeam || !awayTeam) {
      return NextResponse.json({ available: false, reason: "Missing pitcher/team data." })
    }

    const homeCtx = precomputePitcherContext(homePitcher)
    const awayCtx = precomputePitcherContext(awayPitcher)
    const { homePAProbs, awayPAProbs } = paProbsFromContext(homePitcher, awayPitcher, homeTeam, awayTeam, homeCtx, awayCtx)
    const result = simulateGameFirstInning(homePAProbs, awayPAProbs, {
      nSims,
      seed: hashGameId(gameId),
    })
    return NextResponse.json({ available: true, source: "live", ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[/api/monte-carlo]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
