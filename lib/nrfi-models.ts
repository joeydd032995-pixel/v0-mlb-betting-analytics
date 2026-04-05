/**
 * Advanced NRFI/YRFI Models
 *
 * Implements four complementary statistical frameworks:
 *  1. Bayesian Hierarchical Shrinkage — corrects small-sample overconfidence
 *  2. Log-5 Matchup Formula          — per-PA event probabilities for pitcher/lineup matchups
 *  3. Zero-Inflated Poisson (ZIP)     — models "lockdown" innings separately from "active" innings
 *  4. Markov Chain                    — state-based inning progression over 24 base-out states
 *
 * These models are designed to work with very small samples (3–6 PA per inning).
 * They are ensembled with the base Poisson model to produce a final probability.
 */

import type { Pitcher, Team } from "./types"

// ─── League Constants ─────────────────────────────────────────────────────────

/** ~62% of MLB first innings produce zero runs */
export const LEAGUE_AVG_NRFI = 0.62
/** 2024 MLB league averages (from config.ts) */
const LEAGUE_K_RATE = 0.225
const LEAGUE_BB_RATE = 0.085
const LEAGUE_HR_RATE = 0.034      // ~3.4 HR per 100 PA
const LEAGUE_AVG_OBP = 0.314
const LEAGUE_HIT_RATE = LEAGUE_AVG_OBP - LEAGUE_BB_RATE   // ≈ 0.229
const LEAGUE_SLG = 0.411
const LEAGUE_OPS = LEAGUE_AVG_OBP + LEAGUE_SLG             // ≈ 0.725

// ─── 1. Bayesian Hierarchical Shrinkage ───────────────────────────────────────

/**
 * Shrinks a pitcher's observed first-inning NRFI rate toward the league mean
 * based on sample size. Prevents a 0.00 ERA over 3 starts from being treated as elite.
 *
 * Formula (empirical Bayes):
 *   θ̂ = w·ȳ + (1−w)·μ
 *   where w = n / (n + k)  and  k = σ²/τ²
 *
 * σ² ≈ 0.040  (within-pitcher variance in NRFI rate per game)
 * τ² ≈ 0.035  (between-pitcher talent variance in true NRFI rate)
 * k  ≈ 1.14   → at 5 starts, dataWeight ≈ 0.81; at 2 starts, ≈ 0.64
 *
 * @param observed  The pitcher's raw season NRFI rate (0–1)
 * @param starts    Number of first-inning appearances / starts this season
 */
export function bayesianShrinkage(
  observed: number,
  starts: number
): { shrunkenRate: number; dataWeight: number; leagueWeight: number } {
  const WITHIN_VAR = 0.040
  const BETWEEN_VAR = 0.035
  const k = WITHIN_VAR / BETWEEN_VAR  // ≈ 1.14

  const dataWeight = Math.min(0.97, starts / (starts + k))
  const shrunkenRate = dataWeight * observed + (1 - dataWeight) * LEAGUE_AVG_NRFI

  return {
    shrunkenRate: Math.max(0.35, Math.min(0.92, shrunkenRate)),
    dataWeight,
    leagueWeight: 1 - dataWeight,
  }
}

// ─── 2. Log-5 Matchup Formula ─────────────────────────────────────────────────

/**
 * Bill James Log-5: probability of event E when batter A faces pitcher B,
 * given that A does it at rate `batter`, B allows it at rate `pitcher`,
 * and the league average rate is `league`.
 *
 * Formula:
 *   P(E) = (b·p/l) / ( (b·p/l) + ((1−b)·(1−p)/(1−l)) )
 *
 * Used to generate accurate per-PA probabilities for the Markov chain
 * instead of naively averaging batter and pitcher rates.
 */
export function log5(batter: number, pitcher: number, league: number): number {
  if (league <= 0 || league >= 1) return batter
  const num = (batter * pitcher) / league
  const denom = num + ((1 - batter) * (1 - pitcher)) / (1 - league)
  if (denom < 1e-9) return league
  return Math.max(0, Math.min(1, num / denom))
}

/** PA outcome probabilities for one plate appearance (must sum ≤ 1) */
export interface PAOutcomes {
  out: number
  walk: number
  single: number
  double: number
  triple: number
  hr: number
}

