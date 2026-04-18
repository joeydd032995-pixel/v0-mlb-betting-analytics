import {
  fetchGamesByDate,
  fetchPitcherStats,
  fetchTeamStats,
  fetchPitcherLast5FirstInnings,
  fetchTeamLast5FirstInnings,
} from "./mlb-stats"
import type { MLBGame, MLBPitcherSeasonStats, MLBTeamHittingStats, FirstInningResult } from "./mlb-stats"
import { fetchAllNrfiOdds, extractNrfiOdds } from "./odds"
import type { OddsEvent } from "./odds"
import { fetchVenueWeather } from "./weather"
import type { Game, Pitcher, Team, Weather, GameOdds } from "../types"
import { MLB_TEAMS, getTeamByName } from "../constants/mlb-teams"
import { STADIUM_PARK_FACTORS } from "../constants/mlb-stadiums"
import { PitchingStatsCalculator } from "../advanced-stats"
import type { PitchingStats } from "../advanced-stats"

// ─── Estimation helpers ───────────────────────────────────────────────────────

/**
 * Estimate NRFI rate from overall ERA using Poisson model.
 * P(0 runs in 1 inning) = e^(-ERA/9)
 * First innings are slightly better for pitchers (fresh arm),
 * so multiply by 0.95 as a first-inning ERA adjustment.
 */
function estimateNrfiRate(era: number): number {
  const firstInningEra = era * 0.95
  return Math.min(0.90, Math.max(0.45, Math.exp(-firstInningEra / 9)))
}

/**
 * Estimate offense factor from team OPS (league avg OPS ≈ 0.720).
 */
function estimateOffenseFactor(ops: number): number {
  return Math.min(1.35, Math.max(0.65, ops / 0.720))
}

// ─── PitchingStats shape builder ─────────────────────────────────────────────

/**
 * Converts MLB Stats API pitcher data into the PitchingStats shape required
 * by PitchingStatsCalculator. Fields not available from this API (batted ball
 * data, Statcast) are zeroed out — PitchingStatsCalculator handles them
 * gracefully (e.g. xFIP uses league HR/FB when flyBalls === 0).
 */
function buildPitchingStatsShape(
  apiStats: MLBPitcherSeasonStats,
  pitcherId: string,
  teamId: string
): PitchingStats {
  const ip = apiStats.inningsPitched
  // Estimate ER from ERA since the API does not return earned runs directly.
  const estimatedER = ip > 0 ? Math.round((apiStats.era * ip) / 9) : 0
  // Estimate batters faced (BF ≈ IP × 4.3).
  const estimatedBF = Math.max(1, Math.round(ip * 4.3))
  // Estimate fly balls from HR using league HR/FB ≈ 12.8%.
  const estimatedFlyBalls = Math.round(apiStats.homeRuns / 0.128)

  return {
    IP: ip,
    BF: estimatedBF,
    H: apiStats.hits,
    ER: estimatedER,
    HR: apiStats.homeRuns,
    BB: apiStats.baseOnBalls,
    HBP: 0,           // not provided by this API endpoint
    K: apiStats.strikeOuts,
    groundBalls: 0,   // Statcast only
    flyBalls: estimatedFlyBalls,
    lineDrives: 0,    // Statcast only
    popUps: 0,        // Statcast only
    exitVelocityAllowed: [],   // Statcast only
    launchAnglesAllowed: [],   // Statcast only
    season: new Date().getFullYear(),
    playerId: pitcherId,
    teamId,
  }
}

// ─── Odds matching ────────────────────────────────────────────────────────────

/**
 * Match an odds event to a game by comparing the last word of each team name.
 * E.g. "New York Yankees" → "yankees". Returns null if either name is empty
 * or no match is found.
 */
function matchOddsEvent(
  homeTeamName: string,
  awayTeamName: string,
  events: OddsEvent[]
): OddsEvent | null {
  const lastWord = (name: string): string => {
    const words = name.trim().split(/\s+/)
    return words[words.length - 1]?.toLowerCase() ?? ""
  }

  const homeKey = lastWord(homeTeamName)
  const awayKey = lastWord(awayTeamName)

  if (!homeKey || !awayKey) return null

  return (
    events.find(
      (e) =>
        e.home_team.toLowerCase().includes(homeKey) &&
        e.away_team.toLowerCase().includes(awayKey)
    ) ?? null
  )
}

