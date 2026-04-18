/**
 * MLB Stats API Client (mlb.com's official free API)
 * Base URL: https://statsapi.mlb.com/api/v1
 * No authentication required
 */

const BASE_URL = "https://statsapi.mlb.com/api/v1"
const SEASON = process.env.NEXT_PUBLIC_MLB_SEASON ?? "2026"

// ─── Wire types (match actual API JSON shape) ─────────────────────────────────

/** One game object returned inside /schedule dates[].games[] */
export interface MLBGame {
  gamePk: number
  /** ISO-8601 UTC datetime — the actual field name in the MLB API is "gameDate",
   *  e.g. "2026-04-05T23:10:00Z".  Despite the name it contains the full timestamp. */
  gameDate?: string
  status: { abstractGameState: string; detailedState: string }
  teams: {
    home: {
      team: { id: number; name: string }
      /** Field is literally "probablePitcher" in the MLB API response */
      probablePitcher?: { id: number; fullName: string }
    }
    away: {
      team: { id: number; name: string }
      probablePitcher?: { id: number; fullName: string }
    }
  }
  venue?: { id?: number; name?: string }
}

/** Per-inning line score entry */
export interface MLBInning {
  num: number
  home: { runs?: number; hits?: number; errors?: number; leftOnBase?: number }
  away: { runs?: number; hits?: number; errors?: number; leftOnBase?: number }
}

/** Full linescore for a game */
export interface MLBLinescore {
  currentInning?: number
  inningState?: string  // "Top" | "Middle" | "Bottom" | "End"
  innings: MLBInning[]
  teams: {
    home: { runs?: number; hits?: number; errors?: number }
    away: { runs?: number; hits?: number; errors?: number }
  }
}

/**
 * Cleaned pitcher season stats — flattened from the API's nested
 * people[0].stats[].splits[0].stat shape.
 */
export interface MLBPitcherSeasonStats {
  fullName: string
  gamesStarted: number
  era: number
  whip: number
  strikeOuts: number
  baseOnBalls: number
  inningsPitched: number
  hits: number
  homeRuns: number
}

/**
 * Cleaned team hitting stats — flattened from the API's nested
 * stats[].splits[0].stat shape.
 */
