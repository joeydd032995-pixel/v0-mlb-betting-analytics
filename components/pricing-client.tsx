"use client"

import { useState } from "react"
import { Check, X, Zap, Star, Lock } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useEffect } from "react"

// ── Pricing data ───────────────────────────────────────────────────────────────

const PRICES = {
  pro: {
    monthly: {
      id: process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID ?? "",
      amount: "$19.99",
      period: "/mo",
      subtext: "",
    },
    annual: {
      id: process.env.NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID ?? "",
      amount: "$149",
      period: "/yr",
      subtext: "$12.42 / mo — save $91",
    },
  },
  elite: {
    monthly: {
      id: process.env.NEXT_PUBLIC_STRIPE_ELITE_MONTHLY_PRICE_ID ?? "",
      amount: "$39.99",
      period: "/mo",
      subtext: "",
    },
    annual: {
      id: process.env.NEXT_PUBLIC_STRIPE_ELITE_ANNUAL_PRICE_ID ?? "",
      amount: "$299",
      period: "/yr",
      subtext: "$24.92 / mo — save $181",
    },
  },
}

interface FeatureRow {
  label: string
  free: boolean | "partial"
  pro: boolean
  elite: boolean
}

const FEATURES: FeatureRow[] = [
  { label: "1 game preview / day",          free: true,      pro: true,  elite: true  },
  { label: "NRFI % probability",            free: true,      pro: true,  elite: true  },
  { label: "All daily games",               free: false,     pro: true,  elite: true  },
  { label: "Recommendation signal",         free: "partial", pro: true,  elite: true  },
  { label: "Confidence level",              free: "partial", pro: true,  elite: true  },
  { label: "Value analysis + edge",         free: false,     pro: true,  elite: true  },
  { label: "Key factors list",              free: false,     pro: true,  elite: true  },
  { label: "Live odds integration",         free: false,     pro: true,  elite: true  },
  { label: "Pitcher deep-dive stats",       free: false,     pro: true,  elite: true  },
  { label: "7-model breakdown panel",       free: false,     pro: false, elite: true  },
  { label: "Monte Carlo simulations",       free: false,     pro: false, elite: true  },
  { label: "DeepNRFI (LightGBM layer)",     free: false,     pro: false, elite: true  },
  { label: "Ensemble weights breakdown",    free: false,     pro: false, elite: true  },
  { label: "API access",                    free: false,     pro: false, elite: true  },
]

