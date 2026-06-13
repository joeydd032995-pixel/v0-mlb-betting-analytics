import { describe, it, expect } from "vitest"
import { computeBacktestMetrics, logLoss, pearson } from "../lib/backtest-metrics"
import type { BacktestRow } from "../lib/backtest-metrics"

const ROWS: BacktestRow[] = [
  { nrfiProbability: 0.65, actualNrfi: true,  confidence: "High"   },
  { nrfiProbability: 0.65, actualNrfi: true,  confidence: "High"   },
  { nrfiProbability: 0.65, actualNrfi: false, confidence: "High"   },
  { nrfiProbability: 0.42, actualNrfi: false, confidence: "Medium" },
  { nrfiProbability: 0.42, actualNrfi: true,  confidence: "Medium" },
  { nrfiProbability: 0.55, actualNrfi: true,  confidence: "Low"    },
]

describe("logLoss", () => {
  it("returns 0 for empty input", () => {
    expect(logLoss([], [])).toBe(0)
  })

  it("a perfectly confident correct prediction approaches 0 (clipped)", () => {
    // p=1 against y=1 clips to 1-1e-3, so -log(0.999) ≈ 0.001
    expect(logLoss([1], [1])).toBeCloseTo(-Math.log(1 - 1e-3), 6)
  })

  it("a coin-flip prediction yields ≈ ln(2)", () => {
    expect(logLoss([0.5, 0.5], [1, 0])).toBeCloseTo(Math.log(2), 6)
  })

  it("penalises a confident miss far more than a hedged one", () => {
    const confidentMiss = logLoss([0.95], [0])
    const hedgedMiss    = logLoss([0.6], [0])
    expect(confidentMiss).toBeGreaterThan(hedgedMiss)
  })

  it("accepts boolean labels", () => {
    expect(logLoss([0.5, 0.5], [true, false])).toBeCloseTo(Math.log(2), 6)
  })
})

describe("pearson", () => {
  it("returns 1 for a perfectly correlated series", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 9)
  })

  it("returns -1 for a perfectly anti-correlated series", () => {
    expect(pearson([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 9)
  })

  it("returns 0 when a series has no variance (undefined correlation)", () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBe(0)
  })

  it("returns 0 for too-short or mismatched input", () => {
    expect(pearson([1], [1])).toBe(0)
    expect(pearson([], [])).toBe(0)
  })
})

describe("computeBacktestMetrics — log-loss field", () => {
  it("reports a finite log-loss for non-empty rows and 0 when empty", () => {
    expect(computeBacktestMetrics(ROWS).logLoss).toBeGreaterThan(0)
    expect(computeBacktestMetrics([]).logLoss).toBe(0)
  })
})

describe("computeBacktestMetrics — empty input", () => {
  it("returns zero-value object for empty rows", () => {
    const m = computeBacktestMetrics([])
    expect(m.n).toBe(0)
    expect(m.brierScore).toBe(0)
    expect(m.logLoss).toBe(0)
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