export interface MLBTeamHittingStats {
  gamesPlayed: number
  ops: number
  obp: number
  avg: number
  slg: number
  runs: number
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function mlbFetch<T>(path: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      next: { revalidate },
    })
    if (!res.ok) {
      console.error(`[mlb-stats] HTTP ${res.status} for ${path}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.error(`[mlb-stats] fetch error for ${path}:`, err)
    return null
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns today's MLB game slate. Each game includes probablePitcher if announced.
 *
 * `hydrate=probablePitcher` is required — without it the MLB Stats API omits
 * the probablePitcher field entirely from the schedule response.
 * `gameType=R` restricts to regular season only (excludes spring training, playoffs).
 */
export async function fetchGamesByDate(date: string): Promise<MLBGame[]> {
  const data = await mlbFetch<{ dates: Array<{ games: MLBGame[] }> }>(
    `/schedule?sportId=1&date=${date}&hydrate=probablePitcher&gameType=R`,
    300
  )
  return data?.dates?.[0]?.games ?? []
}

/**
 * Fetches the inning-by-inning linescore for a completed (or in-progress) game.
 *   GET /game/{gamePk}/linescore
 *
 * The innings array is ordered 1-9 (or more for extras). Each entry has:
 *   { num, home: { runs, hits, errors }, away: { runs, hits, errors } }
 *
 * For 1st-inning results we use: innings.find(i => i.num === 1)
 *
 * Returns null if the game hasn't started or the API returned no data.
 */
export async function fetchGameLinescore(
  gamePk: number
): Promise<MLBLinescore | null> {
  // Revalidate every 60s — we want reasonably fresh data without hammering the API.
  const data = await mlbFetch<{ liveData?: { linescore?: MLBLinescore }; linescore?: MLBLinescore }>(
    `/game/${gamePk}/linescore`,
    60
  )

  // The linescore endpoint returns the linescore directly at the root level
  if (!data) return null

  // Some versions of the API nest under liveData; handle both
  const ls = (data as unknown as MLBLinescore).innings
    ? (data as unknown as MLBLinescore)
    : data.liveData?.linescore ?? data.linescore ?? null

  if (!ls || !ls.innings || ls.innings.length === 0) return null
  return ls
}

/**
 * Fetches a pitcher's current-season pitching stats via:
 *   /people/{id}?hydrate=stats(group=[pitching],type=[season])&season=YYYY
 *
 * The API returns: people[0].stats[].splits[0].stat
 * MLB API uses "baseOnBalls" for walks — not "walks".
 *
 * Returns null if the player has no stats yet this season (e.g. just called up).
 */
export async function fetchPitcherStats(
  playerId: number
): Promise<MLBPitcherSeasonStats | null> {
  type RawSplit = {
    stat: {
      gamesStarted?: number
      era?: string
      whip?: string
      strikeOuts?: number
      baseOnBalls?: number
      inningsPitched?: string
      hits?: number
      homeRuns?: number
    }
  }
  type RawStatGroup = {
    type: { displayName: string }
    group: { displayName: string }
    splits: RawSplit[]
  }
  type RawPerson = {
    id: number
    fullName: string
    stats?: RawStatGroup[]
  }

  const data = await mlbFetch<{ people: RawPerson[] }>(
    `/people/${playerId}?hydrate=stats(group=[pitching],type=[season])&season=${SEASON}`,
    3600
  )

  const person = data?.people?.[0]
  if (!person) return null

  const pitchingSplit = person.stats
    ?.find(
      (s) =>
        s.type?.displayName?.toLowerCase() === "season" &&
        s.group?.displayName?.toLowerCase() === "pitching"
    )
    ?.splits?.[0]?.stat

  // No 2026 stats yet — return name-only record so the pitcher card still shows up
  if (!pitchingSplit) {
    return {
      fullName: person.fullName,
      gamesStarted: 0,
      era: 4.0,
      whip: 1.28,
      strikeOuts: 0,
      baseOnBalls: 0,
      inningsPitched: 0,
      hits: 0,
      homeRuns: 0,
    }
  }

  return {
    fullName: person.fullName,
    gamesStarted: pitchingSplit.gamesStarted ?? 0,
    era: pitchingSplit.era !== undefined ? parseFloat(pitchingSplit.era) : 4.0,
    whip: pitchingSplit.whip !== undefined ? parseFloat(pitchingSplit.whip) : 1.28,
    strikeOuts: pitchingSplit.strikeOuts ?? 0,
    baseOnBalls: pitchingSplit.baseOnBalls ?? 0,
    inningsPitched: parseFloat(pitchingSplit.inningsPitched ?? "0"),
    hits: pitchingSplit.hits ?? 0,
    homeRuns: pitchingSplit.homeRuns ?? 0,
  }
}

/**
 * Fetches a team's current-season hitting stats via:
 *   /teams/{id}/stats?stats=season&group=hitting&season=YYYY
 *
 * The API returns: stats[].splits[0].stat
 *
 * Returns null if the team has no stats yet (very start of season).
 */
export async function fetchTeamStats(
  teamId: number
): Promise<MLBTeamHittingStats | null> {
  type RawSplit = {
    stat: {
      gamesPlayed?: number
      avg?: string
      obp?: string
      slg?: string
      ops?: string
      runs?: number
    }
  }
  type RawStatGroup = {
    type: { displayName: string }
    group: { displayName: string }
    splits: RawSplit[]
  }

  const data = await mlbFetch<{ stats: RawStatGroup[] }>(
    `/teams/${teamId}/stats?stats=season&group=hitting&season=${SEASON}`,
    3600
  )

  const hittingSplit = data?.stats
    ?.find(
      (s) =>
        s.type?.displayName?.toLowerCase() === "season" &&
        s.group?.displayName?.toLowerCase() === "hitting"
    )
    ?.splits?.[0]?.stat

  if (!hittingSplit) return null

  return {
    gamesPlayed: hittingSplit.gamesPlayed ?? 0,
    avg: parseFloat(hittingSplit.avg ?? "0") || 0,
    obp: parseFloat(hittingSplit.obp ?? "0") || 0,
    slg: parseFloat(hittingSplit.slg ?? "0") || 0,
    ops: parseFloat(hittingSplit.ops ?? "0") || 0,
    runs: hittingSplit.runs ?? 0,
  }
}
