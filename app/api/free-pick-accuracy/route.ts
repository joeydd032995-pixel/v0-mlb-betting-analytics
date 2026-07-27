/**
 * GET /api/free-pick-accuracy
 *
 * Track record of the FREE tier's one daily pick, for the KPI card on the home
 * page. Public and unauthenticated on purpose: signed-out visitors are the
 * audience the free pick exists to persuade, so they are exactly who needs to
 * see how it has performed.
 *
 * The pick itself is never stored — applyTierGating derives it per request as
 * the highest-confidenceScore game of the slate — so this replays that rule
 * over ModelPrediction rows via computeFreePickAccuracy.
 *
 * Returns: { total, correct, accuracy, dateSpan: { from, to } | null }
 *
 * Two caveats on the reconstruction, both inherent to there being no stored
 * free pick:
 *
 *  1. It is only exact for dates where the DB holds the FULL slate. Rows arrive
 *     via savePredictionsToDBAction (a signed-in user's visible slate — only
 *     PRO/ELITE see every game) and /api/historical-sync. A date nobody covered
 *     is simply absent; a partially covered one can name the wrong pick.
 *  2. confidenceScore is recorded at ingest time, and the live ranking can
 *     shift during the day as lineups and odds move, so the stored winner is
 *     the pick as of ingest rather than necessarily the one on screen at first
 *     pitch.
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { computeFreePickAccuracy } from "@/lib/free-pick-accuracy"

export const dynamic = "force-dynamic"

// Unlike the prediction routes, this body is identical for every caller — no
// tier gating, no per-user content — so the shared-cache hazard that
// lib/cache-headers.ts warns about does not apply here, and a CDN cache is
// worth having on a public landing page. Do NOT add per-user data to this
// response without changing these headers.
const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
} as const

export async function GET() {
  try {
    // Live rows only: backtested backfills are scored from current-season stats
    // with synthetic weather and no odds, which pulls accuracy toward the base
    // rate and would misrepresent picks actually shown on the site.
    const rows = await prisma.modelPrediction.findMany({
      where: { backtested: false },
      select: { date: true, confidenceScore: true, status: true, correct: true },
    })

    return NextResponse.json(computeFreePickAccuracy(rows), { headers: PUBLIC_CACHE_HEADERS })
  } catch (err) {
    console.error("[free-pick-accuracy]", err)
    return NextResponse.json({ error: "Failed to compute free pick accuracy" }, { status: 500 })
  }
}
