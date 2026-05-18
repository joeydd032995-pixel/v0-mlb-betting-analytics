import { describe, it, expect } from "vitest"
import {
  bayesianShrinkage,
  applyDynamicShrinkage,
  getDynamicPriorWeight,
  computeZIPModel,
  computeMarkovNrfi,
  computeMAPREHalfInning,
  computePAOutcomes,
  log5,
  LEAGUE_AVG_NRFI,
  ENSEMBLE_WEIGHTS,
} from "../lib/nrfi-models"
import type { Pitcher } from "../lib/types"

// ─── Test fixture ─────────────────────────────────────────────────────────────

function makePitcher(overrides: {
  nrfiRate?: number
  startCount?: number
  kRate?: number
  isBullpenGame?: boolean
  careerFirstInnings?: number
}): Pitcher {
  return {
    id: "test",
    name: "Test Pitcher",
    throws: "R",
    overall: { era: 3.80, fip: 3.70, xfip: 3.75, whip: 1.15, kPer9: 9.0, bbPer9: 2.5, innings: 150, wins: 10, losses: 8 },
    firstInning: {
      era: 3.80,
      whip: 1.15,
      kRate: overrides.kRate ?? 0.225,
      bbRate: 0.085,
      hrPer9: 1.0,
      babip: 0.295,
      nrfiRate: overrides.nrfiRate ?? LEAGUE_AVG_NRFI,
      avgRunsAllowed: 0.52,
      firstBatterOBP: 0.300,
      last5Results: [true, true, false, true, false],
      last5RunsAllowed: [0, 0, 1, 0, 1],
      startCount: overrides.startCount ?? 20,
      homeNrfiRate: LEAGUE_AVG_NRFI,
      awayNrfiRate: LEAGUE_AVG_NRFI,
      isBullpenGame: overrides.isBullpenGame ?? false,
      careerFirstInnings: overrides.careerFirstInnings,
    },
  } as unknown as Pitcher
}

// ─── bayesianShrinkage ────────────────────────────────────────────────────────

describe("bayesianShrinkage", () => {
  it("approaches observed rate as sample size grows (capped at 0.97)", () => {
    // dataWeight = Math.min(0.97, n/(n+k)) — the cap prevents pure data-trust
    // even with enormous sample sizes, keeping a floor of league-prior influence.
    const { dataWeight } = bayesianShrinkage(0.80, 1000)
    expect(dataWeight).toBeGreaterThanOrEqual(0.97)
  })

  it("approaches league mean when sample size is 0", () => {
    const { shrunkenRate } = bayesianShrinkage(0.80, 0)
    expect(shrunkenRate).toBeCloseTo(LEAGUE_AVG_NRFI, 2)
  })

  it("clamps output within [0.35, 0.92]", () => {
    expect(bayesianShrinkage(0.0, 1).shrunkenRate).toBeGreaterThanOrEqual(0.35)
    expect(bayesianShrinkage(1.0, 1).shrunkenRate).toBeLessThanOrEqual(0.92)
  })

  it("dataWeight + leagueWeight equals 1.0", () => {
    const result = bayesianShrinkage(0.60, 15)
    expect(result.dataWeight + result.leagueWeight).toBeCloseTo(1.0)
  })
})

// ─── getDynamicPriorWeight ────────────────────────────────────────────────────

describe("getDynamicPriorWeight", () => {
  it("returns 80 for bullpen games regardless of career innings", () => {
    const p = makePitcher({ isBullpenGame: true, careerFirstInnings: 300 })
    expect(getDynamicPriorWeight(p)).toBe(80)
  })

  it("returns 30 for spot starters with careerFirstInnings < 100", () => {
    const p = makePitcher({ isBullpenGame: false, careerFirstInnings: 50 })
    expect(getDynamicPriorWeight(p)).toBe(30)
  })

  it("returns 50 for established starters with careerFirstInnings >= 100", () => {
    const p = makePitcher({ isBullpenGame: false, careerFirstInnings: 300 })
    expect(getDynamicPriorWeight(p)).toBe(50)
  })

  it("falls back to startCount * 3 when careerFirstInnings is absent", () => {
    // startCount=5 → fallback careerIP = 15 < 100 → k=30
    const p = makePitcher({ startCount: 5 })
    expect(getDynamicPriorWeight(p)).toBe(30)
  })
})

// ─── applyDynamicShrinkage vs bayesianShrinkage ───────────────────────────────

