/**
 * Prediction Tracking Store (localStorage)
 *
 * Persists all daily predictions with their full model breakdown so that:
 *  1. Actual first-inning results can be recorded after games end.
 *  2. Per-model accuracy (Poisson, ZIP, Markov, Ensemble) can be computed.
 *  3. Model inputs are stored for future calibration / weight-tuning.
 *
 * Storage key: "nrfi_predictions_v1"
 * Format: JSON array of TrackedPrediction, newest-first.
 */

import type {
  ConfidenceLevel,
  ModelAccuracy,
  NRFIPrediction,
  Game,
  Pitcher,
  Team,
} from "./types"

// ─── TrackedPrediction ────────────────────────────────────────────────────────

export interface TrackedPrediction {
  /** Game PK from MLB Stats API — globally unique */
  id: string
  date: string        // "YYYY-MM-DD"
  homeTeam: string
  awayTeam: string
  homeTeamId: string
  awayTeamId: string
  homePitcher: string
  awayPitcher: string
  venue: string

  // ── Prediction output ────────────────────────────────────────────────────
  nrfiProbability: number
  yrfiProbability: number
  prediction: "NRFI" | "YRFI"
  confidence: ConfidenceLevel
  confidenceScore: number

  // ── Odds snapshot ────────────────────────────────────────────────────────
  nrfiOdds?: number
  yrfiOdds?: number

  // ── Per-model probabilities for refinement ───────────────────────────────
  /** Base Poisson P(NRFI) — P(homeScores0) × P(awayScores0) */
  poissonNrfi: number
  /** Zero-Inflated Poisson P(NRFI) */
  zipNrfi: number
  /** Markov Chain P(NRFI) */
  markovNrfi: number
  /** 60%/40%-blended Ensemble P(NRFI) */
  ensembleNrfi: number
  /** 0–1 model agreement score */
  modelConsensus: number

  // ZIP diagnostics (home pitcher vs away lineup)
  homeZipOmega: number   // "lockdown" probability for home pitcher
  awayZipOmega: number   // "lockdown" probability for away pitcher
  // Bayesian data weights (how much of the rate comes from season data vs league avg)
  homeBayesianWeight: number
  awayBayesianWeight: number

  // ── Model inputs (stored so we can back-test weighting schemes later) ────
  modelInputs: {
    homePitcherNrfiRate: number
    awayPitcherNrfiRate: number
    homeOffenseFactor: number
    awayOffenseFactor: number
    parkFactor: number
    weatherMultiplier: number
    recentFormMultiplier: number
    homePitcherStarts: number
    awayPitcherStarts: number
    temperatureF: number
    windSpeed: number
    windDirection: string
    conditions: string
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────
  status: "pending" | "complete"
  savedAt: string  // ISO timestamp

  // ── Result (filled in when complete) ────────────────────────────────────
  actualResult?: "NRFI" | "YRFI"
  correct?: boolean
  runsFirstInning?: { home: number; away: number }
  profitLoss?: number  // flat-stake units on the recommended bet
}

// ─── PerModelAccuracy ─────────────────────────────────────────────────────────

export interface PerModelAccuracy {
  model: "Poisson" | "ZIP" | "Markov" | "Ensemble"
  totalPredictions: number
  correct: number
  accuracy: number
  /** Calibration: mean absolute error between model probability and actual rate */
  mae: number
}

// ─── ExtendedModelAccuracy ────────────────────────────────────────────────────

export interface ExtendedModelAccuracy extends ModelAccuracy {
  perModelAccuracy: PerModelAccuracy[]
  pendingCount: number
  totalTracked: number
  /** P/L in flat-stake units on high-confidence bets only */
  highConfPnL: number
}

// ─── Storage key ──────────────────────────────────────────────────────────────

const STORE_KEY = "nrfi_predictions_v1"

// ─── CRUD helpers ─────────────────────────────────────────────────────────────

export function loadTrackedPredictions(): TrackedPrediction[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as TrackedPrediction[]
  } catch {
    return []
  }
}

function persist(predictions: TrackedPrediction[]): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(predictions))
  } catch (err) {
    console.error("[prediction-store] persist error:", err)
  }
}

