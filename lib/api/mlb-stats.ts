/**
 * MLB Stats API Client (mlb.com's official free API)
 * Base URL: https://statsapi.mlb.com/api/v1
 * No authentication required
 */

interface MLBGame {
  gamePk: number
  gameDateTime: string
  status: { abstractGameState: string; detailedState: string }
  teams: {
    home: {
      team: { id: number; name: string }
      pitcher?: { id: number; fullName: string }
    }
    away: {
      team: { id: number; name: string }
      pitcher?: { id: number; fullName: string }
    }
  }
  venue?: { name?: string; city?: string }
}

interface MLBPitcherStats {
  person: { id: number; fullName: string }
  seasonStats: {
    pitching: {
      gamesStarted?: number
      era?: string
      whip?: string
      strikeOuts?: number
      walks?: number
      inningsPitched?: string
      hits?: number
      homeRuns?: number
      runsAllowed?: number
    }
  }
}

interface MLBTeamStats {
  team: { id: number; name: string }
  stats: {
    hitting: {
      avg?: string
      obp?: string
      slg?: string
      ops?: string
      runs?: number
      gamesPlayed?: number
    }
  }
}

export type { MLBGame, MLBPitcherStats, MLBTeamStats }

const BASE_URL = "https://statsapi.mlb.com/api/v1"

async function mlbFetch<T>(path: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      next: { revalidate },
    })
    if (!res.ok) {
      console.error(`[mlb-stats] HTTP ${res.status} for ${path}`)
      return null
    }
    const json = await res.json()
    return json as T
  } catch (err) {
    console.error(`[mlb-stats] fetch error for ${path}:`, err)
    return null
  }
}

export async function fetchGamesByDate(date: string): Promise<MLBGame[]> {
  // Expected format: YYYY-MM-DD
  const data = await mlbFetch<{ dates: Array<{ games: MLBGame[] }> }>(
    `/schedule?sportId=1&date=${date}`,
    300
  )
  return data?.dates?.[0]?.games ?? []
}

export async function fetchPitcherStats(playerId: number): Promise<MLBPitcherStats | null> {
  const data = await mlbFetch<{ people: MLBPitcherStats[] }>(
    `/people/${playerId}?hydrate=stats(group=[pitching])`,
    3600
  )
  const pitcher = data?.people?.[0]
  if (!pitcher) return null
  return pitcher
}

export async function fetchTeamStats(teamId: number): Promise<MLBTeamStats | null> {
  const data = await mlbFetch<{ stats: Array<{ type: string; stats: any }> }>(
    `/teams/${teamId}?hydrate=stats`,
    3600
  )

  if (!data) return null

  // Extract batting stats from hydrated data
  const bittingStats = data.stats?.find((s) => s.type?.displayName === "season")?.stats ?? {}

  return {
    team: { id: teamId, name: "" },
    stats: {
      hitting: {
        avg: bittingStats.avg,
        obp: bittingStats.obp,
        slg: bittingStats.slg,
        ops: bittingStats.ops,
        runs: bittingStats.runs,
        gamesPlayed: bittingStats.gamesPlayed,
      },
    },
  }
}
