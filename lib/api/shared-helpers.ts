/**
 * Shared helpers used by both lib/api/live-data.ts and app/api/historical-sync/route.ts.
 * Kept here so that any change to defaults or formulas applies consistently to both paths.
 */

import { getTeamByName } from "../constants/mlb-teams"

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
 * Estimate a pitcher's first-inning NRFI rate from overall ERA via the Poisson model.
 * P(0 runs in 1 inning) = e^(-ERA/9)
 * A 0.95 multiplier approximates the typical first-inning ERA advantage (fresh arm).
 */
export function estimateNrfiRate(era: number): number {
  return Math.min(0.90, Math.max(0.45, Math.exp(-(era * 0.95) / 9)))
}

/**
 * Estimate a batting team's offensive strength relative to league average.
 * League average OPS ≈ 0.720; factor > 1.0 means above-average offense.
 */
export function estimateOffenseFactor(ops: number): number {
  return Math.min(1.35, Math.max(0.65, ops / 0.720))
}
