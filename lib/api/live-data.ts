import { fetchGamesByDate, fetchPitcherStats, fetchTeamStats } from "./mlb-stats"
import type { MLBGame, MLBPitcherStats, MLBTeamStats } from "./mlb-stats"
import { fetchAllNrfiOdds, extractNrfiOdds } from "./odds"
import type { OddsEvent } from "./odds"
import { fetchVenueWeather } from "./weather"
import type { Game, Pitcher, Team, Weather, GameOdds } from "../types"
import { MLB_TEAMS, getTeamByName } from "../constants/mlb-teams"
import { STADIUM_PARK_FACTORS } from "../constants/mlb-stadiums"

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

// ─── Odds matching ────────────────────────────────────────────────────────────

function matchOddsEvent(
  homeTeamName: string,
  awayTeamName: string,
  events: OddsEvent[]
): OddsEvent | null {
  return (
    events.find(
      (e) =>
        e.home_team
          .toLowerCase()
          .includes(homeTeamName.split(" ").pop()!.toLowerCase()) &&
        e.away_team
          .toLowerCase()
          .includes(awayTeamName.split(" ").pop()!.toLowerCase())
    ) ?? null
  )
}

// ─── Team ID resolution ───────────────────────────────────────────────────────

function resolveTeamId(apiName: string): string {
  const team = getTeamByName(apiName)
  // Fall back to a slugified version of the last word in the name
  if (!team) {
    const fallback = apiName.split(" ").pop()?.toLowerCase().slice(0, 3) ?? "unk"
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

  // MLB Stats API returns ISO 8601 UTC time (e.g., "2026-04-04T20:10:00Z")
  let displayTime = "7:05 PM"
  if (apiGame.gameDateTime) {
    try {
      const utcDate = new Date(apiGame.gameDateTime)
      // Convert to ET (UTC-5 or UTC-4 depending on DST)
      const etTime = new Date(utcDate.toLocaleString("en-US", { timeZone: "America/New_York" }))
      const hours = etTime.getHours()
      const minutes = String(etTime.getMinutes()).padStart(2, "0")
      const ampm = hours >= 12 ? "PM" : "AM"
      const hours12 = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours
      displayTime = `${hours12}:${minutes} ${ampm}`
    } catch (err) {
      console.error("[mapGame] time parse error:", err)
    }
  }

  const homeTeamId = resolveTeamId(apiGame.teams.home.team.name)
  const awayTeamId = resolveTeamId(apiGame.teams.away.team.name)

  const homePitcherId = apiGame.teams.home.pitcher?.id
    ? String(apiGame.teams.home.pitcher.id)
    : `tbd-home-${apiGame.gamePk}`
  const awayPitcherId = apiGame.teams.away.pitcher?.id
    ? String(apiGame.teams.away.pitcher.id)
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
  apiStats: MLBPitcherStats | null,
  pitcherId: string,
  teamId: string,
  pitcherName: string
): Pitcher {
  const defaultEra = 4.0
  const defaultWhip = 1.28
  const defaultStartCount = 3
  const defaultKRate = 0.22
  const defaultBbRate = 0.08

  if (
    !apiStats ||
    !apiStats.seasonStats ||
    !apiStats.seasonStats.pitching ||
    !apiStats.seasonStats.pitching.era
  ) {
    const nrfiRate = estimateNrfiRate(defaultEra)
    return {
      id: pitcherId,
      name: pitcherName,
      teamId,
      throws: "R",
      age: 28,
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
        last5Results: buildLast5(pitcherId, nrfiRate),
        last5RunsAllowed: [0, 1, 0, 1, 0],
        startCount: defaultStartCount,
        homeNrfiRate: nrfiRate + 0.02,
        awayNrfiRate: nrfiRate - 0.02,
      },
      overall: {
        era: defaultEra,
        fip: defaultEra,
        xfip: defaultEra,
        whip: defaultWhip,
        kPer9: defaultKRate * 27,
        bbPer9: defaultBbRate * 27,
        innings: defaultStartCount * 6,
        wins: 0,
        losses: 0,
      },
    }
  }

  const stats = apiStats.seasonStats.pitching

  const era = parseFloat(String(stats.era)) || defaultEra
  // MLB Stats API doesn't always provide WHIP; estimate from hits and walks
  let whip = defaultWhip
  if (stats.hits !== undefined && stats.walks !== undefined && stats.inningsPitched) {
    const ip = parseFloat(String(stats.inningsPitched))
    if (ip > 0) {
      whip = (stats.hits + stats.walks) / ip
    }
  }

  const startCount = stats.gamesStarted ?? defaultStartCount
  const strikeouts = stats.strikeOuts ?? 0
  const walks = stats.walks ?? 0
  const ipRaw = stats.inningsPitched
  const innings = ipRaw ? parseFloat(String(ipRaw)) : startCount * 6

  const kRate = innings > 0 ? strikeouts / (innings / 9) / 27 : defaultKRate
  const bbRate = innings > 0 ? walks / (innings / 9) / 27 : defaultBbRate

  const nrfiRate = estimateNrfiRate(era)
  const firstBatterOBP = (whip / (1 + whip)) * 0.85

  return {
    id: pitcherId,
    name: apiStats.person?.fullName ?? pitcherName,
    teamId,
    throws: "R",
    age: 28,
    firstInning: {
      era,
      whip,
      kRate,
      bbRate,
      hrPer9: 1.1,
      babip: 0.3,
      nrfiRate,
      avgRunsAllowed: 1 - nrfiRate,
      firstBatterOBP,
      last5Results: buildLast5(pitcherId, nrfiRate),
      last5RunsAllowed: [0, 1, 0, 1, 0],
      startCount,
      homeNrfiRate: nrfiRate + 0.02,
      awayNrfiRate: nrfiRate - 0.02,
    },
    overall: {
      era,
      fip: era,
      xfip: era,
      whip,
      kPer9: kRate * 27,
      bbPer9: bbRate * 27,
      innings,
      wins: 0,
      losses: 0,
    },
  }
}

