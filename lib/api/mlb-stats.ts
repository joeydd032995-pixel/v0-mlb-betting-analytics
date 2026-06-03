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
  throws: "R" | "L" | "S"
  gamesStarted: number
  era: number
  whip: number
  strikeOuts: number
  baseOnBalls: number
  inningsPitched: number
  hits: number
  homeRuns: number
  wins: number
  losses: number
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
      signal: AbortSignal.timeout(8000),
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

// ─── Point-in-time helpers ────────────────────────────────────────────────────

/**
 * Bayesian blend weight for season-to-date vs prior-season stats.
 * Mirrors the shrinkage weight in lib/nrfi-models.ts:54 (k = within/between var).
 * At 2 starts w≈0.64, at 6 starts w≈0.84 — early-season leans on the prior.
 */
const BLEND_K = 1.14
function blendWeight(sample: number): number {
  return Math.min(0.97, sample / (sample + BLEND_K))
}

/**
 * MLB innings-pitched strings use ".1"/".2" for one/two outs, NOT decimal
 * fractions — "5.1" is 5⅓ innings, not 5.1.  parseFloat would distort every
 * downstream ERA/WHIP/rate calculation.
 */
function parseBaseballInnings(value?: string | null): number {
  if (!value) return 0
  const [whole, frac = "0"] = String(value).split(".")
  const innings = Number(whole) || 0
  if (frac === "1") return innings + 1 / 3
  if (frac === "2") return innings + 2 / 3
  return innings
}


export interface PitcherGameLogSplit {
  date?: string
  stat: {
    gamesStarted?: number
    inningsPitched?: string
    earnedRuns?: number
    strikeOuts?: number
    baseOnBalls?: number
    hits?: number
    homeRuns?: number
  }
}

export interface TeamGameLogSplit {
  date?: string
  stat: {
    atBats?: number
    hits?: number
    baseOnBalls?: number
    hitByPitch?: number
    sacFlies?: number
    totalBases?: number
    runs?: number
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

// ─── First-inning result type ─────────────────────────────────────────────────

export interface FirstInningResult {
  nrfi: boolean
  runs: number
}

function extractFirstInningResult(
  linescore: MLBLinescore,
  isHome: boolean
): FirstInningResult | null {
  const inning1 = linescore.innings.find((i) => i.num === 1)
  if (!inning1) return null
  const runs = isHome ? (inning1.home.runs ?? 0) : (inning1.away.runs ?? 0)
  return { runs, nrfi: runs === 0 }
}

/**
 * Returns the first-inning NRFI/runs-allowed results for a pitcher's last N starts.
 * Fetches the season game log to get gamePks, then fetches each linescore.
 */
export async function fetchPitcherLast5FirstInnings(
  playerId: number,
  limit = 5
): Promise<FirstInningResult[]> {
  type RawSplit = {
    stat: { gamesStarted?: number }
    team: { id: number }
    game: { gamePk: number }
    isHome?: boolean
  }
  type RawStatGroup = {
    type: { displayName: string }
    group: { displayName: string }
    splits: RawSplit[]
  }

  const data = await mlbFetch<{ people: Array<{ stats?: RawStatGroup[] }> }>(
    `/people/${playerId}?hydrate=stats(group=[pitching],type=[gameLog])&season=${SEASON}`,
    3600
  )

  const splits =
    data?.people?.[0]?.stats
      ?.find(
        (s) =>
          s.type?.displayName?.toLowerCase() === "gamelog" &&
          s.group?.displayName?.toLowerCase() === "pitching"
      )
      ?.splits ?? []

  const starts = splits
    .filter((s) => (s.stat.gamesStarted ?? 0) >= 1)
    .slice(-limit)

  if (starts.length === 0) return []

  const linescores = await Promise.all(
    starts.map((s) => fetchGameLinescore(s.game.gamePk))
  )

  return starts
    .map((s, i) => {
      const ls = linescores[i]
      if (!ls) return null
      return extractFirstInningResult(ls, s.isHome ?? false)
    })
    .filter((r): r is FirstInningResult => r !== null)
}

/**
 * Returns the first-inning NRFI results for a team's last N completed games.
 * Fetches the season schedule to get gamePks, then fetches each linescore.
 */
export async function fetchTeamLast5FirstInnings(
  teamApiId: number,
  limit = 5
): Promise<FirstInningResult[]> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
  const seasonStart = `${SEASON}-03-01`

  const data = await mlbFetch<{ dates: Array<{ games: MLBGame[] }> }>(
    `/schedule?sportId=1&teamId=${teamApiId}&startDate=${seasonStart}&endDate=${today}&gameType=R`,
    3600
  )

  const completed = (data?.dates ?? [])
    .flatMap((d) => d.games)
    .filter((g) => g.status.abstractGameState === "Final")
    .slice(-limit)

  if (completed.length === 0) return []

  const linescores = await Promise.all(
    completed.map((g) => fetchGameLinescore(g.gamePk))
  )

  return completed
    .map((g, i) => {
      const ls = linescores[i]
      if (!ls) return null
      return extractFirstInningResult(ls, g.teams.home.team.id === teamApiId)
    })
    .filter((r): r is FirstInningResult => r !== null)
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
  playerId: number,
  season: number | string = SEASON
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
      wins?: number
      losses?: number
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
    pitchHand?: { code: string }
    stats?: RawStatGroup[]
  }