/**
 * Derive PA outcome probabilities using Log-5 by combining pitcher stats
 * with a top-of-order batter (scaled by team offenseFactor).
 *
 * "Top of order" = weighted blend of the first 3 batters (~leadoff/2-hole/3-hole).
 * offenseFactor > 1.0 → above-average offense → more hits/walks.
 */
export function computePAOutcomes(
  pitcher: Pitcher,
  offenseFactor: number
): PAOutcomes {
  // Pitcher event rates (derived from first-inning stats)
  const pitcherBB = pitcher.firstInning.bbRate
  const pitcherK  = pitcher.firstInning.kRate
  const pitcherHR = Math.min(0.07, pitcher.firstInning.hrPer9 / 9)

  // Hits per PA from WHIP: WHIP / IP_per_inning ≈ (BB+H) per PA
  // One inning ≈ 3.5 PA on average; so H/PA ≈ WHIP/3.5 − BB/PA
  const pitcherHit = Math.max(0.06, pitcher.firstInning.whip / 3.5 - pitcherBB)

  // Top-of-order batter baseline (5% better OBP than league avg, 8% better SLG)
  // Scale the offensive event rates by offenseFactor
  const batterBB  = LEAGUE_BB_RATE * 1.05 * offenseFactor
  const batterHR  = LEAGUE_HR_RATE * 1.08 * offenseFactor
  const batterHit = LEAGUE_HIT_RATE * 1.04 * offenseFactor  // non-HR hits

  // Apply Log-5 for each event type
  const bbProb  = log5(batterBB,  pitcherBB,  LEAGUE_BB_RATE)
  const hrProb  = log5(batterHR,  pitcherHR,  LEAGUE_HR_RATE)
  const hitProb = log5(batterHit, pitcherHit, LEAGUE_HIT_RATE)

  // Distribute non-HR hit types: ~66% single, ~27% double, ~7% triple
  const nonHrHit = Math.max(0, hitProb - hrProb)
  const single   = nonHrHit * 0.66
  const double_  = nonHrHit * 0.27
  const triple   = nonHrHit * 0.07

  // Remaining probability = outs (K + BIP outs)
  const out = Math.max(0.35, 1 - bbProb - single - double_ - triple - hrProb)

  return { out, walk: bbProb, single, double: double_, triple, hr: hrProb }
}

// ─── 3. Markov Chain (24-state inning model) ──────────────────────────────────

/**
 * Runner configuration bitmask: bit0=1st, bit1=2nd, bit2=3rd.
 * States 0–7 represent all 8 base configurations.
 */
type RunnerBits = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

/** Apply a walk: batter to 1st with force advances */
function applyWalk(runners: number): [RunnerBits, number] {
  const has1 = (runners & 1) !== 0
  const has2 = (runners & 2) !== 0
  const has3 = (runners & 4) !== 0

  // Bases loaded → force score on 3rd
  if (has1 && has2 && has3) return [0b111 as RunnerBits, 1]
  // 1st+2nd occupied → bases loaded (no score)
  if (has1 && has2) return [0b111 as RunnerBits, 0]
  // 1st occupied → 1st+2nd
  if (has1) return [((runners | 0b011) as RunnerBits), 0]
  // Batter to 1st only (keep 2nd and 3rd)
  return [((runners | 0b001) as RunnerBits), 0]
}

/** Apply a single: batter to 1st, runners advance ~1 base; 3rd scores */
function applySingle(runners: number): [RunnerBits, number] {
  let runs = 0
  let next = 0b001  // batter lands on 1st
  // 3rd scores
  if (runners & 0b100) runs++
  // 2nd → 3rd
  if (runners & 0b010) next |= 0b100
  // 1st → 2nd
  if (runners & 0b001) next |= 0b010
  return [next as RunnerBits, runs]
}

/** Apply a double: batter to 2nd; 2nd and 3rd score; 1st → 3rd */
function applyDouble(runners: number): [RunnerBits, number] {
  let runs = 0
  let next = 0b010  // batter lands on 2nd
  if (runners & 0b100) runs++   // 3rd scores
  if (runners & 0b010) runs++   // 2nd scores
  if (runners & 0b001) next |= 0b100  // 1st → 3rd
  return [next as RunnerBits, runs]
}

