// lib/subscription.ts
// Central authority for subscription tier LOOKUPS (who is on which tier).
// Server-only — never import directly in client components; the tier *rules*
// (Tier, Feature, hasAccess) live in the client-safe lib/tiers.ts and are
// re-exported here so existing server-side imports keep working.

import { prisma } from "@/lib/prisma"
import { normaliseTier, type Tier } from "@/lib/tiers"

export type { Tier, Feature } from "@/lib/tiers"
export { hasAccess, FEATURE_MIN_TIER } from "@/lib/tiers"

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

export interface TierResolution {
  tier: Tier
  /**
   * false ONLY when the tier could not be determined (DB error/timeout).
   * A signed-out user, or a signed-in user with no subscription row, is a
   * known FREE answer and resolves true. Callers that gate paid content MUST
   * check this — treating an unresolved lookup as FREE silently downgrades
   * paying subscribers, which is the failure this flag exists to prevent.
   */
  resolved: boolean
}

// Resolves the user's active tier, distinguishing "known FREE" from
// "couldn't tell". Never throws.
export async function resolveUserTier(userId: string | null | undefined): Promise<TierResolution> {
  if (!userId) return { tier: "FREE", resolved: true }
  if (getAdminUserIds().has(userId)) return { tier: "ELITE", resolved: true }
  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId },
      select: { tier: true, status: true, currentPeriodEnd: true },
    })
    if (!sub) return { tier: "FREE", resolved: true }
    const isActive = sub.status === "active" || sub.status === "trialing"
    const notExpired = !sub.currentPeriodEnd || sub.currentPeriodEnd > new Date()
    if (!isActive || !notExpired) return { tier: "FREE", resolved: true }
    return { tier: normaliseTier(sub.tier), resolved: true }
  } catch (err) {
    console.error("[subscription] tier lookup failed", {
      userId,
      err: err instanceof Error ? err.message : err,
    })
    return { tier: "FREE", resolved: false }
  }
}

// resolveUserTier + one retry, for routes that serve tier-gated content and
// would otherwise downgrade a paying user on a single transient DB blip.
// Callers should refuse to serve gated data when this still returns
// resolved: false.
export async function resolveUserTierWithRetry(userId: string | null | undefined): Promise<TierResolution> {
  const first = await resolveUserTier(userId)
  if (first.resolved) return first
  return resolveUserTier(userId)
}

// Returns the user's active tier. Falls back to "FREE" for missing/expired
// subscriptions AND for failed lookups. Never throws.
// Prefer resolveUserTier() anywhere the difference between "known FREE" and
// "lookup failed" matters — i.e. any route that serves tier-gated content.
export async function getUserTier(userId: string | null | undefined): Promise<Tier> {
  const { tier } = await resolveUserTier(userId)
  return tier
}

// Full subscription info for the account management page.
export async function getUserTierInfo(userId: string): Promise<UserTierInfo> {
  const isAdmin = getAdminUserIds().has(userId)
  try {
    const sub = await prisma.subscription.findUnique({ where: { userId } })
    if (!sub) {
      return isAdmin
        ? { tier: "ELITE", isActive: true, cancelAtPeriodEnd: false, currentPeriodEnd: null, stripeCustomerId: null, stripeSubscriptionId: null }
        : EMPTY_TIER_INFO
    }

    const isActive = sub.status === "active" || sub.status === "trialing"
    const notExpired = !sub.currentPeriodEnd || sub.currentPeriodEnd > new Date()
    const effectiveTier: Tier = isAdmin ? "ELITE" : (isActive && notExpired ? normaliseTier(sub.tier) : "FREE")

    return {
      tier: effectiveTier,
      isActive: isAdmin ? true : isActive,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      currentPeriodEnd: sub.currentPeriodEnd,
      stripeCustomerId: sub.stripeCustomerId ?? null,
      stripeSubscriptionId: sub.stripeSubscriptionId ?? null,
    }
  } catch {
    return isAdmin
      ? { tier: "ELITE", isActive: true, cancelAtPeriodEnd: false, currentPeriodEnd: null, stripeCustomerId: null, stripeSubscriptionId: null }
      : EMPTY_TIER_INFO
  }
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
