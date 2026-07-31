// lib/server/cron-auth.ts
// Shared bearer check for Vercel Cron routes.
//
// Vercel injects `Authorization: Bearer <CRON_SECRET>` on every cron invocation.
// In development the secret is usually unset, so "dev" is accepted — but a
// header is still required, because .env.local frequently points at the
// production database and an unauthenticated GET should not be able to write to it.

import { timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"

/**
 * Constant-time string comparison.
 *
 * `timingSafeEqual` throws when the buffers differ in length, so the length is
 * checked first — that leaks the secret's length, which is not sensitive, while
 * keeping the content comparison constant-time.
 */
function secureEquals(a: string | null, b: string): boolean {
  if (a == null) return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

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
    if (!secureEquals(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return null
  }

  const devToken = cronSecret ?? "dev"
  if (!secureEquals(authHeader, `Bearer ${devToken}`)) {
    return NextResponse.json(
      { error: "Dev cron requires Authorization: Bearer <CRON_SECRET or 'dev'>" },
      { status: 401 }
    )
  }
  return null
}
