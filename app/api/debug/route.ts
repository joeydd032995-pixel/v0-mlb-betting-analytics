/**
 * Debug endpoint — diagnoses MLB Stats API connectivity and game data availability.
 * GET /api/debug
 *
 * Uses the free MLB Stats API (no authentication required).
 */
import { NextResponse } from "next/server"

const MLB_API_BASE = "https://statsapi.mlb.com/api/v1"
const SEASON = process.env.NEXT_PUBLIC_MLB_SEASON ?? "2026"

async function mlbApiGet(path: string) {
  try {
    const res = await fetch(`${MLB_API_BASE}${path}`, {
      cache: "no-store",
    })
    const json = await res.json()
    return { status: res.status, data: json }
  } catch (e) {
    return { fetchError: String(e) }
  }
}

export const dynamic = "force-dynamic"

export async function GET() {
  const today = new Date().toISOString().split("T")[0]

  // Test MLB Stats API endpoints
  const [schedule, teams, leagues] = await Promise.all([
    mlbApiGet(`/schedule?sportId=1&date=${today}`),
    mlbApiGet(`/teams?sportId=1`),
    mlbApiGet(`/leagues?sportId=1`),
  ])

  // Count games in the schedule response
  let gameCount = 0
  let gameDetails: any[] = []
  if (schedule.data?.dates?.[0]?.games) {
    gameCount = schedule.data.dates[0].games.length
    gameDetails = schedule.data.dates[0].games.slice(0, 2).map((g: any) => ({
      gameId: g.gamePk,
      matchup: `${g.teams.away.team.name} @ ${g.teams.home.team.name}`,
      time: g.gameDateTime,
      homeStarter: g.teams.home.probablePitcher?.fullName ?? "TBD",
      awayStarter: g.teams.away.probablePitcher?.fullName ?? "TBD",
    }))
  }

  return NextResponse.json(
    {
      timestamp: new Date().toISOString(),
      today,
      season: SEASON,

      // MLB Stats API status
      mlbApi: {
        baseUrl: MLB_API_BASE,
        authentication: "NONE (Free API) ✓",
        status: schedule.status === 200 ? "🟢 Online" : `🔴 Error (${schedule.status})`,
      },

      // Today's schedule
      schedule: {
        status: schedule.status,
        todayGameCount: gameCount,
        sampleGames: gameDetails,
        fullScheduleUrl: `${MLB_API_BASE}/schedule?sportId=1&date=${today}`,
      },

      // Teams info
      teams: {
        status: teams.status,
        teamCount: teams.data?.teams?.length ?? 0,
        mlbTeams: teams.data?.teams?.map((t: any) => ({
          id: t.id,
          name: t.name,
          abbreviation: t.abbreviation,
        })) ?? [],
      },

      // Leagues info
      leagues: {
        status: leagues.status,
        leaguesFound: leagues.data?.leagues?.map((l: any) => ({
          id: l.id,
          name: l.name,
        })) ?? [],
      },

      // Sample pitcher stats test (if we have a game)
      ...(gameDetails.length > 0 && gameDetails[0].homeStarter !== "TBD"
        ? {
            pitcherStatsExample: {
              apiUrl: `${MLB_API_BASE}/people/{pitcherId}?hydrate=stats(group=[pitching])`,
              note: "Replace {pitcherId} with actual pitcher ID from schedule response",
            },
          }
        : {}),

      // Summary
      summary: {
        mlbStatsApiWorking: schedule.status === 200,
        gamesAvailable: gameCount > 0,
        readyForPredictions: schedule.status === 200 && gameCount > 0,
        nextSteps: [
          "✓ MLB Stats API is working (no auth needed)",
          `✓ Found ${gameCount} games for ${today}`,
          "✓ Ready to make predictions",
          "Ensure THE_ODDS_API_KEY and OPENWEATHER_API_KEY are set for complete predictions",
        ],
      },
    },
    { headers: { "Content-Type": "application/json" } }
  )
}
