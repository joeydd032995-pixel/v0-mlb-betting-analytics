import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { applyTierGating } from "@/lib/tier-gating"
import { hasAccess, FEATURE_MIN_TIER, normaliseTier, type Feature, type Tier } from "@/lib/tiers"
import type { NRFIPrediction } from "@/lib/types"

// lib/subscription pulls in Prisma; stub it so these stay pure unit tests.
const findUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { subscription: { findUnique: (...args: unknown[]) => findUnique(...args) } },
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

describe("applyTierGating", () => {
  const slate = [
    makePrediction("game-low", 40),
    makePrediction("game-high", 90),
    makePrediction("game-mid", 65),
  ]

  it("FREE exposes exactly one teaser (highest confidence) and ghosts the rest", () => {
    const { gated, lockedCount } = applyTierGating(slate, "FREE")

    expect(lockedCount).toBe(2)
    expect(gated).toHaveLength(3)

    const [teaser, ...ghosts] = gated
    expect(teaser.gameId).toBe("game-high")
    // Teaser carries probabilities but no actionable signal
    expect(teaser).toHaveProperty("nrfiProbability")
    expect(teaser).not.toHaveProperty("recommendation")
    expect(teaser).not.toHaveProperty("confidence")
    expect(teaser).not.toHaveProperty("factors")
    expect(teaser).not.toHaveProperty("modelBreakdown")

    // Ghosts carry nothing but an id and the locked flag
    for (const ghost of ghosts) {
      expect(Object.keys(ghost).sort()).toEqual(["_tierLocked", "gameId"])
      expect((ghost as { _tierLocked: boolean })._tierLocked).toBe(true)
    }
  })

  it("PRO sees every game but no ELITE-only fields", () => {
    const { gated, lockedCount } = applyTierGating(slate, "PRO")

    expect(lockedCount).toBe(0)
    expect(gated).toHaveLength(3)
    for (const p of gated) {
      expect((p as { _tierLocked: boolean })._tierLocked).toBe(false)
      // PRO keeps the actionable signal…
      expect(p).toHaveProperty("recommendation")
      expect(p).toHaveProperty("confidence")
      // …but not the model internals, nor the raw inputs that reproduce them
      expect(p).not.toHaveProperty("modelBreakdown")
      expect(p).not.toHaveProperty("deepNrfi")
      expect(p).not.toHaveProperty("monteCarlo")
      expect(p).not.toHaveProperty("ensembleWeights")
      expect(p).not.toHaveProperty("features")
      expect(p).not.toHaveProperty("featurePresence")
    }
  })

  // This is the regression the Elite lockout was about: an ELITE subscriber
  // must get the entire slate with nothing stripped.
  it("ELITE sees every game with no fields stripped", () => {
    const { gated, lockedCount } = applyTierGating(slate, "ELITE")

    expect(lockedCount).toBe(0)
    expect(gated).toHaveLength(3)
    expect(gated.map((p) => p.gameId)).toEqual(["game-high", "game-mid", "game-low"])
    for (const p of gated) {
      expect((p as { _tierLocked: boolean })._tierLocked).toBe(false)
      expect(p).toHaveProperty("modelBreakdown")
      expect(p).toHaveProperty("deepNrfi")
      expect(p).toHaveProperty("monteCarlo")
      expect(p).toHaveProperty("ensembleWeights")
      expect(p).toHaveProperty("features")
    }
  })

  it("does not mutate the input slate", () => {
    const before = slate.map((p) => p.gameId)
    applyTierGating(slate, "FREE")
    expect(slate.map((p) => p.gameId)).toEqual(before)
  })

  it("handles an empty slate", () => {
    expect(applyTierGating([], "FREE")).toEqual({ gated: [], lockedCount: 0 })
    expect(applyTierGating([], "ELITE")).toEqual({ gated: [], lockedCount: 0 })
  })
})