function FeatureIcon({ value }: { value: boolean | "partial" }) {
  if (value === true)
    return <Check size={14} className="mx-auto" style={{ color: "#00e676" }} />
  if (value === "partial")
    return <Lock size={12} className="mx-auto" style={{ color: "#ffc107", opacity: 0.7 }} />
  return <X size={13} className="mx-auto" style={{ color: "rgba(255,255,255,0.2)" }} />
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PricingClient() {
  const [billing, setBilling] = useState<"monthly" | "annual">("annual")
  const [loading, setLoading] = useState<"pro" | "elite" | null>(null)
  const [currentTier, setCurrentTier] = useState<string | null>(null)
  const { isSignedIn } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!isSignedIn) return
    fetch("/api/subscription/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.tier) setCurrentTier(d.tier) })
      .catch(() => {})
  }, [isSignedIn])

  // Handle checkout canceled query param
  useEffect(() => {
    if (searchParams.get("checkout") === "canceled") {
      toast.info("Checkout canceled — no charge was made.")
      // Clean up URL
      const url = new URL(window.location.href)
      url.searchParams.delete("checkout")
      window.history.replaceState({}, "", url.toString())
    }
  }, [searchParams])

  async function handleUpgrade(tier: "pro" | "elite") {
    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=${encodeURIComponent("/pricing")}`)
      return
    }

    const priceId = PRICES[tier][billing].id
    if (!priceId) {
      toast.error("Pricing not configured. Please contact support@homeplatemetrics.com")
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
    <div className="space-y-12">
      {/* Hero */}
      <div className="text-center space-y-3">
        <p
          className="font-mono uppercase tracking-[0.2em] text-xs"
          style={{ color: "rgba(0,229,255,0.7)" }}
        >
          Homeplate Metrics
        </p>
        <h1
          className="font-display text-4xl sm:text-5xl tracking-tight"
          style={{ color: "var(--hm-chalk, #e8eaf0)" }}
        >
          Unlock Every Edge
        </h1>
        <p className="max-w-md mx-auto text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
          A 7-model ensemble built for serious NRFI/YRFI bettors. Monte Carlo
          simulations, live odds integration, and daily high-confidence picks.
        </p>

        {/* Billing toggle */}
        <div className="mt-6 inline-flex items-center gap-1 rounded-full p-1" style={{ background: "rgba(255,255,255,0.05)" }}>
          <button
            onClick={() => setBilling("monthly")}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-medium transition-all",
              billing === "monthly"
                ? "bg-white/12 text-white shadow-sm"
                : "text-white/40 hover:text-white/60"
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling("annual")}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium transition-all",
              billing === "annual"
                ? "bg-white/12 text-white shadow-sm"
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* FREE */}
        <div
          className="flex flex-col rounded-[16px] p-6 gap-5"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/35">Free</p>
            <p className="mt-2 text-3xl font-bold text-white">$0</p>
            <p className="text-[11px] text-white/25">forever</p>
          </div>
          <ul className="space-y-2 text-xs flex-1">
            <li className="flex items-center gap-2 text-white/55">
              <Check size={12} style={{ color: "#00e676", flexShrink: 0 }} />
              1 high-confidence game preview
            </li>
            <li className="flex items-center gap-2 text-white/55">
              <Check size={12} style={{ color: "#00e676", flexShrink: 0 }} />
              NRFI % probability shown
            </li>
            <li className="flex items-center gap-2 text-white/35">
              <Lock size={11} style={{ color: "#ffc107", flexShrink: 0 }} />
              Recommendation signal (locked)
            </li>
            <li className="flex items-center gap-2 text-white/35">
              <Lock size={11} style={{ color: "#ffc107", flexShrink: 0 }} />
              Confidence level (locked)
            </li>
          </ul>
          {currentTier === "FREE" && (
            <div
              className="rounded-lg px-4 py-2.5 text-center text-xs font-medium"
              style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.3)" }}
            >
              Current plan
            </div>
          )}
        </div>

        {/* PRO */}
        <div
          className="flex flex-col rounded-[16px] p-6 gap-5 relative"
          style={{
            background: "rgba(0,229,255,0.04)",
            border: "1px solid rgba(0,229,255,0.25)",
          }}
        >
          <div
            className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[9px] font-bold uppercase tracking-wider whitespace-nowrap"
            style={{
              background: "rgba(0,229,255,0.15)",
              border: "1px solid rgba(0,229,255,0.35)",
              color: "#00e5ff",
            }}
          >
            Most Popular
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em]" style={{ color: "#00e5ff" }}>Pro</p>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-white">{PRICES.pro[billing].amount}</span>
              <span className="text-[11px] text-white/30">{PRICES.pro[billing].period}</span>
            </div>
            {PRICES.pro[billing].subtext && (
              <p className="text-[10px] mt-0.5" style={{ color: "rgba(0,229,255,0.5)" }}>
                {PRICES.pro[billing].subtext}
              </p>
            )}
          </div>
          <ul className="space-y-2 text-xs flex-1">
            {["All daily games", "Recommendation signal", "Confidence level", "Value analysis + edge", "Key factors list", "Live odds integration", "Pitcher deep-dive stats"].map(f => (
              <li key={f} className="flex items-center gap-2 text-white/65">
                <Check size={12} style={{ color: "#00e676", flexShrink: 0 }} />
                {f}
              </li>
            ))}
          </ul>
          {currentTier === "PRO" ? (
            <div
              className="rounded-lg px-4 py-2.5 text-center text-xs font-medium"
              style={{ background: "rgba(0,229,255,0.06)", color: "#00e5ff" }}
            >
              Current plan
            </div>
          ) : (
            <button
              onClick={() => handleUpgrade("pro")}
              disabled={loading !== null}
              className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, rgba(0,229,255,0.2), rgba(0,230,118,0.15))",
                border: "1px solid rgba(0,229,255,0.45)",
                color: "#00e5ff",
              }}
            >
              <Zap size={13} />
              {loading === "pro" ? "Redirecting…" : "Get Pro"}
            </button>
          )}
        </div>

        {/* ELITE */}
        <div
          className="flex flex-col rounded-[16px] p-6 gap-5"
          style={{
            background: "rgba(255,193,7,0.03)",
            border: "1px solid rgba(255,193,7,0.2)",
          }}
        >
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em]" style={{ color: "#ffc107" }}>Elite</p>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-white">{PRICES.elite[billing].amount}</span>
              <span className="text-[11px] text-white/30">{PRICES.elite[billing].period}</span>
            </div>
            {PRICES.elite[billing].subtext && (
              <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,193,7,0.5)" }}>
                {PRICES.elite[billing].subtext}
              </p>
            )}
          </div>
          <ul className="space-y-2 text-xs flex-1">
            {["Everything in Pro", "7-model breakdown panel", "Monte Carlo simulations", "DeepNRFI (LightGBM layer)", "Ensemble weights breakdown", "API access"].map((f, i) => (
              <li key={f} className="flex items-center gap-2 text-white/65">
                {i === 0
                  ? <Star size={12} style={{ color: "#ffc107", flexShrink: 0 }} />
                  : <Check size={12} style={{ color: "#00e676", flexShrink: 0 }} />
                }
                {f}
              </li>
            ))}
          </ul>
          {currentTier === "ELITE" ? (
            <div
              className="rounded-lg px-4 py-2.5 text-center text-xs font-medium"
              style={{ background: "rgba(255,193,7,0.06)", color: "#ffc107" }}
            >
              Current plan
            </div>
          ) : (
            <button
              onClick={() => handleUpgrade("elite")}
              disabled={loading !== null}
              className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, rgba(255,193,7,0.18), rgba(255,152,0,0.12))",
                border: "1px solid rgba(255,193,7,0.45)",
                color: "#ffc107",
              }}
            >
              <Star size={13} />
              {loading === "elite" ? "Redirecting…" : "Get Elite"}
            </button>
          )}
        </div>
      </div>

      {/* Full feature table */}
      <div
        className="rounded-[16px] overflow-hidden"
        style={{ border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div
          className="px-6 py-3 border-b"
          style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}
        >
          <p className="text-xs font-medium text-white/40">Full feature comparison</p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <th className="px-6 py-3 text-left font-medium text-white/25">Feature</th>
              <th className="px-4 py-3 text-center font-medium text-white/25 w-20">Free</th>
              <th className="px-4 py-3 text-center font-medium w-20" style={{ color: "#00e5ff" }}>Pro</th>
              <th className="px-4 py-3 text-center font-medium w-20" style={{ color: "#ffc107" }}>Elite</th>
            </tr>
          </thead>
          <tbody>
            {FEATURES.map((f, i) => (
              <tr
                key={f.label}
                style={{
                  borderBottom: i < FEATURES.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                }}
              >
                <td className="px-6 py-2.5 text-white/50">{f.label}</td>
                <td className="px-4 py-2.5 text-center"><FeatureIcon value={f.free} /></td>
                <td className="px-4 py-2.5 text-center"><FeatureIcon value={f.pro} /></td>
                <td className="px-4 py-2.5 text-center"><FeatureIcon value={f.elite} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-center text-[11px]" style={{ color: "rgba(255,255,255,0.2)" }}>
        Cancel anytime. Billed securely via Stripe. All prices in USD.
        Questions? <a href="mailto:support@homeplatemetrics.com" className="underline underline-offset-2 hover:text-white/40">support@homeplatemetrics.com</a>
      </p>
    </div>
  )
}
