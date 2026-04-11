/**
 * NRFI/YRFI Prediction Engine
 *
 * Ensemble of four complementary models:
 *  1. Poisson (base)               — e^(−λ), λ from pitcher NRFI rate
 *  2. Bayesian Shrinkage           — corrects small-sample NRFI rate estimates
 *  3. Zero-Inflated Poisson (ZIP)  — models "lockdown" vs "active" innings
 *  4. Markov Chain (24 states)     — state-based base-out inning simulation
 *
 * Ensemble weights: Poisson 25%, ZIP 35%, Markov 40%
 * P(NRFI) = P(home scores 0) × P(away scores 0)  (per-ensemble)
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
  type MAPREInputs,
} from "./nrfi-models"

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum Kelly edge before recommending a bet */
const MIN_KELLY_EDGE = 0.03
/** Fractional Kelly multiplier */
const KELLY_FRACTION = 0.25

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert American odds to implied probability */
export function americanToImplied(odds: number): number {
  if (odds > 0) return 100 / (odds + 100)
  return Math.abs(odds) / (Math.abs(odds) + 100)
}

/** Convert implied probability to American odds */
export function impliedToAmerican(prob: number): number {
  if (prob >= 0.5) return -Math.round((prob / (1 - prob)) * 100)
  return Math.round(((1 - prob) / prob) * 100)
}

/** Kelly Criterion: fraction of bankroll to wager */
function kellyFraction(edge: number, odds: number): number {
  const p = americanToImplied(odds) + edge
  const b = odds > 0 ? odds / 100 : 100 / Math.abs(odds)
  const q = 1 - p
  const kelly = (b * p - q) / b
  return Math.max(0, kelly * KELLY_FRACTION)
}

/** Expected value as a decimal return */
function expectedValue(modelProb: number, odds: number): number {
  const b = odds > 0 ? odds / 100 : 100 / Math.abs(odds)
  return modelProb * b - (1 - modelProb)
}

// ─── Weather Multiplier ───────────────────────────────────────────────────────

/**
 * Returns a multiplier that adjusts expected runs based on weather.
 * > 1.0 means more expected runs (bad for NRFI); < 1.0 means fewer runs.
 */
export function computeWeatherMultiplier(weather: Weather): number {
  if (weather.conditions === "dome") return 1.0

  let multiplier = 1.0

  // Wind effect
  if (weather.windDirection === "out" && weather.windSpeed > 5) {
    multiplier += (weather.windSpeed - 5) * 0.0045
  } else if (weather.windDirection === "in" && weather.windSpeed > 5) {
    multiplier -= (weather.windSpeed - 5) * 0.003
  }

  // Temperature effect  (cold suppresses run scoring; heat slightly increases it)
  if (weather.temperature < 50) {
    multiplier -= (50 - weather.temperature) * 0.003
  } else if (weather.temperature > 85) {
    multiplier += (weather.temperature - 85) * 0.002
  }

  // Rain suppresses scoring slightly
  if (weather.conditions === "light-rain") multiplier -= 0.03

  return Math.max(0.82, Math.min(1.22, multiplier))
}

// ─── Recent Form Multiplier ───────────────────────────────────────────────────

/**
 * Returns a multiplier based on each pitcher's last 5 starts.
 * Combines home and away pitcher tendencies into a single adjustment.
 * > 1.0 means pitchers have been getting hit (bad for NRFI); < 1.0 = dominating.
 */
function computeRecentFormMultiplier(homePitcher: Pitcher, awayPitcher: Pitcher): number {
  const recentNrfi = (p: Pitcher) => {
    const results = p.firstInning.last5Results
    if (!results.length) return p.firstInning.nrfiRate
    return results.filter(Boolean).length / results.length
  }

  const homeRecent = recentNrfi(homePitcher)
  const awayRecent = recentNrfi(awayPitcher)
  const avgRecent = (homeRecent + awayRecent) / 2
  const avgSeason = (homePitcher.firstInning.nrfiRate + awayPitcher.firstInning.nrfiRate) / 2

  // Blended 70% season / 30% recent
  const blended = 0.7 * avgSeason + 0.3 * avgRecent
  // Multiplier: if recent is better than season, lower λ (better for NRFI)
  return avgSeason > 0 ? blended / avgSeason : 1.0
}

// ─── Lambda Computation ───────────────────────────────────────────────────────

