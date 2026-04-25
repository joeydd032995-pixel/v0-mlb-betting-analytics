/**
 * NRFI/YRFI Prediction Engine — 7-Model Ensemble + All 8 Optimizations
 *
 * Public API (unchanged — all existing callers continue to work):
 *   computeAllPredictions(games, pitchers, teams) → NRFIPrediction[]
 *   computeNRFIPrediction(game, pitchers, teams)  → NRFIPrediction | null
 *
 * What changed internally (post-optimization):
 *   Opt #1 – Updated blend constants (76 % ensemble / 24 % anchor)
 *   Opt #2 – Handedness × lineup splits via getLineupVsHand
 *   Opt #3 – Vector wind + humidity via computeVectorWeatherMultiplier
 *   Opt #4 – Umpire bias factor (optional game field)
 *   Opt #5 – Dynamic Bayesian shrinkage via getDynamicPriorWeight / applyDynamicShrinkage
 *   Opt #6 – Monotonic P-spline calibration via calibrateWithMonotonicSpline
 *   Opt #7 – Widened output clamp [0.02, 0.98]
 *   Opt #8 – 7-model ensemble (logisticMeta + nnInteraction + hierarchicalBayes added)
 */

import type {
  Game,
  Pitcher,
  Team,
  NRFIPrediction,
  PredictionFactor,
  ModelInputs,
  ModelBreakdown,
  HalfInningModelBreakdown,
  ValueAnalysis,
  ConfidenceLevel,
  Recommendation,
  Weather,
} from "./types"
import {
  computeHalfInningEnsemble,
  combineHalfInnings,
  ENSEMBLE_WEIGHTS,
  compute7ModelEnsemble,
  getLineupVsHand,
  applyDynamicShrinkage,
  getDynamicPriorWeight,
  type HalfInningEnsembleResult,
  type MAPREInputs,
  type SevenModelResult,
} from "./nrfi-models"
import { calibrateWithMonotonicSpline } from "./calibration"
import { computeVectorWeatherMultiplier } from "./weather"
import { impliedProbability } from "./utils/odds"

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_KELLY_EDGE      = 0.03
const KELLY_FRACTION      = 0.25
const COLD_TEMP_THRESHOLD_F = 50
/** Opt #1: updated blend — 76 % ensemble, 24 % league anchor */
const ENSEMBLE_BLEND      = 0.76
/** Opt #1: anchor probability (league NRFI rate, calibration-adjusted) */
const LEAGUE_ANCHOR       = 0.614
/** Opt #7: widened clamp */
const CLAMP_MIN           = 0.02
const CLAMP_MAX           = 0.98
const NRFI_CALL_THRESHOLD = 0.52

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function impliedToAmerican(prob: number): number {
  if (prob >= 0.5) return -Math.round((prob / (1 - prob)) * 100)
  return Math.round(((1 - prob) / prob) * 100)
}

function kellyFraction(edge: number, odds: number): number {
  const modelProb  = Math.max(0, Math.min(1, impliedProbability(odds) + edge))
  const decimalOdds = odds > 0 ? odds / 100 : 100 / Math.abs(odds)
  const q          = 1 - modelProb
  const rawKelly   = (decimalOdds * modelProb - q) / decimalOdds
  return Math.max(0, Math.min(0.25, rawKelly * KELLY_FRACTION))
}

function expectedValue(modelProb: number, odds: number): number {
  const b = odds > 0 ? odds / 100 : 100 / Math.abs(odds)
  return modelProb * b - (1 - modelProb)
}

// ─── Opt #3: Vector Weather Multiplier ───────────────────────────────────────

/**
 * Scalar weather multiplier kept for backward compatibility and for feeding
 * temperatureF into computeHalfInningEnsemble (ZIP model).
 * The lambda computation now uses the vector version.
 */
export function computeWeatherMultiplier(weather: Weather): number {
  if (weather.conditions === "dome") return 1.0
  let m = 1.0
  if (weather.windDirection === "out" && weather.windSpeed > 5)
    m += (weather.windSpeed - 5) * 0.0045
  else if (weather.windDirection === "in" && weather.windSpeed > 5)
    m -= (weather.windSpeed - 5) * 0.003
  if (weather.temperature < COLD_TEMP_THRESHOLD_F)
    m -= (COLD_TEMP_THRESHOLD_F - weather.temperature) * 0.003
  else if (weather.temperature > 85)
    m += (weather.temperature - 85) * 0.002
  if (weather.conditions === "light-rain") m -= 0.03
  return Math.max(0.82, Math.min(1.22, m))
}

