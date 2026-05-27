// app/pricing/page.tsx
// Standalone pricing page — SEO-friendly, server component shell
// with a client component for the interactive billing toggle + CTAs.

import type { Metadata } from "next"
import { PricingClient } from "@/components/pricing-client"

export const metadata: Metadata = {
  title: "Pricing — Homeplate Metrics",
  description:
    "Unlock every NRFI/YRFI edge. Pro and Elite plans for serious MLB bettors.",
}

export default function PricingPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--hm-abyss)" }}>
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-16">
        <PricingClient />
      </main>
    </div>
  )
}