/**
 * Compute the expected runs (Poisson λ) for one team in the first inning.
 *
 * @param pitcherNrfiRate  Historical NRFI rate of the opposing pitcher
 * @param offenseFactor    The batting team's first-inning offense factor
 * @param parkFactor       Run-scoring park factor
 * @param weatherMult      Weather multiplier
 */
function computeLambda(
  pitcherNrfiRate: number,
  offenseFactor: number,
  parkFactor: number,
  weatherMult: number
): number {
  // Base lambda from pitcher's historical NRFI rate via Poisson inversion
  const baseLambda = -Math.log(Math.max(0.01, Math.min(0.99, pitcherNrfiRate)))
  return baseLambda * offenseFactor * parkFactor * weatherMult
}

// ─── Factor Analysis ──────────────────────────────────────────────────────────

function buildFactors(
  game: Game,
  homePitcher: Pitcher,
  awayPitcher: Pitcher,
  homeTeam: Team,
  awayTeam: Team,
  weatherMult: number
): PredictionFactor[] {
  const factors: PredictionFactor[] = []

  // Home pitcher (facing away team)
  const hp = homePitcher.firstInning
  if (hp.nrfiRate >= 0.72) {
    factors.push({
      name: `${homePitcher.name} — Elite Ace`,
      impact: "positive",
      magnitude: "strong",
      description: `${homePitcher.name} has a ${(hp.nrfiRate * 100).toFixed(0)}% NRFI rate this season — among the league's best.`,
      value: `${(hp.nrfiRate * 100).toFixed(0)}% NRFI`,
    })
  } else if (hp.nrfiRate >= 0.64) {
    factors.push({
      name: `${homePitcher.name} — Solid Starter`,
      impact: "positive",
      magnitude: "moderate",
      description: `${homePitcher.name} keeps the first inning clean ${(hp.nrfiRate * 100).toFixed(0)}% of the time.`,
      value: `${(hp.nrfiRate * 100).toFixed(0)}% NRFI`,
    })
  } else {
    factors.push({
      name: `${homePitcher.name} — Vulnerable`,
      impact: "negative",
      magnitude: hp.nrfiRate < 0.57 ? "strong" : "moderate",
      description: `${homePitcher.name}'s ${(hp.nrfiRate * 100).toFixed(0)}% NRFI rate creates first-inning risk.`,
      value: `${(hp.nrfiRate * 100).toFixed(0)}% NRFI`,
    })
  }

  // Away pitcher (facing home team)
  const ap = awayPitcher.firstInning
  if (ap.nrfiRate >= 0.72) {
    factors.push({
      name: `${awayPitcher.name} — Elite Ace`,
      impact: "positive",
      magnitude: "strong",
      description: `${awayPitcher.name} dominates the first inning with a ${(ap.nrfiRate * 100).toFixed(0)}% NRFI rate.`,
      value: `${(ap.nrfiRate * 100).toFixed(0)}% NRFI`,
    })
  } else if (ap.nrfiRate >= 0.64) {
    factors.push({
      name: `${awayPitcher.name} — Solid Starter`,
      impact: "positive",
      magnitude: "moderate",
      description: `${awayPitcher.name} suppresses first-inning scoring ${(ap.nrfiRate * 100).toFixed(0)}% of his starts.`,
      value: `${(ap.nrfiRate * 100).toFixed(0)}% NRFI`,
    })
  } else {
    factors.push({
      name: `${awayPitcher.name} — Vulnerable`,
      impact: "negative",
      magnitude: ap.nrfiRate < 0.57 ? "strong" : "moderate",
      description: `${awayPitcher.name}'s ${(ap.nrfiRate * 100).toFixed(0)}% NRFI rate is a YRFI risk.`,
      value: `${(ap.nrfiRate * 100).toFixed(0)}% NRFI`,
    })
  }

  // Away offense (vs home pitcher)
  if (awayTeam.firstInning.offenseFactor >= 1.12) {
    factors.push({
      name: `${awayTeam.abbreviation} Offense — Dangerous`,
      impact: "negative",
      magnitude: "moderate",
      description: `${awayTeam.name} rank among MLB's most aggressive first-inning offenses.`,
      value: `${awayTeam.firstInning.runsPerGame.toFixed(2)} R/1st`,
    })
  } else if (awayTeam.firstInning.offenseFactor <= 0.87) {
    factors.push({
      name: `${awayTeam.abbreviation} Offense — Weak`,
      impact: "positive",
      magnitude: "moderate",
      description: `${awayTeam.name} score early at a below-average rate this season.`,
      value: `${awayTeam.firstInning.runsPerGame.toFixed(2)} R/1st`,
    })
  }

  // Home offense (vs away pitcher)
  if (homeTeam.firstInning.offenseFactor >= 1.12) {
    factors.push({
      name: `${homeTeam.abbreviation} Lineup — Explosive`,
      impact: "negative",
      magnitude: "moderate",
      description: `${homeTeam.name} lead MLB in first-inning run production.`,
      value: `${homeTeam.firstInning.runsPerGame.toFixed(2)} R/1st`,
    })
  } else if (homeTeam.firstInning.offenseFactor <= 0.87) {
    factors.push({
      name: `${homeTeam.abbreviation} Lineup — Quiet`,
      impact: "positive",
      magnitude: "moderate",
      description: `${homeTeam.name} rarely get to starters in the first inning.`,
      value: `${homeTeam.firstInning.runsPerGame.toFixed(2)} R/1st`,
    })
  }

  // Park factor
  if (game.parkFactor >= 1.08) {
    factors.push({
      name: "Hitter-Friendly Park",
      impact: "negative",
      magnitude: game.parkFactor >= 1.12 ? "strong" : "moderate",
      description: `${game.venue} suppresses pitcher performance — above-average run environment.`,
      value: `Park Factor ${game.parkFactor.toFixed(2)}`,
    })
  } else if (game.parkFactor <= 0.93) {
    factors.push({
      name: "Pitcher-Friendly Park",
      impact: "positive",
      magnitude: game.parkFactor <= 0.90 ? "strong" : "moderate",
      description: `${game.venue} suppresses run scoring — great NRFI environment.`,
      value: `Park Factor ${game.parkFactor.toFixed(2)}`,
    })
  }

  // Weather
  if (game.weather.conditions !== "dome") {
    if (game.weather.windDirection === "out" && game.weather.windSpeed >= 10) {
      factors.push({
        name: "Wind Blowing Out",
        impact: "negative",
        magnitude: game.weather.windSpeed >= 15 ? "strong" : "moderate",
        description: `${game.weather.windSpeed} mph wind carrying balls out — elevated HR risk.`,
        value: `${game.weather.windSpeed} mph out`,
      })
    } else if (game.weather.windDirection === "in" && game.weather.windSpeed >= 8) {
      factors.push({
        name: "Wind Blowing In",
        impact: "positive",
        magnitude: "moderate",
        description: `${game.weather.windSpeed} mph headwind suppresses fly balls — pitcher-friendly.`,
        value: `${game.weather.windSpeed} mph in`,
      })
    }
    if (game.weather.temperature <= 48) {
      factors.push({
        name: "Cold Game-Time Temps",
        impact: "positive",
        magnitude: "slight",
        description: `${game.weather.temperature}°F makes it harder to drive the ball — suppresses scoring.`,
        value: `${game.weather.temperature}°F`,
      })
    } else if (game.weather.temperature >= 88) {
      factors.push({
        name: "Hot & Humid",
        impact: "negative",
        magnitude: "slight",
        description: `${game.weather.temperature}°F — warm air carries balls farther.`,
        value: `${game.weather.temperature}°F`,
      })
    }
  } else {
    factors.push({
      name: "Controlled Dome Environment",
      impact: "neutral",
      magnitude: "slight",
      description: "Indoor stadium eliminates weather variance.",
      value: "Dome",
    })
  }

  // Recent form
  const last5Home = hp.last5Results.filter(Boolean).length
  const last5Away = ap.last5Results.filter(Boolean).length
  if (last5Home >= 4 && last5Away >= 4) {
    factors.push({
      name: "Both Pitchers in Peak Form",
      impact: "positive",
      magnitude: "moderate",
      description: `${homePitcher.name} (${last5Home}/5 NRFI) and ${awayPitcher.name} (${last5Away}/5 NRFI) are both locked in.`,
      value: `${last5Home + last5Away}/10 recent NRFI`,
    })
  } else if (last5Home <= 1 || last5Away <= 1) {
    const bad = last5Home <= 1 ? homePitcher.name : awayPitcher.name
    const val = last5Home <= 1 ? last5Home : last5Away
    factors.push({
      name: `${bad} — Struggling Recently`,
      impact: "negative",
      magnitude: "moderate",
      description: `Only ${val}/5 NRFI in last 5 starts — command issues warrant concern.`,
      value: `${val}/5 recent NRFI`,
    })
  }

  // First batter OBP
  if (hp.firstBatterOBP >= 0.36) {
    factors.push({
      name: `${homePitcher.name} — Leadoff Issues`,
      impact: "negative",
      magnitude: "slight",
      description: `Gets first batter on base ${(hp.firstBatterOBP * 100).toFixed(0)}% of the time — sets up trouble.`,
      value: `.${Math.round(hp.firstBatterOBP * 1000)} 1st OBP`,
    })
  } else if (hp.firstBatterOBP <= 0.26) {
    factors.push({
      name: `${homePitcher.name} — Quick Outs`,
      impact: "positive",
      magnitude: "slight",
      description: `Retires the leadoff hitter ${(100 - hp.firstBatterOBP * 100).toFixed(0)}% of the time.`,
      value: `.${Math.round(hp.firstBatterOBP * 1000)} 1st OBP`,
    })
  }

  return factors
}