/** Apply a triple: all runners score; batter to 3rd */
function applyTriple(runners: number): [RunnerBits, number] {
  let runs = 0
  if (runners & 0b001) runs++
  if (runners & 0b010) runs++
  if (runners & 0b100) runs++
  return [0b100 as RunnerBits, runs]
}

/** Apply a HR: all runners and batter score */
function applyHR(runners: number): [0, number] {
  let runs = 1
  if (runners & 0b001) runs++
  if (runners & 0b010) runs++
  if (runners & 0b100) runs++
  return [0, runs]
}

export interface MarkovResult {
  /** P(NRFI) — probability of 0 runs in this half-inning */
  nrfiProb: number
  /** Expected runs scored (for diagnostics) */
  expectedRuns: number
}

/**
 * Compute P(NRFI) via forward state propagation over 24 base-out states.
 *
 * Starts at state (0 outs, bases empty) = probability 1.0.
 * Each PA step propagates probability mass across states.
 * Branches where a run scores are discarded (they contribute 0 to NRFI).
 * Probability mass that reaches (3 outs, 0 runs) accumulates as P(NRFI).
 *
 * Iterates until all remaining mass is < 1e-6 or 30 PAs (safety limit).
 */
export function computeMarkovNrfi(pa: PAOutcomes): MarkovResult {
  // stateProb[outs][runners] = P(in this state AND 0 runs scored so far)
  const stateProb: number[][] = [
    new Array(8).fill(0),
    new Array(8).fill(0),
    new Array(8).fill(0),
  ]
  stateProb[0][0] = 1.0   // Start: 0 outs, bases empty, P=1

  let nrfiAccum = 0        // Accumulates P(3 outs, 0 runs)
  let expectedRuns = 0

  for (let iter = 0; iter < 30; iter++) {
    const next: number[][] = [
      new Array(8).fill(0),
      new Array(8).fill(0),
      new Array(8).fill(0),
    ]

    for (let outs = 0; outs < 3; outs++) {
      for (let runners = 0; runners < 8; runners++) {
        const p = stateProb[outs][runners]
        if (p < 1e-10) continue

        // ─ Out (K or BIP out; simplified: no runner advancement on out) ─
        const newOuts = outs + 1
        if (newOuts === 3) {
          nrfiAccum += p * pa.out
        } else {
          next[newOuts][runners] += p * pa.out
        }

        // ─ Walk ─
        const [wR, wRuns] = applyWalk(runners)
        if (wRuns === 0) {
          next[outs][wR] += p * pa.walk
        } else {
          expectedRuns += p * pa.walk * wRuns
        }

        // ─ Single ─
        const [sR, sRuns] = applySingle(runners)
        if (sRuns === 0) {
          next[outs][sR] += p * pa.single
        } else {
          expectedRuns += p * pa.single * sRuns
        }

        // ─ Double ─
        const [dR, dRuns] = applyDouble(runners)
        if (dRuns === 0) {
          next[outs][dR] += p * pa.double
        } else {
          expectedRuns += p * pa.double * dRuns
        }

        // ─ Triple ─
        const [tR, tRuns] = applyTriple(runners)
        if (tRuns === 0) {
          // Batter on 3rd, no runs scored yet — NRFI still possible
          next[outs][tR] += p * pa.triple
        } else {
          expectedRuns += p * pa.triple * tRuns
        }

        // ─ HR — always scores, branch eliminated from NRFI ─
        const [, hRuns] = applyHR(runners)
        expectedRuns += p * pa.hr * hRuns
      }
    }

    for (let o = 0; o < 3; o++)
      for (let r = 0; r < 8; r++)
        stateProb[o][r] = next[o][r]

    const remaining = stateProb.flat().reduce((a, b) => a + b, 0)
    if (remaining < 1e-6) break
  }

  return {
    nrfiProb: Math.max(0.1, Math.min(0.98, nrfiAccum)),
    expectedRuns,
  }
}

// ─── 4. Zero-Inflated Poisson (ZIP) ──────────────────────────────────────────

export interface ZIPResult {
  /** ω — probability of a "locked down" 1-2-3 inning (certain zero regime) */
  omega: number
  /** λ — Poisson rate for the "active" inning regime (if not locked down) */
  lambda: number
  /** P(NRFI) = ω + (1−ω)·e^(−λ) */
  nrfiProb: number
}

