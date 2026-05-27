"use client"

import { useState } from "react"
import { Check, X, Zap, Star, Lock } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useAuth } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ── Pricing data ───────────────────────────────────────────────────────────────

const PRICES = {
  pro: {
    monthly: { id: process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID ?? "", amount: "$19.99", period: "/mo" },
    annual:  { id: process.env.NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID  ?? "", amount: "$149",   period: "/yr" },
  },
  elite: {
    monthly: { id: process.env.NEXT_PUBLIC_STRIPE_ELITE_MONTHLY_PRICE_ID ?? "", amount: "$39.99", period: "/mo" },
    annual:  { id: process.env.NEXT_PUBLIC_STRIPE_ELITE_ANNUAL_PRICE_ID  ?? "", amount: "$299",   period: "/yr" },
  },
}

interface Feature {
  label: string
  free: boolean | "partial"
  pro: boolean
  elite: boolean
}

const FEATURES: Feature[] = [
  { label: "1 game preview / day",          free: true,      pro: true,  elite: true  },
  { label: "NRFI % probability",            free: true,      pro: true,  elite: true  },
  { label: "All daily games",               free: false,     pro: true,  elite: true  },
  { label: "Recommendation signal",         free: "partial", pro: true,  elite: true  },
  { label: "Confidence level",              free: "partial", pro: true,  elite: true  },
  { label: "Value analysis + edge",         free: false,     pro: true,  elite: true  },
  { label: "Key factors list",              free: false,     pro: true,  elite: true  },
  { label: "Live odds integration",         free: false,     pro: true,  elite: true  },
  { label: "7-model breakdown panel",       free: false,     pro: false, elite: true  },
  { label: "Monte Carlo simulations",       free: false,     pro: false, elite: true  },
  { label: "DeepNRFI (LightGBM layer)",     free: false,     pro: false, elite: true  },
  { label: "Pitcher deep-dive stats",       free: false,     pro: true,  elite: true  },
  { label: "Ensemble weights breakdown",    free: false,     pro: false, elite: true  },
  { label: "API access",                    free: false,     pro: false, elite: true  },
]

function FeatureIcon({ value }: { value: boolean | "partial" }) {
  if (value === true)      return <Check size={13} className="text-emerald-400" />
  if (value === "partial") return <Lock  size={11} className="text-amber-400/70" />
  return <X size={12} className="text-muted-foreground/40" />
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
}

export function PricingModal({ open, onClose }: Props) {
  const [billing, setBilling] = useState<"monthly" | "annual">("annual")
  const [loading, setLoading] = useState<"pro" | "elite" | null>(null)
  const { isSignedIn } = useAuth()
  const router = useRouter()

  async function handleUpgrade(tier: "pro" | "elite") {
    if (!isSignedIn) {
      router.push("/sign-in?redirect_url=/pricing")
      onClose()
      return
    }

    const priceId = PRICES[tier][billing].id
    if (!priceId) {
      toast.error("Pricing not configured — please contact support.")
      return
    }

    setLoading(tier)
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error ?? "Checkout failed")
      window.location.href = data.url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start checkout")
      setLoading(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-3xl w-full p-0 overflow-hidden"
        style={{
          background: "var(--hm-pitch, #0d1117)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <DialogTitle className="sr-only">Upgrade Your Plan</DialogTitle>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-white/6">
          <h2
            className="font-display text-xl tracking-tight"
            style={{ color: "var(--hm-chalk, #e8eaf0)" }}
          >
            Unlock Every Edge
          </h2>
          <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
            7-model ensemble • Live odds • Monte Carlo simulations
          </p>

          {/* Billing toggle */}
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => setBilling("monthly")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                billing === "monthly"
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/60"
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling("annual")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                billing === "annual"
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/60"
              )}
            >
              Annual
              <span
                className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                style={{ background: "rgba(0,230,118,0.15)", color: "#00e676" }}
              >
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Tier cards */}
        <div className="grid grid-cols-3 divide-x divide-white/6 px-0">
          {/* FREE */}
          <div className="flex flex-col gap-3 px-5 py-5">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-white/40">Free</p>
              <p className="mt-1 text-2xl font-bold text-white">$0</p>
              <p className="text-[10px] text-white/30">forever</p>
            </div>
            <div
              className="rounded-md px-4 py-2 text-center text-xs font-medium"
              style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}
            >
              Current plan
            </div>
          </div>

          {/* PRO */}
          <div
            className="flex flex-col gap-3 px-5 py-5 relative"
            style={{ background: "rgba(0,229,255,0.03)" }}
          >
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
              style={{ background: "rgba(0,229,255,0.15)", color: "#00e5ff", border: "1px solid rgba(0,229,255,0.3)" }}
            >
              Most Popular
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.14em]" style={{ color: "#00e5ff" }}>Pro</p>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold text-white">{PRICES.pro[billing].amount}</span>
                <span className="text-[10px] text-white/30">{PRICES.pro[billing].period}</span>
              </div>
              {billing === "annual" && <p className="text-[10px] text-white/30">$12.42 / mo billed annually</p>}
            </div>
            <button
              onClick={() => handleUpgrade("pro")}
              disabled={loading !== null}
              className="flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, rgba(0,229,255,0.18), rgba(0,230,118,0.12))",
                border: "1px solid rgba(0,229,255,0.4)",
                color: "#00e5ff",
              }}
            >
              <Zap size={11} />
              {loading === "pro" ? "Redirecting…" : "Get Pro"}
            </button>
          </div>

          {/* ELITE */}
          <div
            className="flex flex-col gap-3 px-5 py-5"
            style={{ background: "rgba(255,193,7,0.02)" }}
          >
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.14em]" style={{ color: "#ffc107" }}>Elite</p>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold text-white">{PRICES.elite[billing].amount}</span>
                <span className="text-[10px] text-white/30">{PRICES.elite[billing].period}</span>
              </div>
              {billing === "annual" && <p className="text-[10px] text-white/30">$24.92 / mo billed annually</p>}
            </div>
            <button
              onClick={() => handleUpgrade("elite")}
              disabled={loading !== null}
              className="flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, rgba(255,193,7,0.15), rgba(255,152,0,0.1))",
                border: "1px solid rgba(255,193,7,0.4)",
                color: "#ffc107",
              }}
            >
              <Star size={11} />
              {loading === "elite" ? "Redirecting…" : "Get Elite"}
            </button>
          </div>
        </div>

        {/* Feature table */}
        <div className="border-t border-white/6 overflow-auto max-h-60">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/6">
                <th className="px-5 py-2 text-left font-medium text-white/30 w-full">Feature</th>
                <th className="px-3 py-2 text-center font-medium text-white/30 w-16">Free</th>
                <th className="px-3 py-2 text-center font-medium w-16" style={{ color: "#00e5ff" }}>Pro</th>
                <th className="px-3 py-2 text-center font-medium w-16" style={{ color: "#ffc107" }}>Elite</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f) => (
                <tr key={f.label} className="border-b border-white/4 hover:bg-white/2">
                  <td className="px-5 py-1.5 text-white/55">{f.label}</td>
                  <td className="px-3 py-1.5 text-center"><FeatureIcon value={f.free} /></td>
                  <td className="px-3 py-1.5 text-center"><FeatureIcon value={f.pro} /></td>
                  <td className="px-3 py-1.5 text-center"><FeatureIcon value={f.elite} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-3 border-t border-white/6">
          <p className="text-[10px] text-center" style={{ color: "rgba(255,255,255,0.25)" }}>
            Cancel anytime. Billed via Stripe. Prices in USD.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
