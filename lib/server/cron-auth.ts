// lib/server/cron-auth.ts
// Shared bearer check for Vercel Cron routes.
//
// Vercel injects `Authorization: Bearer <CRON_SECRET>` on every cron invocation.
// In development the secret is usually unset, so "dev" is accepted — but a
// header is still required, because .env.local frequently points at the
// production database and an unauthenticated GET should not be able to write to it.

import { NextResponse } from "next/server"

/**
 * Returns a response to send back when the caller is not authorised, or `null`
 * when the request may proceed.
 */
export function checkCronAuth(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")

  if (process.env.NODE_ENV === "production") {
    if (!cronSecret) {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return null
  }

  const devToken = cronSecret ?? "dev"
  if (authHeader !== `Bearer ${devToken}`) {
    return NextResponse.json(
      { error: "Dev cron requires Authorization: Bearer <CRON_SECRET or 'dev'>" },
      { status: 401 }
    )
  }
  return null
}
