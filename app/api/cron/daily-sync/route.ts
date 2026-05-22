/**
 * GET /api/cron/daily-sync
 *
 * Vercel Cron job — runs daily at 09:00 UTC (05:00 ET).
 * Syncs the current month's completed games (and the previous month
 * for the first 3 days of each month to catch any late-arriving games).
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

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET

  // Require CRON_SECRET in production; allow open access in dev for easy testing
  if (process.env.NODE_ENV === "production") {
    if (!cronSecret) {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
    }
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

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

  for (const { year: y, month: m } of monthsToSync) {
    try {
      const res = await fetch(
        `${baseUrl}/api/historical-sync?year=${y}&month=${m}`,
        { headers: { "Content-Type": "application/json" } }
      )
      const data: unknown = await res.json()
      results.push({ year: y, month: m, result: data })
    } catch (err) {
      results.push({ year: y, month: m, result: { error: String(err) } })
    }
  }

  return NextResponse.json({ ok: true, ran: new Date().toISOString(), synced: results })
}