// ─── Recent Form Multiplier ───────────────────────────────────────────────────

function computeRecentFormMultiplier(home: Pitcher, away: Pitcher): number {
  const recentRate = (results: boolean[]): number | null =>
    results.length >= 3 ? results.filter(Boolean).length / results.length : null
  const homeRecent = recentRate(home.firstInning.last5Results)
  const awayRecent = recentRate(away.firstInning.last5Results)
  const deviations: number[] = []
  if (homeRecent !== null) deviations.push(homeRecent - home.firstInning.nrfiRate)
  if (awayRecent !== null) deviations.push(awayRecent - away.firstInning.nrfiRate)
  if (deviations.length === 0) return 1.0
  const avg = deviations.reduce((a, b) => a + b, 0) / deviations.length
  return Math.max(0.85, Math.min(1.15, 1.0 - 0.30 * avg))
}

// ─── Lambda Computation ───────────────────────────────────────────────────────

function computeLambda(
  pitcherNrfiRate: number,
  offenseFactor:  number,
  parkFactor:     number,
  weatherMult:    number
): number {
  const baseLambda = -Math.log(Math.max(0.01, Math.min(0.99, pitcherNrfiRate)))
  return baseLambda * offenseFactor * parkFactor * weatherMult
}

// ─── Opt #8: 7-Model Blend ───────────────────────────────────────────────────

// Keys whose values are game-level signals (not half-inning probabilities).
// These should be averaged across halves, not multiplied, to produce a game signal.
const GAME_LEVEL_KEYS = new Set<keyof typeof ENSEMBLE_WEIGHTS>(["hierarchicalBayes", "nnInteraction"])

/**
 * Combine two half-inning SevenModelResult objects into a game-level P(NRFI).
 *
 * Half-inning probability models (Poisson/ZIP/Markov/MAPRE):
 *   P_game = P_home_half × P_away_half  (independence assumption)
 *
 * Game-level signal models (hierarchicalBayes/nnInteraction):
 *   P_game = (home[k] + away[k]) / 2   (average — not a probability product)
 *
 * ENSEMBLE_WEIGHTS are pre-normalised to sum to 1.0.
 */
function blend7Models(home: SevenModelResult, away: SevenModelResult): number {
  const w    = ENSEMBLE_WEIGHTS
  const keys = Object.keys(w) as Array<keyof typeof ENSEMBLE_WEIGHTS>
  let ensemble = 0
  for (const key of keys) {
    const gameLevelProb = GAME_LEVEL_KEYS.has(key)
      ? (home[key] + away[key]) / 2
      : home[key] * away[key]
    ensemble += w[key] * gameLevelProb
  }
  return Math.max(0, Math.min(1, ensemble))
}

// ─── Factor Analysis ──────────────────────────────────────────────────────────

