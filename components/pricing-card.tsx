"use client"
// components/pricing-card.tsx
// Individual pricing tier card used on /pricing.
// Handles the Checkout and Portal redirect via server actions.

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Check, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  createCheckoutSession,
  createPortalSession,
} from "@/lib/actions/subscription-actions"
import type { SubscriptionTier } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface PricingTierConfig {
  id:          SubscriptionTier
  name:        string
  price:       string
  cadence:     string
  description: string
  badge?:      string
  badgeStyle?: string
  highlight?:  boolean   // renders with a colored ring (Monthly "Most Popular")
  features:    string[]
  limitations?: string[] // shown as greyed-out locked rows for Free tier
}

interface Props {
  tier:        PricingTierConfig
  /** The tier the signed-in user currently holds (or 'free' if not subscribed) */
  currentTier: SubscriptionTier | null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function PricingCard({ tier, currentTier }: Props) {
  const [pending, startTransition] = useTransition()

  const isCurrent  = currentTier === tier.id
  const isFree     = tier.id === "free"
  const isDowngrade = false // simplification: we don't handle downgrades in UI

  function handleAction() {
    if (isFree || isCurrent) return
    startTransition(async () => {
      // If user has an active paid subscription, send them to the portal
      if (currentTier && currentTier !== "free") {
        await createPortalSession()
      } else {
        await createCheckoutSession(tier.id)
      }
    })
  }

  let buttonLabel = "Get Started"
  if (isFree)    buttonLabel = isCurrent ? "Your current plan" : "Free forever"
  else if (isCurrent) buttonLabel = "Manage plan"
  else if (pending)   buttonLabel = "Redirecting…"

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border p-6 transition-colors",
        tier.highlight
          ? "border-amber-500/50 bg-amber-500/5 ring-1 ring-amber-500/30"
          : "border-border/60 bg-card/60",
        isCurrent && !isFree && "border-primary/40 ring-1 ring-primary/20"
      )}
    >
      {/* Badges */}
      {tier.badge && (
        <div
          className={cn(
            "absolute -top-3 left-1/2 -translate-x-1/2",
            "rounded-full border px-3 py-0.5",
            "text-xs font-bold whitespace-nowrap",
            tier.badgeStyle
          )}
        >
          {tier.badge}
        </div>
      )}
      {isCurrent && (
        <div className="absolute -top-3 right-4 rounded-full border border-primary/40 bg-primary/10 px-3 py-0.5 text-xs font-bold text-primary whitespace-nowrap">
          Your Plan
        </div>
      )}

      {/* Name + price */}
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        {tier.name}
      </h3>
      <div className="mt-2 flex items-end gap-1">
        <span className="text-4xl font-black text-foreground tabular-nums">{tier.price}</span>
        {tier.cadence && (
          <span className="mb-1 text-sm text-muted-foreground">{tier.cadence}</span>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground min-h-[2.5rem]">{tier.description}</p>

      {/* CTA */}
      <Button
        className={cn(
          "mt-5 w-full font-semibold",
          tier.highlight && !isCurrent
            ? "bg-amber-500/80 hover:bg-amber-500 text-white border-0"
            : ""
        )}
        variant={tier.highlight && !isCurrent ? "default" : "outline"}
        onClick={handleAction}
        disabled={isFree || pending}
      >
        {buttonLabel}
      </Button>

      {/* Divider */}
      <div className="my-5 border-t border-border/40" />

      {/* Feature list */}
      <ul className="space-y-2.5 flex-1">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/80">
            <Check className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
            {f}
          </li>
        ))}
        {tier.limitations?.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground/50">
            <Minus className="h-4 w-4 shrink-0 mt-0.5" />
            {f}
          </li>
        ))}
      </ul>
    </div>
  )
}
