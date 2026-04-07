"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { FormError } from "@/components/auth/FormError"
import { PricingCard } from "@/components/paywall/PricingCard"
import { PLANS, type PlanConfig } from "@/lib/validations/plans"

export function PricingGrid() {
  const router = useRouter()
  const [isAnnual, setIsAnnual] = useState(false)
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null)
  const [error, setError] = useState<string | undefined>()

  const billingCycle: "monthly" | "annual" = isAnnual ? "annual" : "monthly"

  async function handleSelect(plan: PlanConfig) {
    setError(undefined)
    setLoadingPlanId(plan.id)

    try {
      const priceId = isAnnual
        ? plan.stripePriceId.annual
        : plan.stripePriceId.monthly

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          priceId,
          billingCycle,
        }),
      })

      const data = await res.json() as {
        url?: string
        redirect?: string
        error?: string
        success?: boolean
      }

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.")
        return
      }

      if (data.url) {
        // Real Stripe redirect
        window.location.href = data.url
        return
      }

      if (data.redirect || data.success) {
        router.push(data.redirect ?? "/dashboard")
        router.refresh()
      }
    } catch {
      setError("Network error. Please check your connection and try again.")
    } finally {
      setLoadingPlanId(null)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3">
        <span
          className={[
            "text-sm font-medium transition-colors",
            !isAnnual ? "text-foreground" : "text-muted-foreground",
          ].join(" ")}
        >
          Monthly
        </span>
        <Switch
          id="billing-toggle"
          checked={isAnnual}
          onCheckedChange={setIsAnnual}
          aria-label="Toggle annual billing"
        />
        <span
          className={[
            "flex items-center gap-2 text-sm font-medium transition-colors",
            isAnnual ? "text-foreground" : "text-muted-foreground",
          ].join(" ")}
        >
          Annual
          <Badge variant="secondary" className="text-xs text-green-400 border-green-500/30 bg-green-500/10">
            Save 20%
          </Badge>
        </span>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {PLANS.map((plan) => (
          <PricingCard
            key={plan.id}
            plan={plan}
            billingCycle={billingCycle}
            onSelect={handleSelect}
            isLoading={loadingPlanId === plan.id}
          />
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-auto max-w-md">
          <FormError message={error} />
        </div>
      )}
    </div>
  )
}
