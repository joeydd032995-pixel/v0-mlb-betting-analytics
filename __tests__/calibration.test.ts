import { describe, it, expect } from "vitest"
import { calibrateWithMonotonicSpline } from "../lib/calibration"
import { LEAGUE_AVG_NRFI } from "../lib/nrfi-models"

// Post-audit the knot table is the identity mapping (the old "Apr 2025" knots
// were fitted to the pre-fix engine's biased output distribution — see
// lib/calibration.ts header).  LEAGUE_ANCHOR therefore equals LEAGUE_AVG_NRFI.
const LEAGUE_ANCHOR_IN_ENGINE = LEAGUE_AVG_NRFI

describe("calibrateWithMonotonicSpline", () => {
  it("is monotonically non-decreasing across the full input range", () => {
    for (let x = 0.05; x <= 0.94; x += 0.01) {
      const y1 = calibrateWithMonotonicSpline(x)
      const y2 = calibrateWithMonotonicSpline(parseFloat((x + 0.01).toFixed(2)))
      expect(y2, `calibrate(${(x + 0.01).toFixed(2)}) >= calibrate(${x.toFixed(2)})`).toBeGreaterThanOrEqual(y1)
    }
  })

  it("calibrate(LEAGUE_AVG_NRFI) matches the LEAGUE_ANCHOR used in the engine", () => {
    // This test fails if LEAGUE_ANCHOR is not updated after a calibration knot re-fit.
    const calibratedLeague = calibrateWithMonotonicSpline(LEAGUE_AVG_NRFI)
    expect(calibratedLeague).toBeCloseTo(LEAGUE_ANCHOR_IN_ENGINE, 3)
  })

  it("output is always within [0, 1] for inputs in [0, 1]", () => {
    for (let x = 0; x <= 1; x += 0.05) {
      const y = calibrateWithMonotonicSpline(x)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(1)
    }
  })

  it("maps the boundary knots exactly (identity table)", () => {
    expect(calibrateWithMonotonicSpline(0.05)).toBeCloseTo(0.05, 5)
    expect(calibrateWithMonotonicSpline(0.95)).toBeCloseTo(0.95, 5)
  })

  it("is the identity in the interior (until knots are refit out-of-sample)", () => {
    for (const x of [0.30, 0.45, 0.516, 0.60, 0.80]) {
      expect(calibrateWithMonotonicSpline(x)).toBeCloseTo(x, 6)
    }
  })

  it("clamps inputs outside the knot range to the boundary values", () => {
    expect(calibrateWithMonotonicSpline(0.01)).toBeCloseTo(0.05, 6)
    expect(calibrateWithMonotonicSpline(0.99)).toBeCloseTo(0.95, 6)
  })
})
