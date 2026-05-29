// lib/subscription.ts
// Central authority for subscription tier checks.
// Server-only — never import directly in client components.

import { prisma } from "@/lib/prisma"

export type Tier = "FREE" | "PRO" | "ELITE"

export interface UserTierInfo {
  tier: Tier
  isActive: boolean
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: Date | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
}

const EMPTY_TIER_INFO: UserTierInfo = {
  tier: "FREE",
  isActive: false,
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
}

// Parses ADMIN_USER_IDS env var (comma-separated Clerk user IDs) into a Set.
function getAdminUserIds(): Set<string> {
  const raw = process.env.ADMIN_USER_IDS ?? ""
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))
}

// Returns the user's active tier. Falls back to "FREE" for missing/expired
// subscriptions. Never throws — designed to be called in API routes without
// try/catch at the call site.
export async function getUserTier(userId: string | null | undefined): Promise<Tier> {
  if (!userId) return "FREE"
  if (getAdminUserIds().has(userId)) return "ELITE"
  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId },
      select: { tier: true, status: true, currentPeriodEnd: true },
    })
    if (!sub) return "FREE"
    const isActive = sub.status === "active" || sub.status === "trialing"
    const notExpired = !sub.currentPeriodEnd || sub.currentPeriodEnd > new Date()
    if (!isActive || !notExpired) return "FREE"
    const t = sub.tier.toUpperCase() as Tier
    if (t === "ELITE" || t === "PRO") return t
    return "FREE"
  } catch {
    return "FREE"
  }
}

// Full subscription info for the account management page.
export async function getUserTierInfo(userId: string): Promise<UserTierInfo> {
  if (getAdminUserIds().has(userId)) {
    return {
      tier: "ELITE",
      isActive: true,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    }
  }
  try {
    const sub = await prisma.subscription.findUnique({ where: { userId } })
    if (!sub) return EMPTY_TIER_INFO

    const isActive = sub.status === "active" || sub.status === "trialing"
    const notExpired = !sub.currentPeriodEnd || sub.currentPeriodEnd > new Date()
    const effectiveTier = isActive && notExpired
      ? (sub.tier.toUpperCase() as Tier)
      : "FREE"

    return {
      tier: effectiveTier,
      isActive,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      currentPeriodEnd: sub.currentPeriodEnd,
      stripeCustomerId: sub.stripeCustomerId ?? null,
      stripeSubscriptionId: sub.stripeSubscriptionId ?? null,
    }
  } catch {
    return EMPTY_TIER_INFO
  }
}

// Feature access matrix — single source of truth for what each tier unlocks.
export type Feature =
  | "all_games"         // PRO+: see all games (not just the top-1 free teaser)
  | "recommendation"    // PRO+: recommendation badge (STRONG_NRFI, etc.)
  | "confidence"        // PRO+: confidence badge / score
  | "value_analysis"    // PRO+: value analysis panel (edge, Kelly, EV)
  | "factors"           // PRO+: key factors list
  | "pitcher_stats"     // PRO+: pitcher deep-dive tab
  | "model_breakdown"   // ELITE: 7-model breakdown panel
  | "deepnrfi"          // ELITE: DeepNRFI LightGBM layer
  | "montecarlo"        // ELITE: Monte Carlo simulations
  | "ensemble_weights"  // ELITE: ensemble version breakdown
  | "api_access"        // ELITE: raw API access

const TIER_RANK: Record<Tier, number> = { FREE: 0, PRO: 1, ELITE: 2 }

const FEATURE_MIN_TIER: Record<Feature, Tier> = {
  all_games:        "PRO",
  recommendation:   "PRO",
  confidence:       "PRO",
  value_analysis:   "PRO",
  factors:          "PRO",
  pitcher_stats:    "PRO",
  model_breakdown:  "ELITE",
  deepnrfi:         "ELITE",
  montecarlo:       "ELITE",
  ensemble_weights: "ELITE",
  api_access:       "ELITE",
}

export function hasAccess(tier: Tier, feature: Feature): boolean {
  return TIER_RANK[tier] >= TIER_RANK[FEATURE_MIN_TIER[feature]]
}

// Map a Stripe price ID to an internal tier name.
// Falls back to "FREE" if the price ID is not recognised.
export function priceIdToTier(priceId: string | null | undefined): Tier {
  if (!priceId) return "FREE"
  const elitePrices = [
    process.env.NEXT_PUBLIC_STRIPE_ELITE_MONTHLY_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_ELITE_ANNUAL_PRICE_ID,
  ]
  const proPrices = [
    process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID,
  ]
  if (elitePrices.includes(priceId)) return "ELITE"
  if (proPrices.includes(priceId)) return "PRO"
  return "FREE"
}
