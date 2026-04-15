/**
 * GET /api/backfill?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Retroactively generates predictions for all games in a date range and
 * immediately matches them against actual first-inning results from the
 * MLB Stats API. Returns completed TrackedPredictions ready to upsert into
 * localStorage so the accuracy dashboard shows full-season data.
 *
 * Max range: 30 days. Dates with no games are silently skipped.
 *
 * Note: pitcher/team stats are current-season stats (not historical snapshots),
 * which is acceptable for retroactive accuracy tracking purposes.
 */

import { NextResponse } from "next/server"
import { getLiveGameSlate } from "@/lib/api/live-data"
import { computeAllPredictions } from "@/lib/nrfi-engine"
import { buildTrackedPrediction } from "@/lib/prediction-store"
import { fetchGamesByDate, fetchGameLinescore, isGameFinal } from "@/lib/api/mlb-stats"
import type { TrackedPrediction } from "@/lib/prediction-store"

export const dynamic = "force-dynamic"
export const maxDuration = 300

function getDatesInRange(from: string, to: string): string[] {
  const dates: string[] = []
  const cur = new Date(from + "T12:00:00Z")
  const end = new Date(to + "T12:00:00Z")
  while (cur <= end && dates.length < 30) {
    dates.push(cur.toISOString().split("T")[0])
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get("from") ?? ""
    const to = searchParams.get("to") ?? ""

    if (!from || !to) {
      return NextResponse.json(
        { error: "from and to date params are required" },
        { status: 400 }
      )
    }

    const dates = getDatesInRange(from, to)
    const allPredictions: TrackedPrediction[] = []
    let datesWithGames = 0

    for (const date of dates) {
      try {
        // Build prediction slate for this date (uses current-season stats)
        const { games, pitchers, teams } = await getLiveGameSlate(date)
        if (games.length === 0) continue
        datesWithGames++

        const predictions = computeAllPredictions(games, pitchers, teams)

        // Fetch actual game results from the MLB Stats API
        const apiGames = await fetchGamesByDate(date)
        const finalApiGames = (apiGames ?? []).filter((g) => isGameFinal(g.status))

        const linescores = await Promise.all(
          finalApiGames.map((g) => fetchGameLinescore(g.gamePk))
        )

        // Build a gamePk → first-inning runs map
        const resultsMap: Record<string, { homeRuns: number; awayRuns: number }> = {}
        for (let i = 0; i < finalApiGames.length; i++) {
          const ls = linescores[i]
          if (!ls) continue
          const firstInning = ls.innings.find((inn) => inn.num === 1)
          if (!firstInning) continue
          resultsMap[String(finalApiGames[i].gamePk)] = {
            homeRuns: firstInning.home.runs ?? 0,
            awayRuns: firstInning.away.runs ?? 0,
          }
        }

        // Pair predictions with results and build TrackedPredictions
        for (const pred of predictions) {
          const game = games.find((g) => g.id === pred.gameId)
          if (!game) continue

          const tracked = buildTrackedPrediction(pred, game, pitchers, teams, date)
          const result = resultsMap[game.id]

          if (result) {
            const actualResult: "NRFI" | "YRFI" =
              result.homeRuns === 0 && result.awayRuns === 0 ? "NRFI" : "YRFI"
            allPredictions.push({
              ...tracked,
              status: "complete",
              actualResult,
              correct: actualResult === tracked.prediction,
              runsFirstInning: { home: result.homeRuns, away: result.awayRuns },
            })
          } else {
            // Game not final yet (e.g. today's slate)
            allPredictions.push(tracked)
          }
        }
      } catch (err) {
        console.error(`[backfill] Error for date ${date}:`, err)
        // Continue with remaining dates
      }
    }

    return NextResponse.json({
      predictions: allPredictions,
      datesProcessed: datesWithGames,
      total: allPredictions.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[/api/backfill]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
