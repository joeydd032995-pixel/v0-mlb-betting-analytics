import { type NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { db } from "@/lib/db"
import type Stripe from "stripe"

// Stripe requires the raw body — disable Next.js body parsing
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get("stripe-signature")

  if (!signature) {
    console.error("[stripe-webhook] Missing stripe-signature header")
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err)
    // Always return 200 on signature failure to prevent Stripe retries on invalid requests
    return NextResponse.json({ received: true })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.userId
        const planId = session.metadata?.planId

        if (!userId || !planId) {
          console.error("[stripe-webhook] Missing metadata in session:", session.id)
          break
        }

        db.update(userId, {
          plan: planId,
          subscriptionStatus: "active",
          stripeCustomerId: session.customer as string ?? null,
          stripeSubId: session.subscription as string ?? null,
        })

        console.log(`[stripe-webhook] User ${userId} upgraded to plan: ${planId}`)
        break
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription
        const user = db.findByStripeCustomerId(subscription.customer as string)
        if (user) {
          db.update(user.id, {
            subscriptionStatus: subscription.status,
          })
        }
        break
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        const user = db.findByStripeCustomerId(subscription.customer as string)
        if (user) {
          db.update(user.id, {
            plan: null,
            subscriptionStatus: "canceled",
            stripeSubId: null,
          })
        }
        break
      }

      default:
        // Unhandled event type — not an error
        break
    }
  } catch (error) {
    // Log but always return 200 so Stripe doesn't retry endlessly
    console.error("[stripe-webhook] Handler error:", error)
  }

  return NextResponse.json({ received: true })
}
