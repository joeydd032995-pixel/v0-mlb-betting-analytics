import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ---------------------------------------------------------------------------
// Subscription tier types and helpers
// ---------------------------------------------------------------------------

/** All possible subscription tiers */
export type SubscriptionTier = "free" | "daily" | "weekly" | "monthly" | "annual"

/** Ordered tier names for display */
export const TIER_LABELS: Record<SubscriptionTier, string> = {
  free:    "Free",
  daily:   "Daily",
  weekly:  "Weekly",
  monthly: "Monthly",
  annual:  "Annual",
}

/** Tiers that have paid access (any cadence) */
const PAID_TIERS = new Set<SubscriptionTier>(["daily", "weekly", "monthly", "annual"])

/** Tiers that unlock History + Pitcher/Team deep-dive analytics */
const PREMIUM_TIERS = new Set<SubscriptionTier>(["monthly", "annual"])

/** Maximum picks a free user can view in a single UTC calendar day */
export const FREE_DAILY_PICK_LIMIT = 1

/**
 * Returns true for any paying tier (daily, weekly, monthly, annual).
 * Paid users get: unlimited picks + full advanced stats in game cards.
 */
export function tierIsPaid(tier: SubscriptionTier): boolean {
  return PAID_TIERS.has(tier)
}

/**
 * Returns true for monthly or annual subscribers.
 * These tiers unlock: History tab, full PitcherStats table, full TeamStats table.
 */
export function tierHasHistory(tier: SubscriptionTier): boolean {
  return PREMIUM_TIERS.has(tier)
}

/**
 * Alias — pitcher + team insights are unlocked on the same tiers as History.
 */
export function tierHasPitcherInsights(tier: SubscriptionTier): boolean {
  return PREMIUM_TIERS.has(tier)
}

/** Number of free picks remaining today, given the count already used */
export function freePicksRemaining(picksUsedToday: number): number {
  return Math.max(0, FREE_DAILY_PICK_LIMIT - picksUsedToday)
}
