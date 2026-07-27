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
  /** See TierResolution.resolved — false means the lookup failed, not that the user is FREE. */
  resolved: boolean
}

const EMPTY_TIER_INFO: Omit<UserTierInfo, "resolved"> = {
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

// Upper bound on the tier lookup. It is a single indexed read on a unique key,
// so anything slower than this is a stalled connection, not a slow query. Without
// a bound a hung query holds the request open for the route's full maxDuration
// (300s on /api/predictions); with it, the caller gets resolved: false quickly
// and can surface a retry.
const TIER_QUERY_TIMEOUT_MS = 3_000

// Exported so any other route that risks holding a request open on a stalled
// DB call (e.g. lib/server/free-pick.ts) can reuse the same bound instead of
// re-deriving it.
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "tier lookup"): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The one place that decides which tier a subscription row grants.
 *
 * Both resolveUserTier and getUserTierInfo route through this. Keeping it
 * single is the point: this whole change exists because parallel tier logic
 * drifted apart, and a future edit here (a grace period, a new status) must not
 * be able to land on one path and miss the other.
 */
function effectiveTierFor(
  sub: { tier: string; status: string; currentPeriodEnd: Date | null } | null,
  isAdmin: boolean
): Tier {
  if (isAdmin) return "ELITE"
  if (!sub) return "FREE"
  const isActive = sub.status === "active" || sub.status === "trialing"
  const notExpired = !sub.currentPeriodEnd || sub.currentPeriodEnd > new Date()
  return isActive && notExpired ? normaliseTier(sub.tier) : "FREE"
}

// Resolves the user's active tier, distinguishing "known FREE" from
// "couldn't tell". Never throws.
export async function resolveUserTier(userId: string | null | undefined): Promise<TierResolution> {
  if (!userId) return { tier: "FREE", resolved: true }
  if (getAdminUserIds().has(userId)) return { tier: "ELITE", resolved: true }
  try {
    const sub = await withTimeout(
      prisma.subscription.findUnique({
        where: { userId },
        select: { tier: true, status: true, currentPeriodEnd: true },
      }),
      TIER_QUERY_TIMEOUT_MS
    )
    return { tier: effectiveTierFor(sub, false), resolved: true }
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
  // Jittered backoff: an immediate retry on every gated request would double
  // the load on a database that is already struggling, and the jitter keeps
  // concurrent requests from re-hitting it in lockstep.
  await sleep(100 + Math.random() * 100)
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

const ADMIN_TIER_INFO: UserTierInfo = {
  tier: "ELITE",
  isActive: true,
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  resolved: true,
}

// Full subscription info for the account page and /api/subscription/me.
//
// `resolved` matters as much here as it does in resolveUserTier: this function
// backs the endpoint the home page uses to double-check a suspicious FREE
// verdict. If a DB blip made it answer a confident "FREE", the cross-check
// would confirm the very downgrade it exists to catch.
export async function getUserTierInfo(userId: string): Promise<UserTierInfo> {
  const isAdmin = getAdminUserIds().has(userId)
  try {
    const sub = await withTimeout(
      prisma.subscription.findUnique({ where: { userId } }),
      TIER_QUERY_TIMEOUT_MS
    )
    if (!sub) return isAdmin ? ADMIN_TIER_INFO : { ...EMPTY_TIER_INFO, resolved: true }

    const isActive = sub.status === "active" || sub.status === "trialing"

    return {
      tier: effectiveTierFor(sub, isAdmin),
      isActive: isAdmin ? true : isActive,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      currentPeriodEnd: sub.currentPeriodEnd,
      stripeCustomerId: sub.stripeCustomerId ?? null,
      stripeSubscriptionId: sub.stripeSubscriptionId ?? null,
      resolved: true,
    }
  } catch (err) {
    console.error("[subscription] tier info lookup failed", {
      userId,
      err: err instanceof Error ? err.message : err,
    })
    // The admin override needs no DB read, so it is still a resolved answer.
    return isAdmin ? ADMIN_TIER_INFO : { ...EMPTY_TIER_INFO, resolved: false }
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