function buildFactors(
  game:        Game,
  homePitcher: Pitcher,
  awayPitcher: Pitcher,
  homeTeam:    Team,
  awayTeam:    Team
): PredictionFactor[] {
  const factors: PredictionFactor[] = []

  const hp = homePitcher.firstInning
  if (hp.nrfiRate >= 0.72) {
    factors.push({ name: `${homePitcher.name} — Elite Ace`, impact: "positive", magnitude: "strong",
      description: `${homePitcher.name} has a ${(hp.nrfiRate * 100).toFixed(0)}% NRFI rate this season — among the league's best.`,
      value: `${(hp.nrfiRate * 100).toFixed(0)}% NRFI` })
  } else if (hp.nrfiRate >= 0.64) {
    factors.push({ name: `${homePitcher.name} — Solid Starter`, impact: "positive", magnitude: "moderate",
      description: `${homePitcher.name} keeps the first inning clean ${(hp.nrfiRate * 100).toFixed(0)}% of the time.`,
      value: `${(hp.nrfiRate * 100).toFixed(0)}% NRFI` })
  } else {
    factors.push({ name: `${homePitcher.name} — Vulnerable`, impact: "negative",
      magnitude: hp.nrfiRate < 0.57 ? "strong" : "moderate",
      description: `${homePitcher.name}'s ${(hp.nrfiRate * 100).toFixed(0)}% NRFI rate creates first-inning risk.`,
      value: `${(hp.nrfiRate * 100).toFixed(0)}% NRFI` })
  }

  const ap = awayPitcher.firstInning
  if (ap.nrfiRate >= 0.72) {
    factors.push({ name: `${awayPitcher.name} — Elite Ace`, impact: "positive", magnitude: "strong",
      description: `${awayPitcher.name} dominates the first inning with a ${(ap.nrfiRate * 100).toFixed(0)}% NRFI rate.`,
      value: `${(ap.nrfiRate * 100).toFixed(0)}% NRFI` })
  } else if (ap.nrfiRate >= 0.64) {
    factors.push({ name: `${awayPitcher.name} — Solid Starter`, impact: "positive", magnitude: "moderate",
      description: `${awayPitcher.name} suppresses first-inning scoring ${(ap.nrfiRate * 100).toFixed(0)}% of his starts.`,
      value: `${(ap.nrfiRate * 100).toFixed(0)}% NRFI` })
  } else {
    factors.push({ name: `${awayPitcher.name} — Vulnerable`, impact: "negative",
      magnitude: ap.nrfiRate < 0.57 ? "strong" : "moderate",
      description: `${awayPitcher.name}'s ${(ap.nrfiRate * 100).toFixed(0)}% NRFI rate is a YRFI risk.`,
      value: `${(ap.nrfiRate * 100).toFixed(0)}% NRFI` })
  }

  if (awayTeam.firstInning.offenseFactor >= 1.12)
    factors.push({ name: `${awayTeam.abbreviation} Offense — Dangerous`, impact: "negative", magnitude: "moderate",
      description: `${awayTeam.name} rank among MLB's most aggressive first-inning offenses.`,
      value: `${awayTeam.firstInning.runsPerGame.toFixed(2)} R/1st` })
  else if (awayTeam.firstInning.offenseFactor <= 0.87)
    factors.push({ name: `${awayTeam.abbreviation} Offense — Weak`, impact: "positive", magnitude: "moderate",
      description: `${awayTeam.name} score early at a below-average rate this season.`,
      value: `${awayTeam.firstInning.runsPerGame.toFixed(2)} R/1st` })

  if (homeTeam.firstInning.offenseFactor >= 1.12)
    factors.push({ name: `${homeTeam.abbreviation} Lineup — Explosive`, impact: "negative", magnitude: "moderate",
      description: `${homeTeam.name} lead MLB in first-inning run production.`,
      value: `${homeTeam.firstInning.runsPerGame.toFixed(2)} R/1st` })
  else if (homeTeam.firstInning.offenseFactor <= 0.87)
    factors.push({ name: `${homeTeam.abbreviation} Lineup — Quiet`, impact: "positive", magnitude: "moderate",
      description: `${homeTeam.name} rarely get to starters in the first inning.`,
      value: `${homeTeam.firstInning.runsPerGame.toFixed(2)} R/1st` })

  if (game.parkFactor >= 1.08)
    factors.push({ name: "Hitter-Friendly Park", impact: "negative",
      magnitude: game.parkFactor >= 1.12 ? "strong" : "moderate",
      description: `${game.venue} suppresses pitcher performance — above-average run environment.`,
      value: `Park Factor ${game.parkFactor.toFixed(2)}` })
  else if (game.parkFactor <= 0.93)
    factors.push({ name: "Pitcher-Friendly Park", impact: "positive",
      magnitude: game.parkFactor <= 0.90 ? "strong" : "moderate",
      description: `${game.venue} suppresses run scoring — great NRFI environment.`,
      value: `Park Factor ${game.parkFactor.toFixed(2)}` })

  if (game.weather.conditions !== "dome") {
    if (game.weather.windDirection === "out" && game.weather.windSpeed >= 10)
      factors.push({ name: "Wind Blowing Out", impact: "negative",
        magnitude: game.weather.windSpeed >= 15 ? "strong" : "moderate",
        description: `${game.weather.windSpeed} mph wind carrying balls out — elevated HR risk.`,
        value: `${game.weather.windSpeed} mph out` })
    else if (game.weather.windDirection === "in" && game.weather.windSpeed >= 8)
      factors.push({ name: "Wind Blowing In", impact: "positive", magnitude: "moderate",
        description: `${game.weather.windSpeed} mph headwind suppresses fly balls — pitcher-friendly.`,
        value: `${game.weather.windSpeed} mph in` })
    if (game.weather.temperature < COLD_TEMP_THRESHOLD_F)
      factors.push({ name: "Cold Game-Time Temps", impact: "positive", magnitude: "slight",
        description: `${game.weather.temperature}°F makes it harder to drive the ball — suppresses scoring.`,
        value: `${game.weather.temperature}°F` })
    else if (game.weather.temperature >= 88)
      factors.push({ name: "Hot & Humid", impact: "negative", magnitude: "slight",
        description: `${game.weather.temperature}°F — warm air carries balls farther.`,
        value: `${game.weather.temperature}°F` })
  } else {
    factors.push({ name: "Controlled Dome Environment", impact: "neutral", magnitude: "slight",
      description: "Indoor stadium eliminates weather variance.", value: "Dome" })
  }

  if (hp.last5Results.length >= 5 && ap.last5Results.length >= 5) {
    const last5Home = hp.last5Results.filter(Boolean).length
    const last5Away = ap.last5Results.filter(Boolean).length
    if (last5Home >= 4 && last5Away >= 4)
      factors.push({ name: "Both Pitchers in Peak Form", impact: "positive", magnitude: "moderate",
        description: `${homePitcher.name} (${last5Home}/5 NRFI) and ${awayPitcher.name} (${last5Away}/5 NRFI) are both locked in.`,
        value: `${last5Home + last5Away}/10 recent NRFI` })
    else if (last5Home <= 1 || last5Away <= 1) {
      const bad = last5Home <= 1 ? homePitcher.name : awayPitcher.name
      const val = last5Home <= 1 ? last5Home : last5Away
      factors.push({ name: `${bad} — Struggling Recently`, impact: "negative", magnitude: "moderate",
        description: `Only ${val}/5 NRFI in last 5 starts — command issues warrant concern.`,
        value: `${val}/5 recent NRFI` })
    }
  }

  if (hp.firstBatterOBP >= 0.36)
    factors.push({ name: `${homePitcher.name} — Leadoff Issues`, impact: "negative", magnitude: "slight",
      description: `Gets first batter on base ${(hp.firstBatterOBP * 100).toFixed(0)}% of the time — sets up trouble.`,
      value: `.${Math.round(hp.firstBatterOBP * 1000)} 1st OBP` })
  else if (hp.firstBatterOBP <= 0.26)
    factors.push({ name: `${homePitcher.name} — Quick Outs`, impact: "positive", magnitude: "slight",
      description: `Retires the leadoff hitter ${(100 - hp.firstBatterOBP * 100).toFixed(0)}% of the time.`,
      value: `.${Math.round(hp.firstBatterOBP * 1000)} 1st OBP` })

  return factors
}

