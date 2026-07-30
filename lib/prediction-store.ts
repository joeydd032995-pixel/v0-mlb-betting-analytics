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
import { resolveVenueForTeam } from "./constants/mlb-stadiums"

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
  /** MAPRE game-level P(NRFI) — optional; absent on predictions saved before this field existed */
  mapreNrfi?: number
  /** Final headline ensemble P(NRFI) (base-4 blend: Poisson 12%, ZIP 30%, Markov 48%, MAPRE 10%) */
  ensembleNrfi: number
  /** 0–1 model agreement score */
  modelConsensus: number

  // ZIP diagnostics (home pitcher vs away lineup)
  homeZipOmega: number   // "lockdown" probability for home pitcher
  awayZipOmega: number   // "lockdown" probability for away pitcher
  // Bayesian data weights (how much of the rate comes from season data vs league avg)
  homeBayesianWeight: number
  awayBayesianWeight: number
  // Meta-model game-level P(NRFI) — optional; absent on predictions saved before 7-model upgrade
  logisticMetaNrfi?: number
  nnInteractionNrfi?: number
  hierarchicalBayesNrfi?: number

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
  /**
   * True when this row came from a prior-season backfill rather than a live
   * slate (`ModelPrediction.backtested`).  Backfilled rows are scored from
   * point-in-time stats but synthetic weather and no odds, so they are
   * disclosed separately in accuracy surfaces.  Absent on localStorage rows.
   */
  backtested?: boolean

  // ── Result (filled in when complete) ────────────────────────────────────
  actualResult?: "NRFI" | "YRFI"
  correct?: boolean
  runsFirstInning?: { home: number; away: number }
  profitLoss?: number  // flat-stake units on the recommended bet
}

// ─── PerModelAccuracy ─────────────────────────────────────────────────────────

export interface PerModelAccuracy {
  model: "Poisson" | "ZIP" | "Markov" | "MAPRE" | "Ensemble" | "Logistic Stack" | "NN Interaction" | "Hierarchical Bayes"
  totalPredictions: number
  correct: number
  accuracy: number
  /** Calibration: mean absolute error between model probability and actual rate */
  mae: number
}

// ─── DailyStats ───────────────────────────────────────────────────────────────

export interface DailyStats {
  date: string
  nrfiWins: number
  nrfiLosses: number
  yrfiWins: number
  yrfiLosses: number
  combinedWins: number
  combinedLosses: number
}

// ─── PitcherAccuracyRow / ParkAccuracyRow ──────────────────────────────────────

export interface PitcherAccuracyRow {
  pitcher: string
  starts: number
  correct: number
  accuracy: number
}

export interface ParkAccuracyRow {
  venue: string
  total: number
  correct: number
  accuracy: number
}

// ─── ExtendedModelAccuracy ────────────────────────────────────────────────────

