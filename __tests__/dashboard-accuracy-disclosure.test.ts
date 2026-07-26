import { describe, it, expect } from "vitest"
import {
  todayET,
  etDaysAgo,
  periodRange,
  filterByPeriod,
  formatETDate,
} from "@/lib/utils/date-et"
import {
  computeExtendedAccuracy,
  mergeTrackedPredictions,
  type TrackedPrediction,
} from "@/lib/prediction-store"
import { summariseBetRecord } from "@/lib/bet-record"
import { CALIBRATION_IS_IDENTITY, CALIBRATION_KNOT_COUNT } from "@/lib/calibration"
import { CONFIDENCE_THRESHOLDS } from "@/lib/nrfi-engine"

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makePrediction(overrides: Partial<TrackedPrediction> = {}): TrackedPrediction {
  return {
    id: "1", date: "2026-07-01",
    homeTeam: "NYY", awayTeam: "BOS", homeTeamId: "147", awayTeamId: "111",
    homePitcher: "A", awayPitcher: "B", venue: "Yankee Stadium",
    nrfiProbability: 0.6, yrfiProbability: 0.4,
    prediction: "NRFI", confidence: "High", confidenceScore: 70,
    poissonNrfi: 0.6, zipNrfi: 0.6, markovNrfi: 0.6, ensembleNrfi: 0.6,
    modelConsensus: 0.9,
    homeZipOmega: 0, awayZipOmega: 0,
    homeBayesianWeight: 0, awayBayesianWeight: 0,
    modelInputs: {
      homePitcherNrfiRate: 0.72, awayPitcherNrfiRate: 0.68,
      homeOffenseFactor: 1, awayOffenseFactor: 1,
      parkFactor: 1, weatherMultiplier: 1, recentFormMultiplier: 1,
      homePitcherStarts: 20, awayPitcherStarts: 20,
      temperatureF: 72, windSpeed: 5, windDirection: "out", conditions: "clear",
    },
    status: "complete", savedAt: "2026-07-01T12:00:00.000Z",
    actualResult: "NRFI", correct: true,
    ...overrides,
  }
}

// ─── ET period filtering ─────────────────────────────────────────────────────
//
// The previous implementation compared `new Date("YYYY-MM-DD")` (UTC midnight)
// against a local wall-clock instant, so the window boundary moved with the
// viewer's timezone. These assertions must hold under any TZ.

describe("filterByPeriod — ET window", () => {
  const NOON_UTC = new Date("2026-07-26T16:00:00Z") // 12:00 ET

  it("resolves today in ET, not UTC", () => {
    // 01:30 UTC on the 27th is still the 26th in ET (UTC−4 in July).
    expect(todayET(new Date("2026-07-27T01:30:00Z"))).toBe("2026-07-26")
  })

  it("includes a row dated exactly N days back", () => {
    const range = periodRange(30, NOON_UTC)
    expect(range).not.toBeNull()
    const boundary = etDaysAgo(30, NOON_UTC)
    const rows = [{ date: boundary }]
    expect(filterByPeriod(rows, range)).toHaveLength(1)
  })

  it("excludes a row one day older than the window", () => {
    const range = periodRange(30, NOON_UTC)
    const rows = [{ date: etDaysAgo(31, NOON_UTC) }]
    expect(filterByPeriod(rows, range)).toHaveLength(0)
  })

  it("includes today", () => {
    const range = periodRange(30, NOON_UTC)
    expect(filterByPeriod([{ date: todayET(NOON_UTC) }], range)).toHaveLength(1)
  })

  it("treats a null range as all time", () => {
    const rows = [{ date: "2001-01-01" }, { date: "2099-12-31" }]
    expect(filterByPeriod(rows, periodRange(null, NOON_UTC))).toHaveLength(2)
  })

  it("boundary membership does not depend on the host timezone", () => {
    // The window is computed from ET calendar days and compared as strings, so
    // the same instant must produce the same membership regardless of TZ.
    const range = periodRange(30, NOON_UTC)
    const rows = [
      { date: etDaysAgo(30, NOON_UTC) },
      { date: etDaysAgo(31, NOON_UTC) },
      { date: todayET(NOON_UTC) },
    ]
    expect(filterByPeriod(rows, range).map((r) => r.date)).toEqual([
      etDaysAgo(30, NOON_UTC),
      todayET(NOON_UTC),
    ])
  })

  it("formats an ET date without shifting the calendar day", () => {
    expect(formatETDate("2026-01-01")).toBe("Jan 1, 2026")
    expect(formatETDate("2026-12-31")).toBe("Dec 31, 2026")
  })

  it("counts back calendar days across the spring-forward transition", () => {
    // 2026-03-09T04:15Z is 00:15 ET on the 9th, just after DST began on the
    // 8th. Subtracting a fixed 24h lands at 23:15 ET on the 7th — a day early,
    // which would pull an extra day into any window spanning the transition.
    const justAfterDst = new Date("2026-03-09T04:15:00Z")
    expect(todayET(justAfterDst)).toBe("2026-03-09")
    expect(etDaysAgo(1, justAfterDst)).toBe("2026-03-08")
    expect(etDaysAgo(2, justAfterDst)).toBe("2026-03-07")
  })

  it("counts back calendar days across the fall-back transition", () => {
    const justAfterFallback = new Date("2026-11-01T06:30:00Z") // 01:30 ET, Nov 1
    expect(todayET(justAfterFallback)).toBe("2026-11-01")
    expect(etDaysAgo(1, justAfterFallback)).toBe("2026-10-31")
  })

  it("spans exactly N+1 inclusive days for an N-day window", () => {
    const range = periodRange(30, new Date("2026-03-09T04:15:00Z"))
    expect(range).toEqual({ from: "2026-02-07", to: "2026-03-09" })
  })
})

