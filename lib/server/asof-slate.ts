/**
 * Point-in-time ("as of") slate builder — the single source of truth for
 * scoring a game with only the data that existed BEFORE it was played.
 *
 * ── Why this module exists ───────────────────────────────────────────────────
 * Two routes reconstruct predictions for past dates, and until now they
 * disagreed about time:
 *
 *   /api/historical-sync  → fetchPitcherStatsAsOf / fetchTeamStatsAsOf
 *                           (correct: game logs strictly before the date)
 *   /api/backfill         → getLiveGameSlate → fetchPitcherStats / fetchTeamStats
 *                           (WRONG: current season-to-date totals)
 *
 * The second path fed the client-side accuracy dashboard, so every backfilled
 * game was "predicted" with a season line that already contained that game's
 * own result — and every game after it. The leak inflated the dashboard's
 * reported accuracy by roughly 8 points (60.8% displayed vs 53.0% for
 * predictions actually written before first pitch).
 *
 * Both routes now build their slate here, so the two can no longer drift apart.
 *
 * ── The invariant ────────────────────────────────────────────────────────────
 * A prediction for date D must not change when a game played after D is
 * appended to any input. `__tests__/asof-slate.test.ts` pins this.
 *
 * ── Deliberate limitation ────────────────────────────────────────────────────
 * The `buildLight*` constructors derive first-inning splits from season
 * aggregates rather than true first-inning splits, and carry no odds and no
 * posted lineup. That is a real loss of fidelity versus the live path — and it
 * is the correct trade: coarser inputs that respect time beat richer inputs
 * that leak the answer. Callers should record the degradation in
 * `inputsPresence` so downstream training can filter these rows.
 */

import {
  fetchPitcherStatsAsOf,
  fetchTeamStatsAsOf,
  type MLBGame,
  type MLBPitcherSeasonStats,
  type MLBTeamHittingStats,
} from "@/lib/api/mlb-stats"
import { STADIUM_PARK_FACTORS } from "@/lib/constants/mlb-stadiums"
import { MLB_TEAMS } from "@/lib/constants/mlb-teams"
import { resolveTeamId, estimateNrfiRate, estimateOffenseFactor } from "@/lib/api/shared-helpers"
import type { Game, Pitcher, Team, Weather } from "@/lib/types"

/** Neutral fallback used only as the `buildLightGame` default parameter. */
export const NEUTRAL_WEATHER: Weather = {
  temperature: 72, windSpeed: 0, windDirection: "calm", conditions: "clear", humidity: 50,
}

// Month-based average MLB game-time temperatures (°F).  Used instead of a flat
// 72°F so that backtested predictions in cold months (March) lean NRFI and
// hot months (July/August) produce some YRFI predictions, preventing the
// "model accuracy = league NRFI rate" artifact caused by always predicting NRFI.
const MONTHLY_AVG_TEMP_F: Record<number, number> = {
  3: 48, 4: 57, 5: 66, 6: 75, 7: 83, 8: 84, 9: 76, 10: 63,
}

/**
 * Month-average weather for a date. Date-derived, so it is stable under
 * reprocessing — unlike `fetchVenueWeather(venue)`, which returns *today's*
 * conditions no matter which date is being scored.
 */
export function buildSeasonalWeather(date: string): Weather {
  const month = parseInt(date.split("-")[1], 10)
  return {
    temperature: MONTHLY_AVG_TEMP_F[month] ?? 72,
    windSpeed: 0,
    windDirection: "calm",
    conditions: "clear",
    humidity: 50,
  }
}

export function buildLightPitcher(
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

export function buildLightTeam(teamId: string, stats: MLBTeamHittingStats | null): Team {
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

export function buildLightGame(
  apiGame: MLBGame,
  date: string,
  weather: Weather = NEUTRAL_WEATHER
): Game {
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
    // Never a live odds snapshot: a line fetched today does not belong to a
    // game played in April, and pricing a past game at a present-day number is
    // its own form of hindsight.
    odds: undefined,
  }
}

export interface AsOfSlate {
  games: Game[]
  pitchers: Map<string, Pitcher>
  teams: Map<string, Team>
  /** Indexed by `String(gamePk)` for pairing predictions back to their game. */
  gameById: Map<string, Game>
}

export interface AsOfSlateOptions {
  /**
   * Per-venue weather override. When omitted, every game gets
   * `buildSeasonalWeather(date)` — a month average, which is date-derived and
   * therefore stable under reprocessing. Pass archived observations here when
   * a caller has them (see `fetchHistoricalWeather`).
   */
  weatherByVenue?: Map<string, Weather>
}

/**
 * Build a prediction slate for `date` using ONLY information available before
 * that date.
 *
 * Every stat read goes through the `*AsOf` aggregators, which walk the season
 * game log and stop at `date` (Bayesian-blended with the prior season). The
 * current-season endpoints — `fetchPitcherStats` / `fetchTeamStats` — must
 * never be reachable from this function.
 *
 * @param apiGames Games already fetched for `date` (pass them in so callers
 *                 that also need results don't fetch the schedule twice).
 * @param date     ET date, "YYYY-MM-DD". The as-of cutoff.
 * @param season   Season year for the game-log query.
 */
export async function buildAsOfSlate(
  apiGames: MLBGame[],
  date: string,
  season: number,
  options: AsOfSlateOptions = {}
): Promise<AsOfSlate> {
  const seasonalWeather = buildSeasonalWeather(date)

  const games: Game[] = []
  const pitcherIds = new Set<string>()
  const teamIds = new Set<string>()

  for (const apiGame of apiGames) {
    const venue = apiGame.venue?.name ?? "Unknown Stadium"
    const weather = options.weatherByVenue?.get(venue) ?? seasonalWeather
    const g = buildLightGame(apiGame, date, weather)
    games.push(g)
    if (!g.homePitcherId.startsWith("tbd-")) pitcherIds.add(g.homePitcherId)
    if (!g.awayPitcherId.startsWith("tbd-")) pitcherIds.add(g.awayPitcherId)
    teamIds.add(g.homeTeamId)
    teamIds.add(g.awayTeamId)
  }

  const [pitcherStatsArr, teamStatsArr] = await Promise.all([
    Promise.all(
      [...pitcherIds].map((id) =>
        fetchPitcherStatsAsOf(parseInt(id), season, date).then(
          (s) => [id, s] as [string, MLBPitcherSeasonStats | null]
        )
      )
    ),
    Promise.all(
      [...teamIds].map((id) => {
        const teamNum = MLB_TEAMS[id]?.apiId
        if (!teamNum) return Promise.resolve([id, null] as [string, MLBTeamHittingStats | null])
        return fetchTeamStatsAsOf(teamNum, season, date).then(
          (s) => [id, s] as [string, MLBTeamHittingStats | null]
        )
      })
    ),
  ])

  const pitcherStatsMap = new Map(pitcherStatsArr)
  const teamStatsMap = new Map(teamStatsArr)

  const pitchers = new Map<string, Pitcher>()
  const teams = new Map<string, Team>()
  const gameById = new Map(games.map((g) => [g.id, g]))

  for (const apiGame of apiGames) {
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
    if (!teams.has(g.homeTeamId)) {
      teams.set(g.homeTeamId, buildLightTeam(g.homeTeamId, teamStatsMap.get(g.homeTeamId) ?? null))
    }
    if (!teams.has(g.awayTeamId)) {
      teams.set(g.awayTeamId, buildLightTeam(g.awayTeamId, teamStatsMap.get(g.awayTeamId) ?? null))
    }
  }

  return { games, pitchers, teams, gameById }
}