describe("applyDynamicShrinkage vs bayesianShrinkage", () => {
  it("applies heavier shrinkage than legacy for a 5-start veteran pitcher", () => {
    // careerFirstInnings: 300 → k=50; n=5
    // dynamic:  (5*0.80 + 50*0.516) / (5+50) ≈ 0.542
    // legacy:   k≈1.14, dataWeight≈0.81, result≈0.747
    const pitcher = makePitcher({ nrfiRate: 0.80, startCount: 5, careerFirstInnings: 300 })
    const k       = getDynamicPriorWeight(pitcher)  // 50
    const dynamic = applyDynamicShrinkage(pitcher, k)
    const { shrunkenRate: legacy } = bayesianShrinkage(0.80, 5)

    expect(dynamic).toBeLessThan(legacy)
    expect(dynamic).toBeCloseTo(0.542, 2)
    expect(legacy).toBeGreaterThan(0.70)
  })
})

// ─── log5 ─────────────────────────────────────────────────────────────────────

describe("log5", () => {
  it("returns league rate when batter and pitcher are both at league average", () => {
    const leagueRate = 0.085
    expect(log5(leagueRate, leagueRate, leagueRate)).toBeCloseTo(leagueRate, 4)
  })

  it("amplifies an above-average batter against a below-average pitcher", () => {
    const result = log5(0.150, 0.120, 0.085)
    expect(result).toBeGreaterThan(0.085)
  })

  it("returns batter rate when league is degenerate (0 or 1)", () => {
    expect(log5(0.10, 0.10, 0)).toBe(0.10)
    expect(log5(0.10, 0.10, 1)).toBe(0.10)
  })

  it("always returns a value in [0, 1]", () => {
    const extreme = log5(0.999, 0.001, 0.085)
    expect(extreme).toBeGreaterThanOrEqual(0)
    expect(extreme).toBeLessThanOrEqual(1)
  })
})

// ─── computeZIPModel ──────────────────────────────────────────────────────────

describe("computeZIPModel", () => {
  it("omega increases with higher K-rate", () => {
    const eliteK  = makePitcher({ kRate: 0.35 })
    const leagueK = makePitcher({ kRate: 0.225 })
    const eliteResult  = computeZIPModel(eliteK,  1.0, 1.0, 72)
    const leagueResult = computeZIPModel(leagueK, 1.0, 1.0, 72)
    expect(eliteResult.omega).toBeGreaterThan(leagueResult.omega)
  })

  it("satisfies the ZIP identity: nrfiProb ≈ omega + (1-omega)*e^(-lambda)", () => {
    // At typical inputs, clamping is inactive so the identity holds exactly.
    const p      = makePitcher({})
    const result = computeZIPModel(p, 1.0, 1.0, 72)
    const expected = result.omega + (1 - result.omega) * Math.exp(-result.lambda)
    expect(result.nrfiProb).toBeCloseTo(expected, 6)
  })

  it("returns higher NRFI prob in cold weather than hot weather", () => {
    const p    = makePitcher({})
    const cold = computeZIPModel(p, 1.0, 1.0, 40)
    const hot  = computeZIPModel(p, 1.0, 1.0, 95)
    expect(cold.nrfiProb).toBeGreaterThan(hot.nrfiProb)
  })

  it("clamps omega within [0.08, 0.60]", () => {
    const extremeAce     = makePitcher({ kRate: 0.60 })
    const extremeBattery = makePitcher({ kRate: 0.00 })
    expect(computeZIPModel(extremeAce,     1.0, 1.0, 72).omega).toBeLessThanOrEqual(0.60)
    expect(computeZIPModel(extremeBattery, 1.0, 1.0, 72).omega).toBeGreaterThanOrEqual(0.08)
  })
})

// ─── computeMarkovNrfi ────────────────────────────────────────────────────────

describe("computeMarkovNrfi", () => {
  it("returns maximum NRFI (0.98 clamp) when every PA is an out", () => {
    // Mathematically P(NRFI) → 1.0 with all-out PAs, but the function clamps
    // at 0.98 to prevent downstream models from receiving degenerate inputs.
    const allOuts = { out: 1.0, walk: 0, single: 0, double: 0, triple: 0, hr: 0 }
    expect(computeMarkovNrfi(allOuts).nrfiProb).toBeCloseTo(0.98, 6)
  })

  it("returns near-minimum NRFI when every PA is a HR", () => {
    const allHR = { out: 0, walk: 0, single: 0, double: 0, triple: 0, hr: 1.0 }
    expect(computeMarkovNrfi(allHR).nrfiProb).toBeLessThan(0.05)
    expect(computeMarkovNrfi(allHR).nrfiProb).toBeGreaterThanOrEqual(0.02)
  })

  it("P(NRFI) decreases as walk rate increases", () => {
    const fewWalks  = { out: 0.85, walk: 0.02, single: 0.09, double: 0.03, triple: 0.005, hr: 0.005 }
    const manyWalks = { out: 0.75, walk: 0.12, single: 0.09, double: 0.03, triple: 0.005, hr: 0.005 }
    expect(computeMarkovNrfi(fewWalks).nrfiProb).toBeGreaterThan(computeMarkovNrfi(manyWalks).nrfiProb)
  })

  it("starting at 2 outs gives higher NRFI prob than starting at 0 outs", () => {
    const pa = { out: 0.70, walk: 0.09, single: 0.14, double: 0.05, triple: 0.01, hr: 0.01 }
    expect(computeMarkovNrfi(pa, 2, 0).nrfiProb).toBeGreaterThan(computeMarkovNrfi(pa, 0, 0).nrfiProb)
  })
})