// ─── Confidence Scoring ───────────────────────────────────────────────────────

function computeConfidence(
  nrfiProbability: number,
  homePitcher:     Pitcher,
  awayPitcher:     Pitcher,
  modelConsensus   = 0.5
): { level: ConfidenceLevel; score: number } {
  let score = 50
  score += Math.abs(nrfiProbability - 0.5) * 70
  const minStarts = Math.min(
    homePitcher.firstInning.startCount,
    awayPitcher.firstInning.startCount
  )
  if (minStarts >= 18) score += 12
  else if (minStarts >= 10) score += 6
  else if (minStarts <= 3) score -= 14
  else score -= 8
  const consistency = (p: Pitcher) => {
    const r = p.firstInning.last5Results
    if (r.length < 3) return 0
    const avg = r.filter(Boolean).length / r.length
    return r.reduce((s, v) => s + (Number(v) - avg) ** 2, 0) / r.length
  }
  score -= (consistency(homePitcher) + consistency(awayPitcher)) * 15
  score += (modelConsensus - 0.5) * 16
  score = Math.max(10, Math.min(98, Math.round(score)))
  const level: ConfidenceLevel = score >= 62 ? "High" : score >= 45 ? "Medium" : "Low"
  return { level, score }
}

// ─── Recommendation ───────────────────────────────────────────────────────────

function getRecommendation(nrfiProb: number): Recommendation {
  if (nrfiProb >= 0.62) return "STRONG_NRFI"
  if (nrfiProb >= NRFI_CALL_THRESHOLD) return "LEAN_NRFI"
  if (nrfiProb >= 0.38) return "TOSS_UP"
  if (nrfiProb >= 0.28) return "LEAN_YRFI"
  return "STRONG_YRFI"
}

