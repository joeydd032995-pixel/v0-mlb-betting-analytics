import {
  fetchGamesByDate,
  fetchPitcherStats,
  fetchTeamStats,
  fetchPitcherLast5FirstInnings,
  fetchTeamLast5FirstInnings,
  fetchPitcherFirstInningSplits,
} from "./mlb-stats"
import type {
  MLBGame,
  MLBPitcherSeasonStats,
  MLBTeamHittingStats,
  FirstInningResult,
  PitcherFirstInningSplitStats,
} from "./mlb-stats"
import { fetchAllNrfiOdds, extractNrfiOdds } from "./odds"
import type { OddsEvent } from "./odds"
import { fetchVenueWeather } from "./weather"
import { fetchTeamSplits } from "./sportsblaze"
import { fetchStatcastPitcher } from "./statcast"
import type { Game, Pitcher, Team, Weather, GameOdds, StatcastPitcherSummary } from "../types"
import { MLB_TEAMS } from "../constants/mlb-teams"
import { STADIUM_PARK_FACTORS } from "../constants/mlb-stadiums"
import { PitchingStatsCalculator } from "../advanced-stats"
import type { PitchingStats } from "../advanced-stats"
import {
  resolveTeamId,
  estimateNrfiRate,
  estimateNrfiRateFromFirstInningRuns,
  estimateOffenseFactor,
} from "./shared-helpers"
import { fetchProbableLineup, enrichLineupHands } from "./lineups"
import { FLAGS } from "../config"

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
    // No real batted-ball data from this endpoint. Leave flyBalls at 0 so
    // calculateXFIP falls back to FIP explicitly — the old HR/0.128 estimate
    // made xFIP ≈ FIP by construction while presenting it as independent
    // (AUDIT_REPORT.md P2-6).
    flyBalls: 0,
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
  // "White Sox" and "Red Sox" share the last word "sox".
  // Use the last two words for those teams so odds are never cross-assigned.
  const teamKey = (name: string): string => {
    const words = name.trim().toLowerCase().split(/\s+/)
    if (words.length >= 2 && words[words.length - 1] === "sox") {
      return words.slice(-2).join(" ")
    }
    return words[words.length - 1] ?? ""
  }

  const homeKey = teamKey(homeTeamName)
  const awayKey = teamKey(awayTeamName)

  if (!homeKey || !awayKey) return null

  return (
    events.find(
      (e) =>
        e.home_team.toLowerCase().includes(homeKey) &&
        e.away_team.toLowerCase().includes(awayKey)
    ) ?? null
  )
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
  last5: FirstInningResult[] = [],
  statcast: StatcastPitcherSummary | null = null,
  fiSplits: PitcherFirstInningSplitStats | null = null
): Pitcher {
  const defaultEra = 4.0
  const defaultWhip = 1.28
  const defaultKRate = 0.225
  const defaultBbRate = 0.085

  // If no API data at all, build a fully default pitcher — flagged via
  // statsSource: "default" so downstream consumers can tell it apart from a
  // real prediction input (AUDIT_REPORT.md P2-13).
  if (!apiStats) {
    const nrfiRate = estimateNrfiRate(defaultEra)
    return {
      id: pitcherId,
      name: pitcherName,
      teamId,
      throws: "R",
      age: 0,
      statsSource: "default",
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
      ...(statcast ? { statcast } : {}),
    }
  }

  // MLB Stats API returns flattened stats (MLBPitcherSeasonStats)
  const era = apiStats.era
  const whip = apiStats.whip
  const innings = apiStats.inningsPitched

  // K% and BB% per batter faced (approx: BF ≈ IP × 4.3)
  const bf = Math.max(1, innings * 4.3)
  const kRate = apiStats.strikeOuts / bf
  const bbRate = apiStats.baseOnBalls / bf
  // HR/9
  const hrPer9 = innings > 0 ? (apiStats.homeRuns / innings) * 9 : 1.1

  // ── First-inning fields: REAL i01 splits when available ────────────────────
  // (AUDIT_REPORT.md P0-2.)  The split gives the pitcher's actual first-inning
  // ERA/WHIP/K%/BB%/HR9/BABIP and — critically — actual first-inning RUNS
  // (all runs, the stat NRFI settles on), from which the scoreless-half rate
  // is estimated.  Falls back to the season-ERA proxy when the split is
  // missing (rookie debut, API failure).
  const hasSplits = fiSplits !== null && fiSplits.games >= 1
  const startCount = hasSplits ? fiSplits.games : apiStats.gamesStarted
  const nrfiRate = hasSplits
    ? estimateNrfiRateFromFirstInningRuns(fiSplits.runs / fiSplits.games)
    : estimateNrfiRate(era)

  const fiWhip = hasSplits ? fiSplits.whip : whip
  // firstBatterOBP is a WHIP-derived ESTIMATE (no real leadoff-batter split
  // from this API); UI copy labels it as such.
  const firstBatterOBP = (fiWhip / (1 + fiWhip)) * 0.85

  // Compute FIP and xFIP using PitchingStatsCalculator with available data.
  // No batted-ball data here, so calculateXFIP falls back to FIP explicitly.
  const pitchingShape = buildPitchingStatsShape(apiStats, pitcherId, teamId)
  const fip  = innings > 0 ? PitchingStatsCalculator.calculateFIP(pitchingShape)  : era
  const xfip = innings > 0 ? PitchingStatsCalculator.calculateXFIP(pitchingShape) : era

  return {
    id: pitcherId,
    name: apiStats.fullName,
    teamId,
    throws: apiStats.throws,
    age: 0,
    statsSource: "live",
    firstInning: {
      era:    hasSplits ? fiSplits.era    : era,
      whip:   fiWhip,
      kRate:  hasSplits ? fiSplits.kRate  : kRate,
      bbRate: hasSplits ? fiSplits.bbRate : bbRate,
      hrPer9: hasSplits ? fiSplits.hrPer9 : hrPer9,
      babip:  hasSplits && fiSplits.babip !== null ? fiSplits.babip : 0.3,
      nrfiRate,
      avgRunsAllowed: hasSplits ? fiSplits.runs / fiSplits.games : 1 - nrfiRate,
      firstBatterOBP,
      last5Results: last5.map((r) => r.nrfi),
      last5RunsAllowed: last5.map((r) => r.runs),
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
      wins: apiStats.wins ?? 0,
      losses: apiStats.losses ?? 0,
    },
    ...(statcast ? { statcast } : {}),
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
  // wOBA is scaled to the OBP scale by definition (2024: lg wOBA .312 vs lg
  // OBP .314) — a near-1.0 factor, not the old 0.88 (AUDIT_REPORT.md P2-7).
  const woba = obp * 0.993

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
      // No real home/away or vs-hand split data from this endpoint — use the
      // base rate rather than inventing ±0.02 / ×1.05 offsets that looked
      // like data (AUDIT_REPORT.md P2-12).
      homeYrfiRate: yrfiRate,
      awayYrfiRate: yrfiRate,
      last10YrfiRate: yrfiRate,
      last5Results: last5.map((r) => r.nrfi),
      avgRunsVsRHP: runsPerGame,
      avgRunsVsLHP: runsPerGame,
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

  // 3. Pre-fetch weather deduplicated by venue name.
  // A doubleheader means 2 games at the same ballpark; deduplication avoids
  // duplicate concurrent upstream calls to OpenWeatherMap.
  const DOME_WEATHER_FALLBACK: Weather = { temperature: 72, windSpeed: 0, windDirection: "calm", conditions: "dome", humidity: 50 }
  const uniqueVenues = [
    ...new Set(
      apiGames.map((g) => g.venue?.name ?? "Unknown Stadium")
    ),
  ]
  const weatherByVenue = new Map(
    await Promise.all(
      uniqueVenues.map(async (venue) => [venue, await fetchVenueWeather(venue)] as const)
    )
  )

  // 4. For each game, fetch stats and weather in parallel
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
        homePitcherFiSplits,
        awayPitcherFiSplits,
        weather,
        homePitcherLast5,
        awayPitcherLast5,
        homeTeamLast5,
        awayTeamLast5,
        lineups,
        homePitcherStatcast,
        awayPitcherStatcast,
      ] = await Promise.all([
        fetchTeamStats(homeTeamApiId),
        fetchTeamStats(awayTeamApiId),
        homePitcherApiId ? fetchPitcherStats(homePitcherApiId) : Promise.resolve(null),
        awayPitcherApiId ? fetchPitcherStats(awayPitcherApiId) : Promise.resolve(null),
        // Real first-inning splits (sitCodes=i01) — preferred source for all
        // firstInning.* fields; mapPitcher falls back to the season proxy
        // when null (AUDIT_REPORT.md P0-2).
        homePitcherApiId ? fetchPitcherFirstInningSplits(homePitcherApiId) : Promise.resolve(null),
        awayPitcherApiId ? fetchPitcherFirstInningSplits(awayPitcherApiId) : Promise.resolve(null),
        Promise.resolve(weatherByVenue.get(venue) ?? DOME_WEATHER_FALLBACK),
        homePitcherApiId ? fetchPitcherLast5FirstInnings(homePitcherApiId) : Promise.resolve([]),
        awayPitcherApiId ? fetchPitcherLast5FirstInnings(awayPitcherApiId) : Promise.resolve([]),
        fetchTeamLast5FirstInnings(homeTeamApiId),
        fetchTeamLast5FirstInnings(awayTeamApiId),
        // Only fetch when the flag is on; the lineup card is otherwise unused
        // by the v1 path, so the extra HTTP round-trips would just slow the
        // slate build without changing predictions.
        FLAGS.USE_REAL_LINEUPS
          ? fetchProbableLineup(apiGame.gamePk).then(async (lu) => {
              if (!lu) return null
              await Promise.all([
                lu.home ? enrichLineupHands(lu.home) : Promise.resolve(),
                lu.away ? enrichLineupHands(lu.away) : Promise.resolve(),
              ])
              return lu
            })
          : Promise.resolve(null),
        // Statcast summaries keyed by MLBAM id (== probablePitcher.id). Returns
        // null when the table is empty/unmigrated, so the engine degrades
        // gracefully to league-average defaults (presence=0 in the feature vector).
        homePitcherApiId ? fetchStatcastPitcher(String(homePitcherApiId)) : Promise.resolve(null),
        awayPitcherApiId ? fetchStatcastPitcher(String(awayPitcherApiId)) : Promise.resolve(null),
      ])

      return {
        apiGame,
        homeTeamStats,
        awayTeamStats,
        homePitcherStats,
        awayPitcherStats,
        homePitcherFiSplits,
        awayPitcherFiSplits,
        lineups,
        weather,
        homePitcherLast5,
        awayPitcherLast5,
        homeTeamLast5,
        awayTeamLast5,
        homePitcherStatcast,
        awayPitcherStatcast,
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
    homePitcherFiSplits,
    awayPitcherFiSplits,
    weather,
    homePitcherLast5,
    awayPitcherLast5,
    homeTeamLast5,
    awayTeamLast5,
    lineups,
    homePitcherStatcast,
    awayPitcherStatcast,
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
    if (lineups) {
      game.lineups = {
        home: lineups.home ?? undefined,
        away: lineups.away ?? undefined,
      }
    }
    games.push(game)

    // Map pitchers
    const homePitcherName = apiGame.teams.home.probablePitcher?.fullName ?? "TBD"
    const awayPitcherName = apiGame.teams.away.probablePitcher?.fullName ?? "TBD"

    const homePitcher = mapPitcher(
      homePitcherStats,
      game.homePitcherId,
      game.homeTeamId,
      homePitcherName,
      homePitcherLast5,
      homePitcherStatcast,
      homePitcherFiSplits
    )
    const awayPitcher = mapPitcher(
      awayPitcherStats,
      game.awayPitcherId,
      game.awayTeamId,
      awayPitcherName,
      awayPitcherLast5,
      awayPitcherStatcast,
      awayPitcherFiSplits
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

  // Enrich teams with vsLHP/vsRHP splits from SportsBlaze (optional).
  // Returns immediately when SPORTSBLAZE_API_KEY is unset (fetchTeamSplits → null).
  await Promise.all(
    [...teams.entries()].map(async ([teamId, team]) => {
      const splits = await fetchTeamSplits(teamId)
      if (splits) {
        team.firstInning.vsLHP = splits.vsLHP
        team.firstInning.vsRHP = splits.vsRHP
      }
    })
  )

  return { games, pitchers, teams }
}
