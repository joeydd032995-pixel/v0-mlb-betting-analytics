import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { checkoutSchema } from "@/lib/validations/plans"

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json() as unknown
    const parsed = checkoutSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      )
    }

    const { planId, priceId, billingCycle } = parsed.data
    const userId = session.user.id

    // ── Free plan: activate immediately ─────────────────────────────────
    if (planId === "free") {
      db.update(userId, { plan: "free", subscriptionStatus: "active" })
      return NextResponse.json({ success: true, redirect: "/dashboard" })
    }

    // ── Paid plan: mock or real Stripe ───────────────────────────────────
    if (process.env.ENABLE_STRIPE !== "true") {
      // Mock mode: grant plan immediately without Stripe
      db.update(userId, {
        plan: planId,
        subscriptionStatus: "active",
      })
      return NextResponse.json({
        success: true,
        mock: true,
        redirect: "/dashboard",
      })
    }

    // Real Stripe Checkout
    if (!priceId) {
      return NextResponse.json(
        { error: "priceId is required for paid plans" },
        { status: 400 }
      )
    }

    const { stripe } = await import("@/lib/stripe")
    const user = db.findById(userId)

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer: user?.stripeCustomerId ?? undefined,
      customer_email: user?.stripeCustomerId ? undefined : session.user.email!,
      success_url: `${process.env.NEXTAUTH_URL}/dashboard?checkout=success`,
      cancel_url: `${process.env.NEXTAUTH_URL}/onboarding/plans?checkout=cancelled`,
      metadata: {
        userId,
        planId,
        billingCycle: billingCycle ?? "monthly",
      },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error("[checkout] Error:", error)
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    )
  }
}
