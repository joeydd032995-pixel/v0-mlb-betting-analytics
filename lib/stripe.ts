// lib/stripe.ts
// Stripe client — lazily initialised on first call so the module can be
// imported during Next.js build without a STRIPE_SECRET_KEY set.
// Only import in server-side code (API routes, server components).

import Stripe from "stripe"

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (_stripe) return _stripe

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to .env.local or your deployment environment variables."
    )
  }

  _stripe = new Stripe(key, {
    apiVersion: "2026-04-22.dahlia",
    typescript: true,
  })
  return _stripe
}

// Convenience re-export for callers that prefer direct usage.
// NOTE: This is NOT a pre-initialised singleton — it calls getStripe() each time.
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string, unknown>)[prop as string]
  },
})