// ─── ROI denominators ────────────────────────────────────────────────────────

describe("computeExtendedAccuracy — priced vs settled denominators", () => {
  // Three settled predictions in one month; only one carries odds.
  const rows = [
    makePrediction({ id: "1", date: "2026-07-01", profitLoss: 0.91 }),
    makePrediction({ id: "2", date: "2026-07-02" }),  // no odds → no profitLoss
    makePrediction({ id: "3", date: "2026-07-03" }),
  ]

  it("reports the priced count separately from the settled count", () => {
    const acc = computeExtendedAccuracy(rows)
    expect(acc.totalPredictions).toBe(3)
    expect(acc.pricedCount).toBe(1)
  })

  it("divides headline ROI by priced bets, not by all settled predictions", () => {
    const acc = computeExtendedAccuracy(rows)
    expect(acc.roi).toBeCloseTo(0.91, 10)
  })

  it("monthly ROI matches headline ROI when all rows fall in one month", () => {
    // Regression: monthly ROI used `pnl / total`, diluting it toward zero in
    // exact proportion to how many rows lacked odds (here it read 0.303).
    const acc = computeExtendedAccuracy(rows)
    expect(acc.monthlyData).toHaveLength(1)
    expect(acc.monthlyData[0].roi).toBeCloseTo(acc.roi, 10)
    expect(acc.monthlyData[0].priced).toBe(1)
    expect(acc.monthlyData[0].predictions).toBe(3)
  })

  it("reports zero ROI with a zero priced count when nothing carries odds", () => {
    const acc = computeExtendedAccuracy([makePrediction({ id: "9" })])
    expect(acc.pricedCount).toBe(0)
    expect(acc.roi).toBe(0)
  })

  it("scopes high-confidence P/L to priced high-confidence rows", () => {
    const acc = computeExtendedAccuracy([
      makePrediction({ id: "1", confidence: "High", profitLoss: 0.91 }),
      makePrediction({ id: "2", confidence: "High" }),
      makePrediction({ id: "3", confidence: "Low", profitLoss: -1 }),
    ])
    expect(acc.highConfTotal).toBe(2)
    expect(acc.highConfPricedCount).toBe(1)
    expect(acc.highConfPnL).toBeCloseTo(0.91, 10)
  })
})

// ─── Provenance disclosure ───────────────────────────────────────────────────

