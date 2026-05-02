// middleware.ts
// Clerk middleware — runs on every request so Clerk can read/write the auth
// session cookie and populate auth() / useAuth() across the app.
//
// Current policy: everything is PUBLIC.
// The dashboard is fully accessible without an account (free-tier preview).
// When you add premium/paywall features, uncomment the protected-route block
// below and add your route patterns there.
//
// Docs: https://clerk.com/docs/references/nextjs/clerk-middleware

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

// ---------------------------------------------------------------------------
// Protected routes (paywall-ready — uncomment when adding premium features)
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
// Public routes — always accessible, even without an account
// ---------------------------------------------------------------------------
// Everything is public by default; only routes matched above would be gated.
const _isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/(.*)",           // all existing API routes stay open
])

export default clerkMiddleware(async (auth, req) => {
  // Protect premium routes
  if (isProtectedRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Run on every path EXCEPT Next.js internals and static assets.
    // The negative lookahead skips _next/*, and common static file extensions.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes so server-side auth() works there too.
    "/(api|trpc)(.*)",
  ],
}
