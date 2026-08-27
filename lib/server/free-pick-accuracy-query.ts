// lib/server/free-pick-accuracy-query.ts
// The DB read + hybrid reconstruction behind the FREE tier's pick track record.
//
// Extracted so /api/free-pick-accuracy and the chat assistant's
// get_model_accuracy tool derive the number the same way. The reconstruction
// rule (a pin always wins for its date; dates without one replay
// selectFreePick over stored rows) must not exist in two places — see the
// header of app/api/free-pick-accuracy/route.ts for its caveats.
import { prisma } from "@/lib/prisma"
import { computeFreePickAccuracy, type FreePickRow } from "@/lib/free-pick-accuracy"
import type { FreePickAccuracy, PinnedPickRow } from "@/lib/types"

export async function loadFreePickAccuracy(): Promise<FreePickAccuracy> {
  // Live rows only: backtested backfills are scored from current-season stats
  // with synthetic weather and no odds, which pulls accuracy toward the base
  // rate and would misrepresent picks actually shown on the site.
  const [pins, allRows] = await Promise.all([
    prisma.freePick.findMany({ select: { date: true, gameId: true } }),
    prisma.modelPrediction.findMany({
      where: { backtested: false },
      select: { id: true, date: true, confidenceScore: true, nrfiProbability: true, status: true, correct: true },
    }),
  ])

  const byId = new Map(allRows.map((r) => [r.id, r]))
  const pinnedRows: PinnedPickRow[] = pins.map((p) => {
    const row = byId.get(p.gameId)
    return { date: p.date, status: row?.status ?? null, correct: row?.correct ?? null }
  })

  const pinnedDates = new Set(pins.map((p) => p.date))
  const legacyRows: FreePickRow[] = allRows
    .filter((r) => !pinnedDates.has(r.date))
    .map((r) => ({ date: r.date, confidenceScore: r.confidenceScore, nrfiProbability: r.nrfiProbability, status: r.status, correct: r.correct }))

  return computeFreePickAccuracy(pinnedRows, legacyRows)
}
