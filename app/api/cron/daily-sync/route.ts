/**
 * GET /api/cron/daily-sync
 *
 * Vercel Cron job — runs daily at 09:00 UTC (05:00 ET).
 * Syncs the current month's completed games (and the previous month
 * for the first 3 days of each month to catch any late-arriving games),
 * then settles every pending prediction it can find a result for — including
 * ones outside the synced months, which the fan-out alone would never reach.
 *
 * Protected by CRON_SECRET — Vercel injects:
 *   Authorization: Bearer <CRON_SECRET>
 * on every cron invocation. Set CRON_SECRET in your Vercel project's
 * Environment Variables to the same value in vercel.json.
 *
 * When CRON_SECRET is not set the route is allowed in development only
 * (NODE_ENV !== "production") so local testing still works.
 */

import { NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/server/cron-auth"
import { settlePendingPredictions } from "@/lib/server/settle-predictions"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: Request) {
  const denied = checkCronAuth(request)
  if (denied) return denied

  // Resolve current date in ET
  const etDate  = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
  const [yearStr, monthStr, dayStr] = etDate.split("-")
  const year  = parseInt(yearStr)
  const month = parseInt(monthStr)
  const day   = parseInt(dayStr)

  // Sync current month; also sync previous month in the first 3 days
  // (covers games that completed after midnight and weren't caught yesterday)
  const monthsToSync: Array<{ year: number; month: number }> = [{ year, month }]
  if (day <= 3) {
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear  = month === 1 ? year - 1 : year
    monthsToSync.push({ year: prevYear, month: prevMonth })
  }

  // Build base URL from Vercel env vars — handles prod, preview, and local dev
  const baseUrl =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")

  const results: Array<{ year: number; month: number; result: unknown }> = []
  let allOk = true

  for (const { year: y, month: m } of monthsToSync) {
    try {
      const res = await fetch(
        `${baseUrl}/api/historical-sync?year=${y}&month=${m}`,
        {
          headers: {
            "Content-Type": "application/json",
            // historical-sync requires either a Clerk session (not available
            // server-to-server) or this bearer token — without it every
            // invocation 401s and the sync silently never runs.
            "Authorization": `Bearer ${process.env.RECOMPUTE_TOKEN ?? ""}`,
          },
        }
      )
      const data: unknown = await res.json()
      if (!res.ok) allOk = false
      results.push({ year: y, month: m, result: res.ok ? data : { error: `historical-sync returned ${res.status}`, body: data } })
    } catch (err) {
      allOk = false
      results.push({ year: y, month: m, result: { error: String(err) } })
    }
  }

  // Settle AFTER the fan-out, so rows historical-sync just created get scored in
  // the same run. This reaches every pending prediction regardless of month,
  // which the fan-out above deliberately does not — it only ever asks for the
  // current month. Called in-process rather than over HTTP to avoid a second
  // baseUrl/token round trip.
  let settled: unknown
  try {
    settled = await settlePendingPredictions()
  } catch (err) {
    allOk = false
    settled = { error: String(err) }
  }

  const ranAtEt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date())

  return NextResponse.json(
    { ok: allOk, ran: ranAtEt, synced: results, settled },
    { status: allOk ? 200 : 502 }
  )
}