// ─── Team ID resolution ───────────────────────────────────────────────────────

function resolveTeamId(apiName: string): string {
  const team = getTeamByName(apiName)
  // Fall back to a slugified version of the last word in the name
  if (!team) {
    const words = apiName.trim().split(/\s+/)
    const fallback = words[words.length - 1]?.toLowerCase().slice(0, 3) ?? "unk"
    return fallback
  }
  return team.id
}

// ─── mapGame ──────────────────────────────────────────────────────────────────

function mapGame(
  apiGame: MLBGame,
  weather: Weather,
  odds: GameOdds | undefined,
  date: string
): Game {
  const venue = apiGame.venue?.name ?? "Unknown Stadium"
  const parkFactor = STADIUM_PARK_FACTORS[venue] ?? 1.0

  // MLB Stats API returns ISO 8601 UTC time (e.g., "2026-04-05T23:10:00Z")
  // Use Intl.DateTimeFormat directly — reliable across all Node.js/Vercel environments.
  // Avoid the anti-pattern of `new Date(date.toLocaleString(...))` which produces
  // Invalid Date in some runtimes because locale strings are not standardized for parsing.
  let displayTime = "TBD"
  if (apiGame.gameDate) {
    try {
      const utcDate = new Date(apiGame.gameDate)
      if (!isNaN(utcDate.getTime())) {
        displayTime = new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(utcDate)
      }
    } catch (err) {
      console.error("[mapGame] time parse error:", err)
    }
  }

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
    time: displayTime,
    timeZone: "ET",
    homeTeamId,
    awayTeamId,
    homePitcherId,
    awayPitcherId,
    venue,
    parkFactor,
    weather,
    odds,
  }
}

// ─── mapPitcher ───────────────────────────────────────────────────────────────

function mapPitcher(
  apiStats: MLBPitcherSeasonStats | null,
  pitcherId: string,
  teamId: string,
  pitcherName: string,
  last5: FirstInningResult[] = []
): Pitcher {
  const defaultEra = 4.0
  const defaultWhip = 1.28
  const defaultKRate = 0.225
  const defaultBbRate = 0.085

  // If no API data at all, build a fully default pitcher
  if (!apiStats) {
    const nrfiRate = estimateNrfiRate(defaultEra)
    return {
      id: pitcherId,
      name: pitcherName,
      teamId,
      throws: "R",
      age: 0,
      firstInning: {
        era: defaultEra,
        whip: defaultWhip,
        kRate: defaultKRate,
        bbRate: defaultBbRate,
        hrPer9: 1.1,
        babip: 0.3,
        nrfiRate,
        avgRunsAllowed: 1 - nrfiRate,
        firstBatterOBP: (defaultWhip / (1 + defaultWhip)) * 0.85,
        last5Results: last5.map((r) => r.nrfi),
        last5RunsAllowed: last5.map((r) => r.runs),
        startCount: 0,
        homeNrfiRate: nrfiRate,     // no home/away split data available
        awayNrfiRate: nrfiRate,
      },
      overall: {
        era: defaultEra,
        fip: defaultEra,            // no stats to compute FIP from
        xfip: defaultEra,
        whip: defaultWhip,
        kPer9: defaultKRate * 27,
        bbPer9: defaultBbRate * 27,
        innings: 0,
        wins: 0,
        losses: 0,
      },
    }
  }

  // MLB Stats API returns flattened stats (MLBPitcherSeasonStats)
  const era = apiStats.era
  const whip = apiStats.whip
  const startCount = apiStats.gamesStarted
  const innings = apiStats.inningsPitched

  // K% and BB% per batter faced (approx: BF ≈ IP × 4.3)
  const bf = Math.max(1, innings * 4.3)
  const kRate = apiStats.strikeOuts / bf
  const bbRate = apiStats.baseOnBalls / bf
  // HR/9
  const hrPer9 = innings > 0 ? (apiStats.homeRuns / innings) * 9 : 1.1

  const nrfiRate = estimateNrfiRate(era)
  const firstBatterOBP = (whip / (1 + whip)) * 0.85

  // Compute FIP and xFIP using PitchingStatsCalculator with available data.
  // xFIP normalises HR using league HR/FB rate; we estimate flyBalls from HR count.
  const pitchingShape = buildPitchingStatsShape(apiStats, pitcherId, teamId)
  const fip  = innings > 0 ? PitchingStatsCalculator.calculateFIP(pitchingShape)  : era
  const xfip = innings > 0 ? PitchingStatsCalculator.calculateXFIP(pitchingShape) : era

  return {
    id: pitcherId,
    name: apiStats.fullName,
    teamId,
    throws: "R",
    age: 0,
    firstInning: {
      era,
      whip,
      kRate,
      bbRate,
      hrPer9,
      babip: 0.3,
      nrfiRate,
      avgRunsAllowed: 1 - nrfiRate,
      firstBatterOBP,
      last5Results: [],           // no real data available
      last5RunsAllowed: [],       // no real data available
      startCount,
      homeNrfiRate: nrfiRate,     // no home/away split data available
      awayNrfiRate: nrfiRate,
    },
    overall: {
      era,
      fip:  Math.max(0, fip),
      xfip: Math.max(0, xfip),
      whip,
      kPer9: kRate * 27,
      bbPer9: bbRate * 27,
      innings,
      wins: 0,
      losses: 0,
    },
  }
}