// ─── Value Analysis ───────────────────────────────────────────────────────────

function computeValueAnalysis(
  nrfiProb: number,
  odds:     { nrfiOdds: number; yrfiOdds: number; bookmaker: string }
): ValueAnalysis {
  const impliedNrfi = impliedProbability(odds.nrfiOdds)
  const impliedYrfi = impliedProbability(odds.yrfiOdds)
  const yrfiProb    = 1 - nrfiProb
  const nrfiEdge    = nrfiProb - impliedNrfi
  const yrfiEdge    = yrfiProb - impliedYrfi
  const base = { impliedNrfiProb: impliedNrfi, impliedYrfiProb: impliedYrfi,
    nrfiEdge, yrfiEdge, nrfiOdds: odds.nrfiOdds, yrfiOdds: odds.yrfiOdds }
  if (nrfiEdge >= MIN_KELLY_EDGE)
    return { ...base, recommendedBet: "NRFI",
      kellyFraction: kellyFraction(nrfiEdge, odds.nrfiOdds),
      expectedValue: expectedValue(nrfiProb, odds.nrfiOdds) }
  if (yrfiEdge >= MIN_KELLY_EDGE)
    return { ...base, recommendedBet: "YRFI",
      kellyFraction: kellyFraction(yrfiEdge, odds.yrfiOdds),
      expectedValue: expectedValue(yrfiProb, odds.yrfiOdds) }
  return { ...base, recommendedBet: "NO_BET", kellyFraction: 0, expectedValue: 0 }
}

// ─── Model Consensus ──────────────────────────────────────────────────────────

function halfInningConsensus(bd: HalfInningModelBreakdown): number {
  const probs  = [bd.poissonNrfi, bd.zipNrfi, bd.markovNrfi, bd.mapreNrfi]
  const mean   = probs.reduce((a, b) => a + b, 0) / probs.length
  const stdDev = Math.sqrt(probs.reduce((s, p) => s + (p - mean) ** 2, 0) / probs.length)
  return Math.max(0, Math.min(1, 1 - stdDev / 0.15))
}

