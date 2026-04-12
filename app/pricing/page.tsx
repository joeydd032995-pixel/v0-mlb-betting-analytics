// app/pricing/page.tsx
// Pricing page — shows all five tiers with full feature comparisons.
// Server component: fetches the current user's subscription tier to
// highlight their current plan and show "Manage plan" CTA for paid users.

import { Activity, Check, Info } from "lucide-react"
import Link from "next/link"
import type { Metadata } from "next"
import { PricingCard, type PricingTierConfig } from "@/components/pricing-card"
import {
  getSubscriptionTier,
  getSubscriptionRow,
} from "@/lib/actions/subscription-actions"
import type { SubscriptionTier } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Pricing — NRFI/YRFI Prediction Engine",
  description: "Choose a plan and unlock unlimited picks, advanced analytics, and performance tracking.",
}

// ---------------------------------------------------------------------------
// Tier definitions
// ---------------------------------------------------------------------------
const TIERS: PricingTierConfig[] = [
  {
    id:          "free",
    name:        "Free",
    price:       "$0",
    cadence:     "forever",
    description: "Try the engine with one free pick per day — no card required.",
    features: [
      "1 NRFI/YRFI pick per calendar day",
      "Basic probability display",
      "NRFI/YRFI recommendation badge",
      "Confidence tier (High / Medium / Low)",
    ],
    limitations: [
      "No factor breakdown",
      "No value analysis or Kelly sizing",
      "No pitcher / team stats",
      "No history tracking",
    ],
  },
  {
    id:          "daily",
    name:        "Daily",
    price:       "$3.99",
    cadence:     "/ day",
    description: "Full access for a single day — great for game-day deep dives.",
    features: [
      "Unlimited daily NRFI/YRFI picks",
      "Full factor breakdown (ERA, weather, park…)",
      "Value analysis with Kelly Criterion sizing",
      "Model consensus meter (Poisson / ZIP / Markov)",
      "Expected runs + 0-run probabilities",
      "Pitcher & team recent form",
    ],
  },
  {
    id:          "weekly",
    name:        "Weekly",
    price:       "$8.99",
    cadence:     "/ week",
    description: "A full week of unlimited picks and advanced analytics.",
    features: [
      "Unlimited daily NRFI/YRFI picks",
      "Full factor breakdown (ERA, weather, park…)",
      "Value analysis with Kelly Criterion sizing",
      "Model consensus meter (Poisson / ZIP / Markov)",
      "Expected runs + 0-run probabilities",
      "Pitcher & team recent form",
    ],
  },
  {
    id:          "monthly",
    name:        "Monthly",
    price:       "$23.99",
    cadence:     "/ month",
    description: "The most popular plan — everything plus full analytics and tracking.",
    badge:       "Most Popular",
    badgeStyle:  "text-amber-300 bg-amber-500/20 border-amber-500/40",
    highlight:   true,
    features: [
      "Unlimited daily NRFI/YRFI picks",
      "Full factor breakdown",
      "Value analysis + Kelly Criterion",
      "Model ensemble breakdown panel",
      "History tab — track accuracy over time",
      "Pitcher rankings + Bayesian trust meter",
      "Team first-inning offense analytics",
      "Per-model accuracy breakdown",
    ],
  },
  {
    id:          "annual",
    name:        "Annual",
    price:       "$127.99",
    cadence:     "/ year",
    description: "Best value for the full 2026 MLB season — ~$10.67/month.",
    badge:       "Best Value — Save 55%",
    badgeStyle:  "text-emerald-300 bg-emerald-500/20 border-emerald-500/40",
    features: [
      "Everything in Monthly",
      "~$10.67 / month billed annually",
      "Save 55.5% vs monthly billing",
      "Full 2026 season coverage",
      "Cancel anytime",
    ],
  },
]

