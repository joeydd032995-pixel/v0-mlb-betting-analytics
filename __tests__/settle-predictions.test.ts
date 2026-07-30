import { describe, it, expect, vi } from "vitest"

// The module imports prisma and the MLB API wrappers at load time. Stub both so
// the scoring logic can be exercised as a pure unit — resolveSettlement is the
// part worth locking down and it touches neither.
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/api/mlb-stats", () => ({
  fetchGamesByDate: vi.fn(),
  fetchGameLinescore: vi.fn(),
}))

import { resolveSettlement } from "@/lib/server/settle-predictions"

describe("resolveSettlement", () => {
  it("scores a correct NRFI call", () => {
    // nrfi = true means no runs in the first inning, so an NRFI pick was right.
    expect(resolveSettlement("NRFI", true)).toEqual({ actualResult: "NRFI", correct: true })
  })

  it("scores a wrong NRFI call", () => {
    expect(resolveSettlement("NRFI", false)).toEqual({ actualResult: "YRFI", correct: false })
  })

  it("scores a correct YRFI call", () => {
    expect(resolveSettlement("YRFI", false)).toEqual({ actualResult: "YRFI", correct: true })
  })

  it("scores a wrong YRFI call", () => {
    expect(resolveSettlement("YRFI", true)).toEqual({ actualResult: "NRFI", correct: false })
  })

  it("derives actualResult from ground truth alone, never from the prediction", () => {
    // Both picks on the same game must agree about what happened, and disagree
    // only about whether they were right.
    const nrfiPick = resolveSettlement("NRFI", true)
    const yrfiPick = resolveSettlement("YRFI", true)
    expect(nrfiPick.actualResult).toBe(yrfiPick.actualResult)
    expect(nrfiPick.correct).not.toBe(yrfiPick.correct)
  })

  it("treats an unrecognised prediction string as incorrect rather than throwing", () => {
    // Defensive: a malformed row should not settle as a win.
    expect(resolveSettlement("", true)).toEqual({ actualResult: "NRFI", correct: false })
    expect(resolveSettlement("nrfi", true).correct).toBe(false)
  })

  it("is exhaustive over the four outcome combinations", () => {
    const combos = [
      ["NRFI", true, true],
      ["NRFI", false, false],
      ["YRFI", true, false],
      ["YRFI", false, true],
    ] as const
    for (const [prediction, nrfi, expected] of combos) {
      expect(resolveSettlement(prediction, nrfi).correct).toBe(expected)
    }
  })
})
