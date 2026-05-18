import { describe, it, expect } from "vitest"
import { calibrateWithMonotonicSpline } from "../lib/calibration"
import { LEAGUE_AVG_NRFI } from "../lib/nrfi-models"

// LEAGUE_ANCHOR as computed by the engine at module load time
const LEAGUE_ANCHOR_IN_ENGINE = 0.559

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

  it("maps the boundary knots exactly", () => {
    expect(calibrateWithMonotonicSpline(0.05)).toBeCloseTo(0.060, 5)
    expect(calibrateWithMonotonicSpline(0.95)).toBeCloseTo(0.930, 5)
  })

  it("maps 0.80 to approximately 0.800 (near-identity in the high range)", () => {
    expect(calibrateWithMonotonicSpline(0.80)).toBeCloseTo(0.800, 4)
  })
})
