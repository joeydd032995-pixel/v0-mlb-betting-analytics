import { describe, it, expect } from "vitest"
import { computeFreePickAccuracy, type FreePickRow, type PinnedPickRow } from "@/lib/free-pick-accuracy"

function row(
  date: string,
  confidenceScore: number,
  overrides: Partial<FreePickRow> = {}
): FreePickRow {
  return { date, confidenceScore, status: "complete", correct: true, ...overrides }
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
