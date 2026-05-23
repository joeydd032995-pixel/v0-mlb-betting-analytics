/**
 * SportsBlaze API adapter (optional — enhanced MLB analytics).
 *
 * Provides advanced batting splits (vsLHP / vsRHP), pitcher xStats,
 * and matchup-level analytics not available from the free MLB Stats API.
 *
 * All functions return null gracefully when SPORTSBLAZE_API_KEY is unset,
 * so the engine operates normally without this integration.
 *
 * Auth: Authorization: Bearer header (NOT query param — API keys in URLs
 * are logged by every proxy between client and server).
 */

const API_KEY = process.env.SPORTSBLAZE_API_KEY
const BASE    = process.env.SPORTSBLAZE_BASE_URL ?? "https://api.sportsblaze.com"

function sbHeaders(): HeadersInit {
  return { Authorization: `Bearer ${API_KEY ?? ""}` }
}

export interface SportsBlazeTeamSplits {
  vsLHP: number  // offense factor vs left-handed pitching
  vsRHP: number  // offense factor vs right-handed pitching
}

export interface SportsBlazePitcherSplits {
  vsLHP: number
  vsRHP: number
}

/**
 * Fetch first-inning batting splits for a team.
 * Returns null when key is missing or request fails.
 */
export async function fetchTeamSplits(
  teamId: string
): Promise<SportsBlazeTeamSplits | null> {
  if (!API_KEY) return null
  try {
    const res = await fetch(
      `${BASE}/mlb/v1/teams/${encodeURIComponent(teamId)}/splits`,
      { headers: sbHeaders(), next: { revalidate: 300 } }
    )
    if (!res.ok) {
      console.error(`[sportsblaze] HTTP ${res.status} for team ${teamId}`)
      return null
    }
    return res.json()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[sportsblaze] fetchTeamSplits error:", msg)
    return null
  }
}

/**
 * Fetch first-inning batting splits for a pitcher.
 * Returns null when key is missing or request fails.
 */
export async function fetchPitcherSplits(
  playerId: string
): Promise<SportsBlazePitcherSplits | null> {
  if (!API_KEY) return null
  try {
    const res = await fetch(
      `${BASE}/mlb/v1/players/${encodeURIComponent(playerId)}/splits`,
      { headers: sbHeaders(), next: { revalidate: 300 } }
    )
    if (!res.ok) {
      console.error(`[sportsblaze] HTTP ${res.status} for player ${playerId}`)
      return null
    }
    return res.json()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[sportsblaze] fetchPitcherSplits error:", msg)
    return null
  }
}
