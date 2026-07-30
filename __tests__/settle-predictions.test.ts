import { describe, it, expect, vi, beforeEach } from "vitest"

// The module imports prisma and the MLB API wrappers at load time. Stub both so
// the logic can be exercised as a unit.
const findManyPredictions = vi.fn()
const findManyGameResults = vi.fn()
const updateMany = vi.fn()
const createMany = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    modelPrediction: {
      findMany: (...args: unknown[]) => findManyPredictions(...args),
      updateMany: (...args: unknown[]) => updateMany(...args),
    },
    gameResult: {
      findMany: (...args: unknown[]) => findManyGameResults(...args),
      createMany: (...args: unknown[]) => createMany(...args),
    },
  },
}))

const fetchGamesByDate = vi.fn()
vi.mock("@/lib/api/mlb-stats", () => ({
  fetchGamesByDate: (...args: unknown[]) => fetchGamesByDate(...args),
  fetchGameLinescore: vi.fn(),
}))

import { resolveSettlement, settlePendingPredictions } from "@/lib/server/settle-predictions"

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

describe("settlePendingPredictions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findManyGameResults.mockResolvedValue([])
    updateMany.mockResolvedValue({ count: 0 })
    createMany.mockResolvedValue({ count: 0 })
    fetchGamesByDate.mockResolvedValue([])
  })

  it("counts a non-numeric id as invalidId, not unresolved", async () => {
    // `unresolved` is the field documented as the one worth alerting on. A row
    // whose id can never become a gamePk would otherwise land there on every
    // run forever, making the number useless.
    findManyPredictions.mockResolvedValue([
      { id: "not-a-gamepk", prediction: "NRFI", date: "2020-05-01" },
    ])

    const report = await settlePendingPredictions()

    expect(report.invalidId).toBe(1)
    expect(report.unresolved).toBe(0)
    expect(report.settledFromDb).toBe(0)
  })

  it("does not spend an MLB API call on a row it can never resolve", async () => {
    findManyPredictions.mockResolvedValue([
      { id: "abc", prediction: "NRFI", date: "2020-05-01" },
    ])

    await settlePendingPredictions()

    expect(fetchGamesByDate).not.toHaveBeenCalled()
  })

  it("still reports a genuinely unresolved row with a valid id", async () => {
    // Valid gamePk, no GameResult, and the API knows nothing about the date.
    findManyPredictions.mockResolvedValue([
      { id: "745804", prediction: "NRFI", date: "2020-05-01" },
    ])

    const report = await settlePendingPredictions()

    expect(report.unresolved).toBe(1)
    expect(report.invalidId).toBe(0)
    expect(fetchGamesByDate).toHaveBeenCalledWith("2020-05-01")
  })

  it("settles from GameResult without touching the MLB API", async () => {
    findManyPredictions.mockResolvedValue([
      { id: "745804", prediction: "YRFI", date: "2020-05-01" },
    ])
    findManyGameResults.mockResolvedValue([{ gamePk: 745804, nrfi: false }])

    const report = await settlePendingPredictions()

    expect(report.settledFromDb).toBe(1)
    expect(report.unresolved).toBe(0)
    expect(fetchGamesByDate).not.toHaveBeenCalled()
    // Only the three settlement fields may be written.
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["745804"] } },
      data: { actualResult: "YRFI", correct: true, status: "complete" },
    })
  })

  it("writes nothing in dryRun mode", async () => {
    findManyPredictions.mockResolvedValue([
      { id: "745804", prediction: "NRFI", date: "2020-05-01" },
    ])
    findManyGameResults.mockResolvedValue([{ gamePk: 745804, nrfi: true }])

    const report = await settlePendingPredictions({ dryRun: true })

    expect(report.settledFromDb).toBe(1)
    expect(updateMany).not.toHaveBeenCalled()
    expect(createMany).not.toHaveBeenCalled()
  })

  it("treats a future-dated game as notDue rather than a failure", async () => {
    const future = "2999-01-01"
    findManyPredictions.mockResolvedValue([
      { id: "745804", prediction: "NRFI", date: future },
    ])

    const report = await settlePendingPredictions()

    expect(report.notDue).toBe(1)
    expect(report.unresolved).toBe(0)
    expect(report.invalidId).toBe(0)
  })
})
