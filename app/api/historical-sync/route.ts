/**
 * GET /api/historical-sync?year=YYYY&month=M
 *
 * Syncs one calendar month of MLB first-inning results into the database.
 * Call repeatedly — one month per request — to build the full historical dataset.
 *
 * For every completed game it:
 *   1. Upserts a GameResult row (actual 1st-inning runs — ground truth).
 *   2. Generates and upserts a ModelPrediction row using POINT-IN-TIME stats:
 *      fetchPitcherStatsAsOf / fetchTeamStatsAsOf aggregate game logs strictly
 *      before the game date (Bayesian-blended with the prior season), so no
 *      future data leaks into a backfilled prediction.  Rows for seasons
 *      before the current one are flagged backtested=true.
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
import { fetchGamesByDate, fetchGameLinescore, fetchPitcherStatsAsOf, fetchTeamStatsAsOf } from "@/lib/api/mlb-stats"
import { fetchHistoricalWeather } from "@/lib/api/weather"
import { computeAllPredictions } from "@/lib/nrfi-engine"
import { buildTrackedPrediction } from "@/lib/prediction-store"
import { STADIUM_PARK_FACTORS } from "@/lib/constants/mlb-stadiums"
import { MLB_TEAMS } from "@/lib/constants/mlb-teams"
import { resolveTeamId, estimateNrfiRate, estimateOffenseFactor } from "@/lib/api/shared-helpers"
import { sanitizeForLog } from "@/lib/utils/log"
import type { Game, Pitcher, Team, Weather } from "@/lib/types"
import type { MLBGame, MLBPitcherSeasonStats, MLBTeamHittingStats } from "@/lib/api/mlb-stats"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Neutral fallback used only as the buildLightGame default parameter.
const NEUTRAL_WEATHER: Weather = { temperature: 72, windSpeed: 0, windDirection: "calm", conditions: "clear", humidity: 50 }

// Month-based average MLB game-time temperatures (°F).  Used instead of a flat
// 72°F so that backtested predictions in cold months (March) lean NRFI and
// hot months (July/August) produce some YRFI predictions, preventing the
// "model accuracy = league NRFI rate" artifact caused by always predicting NRFI.
const MONTHLY_AVG_TEMP_F: Record<number, number> = {
  3: 48, 4: 57, 5: 66, 6: 75, 7: 83, 8: 84, 9: 76, 10: 63,
}

function buildSeasonalWeather(date: string): Weather {
  const month = parseInt(date.split("-")[1], 10)
  return {
    temperature: MONTHLY_AVG_TEMP_F[month] ?? 72,
    windSpeed: 0,
    windDirection: "calm",
    conditions: "clear",
    humidity: 50,
  }
}

function buildLightPitcher(
  pitcherId: string,
  teamId: string,
  name: string,
  stats: MLBPitcherSeasonStats | null
): Pitcher {
  const era = stats?.era ?? 4.0
  const whip = stats?.whip ?? 1.28
  const ip = stats?.inningsPitched ?? 0
  const bf = Math.max(1, ip * 4.3)
  const kRate = stats ? stats.strikeOuts / bf : 0.225
  const bbRate = stats ? stats.baseOnBalls / bf : 0.085
  const hrPer9 = ip > 0 && stats ? (stats.homeRuns / ip) * 9 : 1.1
  const nrfiRate = estimateNrfiRate(era)

  return {
    id: pitcherId,
    name: stats?.fullName ?? name,
    teamId,
    throws: stats?.throws ?? "R",
    age: 0,
    firstInning: {
      era, whip, kRate, bbRate, hrPer9,
      babip: 0.3,
      nrfiRate,
      avgRunsAllowed: 1 - nrfiRate,
      firstBatterOBP: (whip / (1 + whip)) * 0.85,
      last5Results: [],
      last5RunsAllowed: [],
      startCount: stats?.gamesStarted ?? 0,
      homeNrfiRate: nrfiRate,
      awayNrfiRate: nrfiRate,
    },
    overall: {
      era, fip: era, xfip: era, whip,
      kPer9: kRate * 27,
      bbPer9: bbRate * 27,
      innings: ip,
      wins: 0, losses: 0,
    },
  }
}

function buildLightTeam(teamId: string, stats: MLBTeamHittingStats | null): Team {
  const staticInfo = MLB_TEAMS[teamId]
  const ops = stats?.ops && stats.ops > 0 ? stats.ops : 0.720
  const obp = stats?.obp && stats.obp > 0 ? stats.obp : ops * 0.43
  const offenseFactor = estimateOffenseFactor(ops)
  const runsPerGame = offenseFactor * 0.48
  const yrfiRate = 1 - Math.exp(-runsPerGame)
  const woba = obp * 0.993

  return {
    id: teamId,
    name: staticInfo?.name ?? teamId.toUpperCase(),
    abbreviation: staticInfo?.abbreviation ?? teamId.toUpperCase(),
    city: staticInfo?.city ?? "",
    league: staticInfo?.league ?? "AL",
    division: staticInfo?.division ?? "East",
    primaryColor: staticInfo?.primaryColor ?? "#666",
    firstInning: {
      runsPerGame,
      offenseFactor,
      ops,
      woba,
      kRate: 0.225,
      bbRate: 0.085,
      yrfiRate,
      homeYrfiRate: yrfiRate,
      awayYrfiRate: yrfiRate,
      last10YrfiRate: yrfiRate,
      avgRunsVsRHP: runsPerGame,
      avgRunsVsLHP: runsPerGame,
      last5Results: [],
    },
  }
}

function buildLightGame(apiGame: MLBGame, date: string, weather: Weather = NEUTRAL_WEATHER): Game {
  const venue = apiGame.venue?.name ?? "Unknown Stadium"
  const parkFactor = STADIUM_PARK_FACTORS[venue] ?? 1.0
  const homeTeamId = resolveTeamId(apiGame.teams.home.team.name)
  const awayTeamId = resolveTeamId(apiGame.teams.away.team.name)
  const homePitcherId = apiGame.teams.home.probablePitcher?.id
    ? String(apiGame.teams.home.probablePitcher.id)
    : `tbd-home-${apiGame.gamePk}`
  const awayPitcherId = apiGame.teams.away.probablePitcher?.id
    ? String(apiGame.teams.away.probablePitcher.id)
    : `tbd-away-${apiGame.gamePk}`

  return {
    id: String(apiGame.gamePk),
    date,
    time: "TBD",
    timeZone: "ET",
    homeTeamId,
    awayTeamId,
    homePitcherId,
    awayPitcherId,
    venue,
    parkFactor,
    weather,
    odds: undefined,
  }
}

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

      const pitcherIds = new Set<string>()
      const teamIds    = new Set<string>()
      const gameObjs: Game[] = []

      for (const apiGame of finalGames) {
        const venue = apiGame.venue?.name ?? "Unknown Stadium"
        const wx = recompute ? (venueWeather.get(venue) ?? buildSeasonalWeather(date)) : buildSeasonalWeather(date)
        const g = buildLightGame(apiGame, date, wx)
        gameObjs.push(g)
        if (!g.homePitcherId.startsWith("tbd-")) pitcherIds.add(g.homePitcherId)
        if (!g.awayPitcherId.startsWith("tbd-")) pitcherIds.add(g.awayPitcherId)
        teamIds.add(g.homeTeamId)
        teamIds.add(g.awayTeamId)
      }

      // Fetch pitcher + team stats in parallel.  Use the point-in-time as-of
      // variants so a historical game is scored only with data available
      // BEFORE that date (blended with the prior season).  "As of date" is
      // always the correct semantics for a backfill, including 2026.
      const [pitcherStatsArr, teamStatsArr] = await Promise.all([
        Promise.all(
          [...pitcherIds].map((id) =>
            fetchPitcherStatsAsOf(parseInt(id), year, date).then(
              (s) => [id, s] as [string, MLBPitcherSeasonStats | null]
            )
          )
        ),
        Promise.all(
          [...teamIds].map((id) => {
            const teamNum = MLB_TEAMS[id]?.apiId
            if (!teamNum) return Promise.resolve([id, null] as [string, MLBTeamHittingStats | null])
            return fetchTeamStatsAsOf(teamNum, year, date).then(
              (s) => [id, s] as [string, MLBTeamHittingStats | null]
            )
          })
        ),
      ])

      const pitcherStatsMap = new Map(pitcherStatsArr)
      const teamStatsMap    = new Map(teamStatsArr)

      const pitchers  = new Map<string, Pitcher>()
      const teams     = new Map<string, Team>()
      const gameById  = new Map(gameObjs.map((g) => [g.id, g]))

      for (const apiGame of finalGames) {
        const g = gameById.get(String(apiGame.gamePk))
        if (!g) continue

        if (!pitchers.has(g.homePitcherId)) {
          const name = apiGame.teams.home.probablePitcher?.fullName ?? "TBD"
          pitchers.set(
            g.homePitcherId,
            buildLightPitcher(g.homePitcherId, g.homeTeamId, name, pitcherStatsMap.get(g.homePitcherId) ?? null)
          )
        }
        if (!pitchers.has(g.awayPitcherId)) {
          const name = apiGame.teams.away.probablePitcher?.fullName ?? "TBD"
          pitchers.set(
            g.awayPitcherId,
            buildLightPitcher(g.awayPitcherId, g.awayTeamId, name, pitcherStatsMap.get(g.awayPitcherId) ?? null)
          )
        }
        if (!teams.has(g.homeTeamId)) teams.set(g.homeTeamId, buildLightTeam(g.homeTeamId, teamStatsMap.get(g.homeTeamId) ?? null))
        if (!teams.has(g.awayTeamId)) teams.set(g.awayTeamId, buildLightTeam(g.awayTeamId, teamStatsMap.get(g.awayTeamId) ?? null))
      }

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
            nrfiOdds:        tracked.nrfiOdds ?? null,
            yrfiOdds:        tracked.yrfiOdds ?? null,
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
