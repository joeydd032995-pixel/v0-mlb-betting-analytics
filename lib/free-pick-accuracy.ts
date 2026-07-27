// lib/free-pick-accuracy.ts
// Reconstructs the track record of the FREE tier's one daily pick.
//
// The free pick is not persisted anywhere: applyTierGating derives it on every
// request as the highest-confidenceScore prediction of the day's slate. So the
// only way to answer "how has the free pick done?" is to replay that same rule
// over stored predictions — which is why the selection goes through
// selectFreePick rather than a local copy of the comparator.
//
// Kept separate from the route so it can be unit-tested without a database.

import { selectFreePick } from "@/lib/tier-gating"
import type { FreePickAccuracy } from "@/lib/types"

/** The minimal ModelPrediction projection this needs. */
export interface FreePickRow {
  date: string
  confidenceScore: number
  status: string
  correct: boolean | null
}

/**
 * Groups rows by ET date, takes the free pick of each date, and scores the ones
 * that have settled.
 *
 * Callers are responsible for excluding backtested rows — this counts whatever
 * it is given.
 */
export function computeFreePickAccuracy(rows: FreePickRow[]): FreePickAccuracy {
  const byDate = new Map<string, FreePickRow[]>()
  for (const row of rows) {
    const forDate = byDate.get(row.date)
    if (forDate) forDate.push(row)
    else byDate.set(row.date, [row])
  }

  let total = 0
  let correct = 0
  let from: string | null = null
  let to: string | null = null

  for (const [date, forDate] of byDate) {
    // Rank the full slate, settled or not. A visitor saw the top-confidence
    // game whether or not it later resolved, so narrowing the ranking to
    // settled rows first would silently promote the #2 pick on any date with a
    // postponement — crediting the free pick with a game it never showed.
    const pick = selectFreePick(forDate)
    if (!pick) continue
    if (pick.status !== "complete" || pick.correct === null) continue

    total += 1
    if (pick.correct) correct += 1
    if (from === null || date < from) from = date
    if (to === null || date > to) to = date
  }

  return {
    total,
    correct,
    accuracy: total > 0 ? correct / total : 0,
    dateSpan: from !== null && to !== null ? { from, to } : null,
  }
}