  const data = await mlbFetch<{ people: RawPerson[] }>(
    `/people/${playerId}?hydrate=stats(group=[pitching],type=[season])&season=${season}`,
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

  const throws = (person.pitchHand?.code ?? "R") as "R" | "L" | "S"

  // No stats for this season yet — return name-only record so the pitcher card still shows up
  if (!pitchingSplit) {
    return {
      fullName: person.fullName,
      throws,
      gamesStarted: 0,
      era: 4.0,
      whip: 1.28,
      strikeOuts: 0,
      baseOnBalls: 0,
      inningsPitched: 0,
      hits: 0,
      homeRuns: 0,
      wins: 0,
      losses: 0,
    }
  }

  return {
    fullName: person.fullName,
    throws,
    gamesStarted: pitchingSplit.gamesStarted ?? 0,
    era: parseFloat(pitchingSplit.era ?? "4.0") || 4.0,
    whip: parseFloat(pitchingSplit.whip ?? "1.28") || 1.28,
    strikeOuts: pitchingSplit.strikeOuts ?? 0,
    baseOnBalls: pitchingSplit.baseOnBalls ?? 0,
    inningsPitched: parseBaseballInnings(pitchingSplit.inningsPitched),
    hits: pitchingSplit.hits ?? 0,
    homeRuns: pitchingSplit.homeRuns ?? 0,
    wins: pitchingSplit.wins ?? 0,
    losses: pitchingSplit.losses ?? 0,
  }
}

/** kRate/bbRate/hrPer9 the same way buildLightPitcher derives them, so a
 *  synthesized MLBPitcherSeasonStats round-trips to the intended rates. */
function pitcherRates(s: {
  inningsPitched: number
  strikeOuts: number
  baseOnBalls: number
  homeRuns: number
}): { kRate: number; bbRate: number; hrPer9: number } {
  const bf = Math.max(1, s.inningsPitched * 4.3)
  return {
    kRate: s.strikeOuts / bf,
    bbRate: s.baseOnBalls / bf,
    hrPer9: s.inningsPitched > 0 ? (s.homeRuns / s.inningsPitched) * 9 : 1.1,
  }
}

/**
 * Pure core of fetchPitcherStatsAsOf: given a pitcher's game-log splits, a
 * `beforeDate` cutoff, the prior-season line, and name/handedness, produce the
 * blended point-in-time stats.
 *
 * Aggregates starts strictly before `beforeDate`, then Bayesian-blends
 * season-to-date rates with the prior season so early-season games lean on
 * last year instead of being starved.  The counting-stat fields are
 * synthesized so buildLightPitcher re-derives the blended era/whip/kRate/etc.
 *
 * Returns `prior` (possibly null) when there are no qualifying starts — the
 * caller handles the no-prior fallback.  Network-free, so unit-testable.
 */
export function computePitcherStatsAsOf(
  splits: PitcherGameLogSplit[],
  beforeDate: string,
  prior: MLBPitcherSeasonStats | null,
  meta: { fullName: string; throws: "R" | "L" | "S" }
): MLBPitcherSeasonStats | null {
  const priorStarts = splits.filter(
    (s) => s.date && s.date < beforeDate && (s.stat.gamesStarted ?? 0) >= 1
  )
  if (priorStarts.length === 0) return prior

  let ip = 0
  let er = 0
  let k = 0
  let bb = 0
  let hits = 0
  let hr = 0
  let starts = 0
  for (const g of priorStarts) {
    ip += parseBaseballInnings(g.stat.inningsPitched)
    er += g.stat.earnedRuns ?? 0
    k += g.stat.strikeOuts ?? 0
    bb += g.stat.baseOnBalls ?? 0
    hits += g.stat.hits ?? 0
    hr += g.stat.homeRuns ?? 0
    starts += g.stat.gamesStarted ?? 0
  }

  const tdEra = ip > 0 ? (er * 9) / ip : 4.0
  const tdWhip = ip > 0 ? (bb + hits) / ip : 1.28
  const td = pitcherRates({ inningsPitched: ip, strikeOuts: k, baseOnBalls: bb, homeRuns: hr })

  if (!prior) {
    // No prior season — use raw season-to-date (no blend).
    return {
      fullName: meta.fullName,
      throws: meta.throws,
      gamesStarted: starts,
      era: tdEra,
      whip: tdWhip,
      strikeOuts: k,
      baseOnBalls: bb,
      inningsPitched: ip,
      hits,
      homeRuns: hr,
      wins: 0,
      losses: 0,
    }
  }

  // Bayesian blend: season-to-date weighted by starts, prior fills the rest.
  const w = blendWeight(starts)
  const mix = (toDate: number, priorVal: number) => w * toDate + (1 - w) * priorVal
  const priorRates = pitcherRates(prior)

  const blendedEra = mix(tdEra, prior.era)
  const blendedWhip = mix(tdWhip, prior.whip)
  const blendedKRate = mix(td.kRate, priorRates.kRate)
  const blendedBbRate = mix(td.bbRate, priorRates.bbRate)
  const blendedHrPer9 = mix(td.hrPer9, priorRates.hrPer9)

  // Synthesize counting stats over the real season-to-date IP so
  // buildLightPitcher re-derives exactly the blended rates.
  const bf = Math.max(1, ip * 4.3)
  return {
    fullName: meta.fullName,
    throws: meta.throws,
    gamesStarted: starts,
    era: blendedEra,
    whip: blendedWhip,
    strikeOuts: blendedKRate * bf,
    baseOnBalls: blendedBbRate * bf,
    inningsPitched: ip,
    hits: Math.max(0, blendedWhip * ip - blendedBbRate * bf),
    homeRuns: (blendedHrPer9 * ip) / 9,
    wins: 0,
    losses: 0,
  }
}

/**
 * Point-in-time pitcher stats — fetches the season game log + prior-season line,
 * then delegates to {@link computePitcherStatsAsOf}.  Returns the same
 * MLBPitcherSeasonStats shape as fetchPitcherStats so callers need no changes.
 */
export async function fetchPitcherStatsAsOf(
  playerId: number,
  season: number,
  beforeDate: string
): Promise<MLBPitcherSeasonStats | null> {
  type RawStatGroup = {
    type: { displayName: string }
    group: { displayName: string }
    splits: PitcherGameLogSplit[]
  }

  const data = await mlbFetch<{ people: Array<{ stats?: RawStatGroup[] }> }>(
    `/people/${playerId}?hydrate=stats(group=[pitching],type=[gameLog])&season=${season}`,
    3600
  )
  const splits =
    data?.people?.[0]?.stats?.find(
      (s) =>
        s.type?.displayName?.toLowerCase() === "gamelog" &&
        s.group?.displayName?.toLowerCase() === "pitching"
    )?.splits ?? []

  // Prior-season full line — the Bayesian prior; also the source of name/throws.
  // fetchPitcherStats returns a synthetic 4.00/1.28 record (inningsPitched 0)
  // when the player has no splits for that season.  That's fine for name/throws
  // but must NOT be blended as a real prior — a rookie should take the raw
  // season-to-date path, not get mixed with fabricated numbers.
  const priorRecord = await fetchPitcherStats(playerId, season - 1)
  const metaSource = priorRecord ?? (await fetchPitcherStats(playerId, season))
  const meta = {
    fullName: metaSource?.fullName ?? `Player ${playerId}`,
    throws: metaSource?.throws ?? ("R" as const),
  }
  const prior =
    priorRecord && priorRecord.inningsPitched > 0 ? priorRecord : null

  const result = computePitcherStatsAsOf(splits, beforeDate, prior, meta)
  // result is null only when there were no starts AND no prior — fall back to
  // the current-season league-average record fetchPitcherStats provides.
  return result ?? metaSource ?? fetchPitcherStats(playerId, season)
}

// ─── Active Starters ─────────────────────────────────────────────────────────

export interface ActiveStarter {
  id: string
  name: string
  teamAbbr: string
  teamName: string
  division: string
}

const TEAM_ROSTER_IDS = [
  { numericId: 110, abbr: "BAL", name: "Baltimore Orioles",      division: "AL East"    },
  { numericId: 111, abbr: "BOS", name: "Boston Red Sox",         division: "AL East"    },
  { numericId: 147, abbr: "NYY", name: "New York Yankees",       division: "AL East"    },
  { numericId: 139, abbr: "TB",  name: "Tampa Bay Rays",         division: "AL East"    },
  { numericId: 141, abbr: "TOR", name: "Toronto Blue Jays",      division: "AL East"    },
  { numericId: 145, abbr: "CWS", name: "Chicago White Sox",      division: "AL Central" },
  { numericId: 114, abbr: "CLE", name: "Cleveland Guardians",    division: "AL Central" },
  { numericId: 116, abbr: "DET", name: "Detroit Tigers",         division: "AL Central" },
  { numericId: 118, abbr: "KC",  name: "Kansas City Royals",     division: "AL Central" },
  { numericId: 142, abbr: "MIN", name: "Minnesota Twins",        division: "AL Central" },
  { numericId: 117, abbr: "HOU", name: "Houston Astros",         division: "AL West"    },
  { numericId: 108, abbr: "LAA", name: "Los Angeles Angels",     division: "AL West"    },
  { numericId: 133, abbr: "OAK", name: "Oakland Athletics",      division: "AL West"    },
  { numericId: 136, abbr: "SEA", name: "Seattle Mariners",       division: "AL West"    },
  { numericId: 140, abbr: "TEX", name: "Texas Rangers",          division: "AL West"    },
  { numericId: 144, abbr: "ATL", name: "Atlanta Braves",         division: "NL East"    },
  { numericId: 146, abbr: "MIA", name: "Miami Marlins",          division: "NL East"    },
  { numericId: 121, abbr: "NYM", name: "New York Mets",          division: "NL East"    },
  { numericId: 143, abbr: "PHI", name: "Philadelphia Phillies",  division: "NL East"    },
  { numericId: 120, abbr: "WSH", name: "Washington Nationals",   division: "NL East"    },
  { numericId: 112, abbr: "CHC", name: "Chicago Cubs",           division: "NL Central" },
  { numericId: 113, abbr: "CIN", name: "Cincinnati Reds",        division: "NL Central" },
  { numericId: 158, abbr: "MIL", name: "Milwaukee Brewers",      division: "NL Central" },
  { numericId: 134, abbr: "PIT", name: "Pittsburgh Pirates",     division: "NL Central" },
  { numericId: 138, abbr: "STL", name: "St. Louis Cardinals",    division: "NL Central" },
  { numericId: 109, abbr: "ARI", name: "Arizona Diamondbacks",   division: "NL West"    },
  { numericId: 115, abbr: "COL", name: "Colorado Rockies",       division: "NL West"    },
  { numericId: 119, abbr: "LAD", name: "Los Angeles Dodgers",    division: "NL West"    },
  { numericId: 135, abbr: "SD",  name: "San Diego Padres",       division: "NL West"    },
  { numericId: 137, abbr: "SF",  name: "San Francisco Giants",   division: "NL West"    },
]

type RosterResponse = {
  roster: Array<{
    person: { id: number; fullName: string }
    position: { abbreviation: string }
  }>
}

/**
 * Fetches all active starting pitchers from every MLB team via the roster endpoint.
 * Runs all 30 team requests in parallel via Promise.allSettled.
 * Returns an empty array on total failure — caller should use a static fallback.
 */
export async function fetchAllActiveStarters(): Promise<ActiveStarter[]> {
  const results = await Promise.allSettled(
    TEAM_ROSTER_IDS.map(async (team) => {
      const data = await mlbFetch<RosterResponse>(
        `/teams/${team.numericId}/roster?rosterType=active&season=${SEASON}`,
        3600
      )
      if (!data?.roster) return []
      return data.roster
        .filter((p) => p.position.abbreviation === "SP")
        .map((p) => ({
          id:       String(p.person.id),
          name:     p.person.fullName,
          teamAbbr: team.abbr,
          teamName: team.name,
          division: team.division,
        }))
    })
  )

  const starters: ActiveStarter[] = []
  for (const result of results) {
    if (result.status === "fulfilled") {
      starters.push(...result.value)
    }
  }

  starters.sort((a, b) =>
    a.teamAbbr.localeCompare(b.teamAbbr) || a.name.localeCompare(b.name)
  )

  return starters
}

const TEAM_BY_NUMERIC_ID = new Map(TEAM_ROSTER_IDS.map((t) => [t.numericId, t]))

/** Chunk size kept well under the MLB Stats API URL limit for personIds. */
const PEOPLE_CHUNK = 100

type PeopleResponse = {
  people?: Array<{
    id: number
    fullName: string
    currentTeam?: { id?: number; name?: string }
  }>
}

/**
 * Batch-resolve MLBAM person ids → name/team via `/people?personIds=`.  Chunks
 * the ids (~100 per request) and runs the chunks in parallel with
 * `Promise.allSettled`, so one failed/slow chunk doesn't drop the rest.  Team
 * abbr/division come from the static `TEAM_ROSTER_IDS` registry keyed on the
 * hydrated `currentTeam.id`.  Returns a Map keyed by id string; ids that don't
 * resolve are simply absent.
 */
export async function fetchPeopleByIds(ids: string[]): Promise<Map<string, ActiveStarter>> {
  const out = new Map<string, ActiveStarter>()
  if (ids.length === 0) return out

  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += PEOPLE_CHUNK) {
    chunks.push(ids.slice(i, i + PEOPLE_CHUNK))
  }

