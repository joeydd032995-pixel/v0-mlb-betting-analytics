// middleware.ts
// Runs on every request. Responsibilities:
//   1. Clerk session — reads/writes auth cookie so auth() / useAuth() work server-side.
//   2. Route protection — redirects unauthenticated users away from private pages.
//   3. Rate limiting — throttles public API endpoints when Upstash is configured.
//
// Docs: https://clerk.com/docs/references/nextjs/clerk-middleware

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getRateLimiter, applyRateLimit } from "@/lib/rate-limit"

// ---------------------------------------------------------------------------
// Protected routes — require a valid Clerk session; redirect to /sign-in otherwise
// ---------------------------------------------------------------------------
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",      // user dashboard with watchlist
  "/bets(.*)",           // bet tracker
  "/watchlist(.*)",      // game watchlist
  "/bankroll(.*)",       // bankroll management
  "/history(.*)",        // prediction history
  "/accuracy(.*)",       // model accuracy
  "/insights(.*)",       // betting insights
  "/api/premium(.*)",    // future: gated prediction data
  "/api/admin(.*)",      // future: admin dashboard
  "/account(.*)",        // future: subscription management
])

// ---------------------------------------------------------------------------
// Rate-limited public API routes — throttled per IP when Upstash is configured
// ---------------------------------------------------------------------------
const isRateLimitedRoute = createRouteMatcher([
  "/api/predictions(.*)",
  "/api/results(.*)",
  "/api/games(.*)",
  "/api/historical-sync(.*)",
])

export default clerkMiddleware(async (auth, req) => {
  // 1. Enforce auth on protected pages/routes
  if (isProtectedRoute(req)) {
    await auth.protect()
  }

  // 2. Rate-limit public API endpoints (no-op when Upstash is not configured)
  if (isRateLimitedRoute(req)) {
    const limiter = getRateLimiter()
    if (limiter) {
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        req.headers.get("x-real-ip") ??
        "anonymous"

      const limited = await applyRateLimit(ip, limiter)
      if (limited) return limited
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    // Run on every path EXCEPT Next.js internals and static assets.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes so server-side auth() works there too.
    "/(api|trpc)(.*)",
  ],
}