// ─── computeMAPREHalfInning: babip sanitization ───────────────────────────────

describe("computeMAPREHalfInning — babip sanitization", () => {
  it("treats babip=0 identically to babip=undefined (uses 0.295 league default)", () => {
    const withZero      = computeMAPREHalfInning(0.60, { babip1st: 0 })
    const withUndefined = computeMAPREHalfInning(0.60, { babip1st: undefined })
    expect(withZero.lambdaAdj).toBeCloseTo(withUndefined.lambdaAdj, 6)
  })

  it("accepts a genuine low BABIP just above the floor", () => {
    const lowButReal = computeMAPREHalfInning(0.60, { babip1st: 0.22 })
    const baseline   = computeMAPREHalfInning(0.60, {})
    // 0.22 is a real BABIP for a dominant pitcher — model should use it,
    // producing a lower lambdaAdj (fewer expected runs) than the 0.295 baseline.
    expect(lowButReal.lambdaAdj).toBeLessThan(baseline.lambdaAdj)
  })

  it("treats implausibly high babip as missing data", () => {
    const tooHigh  = computeMAPREHalfInning(0.60, { babip1st: 0.70 })
    const baseline = computeMAPREHalfInning(0.60, {})
    expect(tooHigh.lambdaAdj).toBeCloseTo(baseline.lambdaAdj, 6)
  })
})

// ─── computePAOutcomes — probability invariants (Fix 1 regression guard) ──────

describe("computePAOutcomes — probability invariants", () => {
  it("PA probabilities always sum to exactly 1.0 across all offense factors", () => {
    const offenseFactors = [0.70, 0.85, 1.00, 1.15, 1.30, 1.50]
    for (const offenseFactor of offenseFactors) {
      const pa  = computePAOutcomes(makePitcher({}), offenseFactor)
      const sum = pa.out + pa.walk + pa.single + pa.double + pa.triple + pa.hr
      expect(sum, `offenseFactor=${offenseFactor}`).toBeCloseTo(1.0, 5)
    }
  })

  it("all PA outcome probabilities are non-negative", () => {
    const pa = computePAOutcomes(makePitcher({ kRate: 0.10 }), 1.5)
    expect(pa.out).toBeGreaterThanOrEqual(0)
    expect(pa.walk).toBeGreaterThanOrEqual(0)
    expect(pa.single).toBeGreaterThanOrEqual(0)
    expect(pa.double).toBeGreaterThanOrEqual(0)
    expect(pa.triple).toBeGreaterThanOrEqual(0)
    expect(pa.hr).toBeGreaterThanOrEqual(0)
  })

  it("out floor does not cause PA sum to exceed 1.0 (regression guard)", () => {
    // This exact scenario triggered the original bug: low K-rate pitcher + high offense
    const aggressivePitcher = makePitcher({ kRate: 0.10 })
    const pa  = computePAOutcomes(aggressivePitcher, 1.50)
    const sum = pa.out + pa.walk + pa.single + pa.double + pa.triple + pa.hr
    expect(sum).toBeLessThanOrEqual(1.0001)
  })

  it("higher offenseFactor increases on-base probability", () => {
    const paLow  = computePAOutcomes(makePitcher({}), 0.80)
    const paHigh = computePAOutcomes(makePitcher({}), 1.40)
    const onBaseLow  = paLow.walk  + paLow.single  + paLow.double  + paLow.triple  + paLow.hr
    const onBaseHigh = paHigh.walk + paHigh.single + paHigh.double + paHigh.triple + paHigh.hr
    expect(onBaseHigh).toBeGreaterThan(onBaseLow)
  })
})

// ─── ENSEMBLE_WEIGHTS invariants (Fix 4A) ────────────────────────────────────

describe("ENSEMBLE_WEIGHTS", () => {
  it("all weights sum to exactly 1.0", () => {
    const sum = Object.values(ENSEMBLE_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 6)
  })

  it("has exactly 7 keys", () => {
    expect(Object.keys(ENSEMBLE_WEIGHTS)).toHaveLength(7)
  })

  it("all weights are positive", () => {
    for (const [k, v] of Object.entries(ENSEMBLE_WEIGHTS)) {
      expect(v, k).toBeGreaterThan(0)
    }
  })

  it("markov has the largest weight", () => {
    const maxWeight = Math.max(...Object.values(ENSEMBLE_WEIGHTS))
    expect(ENSEMBLE_WEIGHTS.markov).toBeCloseTo(maxWeight, 6)
  })
})
