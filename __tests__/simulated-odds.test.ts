import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { SIMULATED_BOOKMAKER, simulatedGameOdds, syntheticMarketProb, DEFAULT_SYNTH } from "@/lib/synthetic-odds"
import { makeGame, makePitcher, makeTeam } from "./fixtures"
import type { Game, Pitcher, Team } from "@/lib/types"

// The simulated line exists so the value / Kelly surface renders when no real
// book is available. These tests pin the two properties that keep it from being
// mistaken for real data: it is always labelled, and it never reaches the
// persisted odds columns.

function slate(game: Game): { pitchers: Map<string, Pitcher>; teams: Map<string, Team> } {
  const pitchers = new Map<string, Pitcher>([
    [game.homePitcherId, makePitcher(game.homePitcherId)],
    [game.awayPitcherId, makePitcher(game.awayPitcherId)],
  ])
  const teams = new Map<string, Team>([
    [game.homeTeamId, makeTeam(game.homeTeamId)],
    [game.awayTeamId, makeTeam(game.awayTeamId)],
  ])
  return { pitchers, teams }
}

describe("simulated odds are always identifiable", () => {
  it("labels the line with a non-book provenance string", () => {
    const odds = simulatedGameOdds(0.55)
    expect(odds.bookmaker).toBe(SIMULATED_BOOKMAKER)
    expect(SIMULATED_BOOKMAKER).toBe("simulated")
  })

  it("anchors toward the league base rate rather than echoing the model", () => {
    // A line that simply equalled the model probability would imply zero edge by
    // construction. Anchoring is what keeps the reconstruction from being circular.
    const model = 0.62
    const market = syntheticMarketProb(model, DEFAULT_SYNTH)
    expect(market).toBeLessThan(model)   // pulled back toward 0.516
    expect(market).toBeGreaterThan(0.516)
  })

  it("prices both sides with a real book's hold, not a fair coin", () => {
    const { nrfiOdds, yrfiOdds } = simulatedGameOdds(0.52)
    const implied = (o: number) => (o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100))
    expect(implied(nrfiOdds) + implied(yrfiOdds)).toBeGreaterThan(1) // overround
  })
})

describe("simulated odds never contaminate the stored odds snapshot", () => {
  const OLD = process.env.USE_SIMULATED_ODDS
  beforeEach(() => { vi.resetModules() })
  afterEach(() => {
    if (OLD === undefined) delete process.env.USE_SIMULATED_ODDS
    else process.env.USE_SIMULATED_ODDS = OLD
    vi.resetModules()
  })

  it("leaves nrfiOdds/yrfiOdds null when the only line is simulated", async () => {
    process.env.USE_SIMULATED_ODDS = "true"
    const { computeNRFIPrediction } = await import("@/lib/nrfi-engine")
    const { buildTrackedPrediction } = await import("@/lib/prediction-store")

    const game = makeGame()               // no `odds` -> simulated path
    const { pitchers, teams } = slate(game)
    const pred = computeNRFIPrediction(game, pitchers, teams)
    expect(pred).not.toBeNull()

    // The analysis renders, and it is flagged.
    expect(pred!.valueAnalysis).toBeDefined()
    expect(pred!.valueAnalysis!.simulated).toBe(true)

    // ...but nothing fabricated is persisted. ModelPrediction.nrfiOdds means
    // "real line observed"; once fabricated values land there they can never be
    // separated out again, and every later ROI number silently becomes fiction.
    const tracked = buildTrackedPrediction(pred!, game, pitchers, teams, game.date)
    expect(tracked.nrfiOdds).toBeUndefined()
    expect(tracked.yrfiOdds).toBeUndefined()
  })

  it("produces no value analysis at all when the flag is off", async () => {
    delete process.env.USE_SIMULATED_ODDS
    const { computeNRFIPrediction } = await import("@/lib/nrfi-engine")
    const game = makeGame()
    const { pitchers, teams } = slate(game)
    const pred = computeNRFIPrediction(game, pitchers, teams)
    expect(pred!.valueAnalysis).toBeUndefined()
  })

  it("prefers a real line and marks it unsimulated", async () => {
    process.env.USE_SIMULATED_ODDS = "true"
    const { computeNRFIPrediction } = await import("@/lib/nrfi-engine")
    const { buildTrackedPrediction } = await import("@/lib/prediction-store")

    const game = makeGame({ odds: { nrfiOdds: -135, yrfiOdds: 110, bookmaker: "draftkings" } })
    const { pitchers, teams } = slate(game)
    const pred = computeNRFIPrediction(game, pitchers, teams)

    expect(pred!.valueAnalysis!.simulated).toBe(false)
    expect(pred!.valueAnalysis!.nrfiOdds).toBe(-135)

    const tracked = buildTrackedPrediction(pred!, game, pitchers, teams, game.date)
    expect(tracked.nrfiOdds).toBe(-135)   // real lines DO persist
    expect(tracked.yrfiOdds).toBe(110)
  })
})
