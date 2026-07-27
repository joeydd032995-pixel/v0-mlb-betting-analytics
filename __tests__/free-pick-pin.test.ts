import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NRFIPrediction } from "@/lib/types"

const upsert = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { freePick: { upsert: (...args: unknown[]) => upsert(...args) } },
}))

function makePrediction(gameId: string, confidenceScore: number): NRFIPrediction {
  return {
    gameId,
    confidenceScore,
    nrfiProbability:   0.6,
    yrfiProbability:   0.4,
    calibratedNrfiPct: 60,
    homeExpectedRuns:  0.25,
    awayExpectedRuns:  0.25,
    homeScores0Prob:   0.75,
    awayScores0Prob:   0.75,
    recommendation:    "LEAN_NRFI",
    confidence:        "MEDIUM",
    factors:           [{ name: "f", description: "d", impact: 0.1 }],
    modelBreakdown:    { modelConsensus: 0.8 },
    deepNrfi:          { p: 0.6 },
    monteCarlo:        { pNRFI: 0.6 },
    ensembleWeights:   { poisson: 0.2 },
    features:          [1, 2, 3],
    featurePresence:   [true, true, true],
  } as unknown as NRFIPrediction
}

describe("pinFreePick", () => {
  beforeEach(() => {
    upsert.mockReset()
  })

  it("pins the top-confidence prediction with an empty update payload", async () => {
    const { pinFreePick } = await import("@/lib/server/free-pick")
    const slate = [
      makePrediction("game-low", 40),
      makePrediction("game-high", 90),
      makePrediction("game-mid", 65),
    ]

    await pinFreePick("2026-05-01", slate)

    expect(upsert).toHaveBeenCalledWith({
      where: { date: "2026-05-01" },
      create: { date: "2026-05-01", gameId: "game-high", confidenceScore: 90 },
      update: {},
    })
  })

  it("does nothing when the slate is empty", async () => {
    const { pinFreePick } = await import("@/lib/server/free-pick")
    await pinFreePick("2026-05-01", [])
    expect(upsert).not.toHaveBeenCalled()
  })

  it("swallows a DB error instead of throwing", async () => {
    const { pinFreePick } = await import("@/lib/server/free-pick")
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    upsert.mockRejectedValue(new Error("connection timeout"))

    await expect(pinFreePick("2026-05-01", [makePrediction("game-1", 50)])).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  // A hung write must not hold /api/predictions open for the route's full
  // maxDuration (300s) — see lib/subscription.ts's identical bound on the
  // tier lookup, reused here via withTimeout.
  it("does not block on a write that never resolves", async () => {
    const { pinFreePick } = await import("@/lib/server/free-pick")
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    upsert.mockReturnValue(new Promise(() => {})) // never settles

    vi.useFakeTimers()
    const pending = pinFreePick("2026-05-01", [makePrediction("game-1", 50)])
    await vi.advanceTimersByTimeAsync(3_100)
    await expect(pending).resolves.toBeUndefined()
    vi.useRealTimers()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
