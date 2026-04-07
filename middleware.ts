import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export default auth((req: NextRequest & { auth: { user?: { id?: string; plan?: string | null; emailVerified?: Date | string | null; email?: string } } | null }) => {
  const { pathname } = req.nextUrl
  const session = req.auth
  const isAuthed = !!session?.user
  const hasPlan = !!session?.user?.plan
  const isVerified = !!session?.user?.emailVerified

  // ── Helper ──────────────────────────────────────────────────────────────
  const redirect = (path: string) =>
    NextResponse.redirect(new URL(path, req.url))

  // ── Public auth pages: redirect away if already authenticated with plan ─
  if (pathname === "/login" || pathname === "/register") {
    if (isAuthed && hasPlan) return redirect("/dashboard")
    return NextResponse.next()
  }

  // ── Unverified users: bounce to /verify from everywhere except /verify itself ─
  if (isAuthed && !isVerified && pathname !== "/verify") {
    const email = session?.user?.email ?? ""
    return redirect(`/verify?email=${encodeURIComponent(email)}`)
  }

  // ── Root: gate or pass through ──────────────────────────────────────────
  if (pathname === "/") {
    if (isAuthed && hasPlan) return redirect("/dashboard")
    if (!isAuthed) return redirect("/login")
    // Authed but no plan → let them proceed to onboarding
    return redirect("/onboarding/plans")
  }

  // ── Onboarding: require authentication only ─────────────────────────────
  if (pathname.startsWith("/onboarding")) {
    if (!isAuthed) return redirect("/login")
    // Already completed onboarding → push to dashboard
    if (hasPlan && pathname === "/onboarding/plans") return redirect("/dashboard")
    return NextResponse.next()
  }

  // ── Dashboard and protected app routes: require auth + plan ────────────
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/app")) {
    if (!isAuthed) return redirect("/login")
    if (!hasPlan) return redirect("/onboarding/plans")

    // Forward user context to server components via headers
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set("x-user-id", session.user?.id ?? "")
    requestHeaders.set("x-user-plan", session.user?.plan ?? "")
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, public assets
     * - API routes (handled per-route with auth())
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/).*)",
  ],
}
