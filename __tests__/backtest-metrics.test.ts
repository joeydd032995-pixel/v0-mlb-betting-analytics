import { describe, it, expect } from "vitest"
import { computeBacktestMetrics } from "../lib/backtest-metrics"
import type { BacktestRow } from "../lib/backtest-metrics"

const ROWS: BacktestRow[] = [
  { nrfiProbability: 0.65, actualNrfi: true,  confidence: "High"   },
  { nrfiProbability: 0.65, actualNrfi: true,  confidence: "High"   },
  { nrfiProbability: 0.65, actualNrfi: false, confidence: "High"   },
  { nrfiProbability: 0.42, actualNrfi: false, confidence: "Medium" },
  { nrfiProbability: 0.42, actualNrfi: true,  confidence: "Medium" },
  { nrfiProbability: 0.55, actualNrfi: true,  confidence: "Low"    },
]

describe("computeBacktestMetrics — empty input", () => {
  it("returns zero-value object for empty rows", () => {
    const m = computeBacktestMetrics([])
    expect(m.n).toBe(0)
    expect(m.brierScore).toBe(0)
    expect(m.accuracy).toBe(0)
    expect(m.roiKelly).toBe(0)
    expect(m.roiFlat).toBe(0)
    expect(m.sharpe).toBe(0)
    expect(m.maxDrawdown).toBe(0)
    expect(m.calibration).toHaveLength(0)
    expect(m.byConfidence).toEqual({})
  })
})

describe("computeBacktestMetrics — Brier score", () => {
  it("returns n === rows.length", () => {
    expect(computeBacktestMetrics(ROWS).n).toBe(6)
  })

  it("Brier score is numerically exact", () => {
    const expected =
      ((0.65 - 1) ** 2 + (0.65 - 1) ** 2 + (0.65 - 0) ** 2 +
       (0.42 - 0) ** 2 + (0.42 - 1) ** 2 + (0.55 - 1) ** 2) / 6
    expect(computeBacktestMetrics(ROWS).brierScore).toBeCloseTo(expected, 9)
  })

  it("Brier score is in (0, 0.5) for typical predictions", () => {
    const m = computeBacktestMetrics(ROWS)
    expect(m.brierScore).toBeGreaterThan(0)
    expect(m.brierScore).toBeLessThan(0.5)
  })

  it("Brier score is 0 for perfect predictions", () => {
    const perfect: BacktestRow[] = [
      { nrfiProbability: 1.0, actualNrfi: true,  confidence: "High" },
      { nrfiProbability: 0.0, actualNrfi: false, confidence: "High" },
    ]
    expect(computeBacktestMetrics(perfect).brierScore).toBeCloseTo(0, 9)
  })

  it("Brier score is 0.25 for coin-flip predictions on mixed outcomes", () => {
    const coinFlip: BacktestRow[] = [
      { nrfiProbability: 0.5, actualNrfi: true,  confidence: "High" },
      { nrfiProbability: 0.5, actualNrfi: false, confidence: "High" },
    ]
    expect(computeBacktestMetrics(coinFlip).brierScore).toBeCloseTo(0.25, 9)
  })
})

describe("computeBacktestMetrics — accuracy", () => {
  it("accuracy is in [0, 1]", () => {
    const m = computeBacktestMetrics(ROWS)
    expect(m.accuracy).toBeGreaterThanOrEqual(0)
    expect(m.accuracy).toBeLessThanOrEqual(1)
  })

  it("100% accuracy when p >= 0.5 always matches actualNrfi", () => {
    const allCorrect: BacktestRow[] = [
      { nrfiProbability: 0.70, actualNrfi: true,  confidence: "High" },
      { nrfiProbability: 0.70, actualNrfi: true,  confidence: "High" },
      { nrfiProbability: 0.30, actualNrfi: false, confidence: "High" },
    ]
    expect(computeBacktestMetrics(allCorrect).accuracy).toBeCloseTo(1.0)
  })
})

describe("computeBacktestMetrics — calibration bins", () => {
  it("calibration bins are non-empty for ROWS", () => {
    expect(computeBacktestMetrics(ROWS).calibration.length).toBeGreaterThan(0)
  })

  it("each bin actual is in [0, 1]", () => {
    for (const b of computeBacktestMetrics(ROWS).calibration) {
      expect(b.actual).toBeGreaterThanOrEqual(0)
      expect(b.actual).toBeLessThanOrEqual(1)
    }
  })

  it("bin counts sum to n when all predictions fall within [0.05, 0.95]", () => {
    const total = computeBacktestMetrics(ROWS).calibration
      .reduce((s, b) => s + b.count, 0)
    expect(total).toBe(ROWS.length)
  })
})

describe("computeBacktestMetrics — byConfidence", () => {
  it("has keys for High, Medium, Low", () => {
    const bc = computeBacktestMetrics(ROWS).byConfidence
    expect("High" in bc).toBe(true)
    expect("Medium" in bc).toBe(true)
    expect("Low" in bc).toBe(true)
  })

  it("High tier has n = 3", () => {
    expect(computeBacktestMetrics(ROWS).byConfidence["High"].n).toBe(3)
  })

  it("each tier accuracy is in [0, 1]", () => {
    for (const s of Object.values(computeBacktestMetrics(ROWS).byConfidence)) {
      expect(s.accuracy).toBeGreaterThanOrEqual(0)
      expect(s.accuracy).toBeLessThanOrEqual(1)
    }
  })
})

describe("computeBacktestMetrics — maxDrawdown with ordered flag", () => {
  it("maxDrawdown is 0 when ordered=false", () => {
    expect(computeBacktestMetrics(ROWS, false).maxDrawdown).toBe(0)
  })

  it("maxDrawdown is non-negative when ordered=true", () => {
    expect(computeBacktestMetrics(ROWS, true).maxDrawdown).toBeGreaterThanOrEqual(0)
  })
})

describe("computeBacktestMetrics — custom odds", () => {
  it("accepts positive American odds (+150) without throwing", () => {
    const rows: BacktestRow[] = [
      { nrfiProbability: 0.65, actualNrfi: true, confidence: "High", nrfiOdds: 150 },
    ]
    expect(() => computeBacktestMetrics(rows)).not.toThrow()
  })

  it("falls back to -110 when nrfiOdds is null", () => {
    const withNull:  BacktestRow[] = [{ nrfiProbability: 0.65, actualNrfi: true, confidence: "High", nrfiOdds: null }]
    const withUndef: BacktestRow[] = [{ nrfiProbability: 0.65, actualNrfi: true, confidence: "High" }]
    const mNull  = computeBacktestMetrics(withNull)
    const mUndef = computeBacktestMetrics(withUndef)
    expect(mNull.brierScore).toBeCloseTo(mUndef.brierScore, 9)
  })
})