  const results = await Promise.allSettled(
    chunks.map((chunk) =>
      mlbFetch<PeopleResponse>(`/people?personIds=${chunk.join(",")}&hydrate=currentTeam`, 3600)
    )
  )

  for (const result of results) {
    if (result.status !== "fulfilled" || !result.value?.people) continue
    for (const person of result.value.people) {
      const team = person.currentTeam?.id ? TEAM_BY_NUMERIC_ID.get(person.currentTeam.id) : undefined
      out.set(String(person.id), {
        id:       String(person.id),
        name:     person.fullName,
        teamAbbr: team?.abbr ?? "—",
        teamName: team?.name ?? person.currentTeam?.name ?? "Free Agent",
        division: team?.division ?? "—",
      })
    }
  }

  return out
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
  teamId: number,
  season: number | string = SEASON
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
    `/teams/${teamId}/stats?stats=season&group=hitting&season=${season}`,
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

/**
 * Pure core of fetchTeamStatsAsOf: aggregates the team's game-log lines strictly
 * BEFORE `beforeDate`, then Bayesian-blends season-to-date OBP/SLG/OPS with the
 * prior season.  Returns `prior` (possibly null) when there are no qualifying
 * games.  Network-free, so unit-testable.
 */
export function computeTeamStatsAsOf(
  splits: TeamGameLogSplit[],
  beforeDate: string,
  prior: MLBTeamHittingStats | null
): MLBTeamHittingStats | null {
  const priorGames = splits.filter((s) => s.date && s.date < beforeDate)
  if (priorGames.length === 0) return prior

  let ab = 0
  let h = 0
  let bb = 0
  let hbp = 0
  let sf = 0
  let tb = 0
  let runs = 0
  for (const g of priorGames) {
    ab += g.stat.atBats ?? 0
    h += g.stat.hits ?? 0
    bb += g.stat.baseOnBalls ?? 0
    hbp += g.stat.hitByPitch ?? 0
    sf += g.stat.sacFlies ?? 0
    tb += g.stat.totalBases ?? 0
    runs += g.stat.runs ?? 0
  }

  const games = priorGames.length
  const obpDenom = ab + bb + hbp + sf
  const tdAvg = ab > 0 ? h / ab : 0.24
  const tdObp = obpDenom > 0 ? (h + bb + hbp) / obpDenom : 0.31
  const tdSlg = ab > 0 ? tb / ab : 0.39
  const tdOps = tdObp + tdSlg

  if (!prior) {
    return { gamesPlayed: games, avg: tdAvg, obp: tdObp, slg: tdSlg, ops: tdOps, runs }
  }

  const w = blendWeight(games)
  const mix = (toDate: number, priorVal: number) => w * toDate + (1 - w) * priorVal
  return {
    gamesPlayed: games,
    avg: mix(tdAvg, prior.avg),
    obp: mix(tdObp, prior.obp),
    slg: mix(tdSlg, prior.slg),
    ops: mix(tdOps, prior.ops),
    runs,
  }
}

/**
 * Point-in-time team hitting stats — fetches the season game log + prior-season
 * line, then delegates to {@link computeTeamStatsAsOf}.
 */
export async function fetchTeamStatsAsOf(
  teamId: number,
  season: number,
  beforeDate: string
): Promise<MLBTeamHittingStats | null> {
  type RawStatGroup = {
    type: { displayName: string }
    group: { displayName: string }
    splits: TeamGameLogSplit[]
  }

  const data = await mlbFetch<{ stats?: RawStatGroup[] }>(
    `/teams/${teamId}/stats?stats=gameLog&group=hitting&season=${season}`,
    3600
  )
  const splits =
    data?.stats?.find(
      (s) =>
        s.type?.displayName?.toLowerCase() === "gamelog" &&
        s.group?.displayName?.toLowerCase() === "hitting"
    )?.splits ?? []

  const prior = await fetchTeamStats(teamId, season - 1)
  const result = computeTeamStatsAsOf(splits, beforeDate, prior)
  return result ?? fetchTeamStats(teamId, season)
}