// ─── Build a TrackedPrediction from live API data ─────────────────────────────

export function buildTrackedPrediction(
  pred: NRFIPrediction,
  game: Game,
  pitchers: Map<string, Pitcher>,
  teams: Map<string, Team>,
  date: string
): TrackedPrediction {
  const homePitcher = pitchers.get(game.homePitcherId)
  const awayPitcher = pitchers.get(game.awayPitcherId)
  const homeTeam    = teams.get(game.homeTeamId)
  const awayTeam    = teams.get(game.awayTeamId)

  const bd = pred.modelBreakdown
  const hh = bd?.homeHalfInning
  const ah = bd?.awayHalfInning

  // Derive per-model full-inning NRFI from half-inning values
  // (home half = away bats; away half = home bats — both must score 0)
  const poissonNrfi  = (hh?.poissonNrfi  ?? pred.homeScores0Prob) *
                       (ah?.poissonNrfi  ?? pred.awayScores0Prob)
  const zipNrfi      = (hh?.zipNrfi      ?? hh?.poissonNrfi ?? pred.homeScores0Prob) *
                       (ah?.zipNrfi      ?? ah?.poissonNrfi ?? pred.awayScores0Prob)
  const markovNrfi   = (hh?.markovNrfi   ?? hh?.poissonNrfi ?? pred.homeScores0Prob) *
                       (ah?.markovNrfi   ?? ah?.poissonNrfi ?? pred.awayScores0Prob)

  return {
    id:           game.id,
    date,
    homeTeam:     homeTeam?.name    ?? game.homeTeamId,
    awayTeam:     awayTeam?.name    ?? game.awayTeamId,
    homeTeamId:   game.homeTeamId,
    awayTeamId:   game.awayTeamId,
    homePitcher:  homePitcher?.name ?? "TBD",
    awayPitcher:  awayPitcher?.name ?? "TBD",
    venue:        game.venue,

    nrfiProbability: pred.nrfiProbability,
    yrfiProbability: pred.yrfiProbability,
    prediction:      pred.nrfiProbability >= 0.5 ? "NRFI" : "YRFI",
    confidence:      pred.confidence,
    confidenceScore: pred.confidenceScore,

    nrfiOdds: game.odds?.nrfiOdds,
    yrfiOdds: game.odds?.yrfiOdds,

    poissonNrfi:      Math.max(0.05, Math.min(0.95, poissonNrfi)),
    zipNrfi:          Math.max(0.05, Math.min(0.95, zipNrfi)),
    markovNrfi:       Math.max(0.05, Math.min(0.95, markovNrfi)),
    ensembleNrfi:     pred.nrfiProbability,
    modelConsensus:   bd?.modelConsensus ?? 0.5,

    homeZipOmega:        hh?.zipOmega         ?? 0,
    awayZipOmega:        ah?.zipOmega         ?? 0,
    homeBayesianWeight:  hh?.bayesianDataWeight ?? 0.5,
    awayBayesianWeight:  ah?.bayesianDataWeight ?? 0.5,

    modelInputs: {
      homePitcherNrfiRate:  pred.modelInputs.homePitcherNrfiRate,
      awayPitcherNrfiRate:  pred.modelInputs.awayPitcherNrfiRate,
      homeOffenseFactor:    pred.modelInputs.homeOffenseFactor,
      awayOffenseFactor:    pred.modelInputs.awayOffenseFactor,
      parkFactor:           pred.modelInputs.parkFactor,
      weatherMultiplier:    pred.modelInputs.weatherMultiplier,
      recentFormMultiplier: pred.modelInputs.recentFormMultiplier ?? 1.0,
      homePitcherStarts:    homePitcher?.firstInning.startCount ?? 0,
      awayPitcherStarts:    awayPitcher?.firstInning.startCount ?? 0,
      temperatureF:         game.weather.temperature,
      windSpeed:            game.weather.windSpeed,
      windDirection:        game.weather.windDirection,
      conditions:           game.weather.conditions,
    },

    status:   "pending",
    savedAt:  new Date().toISOString(),
  }
}

