// lib/tier-gating.ts
// Shared FREE/PRO/ELITE field-stripping for any route that serves NRFIPrediction[]
// to end users. Every such route MUST run its output through applyTierGating —
// serving raw predictions bypasses the paywall.

import type { Tier } from "@/lib/subscription"
import type { NRFIPrediction } from "@/lib/types"

// For the FREE teaser we expose the NRFI probability + basic matchup context but
// strip every actionable signal (recommendation, confidence, value analysis, etc.)
// so the raw fetch never leaks data that should only be visible to paying users.
type TeaseFields = Pick<
  NRFIPrediction,
  "gameId" | "nrfiProbability" | "yrfiProbability" | "calibratedNrfiPct" |
  "homeExpectedRuns" | "awayExpectedRuns" | "homeScores0Prob" | "awayScores0Prob"
> & { _tierLocked: boolean }

export function buildFreeTeaser(pred: NRFIPrediction): TeaseFields {
  return {
    gameId: pred.gameId,
    nrfiProbability: pred.nrfiProbability,
    yrfiProbability: pred.yrfiProbability,
    calibratedNrfiPct: pred.calibratedNrfiPct,
    homeExpectedRuns: pred.homeExpectedRuns,
    awayExpectedRuns: pred.awayExpectedRuns,
    homeScores0Prob: pred.homeScores0Prob,
    awayScores0Prob: pred.awayScores0Prob,
    _tierLocked: false,
  }
}

// PRO strips the ELITE-only fields so the model breakdown tab stays locked.
// features/featurePresence are the raw DeepNRFI/MonteCarlo input vector — since
// those models themselves are ELITE-only, the inputs that power them must be
// stripped too, or a PRO subscriber could reconstruct the locked output.
export function buildProPrediction(pred: NRFIPrediction): Omit<NRFIPrediction, "modelBreakdown" | "deepNrfi" | "monteCarlo" | "ensembleWeights" | "features" | "featurePresence"> & { _tierLocked: boolean } {
  const { modelBreakdown: _mb, deepNrfi: _dn, monteCarlo: _mc, ensembleWeights: _ew, features: _f, featurePresence: _fp, ...rest } = pred
  void _mb; void _dn; void _mc; void _ew; void _f; void _fp
  return { ...rest, _tierLocked: false }
}

/**
 * The ordering FREE-tier gating ranks a slate by. V8's sort is stable, so ties
 * fall back to the order the slate was emitted in.
 */
export function byConfidenceDesc<T extends { confidenceScore: number }>(a: T, b: T): number {
  return b.confidenceScore - a.confidenceScore
}

/**
 * The single prediction FREE tier surfaces from a slate.
 *
 * Exported so that surfaces which need to identify the free pick *after the
 * fact* — e.g. reconstructing its historical accuracy from stored rows — derive
 * it from the same rule the paywall uses rather than a copy that can drift.
 * See __tests__/tier-gating.test.ts for the agreement check.
 *
 * The same full-slate caveat as applyTierGating applies: pass every prediction
 * for the date, or whatever you pass is "top" unconditionally.
 */
export function selectFreePick<T extends { confidenceScore: number }>(slate: T[]): T | undefined {
  return [...slate].sort(byConfidenceDesc)[0]
}

// IMPORTANT: always call this with the FULL slate of predictions for the date,
// never a single-game subset. FREE-tier ranking picks the highest-confidence
// game as the visible teaser by comparing confidenceScore across `predictions`
// — passing a one-element array makes that element "top" unconditionally,
// which lets a caller bypass the one-visible-pick restriction by requesting
// games one at a time. Gate the full slate, then look up the game you need.
export function applyTierGating(predictions: NRFIPrediction[], tier: Tier) {
  // Sort by confidenceScore descending so the highest-confidence game is always first
  const sorted = [...predictions].sort(byConfidenceDesc)

  if (tier === "FREE") {
    const [top, ...rest] = sorted
    if (!top) return { gated: [], lockedCount: 0 }

    // The single visible teaser card
    const teaser = buildFreeTeaser(top)

    // Ghost placeholders: send just gameId + _tierLocked flag so the frontend can
    // render blurred placeholder cards without exposing prediction data.
    const ghosts = rest.map((p) => ({ gameId: p.gameId, _tierLocked: true as const }))

    return {
      gated: [teaser, ...ghosts],
      lockedCount: rest.length,
    }
  }

  if (tier === "PRO") {
    return {
      gated: sorted.map(buildProPrediction),
      lockedCount: 0,
    }
  }

  // ELITE — full data, no stripping
  return {
    gated: sorted.map((p) => ({ ...p, _tierLocked: false as const })),
    lockedCount: 0,
  }
}