// ─── Confidence Scoring ───────────────────────────────────────────────────────

function computeConfidence(
  nrfiProbability: number,
  homePitcher: Pitcher,
  awayPitcher: Pitcher,
  modelConsensus: number = 0.5
): { level: ConfidenceLevel; score: number } {
  let score = 50

  // Distance from 50% toss-up (max +35)
  const dist = Math.abs(nrfiProbability - 0.5)
  score += dist * 70

  // Sample size — Bayesian logic: small samples reduce confidence
  const minStarts = Math.min(
    homePitcher.firstInning.startCount,
    awayPitcher.firstInning.startCount
  )
  if (minStarts >= 18) score += 12
  else if (minStarts >= 10) score += 6
  else if (minStarts <= 3) score -= 14  // Very few starts → heavy shrinkage
  else score -= 8

  // Recent form consistency (low variance = higher confidence)
  const consistency = (p: Pitcher) => {
    const r = p.firstInning.last5Results
    if (r.length < 3) return 0
    const avg = r.filter(Boolean).length / r.length
    const variance = r.reduce((s, v) => s + (Number(v) - avg) ** 2, 0) / r.length
    return variance
  }
  const totalVariance = consistency(homePitcher) + consistency(awayPitcher)
  score -= totalVariance * 15

  // Model consensus bonus/penalty: all models agree → +8; strong divergence → −8
  score += (modelConsensus - 0.5) * 16

  score = Math.max(10, Math.min(98, Math.round(score)))
  const level: ConfidenceLevel = score >= 68 ? "High" : score >= 45 ? "Medium" : "Low"
  return { level, score }
}

