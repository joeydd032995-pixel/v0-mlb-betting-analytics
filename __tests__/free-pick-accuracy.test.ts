import { describe, it, expect } from "vitest"
import { computeFreePickAccuracy, type FreePickRow } from "@/lib/free-pick-accuracy"
import type { PinnedPickRow } from "@/lib/types"

// Dates here are pre-CONVICTION_RANKING_SINCE, so the legacy confidenceScore
// ranker applies and nrfiProbability is irrelevant unless a test sets it.
function row(
  date: string,
  confidenceScore: number,
  overrides: Partial<FreePickRow> = {}
): FreePickRow {
  return { date, confidenceScore, nrfiProbability: 0.5, status: "complete", correct: true, ...overrides }
}

function pinned(date: string, overrides: Partial<PinnedPickRow> = {}): PinnedPickRow {
  return { date, status: "complete", correct: true, ...overrides }
}

describe("computeFreePickAccuracy", () => {
  it("scores one pick per date — the highest confidenceScore", () => {
    const result = computeFreePickAccuracy([], [
      row("2026-04-01", 40, { correct: false }),
      row("2026-04-01", 90, { correct: true }),  // the free pick
      row("2026-04-01", 65, { correct: false }),
      row("2026-04-02", 70, { correct: false }), // the free pick
      row("2026-04-02", 55, { correct: true }),
    ])

    expect(result.total).toBe(2)
    expect(result.correct).toBe(1)
    expect(result.accuracy).toBe(0.5)
  })

  // Narrowing the ranking to settled rows first would promote the #2 game and
  // credit the free pick with a prediction it never showed.
  it("contributes nothing for a date whose top pick never settled", () => {
    const result = computeFreePickAccuracy([], [
      row("2026-04-01", 90, { status: "pending", correct: null }),
      row("2026-04-01", 65, { correct: true }),
    ])

    expect(result).toEqual({ total: 0, correct: 0, accuracy: 0, dateSpan: null })
  })

  it("skips a settled-status row that carries no result", () => {
    const result = computeFreePickAccuracy([], [row("2026-04-01", 90, { correct: null })])
    expect(result.total).toBe(0)
  })

  it("spans only the dates that contributed a settled pick", () => {
    const result = computeFreePickAccuracy([], [
      row("2026-04-05", 80),
      row("2026-04-01", 80),
      row("2026-04-09", 80, { status: "pending", correct: null }), // excluded
      row("2026-04-03", 80),
    ])

    expect(result.total).toBe(3)
    expect(result.dateSpan).toEqual({ from: "2026-04-01", to: "2026-04-05" })
  })

  it("reports an empty record rather than dividing by zero", () => {
    expect(computeFreePickAccuracy([], [])).toEqual({
      total: 0,
      correct: 0,
      accuracy: 0,
      dateSpan: null,
    })
  })

  it("counts a perfect and a winless record correctly", () => {
    expect(
      computeFreePickAccuracy([], [row("2026-04-01", 90), row("2026-04-02", 90)]).accuracy
    ).toBe(1)
    expect(
      computeFreePickAccuracy([], [
        row("2026-04-01", 90, { correct: false }),
        row("2026-04-02", 90, { correct: false }),
      ]).accuracy
    ).toBe(0)
  })

  it("does not mutate the rows it is given", () => {
    const rows = [row("2026-04-01", 40), row("2026-04-01", 90)]
    const before = rows.map((r) => r.confidenceScore)
    computeFreePickAccuracy([], rows)
    expect(rows.map((r) => r.confidenceScore)).toEqual(before)
  })

  it("counts a pinned pick independently of any ModelPrediction rows", () => {
    const result = computeFreePickAccuracy([pinned("2026-05-01")], [])
    expect(result.total).toBe(1)
    expect(result.correct).toBe(1)
    expect(result.dateSpan).toEqual({ from: "2026-05-01", to: "2026-05-01" })
  })

  it("treats a pinned pick with no matching ModelPrediction row as unsettled", () => {
    const result = computeFreePickAccuracy(
      [pinned("2026-05-01", { status: null, correct: null })],
      []
    )
    expect(result).toEqual({ total: 0, correct: 0, accuracy: 0, dateSpan: null })
  })

  it("does not double count a date that is both pinned and has legacy rows", () => {
    // The pin says this date's pick was correct; a stale/partial legacy row
    // for the same date disagrees. The pin must win, not the argmax reconstruction.
    const result = computeFreePickAccuracy(
      [pinned("2026-05-01", { correct: true })],
      [row("2026-05-01", 40, { correct: false })]
    )
    expect(result.total).toBe(1)
    expect(result.correct).toBe(1)
  })

  it("merges dateSpan across pinned and legacy dates", () => {
    const result = computeFreePickAccuracy(
      [pinned("2026-05-15")],
      [row("2026-05-01", 80), row("2026-05-30", 80)]
    )
    expect(result.total).toBe(3)
    expect(result.dateSpan).toEqual({ from: "2026-05-01", to: "2026-05-30" })
  })
})

// The ranker in force depends on the DATE, not on whether a pin exists: a pin
// can be missing because the best-effort write timed out, and grading such a
// date with the legacy rule would score a game the visitor was never shown.
describe("fallback ranker follows the cutover date", () => {
  it("uses confidenceScore before the cutover", () => {
    const result = computeFreePickAccuracy([], [
      { date: "2026-08-27", confidenceScore: 90, nrfiProbability: 0.505, status: "complete", correct: true },
      { date: "2026-08-27", confidenceScore: 10, nrfiProbability: 0.700, status: "complete", correct: false },
    ])
    expect(result.correct).toBe(1) // the high-confidenceScore, low-conviction row
  })

  it("uses conviction on and after the cutover", () => {
    const result = computeFreePickAccuracy([], [
      { date: "2026-08-28", confidenceScore: 90, nrfiProbability: 0.505, status: "complete", correct: true },
      { date: "2026-08-28", confidenceScore: 10, nrfiProbability: 0.700, status: "complete", correct: false },
    ])
    expect(result.correct).toBe(0) // the high-conviction row, which is what was shown
  })
})
