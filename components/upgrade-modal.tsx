"use client"
// components/upgrade-modal.tsx
// Upgrade paywall modal — shown when a free user hits their pick limit or
// tries to access a paid feature. Displays all four paid tiers with pricing
// and features, then triggers a Stripe Checkout redirect via server action.

import { useTransition, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Check, X, Zap, TrendingUp, Crown, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"
import { createCheckoutSession } from "@/lib/actions/subscription-actions"
import type { UpgradeContext } from "@/components/subscription-provider"

// ---------------------------------------------------------------------------
// Context-specific copy
// ---------------------------------------------------------------------------
const CONTEXT_COPY: Record<UpgradeContext, { title: string; description: string }> = {
  picks: {
    title:       "You've used your free pick for today",
    description: "Free accounts get 1 NRFI/YRFI pick per day. Upgrade to unlock unlimited picks.",
  },
  history: {
    title:       "History tab requires a paid plan",
    description: "Track accuracy over time, record results, and review per-model performance.",
  },
  pitchers: {
    title:       "Pitcher insights require Monthly or Annual",
    description: "Full pitcher rankings, Bayesian trust meters, and detailed matchup analytics.",
  },
  teams: {
    title:       "Team analytics require Monthly or Annual",
    description: "Deep-dive first-inning offense splits, trend data, and home/away breakdowns.",
  },
  general: {
    title:       "Unlock the full NRFI/YRFI engine",
    description: "Get unlimited picks, advanced analytics, and performance tracking.",
  },
}

// ---------------------------------------------------------------------------
// Plan definitions
// ---------------------------------------------------------------------------
const PLANS = [
  {
    id:        "daily" as const,
    name:      "Daily",
    price:     "$3.99",
    cadence:   "/day",
    icon:      Zap,
    color:     "text-sky-400",
    border:    "border-sky-500/30",
    bg:        "bg-sky-500/5",
    ring:      "",
    badge:     null,
    features:  ["Unlimited daily picks", "Full factor breakdown", "Value analysis + Kelly sizing"],
  },
  {
    id:        "weekly" as const,
    name:      "Weekly",
    price:     "$8.99",
    cadence:   "/week",
    icon:      TrendingUp,
    color:     "text-violet-400",
    border:    "border-violet-500/30",
    bg:        "bg-violet-500/5",
    ring:      "",
    badge:     null,
    features:  ["Unlimited daily picks", "Full factor breakdown", "Value analysis + Kelly sizing"],
  },
  {
    id:        "monthly" as const,
    name:      "Monthly",
    price:     "$23.99",
    cadence:   "/month",
    icon:      Crown,
    color:     "text-amber-400",
    border:    "border-amber-500/40",
    bg:        "bg-amber-500/5",
    ring:      "ring-1 ring-amber-500/50",
    badge:     "Most Popular",
    badgeStyle:"text-amber-300 bg-amber-500/20 border-amber-500/40",
    features:  ["Unlimited daily picks", "Full advanced analytics", "History & accuracy tracking", "Pitcher & team insights"],
  },
  {
    id:        "annual" as const,
    name:      "Annual",
    price:     "$127.99",
    cadence:   "/year",
    icon:      Calendar,
    color:     "text-emerald-400",
    border:    "border-emerald-500/40",
    bg:        "bg-emerald-500/5",
    ring:      "",
    badge:     "Best Value",
    badgeStyle:"text-emerald-300 bg-emerald-500/20 border-emerald-500/40",
    features:  ["Everything in Monthly", "~$10.67/month", "Save 55% vs monthly"],
  },
] as const

type PlanId = typeof PLANS[number]["id"]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  open:     boolean
  onClose:  () => void
  context?: UpgradeContext
}

export function UpgradeModal({ open, onClose, context = "general" }: Props) {
  const [pending, startTransition] = useTransition()
  const [selectedTier, setSelectedTier] = useState<PlanId | null>(null)
  const copy = CONTEXT_COPY[context]

  function handleUpgrade(tierId: PlanId) {
    setSelectedTier(tierId)
    startTransition(async () => {
      await createCheckoutSession(tierId)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl border border-border/60 bg-[oklch(0.145_0_0)] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="relative px-6 pt-6 pb-4 border-b border-border/50">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <DialogTitle className="text-base font-bold text-foreground pr-8">
            {copy.title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {copy.description}
          </DialogDescription>
        </DialogHeader>

        {/* Plan grid */}
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
          {PLANS.map((plan) => {
            const Icon     = plan.icon
            const isLoading = pending && selectedTier === plan.id
            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-lg border p-4",
                  plan.border,
                  plan.bg,
                  plan.ring
                )}
              >
                {/* Badge */}
                {plan.badge && (
                  <div
                    className={cn(
                      "absolute -top-2.5 left-1/2 -translate-x-1/2",
                      "rounded-full border px-2.5 py-0.5",
                      "text-[10px] font-bold whitespace-nowrap",
                      plan.badgeStyle
                    )}
                  >
                    {plan.badge}
                  </div>
                )}

                <Icon className={cn("h-4 w-4 mb-3 mt-1", plan.color)} />

                <p className="text-sm font-bold text-foreground">{plan.name}</p>
                <p className={cn("mt-0.5 tabular-nums", plan.color)}>
                  <span className="text-xl font-black">{plan.price}</span>
                  <span className="text-xs font-medium text-muted-foreground">{plan.cadence}</span>
                </p>

                <ul className="mt-3 space-y-1.5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                      <Check className="h-3 w-3 shrink-0 mt-0.5 text-emerald-400" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Button
                  size="sm"
                  className={cn(
                    "mt-4 w-full text-xs font-semibold",
                    plan.id === "monthly"
                      ? "bg-amber-500/80 hover:bg-amber-500 text-white border-0"
                      : ""
                  )}
                  variant={plan.id === "monthly" ? "default" : "outline"}
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={pending}
                >
                  {isLoading ? "Redirecting…" : "Upgrade"}
                </Button>
              </div>
            )
          })}
        </div>

        <div className="px-6 pb-5 text-center">
          <p className="text-xs text-muted-foreground">
            Secure payment via Stripe · Cancel anytime · Free tier always available
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

