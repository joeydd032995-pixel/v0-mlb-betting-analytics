/**
 * GET /api/cron/settle-results
 *
 * Attaches first-inning results to pending predictions without regenerating
 * them. See lib/server/settle-predictions.ts for why that distinction matters.
 *
 * Also runs at the end of /api/cron/daily-sync, so this route exists for
 * operators: sweeping a backlog that predates the fix, or re-checking a date
 * whose games finished after the nightly cron ran.
 *
 * Query params:
 *   ?lookbackDays=N  — only consider games from the last N days (default: all)
 *   ?dryRun=true     — report what would change, write nothing
 *
 * Auth: Authorization: Bearer <CRON_SECRET> (or "dev" locally).
 */

import { NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/server/cron-auth"
import { settlePendingPredictions } from "@/lib/server/settle-predictions"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: Request) {
  const denied = checkCronAuth(request)
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const lookbackRaw = searchParams.get("lookbackDays")
  const parsedLookback = lookbackRaw != null ? Number(lookbackRaw) : NaN
  const lookbackDays =
    Number.isInteger(parsedLookback) && parsedLookback > 0 ? parsedLookback : undefined

  try {
    const report = await settlePendingPredictions({
      lookbackDays,
      dryRun: searchParams.get("dryRun") === "true",
    })
    return NextResponse.json({ ok: true, ...report })
  } catch (err) {
    console.error("[settle-results] failed:", err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
