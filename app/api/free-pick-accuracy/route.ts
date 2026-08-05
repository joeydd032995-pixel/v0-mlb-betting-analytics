/**
 * GET /api/free-pick-accuracy
 *
 * Track record of the FREE tier's one daily pick, for the KPI card on the home
 * page. Public and unauthenticated on purpose: signed-out visitors are the
 * audience the free pick exists to persuade, so they are exactly who needs to
 * see how it has performed.
 *
 * Hybrid reconstruction: /api/predictions pins the pick going forward (one
 * FreePick row per ET date, written on the first non-empty slate for that
 * date — see lib/server/free-pick.ts). A date with a pinned row is graded
 * from that exact game's ModelPrediction row. A date with no pinned row
 * (every date before FreePick existed, or one where every pin attempt hit a
 * DB error) falls back to the legacy reconstruction: replaying selectFreePick
 * as an argmax over that date's stored ModelPrediction rows. Both
 * contributions are merged by computeFreePickAccuracy.
 *
 * Returns: { total, correct, accuracy, dateSpan: { from, to } | null }
 *
 * The legacy fallback keeps its original caveats, both inherent to there
 * being no pin for that date:
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
import { loadFreePickAccuracy } from "@/lib/server/free-pick-accuracy-query"

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
    // rate and would misrepresent picks actually shown on the site. Reused for
    // both the pinned-row settlement lookup and the legacy fallback below, so a
    // pinned game whose only row happens to be backtested is correctly treated
    // as "not yet settled" rather than graded off a backtest-quality row.
    // Query + reconstruction live in lib/server/free-pick-accuracy-query.ts so
    // the chat assistant's get_model_accuracy tool reports the same number.
    return NextResponse.json(await loadFreePickAccuracy(), { headers: PUBLIC_CACHE_HEADERS })
  } catch (err) {
    console.error("[free-pick-accuracy]", err)
    return NextResponse.json({ error: "Failed to compute free pick accuracy" }, { status: 500 })
  }
}
