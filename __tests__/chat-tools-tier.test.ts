import { describe, it, expect, vi, beforeEach } from "vitest"

// The chat tools pull the live slate and run the real prediction engine; both
// are mocked so these tests exercise the *gating* decisions, which is the part
// that protects the paywall.
const getLiveGameSlate = vi.fn()
const computeAllPredictions = vi.fn()
const loadFreePickAccuracy = vi.fn()
const getUserBetsSummary = vi.fn()
const getUserBankrollSummary = vi.fn()
const getUserWatchlist = vi.fn()

vi.mock("@/lib/api/live-data", () => ({
  getLiveGameSlate: (...a: unknown[]) => getLiveGameSlate(...a),
}))
vi.mock("@/lib/nrfi-engine", () => ({
  computeAllPredictions: (...a: unknown[]) => computeAllPredictions(...a),
}))
vi.mock("@/lib/server/free-pick-accuracy-query", () => ({
  loadFreePickAccuracy: (...a: unknown[]) => loadFreePickAccuracy(...a),
}))
vi.mock("@/lib/server/user-chat-data", () => ({
  getUserBetsSummary: (...a: unknown[]) => getUserBetsSummary(...a),
  getUserBankrollSummary: (...a: unknown[]) => getUserBankrollSummary(...a),
  getUserWatchlist: (...a: unknown[]) => getUserWatchlist(...a),
}))
vi.mock("@/lib/api/mlb-stats", () => ({
  fetchGameLinescore: vi.fn(),
  fetchPitcherStats: vi.fn(),
  fetchPitcherFirstInningSplits: vi.fn(),
  fetchTeamStats: vi.fn(),
  fetchAllActiveStarters: vi.fn(),
}))

import { runTool, type ToolContext } from "@/lib/ai/chat-tools"
import type { Tier } from "@/lib/tiers"

/** Minimal NRFIPrediction-shaped rows; only the fields gating touches matter. */
function pred(gameId: string, confidenceScore: number) {
  return {
    gameId,
    confidenceScore,
    nrfiProbability: 0.62,
    yrfiProbability: 0.38,
    calibratedNrfiPct: 62,
    homeExpectedRuns: 0.41,
    awayExpectedRuns: 0.39,
    homeScores0Prob: 0.67,
    awayScores0Prob: 0.68,
    recommendation: "STRONG_NRFI",
    valueAnalysis: { edge: 0.07, kelly: 0.02 },
    modelBreakdown: { poisson: 0.6, markov: 0.63 },
    deepNrfi: { p: 0.61 },
    monteCarlo: { p: 0.6 },
    ensembleWeights: { poisson: 0.2 },
    features: [1, 2, 3],
    featurePresence: [true, true, true],
  } as never
}

const ctx = (tier: Tier): ToolContext => ({ userId: "user_test", tier })

// Two games; "low" is deliberately NOT the highest-confidence one, so it is the
// game a FREE user must never be able to see.
// gameId is a string in NRFIPrediction; gamePk is its numeric form.
const TOP_GAME = "776001"
const LOW_GAME = "776002"
const SLATE = [pred(TOP_GAME, 90), pred(LOW_GAME, 10)]

beforeEach(() => {
  vi.clearAllMocks()
  getLiveGameSlate.mockResolvedValue({ games: [{}, {}], pitchers: new Map(), teams: new Map() })
  computeAllPredictions.mockReturnValue(SLATE)
})

describe("get_predictions tier gating", () => {
  it("gives FREE only the top pick and reports the rest as locked", async () => {
    const res = (await runTool("get_predictions", {}, ctx("FREE"))) as {
      predictions: { gameId: string }[]
      lockedCount: number
      note?: string
    }

    expect(res.predictions).toHaveLength(1)
    expect(res.predictions[0].gameId).toBe(TOP_GAME)
    expect(res.lockedCount).toBe(1)
    expect(res.note).toMatch(/hidden/i)
  })

  it("gives PRO every game but strips the ELITE-only model breakdown", async () => {
    const res = (await runTool("get_predictions", {}, ctx("PRO"))) as {
      predictions: Record<string, unknown>[]
    }

    expect(res.predictions).toHaveLength(2)
    for (const p of res.predictions) {
      expect(p).not.toHaveProperty("modelBreakdown")
      expect(p).not.toHaveProperty("deepNrfi")
      expect(p).not.toHaveProperty("features")
      expect(p).toHaveProperty("recommendation")
    }
  })

  // The slate view is compact for every tier — see the payload-size tests below.
  // ELITE's extra depth is delivered through get_game_analysis (one game at a
  // time), which is asserted in the paywall-bypass block.
  it("gives ELITE every game in the slate", async () => {
    const res = (await runTool("get_predictions", {}, ctx("ELITE"))) as {
      predictions: { gameId: string; recommendation?: string }[]
    }

    expect(res.predictions).toHaveLength(2)
    expect(res.predictions.map((p) => p.gameId)).toEqual([TOP_GAME, LOW_GAME])
    expect(res.predictions[0].recommendation).toBe("STRONG_NRFI")
  })
})

