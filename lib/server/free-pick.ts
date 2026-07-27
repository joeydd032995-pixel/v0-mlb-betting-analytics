import { prisma } from "@/lib/prisma"
import { selectFreePick } from "@/lib/tier-gating"
import type { NRFIPrediction } from "@/lib/types"

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
 * Never throws — a persistence failure here must not break the predictions
 * response for any tier.
 */
export async function pinFreePick(date: string, rawPredictions: NRFIPrediction[]): Promise<void> {
  const top = selectFreePick(rawPredictions)
  if (!top) return

  try {
    await prisma.freePick.upsert({
      where: { date },
      create: { date, gameId: top.gameId, confidenceScore: top.confidenceScore },
      update: {},
    })
  } catch (err) {
    console.error("[pinFreePick]", err)
  }
}
