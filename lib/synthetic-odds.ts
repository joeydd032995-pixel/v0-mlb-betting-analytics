/**
 * Synthetic market-line reconstructor for HISTORICAL BACKTESTING ONLY.
 *
 * ─── What this is ────────────────────────────────────────────────────────────
 * No real NRFI/YRFI odds exist for the 2024–2025 archive (the prop market is too
 * new for any historical dataset — see the research in the project notes).  This
 * module fabricates a *plausible* market line per game so the Kelly/ROI machinery
 * in backtest-metrics.ts has something to price against, instead of the flat −110
 * fallback that ignores matchup-driven line movement.
 *
 * ─── What this is NOT ────────────────────────────────────────────────────────
 * It is NOT real data and NOT a substitute for a real backtest.  Read carefully:
 *
 *   The synthetic "market" is a PUBLIC-CONSENSUS PROXY that anchors to the league
 *   NRFI base rate and only PARTIALLY tracks a sharp number, controlled by λ
 *   (`marketSharpness`).  This deliberately avoids circularity: if the line simply
 *   equalled the model probability, the implied edge would be 0 by construction
 *   and ROI would be meaningless.
 *
 *   With this anchoring, the model's edge per game works out to:
 *       edge  =  modelProb − marketProb
 *             =  modelProb − [ λ·base + (1−λ)·modelProb ]
 *             =  λ · (modelProb − base)
 *
 *   i.e. the model is treated as having an edge PROPORTIONAL to how far it pulls
 *   away from the league base rate, scaled by how "lazy" we assume the book is (λ).
 *   Crucially, whether those bets WIN is decided by the REAL outcomes in the DB —
 *   so the resulting ROI genuinely measures: "when the model deviates from the
 *   league average, is it right?"  That is a real, useful signal about the model's
 *   matchup-discrimination skill.
 *
 *   BUT the magnitude of ROI is governed by the λ assumption.  A real sharp book
 *   is tougher (smaller effective λ) than this proxy, so any positive ROI here is
 *   an OPTIMISTIC upper estimate.  Always run the λ sweep and read the trend, not
 *   a single headline number.
 *
 * ─── Vig model ───────────────────────────────────────────────────────────────
 * Real NRFI markets carry asymmetric vig — the public loves betting the "under"
 * (NRFI), so books juice that side.  Observed live (2026-06-10, SportsGameOdds):
 * NRFI −138 / YRFI +110, NRFI −135 / YRFI +105, etc. — roughly 4–5% hold tilted
 * toward NRFI.  We reproduce that with `totalVig` + `nrfiVigSkew`.
 */

// Game-level league NRFI rate. Mirrors LEAGUE_AVG_NRFI in lib/nrfi-engine.ts
// (the two-scale convention; half-inning rate is √0.516 ≈ 0.718).
const LEAGUE_NRFI_BASE = 0.516

export interface SyntheticOddsParams {
  /**
   * λ ∈ [0,1] — how strongly the synthetic book anchors to the league base rate
   * rather than the sharp model number.
   *   λ = 0   → market == model            (no edge, ROI ≈ 0 by construction)
   *   λ = 1   → market == league base rate (model gets full credit for deviating)
   * Real sharp books behave like a SMALL λ; soft/public books like a LARGE λ.
   */
  marketSharpness: number
  /** Total bookmaker hold across both sides, e.g. 0.045 = 4.5%. */
  totalVig: number
  /** Fraction of the vig loaded onto the NRFI side, 0..1. 0.5 = symmetric. */
  nrfiVigSkew: number
}

/** Plausible "soft book" defaults matching the live SportsGameOdds NRFI lines. */
export const DEFAULT_SYNTH: SyntheticOddsParams = {
  marketSharpness: 0.5,
  totalVig: 0.045,
  nrfiVigSkew: 0.62,
}

/** Fair (no-vig) NRFI probability the synthetic book is built around. */
export function syntheticMarketProb(modelNrfiProb: number, p: SyntheticOddsParams): number {
  const blended = p.marketSharpness * LEAGUE_NRFI_BASE + (1 - p.marketSharpness) * modelNrfiProb
  return Math.max(0.05, Math.min(0.95, blended))
}

/**
 * American odds whose break-even (vig-inclusive) probability equals `prob`.
 * prob ≥ 0.5 → favourite (negative); prob < 0.5 → underdog (positive).
 */
function impliedProbToAmerican(prob: number): number {
  const clamped = Math.max(0.01, Math.min(0.99, prob))
  if (clamped >= 0.5) return -Math.round((clamped / (1 - clamped)) * 100)
  return Math.round(((1 - clamped) / clamped) * 100)
}

/**
 * Build a synthetic NRFI/YRFI American-odds pair from the model's NRFI probability.
 * Returns the same shape consumed by BacktestRow (nrfiOdds / yrfiOdds).
 */
export function syntheticNrfiOdds(
  modelNrfiProb: number,
  p: SyntheticOddsParams = DEFAULT_SYNTH,
): { nrfiOdds: number; yrfiOdds: number } {
  const fairNrfi = syntheticMarketProb(modelNrfiProb, p)
  // Split the total hold across the two sides per the skew, so the vig-inclusive
  // implied probabilities sum to 1 + totalVig.
  const nrfiImplied = fairNrfi + p.totalVig * p.nrfiVigSkew
  const yrfiImplied = (1 - fairNrfi) + p.totalVig * (1 - p.nrfiVigSkew)
  return {
    nrfiOdds: impliedProbToAmerican(nrfiImplied),
    yrfiOdds: impliedProbToAmerican(yrfiImplied),
  }
}