// ─── Recommendation ───────────────────────────────────────────────────────────

function getRecommendation(nrfiProb: number): Recommendation {
  if (nrfiProb >= 0.65) return "STRONG_NRFI"
  if (nrfiProb >= 0.57) return "LEAN_NRFI"
  if (nrfiProb >= 0.47) return "TOSS_UP"
  if (nrfiProb >= 0.38) return "LEAN_YRFI"
  return "STRONG_YRFI"
}

// ─── Value Analysis ───────────────────────────────────────────────────────────

function computeValueAnalysis(
  nrfiProb: number,
  odds: { nrfiOdds: number; yrfiOdds: number; bookmaker: string }
): ValueAnalysis {
  const impliedNrfi = americanToImplied(odds.nrfiOdds)
  const impliedYrfi = americanToImplied(odds.yrfiOdds)
  const yrfiProb = 1 - nrfiProb
  const nrfiEdge = nrfiProb - impliedNrfi
  const yrfiEdge = yrfiProb - impliedYrfi

  const MIN_EDGE = MIN_KELLY_EDGE
  let recommendedBet: "NRFI" | "YRFI" | "NO_BET" = "NO_BET"
  if (nrfiEdge >= MIN_EDGE) recommendedBet = "NRFI"
  else if (yrfiEdge >= MIN_EDGE) recommendedBet = "YRFI"

  const betOdds = recommendedBet === "NRFI" ? odds.nrfiOdds : odds.yrfiOdds
  const betEdge = recommendedBet === "NRFI" ? nrfiEdge : yrfiEdge
  const betProb = recommendedBet === "NRFI" ? nrfiProb : yrfiProb

  return {
    impliedNrfiProb: impliedNrfi,
    impliedYrfiProb: impliedYrfi,
    nrfiEdge,
    yrfiEdge,
    nrfiOdds: odds.nrfiOdds,
    yrfiOdds: odds.yrfiOdds,
    recommendedBet,
    kellyFraction:
      recommendedBet !== "NO_BET" ? kellyFraction(betEdge, betOdds) : 0,
    expectedValue:
      recommendedBet !== "NO_BET" ? expectedValue(betProb, betOdds) : 0,
  }
}

