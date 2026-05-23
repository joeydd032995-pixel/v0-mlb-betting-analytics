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

import type { Pitcher, Team, EnsembleWeights } from "./types"

// ─── League Constants ─────────────────────────────────────────────────────────

/** ~51.6% of MLB first innings produce zero runs (2024–2025 recalibrated) */
export const LEAGUE_AVG_NRFI = 0.516

// ─── Default Model Configuration ─────────────────────────────────────────────

/** Per-model calibration: weight in ensemble, multiplicative scale, additive bias. */
export const MODEL_CONFIG = {
  poisson: { weight: 0.18, scale: 1.05, bias:  0.03 },
  zip:     { weight: 0.39, scale: 1.12, bias:  0.02 },
  markov:  { weight: 0.31, scale: 0.92, bias: -0.04 },
  mapre:   { weight: 0.12, scale: 1.08, bias:  0.01 },
} as const
/** 2024 MLB league averages (from config.ts) */
const LEAGUE_K_RATE = 0.225
const LEAGUE_BB_RATE = 0.085
const LEAGUE_HR_RATE = 0.034      // ~3.4 HR per 100 PA
const LEAGUE_AVG_OBP = 0.314
const LEAGUE_HIT_RATE = LEAGUE_AVG_OBP - LEAGUE_BB_RATE   // ≈ 0.229

// ─── ERA-based barrel deviation proxy ────────────────────────────────────────

/**
 * barrelDev proxy: (1st-inning ERA / season ERA) − 1.
 *
 * Positive value means the pitcher allows more contact damage early than overall,
 * amplifying MAPRE's M_pitchMix multiplier. Returns 0 (neutral) whenever ERA
 * data is missing or non-finite. firstInning.era === 0 is valid (perfect early
 * performer, yields barrelDev = −1.0, clamped to −0.5).
 */
export function computeBarrelDev(pitcher: Pitcher): number {
  const seasonEra = pitcher.overall.era
  const firstEra  = pitcher.firstInning.era
  if (!Number.isFinite(seasonEra) || seasonEra <= 0) return 0
  if (!Number.isFinite(firstEra)  || firstEra < 0)   return 0
  return Math.max(-0.5, Math.min(0.5, firstEra / seasonEra - 1.0))
}

// ─── 1. Bayesian Hierarchical Shrinkage ───────────────────────────────────────

/**
 * Shrinks a pitcher's observed first-inning NRFI rate toward the league mean
 * based on sample size. Prevents a 0.00 ERA over 3 starts from being treated as elite.
 *
 * This is the live prediction path (k = 1.14, empirical Bayes).
 *
 * Formula (empirical Bayes):
 *   θ̂ = w·ȳ + (1−w)·μ
 *   where w = n / (n + k)  and  k = σ²_within / σ²_between
 *
 * σ²_within ≈ 0.040  (within-pitcher variance in NRFI rate per game)
 * σ²_between ≈ 0.035  (between-pitcher talent variance in true NRFI rate)
 * k = 1.14   → at 2 starts dataWeight ≈ 0.64; at 5 starts ≈ 0.81; at 18+ ≈ 0.94
 *
 * @deprecated Use applyDynamicShrinkage(pitcher, getDynamicPriorWeight(pitcher)).
 * k=1.14 produces far too high data-trust for small-sample pitchers.
 * Retained for backward compatibility with any external callers.
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
  const rawOut = 1 - bbProb - single - double_ - triple - hrProb
  const out    = Math.max(0.35, rawOut)

  // Normalise so the six probabilities always sum to exactly 1.0.
  // When rawOut >= 0.35 the total is already 1.0 and norm = 1.0 (no-op).
  // When the out floor activates, all components are scaled down proportionally
  // so the Markov chain receives a valid probability distribution.
  const total = out + bbProb + single + double_ + triple + hrProb
  const norm  = 1 / total

  return {
    out:    out     * norm,
    walk:   bbProb  * norm,
    single: single  * norm,
    double: double_ * norm,
    triple: triple  * norm,
    hr:     hrProb  * norm,
  }
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
  /**
   * Sum of P(branch) × runs for the first run-scoring event on each branch.
   * NOTE: branches are discarded once a run scores (they are irrelevant to NRFI),
   * so this deliberately undercounts total expected runs. Use for diagnostics only.
   */
  runScoredBranchWeight: number
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
type OutCount = 0 | 1 | 2

