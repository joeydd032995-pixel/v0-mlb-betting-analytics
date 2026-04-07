import { type NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { signVerificationToken } from "@/lib/utils/tokens"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { email?: string }
    const email = body.email?.trim()

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const user = db.findByEmail(email)

    // Don't reveal whether the email exists or not
    if (!user || user.emailVerified) {
      return NextResponse.json({ success: true })
    }

    const token = await signVerificationToken(user.id, user.email)
    const verifyUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/auth/verify-email?token=${token}`

    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import("resend")
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: process.env.EMAIL_FROM ?? "noreply@yourdomain.com",
          to: email,
          subject: "Verify your email address",
          html: `
            <h2>Email verification</h2>
            <p>Click the link below to verify your email. This link expires in 15 minutes.</p>
            <p><a href="${verifyUrl}">Verify Email</a></p>
          `,
        })
      } catch (err) {
        console.error("[resend-verification] Email error:", err)
      }
    } else {
      console.log(`\n[DEV] Resent verification URL for ${email}:\n${verifyUrl}\n`)
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    )
  }
}