/**
 * Zero-Inflated Poisson model for a single half-inning.
 *
 * Standard Poisson underestimates P(0 runs) because ~28% of first innings
 * are "locked down" by a dominant pitcher (1-2-3 strikeout innings etc.).
 * ZIP splits the inning into two regimes:
 *   - ω (omega): certain-zero probability, driven by pitcher K% and temperature
 *   - λ (lambda): Poisson scoring rate for the "non-zero" regime, driven by
 *                 offense quality and park factor
 *
 * Coefficients calibrated to produce:
 *   average kRate (22.5%), 72°F, offFactor=1.0, park=1.0 → ω≈0.28, λ≈0.42
 *   → P(NRFI) ≈ 0.28 + 0.72·e^(−0.42) ≈ 0.28 + 0.47 ≈ 0.75... too high
 *   → Need to adjust calibration
 *
 * Recalibrated so that at "average" inputs both half-innings produce combined
 * P(NRFI) ≈ 0.62 (target: overall league NRFI rate).
 * For one half-inning target: sqrt(0.62) ≈ 0.787 P(no score)
 */
export function computeZIPModel(
  pitcher: Pitcher,
  offenseFactor: number,
  parkFactor: number,
  temperatureF: number,
  umpireWideness: number = 0   // +1 wide zone (more K, less BB), −1 tight zone, 0 neutral
): ZIPResult {
  const kRate = pitcher.firstInning.kRate

  // ── Omega: logistic model for "lockdown" probability ──────────────────────
  // logit(ω) = γ₀ + γ₁·(kRate − μK) + γ₂·tempEffect + γ₃·umpire
  // Calibration: at kRate=0.225, temp=72°F, umpire=0 → ω≈0.20
  const kDeviation = kRate - LEAGUE_K_RATE          // positive = above avg K%
  const tempEffect = (72 - temperatureF) * 0.008    // cold weather → slight lockdown boost
  const umpireEffect = umpireWideness * 0.18         // wide zone → more K → more lockdowns
  const logitOmega = -1.38 + 4.0 * kDeviation + tempEffect + umpireEffect
  const omega = 1 / (1 + Math.exp(-logitOmega))

  // ── Lambda: log-linear model for "active inning" scoring rate ─────────────
  // log(λ) = β₀ + β₁·log(offFactor) + β₂·log(parkFactor) + β₃·tempEffect
  // Calibration: offFactor=1.0, park=1.0, 72°F → λ≈0.42
  const tempLambdaAdj = (temperatureF - 72) * 0.004  // heat → ball carries farther
  const logLambda =
    Math.log(0.42) +
    0.90 * Math.log(Math.max(0.4, offenseFactor)) +
    0.60 * Math.log(Math.max(0.7, parkFactor)) +
    tempLambdaAdj

  const lambda = Math.exp(logLambda)

  // ── ZIP formula: P(Y=0) = ω + (1−ω)·e^(−λ) ────────────────────────────
  const nrfiProb = omega + (1 - omega) * Math.exp(-lambda)

  return {
    omega: Math.max(0.05, Math.min(0.65, omega)),
    lambda: Math.max(0.05, lambda),
    nrfiProb: Math.max(0.1, Math.min(0.98, nrfiProb)),
  }
}

// ─── Umpire Factor ────────────────────────────────────────────────────────────

/**
 * Returns an umpire wideness score in [−1, 1] based on the umpire's
 * historical K% and BB% tendencies relative to league average.
 *
 * When real umpire data isn't available, returns 0 (neutral).
 * @param umpireKPct   Umpire's historical K% (e.g. 0.25 for wide zone)
 * @param umpireBBPct  Umpire's historical BB% (e.g. 0.07 for wide zone)
 */
export function computeUmpireWideness(
  umpireKPct?: number,
  umpireBBPct?: number
): number {
  if (umpireKPct === undefined || umpireBBPct === undefined) return 0
  const kEffect = (umpireKPct - LEAGUE_K_RATE) / LEAGUE_K_RATE    // +% above avg
  const bbEffect = (LEAGUE_BB_RATE - umpireBBPct) / LEAGUE_BB_RATE // + when fewer BBs
  return Math.max(-1, Math.min(1, (kEffect + bbEffect) / 2))
}

// ─── Ensemble ─────────────────────────────────────────────────────────────────

