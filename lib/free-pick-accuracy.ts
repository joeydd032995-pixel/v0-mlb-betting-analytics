// lib/free-pick-accuracy.ts
// Hybrid track record of the FREE tier's one daily pick.
//
// The pick is pinned going forward: /api/predictions (via lib/server/free-pick.ts)
// inserts one FreePick row per ET date the first time that date's non-empty
// slate is computed, insert-only so the pin can't drift as odds/lineups move
// later in the day. Any date with no pinned row — every date before the
// FreePick table existed, or a date where every pin attempt hit a DB error —
// falls back to the pre-existing reconstruction: replaying selectFreePick as
// an argmax over stored ModelPrediction rows for that date. Both
// contributions are merged into one accuracy record here.
//
// Kept separate from the route so it can be unit-tested without a database.

import { selectFreePick } from "@/lib/tier-gating"
import type { FreePickAccuracy, PinnedPickRow } from "@/lib/types"

/** The minimal ModelPrediction projection the legacy (unpinned) path needs. */
export interface FreePickRow {
  date: string
  confidenceScore: number
  status: string
  correct: boolean | null
}

interface Acc {
  total: number
  correct: number
  from: string | null
  to: string | null
}

function record(acc: Acc, date: string, status: string | null, correct: boolean | null): void {
  if (status !== "complete" || correct === null) return
  acc.total += 1
  if (correct) acc.correct += 1
  if (acc.from === null || date < acc.from) acc.from = date
  if (acc.to === null || date > acc.to) acc.to = date
}

/**
 * Merges pinned picks with the legacy argmax reconstruction for any date that
 * has no pin.
 *
 * `legacyRows` should already exclude any date present in `pinnedRows` (the
 * route does this with a single query); this function also defensively
 * re-excludes them so a caller that forgets cannot double-count a date.
 */
export function computeFreePickAccuracy(
  pinnedRows: PinnedPickRow[],
  legacyRows: FreePickRow[]
): FreePickAccuracy {
  const acc: Acc = { total: 0, correct: 0, from: null, to: null }
  const pinnedDates = new Set(pinnedRows.map((p) => p.date))

  for (const p of pinnedRows) record(acc, p.date, p.status, p.correct)

  const byDate = new Map<string, FreePickRow[]>()
  for (const row of legacyRows) {
    if (pinnedDates.has(row.date)) continue // defensive: a pin always wins for its date
    const forDate = byDate.get(row.date)
    if (forDate) forDate.push(row)
    else byDate.set(row.date, [row])
  }

  for (const [date, forDate] of byDate) {
    // Rank the full slate, settled or not. A visitor saw the top-confidence
    // game whether or not it later resolved, so narrowing the ranking to
    // settled rows first would silently promote the #2 pick on any date with a
    // postponement — crediting the free pick with a game it never showed.
    const pick = selectFreePick(forDate)
    if (!pick) continue
    record(acc, date, pick.status, pick.correct)
  }

  return {
    total: acc.total,
    correct: acc.correct,
    accuracy: acc.total > 0 ? acc.correct / acc.total : 0,
    dateSpan: acc.from !== null && acc.to !== null ? { from: acc.from, to: acc.to } : null,
  }
}