describe("hasAccess", () => {
  const features = Object.keys(FEATURE_MIN_TIER) as Feature[]
  const rank: Record<Tier, number> = { FREE: 0, PRO: 1, ELITE: 2 }

  it("grants a feature exactly when the tier meets its minimum", () => {
    for (const feature of features) {
      for (const tier of ["FREE", "PRO", "ELITE"] as Tier[]) {
        expect(hasAccess(tier, feature)).toBe(rank[tier] >= rank[FEATURE_MIN_TIER[feature]])
      }
    }
  })

  it("gives ELITE everything", () => {
    for (const feature of features) expect(hasAccess("ELITE", feature)).toBe(true)
  })

  it("gives FREE nothing in the matrix", () => {
    for (const feature of features) expect(hasAccess("FREE", feature)).toBe(false)
  })
})

describe("normaliseTier", () => {
  it("accepts known tiers in any casing, with whitespace", () => {
    expect(normaliseTier("elite")).toBe("ELITE")
    expect(normaliseTier(" Pro ")).toBe("PRO")
    expect(normaliseTier("FREE")).toBe("FREE")
  })

  it("maps anything unrecognised to FREE rather than leaking it to the UI", () => {
    expect(normaliseTier("premium")).toBe("FREE")
    expect(normaliseTier("")).toBe("FREE")
  })
})

describe("resolveUserTier", () => {
  const OLD_ENV = process.env.ADMIN_USER_IDS

  beforeEach(() => {
    findUnique.mockReset()
    delete process.env.ADMIN_USER_IDS
  })
  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.ADMIN_USER_IDS
    else process.env.ADMIN_USER_IDS = OLD_ENV
  })

  it("resolves an active ELITE subscription", async () => {
    const { resolveUserTier } = await import("@/lib/subscription")
    findUnique.mockResolvedValue({ tier: "elite", status: "active", currentPeriodEnd: null })
    await expect(resolveUserTier("user_1")).resolves.toEqual({ tier: "ELITE", resolved: true })
  })

  it("treats an expired subscription as a known FREE", async () => {
    const { resolveUserTier } = await import("@/lib/subscription")
    findUnique.mockResolvedValue({
      tier: "ELITE",
      status: "active",
      currentPeriodEnd: new Date(Date.now() - 86_400_000),
    })
    await expect(resolveUserTier("user_1")).resolves.toEqual({ tier: "FREE", resolved: true })
  })

  it("treats a signed-out caller as a known FREE, not a failure", async () => {
    const { resolveUserTier } = await import("@/lib/subscription")
    await expect(resolveUserTier(null)).resolves.toEqual({ tier: "FREE", resolved: true })
    expect(findUnique).not.toHaveBeenCalled()
  })

  // The silent `catch { return "FREE" }` this replaces is what let a DB blip
  // present a paying subscriber with the free-tier paywall.
  it("reports resolved: false on a DB failure instead of silently downgrading", async () => {
    const { resolveUserTier } = await import("@/lib/subscription")
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    findUnique.mockRejectedValue(new Error("connection timeout"))

    await expect(resolveUserTier("user_1")).resolves.toEqual({ tier: "FREE", resolved: false })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it("retries once before giving up", async () => {
    const { resolveUserTierWithRetry } = await import("@/lib/subscription")
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    findUnique
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ tier: "ELITE", status: "active", currentPeriodEnd: null })

    await expect(resolveUserTierWithRetry("user_1")).resolves.toEqual({ tier: "ELITE", resolved: true })
    expect(findUnique).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })

  it("honours the ADMIN_USER_IDS override without touching the DB", async () => {
    const { resolveUserTier } = await import("@/lib/subscription")
    process.env.ADMIN_USER_IDS = "user_admin, user_other"
    await expect(resolveUserTier("user_admin")).resolves.toEqual({ tier: "ELITE", resolved: true })
    expect(findUnique).not.toHaveBeenCalled()
  })
})