function outlierNote(
  homeHalf: HalfInningModelBreakdown,
  awayHalf: HalfInningModelBreakdown
): string | undefined {
  const notes: string[] = []
  const checkHalf = (bd: HalfInningModelBreakdown, label: string) => {
    const probs: Record<string, number> = {
      Poisson: bd.poissonNrfi, ZIP: bd.zipNrfi, Markov: bd.markovNrfi, MAPRE: bd.mapreNrfi }
    const vals = Object.values(probs)
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    for (const [name, p] of Object.entries(probs))
      if (Math.abs(p - mean) > 0.08)
        notes.push(`${name} model diverges ${p > mean ? "bullish" : "bearish"} for NRFI (${label} half)`)
  }
  checkHalf(homeHalf, "home")
  checkHalf(awayHalf, "away")
  return notes.length > 0 ? notes.join("; ") : undefined
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

export function computeNRFIPrediction(
  game:     Game,
  pitchers: Map<string, Pitcher>,
  teams:    Map<string, Team>
): NRFIPrediction | null {
  const homePitcher = pitchers.get(game.homePitcherId)
  const awayPitcher = pitchers.get(game.awayPitcherId)
  const homeTeam    = teams.get(game.homeTeamId)
  const awayTeam    = teams.get(game.awayTeamId)

  if (!homePitcher || !awayPitcher || !homeTeam || !awayTeam) {
    console.error(
      `[nrfi-engine] Missing data for game ${game.id}: ` +
      `homePitcher=${!!homePitcher} awayPitcher=${!!awayPitcher} ` +
      `homeTeam=${!!homeTeam} awayTeam=${!!awayTeam}`
    )
    return null
  }

  const tempF = game.weather.conditions === "dome" ? 72 : (game.weather.temperature ?? 72)

  // ── Opt #5: Dynamic Bayesian shrinkage on pitcher NRFI rates ────────────────
  const homeShrunkRate = applyDynamicShrinkage(homePitcher, getDynamicPriorWeight(homePitcher))
  const awayShrunkRate = applyDynamicShrinkage(awayPitcher, getDynamicPriorWeight(awayPitcher))

  // ── Opt #2: Handedness × lineup splits ──────────────────────────────────────
  // Top of 1st: away team bats vs home pitcher
  const awayOffVsHand  = getLineupVsHand(homePitcher.throws, awayTeam)
  // Bottom of 1st: home team bats vs away pitcher
  const homeOffVsHand  = getLineupVsHand(awayPitcher.throws, homeTeam)

  // ── Opt #3: Vector weather multiplier ────────────────────────────────────────
  const vectorWeatherMult = computeVectorWeatherMultiplier(game.weather)
  const recentMult        = computeRecentFormMultiplier(homePitcher, awayPitcher)
  const combinedMult      = vectorWeatherMult * recentMult

  // ── Opt #4: Umpire bias (optional — defaults to 0 when field absent) ─────────
  // Positive nrfiFactor → umpire favours NRFI (tighter zone) → fewer runs → lower λ.
  // Clamped to [-0.5, 0.5] so a mis-scaled external value can't collapse or explode λ.
  const umpireFactor    = Math.max(-0.5, Math.min(0.5, game.umpire?.nrfiFactor ?? 0))
  const umpireLambdaMult = Math.max(0.05, 1 - umpireFactor)

  // ── Lambda per half-inning ───────────────────────────────────────────────────
  // awayScoresLambda: expected runs for away team (top 1st) vs home pitcher
  const awayScoresLambda = Math.max(0.05,
    computeLambda(homeShrunkRate, awayOffVsHand, game.parkFactor, combinedMult) * umpireLambdaMult
  )
  // homeScoresLambda: expected runs for home team (bottom 1st) vs away pitcher
  const homeScoresLambda = Math.max(0.05,
    computeLambda(awayShrunkRate, homeOffVsHand, game.parkFactor, combinedMult) * umpireLambdaMult
  )

  // ── Opt #8: 7-model ensemble per half ───────────────────────────────────────
  // "home half" = home pitcher on mound, away team batting
  const homeHalf7 = compute7ModelEnsemble(awayScoresLambda, homePitcher, awayTeam, "home")
  // "away half" = away pitcher on mound, home team batting
  const awayHalf7 = compute7ModelEnsemble(homeScoresLambda, awayPitcher, homeTeam, "away")

  // ── Blend + Opt #6: calibration ─────────────────────────────────────────────
  const rawEnsemble7  = blend7Models(homeHalf7, awayHalf7)
  const calibrated    = calibrateWithMonotonicSpline(rawEnsemble7)

  // ── Opt #1 + #7: league anchor blend + widened clamp ────────────────────────
  const blended  = ENSEMBLE_BLEND * calibrated + (1 - ENSEMBLE_BLEND) * LEAGUE_ANCHOR
  const nrfiProb = Math.max(CLAMP_MIN, Math.min(CLAMP_MAX, blended))
  const yrfiProb = 1 - nrfiProb   // symmetry guaranteed

  // ── Legacy 4-model ensemble (kept for modelBreakdown UI display) ─────────────
  const scalarWeatherMult = computeWeatherMultiplier(game.weather)
  const legacyMult        = scalarWeatherMult * recentMult

  const homeMapreInputs: MAPREInputs = {
    sOpsPlus:              awayTeam.firstInning.offenseFactor * 100,
    babip1st:              homePitcher.firstInning.babip,
    hrPerPa1st:            homePitcher.firstInning.hrPer9 / 38.7,
    barrelDev:             0,
    isHomePitcher:         true,
    awayShortRestOrTravel: false,
  }
  const awayMapreInputs: MAPREInputs = {
    sOpsPlus:              homeTeam.firstInning.offenseFactor * 100,
    babip1st:              awayPitcher.firstInning.babip,
    hrPerPa1st:            awayPitcher.firstInning.hrPer9 / 38.7,
    barrelDev:             0,
    isHomePitcher:         false,
    awayShortRestOrTravel: false,
  }
  const homeHalfRaw: HalfInningEnsembleResult = computeHalfInningEnsemble(
    homePitcher, awayTeam.firstInning.offenseFactor, game.parkFactor, tempF, 0, homeMapreInputs
  )
  const awayHalfRaw: HalfInningEnsembleResult = computeHalfInningEnsemble(
    awayPitcher, homeTeam.firstInning.offenseFactor, game.parkFactor, tempF, 0, awayMapreInputs
  )

  const homeHalfUI: HalfInningModelBreakdown = {
    poissonNrfi:           homeHalfRaw.poissonNrfi,
    zipNrfi:               homeHalfRaw.zipNrfi,
    zipOmega:              homeHalfRaw.zipOmega,
    zipLambda:             homeHalfRaw.zipLambda,
    markovNrfi:            homeHalfRaw.markovNrfi,
    mapreNrfi:             homeHalfRaw.mapreNrfi,
    mapreLambdaAdj:        homeHalfRaw.mapreLambdaAdj,
    bayesianDataWeight:    homeHalfRaw.bayesianDataWeight,
    shrunkNrfiRate:        homeHalfRaw.shrunkNrfiRate,
    // Meta-model half-inning values from the 7-model path
    logisticMetaNrfi:      homeHalf7.logisticMeta,
    nnInteractionNrfi:     homeHalf7.nnInteraction,
    hierarchicalBayesNrfi: homeHalf7.hierarchicalBayes,
  }
  const awayHalfUI: HalfInningModelBreakdown = {
    poissonNrfi:           awayHalfRaw.poissonNrfi,
    zipNrfi:               awayHalfRaw.zipNrfi,
    zipOmega:              awayHalfRaw.zipOmega,
    zipLambda:             awayHalfRaw.zipLambda,
    markovNrfi:            awayHalfRaw.markovNrfi,
    mapreNrfi:             awayHalfRaw.mapreNrfi,
    mapreLambdaAdj:        awayHalfRaw.mapreLambdaAdj,
    bayesianDataWeight:    awayHalfRaw.bayesianDataWeight,
    shrunkNrfiRate:        awayHalfRaw.shrunkNrfiRate,
    // Meta-model half-inning values from the 7-model path
    logisticMetaNrfi:      awayHalf7.logisticMeta,
    nnInteractionNrfi:     awayHalf7.nnInteraction,
    hierarchicalBayesNrfi: awayHalf7.hierarchicalBayes,
  }
  const consensus     = (halfInningConsensus(homeHalfUI) + halfInningConsensus(awayHalfUI)) / 2
  const legacyEnsemble = combineHalfInnings(homeHalfRaw, awayHalfRaw)

  const modelBreakdown: ModelBreakdown = {
    ensembleNrfi:   nrfiProb,
    ensembleYrfi:   yrfiProb,
    homeHalfInning: homeHalfUI,
    awayHalfInning: awayHalfUI,
    modelConsensus:  consensus,
    consensusNote:   outlierNote(homeHalfUI, awayHalfUI),
  }

  const { level: confidence, score: confScore } = computeConfidence(
    nrfiProb, homePitcher, awayPitcher, consensus
  )

  const modelInputs: ModelInputs = {
    homePitcherNrfiRate:  homePitcher.firstInning.nrfiRate,
    awayPitcherNrfiRate:  awayPitcher.firstInning.nrfiRate,
    homeOffenseFactor:    homeTeam.firstInning.offenseFactor,
    awayOffenseFactor:    awayTeam.firstInning.offenseFactor,
    parkFactor:           game.parkFactor,
    weatherMultiplier:    vectorWeatherMult,
    recentFormMultiplier: recentMult,
  }

  const factors      = buildFactors(game, homePitcher, awayPitcher, homeTeam, awayTeam)
  const valueAnalysis = game.odds ? computeValueAnalysis(nrfiProb, game.odds) : undefined

  return {
    gameId:            game.id,
    nrfiProbability:   nrfiProb,
    yrfiProbability:   yrfiProb,
    calibratedNrfiPct: parseFloat((nrfiProb * 100).toFixed(1)),
    homeExpectedRuns:  homeScoresLambda,
    awayExpectedRuns:  awayScoresLambda,
    homeScores0Prob:   Math.exp(-homeScoresLambda),
    awayScores0Prob:   Math.exp(-awayScoresLambda),
    confidence,
    confidenceScore:   confScore,
    recommendation:    getRecommendation(nrfiProb),
    factors,
    modelInputs,
    valueAnalysis,
    modelBreakdown,
  }
}

/** Compute predictions for all games in a slate, skipping any game with missing data. */
export function computeAllPredictions(
  games:    Game[],
  pitchers: Map<string, Pitcher>,
  teams:    Map<string, Team>
): NRFIPrediction[] {
  const results: NRFIPrediction[] = []
  for (const game of games) {
    const pred = computeNRFIPrediction(game, pitchers, teams)
    if (pred !== null) results.push(pred)
  }
  return results
}
