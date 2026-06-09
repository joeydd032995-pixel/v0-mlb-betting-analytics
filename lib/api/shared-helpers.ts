/**
 * Shared helpers used by both lib/api/live-data.ts and app/api/historical-sync/route.ts.
 * Kept here so that any change to defaults or formulas applies consistently to both paths.
 */

import { getTeamByName } from "../constants/mlb-teams"
import { LEAGUE_AVG_NRFI, LEAGUE_HALF_NRFI } from "../nrfi-models"
import { CONFIG } from "../config"

/**
 * Resolve a human-readable MLB team name (as returned by the API) to the
 * internal 2–3-char team ID used throughout the app (e.g. "nyy", "tb", "cws").
 * Falls back to a slugified version of the last word when the name is unknown.
 */
export function resolveTeamId(apiName: string): string {
  const team = getTeamByName(apiName)
  if (!team) {
    const words = apiName.trim().split(/\s+/)
    const last = words[words.length - 1]?.toLowerCase() ?? ""
    if (last === "sox" && words.length >= 2) {
      return (words[words.length - 2]!.toLowerCase() + last).slice(0, 8)
    }
    return last.slice(0, 3) || "unk"
  }
  return team.id
}

/**
 * League-average first-inning runs per half-inning (one team's at-bat).
 * Consistent with LEAGUE_HALF_NRFI: at this scoring rate the empirical
 * P(scoreless half) is √LEAGUE_AVG_NRFI ≈ 0.718.
 */
export const LEAGUE_FIRST_INNING_RUNS_PER_HALF = 0.52

// Calibration coefficients for the two ERA/runs → P(scoreless half) transforms
// below.  Both are anchored so that a league-average input maps exactly to
// LEAGUE_HALF_NRFI.  The coefficients are < 1 because real run scoring is
// "clumped" (overdispersed): a pure Poisson e^(−λ) materially underestimates
// P(0 runs).  Anchoring to the empirical league rate absorbs both that
// clumping and the first-inning fresh-arm advantage.
const ERA_COEF = (-9 * Math.log(LEAGUE_HALF_NRFI)) / CONFIG.league.ERA            // ≈ 0.723
const RUNS_COEF = -Math.log(LEAGUE_HALF_NRFI) / LEAGUE_FIRST_INNING_RUNS_PER_HALF // ≈ 0.636

/**
 * Estimate a pitcher's probability of a scoreless half-inning (his half of the
 * 1st) from overall season ERA:
 *
 *   P(0 runs in his 1st inning) ≈ e^(−c · ERA / 9),  c ≈ 0.723
 *
 * c is derived at module load so that estimateNrfiRate(league ERA) ===
 * LEAGUE_HALF_NRFI (≈ 0.718) — see the calibration note above.  This is the
 * HALF-INNING scale used throughout the engine (the game-level league NRFI
 * rate is LEAGUE_AVG_NRFI = LEAGUE_HALF_NRFI²).
 *
 * Used as the fallback when real first-inning splits are unavailable
 * (e.g. point-in-time historical backfill, where the season-aggregate
 * first-inning split would leak future data).
 */
export function estimateNrfiRate(era: number): number {
  if (!Number.isFinite(era) || era < 0) return LEAGUE_HALF_NRFI
  return Math.min(0.92, Math.max(0.45, Math.exp(-(era * ERA_COEF) / 9)))
}

/**
 * Estimate P(scoreless half-inning) from the pitcher's REAL first-inning
 * scoring rate (runs allowed per first inning pitched, from the MLB Stats API
 * sitCodes=i01 split):
 *
 *   P(0) ≈ e^(−c · runsPerFirstInning),  c ≈ 0.636
 *
 * anchored so the league rate (0.52 R/half) maps to LEAGUE_HALF_NRFI.
 * Preferred over estimateNrfiRate whenever the split is available because it
 * reflects actual first-inning performance instead of a season-ERA proxy.
 */
export function estimateNrfiRateFromFirstInningRuns(runsPerFirstInning: number): number {
  if (!Number.isFinite(runsPerFirstInning) || runsPerFirstInning < 0) return LEAGUE_HALF_NRFI
  return Math.min(0.92, Math.max(0.45, Math.exp(-runsPerFirstInning * RUNS_COEF)))
}

/** Re-exported for callers that need the game-level league rate. */
export { LEAGUE_AVG_NRFI, LEAGUE_HALF_NRFI }

/**
 * Estimate a batting team's offensive strength relative to league average.
 * League average OPS ≈ 0.720; factor > 1.0 means above-average offense.
 */
export function estimateOffenseFactor(ops: number): number {
  return Math.min(1.35, Math.max(0.65, ops / 0.720))
}