describe("computeExtendedAccuracy — provenance", () => {
  it("counts backtested rows and spans the real date range", () => {
    const acc = computeExtendedAccuracy([
      makePrediction({ id: "1", date: "2024-04-01", backtested: true }),
      makePrediction({ id: "2", date: "2026-07-20", backtested: false }),
      makePrediction({ id: "3", date: "2026-07-10" }),
    ])
    expect(acc.backtestedCount).toBe(1)
    expect(acc.dateSpan).toEqual({ from: "2024-04-01", to: "2026-07-20" })
  })

  it("excludes pending predictions from accuracy but counts them as tracked", () => {
    const acc = computeExtendedAccuracy([
      makePrediction({ id: "1", correct: true }),
      makePrediction({ id: "2", status: "pending", actualResult: undefined, correct: undefined }),
    ])
    expect(acc.totalTracked).toBe(2)
    expect(acc.totalPredictions).toBe(1)
    expect(acc.pendingCount).toBe(1)
    expect(acc.accuracy).toBe(1)
  })

  it("surfaces the Low confidence tier", () => {
    const acc = computeExtendedAccuracy([
      makePrediction({ id: "1", confidence: "Low", correct: false }),
      makePrediction({ id: "2", confidence: "Low", correct: true }),
    ])
    expect(acc.lowConfTotal).toBe(2)
    expect(acc.lowConfCorrect).toBe(1)
  })
})

// ─── Calibration bins ────────────────────────────────────────────────────────

describe("computeExtendedAccuracy — calibration bins", () => {
  it("buckets into equal-width deciles labelled by their lower edge", () => {
    // Math.round produced eleven bins whose 0.0 and 1.0 buckets were half-width
    // and therefore not comparable to the rest.
    const acc = computeExtendedAccuracy([
      makePrediction({ id: "1", nrfiProbability: 0.20 }),
      makePrediction({ id: "2", nrfiProbability: 0.29 }),
      makePrediction({ id: "3", nrfiProbability: 0.30 }),
    ])
    const bins = acc.calibrationData.map((c) => c.predictedBin)
    expect(bins).toEqual([0.2, 0.3])
    expect(acc.calibrationData[0].count).toBe(2)
  })

  it("keeps a probability of exactly 1 inside the top decile", () => {
    const acc = computeExtendedAccuracy([makePrediction({ id: "1", nrfiProbability: 1 })])
    expect(acc.calibrationData[0].predictedBin).toBe(0.9)
  })

  it("labels each bin by its lower edge, so every row belongs to [bin, bin+0.1)", () => {
    // AccuracyCharts relies on this: it plots the perfect-calibration diagonal
    // at bin + 0.05. If predictedBin ever became a midpoint again, that
    // reference line would silently shift by 5 points.
    const acc = computeExtendedAccuracy([
      makePrediction({ id: "1", nrfiProbability: 0.5 }),
      makePrediction({ id: "2", nrfiProbability: 0.599 }),
    ])
    expect(acc.calibrationData).toHaveLength(1)
    expect(acc.calibrationData[0].predictedBin).toBe(0.5)
    expect(acc.calibrationData[0].count).toBe(2)
  })

  it("reports the observed NRFI rate per bin", () => {
    const acc = computeExtendedAccuracy([
      makePrediction({ id: "1", nrfiProbability: 0.55, actualResult: "NRFI", prediction: "NRFI", correct: true }),
      makePrediction({ id: "2", nrfiProbability: 0.56, actualResult: "YRFI", prediction: "NRFI", correct: false }),
    ])
    expect(acc.calibrationData[0].actualRate).toBe(0.5)
  })
})

// ─── DB / localStorage merge ─────────────────────────────────────────────────