// ─── mapTeam ──────────────────────────────────────────────────────────────────

function mapTeam(
  apiTeamStats: MLBTeamHittingStats | null,
  teamId: string,
  last5: FirstInningResult[] = []
): Team {
  const staticInfo = MLB_TEAMS[teamId]
  const defaultOps = 0.720

  // Use live OPS if available (flattened from splits[0].stat.ops).
  // Note: the MLB Stats API provides only rate stats for teams (OPS, OBP, AVG, SLG),
  // not per-event counting stats (H, BB, HR counts), so HittingStatsCalculator.calculateWOBA()
  // cannot be used here. wOBA is approximated from OBP using a linear regression fit.
  const ops = apiTeamStats?.ops && apiTeamStats.ops > 0 ? apiTeamStats.ops : defaultOps
  const obp = apiTeamStats?.obp && apiTeamStats.obp > 0 ? apiTeamStats.obp : ops * 0.43

  const offenseFactor = estimateOffenseFactor(ops)
  const runsPerGame = offenseFactor * 0.48
  const yrfiRate = 1 - Math.exp(-runsPerGame)
  // wOBA ≈ obp * 0.88: linear approximation from 2024 season regression
  const woba = obp * 0.88

  return {
    id: teamId,
    name: staticInfo?.name ?? teamId.toUpperCase(),
    abbreviation: staticInfo?.abbreviation ?? teamId.toUpperCase(),
    city: staticInfo?.city ?? "",
    league: staticInfo?.league ?? "AL",
    division: staticInfo?.division ?? "East",
    primaryColor: staticInfo?.primaryColor ?? "#000000",
    firstInning: {
      runsPerGame,
      offenseFactor,
      ops,
      woba,
      kRate: 0.225,
      bbRate: 0.085,
      yrfiRate,
      homeYrfiRate: yrfiRate + 0.02,
      awayYrfiRate: yrfiRate - 0.02,
      last10YrfiRate: yrfiRate,
      last5Results: last5.map((r) => r.nrfi),
      avgRunsVsRHP: runsPerGame,
      avgRunsVsLHP: runsPerGame * 1.05,
    },
  }
}

// ─── LiveGameSlate ────────────────────────────────────────────────────────────

export interface LiveGameSlate {
  games: Game[]
  pitchers: Map<string, Pitcher>
  teams: Map<string, Team>
}

