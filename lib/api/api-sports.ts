const BASE_URL = process.env.API_SPORTS_BASE_URL ?? "https://v1.baseball.api-sports.io"
const API_KEY = process.env.API_SPORTS_KEY ?? ""
const MLB_LEAGUE_ID = parseInt(process.env.API_SPORTS_LEAGUE_ID ?? "1", 10)
const MLB_SEASON = process.env.NEXT_PUBLIC_MLB_SEASON ?? "2026"

interface ApiSportsGame {
  id: number
  date: string
  time: string
  status: { short: string }
  league: { id: number; name: string }
  teams: {
    home: { id: number; name: string }
    away: { id: number; name: string }
  }
  venue?: { name?: string; city?: string }
  pitchers?: {
    home?: { id?: number; name?: string }
    away?: { id?: number; name?: string }
  }
}

interface ApiSportsPitcherStats {
  player: { id: number; name: string }
  team: { id: number; name: string }
  statistics: Array<{
    games: { start: number; innings_pitched?: string | number }
    era: string | number
    whip: string | number
    strikeouts: number | { total: number }
    walks: number | { total: number }
    runs?: { allowed: number }
    hits?: { allowed: number }
    home_runs?: { allowed: number }
    saves?: number
  }>
}

interface ApiSportsTeamStats {
  team: { id: number; name: string }
  statistics: Array<{
    batting?: {
      average?: string | number
      obp?: string | number
      slg?: string | number
      ops?: string | number
      runs?: { total: number }
      games?: number
    }
  }>
}

export type { ApiSportsGame, ApiSportsPitcherStats, ApiSportsTeamStats }

async function apiFetch<T>(path: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: process.env.API_SPORTS_RAPIDAPI_HOST
        ? {
            "x-rapidapi-key": API_KEY,
            "x-rapidapi-host": process.env.API_SPORTS_RAPIDAPI_HOST,
          }
        : {
            "x-apisports-key": API_KEY,
          },
      next: { revalidate },
    })
    if (!res.ok) {
      console.error(`[api-sports] HTTP ${res.status} for ${path}`)
      return null
    }
    const json = await res.json()
    return json as T
  } catch (err) {
    console.error(`[api-sports] fetch error for ${path}:`, err)
    return null
  }
}

export async function fetchGamesByDate(date: string): Promise<ApiSportsGame[]> {
  const data = await apiFetch<{ response: ApiSportsGame[] }>(
    `/games?league=${MLB_LEAGUE_ID}&season=${MLB_SEASON}&date=${date}`,
    300
  )
  return data?.response ?? []
}

export async function fetchPitcherStats(playerId: number): Promise<ApiSportsPitcherStats | null> {
  const data = await apiFetch<{ response: ApiSportsPitcherStats[] }>(
    `/players/statistics?league=${MLB_LEAGUE_ID}&season=${MLB_SEASON}&player=${playerId}`,
    3600
  )
  return data?.response?.[0] ?? null
}

export async function fetchTeamStats(teamId: number): Promise<ApiSportsTeamStats | null> {
  const data = await apiFetch<{ response: ApiSportsTeamStats[] }>(
    `/teams/statistics?league=${MLB_LEAGUE_ID}&season=${MLB_SEASON}&team=${teamId}`,
    3600
  )
  return data?.response?.[0] ?? null
}