describe("mergeTrackedPredictions", () => {
  it("keeps DB-only rows so history survives a cleared browser", () => {
    const merged = mergeTrackedPredictions([makePrediction({ id: "db" })], [])
    expect(merged.map((p) => p.id)).toEqual(["db"])
  })

  it("promotes a settled DB result over a locally pending row", () => {
    const merged = mergeTrackedPredictions(
      [makePrediction({ id: "1", status: "complete", correct: true })],
      [makePrediction({ id: "1", status: "pending", actualResult: undefined, correct: undefined })],
    )
    expect(merged[0].status).toBe("complete")
  })

  it("carries DB odds and provenance onto a local row that lacks them", () => {
    const merged = mergeTrackedPredictions(
      [makePrediction({ id: "1", nrfiOdds: -120, backtested: true, profitLoss: 0.83 })],
      [makePrediction({ id: "1", nrfiOdds: undefined, backtested: undefined, profitLoss: undefined })],
    )
    expect(merged[0].nrfiOdds).toBe(-120)
    expect(merged[0].backtested).toBe(true)
    expect(merged[0].profitLoss).toBe(0.83)
  })

  it("honours an explicit deletion instead of resurrecting the row from the DB", () => {
    // Deleting clears localStorage only; the server-rendered DB rows still hold
    // the record, so absence from localRows cannot be read as "removed".
    const merged = mergeTrackedPredictions(
      [makePrediction({ id: "1" }), makePrediction({ id: "2" })],
      [makePrediction({ id: "2" })],
      new Set(["1"]),
    )
    expect(merged.map((p) => p.id)).toEqual(["2"])
  })

  it("without a deletion set, a DB row absent locally is retained", () => {
    const merged = mergeTrackedPredictions(
      [makePrediction({ id: "1" }), makePrediction({ id: "2" })],
      [makePrediction({ id: "2" })],
    )
    expect(merged.map((p) => p.id).sort()).toEqual(["1", "2"])
  })
})

// ─── Dashboard win/loss/push bucketing ───────────────────────────────────────

describe("summariseBetRecord", () => {
  it("excludes a push from both sides of the win rate", () => {
    // Regression: `pnl && pnl > 0` counted a push as a loss, so 1W/1push read
    // as 50% instead of 100%.
    const r = summariseBetRecord([
      { result: "NRFI", pnl: 90 },
      { result: "NRFI", pnl: 0 },
    ])
    expect(r.wins).toBe(1)
    expect(r.losses).toBe(0)
    expect(r.pushes).toBe(1)
    expect(r.decided).toBe(1)
    expect(r.winRate).toBe(100)
  })

  it("excludes a settled bet with no recorded P/L from the win rate", () => {
    const r = summariseBetRecord([
      { result: "NRFI", pnl: 90 },
      { result: "YRFI", pnl: null },
    ])
    expect(r.unresolved).toBe(1)
    expect(r.decided).toBe(1)
    expect(r.winRate).toBe(100)
    expect(r.settled).toBe(2)
  })

  it("ignores pending bets entirely", () => {
    const r = summariseBetRecord([
      { result: null, pnl: null },
      { result: "NRFI", pnl: -50 },
    ])
    expect(r.settled).toBe(1)
    expect(r.losses).toBe(1)
    expect(r.winRate).toBe(0)
  })

  it("returns a null win rate when nothing is decided", () => {
    expect(summariseBetRecord([]).winRate).toBeNull()
    expect(summariseBetRecord([{ result: "NRFI", pnl: 0 }]).winRate).toBeNull()
  })

  it("sums P/L in dollars across settled bets", () => {
    const r = summariseBetRecord([
      { result: "NRFI", pnl: 90.91 },
      { result: "YRFI", pnl: -100 },
      { result: "NRFI", pnl: 0 },
      { result: null,   pnl: null },
    ])
    expect(r.totalPnL).toBeCloseTo(-9.09, 10)
  })

  it("computes the win rate over decided bets only", () => {
    const r = summariseBetRecord([
      { result: "NRFI", pnl: 10 },
      { result: "NRFI", pnl: 10 },
      { result: "YRFI", pnl: -10 },
      { result: "NRFI", pnl: 0 },
      { result: "NRFI", pnl: null },
    ])
    expect(r.decided).toBe(3)
    expect(r.winRate).toBeCloseTo(66.666, 2)
  })
})

// ─── Engine facts surfaced in the UI ─────────────────────────────────────────
//
// The Insights tab renders these constants rather than restating them. Pin the
// values so a drift shows up here rather than silently in user-facing copy.

describe("engine constants exported for display", () => {
  it("exposes the real confidence cutoffs", () => {
    expect(CONFIDENCE_THRESHOLDS).toEqual({ high: 62, medium: 45 })
  })

  it("reports the calibration table as an identity map", () => {
    expect(CALIBRATION_IS_IDENTITY).toBe(true)
    expect(CALIBRATION_KNOT_COUNT).toBe(19)
  })
})
