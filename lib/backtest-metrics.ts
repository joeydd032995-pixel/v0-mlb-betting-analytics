/**
 * Walk-forward backtest metric computation.
 *
 * Uses the same Kelly-criterion parameters as the TypeScript production engine
 * (imported from lib/config.ts — single source of truth) so that simulated ROI
 * is directly comparable to live betting behaviour.
 */

import { impliedProbability } from "./utils/odds"
import { CONFIG } from "./config"

const KELLY_FRACTION = CONFIG.kelly.scaling   // 0.25 (quarter Kelly)
const MIN_KELLY_EDGE = CONFIG.kelly.minEdge   // 0.03
const MAX_KELLY_BET  = CONFIG.kelly.maxBet    // 0.05 (5% of bankroll cap)
const DEFAULT_AMERICAN_ODDS = -110

export interface BacktestRow {
  /** Model NRFI probability (post-calibration, post-anchor — the headline figure). */
  nrfiProbability: number
  /** Ground truth from GameResult.nrfi. */
  actualNrfi: boolean
  /** "High" | "Medium" | "Low" */
  confidence: string
  /** American odds for the NRFI side if stored, otherwise undefined (falls back to -110). */
  nrfiOdds?: number | null
  /** American odds for the YRFI side if stored, otherwise undefined (falls back to -110). */
  yrfiOdds?: number | null
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

/** Net profit per unit staked for American odds (e.g. 100/110 ≈ 0.909 at -110). */
function profitPerUnit(americanOdds: number): number {
  return americanOdds > 0 ? americanOdds / 100 : 100 / Math.abs(americanOdds)
}

/**
 * Fractional Kelly bet size matching nrfi-engine.ts:kellyFraction().
 *
 * `americanOdds` must keep its sign — passing Math.abs(odds) converts every
 * favourite line into an underdog line and inflates b (and the stake) by
 * ~68% at -110.  That exact bug invalidated all pre-2026-06 BacktestRun rows
 * (AUDIT_REPORT.md P0-3).
 */
function kellyBetSize(modelProb: number, americanOdds: number): number {
  const b = profitPerUnit(americanOdds)
  const q = 1 - modelProb
  const rawKelly = (b * modelProb - q) / b
  return Math.max(0, Math.min(MAX_KELLY_BET, rawKelly * KELLY_FRACTION))
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

    // Each side is evaluated against ITS OWN line.  The old code measured the
    // YRFI edge as the complement of the vigged NRFI implied probability and
    // paid YRFI wins at the NRFI line's profit — wrong whenever the market is
    // asymmetric (AUDIT_REPORT.md P1-3).
    const nrfiOdds = row.nrfiOdds ?? DEFAULT_AMERICAN_ODDS
    const yrfiOdds = row.yrfiOdds ?? DEFAULT_AMERICAN_ODDS
    const nrfiEdge = p - impliedProbability(nrfiOdds)
    const yrfiEdge = (1 - p) - impliedProbability(yrfiOdds)

    let bettingOnNrfi: boolean
    if (nrfiEdge >= MIN_KELLY_EDGE && nrfiEdge >= yrfiEdge) bettingOnNrfi = true
    else if (yrfiEdge >= MIN_KELLY_EDGE) bettingOnNrfi = false
    else continue  // no side clears the minimum edge

    const betOdds      = bettingOnNrfi ? nrfiOdds : yrfiOdds
    const betModelProb = bettingOnNrfi ? p : 1 - p
    const betProfit    = profitPerUnit(betOdds)
    const betSize      = kellyBetSize(betModelProb, betOdds)
    if (betSize <= 0) continue

    const won = bettingOnNrfi === row.actualNrfi
    const pl = won ? betSize * betProfit : -betSize

    totalWagered += betSize
    totalPLKelly += pl
    plHistory.push(pl)

    // Flat unit stake at the chosen side's own odds
    totalPLFlat += won ? betProfit : -1
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
