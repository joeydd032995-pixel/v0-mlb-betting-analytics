import { type NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { hashPassword } from "@/lib/utils/password"
import { signVerificationToken } from "@/lib/utils/tokens"
import { registerStep1Schema } from "@/lib/validations/auth"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as unknown

    const parsed = registerStep1Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      )
    }

    const { name, email, password } = parsed.data
    const { hearAboutUs, role } = (body as { hearAboutUs?: string; role?: string })

    // Check for existing email
    const existing = db.findByEmail(email)
    if (existing) {
      return NextResponse.json(
        {
          error:
            "An account with this email already exists. Log in instead?",
          code: "EMAIL_EXISTS",
        },
        { status: 409 }
      )
    }

    // Create user
    const hashedPassword = await hashPassword(password)
    const user = db.create({
      name,
      email,
      emailVerified: null,
      hashedPassword,
      image: null,
      plan: null,
      subscriptionStatus: null,
      stripeCustomerId: null,
      stripeSubId: null,
      hearAboutUs: hearAboutUs ?? null,
      role: role ?? null,
    })

    // Generate verification token
    const token = await signVerificationToken(user.id, user.email)
    const verifyUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/auth/verify-email?token=${token}`

    // Send verification email
    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import("resend")
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: process.env.EMAIL_FROM ?? "noreply@yourdomain.com",
          to: email,
          subject: "Verify your email address",
          html: `
            <h2>Welcome${name ? `, ${name}` : ""}!</h2>
            <p>Click the link below to verify your email address. This link expires in 15 minutes.</p>
            <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:6px;">Verify Email</a></p>
            <p>Or copy this URL: <code>${verifyUrl}</code></p>
          `,
        })
      } catch (emailError) {
        console.error("[register] Failed to send verification email:", emailError)
        // Don't fail the registration if email sending fails
      }
    } else {
      // Dev mode: log the verification URL to the console
      console.log(
        `\n[DEV] Email verification URL for ${email}:\n${verifyUrl}\n`
      )
    }

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    console.error("[register] Unexpected error:", error)
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    )
  }
}
