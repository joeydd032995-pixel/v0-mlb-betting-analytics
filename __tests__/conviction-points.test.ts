import { describe, it, expect } from "vitest"
import { convictionPoints, CONVICTION_THRESHOLDS } from "@/lib/nrfi-engine"

/**
 * The confidence pill shows the tier and this number side by side, so they must
 * never disagree — a "MEDIUM 18" next to a High cutoff of 18 is exactly the
 * contradiction the number replaced ("HIGH 50", where 50 was the reliability
 * score the tier no longer keys off).
 */
function tierOf(conviction: number) {
  return conviction >= CONVICTION_THRESHOLDS.high
    ? "High"
    : conviction >= CONVICTION_THRESHOLDS.medium
      ? "Medium"
      : "Low"
}

describe("convictionPoints", () => {
  it("puts conviction on the 0–100 scale the cutoffs are quoted in", () => {
    expect(convictionPoints(0)).toBe(0)
    expect(convictionPoints(0.22)).toBe(22)
    expect(convictionPoints(1)).toBe(100)
  })

  it("never displays a number that contradicts its own tier", () => {
    const highPts = CONVICTION_THRESHOLDS.high * 100
    const mediumPts = CONVICTION_THRESHOLDS.medium * 100

    // Sweep every 0.001 of the conviction range, including both boundaries.
    for (let i = 0; i <= 1000; i++) {
      const conviction = i / 1000
      const pts = convictionPoints(conviction)
      const tier = tierOf(conviction)

      if (tier === "High") expect(pts).toBeGreaterThanOrEqual(highPts)
      if (tier === "Medium") {
        expect(pts).toBeGreaterThanOrEqual(mediumPts)
        expect(pts).toBeLessThan(highPts)
      }
      if (tier === "Low") expect(pts).toBeLessThan(mediumPts)
    }
  })

  // Rounding would print the High cutoff beside a Medium tier here.
  it("floors rather than rounds just under the High cutoff", () => {
    const justUnder = CONVICTION_THRESHOLDS.high - 0.0005
    expect(tierOf(justUnder)).toBe("Medium")
    expect(convictionPoints(justUnder)).toBe(17)
    expect(Math.round(justUnder * 100)).toBe(18) // what we deliberately avoid
  })

  // Flooring can shave a point off a value that is mathematically exact:
  // |0.61 − 0.5| × 2 is 0.21999999999999997 in binary floating point, so a 61%
  // card shows 21 rather than 22. That is the accepted cost of the guarantee
  // above — a point of precision in a "distance from a coin flip" figure is
  // immaterial, a number that contradicts the tier beside it is not.
  it("agrees with the tier on a probability the engine actually produces", () => {
    const conviction = Math.abs(0.61 - 0.5) * 2 // the BOS/NYY card that started this
    expect(tierOf(conviction)).toBe("High")
    expect(convictionPoints(conviction)).toBe(21)
    expect(convictionPoints(conviction)).toBeGreaterThanOrEqual(CONVICTION_THRESHOLDS.high * 100)
  })
})
