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
export function buildProPrediction(pred: NRFIPrediction): Omit<NRFIPrediction, "modelBreakdown" | "deepNrfi" | "monteCarlo" | "ensembleWeights"> & { _tierLocked: boolean } {
  const { modelBreakdown: _mb, deepNrfi: _dn, monteCarlo: _mc, ensembleWeights: _ew, ...rest } = pred
  void _mb; void _dn; void _mc; void _ew
  return { ...rest, _tierLocked: false }
}

export function applyTierGating(predictions: NRFIPrediction[], tier: Tier) {
  // Sort by confidenceScore descending so the highest-confidence game is always first
  const sorted = [...predictions].sort((a, b) => b.confidenceScore - a.confidenceScore)

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
