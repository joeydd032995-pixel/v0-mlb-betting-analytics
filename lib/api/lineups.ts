/**
 * Probable-lineup fetcher for first-inning batting order.
 *
 * MLB Stats API exposes the actual batting order via the boxscore endpoint
 * once it's posted (~2 hours pre-game).  When unavailable we return null and
 * the caller should impute from the team's most-frequent top-4 vs the same
 * pitcher hand over the last 7 days.
 */

import type { Hand, Lineup, LineupSlot } from "@/lib/types"

interface BoxscorePlayer {
  person: { id: number; fullName: string }
  battingOrder?: string
  position?: { abbreviation: string }
  stats?: unknown
}

interface BoxscoreTeam {
  team: { id: number; name: string }
  batters: number[]
  players: Record<string, BoxscorePlayer>
  battingOrder?: number[]
}

interface BoxscoreResponse {
  teams: { home: BoxscoreTeam; away: BoxscoreTeam }
}

const BASE = "https://statsapi.mlb.com/api/v1"

function batterHand(_player: BoxscorePlayer): Hand {
  // The boxscore doesn't always carry batsHand; default to R.  Phase 6 will
  // fold in the people endpoint to enrich this.
  return "R"
}

/**
 * Fetch the home/away first-inning lineup for a given gamePk.
 * Returns null when the boxscore hasn't been posted yet or when fetch fails.
 */
export async function fetchProbableLineup(gamePk: string | number): Promise<{ home?: Lineup; away?: Lineup } | null> {
  try {
    const res = await fetch(`${BASE}/game/${gamePk}/boxscore`, { next: { revalidate: 300 } })
    if (!res.ok) return null
    const data = (await res.json()) as BoxscoreResponse
    if (!data?.teams) return null

    const buildLineup = (side: "home" | "away"): Lineup | undefined => {
      const team = data.teams[side]
      if (!team) return undefined
      const order = team.battingOrder ?? []
      if (order.length === 0) return undefined
      const slots: LineupSlot[] = order.slice(0, 9).map((playerId, idx) => {
        const p = team.players[`ID${playerId}`]
        return {
          order: idx + 1,
          mlbamId: String(playerId),
          hand: p ? batterHand(p) : "R",
        }
      })
      return { gamePk: String(gamePk), teamId: String(team.team.id), slots }
    }

    return { home: buildLineup("home"), away: buildLineup("away") }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[lineups] fetch failed for game ${gamePk}:`, (err as Error).message)
    }
    return null
  }
}