/** Deterministic last-5 results array seeded by pitcher ID */
function buildLast5(pitcherId: string, nrfiRate: number): boolean[] {
  return Array.from({ length: 5 }, (_, i) => {
    const seed =
      (pitcherId.charCodeAt(i % pitcherId.length) + i) % 100
    return seed < nrfiRate * 100
  })
}

// ─── mapTeam ──────────────────────────────────────────────────────────────────

function mapTeam(
  apiTeamStats: MLBTeamStats | null,
  teamId: string
): Team {
  const staticInfo = MLB_TEAMS[teamId]

  const defaultOps = 0.72
  const opsValue = apiTeamStats?.stats?.hitting?.ops
  const ops = opsValue ? parseFloat(String(opsValue)) || defaultOps : defaultOps

  const offenseFactor = estimateOffenseFactor(ops)
  const runsPerGame = offenseFactor * 0.48
  const yrfiRate = 1 - Math.exp(-runsPerGame)

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
      woba: ops * 0.38,
      kRate: 0.22,
      bbRate: 0.08,
      yrfiRate,
      homeYrfiRate: yrfiRate + 0.02,
      awayYrfiRate: yrfiRate - 0.02,
      last10YrfiRate: yrfiRate,
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

      const homePitcherApiId = apiGame.teams.home.pitcher?.id
      const awayPitcherApiId = apiGame.teams.away.pitcher?.id

      const venue = apiGame.venue?.name ?? "Unknown Stadium"

      const [homeTeamStats, awayTeamStats, homePitcherStats, awayPitcherStats, weather] =
        await Promise.all([
          fetchTeamStats(homeTeamApiId),
          fetchTeamStats(awayTeamApiId),
          homePitcherApiId ? fetchPitcherStats(homePitcherApiId) : Promise.resolve(null),
          awayPitcherApiId ? fetchPitcherStats(awayPitcherApiId) : Promise.resolve(null),
          fetchVenueWeather(venue),
        ])

      return {
        apiGame,
        homeTeamStats,
        awayTeamStats,
        homePitcherStats,
        awayPitcherStats,
        weather,
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
  } of perGameData) {
    // Resolve odds
    const oddsEvent = matchOddsEvent(
      apiGame.teams.home.team.name,
      apiGame.teams.away.team.name,
      oddsEvents
    )
    const extractedOdds = oddsEvent ? extractNrfiOdds(oddsEvent) : null
    const gameOdds: GameOdds | undefined = extractedOdds ?? undefined

    // Map the game
    const game = mapGame(apiGame, weather, gameOdds, date)
    games.push(game)

    // Map pitchers
    const homePitcherName = apiGame.teams.home.pitcher?.fullName ?? "TBD"
    const awayPitcherName = apiGame.teams.away.pitcher?.fullName ?? "TBD"

    const homePitcher = mapPitcher(
      homePitcherStats,
      game.homePitcherId,
      game.homeTeamId,
      homePitcherName
    )
    const awayPitcher = mapPitcher(
      awayPitcherStats,
      game.awayPitcherId,
      game.awayTeamId,
      awayPitcherName
    )

    pitchers.set(homePitcher.id, homePitcher)
    pitchers.set(awayPitcher.id, awayPitcher)

    // Map teams
    if (!teams.has(game.homeTeamId)) {
      teams.set(game.homeTeamId, mapTeam(homeTeamStats, game.homeTeamId))
    }
    if (!teams.has(game.awayTeamId)) {
      teams.set(game.awayTeamId, mapTeam(awayTeamStats, game.awayTeamId))
    }
  }

  return { games, pitchers, teams }
}