// ─── Upsert: merge new predictions without overwriting recorded results ────────

export function upsertPredictions(incoming: TrackedPrediction[]): TrackedPrediction[] {
  const existing = loadTrackedPredictions()
  const map = new Map(existing.map((p) => [p.id, p]))

  for (const pred of incoming) {
    const prev = map.get(pred.id)
    if (!prev) {
      map.set(pred.id, pred)
    } else if (prev.status === "pending") {
      // Refresh prediction data (model may have updated) but keep pending status
      map.set(pred.id, { ...pred, status: "pending" })
    }
    // If complete, leave it untouched
  }

  const sorted = [...map.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || b.savedAt.localeCompare(a.savedAt)
  )
  persist(sorted)
  return sorted
}

// ─── Record actual result ─────────────────────────────────────────────────────

export function recordResult(
  id: string,
  homeRuns: number,
  awayRuns: number
): TrackedPrediction[] {
  const predictions = loadTrackedPredictions()
  const updated = predictions.map((p) => {
    if (p.id !== id) return p

    const actualResult: "NRFI" | "YRFI" =
      homeRuns === 0 && awayRuns === 0 ? "NRFI" : "YRFI"
    const correct = actualResult === p.prediction

    // Flat-stake P/L on the recommended bet
    let profitLoss: number | undefined
    if (p.prediction === "NRFI" && p.nrfiOdds != null) {
      profitLoss = correct
        ? p.nrfiOdds > 0
          ? p.nrfiOdds / 100
          : 100 / Math.abs(p.nrfiOdds)
        : -1
    } else if (p.prediction === "YRFI" && p.yrfiOdds != null) {
      profitLoss = correct
        ? p.yrfiOdds > 0
          ? p.yrfiOdds / 100
          : 100 / Math.abs(p.yrfiOdds)
        : -1
    }

    return {
      ...p,
      status: "complete" as const,
      actualResult,
      correct,
      runsFirstInning: { home: homeRuns, away: awayRuns },
      profitLoss,
    }
  })

  persist(updated)
  return updated
}

// ─── Delete a prediction ──────────────────────────────────────────────────────

export function deletePrediction(id: string): TrackedPrediction[] {
  const updated = loadTrackedPredictions().filter((p) => p.id !== id)
  persist(updated)
  return updated
}

// ─── Accuracy metrics ─────────────────────────────────────────────────────────

function modelAccuracyForModel(
  complete: TrackedPrediction[],
  getProb: (p: TrackedPrediction) => number,
  modelName: PerModelAccuracy["model"]
): PerModelAccuracy {
  if (complete.length === 0) {
    return { model: modelName, totalPredictions: 0, correct: 0, accuracy: 0, mae: 0 }
  }

  let correct = 0
  let maeSum = 0

  for (const p of complete) {
    const modelNrfiProb = getProb(p)
    const modelPrediction: "NRFI" | "YRFI" = modelNrfiProb >= 0.5 ? "NRFI" : "YRFI"
    if (modelPrediction === p.actualResult) correct++
    // MAE against the actual binary outcome (1 = NRFI, 0 = YRFI)
    const actual = p.actualResult === "NRFI" ? 1 : 0
    maeSum += Math.abs(modelNrfiProb - actual)
  }

  return {
    model: modelName,
    totalPredictions: complete.length,
    correct,
    accuracy: correct / complete.length,
    mae: maeSum / complete.length,
  }
}

