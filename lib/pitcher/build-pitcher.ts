import type { MLBPitcherSeasonStats } from "@/lib/api/mlb-stats"
import type { Pitcher, StatcastPitcherSummary } from "@/lib/types"

/** One prior first-inning result (subset of FirstInningResult) used for sparklines. */
interface Last5FirstInning {
  nrfi: boolean
  runs?: number
}

/**
 * Build a domain `Pitcher` from MLB season stats, deriving first-inning and
 * overall rate stats. Shared by the pitcher deep-dive page and the staff page
 * so both render identical figures from the same MLB Stats API source.
 *
 * `last5` (recent first-inning results) defaults to empty; `statcast` is
 * attached only when provided. Mirrors the original inline builder exactly so
 * existing pages render unchanged.
 */
export function buildPitcherFromStats(
  id: string,
  apiStats: MLBPitcherSeasonStats,
  last5: Last5FirstInning[] = [],
  teamId = "unknown",
  statcast: StatcastPitcherSummary | null = null,
): Pitcher {
  const era = apiStats.era ?? 4.0
  const nrfi = Math.exp(-era * 0.95 / 9)
  // K%/BB% per batter faced (BF ≈ 3×IP + H + BB), used as a first-inning rate
  // proxy. The previous `K / (gamesStarted × 3.5)` divided full-season totals by
  // a first-inning batter count, yielding impossible >100% rates for starters.
  const estBF = (apiStats.inningsPitched ?? 0) * 3 + apiStats.hits + apiStats.baseOnBalls
  const kRate = estBF > 0 ? Math.min(1, apiStats.strikeOuts / estBF) : 0.22
  const bbRate = estBF > 0 ? Math.min(1, apiStats.baseOnBalls / estBF) : 0.08
  const pitcher: Pitcher = {
    id,
    name: apiStats.fullName,
    teamId,
    throws: apiStats.throws ?? "R",
    age: 0,
    firstInning: {
      era,
      whip: apiStats.whip ?? 1.25,
      kRate,
      bbRate,
      hrPer9: (apiStats.inningsPitched ?? 0) > 0
        ? (apiStats.homeRuns / (apiStats.inningsPitched / 9))
        : 1.0,
      babip: 0.290,
      nrfiRate: nrfi,
      avgRunsAllowed: era / 9,
      firstBatterOBP: 0.300,
      last5Results: last5.map((r) => r.nrfi),
      last5RunsAllowed: last5.map((r) => r.runs ?? 0),
      startCount: apiStats.gamesStarted,
      homeNrfiRate: nrfi * 1.02,
      awayNrfiRate: nrfi * 0.98,
    },
    overall: {
      era,
      fip: era - 0.2,
      xfip: era + 0.1,
      whip: apiStats.whip ?? 1.25,
      kPer9: (apiStats.inningsPitched ?? 0) > 0
        ? (apiStats.strikeOuts / (apiStats.inningsPitched / 9))
        : 8.5,
      bbPer9: (apiStats.inningsPitched ?? 0) > 0
        ? (apiStats.baseOnBalls / (apiStats.inningsPitched / 9))
        : 2.8,
      innings: apiStats.inningsPitched ?? 0,
      wins: apiStats.wins ?? 0,
      losses: apiStats.losses ?? 0,
    },
  }
  if (statcast) pitcher.statcast = statcast
  return pitcher
}
