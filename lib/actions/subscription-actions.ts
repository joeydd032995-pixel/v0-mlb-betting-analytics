"use server"
// lib/actions/subscription-actions.ts
// Server Actions for subscription management: read tier, create Stripe
// Checkout sessions, and open the Customer Portal for plan management.
//
// All functions require the user to be authenticated via Clerk.

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import Stripe from "stripe"
import { db, usersSubscriptions } from "@/lib/db"
import { eq } from "drizzle-orm"
import type { SubscriptionTier } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Stripe client (server-only — never exposed to the browser)
// ---------------------------------------------------------------------------
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set")
  return new Stripe(key, { apiVersion: "2023-10-16" })
}

// Map tier name → Stripe price ID (env vars, server-only)
const TIER_PRICE: Record<string, string | undefined> = {
  daily:   process.env.STRIPE_PRICE_DAILY,
  weekly:  process.env.STRIPE_PRICE_WEEKLY,
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  annual:  process.env.STRIPE_PRICE_ANNUAL,
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

// ---------------------------------------------------------------------------
// getSubscriptionTier
// ---------------------------------------------------------------------------
// Reads the current user's subscription tier from the DB.
// Returns 'free' for unauthenticated users and users with no active subscription.
// Gracefully degrades to 'free' if the DB is not yet configured.
export async function getSubscriptionTier(): Promise<SubscriptionTier> {
  const { userId } = await auth()
  if (!userId) return "free"

  try {
    const rows = await db
      .select({
        tier:   usersSubscriptions.tier,
        status: usersSubscriptions.status,
      })
      .from(usersSubscriptions)
      .where(eq(usersSubscriptions.clerkId, userId))
      .limit(1)

    if (!rows.length) return "free"

    const { tier, status } = rows[0]
    const isActive = status === "active" || status === "trialing"
    return isActive ? (tier as SubscriptionTier) : "free"
  } catch {
    // DB not configured yet — fail open to free tier
    return "free"
  }
}

// ---------------------------------------------------------------------------
// getSubscriptionRow
// ---------------------------------------------------------------------------
// Returns the full subscription row for the authenticated user, or null.
// Used by the /pricing page to show current plan + period-end date.
export async function getSubscriptionRow() {
  const { userId } = await auth()
  if (!userId) return null

  try {
    const rows = await db
      .select()
      .from(usersSubscriptions)
      .where(eq(usersSubscriptions.clerkId, userId))
      .limit(1)

    return rows[0] ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// createCheckoutSession
// ---------------------------------------------------------------------------
// Creates a Stripe Checkout Session for the given tier and redirects.
// The clerkUserId is stored in session + subscription metadata so the webhook
// can identify which Clerk user to update.
export async function createCheckoutSession(tier: string): Promise<never> {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  const priceId = TIER_PRICE[tier]
  if (!priceId) throw new Error(`No Stripe price configured for tier: ${tier}`)

  const stripe = getStripe()

  // Re-use the existing Stripe customer if we already have one
  let customerId: string | undefined
  try {
    const rows = await db
      .select({ stripeCustomerId: usersSubscriptions.stripeCustomerId })
      .from(usersSubscriptions)
      .where(eq(usersSubscriptions.clerkId, userId))
      .limit(1)
    customerId = rows[0]?.stripeCustomerId ?? undefined
  } catch { /* DB not yet configured — continue without existing customer */ }

  const session = await stripe.checkout.sessions.create({
    ...(customerId ? { customer: customerId } : {}),
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_URL}/pricing?success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${APP_URL}/pricing?canceled=1`,
    // Embed the Clerk userId in metadata so the webhook can sync the subscription
    metadata: { clerkUserId: userId },
    subscription_data: {
      metadata: { clerkUserId: userId },
    },
    allow_promotion_codes: true,
  })

  if (!session.url) throw new Error("Stripe did not return a checkout URL")
  redirect(session.url)
}

// ---------------------------------------------------------------------------
// createPortalSession
// ---------------------------------------------------------------------------
// Sends the user to the Stripe Customer Portal to manage or cancel their plan.
export async function createPortalSession(): Promise<never> {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  const stripe = getStripe()

  const rows = await db
    .select({ stripeCustomerId: usersSubscriptions.stripeCustomerId })
    .from(usersSubscriptions)
    .where(eq(usersSubscriptions.clerkId, userId))
    .limit(1)

  const customerId = rows[0]?.stripeCustomerId
  if (!customerId) throw new Error("No Stripe customer found for this user")

  const portalSession = await stripe.billingPortal.sessions.create({
    customer:   customerId,
    return_url: `${APP_URL}/pricing`,
  })

  redirect(portalSession.url)
}