// ─── Model Consensus ──────────────────────────────────────────────────────────

/**
 * Computes a 0–1 agreement score across all four structural models
 * for a single half-inning. 1.0 = all models within 1% of each other.
 */
function halfInningConsensus(bd: HalfInningModelBreakdown): number {
  const probs = [bd.poissonNrfi, bd.zipNrfi, bd.markovNrfi, bd.mapreNrfi]
  const mean = probs.reduce((a, b) => a + b, 0) / probs.length
  const variance = probs.reduce((s, p) => s + (p - mean) ** 2, 0) / probs.length
  const stdDev = Math.sqrt(variance)
  // Map std dev to a 0–1 consensus score (0.15 std dev → ~0 consensus)
  return Math.max(0, Math.min(1, 1 - stdDev / 0.15))
}

function outlierNote(
  homeHalf: HalfInningModelBreakdown,
  awayHalf: HalfInningModelBreakdown
): string | undefined {
  const checkHalf = (bd: HalfInningModelBreakdown, label: string): string | undefined => {
    const probs = {
      Poisson: bd.poissonNrfi,
      ZIP:     bd.zipNrfi,
      Markov:  bd.markovNrfi,
      MAPRE:   bd.mapreNrfi,
    }
    const values = Object.values(probs)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    for (const [name, p] of Object.entries(probs)) {
      if (Math.abs(p - mean) > 0.08) {
        return `${name} model diverges ${p > mean ? "bullish" : "bearish"} for NRFI (${label} half)`
      }
    }
    return undefined
  }
  return checkHalf(homeHalf, "home") ?? checkHalf(awayHalf, "away")
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

export function computeNRFIPrediction(
  game: Game,
  pitchers: Map<string, Pitcher>,
  teams: Map<string, Team>
): NRFIPrediction {
  const homePitcher = pitchers.get(game.homePitcherId)!
  const awayPitcher = pitchers.get(game.awayPitcherId)!
  const homeTeam = teams.get(game.homeTeamId)!
  const awayTeam = teams.get(game.awayTeamId)!

  const weatherMult = computeWeatherMultiplier(game.weather)
  const recentMult = computeRecentFormMultiplier(homePitcher, awayPitcher)
  const tempF = game.weather.conditions === "dome" ? 72 : (game.weather.temperature ?? 72)

  // ── Base Poisson (for factors, lambda display, and legacy compatibility) ──
  const awayLambda = computeLambda(
    homePitcher.firstInning.nrfiRate,
    awayTeam.firstInning.offenseFactor,
    game.parkFactor,
    weatherMult * recentMult
  )
  const homeLambda = computeLambda(
    awayPitcher.firstInning.nrfiRate,
    homeTeam.firstInning.offenseFactor,
    game.parkFactor,
    weatherMult * recentMult
  )
  const awayScores0Base = Math.exp(-awayLambda)
  const homeScores0Base = Math.exp(-homeLambda)

  // ── MAPRE inputs (per half-inning) ────────────────────────────────────────
  // "home half" = away team bats vs home pitcher
  const homeMabreInputs: MAPREInputs = {
    sOpsPlus:             awayTeam.firstInning.offenseFactor * 100,
    babip1st:             homePitcher.firstInning.babip,
    // HR/PA ≈ hrPer9 / (9 innings × 4.3 BF/inning)
    hrPerPa1st:           homePitcher.firstInning.hrPer9 / 38.7,
    barrelDev:            0,     // no Statcast data → graceful degradation
    isHomePitcher:        true,
    awayShortRestOrTravel: false, // no schedule data → default off
  }
  // "away half" = home team bats vs away pitcher
  const awayMapreInputs: MAPREInputs = {
    sOpsPlus:             homeTeam.firstInning.offenseFactor * 100,
    babip1st:             awayPitcher.firstInning.babip,
    hrPerPa1st:           awayPitcher.firstInning.hrPer9 / 38.7,
    barrelDev:            0,
    isHomePitcher:        false,
    awayShortRestOrTravel: false,
  }

  // ── Multi-model ensemble ──────────────────────────────────────────────────
  // "home half inning" = away team batting vs home pitcher
  const homeHalfRaw = computeHalfInningEnsemble(
    homePitcher,
    awayTeam.firstInning.offenseFactor,
    game.parkFactor,
    tempF,
    0,
    homeMabreInputs
  )
  // "away half inning" = home team batting vs away pitcher
  const awayHalfRaw = computeHalfInningEnsemble(
    awayPitcher,
    homeTeam.firstInning.offenseFactor,
    game.parkFactor,
    tempF,
    0,
    awayMapreInputs
  )

  const ensembleNrfi = combineHalfInnings(homeHalfRaw, awayHalfRaw)

  // Blend: 60% ensemble, 40% base Poisson (for numerical stability & familiarity)
  const blendedNrfi = 0.60 * ensembleNrfi + 0.40 * (awayScores0Base * homeScores0Base)
  const nrfiProb = Math.max(0.05, Math.min(0.95, blendedNrfi))
  const yrfiProb = 1 - nrfiProb

  // ── Build model breakdown for UI ─────────────────────────────────────────
  const homeHalf: HalfInningModelBreakdown = {
    poissonNrfi:        homeHalfRaw.poissonNrfi,
    zipNrfi:            homeHalfRaw.zipNrfi,
    zipOmega:           homeHalfRaw.zipOmega,
    zipLambda:          homeHalfRaw.zipLambda,
    markovNrfi:         homeHalfRaw.markovNrfi,
    mapreNrfi:          homeHalfRaw.mapreNrfi,
    mapreLambdaAdj:     homeHalfRaw.mapreLambdaAdj,
    bayesianDataWeight: homeHalfRaw.bayesianDataWeight,
    shrunkNrfiRate:     homeHalfRaw.shrunkNrfiRate,
  }
  const awayHalf: HalfInningModelBreakdown = {
    poissonNrfi:        awayHalfRaw.poissonNrfi,
    zipNrfi:            awayHalfRaw.zipNrfi,
    zipOmega:           awayHalfRaw.zipOmega,
    zipLambda:          awayHalfRaw.zipLambda,
    markovNrfi:         awayHalfRaw.markovNrfi,
    mapreNrfi:          awayHalfRaw.mapreNrfi,
    mapreLambdaAdj:     awayHalfRaw.mapreLambdaAdj,
    bayesianDataWeight: awayHalfRaw.bayesianDataWeight,
    shrunkNrfiRate:     awayHalfRaw.shrunkNrfiRate,
  }
  const consensus =
    (halfInningConsensus(homeHalf) + halfInningConsensus(awayHalf)) / 2

  const modelBreakdown: ModelBreakdown = {
    ensembleNrfi,
    ensembleYrfi: 1 - ensembleNrfi,
    homeHalfInning: homeHalf,
    awayHalfInning: awayHalf,
    modelConsensus: consensus,
    consensusNote: outlierNote(homeHalf, awayHalf),
  }

  // ── Confidence (now includes model consensus as a factor) ─────────────────
  const { level: confidence, score: confScore } = computeConfidence(
    nrfiProb,
    homePitcher,
    awayPitcher,
    consensus
  )

  const modelInputs: ModelInputs = {
    homePitcherNrfiRate: homePitcher.firstInning.nrfiRate,
    awayPitcherNrfiRate: awayPitcher.firstInning.nrfiRate,
    homeOffenseFactor:   homeTeam.firstInning.offenseFactor,
    awayOffenseFactor:   awayTeam.firstInning.offenseFactor,
    parkFactor:          game.parkFactor,
    weatherMultiplier:   weatherMult,
    recentFormMultiplier: recentMult,
  }

  const factors = buildFactors(
    game, homePitcher, awayPitcher, homeTeam, awayTeam, weatherMult
  )

  const valueAnalysis = game.odds
    ? computeValueAnalysis(nrfiProb, game.odds)
    : undefined

  return {
    gameId: game.id,
    nrfiProbability: nrfiProb,
    yrfiProbability: yrfiProb,
    homeExpectedRuns: homeLambda,
    awayExpectedRuns: awayLambda,
    homeScores0Prob: homeScores0Base,
    awayScores0Prob: awayScores0Base,
    confidence,
    confidenceScore: confScore,
    recommendation: getRecommendation(nrfiProb),
    factors,
    modelInputs,
    valueAnalysis,
    modelBreakdown,
  }
}

/** Compute predictions for all games in a slate */
export function computeAllPredictions(
  games: Game[],
  pitchers: Map<string, Pitcher>,
  teams: Map<string, Team>
): NRFIPrediction[] {
  return games.map((g) => computeNRFIPrediction(g, pitchers, teams))
}
