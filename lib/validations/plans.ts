import { z } from "zod"

export const checkoutSchema = z.object({
  planId: z.enum(["free", "pro", "enterprise"]),
  priceId: z.string().optional(),
  billingCycle: z.enum(["monthly", "annual"]).optional(),
})

export type CheckoutInput = z.infer<typeof checkoutSchema>

export interface PlanConfig {
  id: "free" | "pro" | "enterprise"
  name: string
  monthlyPrice: number
  annualPrice: number
  description: string
  features: string[]
  cta: string
  recommended: boolean
  stripePriceId: {
    monthly: string | undefined
    annual: string | undefined
  }
}

export const PLANS: PlanConfig[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    description: "For individuals getting started",
    features: [
      "5 projects",
      "Basic analytics",
      "Community support",
      "1 GB storage",
    ],
    cta: "Start for free",
    recommended: false,
    stripePriceId: { monthly: undefined, annual: undefined },
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 19,
    annualPrice: 15,
    description: "For power users and small teams",
    features: [
      "Unlimited projects",
      "Advanced analytics",
      "Priority support",
      "50 GB storage",
      "API access",
      "Custom integrations",
    ],
    cta: "Start Pro",
    recommended: true,
    stripePriceId: {
      monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
      annual: process.env.STRIPE_PRICE_PRO_ANNUAL,
    },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: 79,
    annualPrice: 65,
    description: "For teams that need more control",
    features: [
      "Everything in Pro",
      "SSO / SAML",
      "SLA guarantee",
      "Dedicated support",
      "Unlimited storage",
      "Audit logs",
    ],
    cta: "Contact sales",
    recommended: false,
    stripePriceId: {
      monthly: process.env.STRIPE_PRICE_ENT_MONTHLY,
      annual: process.env.STRIPE_PRICE_ENT_ANNUAL,
    },
  },
]
