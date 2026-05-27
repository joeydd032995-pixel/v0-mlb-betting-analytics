"use client"

import { Zap, X } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"

interface Props {
  lockedCount: number
}

/**
 * Compact banner rendered above the locked game cards in the free tier view.
 * Dismissible per session.
 */
export function UpgradeBanner({ lockedCount }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const router = useRouter()

  if (dismissed || lockedCount <= 0) return null

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-[8px] px-3.5 py-2.5"
      style={{
        background:
          "linear-gradient(135deg, rgba(0,229,255,0.06), rgba(0,230,118,0.04))",
        border: "1px solid rgba(0,229,255,0.2)",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Zap
          size={13}
          style={{ color: "var(--hm-diamond, #00e5ff)", flexShrink: 0 }}
        />
        <p
          className="font-ui truncate"
          style={{ fontSize: "12px", color: "rgba(255,255,255,0.65)" }}
        >
          <span
            style={{ color: "rgba(255,255,255,0.9)", fontWeight: 600 }}
          >
            {lockedCount} more game{lockedCount !== 1 ? "s" : ""}
          </span>{" "}
          locked today —{" "}
          <button
            onClick={() => router.push("/pricing")}
            className="underline underline-offset-2 transition-opacity hover:opacity-80"
            style={{ color: "var(--hm-diamond, #00e5ff)" }}
          >
            Unlock with Pro →
          </button>
        </p>
      </div>

      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 transition-opacity hover:opacity-70"
        style={{ color: "rgba(255,255,255,0.35)" }}
        aria-label="Dismiss upgrade banner"
      >
        <X size={13} />
      </button>
    </div>
  )
}
