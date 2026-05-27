// POST /api/stripe/portal
// Creates a Stripe Customer Portal session for billing management.
// Returns { url: string } — the client redirects to this Stripe-hosted URL.

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { stripeCustomerId: true },
  })

  if (!sub?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No Stripe customer found. Subscribe first." },
      { status: 404 }
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${appUrl}/account`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error("[stripe/portal]", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Failed to create portal session" }, { status: 500 })
  }
}
