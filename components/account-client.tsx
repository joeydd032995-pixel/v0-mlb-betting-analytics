"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Crown, Zap, Star, CreditCard, ExternalLink, Copy, Check } from "lucide-react"
import type { UserTierInfo } from "@/lib/subscription"
import { cn } from "@/lib/utils"

interface Props {
  tierInfo: UserTierInfo
  userId: string
}

const TIER_CONFIG = {
  FREE: {
    label: "Free",
    icon: <Crown size={16} style={{ color: "rgba(255,255,255,0.4)" }} />,
    color: "rgba(255,255,255,0.4)",
    accent: "rgba(255,255,255,0.07)",
  },
  PRO: {
    label: "Pro",
    icon: <Zap size={16} style={{ color: "#00e5ff" }} />,
    color: "#00e5ff",
    accent: "rgba(0,229,255,0.07)",
  },
  ELITE: {
    label: "Elite",
    icon: <Star size={16} style={{ color: "#ffc107" }} />,
    color: "#ffc107",
    accent: "rgba(255,193,7,0.06)",
  },
}

export function AccountClient({ tierInfo, userId }: Props) {
  const [managingBilling, setManagingBilling] = useState(false)
  const [copied, setCopied] = useState(false)
  const router = useRouter()

  function copyUserId() {
    navigator.clipboard.writeText(userId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  const config = TIER_CONFIG[tierInfo.tier]

  async function openBillingPortal() {
    setManagingBilling(true)
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error ?? "Portal error")
      window.location.href = data.url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open billing portal")
      setManagingBilling(false)
    }
  }

  const periodEndStr = tierInfo.currentPeriodEnd
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(tierInfo.currentPeriodEnd)
    : null

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p
          className="font-mono uppercase tracking-[0.18em] text-xs mb-2"
          style={{ color: "rgba(0,229,255,0.6)" }}
        >
          Account
        </p>
        <h1
          className="font-display text-3xl tracking-tight"
          style={{ color: "var(--hm-chalk, #e8eaf0)" }}
        >
          Subscription
        </h1>
      </div>

      {/* Current plan card */}
      <div
        className="rounded-[16px] p-6 space-y-4"
        style={{
          background: config.accent,
          border: `1px solid ${config.color}30`,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {config.icon}
            <span
              className="font-mono uppercase tracking-[0.15em] text-sm font-semibold"
              style={{ color: config.color }}
            >
              {config.label}
            </span>
          </div>
          {tierInfo.isActive && (
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: "rgba(0,230,118,0.1)", color: "#00e676" }}
            >
              Active
            </span>
          )}
        </div>

        {tierInfo.cancelAtPeriodEnd && periodEndStr && (
          <p className="text-xs" style={{ color: "rgba(255,193,7,0.7)" }}>
            ⚠️ Cancels on {periodEndStr} — you keep access until then.
          </p>
        )}

        {!tierInfo.cancelAtPeriodEnd && periodEndStr && (
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            Renews {periodEndStr}
          </p>
        )}

        {tierInfo.tier === "FREE" && (
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            You&apos;re on the free plan — 1 game preview per day.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-3">
        {tierInfo.stripeCustomerId && (
          <button
            onClick={openBillingPortal}
            disabled={managingBilling}
            className={cn(
              "flex w-full items-center justify-between rounded-[12px] px-5 py-4 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50",
            )}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.7)",
            }}
          >
            <div className="flex items-center gap-3">
              <CreditCard size={15} style={{ color: "rgba(255,255,255,0.4)" }} />
              <span>Manage billing &amp; invoices</span>
            </div>
            {managingBilling
              ? <span className="text-xs text-white/30">Opening…</span>
              : <ExternalLink size={13} style={{ color: "rgba(255,255,255,0.25)" }} />
            }
          </button>
        )}

        {tierInfo.tier !== "ELITE" && (
          <button
            onClick={() => router.push("/pricing")}
            className="flex w-full items-center justify-between rounded-[12px] px-5 py-4 text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              background: tierInfo.tier === "FREE"
                ? "rgba(0,229,255,0.06)"
                : "rgba(255,193,7,0.05)",
              border: tierInfo.tier === "FREE"
                ? "1px solid rgba(0,229,255,0.2)"
                : "1px solid rgba(255,193,7,0.2)",
              color: tierInfo.tier === "FREE" ? "#00e5ff" : "#ffc107",
            }}
          >
            <div className="flex items-center gap-3">
              {tierInfo.tier === "FREE"
                ? <Zap size={15} style={{ flexShrink: 0 }} />
                : <Star size={15} style={{ flexShrink: 0 }} />
              }
              <span>
                {tierInfo.tier === "FREE"
                  ? "Upgrade to Pro — unlock all games"
                  : "Upgrade to Elite — unlock model breakdown"}
              </span>
            </div>
            <ExternalLink size={13} style={{ opacity: 0.5 }} />
          </button>
        )}
      </div>

      {/* User ID — for admin setup */}
      <div
        className="rounded-[12px] px-5 py-4 space-y-2"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <p className="font-mono uppercase tracking-[0.15em] text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
          Your User ID
        </p>
        <div className="flex items-center justify-between gap-3">
          <code className="text-xs break-all" style={{ color: "rgba(255,255,255,0.55)" }}>
            {userId}
          </code>
          <button
            onClick={copyUserId}
            className="shrink-0 rounded-md p-1.5 transition-opacity hover:opacity-80"
            style={{ background: "rgba(255,255,255,0.06)" }}
            aria-label="Copy user ID"
          >
            {copied
              ? <Check size={13} style={{ color: "#00e676" }} />
              : <Copy size={13} style={{ color: "rgba(255,255,255,0.4)" }} />
            }
          </button>
        </div>
      </div>
    </div>
  )
}
