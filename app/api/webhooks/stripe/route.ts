// app/api/webhooks/stripe/route.ts
// Stripe webhook endpoint — syncs subscription state to the DB and
// updates Clerk's publicMetadata so the subscription tier is available
// in the JWT on the next session refresh.
//
// Registered events (configure in Stripe Dashboard → Developers → Webhooks):
//   checkout.session.completed
//   customer.subscription.created
//   customer.subscription.updated
//   customer.subscription.deleted
//   invoice.payment_failed
//
// The raw request body must be read without parsing so Stripe can verify
// the signature — Next.js App Router's route handlers do NOT buffer the body
// automatically, so we use req.text().

import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { db, usersSubscriptions } from "@/lib/db"
import { eq } from "drizzle-orm"
import { clerkClient } from "@clerk/nextjs/server"

// ---------------------------------------------------------------------------
// Stripe client
// ---------------------------------------------------------------------------
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set")
  return new Stripe(key, { apiVersion: "2023-10-16" })
}

// ---------------------------------------------------------------------------
// Tier map: Stripe price ID → internal tier name
// ---------------------------------------------------------------------------
// Built lazily so env vars are resolved at request time (not module load time).
function getPriceTierMap(): Record<string, string> {
  return {
    [process.env.STRIPE_PRICE_DAILY   ?? "__unset_daily__"]:   "daily",
    [process.env.STRIPE_PRICE_WEEKLY  ?? "__unset_weekly__"]:  "weekly",
    [process.env.STRIPE_PRICE_MONTHLY ?? "__unset_monthly__"]: "monthly",
    [process.env.STRIPE_PRICE_ANNUAL  ?? "__unset_annual__"]:  "annual",
  }
}

// ---------------------------------------------------------------------------
// syncSubscription
// ---------------------------------------------------------------------------
// Upserts the subscription row in the DB and updates Clerk's publicMetadata
// so the tier is available in the session JWT.
async function syncSubscription(
  subscription: Stripe.Subscription,
  clerkUserId: string
): Promise<void> {
  const priceId = subscription.items.data[0]?.price.id ?? ""
  const tierMap  = getPriceTierMap()
  const tier     = tierMap[priceId] ?? "free"
  const isActive = subscription.status === "active" || subscription.status === "trialing"
  const activeTier = isActive ? tier : "free"

  // Upsert subscription row
  await db
    .insert(usersSubscriptions)
    .values({
      clerkId:              clerkUserId,
      stripeCustomerId:     typeof subscription.customer === "string"
                              ? subscription.customer
                              : subscription.customer.id,
      stripeSubscriptionId: subscription.id,
      priceId,
      tier:                 activeTier,
      status:               subscription.status,
      currentPeriodEnd:     new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd:    subscription.cancel_at_period_end,
      updatedAt:            new Date(),
    })
    .onConflictDoUpdate({
      target: usersSubscriptions.clerkId,
      set: {
        stripeCustomerId:     typeof subscription.customer === "string"
                                ? subscription.customer
                                : subscription.customer.id,
        stripeSubscriptionId: subscription.id,
        priceId,
        tier:                 activeTier,
        status:               subscription.status,
        currentPeriodEnd:     new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd:    subscription.cancel_at_period_end,
        updatedAt:            new Date(),
      },
    })

  // Sync to Clerk publicMetadata for JWT-level access
  try {
    const clerk = await clerkClient()
    await clerk.users.updateUserMetadata(clerkUserId, {
      publicMetadata: { subscriptionTier: activeTier },
    })
  } catch (err) {
    console.error("[stripe-webhook] Failed to update Clerk metadata:", err)
  }
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set")
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 })
  }

  const body = await req.text()
  const sig  = req.headers.get("stripe-signature")

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 })
  }

  const stripe = getStripe()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  try {
    switch (event.type) {
      // ── New subscription via Checkout ───────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== "subscription") break

        const clerkUserId = session.metadata?.clerkUserId
        if (!clerkUserId) {
          console.warn("[stripe-webhook] checkout.session.completed missing clerkUserId in metadata")
          break
        }

        const subscriptionId = session.subscription as string
        const subscription   = await stripe.subscriptions.retrieve(subscriptionId)
        await syncSubscription(subscription, clerkUserId)
        break
      }

      // ── Subscription created / updated (plan change, renewal, trial end) ─
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription
        const clerkUserId  = subscription.metadata?.clerkUserId
        if (!clerkUserId) {
          console.warn(`[stripe-webhook] ${event.type} missing clerkUserId in metadata`)
          break
        }
        await syncSubscription(subscription, clerkUserId)
        break
      }

      // ── Subscription canceled ────────────────────────────────────────────
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        const clerkUserId  = subscription.metadata?.clerkUserId
        if (!clerkUserId) break

        await db
          .update(usersSubscriptions)
          .set({ tier: "free", status: "canceled", updatedAt: new Date() })
          .where(eq(usersSubscriptions.clerkId, clerkUserId))

        try {
          const clerk = await clerkClient()
          await clerk.users.updateUserMetadata(clerkUserId, {
            publicMetadata: { subscriptionTier: "free" },
          })
        } catch (err) {
          console.error("[stripe-webhook] Failed to update Clerk metadata on deletion:", err)
        }
        break
      }

      // ── Payment failed (mark past_due so the UI can warn the user) ───────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice
        if (!invoice.subscription) break

        const subscription = await stripe.subscriptions.retrieve(
          invoice.subscription as string
        )
        const clerkUserId = subscription.metadata?.clerkUserId
        if (!clerkUserId) break

        await db
          .update(usersSubscriptions)
          .set({ status: "past_due", updatedAt: new Date() })
          .where(eq(usersSubscriptions.clerkId, clerkUserId))
        break
      }

      default:
        // Ignore unhandled event types
        break
    }
  } catch (err) {
    console.error("[stripe-webhook] Handler error:", err)
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
