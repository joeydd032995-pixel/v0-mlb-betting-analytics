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
const fetchGameLinescore = vi.fn()
vi.mock("@/lib/api/mlb-stats", () => ({
  fetchGamesByDate: (...args: unknown[]) => fetchGamesByDate(...args),
  fetchGameLinescore: (...args: unknown[]) => fetchGameLinescore(...args),
}))

/** Minimal MLB schedule entry. */
function game(gamePk: number, abstractGameState: string, detailedState = abstractGameState) {
  return {
    gamePk,
    status: { abstractGameState, detailedState },
    teams: { home: { team: { name: "Home" } }, away: { team: { name: "Away" } } },
  }
}

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
    fetchGameLinescore.mockResolvedValue(null)
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

  it("counts an unfinished game as awaitingResult, not unresolved", async () => {
    // Every one of today's games sits here until the last out. Reporting them
    // as unresolved would keep that field permanently non-zero.
    findManyPredictions.mockResolvedValue([
      { id: "745804", prediction: "NRFI", date: "2020-05-01" },
    ])
    fetchGamesByDate.mockResolvedValue([game(745804, "Preview")])

    const report = await settlePendingPredictions()

    expect(report.awaitingResult).toBe(1)
    expect(report.unresolved).toBe(0)
    expect(report.noResultPossible).toBe(0)
  })

  it("counts a postponed game as noResultPossible", async () => {
    // Postponed and cancelled games report abstract state 'Final' but were
    // never played, so there is no NRFI/YRFI to record — ever.
    findManyPredictions.mockResolvedValue([
      { id: "745804", prediction: "NRFI", date: "2020-05-01" },
    ])
    fetchGamesByDate.mockResolvedValue([game(745804, "Final", "Postponed")])
    fetchGameLinescore.mockResolvedValue(null)

    const report = await settlePendingPredictions()

    expect(report.noResultPossible).toBe(1)
    expect(report.unresolved).toBe(0)
    expect(report.settledFromApi).toBe(0)
  })

  it("does not mistake an unavailable linescore for a game that was never played", async () => {
    // fetchGameLinescore returns null both for a game with no innings AND for a
    // transport failure. A genuinely-final game whose linescore we couldn't
    // fetch is an anomaly worth surfacing, not a permanent 'can't settle'.
    findManyPredictions.mockResolvedValue([
      { id: "745804", prediction: "NRFI", date: "2020-05-01" },
    ])
    fetchGamesByDate.mockResolvedValue([game(745804, "Final", "Final")])
    fetchGameLinescore.mockResolvedValue(null)

    const report = await settlePendingPredictions()

    expect(report.unresolved).toBe(1)
    expect(report.noResultPossible).toBe(0)
  })

  it("never settles an unfinished game from its placeholder linescore", async () => {
    // A Preview/Pre-Game linescore reports a first inning of 0-0. Trusting it
    // would settle unplayed games as NRFI, so the final-state filter has to
    // keep the linescore from being read at all.
    findManyPredictions.mockResolvedValue([
      { id: "745804", prediction: "NRFI", date: "2020-05-01" },
    ])
    fetchGamesByDate.mockResolvedValue([game(745804, "Preview")])
    fetchGameLinescore.mockResolvedValue({
      innings: [{ num: 1, home: { runs: 0 }, away: { runs: 0 } }],
    })

    const report = await settlePendingPredictions()

    expect(report.settledFromApi).toBe(0)
    expect(report.awaitingResult).toBe(1)
    expect(updateMany).not.toHaveBeenCalled()
    expect(fetchGameLinescore).not.toHaveBeenCalled()
  })

  it("settles a genuinely final game from the API and backfills GameResult", async () => {
    findManyPredictions.mockResolvedValue([
      { id: "745804", prediction: "NRFI", date: "2020-05-01" },
    ])
    fetchGamesByDate.mockResolvedValue([game(745804, "Final")])
    fetchGameLinescore.mockResolvedValue({
      innings: [{ num: 1, home: { runs: 0 }, away: { runs: 2 } }],
    })
    createMany.mockResolvedValue({ count: 1 })

    const report = await settlePendingPredictions()

    expect(report.settledFromApi).toBe(1)
    expect(report.gameResultsCreated).toBe(1)
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["745804"] } },
      data: { actualResult: "YRFI", correct: false, status: "complete" },
    })
  })

  it("reserves unresolved for a final game the API knows nothing about", async () => {
    findManyPredictions.mockResolvedValue([
      { id: "745804", prediction: "NRFI", date: "2020-05-01" },
    ])
    // Schedule returns a different game entirely — ours is simply missing.
    fetchGamesByDate.mockResolvedValue([game(999999, "Final")])
    fetchGameLinescore.mockResolvedValue({
      innings: [{ num: 1, home: { runs: 0 }, away: { runs: 0 } }],
    })

    const report = await settlePendingPredictions()

    expect(report.unresolved).toBe(1)
    expect(report.awaitingResult).toBe(0)
    expect(report.noResultPossible).toBe(0)
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
