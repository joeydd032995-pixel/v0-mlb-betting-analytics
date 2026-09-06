/**
 * GET /api/historical-sync?year=YYYY&month=M
 *
 * Syncs one calendar month of MLB first-inning results into the database.
 * Call repeatedly — one month per request — to build the full historical dataset.
 *
 * For every completed game it:
 *   1. Upserts a GameResult row (actual 1st-inning runs — ground truth).
 *   2. Generates and upserts a ModelPrediction row using POINT-IN-TIME stats:
 *      `buildAsOfSlate` (lib/server/asof-slate.ts) aggregates game logs
 *      strictly before the game date (Bayesian-blended with the prior
 *      season), so no future data leaks into a backfilled prediction.  That
 *      builder is shared with /api/backfill, which used to read current
 *      season-to-date stats instead and inflated the accuracy dashboard.
 *      Rows for seasons before the current one are flagged backtested=true.
 *
 * Typical call sequence for a full backfill:
 *   /api/historical-sync?year=2024&month=4  … month=9
 *   /api/historical-sync?year=2025&month=3  … month=10
 *   /api/historical-sync?year=2026&month=3  … month=<current>
 *
 * Returns: { year, month, daysProcessed, gameResultsSynced, predictionsSynced, skipped }
 */

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { fetchGamesByDate, fetchGameLinescore } from "@/lib/api/mlb-stats"
import { fetchHistoricalWeather } from "@/lib/api/weather"
import { computeAllPredictions } from "@/lib/nrfi-engine"
import { buildTrackedPrediction } from "@/lib/prediction-store"
import { buildAsOfSlate } from "@/lib/server/asof-slate"
import { sanitizeForLog } from "@/lib/utils/log"
import type { Weather } from "@/lib/types"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Date helpers ─────────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number): string[] {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
  const etFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" })
  const dates: string[] = []
  const d = new Date(Date.UTC(year, month - 1, 1))
  while (d.getUTCMonth() === month - 1) {
    const s = etFormatter.format(d)
    if (s > today) break
    dates.push(s)
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return dates
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const year  = parseInt(searchParams.get("year")  ?? "0")
  const month = parseInt(searchParams.get("month") ?? "0")
  // skip=true (default) skips days that already have game results in the DB
  const skipSynced = searchParams.get("skip") !== "false"
  // recompute=true overwrites stored ensembleNrfi for the requested month,
  // for use after enriching the input pipeline (real historical weather etc).
  // Same auth gate as skip=false, plus an env flag so accidental cron hits
  // don't churn the table.
  const recompute = searchParams.get("recompute") === "true"
  if (recompute && process.env.RECOMPUTE_HISTORICAL !== "true") {
    return NextResponse.json(
      { error: "recompute=true requires RECOMPUTE_HISTORICAL=true on the server" },
      { status: 403 }
    )
  }

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json(
      { error: "year and month (1-12) are required" },
      { status: 400 }
    )
  }

  // All invocations require auth — either a Clerk session (human users) or
  // the RECOMPUTE_TOKEN bearer token (scripts / cron automation).
  {
    const expected = process.env.RECOMPUTE_TOKEN ?? ""
    const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
    const tokenOk  = expected !== "" && provided !== "" && provided === expected

    let userId: string | null = null
    if (!tokenOk) {
      try {
        const session = await auth()
        userId = session.userId
      } catch { /* Clerk not configured — deny by default */ }
    }
    if (!tokenOk && !userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
  }

  const dates = daysInMonth(year, month)
  const currentYear = parseInt(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()).slice(0, 4), 10)
  const isBacktested = year < currentYear

  let gameResultsSynced = 0
  let predictionsSynced = 0
  let skipped = 0

  for (const date of dates) {
    try {
      // Skip days that already have data (fast path — avoids MLB API calls on re-runs).
      // recompute=true bypasses this so we can overwrite ensembleNrfi with new inputs.
      if (skipSynced && !recompute) {
        const existing = await prisma.gameResult.count({ where: { date } })
        if (existing > 0) { skipped += existing; continue }
      }

      // 1. Schedule + filter to completed games
      const apiGames = await fetchGamesByDate(date)
      const finalGames = apiGames.filter(
        (g) => g.status.abstractGameState.toLowerCase() === "final"
      )
      if (finalGames.length === 0) continue

      // 2. Fetch linescores in parallel
      const linescores = await Promise.all(
        finalGames.map((g) => fetchGameLinescore(g.gamePk))
      )

      // 3. Build results map + upsert GameResult rows
      const resultsMap: Record<string, { homeRuns: number; awayRuns: number }> = {}

      for (let i = 0; i < finalGames.length; i++) {
        const game = finalGames[i]
        const ls   = linescores[i]
        if (!ls) { skipped++; continue }

        const firstInning = ls.innings.find((inn) => inn.num === 1)
        if (!firstInning) { skipped++; continue }

        const homeRuns = firstInning.home.runs ?? 0
        const awayRuns = firstInning.away.runs ?? 0

        await prisma.gameResult.upsert({
          where:  { gamePk: game.gamePk },
          update: {},
          create: {
            gamePk:   game.gamePk,
            date,
            season:   year,
            homeTeam: game.teams.home.team.name,
            awayTeam: game.teams.away.team.name,
            homeRuns,
            awayRuns,
            nrfi: homeRuns === 0 && awayRuns === 0,
          },
        })
        gameResultsSynced++
        resultsMap[String(game.gamePk)] = { homeRuns, awayRuns }
      }

      // 4. Generate + upsert ModelPrediction rows
      //    Collect unique pitcher and team IDs for this day's games

      // 4a. When recompute=true, prefetch real historical weather per venue
      //     (one Open-Meteo call each, free + cached on the route handler).
      //     For non-recompute calls we keep the legacy NEUTRAL_WEATHER so
      //     existing behaviour is unchanged.
      const venueWeather = new Map<string, Weather>()
      if (recompute) {
        // Key weather by venue; pass the first game's UTC first-pitch time so
        // the archive samples the right hour (day games were previously
        // sampled at a hardcoded 7 PM local — AUDIT_REPORT.md P2-14).
        // Doubleheader caveat: both games share the first game's hour.
        const venueFirstPitch = new Map<string, string | undefined>()
        for (const g of finalGames) {
          const v = g.venue?.name ?? "Unknown Stadium"
          if (!venueFirstPitch.has(v)) venueFirstPitch.set(v, g.gameDate)
        }
        const weatherEntries = await Promise.all(
          [...venueFirstPitch.entries()].map(async ([v, gameTime]) =>
            [v, await fetchHistoricalWeather(v, date, gameTime)] as const
          )
        )
        for (const [v, w] of weatherEntries) venueWeather.set(v, w)
      }

      // Point-in-time slate — every stat read is strictly before `date`.
      // Shared with /api/backfill via lib/server/asof-slate so the two
      // reconstruction paths cannot drift apart again.
      const { games: gameObjs, pitchers, teams, gameById } = await buildAsOfSlate(
        finalGames,
        date,
        year,
        { weatherByVenue: recompute ? venueWeather : undefined }
      )

      const predictions = computeAllPredictions(gameObjs, pitchers, teams)

      for (const pred of predictions) {
        const game = gameById.get(pred.gameId)
        if (!game) continue

        const tracked = buildTrackedPrediction(pred, game, pitchers, teams, date)
        const result  = resultsMap[game.id]

        const actualResult =
          result !== undefined
            ? (result.homeRuns === 0 && result.awayRuns === 0 ? "NRFI" : "YRFI")
            : undefined

        // Historical sync always passes seasonal weather (month-avg temp) and no odds (see
        // buildLightGame above), so the stored ensembleNrfi reflects degraded
        // inputs.  Record that lineage explicitly; downstream training can
        // filter or downweight these rows.  recomputedAt timestamps when this
        // row was last touched by a recompute=true run.
        const inputsPresence = {
          weather: recompute,
          odds:    false,
          lineup:  false,
          ...(recompute ? { recomputedAt: new Date().toISOString() } : {}),
        }
        await prisma.modelPrediction.upsert({
          where:  { id: tracked.id },
          update: {
            // Refresh prediction fields so re-runs pick up model config changes
            nrfiProbability: tracked.nrfiProbability,
            prediction:      tracked.prediction,
            confidence:      tracked.confidence,
            confidenceScore: tracked.confidenceScore,
            poissonNrfi:     tracked.poissonNrfi,
            zipNrfi:         tracked.zipNrfi,
            markovNrfi:      tracked.markovNrfi,
            ensembleNrfi:    tracked.ensembleNrfi,
            mapreNrfi:             tracked.mapreNrfi ?? null,
            logisticMetaNrfi:      tracked.logisticMetaNrfi ?? null,
            nnInteractionNrfi:     tracked.nnInteractionNrfi ?? null,
            hierarchicalBayesNrfi: tracked.hierarchicalBayesNrfi ?? null,
            // Deliberately NOT writing odds here. `buildLightGame` always sets
            // `odds: undefined`, so `tracked.nrfiOdds ?? null` was unconditionally
            // null — meaning a re-sync over a date would wipe the odds snapshot
            // the nightly agent captured live. Omitting the keys leaves any
            // stored value alone, matching how the nullable model columns are
            // handled in app/actions.ts.
            modelConsensus:  tracked.modelConsensus,
            inputsPresence,
            ...(actualResult !== undefined
              ? { actualResult, correct: actualResult === tracked.prediction, status: "complete" }
              : {}),
          },
          create: {
            id:              tracked.id,
            date,
            season:          year,
            homeTeam:        tracked.homeTeam,
            awayTeam:        tracked.awayTeam,
            homePitcher:     tracked.homePitcher,
            awayPitcher:     tracked.awayPitcher,
            nrfiProbability: tracked.nrfiProbability,
            prediction:      tracked.prediction,
            confidence:      tracked.confidence,
            confidenceScore: tracked.confidenceScore,
            poissonNrfi:     tracked.poissonNrfi,
            zipNrfi:         tracked.zipNrfi,
            markovNrfi:      tracked.markovNrfi,
            ensembleNrfi:    tracked.ensembleNrfi,
            mapreNrfi:             tracked.mapreNrfi ?? null,
            logisticMetaNrfi:      tracked.logisticMetaNrfi ?? null,
            nnInteractionNrfi:     tracked.nnInteractionNrfi ?? null,
            hierarchicalBayesNrfi: tracked.hierarchicalBayesNrfi ?? null,
            nrfiOdds:        tracked.nrfiOdds ?? null,
            yrfiOdds:        tracked.yrfiOdds ?? null,
            modelConsensus:  tracked.modelConsensus,
            inputsPresence,
            actualResult:    actualResult ?? null,
            correct:         actualResult !== undefined ? actualResult === tracked.prediction : null,
            status:          actualResult !== undefined ? "complete" : "pending",
            backtested:      isBacktested,
          },
        })
        predictionsSynced++
      }

    } catch (err) {
      console.error(`[historical-sync] Error processing ${sanitizeForLog(date)}:`, err)
      skipped++
    }
  }

  return NextResponse.json({
    year,
    month,
    daysProcessed: dates.length,
    gameResultsSynced,
    predictionsSynced,
    skipped,
  })
}