export function computeExtendedAccuracy(
  predictions: TrackedPrediction[]
): ExtendedModelAccuracy {
  const complete  = predictions.filter((p) => p.status === "complete")
  const pending   = predictions.filter((p) => p.status === "pending")

  const empty: ExtendedModelAccuracy = {
    totalPredictions: 0,
    correct: 0,
    accuracy: 0,
    nrfiAccuracy: 0,
    yrfiAccuracy: 0,
    highConfAccuracy: 0,
    medConfAccuracy: 0,
    roi: 0,
    calibrationData: [],
    monthlyData: [],
    perModelAccuracy: [],
    pendingCount: pending.length,
    totalTracked: predictions.length,
    highConfPnL: 0,
  }

  if (complete.length === 0) return empty

  // ── Basic accuracy ───────────────────────────────────────────────────────
  const nrfiPreds = complete.filter((p) => p.prediction === "NRFI")
  const yrfiPreds = complete.filter((p) => p.prediction === "YRFI")
  const highConf  = complete.filter((p) => p.confidence === "High")
  const medConf   = complete.filter((p) => p.confidence === "Medium")

  const totalCorrect   = complete.filter((p) => p.correct).length
  const nrfiCorrect    = nrfiPreds.filter((p) => p.correct).length
  const yrfiCorrect    = yrfiPreds.filter((p) => p.correct).length
  const highCorrect    = highConf.filter((p) => p.correct).length
  const medCorrect     = medConf.filter((p) => p.correct).length

  // ── ROI & P/L ────────────────────────────────────────────────────────────
  const hasPnL       = complete.filter((p) => p.profitLoss != null)
  const totalPnL     = hasPnL.reduce((s, p) => s + (p.profitLoss ?? 0), 0)
  const roi          = hasPnL.length > 0 ? totalPnL / hasPnL.length : 0

  const highConfBets = highConf.filter((p) => p.profitLoss != null)
  const highConfPnL  = highConfBets.reduce((s, p) => s + (p.profitLoss ?? 0), 0)

  // ── Monthly breakdown ────────────────────────────────────────────────────
  const monthMap = new Map<string, { correct: number; total: number; pnl: number }>()
  for (const p of complete) {
    const key = p.date.substring(0, 7)
    const m = monthMap.get(key) ?? { correct: 0, total: 0, pnl: 0 }
    m.total++
    if (p.correct) m.correct++
    m.pnl += p.profitLoss ?? 0
    monthMap.set(key, m)
  }
  const monthlyData = [...monthMap.entries()].sort().map(([key, d]) => ({
    month: new Date(key + "-01").toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    }),
    accuracy:    d.total > 0 ? d.correct / d.total : 0,
    predictions: d.total,
    roi:         d.total > 0 ? d.pnl / d.total : 0,
  }))

  // ── Calibration: 10% bins by ensemble NRFI probability ──────────────────
  const bins = new Map<number, { total: number; nrfiCount: number }>()
  for (const p of complete) {
    const bin = Math.round(p.nrfiProbability * 10) / 10
    const b = bins.get(bin) ?? { total: 0, nrfiCount: 0 }
    b.total++
    if (p.actualResult === "NRFI") b.nrfiCount++
    bins.set(bin, b)
  }
  const calibrationData = [...bins.entries()].sort().map(([bin, d]) => ({
    predictedBin: bin,
    actualRate:   d.total > 0 ? d.nrfiCount / d.total : 0,
    count:        d.total,
  }))

  // ── Per-model accuracy ───────────────────────────────────────────────────
  const perModelAccuracy: PerModelAccuracy[] = [
    modelAccuracyForModel(complete, (p) => p.poissonNrfi,  "Poisson"),
    modelAccuracyForModel(complete, (p) => p.zipNrfi,      "ZIP"),
    modelAccuracyForModel(complete, (p) => p.markovNrfi,   "Markov"),
    modelAccuracyForModel(complete, (p) => p.ensembleNrfi, "Ensemble"),
  ]

  return {
    totalPredictions: complete.length,
    correct:          totalCorrect,
    accuracy:         totalCorrect / complete.length,
    nrfiAccuracy:     nrfiPreds.length > 0 ? nrfiCorrect / nrfiPreds.length : 0,
    yrfiAccuracy:     yrfiPreds.length > 0 ? yrfiCorrect / yrfiPreds.length : 0,
    highConfAccuracy: highConf.length > 0 ? highCorrect / highConf.length : 0,
    medConfAccuracy:  medConf.length > 0 ? medCorrect / medConf.length : 0,
    roi,
    calibrationData,
    monthlyData,
    perModelAccuracy,
    pendingCount: pending.length,
    totalTracked: predictions.length,
    highConfPnL,
  }
}