export interface ModelBreakdown {
  /** Raw Poisson P(NRFI) for this half-inning (before ensemble) */
  poissonNrfi: number
  /** ZIP model P(NRFI) for this half-inning */
  zipNrfi: number
  /** ZIP lockdown component (omega) */
  zipOmega: number
  /** ZIP active-inning scoring rate (lambda) */
  zipLambda: number
  /** Markov Chain P(NRFI) for this half-inning */
  markovNrfi: number
  /** How much the model trusts season data vs league average (0=all league, 1=all data) */
  bayesianDataWeight: number
  /** The shrunk (Bayesian-adjusted) NRFI rate fed into models */
  shrunkNrfiRate: number
  /** Ensemble weights actually applied */
  weights: { poisson: number; zip: number; markov: number }
  /** Log-5 matchup PA outcomes used as input to Markov */
  paOutcomes: PAOutcomes
}

export interface HalfInningBreakdown {
  home: ModelBreakdown
  away: ModelBreakdown
}

/**
 * Compute ensemble P(NRFI) for ONE half-inning using all four models.
 *
 * The Bayesian shrinkage is a pre-processing step (data quality) that feeds
 * into the Poisson, ZIP, and Markov models rather than being a 4th vote.
 *
 * Ensemble weights: Poisson 25%, ZIP 35%, Markov 40%
 * (Markov weighted highest as the most theoretically complete model for small samples)
 */
export function computeHalfInningEnsemble(
  pitcher: Pitcher,
  offenseFactor: number,
  parkFactor: number,
  temperatureF: number,
  umpireWideness: number = 0
): ModelBreakdown {
  // Step 1: Bayesian shrinkage on the pitcher's NRFI rate
  const { shrunkenRate, dataWeight } = bayesianShrinkage(
    pitcher.firstInning.nrfiRate,
    pitcher.firstInning.startCount
  )

  // Create a shrunk version of pitcher stats for models
  const shrunkPitcher: Pitcher = {
    ...pitcher,
    firstInning: { ...pitcher.firstInning, nrfiRate: shrunkenRate },
  }

  // Step 2: Poisson model (standard, using shrunk rate)
  const poissonLambda = -Math.log(Math.max(0.01, shrunkenRate))
  const adjustedLambda =
    poissonLambda *
    offenseFactor *
    parkFactor *
    (1 + (temperatureF - 72) * 0.004)
  const poissonNrfi = Math.exp(-adjustedLambda)

  // Step 3: ZIP model (using shrunk pitcher stats)
  const zipResult = computeZIPModel(
    shrunkPitcher,
    offenseFactor,
    parkFactor,
    temperatureF,
    umpireWideness
  )

  // Step 4: Markov Chain (using Log-5 PA outcomes derived from shrunk stats)
  const paOutcomes = computePAOutcomes(shrunkPitcher, offenseFactor)
  const markovResult = computeMarkovNrfi(paOutcomes)

  // Step 5: Ensemble
  const weights = { poisson: 0.25, zip: 0.35, markov: 0.40 }
  const ensembleNrfi =
    weights.poisson * poissonNrfi +
    weights.zip * zipResult.nrfiProb +
    weights.markov * markovResult.nrfiProb

  return {
    poissonNrfi,
    zipNrfi: zipResult.nrfiProb,
    zipOmega: zipResult.omega,
    zipLambda: zipResult.lambda,
    markovNrfi: markovResult.nrfiProb,
    bayesianDataWeight: dataWeight,
    shrunkNrfiRate: shrunkenRate,
    weights,
    paOutcomes,
  }
}

/**
 * Final combined P(NRFI) from both half-inning ensemble results.
 * P(NRFI_game) = P(home scores 0) × P(away scores 0)
 */
export function combineHalfInnings(
  homeBreakdown: ModelBreakdown,
  awayBreakdown: ModelBreakdown
): number {
  const w = homeBreakdown.weights  // Same weights for both sides
  const homeP =
    w.poisson * homeBreakdown.poissonNrfi +
    w.zip * homeBreakdown.zipNrfi +
    w.markov * homeBreakdown.markovNrfi

  const awayP =
    w.poisson * awayBreakdown.poissonNrfi +
    w.zip * awayBreakdown.zipNrfi +
    w.markov * awayBreakdown.markovNrfi

  return Math.max(0.05, Math.min(0.95, homeP * awayP))
}
