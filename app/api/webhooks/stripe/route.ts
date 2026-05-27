// POST /api/webhooks/stripe
// Handles Stripe webhook events to keep subscription state in sync.
// NOTE: This endpoint MUST bypass Clerk middleware (no Clerk session from Stripe).
//       Body parsing must use req.text() to preserve the raw body for signature verification.

import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { priceIdToTier } from "@/lib/subscription"
import type Stripe from "stripe"

export const dynamic = "force-dynamic"

// Stripe requires the raw body string for signature verification —
// do NOT use req.json() or Next.js will pre-parse and break verification.
async function getRawBody(req: Request): Promise<string> {
  return req.text()
}

async function handleSubscriptionUpsert(subscription: Stripe.Subscription) {
  const clerkUserId =
    subscription.metadata?.clerkUserId ?? null

  if (!clerkUserId) {
    console.warn("[stripe-webhook] Subscription missing clerkUserId metadata:", subscription.id)
    return
  }

  const firstItem = subscription.items.data[0]
  const priceId = firstItem?.price.id ?? null
  const tier = priceIdToTier(priceId)

  // In Stripe API 2026+, current_period_end lives on the subscription item, not the subscription.
  const periodEndTs = firstItem?.current_period_end ?? null
  const currentPeriodEnd = periodEndTs ? new Date(periodEndTs * 1000) : null

  await prisma.subscription.upsert({
    where: { userId: clerkUserId },
    create: {
      userId: clerkUserId,
      stripeCustomerId: subscription.customer as string,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      tier,
      status: subscription.status,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    update: {
      stripeCustomerId: subscription.customer as string,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      tier,
      status: subscription.status,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  })
}

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set")
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
  }

  const body = await getRawBody(req)
  const sig = req.headers.get("stripe-signature") ?? ""

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  try {
    switch (event.type) {
      // Checkout completed — retrieve the full subscription object and upsert
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode === "subscription" && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string)
          await handleSubscriptionUpsert(sub)
        }
        break
      }

      // Subscription updated (plan change, renewal, card updated, etc.)
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        await handleSubscriptionUpsert(event.data.object as Stripe.Subscription)
        break
      }

      // Subscription cancelled (immediately or at period end then finally deleted)
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription
        const clerkUserId = sub.metadata?.clerkUserId
        if (clerkUserId) {
          await prisma.subscription.updateMany({
            where: { userId: clerkUserId },
            data: {
              tier: "FREE",
              status: "canceled",
              cancelAtPeriodEnd: false,
            },
          })
        }
        break
      }

      default:
        // Silently ignore unhandled event types
        break
    }
  } catch (err) {
    console.error(`[stripe-webhook] DB error processing ${event.type}:`, err instanceof Error ? err.message : err)
    // Return 500 so Stripe will retry
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
