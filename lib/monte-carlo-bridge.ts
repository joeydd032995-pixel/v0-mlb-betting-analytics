/**
 * Bridge between the existing PA-outcome derivation in `lib/nrfi-models.ts`
 * and the Monte Carlo simulator in `lib/monte-carlo.ts`.
 *
 * The simulator is intentionally agnostic about how PA probabilities are
 * derived — this module knows how to assemble them from the same inputs the
 * 7-model engine consumes (handedness-adjusted offense, dynamic shrinkage).
 */

import type { Pitcher, Team, PerPAProbs } from "./types"
import {
  computePAOutcomes,
  getLineupVsHand,
  type PitcherContext,
} from "./nrfi-models"

function buildPAProbs(pitcher: Pitcher, battingTeam: Team, ctx: PitcherContext): PerPAProbs {
  const lineupFactor  = getLineupVsHand(pitcher.throws, battingTeam)
  const shrunkPitcher: Pitcher = {
    ...pitcher,
    firstInning: { ...pitcher.firstInning, nrfiRate: ctx.shrunkRate },
  }
  const pa = computePAOutcomes(shrunkPitcher, lineupFactor)
  return {
    out: pa.out, walk: pa.walk, single: pa.single,
    double: pa.double, triple: pa.triple, hr: pa.hr,
  }
}

/**
 * Build per-PA probabilities for both halves of the 1st inning.
 *
 *   home half = home pitcher on mound, away team batting → uses awayTeam offense
 *   away half = away pitcher on mound, home team batting → uses homeTeam offense
 */
export function paProbsFromContext(
  homePitcher: Pitcher,
  awayPitcher: Pitcher,
  homeTeam: Team,
  awayTeam: Team,
  homeCtx: PitcherContext,
  awayCtx: PitcherContext,
): { homePAProbs: PerPAProbs; awayPAProbs: PerPAProbs } {
  return {
    homePAProbs: buildPAProbs(homePitcher, awayTeam, homeCtx),
    awayPAProbs: buildPAProbs(awayPitcher, homeTeam, awayCtx),
  }
}
