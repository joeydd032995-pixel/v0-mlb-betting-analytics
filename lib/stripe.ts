import Stripe from "stripe"

if (!process.env.STRIPE_SECRET_KEY && process.env.ENABLE_STRIPE === "true") {
  throw new Error("STRIPE_SECRET_KEY is required when ENABLE_STRIPE=true")
}

// Singleton pattern — prevents multiple Stripe instances in Next.js dev HMR
const globalForStripe = globalThis as unknown as { __stripe: Stripe }

export const stripe: Stripe =
  globalForStripe.__stripe ??
  new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_placeholder", {
    apiVersion: "2025-03-31.basil",
  })

if (process.env.NODE_ENV !== "production") {
  globalForStripe.__stripe = stripe
}
