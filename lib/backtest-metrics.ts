/**
 * Walk-forward backtest metric computation.
 *
 * Uses the same Kelly-criterion formula as the TypeScript production engine
 * (lib/nrfi-engine.ts:kellyFraction) so that simulated ROI is directly
 * comparable to live betting behaviour.
 */

import { impliedProbability } from "./utils/odds"

// Matches KELLY_FRACTION and MIN_KELLY_EDGE in lib/nrfi-engine.ts
const KELLY_FRACTION = 0.25
const MIN_KELLY_EDGE = 0.03
const DEFAULT_AMERICAN_ODDS = -110

export interface BacktestRow {
  /** Model NRFI probability (post-calibration, post-anchor — the headline figure). */
  nrfiProbability: number
  /** Ground truth from GameResult.nrfi. */
  actualNrfi: boolean
  /** "High" | "Medium" | "Low" */
  confidence: string
  /** American odds for NRFI side if stored, otherwise undefined (falls back to -110). */
  nrfiOdds?: number | null
}

export interface CalibrationBin {
  bin: number   // midpoint of probability bucket (0.1, 0.2, … 0.9)
  actual: number // observed NRFI rate in that bucket
  count: number
}

export interface BacktestMetrics {
  n: number
  brierScore: number
  accuracy: number
  roiKelly: number
  roiFlat: number
  sharpe: number
  maxDrawdown: number
  calibration: CalibrationBin[]
  byConfidence: Record<string, { n: number; brier: number; accuracy: number; roiKelly: number }>
}

/**
 * Compute proper fractional Kelly bet size matching nrfi-engine.ts:kellyFraction().
 *
 * decimalOdds here is *profit per unit* (e.g. 100/110 ≈ 0.909 at -110),
 * not total return including stake — matches the engine convention.
 */
function kellyBetSize(modelProb: number, americanOdds: number): number {
  const profitPerUnit = americanOdds > 0
    ? americanOdds / 100
    : 100 / Math.abs(americanOdds)
  const q = 1 - modelProb
  const rawKelly = (profitPerUnit * modelProb - q) / profitPerUnit
  return Math.max(0, Math.min(0.25, rawKelly * KELLY_FRACTION))
}

function computeSliceMetrics(
  rows: BacktestRow[],
  ordered: boolean,
): Omit<BacktestMetrics, "byConfidence"> {
  if (rows.length === 0) {
    return { n: 0, brierScore: 0, accuracy: 0, roiKelly: 0, roiFlat: 0, sharpe: 0, maxDrawdown: 0, calibration: [] }
  }

  let brierSum = 0
  let correct = 0
  let totalWagered = 0
  let totalPLKelly = 0
  let totalPLFlat = 0
  let flatBets = 0
  const plHistory: number[] = []

  // Calibration: bucket by rounded probability (0.1 increments)
  const calBuckets = new Map<number, { total: number; nrfi: number }>()

  for (const row of rows) {
    const y = row.actualNrfi ? 1 : 0
    const p = row.nrfiProbability

    brierSum += (p - y) ** 2
    if ((p >= 0.5) === row.actualNrfi) correct++

    const bin = Math.round(p * 10) / 10
    const b = calBuckets.get(bin) ?? { total: 0, nrfi: 0 }
    b.total++
    if (row.actualNrfi) b.nrfi++
    calBuckets.set(bin, b)

    const americanOdds = row.nrfiOdds ?? DEFAULT_AMERICAN_ODDS
    const impliedProb = impliedProbability(americanOdds)
    const edge = p - impliedProb

    if (Math.abs(edge) < MIN_KELLY_EDGE) continue

    const profitPerUnit = Math.abs(americanOdds) > 0
      ? (americanOdds > 0 ? americanOdds / 100 : 100 / Math.abs(americanOdds))
      : 1

    // Bet direction: positive edge → bet on NRFI (y=1 is a win)
    const bettingOnNrfi = edge > 0
    const betModelProb = bettingOnNrfi ? p : 1 - p
    const betSize = kellyBetSize(betModelProb, Math.abs(americanOdds))

    const won = bettingOnNrfi === row.actualNrfi
    const pl = won ? betSize * profitPerUnit : -betSize

    totalWagered += betSize
    totalPLKelly += pl
    plHistory.push(pl)

    // Flat unit stake (-110 odds only, profit = 0.909 per unit)
    totalPLFlat += won ? profitPerUnit : -1
    flatBets++
  }

  const roiKelly = totalWagered > 0 ? totalPLKelly / totalWagered : 0
  const roiFlat = flatBets > 0 ? totalPLFlat / flatBets : 0

  // Sharpe: mean(pl) / std(pl) over individual bet outcomes
  let sharpe = 0
  if (plHistory.length > 1) {
    const mean = plHistory.reduce((s, v) => s + v, 0) / plHistory.length
    const variance = plHistory.reduce((s, v) => s + (v - mean) ** 2, 0) / plHistory.length
    if (variance > 0) sharpe = mean / Math.sqrt(variance)
  }

  // Max drawdown requires ordered rows
  let maxDrawdown = 0
  if (ordered && plHistory.length > 0) {
    let peak = 0, cumPL = 0
    for (const pl of plHistory) {
      cumPL += pl
      if (cumPL > peak) peak = cumPL
      const dd = peak - cumPL
      if (dd > maxDrawdown) maxDrawdown = dd
    }
  }

  const calibration: CalibrationBin[] = [...calBuckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bin, d]) => ({ bin, actual: d.total > 0 ? d.nrfi / d.total : 0, count: d.total }))

  return {
    n: rows.length,
    brierScore: brierSum / rows.length,
    accuracy: correct / rows.length,
    roiKelly,
    roiFlat,
    sharpe,
    maxDrawdown,
    calibration,
  }
}

export function computeBacktestMetrics(
  rows: BacktestRow[],
  /** Pass true when rows are already sorted chronologically (enables drawdown). */
  ordered = false,
): BacktestMetrics {
  if (rows.length === 0) {
    return {
      n: 0, brierScore: 0, accuracy: 0, roiKelly: 0, roiFlat: 0,
      sharpe: 0, maxDrawdown: 0, calibration: [], byConfidence: {},
    }
  }

  const base = computeSliceMetrics(rows, ordered)

  const confKeys = [...new Set(rows.map((r) => r.confidence))]
  const byConfidence: BacktestMetrics["byConfidence"] = {}
  for (const conf of confKeys) {
    const slice = rows.filter((r) => r.confidence === conf)
    const sub = computeSliceMetrics(slice, false)
    byConfidence[conf] = { n: sub.n, brier: sub.brierScore, accuracy: sub.accuracy, roiKelly: sub.roiKelly }
  }

  return { ...base, byConfidence }
}