describe("get_game_analysis paywall-bypass regression", () => {
  // The exploit this guards: applyTierGating ranks by confidence to choose the
  // one game FREE may see, so gating a single-game slice would make ANY game
  // "top" — letting a FREE user walk the whole slate one gamePk at a time.
  it("refuses a non-top game for FREE instead of making it the top pick", async () => {
    const res = (await runTool("get_game_analysis", { gamePk: Number(LOW_GAME) }, ctx("FREE"))) as {
      locked?: boolean
      error?: string
      prediction?: unknown
    }

    expect(res.locked).toBe(true)
    expect(res.prediction).toBeUndefined()
    expect(res.error).toMatch(/plan/i)
  })

  it("still serves FREE its own top pick", async () => {
    const res = (await runTool("get_game_analysis", { gamePk: Number(TOP_GAME) }, ctx("FREE"))) as {
      locked?: boolean
      prediction?: { gameId: string }
    }

    expect(res.locked).toBeUndefined()
    expect(res.prediction?.gameId).toBe(TOP_GAME)
  })

  it("withholds the ensemble breakdown from PRO but serves it to ELITE", async () => {
    const proRes = (await runTool("get_game_analysis", { gamePk: Number(LOW_GAME) }, ctx("PRO"))) as {
      modelBreakdownIncluded: boolean
      prediction: Record<string, unknown>
    }
    expect(proRes.modelBreakdownIncluded).toBe(false)
    expect(proRes.prediction).not.toHaveProperty("modelBreakdown")

    const eliteRes = (await runTool("get_game_analysis", { gamePk: Number(LOW_GAME) }, ctx("ELITE"))) as {
      modelBreakdownIncluded: boolean
      prediction: Record<string, unknown>
    }
    expect(eliteRes.modelBreakdownIncluded).toBe(true)
    expect(eliteRes.prediction).toHaveProperty("modelBreakdown")
  })
})

describe("account tools are scoped to the calling user", () => {
  it("passes only the session userId through — never a model-supplied one", async () => {
    getUserBetsSummary.mockResolvedValue({ totalBets: 0 })
    getUserBankrollSummary.mockResolvedValue({ configured: false })
    getUserWatchlist.mockResolvedValue({ gameIds: [], count: 0 })

    // A model attempting to pass someone else's id must not influence the query.
    await runTool("get_my_bets", { status: "settled", userId: "user_someone_else" }, ctx("FREE"))
    await runTool("get_my_bankroll", { userId: "user_someone_else" }, ctx("FREE"))
    await runTool("get_my_watchlist", {}, ctx("FREE"))

    expect(getUserBetsSummary).toHaveBeenCalledWith("user_test", "settled")
    expect(getUserBankrollSummary).toHaveBeenCalledWith("user_test")
    expect(getUserWatchlist).toHaveBeenCalledWith("user_test")
  })
})

describe("get_predictions payload size", () => {
  // Groq's free tier is 12k tokens/minute, counted across every request in a
  // rolling minute — and a tool result is re-sent on each subsequent loop
  // iteration. Returning full NRFIPrediction objects for a whole slate blew
  // past that with a 413 in production. Keep the slate view compact; depth
  // belongs in get_game_analysis, which covers one game.
  const BIG_SLATE = Array.from({ length: 15 }, (_, i) => pred(String(776100 + i), 100 - i))

  it("stays well under the request budget for a full slate", async () => {
    computeAllPredictions.mockReturnValue(BIG_SLATE)
    const res = await runTool("get_predictions", {}, ctx("ELITE"))
    // ~6 KB ≈ 1.5k tokens, leaving room for the conversation and tool schemas.
    expect(JSON.stringify(res).length).toBeLessThan(6000)
  })

  it("omits the heavy per-model fields from the slate view", async () => {
    computeAllPredictions.mockReturnValue(BIG_SLATE)
    const serialized = JSON.stringify(await runTool("get_predictions", {}, ctx("ELITE")))

    expect(serialized).not.toContain("modelBreakdown")
    expect(serialized).not.toContain("featurePresence")
    expect(serialized).not.toContain("modelInputs")
  })
})

describe("date argument validation", () => {
  it("normalises a natural-language date the model is likely to send", async () => {
    await runTool("get_predictions", { date: "today" }, ctx("FREE"))
    const [dateArg] = getLiveGameSlate.mock.calls[0] as [string]
    expect(dateArg).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("rejects junk instead of forwarding it to the MLB API", async () => {
    const res = (await runTool("get_predictions", { date: "sometime next week" }, ctx("FREE"))) as {
      error?: string
    }
    expect(res.error).toBeTruthy()
    expect(getLiveGameSlate).not.toHaveBeenCalled()
  })
})

describe("get_model_accuracy", () => {
  it("returns the shared free-pick track record", async () => {
    loadFreePickAccuracy.mockResolvedValue({ total: 10, correct: 6, accuracy: 0.6 })
    const res = await runTool("get_model_accuracy", {}, ctx("FREE"))
    expect(res).toEqual({ total: 10, correct: 6, accuracy: 0.6 })
  })
})
