/**
 * GET /api/results?date=YYYY-MM-DD
 *
 * Fetches first-inning runs for all completed (Final) games on a given date.
 * If `date` is omitted, defaults to today's date (ET timezone).
 *
 * Returns:
 * {
 *   date: "YYYY-MM-DD",
 *   results: {
 *     [gamePk]: {
 *       homeTeam: string
 *       awayTeam: string
 *       homeRuns: number        // 1st-inning runs allowed by home team
 *       awayRuns: number        // 1st-inning runs allowed by away team
 *       homeFinalRuns: number   // full-game final score (home)
 *       awayFinalRuns: number   // full-game final score (away)
 *       status: string          // "Final" | "Game Over" | etc.
 *       nrfi: boolean           // homeRuns === 0 && awayRuns === 0
 *     }
 *   },
 *   finalGameCount: number
 *   pendingGameCount: number
 * }
 */

import { NextResponse } from "next/server"
import { fetchGamesByDate, fetchGameLinescore } from "@/lib/api/mlb-stats"

export const dynamic = "force-dynamic"

/** States that mean the game has completed (linescore is stable) */
const FINAL_STATES = new Set([
  "final",
  "game over",
  "completed early",
  "postponed",
  "suspended",
])

function isFinal(status: { abstractGameState: string; detailedState: string }): boolean {
  return (
    status.abstractGameState.toLowerCase() === "final" ||
    FINAL_STATES.has(status.detailedState.toLowerCase())
  )
}

function isInProgress(status: { abstractGameState: string; detailedState: string }): boolean {
  return status.abstractGameState.toLowerCase() === "live"
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    // Resolve date — default to ET today
    let date = searchParams.get("date") ?? ""
    if (!date) {
      date = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .format(new Date())
        .replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2")
    }

    const games = await fetchGamesByDate(date)
    if (!games || games.length === 0) {
      return NextResponse.json({
        date,
        results: {},
        finalGameCount: 0,
        pendingGameCount: 0,
      })
    }

    const finalGames   = games.filter((g) => isFinal(g.status))
    const liveGames    = games.filter((g) => isInProgress(g.status))
    const pendingCount = games.length - finalGames.length - liveGames.length

    // Fetch linescores for final games in parallel (and live games too)
    const linescoreTargets = [...finalGames, ...liveGames]

    const linescores = await Promise.all(
      linescoreTargets.map((g) => fetchGameLinescore(g.gamePk))
    )

    const results: Record<
      string,
      {
        homeTeam: string
        awayTeam: string
        homeRuns: number
        awayRuns: number
        homeFinalRuns: number
        awayFinalRuns: number
        status: string
        nrfi: boolean
        inProgress: boolean
      }
    > = {}

    for (let i = 0; i < linescoreTargets.length; i++) {
      const game = linescoreTargets[i]
      const ls = linescores[i]
      if (!ls) continue

      const firstInning = ls.innings.find((inn) => inn.num === 1)
      if (!firstInning) continue

      // Runs in the 1st inning (undefined → 0 for games where only top half finished)
      const homeRuns = firstInning.home.runs ?? 0
      const awayRuns = firstInning.away.runs ?? 0

      results[String(game.gamePk)] = {
        homeTeam:     game.teams.home.team.name,
        awayTeam:     game.teams.away.team.name,
        homeRuns,
        awayRuns,
        homeFinalRuns: ls.teams?.home?.runs ?? 0,
        awayFinalRuns: ls.teams?.away?.runs ?? 0,
        status:       game.status.detailedState,
        nrfi:         homeRuns === 0 && awayRuns === 0,
        inProgress:   isInProgress(game.status),
      }
    }

    return NextResponse.json({
      date,
      results,
      finalGameCount:   finalGames.length,
      pendingGameCount: pendingCount,
      liveGameCount:    liveGames.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[/api/results]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
