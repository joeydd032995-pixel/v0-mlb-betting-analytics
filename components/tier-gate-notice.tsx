// components/tier-gate-notice.tsx
// Full-page upsell / retry panel for server-rendered pages that are gated on
// subscription tier. Server-component friendly (no hooks, plain links).

import Link from "next/link"
import type { Tier } from "@/lib/tiers"

export function TierGateNotice({ requiredTier, feature }: { requiredTier: Tier; feature: string }) {
  const isElite = requiredTier === "ELITE"
  const accent = isElite ? "#ffc107" : "#00e5ff"

  return (
    <div
      className="rounded-xl p-12 text-center space-y-3"
      style={{
        background: "var(--ds-panel, rgba(12,16,24,0.92))",
        border: `1px solid ${isElite ? "rgba(255,193,7,0.3)" : "rgba(0,229,255,0.25)"}`,
      }}
    >
      <p className="font-mono uppercase tracking-[0.14em]" style={{ fontSize: "10px", color: accent }}>
        {requiredTier} only
      </p>
      <p className="font-display text-[18px] font-semibold" style={{ color: "var(--ds-ink, #fff)" }}>
        {feature} is part of {requiredTier === "ELITE" ? "Elite" : "Pro"}
      </p>
      <p className="font-jet text-[12px]" style={{ color: "var(--ds-muted, rgba(255,255,255,0.5))" }}>
        Upgrade to unlock it for every game on the slate.
      </p>
      <Link
        href="/pricing"
        className="inline-block mt-2 rounded-md px-5 py-2 text-xs font-semibold"
        style={{
          background: isElite
            ? "linear-gradient(135deg, rgba(255,193,7,0.2), rgba(255,152,0,0.15))"
            : "linear-gradient(135deg, rgba(0,229,255,0.18), rgba(0,230,118,0.12))",
          border: `1px solid ${isElite ? "rgba(255,193,7,0.45)" : "rgba(0,229,255,0.45)"}`,
          color: accent,
        }}
      >
        View plans
      </Link>
    </div>
  )
}

// Shown when the tier lookup itself failed — we don't know what the user is
// entitled to, so we say that rather than showing them an upsell for something
// they may already own.
export function TierUnresolvedNotice() {
  return (
    <div
      className="rounded-xl p-12 text-center space-y-3"
      style={{
        background: "var(--ds-panel, rgba(12,16,24,0.92))",
        border: "1px solid var(--ds-line, rgba(255,255,255,0.1))",
      }}
    >
      <p className="font-display text-[18px] font-semibold" style={{ color: "var(--ds-ink, #fff)" }}>
        Couldn&apos;t verify your subscription
      </p>
      <p className="font-jet text-[12px]" style={{ color: "var(--ds-muted, rgba(255,255,255,0.5))" }}>
        Your access hasn&apos;t changed — this is usually temporary. Reload the page to try again.
      </p>
    </div>
  )
}
