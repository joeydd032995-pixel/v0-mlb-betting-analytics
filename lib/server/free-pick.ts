// lib/server/free-pick.ts
// pinFreePick() — writes the FreePick table's insert-only pin for the FREE
// tier's one daily pick. Called from every /api/predictions request with a
// non-empty slate; `update: {}` on the upsert guarantees the first write for
// a date wins and later requests can never move it as odds/lineups shift the
// ranking during the day. See CLAUDE.md's FreePick entry for the read-side
// (lib/free-pick-accuracy.ts) fallback story.

import { prisma } from "@/lib/prisma"
import { selectFreePick } from "@/lib/tier-gating"
import { withTimeout } from "@/lib/subscription"
import type { NRFIPrediction } from "@/lib/types"

// It's a single upsert on a unique key, so anything slower than this is a
// stalled connection, not a slow write. Without a bound a hung write holds
// /api/predictions open for the route's full maxDuration (300s) even though
// the pin is meant to be best-effort — see lib/subscription.ts's identical
// rationale for its own DB-call bound, which this reuses.
const PIN_TIMEOUT_MS = 3_000

/**
 * Pins the FREE tier's one daily pick for `date`, first successful write wins.
 *
 * Called from every /api/predictions request that produces a non-empty
 * rawPredictions slate, regardless of the caller's own resolved tier — the
 * pick is a property of the day's slate, not of who is asking. `update: {}`
 * is deliberate: a date that already has a row must be left completely
 * untouched, so a later request the same day can never move the pin even if
 * the ranking drifts as odds/lineups change (matches this codebase's existing
 * convention of leaning on upsert's own idempotency for duplicate-safe writes,
 * e.g. app/api/webhooks/clerk/route.ts, rather than catching a unique-
 * violation error code).
 *
 * Never throws — a persistence failure or timeout here must not break the
 * predictions response for any tier.
 */
export async function pinFreePick(date: string, rawPredictions: NRFIPrediction[]): Promise<string | undefined> {
  const top = selectFreePick(rawPredictions)
  if (!top) return undefined

  try {
    // update:{} means an existing pin is returned untouched, so `row.gameId` is
    // the pin actually in force — which on a date first pinned by the old
    // ranker is NOT `top.gameId`. Returning it lets the caller show the pinned
    // game, keeping the displayed pick and the graded pick identical.
    const row = await withTimeout(
      prisma.freePick.upsert({
        where: { date },
        create: { date, gameId: top.gameId, confidenceScore: top.confidenceScore },
        update: {},
      }),
      PIN_TIMEOUT_MS,
      "free pick pin"
    )
    return row?.gameId ?? top.gameId
  } catch (err) {
    console.error("[pinFreePick]", err)
    // Deliberately undefined, not `top.gameId`: with no pin to honour, gating
    // sorts by conviction and lands on this same game anyway, so returning it
    // would add nothing while implying a pin exists when the write failed.
    return undefined
  }
}
