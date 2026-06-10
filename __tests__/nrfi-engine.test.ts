import { describe, it, expect } from "vitest"
import { computeNRFIPrediction, computeAllPredictions } from "@/lib/nrfi-engine"
import { LEAGUE_HALF_NRFI } from "@/lib/nrfi-models"
import { makeGame, makePitcher, makePitchers, makeTeams, makeTeam } from "./fixtures"

describe("computeNRFIPrediction — null safety", () => {
  it("returns null when homePitcher is missing from map", () => {
    const pitchers = new Map([["pitcher-away", makePitcher("pitcher-away")]])
    expect(computeNRFIPrediction(makeGame(), pitchers, makeTeams())).toBeNull()
  })

  it("returns null when awayPitcher is missing from map", () => {
    const pitchers = new Map([["pitcher-home", makePitcher("pitcher-home")]])
    expect(computeNRFIPrediction(makeGame(), pitchers, makeTeams())).toBeNull()
  })

  it("returns null when homeTeam is missing from map", () => {
    const teams = new Map([["team-away", makeTeam("team-away")]])
    expect(computeNRFIPrediction(makeGame(), makePitchers(), teams)).toBeNull()
  })

  it("returns null when awayTeam is missing from map", () => {
    const teams = new Map([["team-home", makeTeam("team-home")]])
    expect(computeNRFIPrediction(makeGame(), makePitchers(), teams)).toBeNull()
  })
})

describe("computeNRFIPrediction — output shape", () => {
  const result = computeNRFIPrediction(makeGame(), makePitchers(), makeTeams())

  it("returns a non-null prediction for valid inputs", () => {
    expect(result).not.toBeNull()
  })

  it("P(NRFI) + P(YRFI) === 1.0", () => {
    expect(result!.nrfiProbability + result!.yrfiProbability).toBeCloseTo(1.0, 10)
  })

  it("nrfiProbability stays within [0.18, 0.86]", () => {
    expect(result!.nrfiProbability).toBeGreaterThanOrEqual(0.18)
    expect(result!.nrfiProbability).toBeLessThanOrEqual(0.86)
  })

  it("confidenceScore is in [10, 98]", () => {
    expect(result!.confidenceScore).toBeGreaterThanOrEqual(10)
    expect(result!.confidenceScore).toBeLessThanOrEqual(98)
  })

  it("ensembleVersion defaults to v1.7models", () => {
    expect(result!.ensembleVersion).toBe("v1.7models")
  })

  it("modelInputs.weatherMultiplier is 1.0 for calm clear weather", () => {
    expect(result!.modelInputs.weatherMultiplier).toBeCloseTo(1.0, 2)
  })
})

describe("computeNRFIPrediction — recommendation tiers", () => {
  // Use veteran starters to ensure dynamic shrinkage (k=50) trusts the sample.
  // nrfiRate is the HALF-INNING scoreless rate: league average ≈ 0.718,
  // elite ≈ 0.85, poor ≈ 0.55 (the old test used the game-level 0.516 as
  // "average", which on the half-inning scale is a terrible pitcher).
  function predWithNrfiRate(rate: number) {
    const pitcher = makePitcher("p", { nrfiRate: rate, startCount: 100, careerFirstInnings: 300 })
    const pitchers = new Map([
      ["pitcher-home", pitcher],
      ["pitcher-away", pitcher],
    ])
    return computeNRFIPrediction(makeGame(), pitchers, makeTeams())
  }
  const LEAGUE_HALF = LEAGUE_HALF_NRFI

  it("elite ace (0.85 scoreless-half rate) produces higher nrfiProbability than league average", () => {
    const ace = predWithNrfiRate(0.85)!.nrfiProbability
    const avg = predWithNrfiRate(LEAGUE_HALF)!.nrfiProbability
    expect(ace).toBeGreaterThan(avg)
  })

  it("poor pitcher (0.55 scoreless-half rate) produces lower nrfiProbability than league average", () => {
    const poor = predWithNrfiRate(0.55)!.nrfiProbability
    const avg  = predWithNrfiRate(LEAGUE_HALF)!.nrfiProbability
    expect(poor).toBeLessThan(avg)
  })

  it("elite ace produces LEAN_NRFI or STRONG_NRFI recommendation", () => {
    const rec = predWithNrfiRate(0.85)!.recommendation
    expect(["LEAN_NRFI", "STRONG_NRFI"]).toContain(rec)
  })

  it("league-average pitcher produces TOSS_UP or adjacent tier", () => {
    // Note: the shared fixture pitcher has slightly above-average peripherals
    // (WHIP 1.15, ERA 3.80), so the exact league-baseline regression guard
    // lives in __tests__/audit-regression.test.ts with truly average inputs.
    const rec = predWithNrfiRate(LEAGUE_HALF)!.recommendation
    expect(["TOSS_UP", "LEAN_NRFI", "LEAN_YRFI"]).toContain(rec)
  })
})

describe("computeNRFIPrediction — value analysis", () => {
  it("valueAnalysis is undefined when game.odds is absent", () => {
    expect(computeNRFIPrediction(makeGame(), makePitchers(), makeTeams())!
      .valueAnalysis).toBeUndefined()
  })

  it("valueAnalysis is defined when game.odds is present", () => {
    const game = makeGame({ odds: { nrfiOdds: -110, yrfiOdds: -110, bookmaker: "draftkings" } })
    expect(computeNRFIPrediction(game, makePitchers(), makeTeams())!
      .valueAnalysis).toBeDefined()
  })
})

describe("computeNRFIPrediction — dome weather", () => {
  it("dome game returns weatherMultiplier === 1.0 in modelInputs", () => {
    const game = makeGame({
      weather: { temperature: 72, windSpeed: 0, windDirection: "calm", conditions: "dome", humidity: 50 },
    })
    const r = computeNRFIPrediction(game, makePitchers(), makeTeams())
    expect(r!.modelInputs.weatherMultiplier).toBe(1.0)
  })
})

describe("computeAllPredictions", () => {
  it("skips games with missing pitcher data without throwing", () => {
    const games  = [makeGame({ id: "g1" }), makeGame({ id: "g2", homePitcherId: "missing" })]
    const result = computeAllPredictions(games, makePitchers(), makeTeams())
    expect(result).toHaveLength(1)
    expect(result[0].gameId).toBe("g1")
  })

  it("returns one prediction per valid game", () => {
    const games  = [
      makeGame({ id: "g1" }),
      makeGame({ id: "g2" }),
    ]
    const result = computeAllPredictions(games, makePitchers(), makeTeams())
    expect(result).toHaveLength(2)
  })

  it("returns empty array for empty games list", () => {
    expect(computeAllPredictions([], makePitchers(), makeTeams())).toHaveLength(0)
  })
})