export async function getLiveGameSlate(date: string): Promise<LiveGameSlate> {
  // 1. Fetch today's games
  const apiGames = await fetchGamesByDate(date)
  if (!apiGames || apiGames.length === 0) {
    // Return empty slate — caller decides how to handle a no-game day
    return { games: [], pitchers: new Map(), teams: new Map() }
  }

  // 2. Fetch all NRFI odds (one request covers all games)
  const oddsEvents = await fetchAllNrfiOdds()

  // 3. For each game, fetch stats and weather in parallel
  const perGameData = await Promise.all(
    apiGames.map(async (apiGame) => {
      const homeTeamApiId = apiGame.teams.home.team.id
      const awayTeamApiId = apiGame.teams.away.team.id

      const homePitcherApiId = apiGame.teams.home.probablePitcher?.id
      const awayPitcherApiId = apiGame.teams.away.probablePitcher?.id

      const venue = apiGame.venue?.name ?? "Unknown Stadium"

      const [
        homeTeamStats,
        awayTeamStats,
        homePitcherStats,
        awayPitcherStats,
        weather,
        homePitcherLast5,
        awayPitcherLast5,
        homeTeamLast5,
        awayTeamLast5,
      ] = await Promise.all([
        fetchTeamStats(homeTeamApiId),
        fetchTeamStats(awayTeamApiId),
        homePitcherApiId ? fetchPitcherStats(homePitcherApiId) : Promise.resolve(null),
        awayPitcherApiId ? fetchPitcherStats(awayPitcherApiId) : Promise.resolve(null),
        fetchVenueWeather(venue),
        homePitcherApiId ? fetchPitcherLast5FirstInnings(homePitcherApiId) : Promise.resolve([]),
        awayPitcherApiId ? fetchPitcherLast5FirstInnings(awayPitcherApiId) : Promise.resolve([]),
        fetchTeamLast5FirstInnings(homeTeamApiId),
        fetchTeamLast5FirstInnings(awayTeamApiId),
      ])

      return {
        apiGame,
        homeTeamStats,
        awayTeamStats,
        homePitcherStats,
        awayPitcherStats,
        weather,
        homePitcherLast5,
        awayPitcherLast5,
        homeTeamLast5,
        awayTeamLast5,
      }
    })
  )

  // 4. Build maps
  const games: Game[] = []
  const pitchers = new Map<string, Pitcher>()
  const teams = new Map<string, Team>()

  for (const {
    apiGame,
    homeTeamStats,
    awayTeamStats,
    homePitcherStats,
    awayPitcherStats,
    weather,
    homePitcherLast5,
    awayPitcherLast5,
    homeTeamLast5,
    awayTeamLast5,
  } of perGameData) {
    // Resolve odds
    const oddsEvent = matchOddsEvent(
      apiGame.teams.home.team.name,
      apiGame.teams.away.team.name,
      oddsEvents
    )
    const extractedOdds = oddsEvent ? extractNrfiOdds(oddsEvent) : null
    const gameOdds = extractedOdds ?? undefined

    // Map the game
    const game = mapGame(apiGame, weather, gameOdds, date)
    games.push(game)

    // Map pitchers
    const homePitcherName = apiGame.teams.home.probablePitcher?.fullName ?? "TBD"
    const awayPitcherName = apiGame.teams.away.probablePitcher?.fullName ?? "TBD"

    const homePitcher = mapPitcher(
      homePitcherStats,
      game.homePitcherId,
      game.homeTeamId,
      homePitcherName,
      homePitcherLast5
    )
    const awayPitcher = mapPitcher(
      awayPitcherStats,
      game.awayPitcherId,
      game.awayTeamId,
      awayPitcherName,
      awayPitcherLast5
    )

    pitchers.set(homePitcher.id, homePitcher)
    pitchers.set(awayPitcher.id, awayPitcher)

    // Map teams
    if (!teams.has(game.homeTeamId)) {
      teams.set(game.homeTeamId, mapTeam(homeTeamStats, game.homeTeamId, homeTeamLast5))
    }
    if (!teams.has(game.awayTeamId)) {
      teams.set(game.awayTeamId, mapTeam(awayTeamStats, game.awayTeamId, awayTeamLast5))
    }
  }

  return { games, pitchers, teams }
}
