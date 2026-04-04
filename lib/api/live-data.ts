import { fetchGamesByDate, fetchPitcherStats, fetchTeamStats } from "./api-sports"
import type { ApiSportsGame, ApiSportsPitcherStats, ApiSportsTeamStats } from "./api-sports"
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
  apiGame: ApiSportsGame,
  weather: Weather,
  odds: GameOdds | undefined,
  date: string
): Game {
  const venue = apiGame.venue?.name ?? "Unknown Stadium"
  const parkFactor = STADIUM_PARK_FACTORS[venue] ?? 1.0

  // Convert UTC time to ET by subtracting 5 hours (rough; good enough for display)
  let displayTime = "7:05 PM"
  if (apiGame.time) {
    const [hStr, mStr] = apiGame.time.split(":")
    let hour = parseInt(hStr, 10) - 5
    const minute = mStr ?? "00"
    if (hour < 0) hour += 24
    const ampm = hour >= 12 ? "PM" : "AM"
    const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
    displayTime = `${hour12}:${minute} ${ampm}`
  }

  const homeTeamId = resolveTeamId(apiGame.teams.home.name)
  const awayTeamId = resolveTeamId(apiGame.teams.away.name)

  const homePitcherId = apiGame.pitchers?.home?.id
    ? String(apiGame.pitchers.home.id)
    : `tbd-home-${apiGame.id}`
  const awayPitcherId = apiGame.pitchers?.away?.id
    ? String(apiGame.pitchers.away.id)
    : `tbd-away-${apiGame.id}`

  return {
    id: String(apiGame.id),
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
  apiStats: ApiSportsPitcherStats | null,
  pitcherId: string,
  teamId: string,
  pitcherName: string
): Pitcher {
  const defaultEra = 4.0
  const defaultWhip = 1.28
  const defaultStartCount = 3
  const defaultKRate = 0.22
  const defaultBbRate = 0.08

  if (!apiStats || !apiStats.statistics || apiStats.statistics.length === 0) {
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

  const stats = apiStats.statistics[0]

  const era = parseFloat(String(stats.era)) || defaultEra
  const whip = parseFloat(String(stats.whip)) || defaultWhip
  const startCount = stats.games?.start ?? defaultStartCount

  const rawK = stats.strikeouts
  const strikeouts = typeof rawK === "number" ? rawK : rawK?.total ?? 0

  const rawBB = stats.walks
  const walks = typeof rawBB === "number" ? rawBB : rawBB?.total ?? 0

  const ipRaw = stats.games?.innings_pitched
  const innings = ipRaw ? parseFloat(String(ipRaw)) : startCount * 6

  const kRate = innings > 0 ? strikeouts / (innings / 9) / 27 : defaultKRate
  const bbRate = innings > 0 ? walks / (innings / 9) / 27 : defaultBbRate

  const nrfiRate = estimateNrfiRate(era)
  const firstBatterOBP = (whip / (1 + whip)) * 0.85

  return {
    id: pitcherId,
    name: apiStats.player?.name ?? pitcherName,
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
  apiTeamStats: ApiSportsTeamStats | null,
  teamId: string
): Team {
  const staticInfo = MLB_TEAMS[teamId]

  const defaultOps = 0.72
  const defaultOpsNumber = apiTeamStats?.statistics?.[0]?.batting?.ops
  const ops = defaultOpsNumber ? parseFloat(String(defaultOpsNumber)) || defaultOps : defaultOps

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
      const homeTeamApiId = apiGame.teams.home.id
      const awayTeamApiId = apiGame.teams.away.id

      const homePitcherApiId = apiGame.pitchers?.home?.id
      const awayPitcherApiId = apiGame.pitchers?.away?.id

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
      apiGame.teams.home.name,
      apiGame.teams.away.name,
      oddsEvents
    )
    const extractedOdds = oddsEvent ? extractNrfiOdds(oddsEvent) : null
    const gameOdds: GameOdds | undefined = extractedOdds ?? undefined

    // Map the game
    const game = mapGame(apiGame, weather, gameOdds, date)
    games.push(game)

    // Map pitchers
    const homePitcherName = apiGame.pitchers?.home?.name ?? "TBD"
    const awayPitcherName = apiGame.pitchers?.away?.name ?? "TBD"

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
