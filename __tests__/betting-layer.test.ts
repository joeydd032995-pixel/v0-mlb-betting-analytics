import { describe, it, expect, afterEach } from "vitest"
import { computeNRFIPrediction, confidenceFactor } from "@/lib/nrfi-engine"
import { CONFIG } from "@/lib/config"
import { makeGame, makePitchers, makeTeams } from "./fixtures"

// ─── 3a: confidence-scaled fractional Kelly ────────────────────────────────────

describe("confidenceFactor — confidence-scaled Kelly multiplier", () => {
  const cs = CONFIG.kelly.confidenceScaling
  afterEach(() => { cs.enabled = false }) // restore default so other suites are unaffected

  it("is a no-op (returns 1) when scaling is disabled — the audited default", () => {
    cs.enabled = false
    for (const score of [10, 50, 98]) expect(confidenceFactor(score)).toBe(1)
    expect(confidenceFactor(undefined)).toBe(1)
  })

  it("ramps monotonically from minFactor at score 10 to maxFactor at score 98 when enabled", () => {
    cs.enabled = true
    expect(confidenceFactor(10)).toBeCloseTo(cs.minFactor, 10)
    expect(confidenceFactor(98)).toBeCloseTo(cs.maxFactor, 10)
    const mid = confidenceFactor(54)
    expect(mid).toBeGreaterThan(cs.minFactor)
    expect(mid).toBeLessThan(cs.maxFactor)
    // strictly increasing across the range
    expect(confidenceFactor(30)).toBeLessThan(confidenceFactor(70))
  })

  it("clamps the score to [10, 98] so the factor never exceeds its configured bounds", () => {
    cs.enabled = true
    expect(confidenceFactor(0)).toBeCloseTo(cs.minFactor, 10)
    expect(confidenceFactor(200)).toBeCloseTo(cs.maxFactor, 10)
  })
})

// ─── 3b: liquidity guard on value bets ─────────────────────────────────────────

describe("value analysis — liquidity guard", () => {
  const predictWithOdds = (nrfiOdds: number, yrfiOdds: number) =>
    computeNRFIPrediction(
      makeGame({ odds: { nrfiOdds, yrfiOdds, bookmaker: "test" } }),
      makePitchers(),
      makeTeams(),
    )!.valueAnalysis!

  // Fixture model probability is ~0.548, so a +120 NRFI line (implied 0.4545)
  // gives a ~9% NRFI edge — comfortably past the 3% minimum.

  it("exposes overround and liquidityOk on every value analysis", () => {
    const va = predictWithOdds(-110, -110)
    expect(typeof va.overround).toBe("number")
    expect(typeof va.liquidityOk).toBe("boolean")
    // -110 / -110 ⇒ implied 0.5238 each ⇒ overround ≈ 1.048, a healthy two-way book
    expect(va.overround).toBeCloseTo(0.5238 * 2, 3)
    expect(va.liquidityOk).toBe(true)
  })

  it("recommends the bet when the same edge sits on a healthy (in-band) market", () => {
    // +120 / -190 ⇒ implied 0.4545 + 0.6552 ≈ 1.110 (≤ maxOverround 1.15)
    const va = predictWithOdds(120, -190)
    expect(va.overround).toBeLessThanOrEqual(CONFIG.kelly.maxOverround)
    expect(va.liquidityOk).toBe(true)
    expect(va.recommendedBet).toBe("NRFI")
    expect(va.kellyFraction).toBeGreaterThan(0)
  })

  it("suppresses that same bet when the YRFI side juices the overround past the band", () => {
    // +120 / -400 ⇒ implied 0.4545 + 0.80 ≈ 1.255 (> maxOverround) — illiquid
    const va = predictWithOdds(120, -400)
    expect(va.overround).toBeGreaterThan(CONFIG.kelly.maxOverround)
    expect(va.liquidityOk).toBe(false)
    expect(va.recommendedBet).toBe("NO_BET")
    expect(va.kellyFraction).toBe(0)
    // the NRFI edge is still reported (transparency) — only the bet is withheld
    expect(va.nrfiEdge).toBeGreaterThan(CONFIG.kelly.minEdge)
  })
})