export function computeMarkovNrfi(
  pa: PAOutcomes,
  initOuts: OutCount = 0,
  initRunners: RunnerBits = 0
): MarkovResult {
  // Two flat 24-element buffers (3 outs × 8 runner configs). Swap between them
  // each iteration rather than allocating 3 × new Array(8) per iteration —
  // avoids up to 90 JS object allocations per call under backtest load.
  const bufA = new Float64Array(24)
  const bufB = new Float64Array(24)

  bufA[initOuts * 8 + initRunners] = 1.0

  let curr = bufA
  let next = bufB
  let nrfiAccum = 0
  let runScoredBranchWeight = 0

  for (let iter = 0; iter < 30; iter++) {
    next.fill(0)

    for (let outs = 0; outs < 3; outs++) {
      for (let runners = 0; runners < 8; runners++) {
        const p = curr[outs * 8 + runners]
        if (p < 1e-10) continue

        // ─ Out (K or BIP out; simplified: no runner advancement on out) ─
        const newOuts = outs + 1
        if (newOuts === 3) {
          nrfiAccum += p * pa.out
        } else {
          next[newOuts * 8 + runners] += p * pa.out
        }

        // ─ Walk ─
        const [wR, wRuns] = applyWalk(runners)
        if (wRuns === 0) next[outs * 8 + wR] += p * pa.walk
        else runScoredBranchWeight += p * pa.walk * wRuns

        // ─ Single ─
        const [sR, sRuns] = applySingle(runners)
        if (sRuns === 0) next[outs * 8 + sR] += p * pa.single
        else runScoredBranchWeight += p * pa.single * sRuns

        // ─ Double ─
        const [dR, dRuns] = applyDouble(runners)
        if (dRuns === 0) next[outs * 8 + dR] += p * pa.double
        else runScoredBranchWeight += p * pa.double * dRuns

        // ─ Triple ─
        const [tR, tRuns] = applyTriple(runners)
        if (tRuns === 0) next[outs * 8 + tR] += p * pa.triple
        else runScoredBranchWeight += p * pa.triple * tRuns

        // ─ HR — always scores, branch eliminated from NRFI ─
        const [, hRuns] = applyHR(runners)
        runScoredBranchWeight += p * pa.hr * hRuns
      }
    }

    // O(1) buffer swap — no data copied.
    const tmp = curr; curr = next; next = tmp

    let remaining = 0
    for (let i = 0; i < 24; i++) remaining += curr[i]
    if (remaining < 1e-5) break
  }

  return {
    nrfiProb: Math.max(0.02, Math.min(0.98, nrfiAccum)),
    runScoredBranchWeight,
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
    omega: Math.max(0.08, Math.min(0.60, omega)),
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

// ─── 5. MAPRE (Multi-Factor Adjusted Poisson Run Expectancy) ─────────────────

/**
 * Inputs for the MAPRE model (MODEL 4).
 * All fields are optional — missing values fall back to league defaults so that
 * MAPRE degrades gracefully to an enhanced base Poisson when split data is absent.
 */
export interface MAPREInputs {
  /** Batting team's 1st-inning sOPS+ (100 = league average). Default 100. */
  sOpsPlus?: number
  /** Pitcher's allowed BAbip in the 1st inning. Default 0.295 (league avg). */
  babip1st?: number
  /** Batting team's 1st-inning HR per PA. Default 0.034 (league avg). */
  hrPerPa1st?: number
  /**
   * Pitcher barrel% deviation (Statcast) or (1st-inning ERA / season ERA − 1).
   * Positive = worse early command → more barrels allowed. Default 0.
   */
  barrelDev?: number
  /** true = home pitcher faces the batting team this half. Default false. */
  isHomePitcher?: boolean
  /**
   * true = away offense is fatigued: rest days < 4 OR time-zone shift > 3.
   * Default false (no schedule data available).
   */
  awayShortRestOrTravel?: boolean
}

export interface MAPREHalfResult {
  /** Adjusted Poisson λ for this half-inning (stored for ρ calculation at game level) */
  lambdaAdj: number
  /** P(no score this half) = e^(−lambdaAdj) — no ρ applied yet */
  nrfiProb: number
}

/**
 * MODEL 4: MAPRE — per-half-inning computation.
 *
 * Injects eight hidden 2024–2025 factors on top of the Bayesian-shrunk baseLambda:
 *  • M_sOPS:     batting team 1st-inning sOPS+ surge
 *  • M_BAbip:    1st-inning BAbip / ROE inflation (fresh-defense errors)
 *  • M_HR:       disproportionate early-inning HR rate
 *  • M_pitchMix: starter command drop (barrel or Stuff+ deviation)
 *  • Δ_HFA:      home-pitcher advantage (−0.045 λ)
 *  • Δ_rest:     away-offense fatigue (+0.032 λ)
 *  • floor:      small-sample λ floor at 0.35
 *
 * Cross-half correlation (ρ) and the Negative Binomial option are handled
 * in combineMAPREHalves (lib/nrfi-models.ts) after both half-inning
 * lambdaAdj values are available in computeNRFIPrediction.
 *
 * @param baseLambda  −ln(shrunkNrfiRate) — the raw Poisson λ before offense/park
 * @param inputs      MAPRE context inputs (all optional; defaults to league avg)
 */

// Treat babip values outside plausible range as missing-data sentinels.
// APIs frequently return 0 for null numeric fields; a genuine BABIP of 0 over
// any real sample is essentially impossible, and values above 0.60 likewise.
function sanitizeBabip(raw: number | undefined): number | undefined {
  if (raw == null || !Number.isFinite(raw)) return undefined
  if (raw < 0.10 || raw > 0.60)            return undefined
  return raw
}

export function computeMAPREHalfInning(
  baseLambda: number,
  inputs: MAPREInputs = {}
): MAPREHalfResult {
  const {
    sOpsPlus            = 100,
    babip1st: babipRaw,
    hrPerPa1st          = 0.034,
    barrelDev           = 0,
    isHomePitcher       = false,
    awayShortRestOrTravel = false,
  } = inputs
  // sanitizeBabip treats 0 (API sentinel) and implausible values as missing data.
  const babip1st = sanitizeBabip(babipRaw) ?? 0.295

  // ── Multipliers (each capped [0.70, 1.50]) ────────────────────────────────
  const clampM = (v: number) => Math.max(0.70, Math.min(1.50, v))
  const M_sOPS     = clampM(1 + 0.0015 * (sOpsPlus    - 100))
  const M_BAbip    = clampM(1 + 1.8    * (babip1st     - 0.295))
  const M_HR       = clampM(1 + 9      * (hrPerPa1st   - 0.034))
  const M_pitchMix = clampM(1 + 0.12   * barrelDev)

  // ── Additive deltas (each clamped [−0.10, +0.15]) ─────────────────────────
  const clampD = (v: number) => Math.max(-0.10, Math.min(0.15, v))
  const delta_HFA  = clampD(isHomePitcher       ? -0.030 : 0)
  const delta_rest = clampD(awayShortRestOrTravel ?  0.032 : 0)

  // ── Adjusted lambda ────────────────────────────────────────────────────────
  let lambdaAdj = baseLambda * M_sOPS * M_BAbip * M_HR * M_pitchMix
                + delta_HFA + delta_rest
  lambdaAdj = Math.max(lambdaAdj, 0.35)   // small-sample floor (already > 0)

  return {
    lambdaAdj,
    nrfiProb: Math.exp(-lambdaAdj),
  }
}

/**
 * Combine two half-inning MAPRE lambdaAdj values into a game-level P(NRFI).
 *
 * Standard per-half product (exp(-λ_home) × exp(-λ_away)) is equivalent to
 * exp(-(λ_home + λ_away)) — pure Poisson independence. MAPRE adds two
 * corrections that the per-half product cannot express:
 *
 * 1. Cross-half correlation (ρ = 0.06): when both pitchers face high-run
 *    environments (λ > 0.60), a shared latent factor (park, weather, umpire
 *    zone) inflates both halves simultaneously.
 * 2. Negative Binomial overdispersion: in very high-run games (λ_total_adj >
 *    0.8), pure Poisson underestimates tail risk because run-scoring is
 *    "clumped". NegBin with r=1.3 adds the necessary overdispersion.
 */
export function combineMAPREHalves(
  homeLambdaAdj: number,
  awayLambdaAdj: number
): number {
  const lambdaTotal = homeLambdaAdj + awayLambdaAdj
  const rho         = (homeLambdaAdj > 0.60 && awayLambdaAdj > 0.60) ? 0.06 : 0
  const lambdaAdj   = lambdaTotal * (1 + rho)
  const pNrfi = lambdaAdj > 0.8
    ? Math.pow(1.3 / (1.3 + lambdaAdj), 1.3)
    : Math.exp(-lambdaAdj)
  return Math.max(0.01, Math.min(0.99, pNrfi))
}

// ─── Ensemble ─────────────────────────────────────────────────────────────────

/**
 * Internal per-half-inning result from the four-model ensemble.
 * Named distinctly from the UI-facing ModelBreakdown in lib/types.ts.
 */
// ═══════════════════════════════════════════════════════════════════════════════
// 7-MODEL ENSEMBLE ADDITIONS (Post-Optimization)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 7-Model Ensemble Weights ────────────────────────────────────────────────
// Raw design-intent weights. Edit these to change the blend; normalisation
// enforces sum-to-1.0 regardless of floating-point rounding.
// Note: the base-four ratio here (12:30:48:10) deliberately differs from
// MODEL_CONFIG (18:39:31:12) — the 7-model ensemble shifts more weight onto
// Markov and less onto ZIP vs the original 4-model stack.
// TODO: run scripts/deepnrfi/backtest_v2.py with a --free-weights flag (scipy
// SLSQP, Dirichlet constraint) to validate or replace these values. Until then,
// do not describe them as "CV-optimized" in documentation or PRs.
const RAW_ENSEMBLE_WEIGHTS = {
  poisson:           0.12,
  zip:               0.30,
  markov:            0.48,
  mapre:             0.10,
  logisticMeta:      0.05,
  nnInteraction:     0.03,
  hierarchicalBayes: 0.02,
}
const _rawWeightSum = Object.values(RAW_ENSEMBLE_WEIGHTS).reduce((a, b) => a + b, 0)
export const ENSEMBLE_WEIGHTS: EnsembleWeights = Object.fromEntries(
  Object.entries(RAW_ENSEMBLE_WEIGHTS).map(([k, v]) => [k, v / _rawWeightSum])
) as EnsembleWeights

// ─── Opt #5: Dynamic Bayesian Shrinkage ──────────────────────────────────────

/**
 * Prior weight k for the empirical-Bayes shrinkage formula:
 *   shrunk = (n × observed + k × league) / (n + k)
 *
 * Spot starters / openers  → small k (30) = shrink less aggressively
 * Bullpen games            → large k (80) = heavy shrinkage toward league avg
 * Full-time starters       → k = 50 (default)
 *
 * pitcher.firstInning.careerFirstInnings and .isBullpenGame are optional fields
 * in PitcherFirstInningStats; we fall back gracefully when absent.
 */
export function getDynamicPriorWeight(pitcher: Pitcher): number {
  // Check bullpen flag first — these pitchers typically have careerIP < 100 too,
  // but the heavy shrinkage (k=80) is the intended behavior for bullpen outings.
  if (pitcher.firstInning.isBullpenGame) return 80
  const careerIP = pitcher.firstInning.careerFirstInnings ?? pitcher.firstInning.startCount * 3
  if (careerIP < 100) return 30
  return 50
}

/**
 * Shrink the pitcher's observed NRFI rate toward the league mean using the
 * dynamic prior weight returned by getDynamicPriorWeight.
 *
 * Uses pitcher.firstInning.startCount (the existing field) as sample size n.
 */
export function applyDynamicShrinkage(pitcher: Pitcher, priorWeight: number): number {
  const n        = pitcher.firstInning.startCount || 1
  const observed = pitcher.firstInning.nrfiRate
  const shrunk   = (observed * n + LEAGUE_AVG_NRFI * priorWeight) / (n + priorWeight)
  return Math.max(0.35, Math.min(0.92, shrunk))
}

// ─── Precomputed pitcher context ──────────────────────────────────────────────

/**
 * Precomputed per-pitcher values derived purely from pitcher data (no opponent,
 * park, or weather inputs). Hoisted so the engine and every downstream model
 * read the same values rather than recomputing from scratch.
 */
export interface PitcherContext {
  shrunkRate:    number   // dynamic shrinkage output (k=30/50/80 by pitcher type)
  priorWeight:   number   // k from getDynamicPriorWeight (30 | 50 | 80)
  dataWeight:    number   // n / (n + k) — how much we trust season data
  rawBaseLambda: number   // −ln(shrunkRate), used by MAPRE
}

export function precomputePitcherContext(pitcher: Pitcher): PitcherContext {
  const priorWeight   = getDynamicPriorWeight(pitcher)
  const shrunkRate    = applyDynamicShrinkage(pitcher, priorWeight)
  const n             = pitcher.firstInning.startCount || 1
  const dataWeight    = Math.min(0.97, n / (n + priorWeight))
  const rawBaseLambda = -Math.log(Math.max(0.01, shrunkRate))
  return { shrunkRate, priorWeight, dataWeight, rawBaseLambda }
}

// ─── Opt #2: Handedness × Lineup Splits ──────────────────────────────────────

/**
 * Return the batting team's offense factor against the pitcher's throwing hand.
 *
 * team.firstInning.vsLHP / vsRHP are optional fields in TeamFirstInningStats;
 * fall back to offenseFactor when absent (pre-2025 data or missing splits).
 */
export function getLineupVsHand(pitcherThrows: Pitcher["throws"], team: Team): number {
  return pitcherThrows === "L"
    ? (team.firstInning.vsLHP ?? team.firstInning.offenseFactor)
    : (team.firstInning.vsRHP ?? team.firstInning.offenseFactor)
}

/**
 * Lineup-card-aware version of getLineupVsHand.
 *
 * Starts with the team's rolling vs-hand factor (which already averages over
 * a typical lineup mix) and tilts it by how much today's leadoff trio is
 * stacked with platoon-advantage batters.  Switch hitters count as having
 * the advantage by convention.
 *
 * Tilt scale: a fully-advantaged trio (3/3 opp-hand or switch) lifts the
 * factor by 5%; a fully-disadvantaged trio (3/3 same-hand) drops it by 5%.
 * Anchored at advFrac = 0.5 so a neutral lineup leaves the team factor
 * unchanged.  5% is conservative — real platoon-skill is ~15-20 wOBA points
 * (~5-8% performance) and the leadoff trio takes ~1/3 of game PAs.
 *
 * Falls back to the team rolling average when the lineup is missing, empty,
 * or doesn't have at least the first three slots — so the live engine can
 * call this unconditionally without checking flag state.
 */
export function getLineupVsHandFromCard(
  pitcherThrows: Pitcher["throws"],
  lineup: { slots: Array<{ order: number; hand: "L" | "R" | "S" }> } | undefined,
  team: Team,
): number {
  const base = getLineupVsHand(pitcherThrows, team)
  const top3 = lineup?.slots
    ?.filter((s) => s.order >= 1 && s.order <= 3)
    .slice(0, 3)
  if (!top3 || top3.length < 3) return base

  const opposite = pitcherThrows === "L" ? "R" : "L"
  const advCount = top3.filter((s) => s.hand === opposite || s.hand === "S").length
  const advFrac  = advCount / 3
  // ±5% tilt at extremes, anchored at advFrac = 0.5 (neutral lineup).
  const tilt = 1.0 + (advFrac - 0.5) * 0.10
  // Clamp to keep the factor in the same band as team-level estimates.
  return Math.max(0.5, Math.min(1.5, base * tilt))
}

// ─── 7-Model Ensemble Computation ────────────────────────────────────────────

/** Return type for compute7ModelEnsemble */
export interface SevenModelResult {
  poisson:           number
  zip:               number
  markov:            number
  mapre:             number
  logisticMeta:      number
  nnInteraction:     number
  hierarchicalBayes: number
  // Diagnostic fields for the UI breakdown (replaces computeHalfInningEnsemble output)
  zipOmega:          number     // ZIP lockdown component (clamped to [0.08, 0.60])
  zipLambda:         number     // lambda parameter (ZIP active-regime scoring rate)
  mapreLambdaAdj:    number     // MAPRE-adjusted λ
  shrunkNrfiRate:    number     // ctx.shrunkRate (dynamic Bayesian shrinkage)
  dataWeight:        number     // ctx.dataWeight = n / (n + k)
  paOutcomes:        PAOutcomes // PA outcomes for Markov diamond UI
}

/**
 * Compute P(no runs in this half-inning) for all 7 models.
 *
 * @param lambda   Poisson λ (expected runs) for this half-inning.
 * @param pitcher  The pitcher on the mound (used for ZIP omega, Markov PA outcomes, MAPRE).
 * @param team     The batting team (used for offense factor in Markov and MAPRE).
 * @param side     "home" → home pitcher is on the mound; "away" → away pitcher.
 * @param ctx      Precomputed pitcher context (shrunkRate, rawBaseLambda, dataWeight).
 */
export function compute7ModelEnsemble(
  lambda:          number,
  pitcher:         Pitcher,
  team:            Team,
  side:            "home" | "away",
  ctx:             PitcherContext,
  temperature:     number = 72,  // Fahrenheit; 72 = dome/neutral default
  umpireWideness:  number = 0    // [-1, 1]; 0 = neutral
): SevenModelResult {
  // ── Original 4 models ─────────────────────────────────────────────────────
  const poisson    = Math.exp(-lambda)

  // ZIP: call the full implementation (temperature + umpire corrections).
  // Park factor is already baked into lambda; pass 1.0 to avoid double-counting.
  const zipResult  = computeZIPModel(
    pitcher,
    team.firstInning.offenseFactor,
    1.0,
    temperature,
    umpireWideness
  )
  const zip        = zipResult.nrfiProb
  const clampOmega = zipResult.omega

  // Markov: handedness-adjusted offense (Opt #2) + shrunk rate from ctx (Opt #5).
  // Inlined from the former computeMarkov24 so paOutcomes can be returned for UI.
  const lineupFactor  = getLineupVsHand(pitcher.throws, team)
  const shrunkPitcher = { ...pitcher, firstInning: { ...pitcher.firstInning, nrfiRate: ctx.shrunkRate } }
  const paOutcomes    = computePAOutcomes(shrunkPitcher, lineupFactor)
  const markov        = computeMarkovNrfi(paOutcomes).nrfiProb

  // MAPRE: raw base lambda from ctx avoids double-counting park/weather/umpire.
  // Inlined from the former computeMAPREhalf to capture lambdaAdj for UI.
  const mapreInputs: MAPREInputs = {
    sOpsPlus:              team.firstInning.sOpsPlus ?? team.firstInning.offenseFactor * 100,
    babip1st:              pitcher.firstInning.babip,
    hrPerPa1st:            pitcher.firstInning.hrPer9 / 38.7,
    barrelDev:             computeBarrelDev(pitcher),
    isHomePitcher:         side === "home",
    awayShortRestOrTravel: false,
  }
  const mapreResult = computeMAPREHalfInning(ctx.rawBaseLambda, mapreInputs)
  const mapre       = mapreResult.nrfiProb

  // ── 3 Meta-models (Opt #8) ────────────────────────────────────────────────

  // Logistic Stack: baseAvg weighted by normalised base-4 ensemble weights
  // (Poisson 10.9%, ZIP 27.3%, Markov 43.6%, MAPRE 9.1%).
  // σ(−2.3 + 4.1 × baseAvg): α = −2.3 captures the log-odds baseline for a
  // zero-run half-inning; β = 4.1 stretches it across the full probability range.
  const baseAvg      = 0.109 * poisson + 0.273 * zip + 0.436 * markov + 0.091 * mapre
  const logisticMeta = 1 / (1 + Math.exp(-(-2.3 + 4.1 * baseAvg)))

  // NN Interaction: Poisson × Markov product normalised by 0.67 (≈ 0.82²,
  // the geometric mean of two league-average half-inning NRFI probabilities).
  // When both independent models agree strongly on dominance, the product
  // amplifies that confidence above what either model alone would show.
  // Game level: (homeHalf + awayHalf) / 2 — averaged as a joint environment signal.
  const nnInteraction = Math.max(0.02, Math.min(0.98,
    poisson * markov / 0.67
  ))

  // Hierarchical Bayes: same dynamic k as getDynamicPriorWeight (k=30/50/80),
  // not the legacy empirical-Bayes k=1.14.
  // Game level: homeHalf × awayHalf (independent half-inning product).
  const n_hier    = pitcher.firstInning.startCount || 1
  const k_hier    = getDynamicPriorWeight(pitcher)
  const w_dynamic = Math.min(0.97, n_hier / (n_hier + k_hier))
  const hierarchicalBayes = Math.max(0.35, Math.min(0.92,
    w_dynamic * ctx.shrunkRate + (1 - w_dynamic) * LEAGUE_AVG_NRFI
  ))

  return {
    poisson, zip, markov, mapre, logisticMeta, nnInteraction, hierarchicalBayes,
    zipOmega:       clampOmega,
    zipLambda:      zipResult.lambda,
    mapreLambdaAdj: mapreResult.lambdaAdj,
    shrunkNrfiRate: ctx.shrunkRate,
    dataWeight:     ctx.dataWeight,
    paOutcomes,
  }
}

// ─── Markov State Snapshot (Phase 6: interactive MarkovDiamond UI) ────────────

/** Metadata for a single base-out state in the interactive Markov diamond. */
export interface MarkovStateInfo {
  outs: number
  /** Bitmask: bit0=1st, bit1=2nd, bit2=3rd */
  runners: number
  /** P(0 runs from this state to end of inning | currently here with 0 runs so far) */
  conditionalNrfiProb: number
  /** Diagnostic partial expected-runs figure (run-scoring branches only). */
  conditionalExpectedRuns: number
  /** Human-readable description of the base configuration. */
  baseDescription: string
}

export interface MarkovStateSnapshot {
  /** All 24 non-terminal states with their conditional NRFI probabilities. */
  states: MarkovStateInfo[]
  /** The PA outcomes used to generate this snapshot. */
  paOutcomes: PAOutcomes
  /** Overall P(NRFI) from the standard start (0 outs, bases empty). */
  nrfiProb: number
}

const BASE_DESCRIPTIONS = [
  "Bases empty",
  "Runner on 1st",
  "Runner on 2nd",
  "1st and 2nd",
  "Runner on 3rd",
  "1st and 3rd",
  "2nd and 3rd",
  "Bases loaded",
]

/**
 * Compute the full 24-state Markov snapshot for the interactive MarkovDiamond component.
 * For each of the 24 non-terminal base-out states, computes conditional P(NRFI)
 * by running the Markov chain with probability mass starting at that state.
 *
 * This calls computeMarkovNrfi(pa, outs, runners) for all 24 states — no Markov logic is duplicated.
 */
export function computeMarkovStateSnapshot(pa: PAOutcomes): MarkovStateSnapshot {
  const states: MarkovStateInfo[] = []
  for (let outs = 0; outs < 3; outs++) {
    for (let runners = 0; runners < 8; runners++) {
      const result = computeMarkovNrfi(pa, outs as OutCount, runners as RunnerBits)
      states.push({
        outs,
        runners,
        conditionalNrfiProb:     result.nrfiProb,
        conditionalExpectedRuns: result.runScoredBranchWeight,
        baseDescription:         BASE_DESCRIPTIONS[runners],
      })
    }
  }
  const baseResult = computeMarkovNrfi(pa)
  return { states, paOutcomes: pa, nrfiProb: baseResult.nrfiProb }
}
