import { type NextRequest, NextResponse } from "next/server"
import { verifyEmailToken } from "@/lib/utils/tokens"
import { db } from "@/lib/db"

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")

  if (!token) {
    return NextResponse.redirect(
      new URL("/login?error=missing-token", request.url)
    )
  }

  try {
    const payload = await verifyEmailToken(token)
    const user = db.findById(payload.sub)

    if (!user) {
      return NextResponse.redirect(
        new URL("/login?error=invalid-token", request.url)
      )
    }

    if (user.emailVerified) {
      // Already verified — just send them to login
      return NextResponse.redirect(
        new URL(
          `/login?verified=true&email=${encodeURIComponent(user.email)}`,
          request.url
        )
      )
    }

    // Mark email as verified
    db.update(user.id, { emailVerified: new Date() })

    // Redirect to login with a flag so LoginForm can show a success message
    // and pre-fill the email. The user still needs to sign in with their
    // credentials — this is the safest pattern from a GET route.
    return NextResponse.redirect(
      new URL(
        `/login?verified=true&email=${encodeURIComponent(user.email)}`,
        request.url
      )
    )
  } catch {
    return NextResponse.redirect(
      new URL("/login?error=invalid-token", request.url)
    )
  }
}