// ---------------------------------------------------------------------------
// Feature comparison table rows
// ---------------------------------------------------------------------------
const COMPARE_ROWS: { label: string; free: boolean; paid: boolean; premium: boolean }[] = [
  { label: "NRFI/YRFI picks today",           free: true,  paid: true,  premium: true  },
  { label: "Unlimited picks",                  free: false, paid: true,  premium: true  },
  { label: "Probability % + recommendation",  free: true,  paid: true,  premium: true  },
  { label: "Full factor breakdown",            free: false, paid: true,  premium: true  },
  { label: "Value analysis + Kelly sizing",    free: false, paid: true,  premium: true  },
  { label: "Model consensus (Poisson/ZIP/…)", free: false, paid: true,  premium: true  },
  { label: "Expected runs + 0-run probs",      free: false, paid: true,  premium: true  },
  { label: "Pitcher / team stats deep-dive",  free: false, paid: false, premium: true  },
  { label: "History tab + accuracy tracking", free: false, paid: false, premium: true  },
  { label: "Per-model accuracy panel",        free: false, paid: false, premium: true  },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>
}) {
  const params       = await searchParams
  const currentTier  = await getSubscriptionTier()
  const subRow       = await getSubscriptionRow()

  const showSuccess  = params.success === "1"
  const showCanceled = params.canceled === "1"

  return (
    <div className="min-h-screen bg-background">
      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400">
              <Activity className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold text-foreground hidden sm:inline">
              NRFI/YRFI Prediction Engine
            </span>
          </Link>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {/* ── Success / canceled banners ─────────────────────────────────── */}
        {showSuccess && (
          <div className="mb-8 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0" />
            Your subscription is active — welcome to the full experience!
          </div>
        )}
        {showCanceled && (
          <div className="mb-8 rounded-lg border border-zinc-500/40 bg-zinc-500/10 px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0" />
            Checkout was canceled — your free plan is still active.
          </div>
        )}

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            Pick Your Plan
          </h1>
          <p className="mt-3 text-base text-muted-foreground max-w-xl mx-auto">
            Powered by a 4-model Poisson ensemble — Bayesian-shrunk, park-adjusted,
            weather-corrected. Start free, upgrade anytime.
          </p>
          {subRow && currentTier !== "free" && subRow.currentPeriodEnd && (
            <p className="mt-2 text-sm text-muted-foreground">
              Your <span className="font-semibold text-foreground capitalize">{currentTier}</span> plan
              renews on{" "}
              <span className="font-semibold text-foreground">
                {new Date(subRow.currentPeriodEnd).toLocaleDateString("en-US", {
                  month: "long",
                  day:   "numeric",
                  year:  "numeric",
                })}
              </span>
              {subRow.cancelAtPeriodEnd && (
                <span className="ml-1 text-amber-400">(cancels at period end)</span>
              )}
            </p>
          )}
        </div>

        {/* ── Pricing cards ─────────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {TIERS.map((t) => (
            <PricingCard
              key={t.id}
              tier={t}
              currentTier={currentTier as SubscriptionTier}
            />
          ))}
        </div>

        {/* ── Feature comparison table ───────────────────────────────────── */}
        <div className="mt-16">
          <h2 className="mb-6 text-center text-lg font-bold text-foreground">
            Full feature comparison
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/20">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-1/2">
                    Feature
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Free
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-sky-400">
                    Daily / Weekly
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-amber-400">
                    Monthly / Annual
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row, i) => (
                  <tr
                    key={row.label}
                    className={i % 2 === 0 ? "border-b border-border/20" : "border-b border-border/20 bg-muted/5"}
                  >
                    <td className="px-4 py-3 text-foreground/80">{row.label}</td>
                    <td className="px-4 py-3 text-center">
                      {row.free
                        ? <Check className="h-4 w-4 text-emerald-400 mx-auto" />
                        : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.paid
                        ? <Check className="h-4 w-4 text-emerald-400 mx-auto" />
                        : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.premium
                        ? <Check className="h-4 w-4 text-emerald-400 mx-auto" />
                        : <span className="text-muted-foreground/40">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── FAQ / notes ───────────────────────────────────────────────── */}
        <div className="mt-12 rounded-xl border border-border/40 bg-muted/10 px-6 py-5 text-sm text-muted-foreground space-y-2">
          <p className="font-semibold text-foreground/80">Notes</p>
          <p>• Daily picks reset at midnight UTC. Free tier: 1 pick per day.</p>
          <p>• You can cancel or change your plan at any time from the Stripe Customer Portal.</p>
          <p>• Payments are processed securely by Stripe — we never store your card details.</p>
          <p>• All tiers (Daily, Weekly, Monthly, Annual) unlock identical features — the only difference is billing cadence.</p>
        </div>
      </main>

      <footer className="mt-12 border-t border-border/30 px-4 py-6 text-center">
        <p className="text-xs text-muted-foreground">
          NRFI/YRFI Prediction Engine · Statistical model for informational purposes only · Not financial advice
        </p>
      </footer>
    </div>
  )
}
