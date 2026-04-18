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
  HalfInningModelBreakdown,
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
  /** Four-model ensemble P(NRFI): Poisson 20%, ZIP 30%, Markov 30%, MAPRE 20% */
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
  nrfiCorrect: number
  nrfiTotal: number
  yrfiCorrect: number
  yrfiTotal: number
}

// ─── Storage key ──────────────────────────────────────────────────────────────

const STORE_KEY = "nrfi_predictions_v1"

// ─── Schema validation ────────────────────────────────────────────────────────

/**
 * Runtime guard: verifies that a parsed JSON object has the minimum required
 * fields of TrackedPrediction. Filters out entries written by older versions
 * of the app that may be missing required numeric fields.
 */
function isValidTrackedPrediction(p: unknown): p is TrackedPrediction {
  if (typeof p !== "object" || p === null) return false
  const pred = p as Record<string, unknown>
  return (
    typeof pred.id === "string" &&
    typeof pred.date === "string" &&
    typeof pred.nrfiProbability === "number" &&
    typeof pred.yrfiProbability === "number" &&
    typeof pred.status === "string" &&
    (pred.status === "pending" || pred.status === "complete")
  )
}

// ─── CRUD helpers ─────────────────────────────────────────────────────────────

export function loadTrackedPredictions(): TrackedPrediction[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidTrackedPrediction)
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

// ─── Per-model half-inning probability helper ─────────────────────────────────

/**
 * Extracts a specific model's NRFI probability from a half-inning breakdown,
 * with an explicit fallback chain so it is always clear which value is used.
 *
 *  1. The model's own value (e.g. zipNrfi)
 *  2. Poisson value for that half (consistent baseline)
 *  3. The pre-computed half-inning Poisson fallback from the top-level prediction
 */
function halfNrfiProb(
  half: HalfInningModelBreakdown | undefined,
  modelKey: "zipNrfi" | "markovNrfi",
  poissonFallback: number
): number {
  if (half === undefined) return poissonFallback
  const modelValue = half[modelKey]
  if (modelValue !== undefined) return modelValue
  return half.poissonNrfi ?? poissonFallback
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
  const homePoissonFallback = hh?.poissonNrfi ?? pred.homeScores0Prob
  const awayPoissonFallback = ah?.poissonNrfi ?? pred.awayScores0Prob

  const poissonNrfi = homePoissonFallback * awayPoissonFallback
  const zipNrfi     = halfNrfiProb(hh, "zipNrfi",    pred.homeScores0Prob) *
                      halfNrfiProb(ah, "zipNrfi",    pred.awayScores0Prob)
  const markovNrfi  = halfNrfiProb(hh, "markovNrfi", pred.homeScores0Prob) *
                      halfNrfiProb(ah, "markovNrfi", pred.awayScores0Prob)

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
    prediction:      pred.nrfiProbability >= 0.34 ? "NRFI" : "YRFI",
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
      // and the original save timestamp so the history sort order is stable.
      map.set(pred.id, { ...pred, status: "pending", savedAt: prev.savedAt })
    }
    // If complete, leave it untouched
  }

  const sorted = [...map.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || b.savedAt.localeCompare(a.savedAt)
  )
  persist(sorted)
  return sorted
}

// ─── Profit / loss helper ─────────────────────────────────────────────────────

function computeProfitLoss(p: TrackedPrediction, correct: boolean): number | undefined {
  const odds = p.prediction === "NRFI" ? p.nrfiOdds : p.yrfiOdds
  if (odds == null) return undefined
  if (!correct) return -1
  return odds > 0 ? odds / 100 : 100 / Math.abs(odds)
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

    return {
      ...p,
      status: "complete" as const,
      actualResult,
      correct,
      runsFirstInning: { home: homeRuns, away: awayRuns },
      profitLoss: computeProfitLoss(p, correct),
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

// ─── Auto-record from API results ────────────────────────────────────────────

/**
 * Given a map of { gamePk → { homeRuns, awayRuns } } from /api/results,
 * automatically records results for any pending predictions that match.
 * Already-completed predictions are left untouched.
 *
 * Returns the updated predictions array and a count of newly recorded results.
 */
export function autoRecordResults(
  apiResults: Record<
    string,
    { homeRuns: number; awayRuns: number; status?: string; inProgress?: boolean }
  >
): { predictions: TrackedPrediction[]; recorded: number } {
  const stored = loadTrackedPredictions()
  let recorded = 0

  const updated = stored.map((p) => {
    // Only update pending predictions that have a matching final result
    if (p.status !== "pending") return p
    const result = apiResults[p.id]
    if (!result) return p
    // Skip games still in progress — wait for final
    if (result.inProgress) return p

    const { homeRuns, awayRuns } = result
    const actualResult: "NRFI" | "YRFI" =
      homeRuns === 0 && awayRuns === 0 ? "NRFI" : "YRFI"
    const correct = actualResult === p.prediction

    recorded++
    return {
      ...p,
      status: "complete" as const,
      actualResult,
      correct,
      runsFirstInning: { home: homeRuns, away: awayRuns },
      profitLoss: computeProfitLoss(p, correct),
    }
  })

  if (recorded > 0) persist(updated)
  return { predictions: updated, recorded }
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
    nrfiCorrect: 0,
    nrfiTotal: 0,
    yrfiCorrect: 0,
    yrfiTotal: 0,
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
    month: new Date(key + "-01T12:00:00Z").toLocaleDateString("en-US", {
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
    nrfiCorrect,
    nrfiTotal:   nrfiPreds.length,
    yrfiCorrect,
    yrfiTotal:   yrfiPreds.length,
  }
}
