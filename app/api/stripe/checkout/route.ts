// POST /api/stripe/checkout
// Creates a Stripe Checkout session for a subscription upgrade.
// Returns { url: string } — the client redirects to this Stripe-hosted URL.

import { NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let priceId: string
  try {
    const body = await req.json()
    priceId = body?.priceId
    if (!priceId || typeof priceId !== "string") throw new Error("missing priceId")
  } catch {
    return NextResponse.json({ error: "Invalid request body — priceId required" }, { status: 400 })
  }

  // Only allow known price IDs to prevent passing arbitrary Stripe prices
  const ALLOWED_PRICE_IDS = new Set([
    process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_ELITE_MONTHLY_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_ELITE_ANNUAL_PRICE_ID,
  ].filter(Boolean))
  if (ALLOWED_PRICE_IDS.size > 0 && !ALLOWED_PRICE_IDS.has(priceId)) {
    return NextResponse.json({ error: "Invalid price ID" }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

  try {
    // Ensure the user exists in our DB (Clerk webhook may not have fired yet)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    })

    // Guard: if User row doesn't exist (Clerk webhook race), create it now
    if (!user) {
      const clerk = await clerkClient()
      const cu = await clerk.users.getUser(userId)
      const email = cu.emailAddresses[0]?.emailAddress ?? `${userId}@placeholder.invalid`
      await prisma.user.upsert({
        where: { id: userId },
        create: { id: userId, email },
        update: {},
      })
    }

    // Reuse existing Stripe customer ID if one was already created
    const sub = await prisma.subscription.findUnique({
      where: { userId },
      select: { stripeCustomerId: true },
    })
    let customerId = sub?.stripeCustomerId ?? null

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user?.email ?? undefined,
        metadata: { clerkUserId: userId },
      })
      customerId = customer.id

      // Persist the customer ID immediately so we don't create duplicates
      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          stripeCustomerId: customerId,
          tier: "FREE",
          status: "inactive",
        },
        update: { stripeCustomerId: customerId },
      })
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/?checkout=success`,
      cancel_url: `${appUrl}/pricing?checkout=canceled`,
      // clerkUserId in subscription metadata lets the webhook link back to our user
      subscription_data: {
        metadata: { clerkUserId: userId },
      },
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error("[stripe/checkout]", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 })
  }
}