export interface ExtendedModelAccuracy extends ModelAccuracy {
  perModelAccuracy: PerModelAccuracy[]
  pendingCount: number
  totalTracked: number
  /** P/L in flat-stake units on high-confidence bets only */
  highConfPnL: number
  /**
   * Settled predictions that carry an odds snapshot, i.e. the ones that can
   * produce a P/L figure.  This — not `totalPredictions` — is the denominator
   * of `roi`, and it is usually much smaller: historical-sync backfills store
   * no odds at all.  Surfaced so the UI can state the real sample size next to
   * any money number.
   */
  pricedCount: number
  /** Same, restricted to High-confidence rows — the denominator of `highConfPnL`. */
  highConfPricedCount: number
  /**
   * Settled predictions generated by a prior-season backtest rather than a
   * live slate.  These use synthetic month-average weather and no odds, which
   * pulls accuracy toward the raw NRFI base rate, so the UI discloses the mix.
   */
  backtestedCount: number
  /** Earliest and latest ET game date present in the scored population. */
  dateSpan: { from: string; to: string } | null
  nrfiCorrect: number
  nrfiTotal: number
  yrfiCorrect: number
  yrfiTotal: number
  highConfCorrect: number
  highConfTotal: number
  medConfCorrect: number
  medConfTotal: number
  lowConfCorrect: number
  lowConfTotal: number
  nrfiBestModel: string
  nrfiBestModelAccuracy: number
  yrfiBestModel: string
  yrfiBestModelAccuracy: number
  bestOverallModel: string
  bestOverallAccuracy: number
  dailyStats: DailyStats[]
  byPitcher: PitcherAccuracyRow[]
  byPark: ParkAccuracyRow[]
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

/**
 * Threshold used to classify a prediction as NRFI vs YRFI.
 *
 * Deliberately NOT the same as `NRFI_CALL_THRESHOLD` (0.52) in lib/nrfi-engine.ts.
 * The two answer different questions and are both correct:
 *
 *   0.50 (here)  — which side the model leaned, stored as `prediction` and used
 *                  as the ground-truth comparison for `correct`. Every game gets
 *                  a label, because accuracy needs a call on all of them.
 *   0.52 (engine) — whether the lean is strong enough to surface as a
 *                  recommendation. Games between the two fall into TOSS_UP.
 *
 * So a game at nrfiProbability 0.51 is stored as `prediction: "NRFI"` while its
 * displayed recommendation is TOSS_UP. That is intended, not a mismatch — but it
 * does mean per-model accuracy is scored at a slightly looser bar than the one
 * the recommendation ladder uses. Changing either value re-labels historical
 * rows and moves every accuracy figure on the site.
 */
export const NRFI_PREDICTION_THRESHOLD = 0.5

/**
 * One-time migration: reclassifies any stored prediction whose `prediction`
 * field was written with the old threshold (0.34) instead of the current 0.5.
 * A record needs migration when nrfiProbability is in [0.34, 0.5) but is
 * stored as "NRFI", or nrfiProbability >= 0.5 but stored as "YRFI".
 * Returns the array unchanged (by reference) if no records need updating.
 */
function migrateThreshold(predictions: TrackedPrediction[]): TrackedPrediction[] {
  let changed = false
  const migrated = predictions.map((p) => {
    const correct: "NRFI" | "YRFI" = p.nrfiProbability >= NRFI_PREDICTION_THRESHOLD ? "NRFI" : "YRFI"
    if (p.prediction === correct) return p
    changed = true
    return { ...p, prediction: correct }
  })
  return changed ? migrated : predictions
}

export function loadTrackedPredictions(): TrackedPrediction[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const valid = parsed.filter(isValidTrackedPrediction)
    const migrated = migrateThreshold(valid)
    // Persist only when migration actually changed something
    if (migrated !== valid) persist(migrated)
    return migrated
  } catch (err) {
    console.error("[prediction-store] parse error:", err)
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
    prediction:      pred.nrfiProbability >= NRFI_PREDICTION_THRESHOLD ? "NRFI" : "YRFI",
    confidence:      pred.confidence,
    confidenceScore: pred.confidenceScore,

    nrfiOdds: game.odds?.nrfiOdds,
    yrfiOdds: game.odds?.yrfiOdds,

    poissonNrfi:      Math.max(0.05, Math.min(0.95, poissonNrfi)),
    zipNrfi:          Math.max(0.05, Math.min(0.95, zipNrfi)),
    markovNrfi:       Math.max(0.05, Math.min(0.95, markovNrfi)),
    mapreNrfi:        bd?.mapreNrfi != null ? Math.max(0.05, Math.min(0.95, bd.mapreNrfi)) : undefined,
    ensembleNrfi:     pred.nrfiProbability,
    modelConsensus:   bd?.modelConsensus ?? 0.5,

    homeZipOmega:        hh?.zipOmega         ?? 0,
    awayZipOmega:        ah?.zipOmega         ?? 0,
    homeBayesianWeight:  hh?.bayesianDataWeight ?? 0.5,
    awayBayesianWeight:  ah?.bayesianDataWeight ?? 0.5,

    // Meta-model game-level values (product or average depending on model type)
    logisticMetaNrfi: hh?.logisticMetaNrfi != null && ah?.logisticMetaNrfi != null
      ? Math.max(0.05, Math.min(0.95, hh.logisticMetaNrfi * ah.logisticMetaNrfi))
      : undefined,
    nnInteractionNrfi: hh?.nnInteractionNrfi != null && ah?.nnInteractionNrfi != null
      ? Math.max(0.05, Math.min(0.95, hh.nnInteractionNrfi * ah.nnInteractionNrfi))
      : undefined,
    // Product matches how blend7Models combines hierarchicalBayes (it is NOT in GAME_LEVEL_KEYS).
    hierarchicalBayesNrfi: hh?.hierarchicalBayesNrfi != null && ah?.hierarchicalBayesNrfi != null
      ? Math.max(0.05, Math.min(0.95, hh.hierarchicalBayesNrfi * ah.hierarchicalBayesNrfi))
      : undefined,

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

// ─── Merge DB + localStorage ──────────────────────────────────────────────────

/**
 * Combine server-persisted predictions with the browser's local copy.
 *
 * DB rows are the baseline so a signed-in user sees their history on any
 * device.  The local copy then wins on conflict, because it is the one the
 * user has been editing — except where the DB has already settled a row that
 * is still pending locally, in which case the settled result is promoted.
 *
 * Result is sorted newest game date first, matching the store's own ordering.
 */
export function mergeTrackedPredictions(
  dbRows: TrackedPrediction[],
  localRows: TrackedPrediction[],
  /**
   * Ids the user deleted this session.  Deletion has to be expressed
   * explicitly: absence from `localRows` cannot mean "removed", because a row
   * present only in the DB is the normal cross-device case.  Without this the
   * DB baseline would silently resurrect anything just deleted.
   */
  deletedIds?: ReadonlySet<string>
): TrackedPrediction[] {
  const dbById = new Map(
    dbRows.filter((p) => !deletedIds?.has(p.id)).map((p) => [p.id, p])
  )
  const merged = new Map<string, TrackedPrediction>(dbById)

  for (const localRow of localRows) {
    if (deletedIds?.has(localRow.id)) continue
    const dbRow = dbById.get(localRow.id)
    if (dbRow && dbRow.status === "complete" && localRow.status === "pending") {
      merged.set(localRow.id, dbRow)
    } else if (dbRow) {
      // Keep the local row, but carry over provenance and odds that only the
      // DB knows about — otherwise a locally-tracked game silently loses its
      // backtested flag and its P/L when the two copies are combined.
      merged.set(localRow.id, {
        ...localRow,
        backtested: localRow.backtested ?? dbRow.backtested,
        nrfiOdds:   localRow.nrfiOdds   ?? dbRow.nrfiOdds,
        yrfiOdds:   localRow.yrfiOdds   ?? dbRow.yrfiOdds,
        profitLoss: localRow.profitLoss ?? dbRow.profitLoss,
      })
    } else {
      merged.set(localRow.id, localRow)
    }
  }

  return [...merged.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || b.savedAt.localeCompare(a.savedAt)
  )
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

export function computeProfitLoss(p: TrackedPrediction, correct: boolean): number | undefined {
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
    pricedCount: 0,
    highConfPricedCount: 0,
    backtestedCount: 0,
    dateSpan: null,
    nrfiCorrect: 0,
    nrfiTotal: 0,
    yrfiCorrect: 0,
    yrfiTotal: 0,
    highConfCorrect: 0,
    highConfTotal: 0,
    medConfCorrect: 0,
    medConfTotal: 0,
    lowConfCorrect: 0,
    lowConfTotal: 0,
    nrfiBestModel: "Ensemble",
    nrfiBestModelAccuracy: 0,
    yrfiBestModel: "Ensemble",
    yrfiBestModelAccuracy: 0,
    bestOverallModel: "Ensemble",
    bestOverallAccuracy: 0,
    dailyStats: [],
    byPitcher: [],
    byPark: [],
  }

  if (complete.length === 0) return empty

  // ── Basic accuracy ───────────────────────────────────────────────────────
  const nrfiPreds = complete.filter((p) => p.prediction === "NRFI")
  const yrfiPreds = complete.filter((p) => p.prediction === "YRFI")
  const highConf  = complete.filter((p) => p.confidence === "High")
  const medConf   = complete.filter((p) => p.confidence === "Medium")
  const lowConf   = complete.filter((p) => p.confidence === "Low")

  const totalCorrect   = complete.filter((p) => p.correct).length
  const nrfiCorrect    = nrfiPreds.filter((p) => p.correct).length
  const yrfiCorrect    = yrfiPreds.filter((p) => p.correct).length
  const highCorrect    = highConf.filter((p) => p.correct).length
  const medCorrect     = medConf.filter((p) => p.correct).length
  const lowCorrect     = lowConf.filter((p) => p.correct).length

  // ── Provenance of the scored population ──────────────────────────────────
  const backtestedCount = complete.filter((p) => p.backtested).length
  const sortedDates     = complete.map((p) => p.date).sort()
  const dateSpan        = { from: sortedDates[0], to: sortedDates[sortedDates.length - 1] }

  // ── ROI & P/L ────────────────────────────────────────────────────────────
  // Only rows carrying an odds snapshot can produce a P/L, so they — not all
  // settled rows — are the denominator.  Backfilled rows never have odds.
  const hasPnL       = complete.filter((p) => p.profitLoss != null)
  const totalPnL     = hasPnL.reduce((s, p) => s + (p.profitLoss ?? 0), 0)
  const roi          = hasPnL.length > 0 ? totalPnL / hasPnL.length : 0

  const highConfBets = highConf.filter((p) => p.profitLoss != null)
  const highConfPnL  = highConfBets.reduce((s, p) => s + (p.profitLoss ?? 0), 0)

  // ── Monthly breakdown ────────────────────────────────────────────────────
  // `priced` is tracked separately from `total` so monthly ROI uses the same
  // denominator as the headline `roi` above.  Dividing P/L by *all* settled
  // predictions would dilute the figure toward zero in exact proportion to how
  // many rows lack odds, which is most of them after a historical backfill.
  const monthMap = new Map<string, { correct: number; total: number; priced: number; pnl: number }>()
  for (const p of complete) {
    const key = p.date.substring(0, 7)
    const m = monthMap.get(key) ?? { correct: 0, total: 0, priced: 0, pnl: 0 }
    m.total++
    if (p.correct) m.correct++
    if (p.profitLoss != null) {
      m.priced++
      m.pnl += p.profitLoss
    }
    monthMap.set(key, m)
  }
  const monthlyData = [...monthMap.entries()].sort().map(([key, d]) => ({
    month: new Date(key + "-01T12:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }),
    accuracy:    d.total > 0 ? d.correct / d.total : 0,
    predictions: d.total,
    priced:      d.priced,
    roi:         d.priced > 0 ? d.pnl / d.priced : 0,
  }))

  // ── Calibration: decile bins by headline NRFI probability ────────────────
  // Bins on `nrfiProbability` — the post-blend figure actually shown to the
  // user — not the pre-blend `ensembleNrfi` column, since calibration asks
  // whether the displayed probability matched reality.
  // `floor` gives ten equal-width buckets labelled by their lower edge.
  // `round` would have produced eleven, with the 0.0 and 1.0 buckets only half
  // as wide as the rest and therefore not comparable to them.
  const bins = new Map<number, { total: number; nrfiCount: number }>()
  for (const p of complete) {
    const bin = Math.min(0.9, Math.floor(p.nrfiProbability * 10) / 10)
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
  // Each meta-model is gated on its own field so a missing value in one model
  // never causes a non-null assertion failure in another.
  function buildCandidatesForSubset(subset: TrackedPrediction[]): PerModelAccuracy[] {
    const withMapre     = subset.filter((p): p is TrackedPrediction & { mapreNrfi: number }             => p.mapreNrfi             != null)
    const withLogistic = subset.filter((p): p is TrackedPrediction & { logisticMetaNrfi: number }      => p.logisticMetaNrfi      != null)
    const withNn       = subset.filter((p): p is TrackedPrediction & { nnInteractionNrfi: number }     => p.nnInteractionNrfi     != null)
    const withHier     = subset.filter((p): p is TrackedPrediction & { hierarchicalBayesNrfi: number } => p.hierarchicalBayesNrfi != null)
    return [
      modelAccuracyForModel(subset, (p) => p.poissonNrfi,  "Poisson"),
      modelAccuracyForModel(subset, (p) => p.zipNrfi,      "ZIP"),
      modelAccuracyForModel(subset, (p) => p.markovNrfi,   "Markov"),
      modelAccuracyForModel(subset, (p) => p.ensembleNrfi, "Ensemble"),
      ...(withMapre.length    > 0 ? [modelAccuracyForModel(withMapre,    (p) => p.mapreNrfi!,             "MAPRE"             )] : []),
      ...(withLogistic.length > 0 ? [modelAccuracyForModel(withLogistic, (p) => p.logisticMetaNrfi!,      "Logistic Stack"    )] : []),
      ...(withNn.length       > 0 ? [modelAccuracyForModel(withNn,       (p) => p.nnInteractionNrfi!,     "NN Interaction"    )] : []),
      ...(withHier.length     > 0 ? [modelAccuracyForModel(withHier,     (p) => p.hierarchicalBayesNrfi!, "Hierarchical Bayes")] : []),
    ]
  }

  const perModelAccuracy = buildCandidatesForSubset(complete)

  // ── Best overall model ───────────────────────────────────────────────────
  const bestOverall = perModelAccuracy.length > 0
    ? perModelAccuracy.reduce((best, m) => m.accuracy > best.accuracy ? m : best)
    : { model: "Ensemble" as const, accuracy: 0 }

  // ── Best model per prediction type (on actual-result subsets) ────────────
  function bestModelOn(subset: TrackedPrediction[]): { model: string; accuracy: number } {
    if (subset.length === 0) return { model: "Ensemble", accuracy: 0 }
    const candidates = buildCandidatesForSubset(subset)
    return candidates.reduce((best, m) => m.accuracy > best.accuracy ? m : best)
  }

  const nrfiActualGames = complete.filter((p) => p.actualResult === "NRFI")
  const yrfiActualGames = complete.filter((p) => p.actualResult === "YRFI")
  const nrfiBest = bestModelOn(nrfiActualGames)
  const yrfiBest = bestModelOn(yrfiActualGames)

  // ── Daily W/L stats ──────────────────────────────────────────────────────
  const dailyMap = new Map<string, DailyStats>()
  for (const p of complete) {
    const s = dailyMap.get(p.date) ?? {
      date: p.date,
      nrfiWins: 0, nrfiLosses: 0,
      yrfiWins: 0, yrfiLosses: 0,
      combinedWins: 0, combinedLosses: 0,
    }
    if (p.prediction === "NRFI") {
      if (p.correct) s.nrfiWins++; else s.nrfiLosses++
    } else {
      if (p.correct) s.yrfiWins++; else s.yrfiLosses++
    }
    if (p.correct) s.combinedWins++; else s.combinedLosses++
    dailyMap.set(p.date, s)
  }
  const dailyStats = [...dailyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, s]) => s)

  // ── Per-pitcher breakdown ────────────────────────────────────────────────
  // Each settled prediction is really a joint outcome of both starters, so it
  // contributes to both the home and away starter's bucket.
  const pitcherMap = new Map<string, { correct: number; total: number }>()
  for (const p of complete) {
    for (const name of [p.homePitcher, p.awayPitcher]) {
      if (!name || name === "TBD") continue
      const s = pitcherMap.get(name) ?? { correct: 0, total: 0 }
      s.total++
      if (p.correct) s.correct++
      pitcherMap.set(name, s)
    }
  }
  const byPitcher = [...pitcherMap.entries()]
    .map(([pitcher, s]) => ({ pitcher, starts: s.total, correct: s.correct, accuracy: s.correct / s.total }))
    .sort((a, b) => b.starts - a.starts)

  // ── Per-park breakdown ───────────────────────────────────────────────────
  // venue is rarely persisted on DB-backed rows; fall back to deriving it
  // from the home team when absent (see resolveVenueForTeam).
  const parkMap = new Map<string, { correct: number; total: number }>()
  for (const p of complete) {
    const venue = p.venue || resolveVenueForTeam(p.homeTeam)
    if (!venue) continue
    const s = parkMap.get(venue) ?? { correct: 0, total: 0 }
    s.total++
    if (p.correct) s.correct++
    parkMap.set(venue, s)
  }
  const byPark = [...parkMap.entries()]
    .map(([venue, s]) => ({ venue, total: s.total, correct: s.correct, accuracy: s.correct / s.total }))
    .sort((a, b) => b.total - a.total)

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
    pricedCount:         hasPnL.length,
    highConfPricedCount: highConfBets.length,
    backtestedCount,
    dateSpan,
    nrfiCorrect,
    nrfiTotal:    nrfiPreds.length,
    yrfiCorrect,
    yrfiTotal:    yrfiPreds.length,
    highConfCorrect: highCorrect,
    highConfTotal:   highConf.length,
    medConfCorrect:  medCorrect,
    medConfTotal:    medConf.length,
    lowConfCorrect:  lowCorrect,
    lowConfTotal:    lowConf.length,
    nrfiBestModel:         nrfiBest.model,
    nrfiBestModelAccuracy: nrfiBest.accuracy,
    yrfiBestModel:         yrfiBest.model,
    yrfiBestModelAccuracy: yrfiBest.accuracy,
    bestOverallModel:      bestOverall.model,
    bestOverallAccuracy:   bestOverall.accuracy,
    dailyStats,
    byPitcher,
    byPark,
  }
}
