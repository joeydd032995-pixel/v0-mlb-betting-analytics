"use client"

import { Lock, Zap, Star } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

interface Props {
  requiredTier?: "PRO" | "ELITE"
  /** Show a count e.g. "+8 more games today" */
  extraCount?: number
  className?: string
}

/**
 * Frosted-glass overlay that locks a game card for free/lower-tier users.
 * Wrap the target element in `position: relative` and render this inside it.
 */
export function PaywallOverlay({ requiredTier = "PRO", extraCount, className }: Props) {
  const router = useRouter()
  const isElite = requiredTier === "ELITE"

  return (
    <div
      className={cn(
        "absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[14px] overflow-hidden",
        className
      )}
      style={{
        backdropFilter: "blur(14px) saturate(160%)",
        WebkitBackdropFilter: "blur(14px) saturate(160%)",
        background:
          "linear-gradient(160deg, rgba(8,12,20,0.72) 0%, rgba(8,12,20,0.88) 100%)",
      }}
    >
      {/* Inner card */}
      <div
        className="flex flex-col items-center gap-3 rounded-[12px] px-5 py-4 text-center"
        style={{
          background: "rgba(12,16,24,0.92)",
          border: `1px solid ${isElite ? "rgba(255,193,7,0.3)" : "rgba(0,229,255,0.25)"}`,
          minWidth: "160px",
        }}
      >
        {/* Icon */}
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{
            background: isElite
              ? "rgba(255,193,7,0.1)"
              : "rgba(0,229,255,0.1)",
            border: `1px solid ${isElite ? "rgba(255,193,7,0.3)" : "rgba(0,229,255,0.3)"}`,
          }}
        >
          <Lock
            size={16}
            style={{ color: isElite ? "var(--hm-gold, #ffc107)" : "var(--hm-diamond, #00e5ff)" }}
          />
        </div>

        {/* Label */}
        <div className="space-y-0.5">
          <p
            className="font-mono uppercase tracking-[0.14em]"
            style={{
              fontSize: "8px",
              color: isElite ? "rgba(255,193,7,0.7)" : "rgba(0,229,255,0.7)",
            }}
          >
            {isElite ? "Elite Only" : "Pro Required"}
          </p>
          {extraCount != null && extraCount > 0 && (
            <p
              className="font-semibold"
              style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)" }}
            >
              +{extraCount} game{extraCount !== 1 ? "s" : ""} today
            </p>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={() => router.push("/pricing")}
          className="flex items-center justify-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
          style={{
            background: isElite
              ? "linear-gradient(135deg, rgba(255,193,7,0.2), rgba(255,152,0,0.15))"
              : "linear-gradient(135deg, rgba(0,229,255,0.18), rgba(0,230,118,0.12))",
            border: `1px solid ${isElite ? "rgba(255,193,7,0.45)" : "rgba(0,229,255,0.45)"}`,
            color: isElite ? "#ffc107" : "#00e5ff",
          }}
        >
          {isElite ? <Star size={11} /> : <Zap size={11} />}
          Unlock {isElite ? "Elite" : "Pro"}
        </button>
      </div>
    </div>
  )
}
