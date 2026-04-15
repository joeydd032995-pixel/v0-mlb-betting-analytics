"use client"
// components/subscription-provider.tsx
// React context that makes the current user's subscription tier + pick quota
// available throughout the component tree via the useSubscription() hook.
//
// Architecture:
//   1. app/layout.tsx (server component) fetches the tier + picksToday from
//      the DB server-side and passes them as props.
//   2. SubscriptionProvider (client component) stores them in context.
//   3. Any client component calls useSubscription() to gate content.
//
// The UpgradeModal is rendered here so any component can call
// openUpgradeModal() without prop-drilling.

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react"
import { UpgradeModal } from "@/components/upgrade-modal"
import { createPortalSession } from "@/lib/actions/subscription-actions"
import {
  tierIsPaid,
  tierHasHistory,
  tierHasPitcherInsights,
  freePicksRemaining,
  FREE_DAILY_PICK_LIMIT,
  type SubscriptionTier,
} from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UpgradeContext =
  | "picks"      // free user hit daily limit
  | "history"    // History tab
  | "pitchers"   // Pitcher insights tab
  | "teams"      // Team stats tab
  | "general"    // generic / nav button

export interface SubscriptionState {
  /** Current subscription tier ('free' when unauthenticated or no active plan) */
  tier: SubscriptionTier
  /** true for any paying tier (daily | weekly | monthly | annual) */
  isPaid: boolean
  /** true only for monthly | annual — unlocks History + Pitcher/Team tables */
  hasHistory: boolean
  /** Alias of hasHistory — kept for readable gate checks on pitcher/team components */
  hasPitcherInsights: boolean
  /** Picks viewed today (only meaningful for free users) */
  picksUsedToday: number
  /** Remaining free picks for the day (999 for paid users) */
  remainingPicksToday: number
  /** Imperatively open the upgrade modal with optional context */
  openUpgradeModal: (ctx?: UpgradeContext) => void
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const SubscriptionCtx = createContext<SubscriptionState | null>(null)

export function useSubscription(): SubscriptionState {
  const ctx = useContext(SubscriptionCtx)
  if (!ctx) {
    throw new Error("useSubscription() must be used inside <SubscriptionProvider>")
  }
  return ctx
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface Props {
  children: ReactNode
  /** Subscription tier fetched server-side from DB (passed by layout.tsx) */
  initialTier: SubscriptionTier
  /** Picks already viewed today (from daily_pick_usage table) */
  initialPicksToday: number
  /** true when the user's last Stripe payment failed (status = past_due) */
  initialPastDue?: boolean
}

export function SubscriptionProvider({ children, initialTier, initialPicksToday, initialPastDue = false }: Props) {
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [upgradeCtx, setUpgradeCtx]   = useState<UpgradeContext>("general")

  const isPaid             = tierIsPaid(initialTier)
  const hasHistory         = tierHasHistory(initialTier)
  const hasPitcherInsights = tierHasPitcherInsights(initialTier)

  // For paid users, remaining picks is effectively unlimited (999)
  const picksUsedToday     = isPaid ? 0 : initialPicksToday
  const remainingPicksToday = isPaid
    ? 999
    : freePicksRemaining(picksUsedToday)

  const openUpgradeModal = useCallback((ctx: UpgradeContext = "general") => {
    setUpgradeCtx(ctx)
    setUpgradeOpen(true)
  }, [])

  const value: SubscriptionState = {
    tier:                initialTier,
    isPaid,
    hasHistory,
    hasPitcherInsights,
    picksUsedToday,
    remainingPicksToday,
    openUpgradeModal,
  }

  return (
    <SubscriptionCtx.Provider value={value}>
      {/* Past-due payment warning — shown when Stripe marks subscription as past_due */}
      {initialPastDue && (
        <div className="sticky top-0 z-50 flex items-center justify-between gap-4 bg-red-950/90 border-b border-red-500/40 px-4 py-2 text-xs backdrop-blur">
          <span className="text-red-300">
            ⚠ Your last payment failed and your plan has been suspended.
          </span>
          <form action={createPortalSession}>
            <button
              type="submit"
              className="whitespace-nowrap font-semibold text-red-200 underline underline-offset-2 hover:text-red-100 transition-colors"
            >
              Update payment method →
            </button>
          </form>
        </div>
      )}
      {children}
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        context={upgradeCtx}
      />
    </SubscriptionCtx.Provider>
  )
}

// ---------------------------------------------------------------------------
// Convenience re-export so layout.tsx can import everything from one place
// ---------------------------------------------------------------------------
export { FREE_DAILY_PICK_LIMIT }
