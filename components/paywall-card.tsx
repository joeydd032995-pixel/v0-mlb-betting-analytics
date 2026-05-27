"use client"

import { Lock } from "lucide-react"
import { useRouter } from "next/navigation"

/**
 * Frosted-glass placeholder card rendered in place of a locked game.
 * Matches the approximate height of a collapsed GamePredictionCard.
 */
export function PaywallCard() {
  const router = useRouter()

  return (
    <div
      className="relative rounded-[14px] overflow-hidden cursor-pointer"
      style={{
        height: "220px",
        background: "var(--hm-pitch, #0d1117)",
        border: "1px solid var(--hm-fence, rgba(255,255,255,0.06))",
      }}
      onClick={() => router.push("/pricing")}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && router.push("/pricing")}
      aria-label="Unlock this game with Pro"
    >
      {/* Subtle shimmer background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, rgba(0,229,255,0.02) 0%, transparent 60%, rgba(0,230,118,0.02) 100%)",
        }}
      />

      {/* Blurred content silhouette */}
      <div
        className="absolute inset-0 flex flex-col gap-3 p-4"
        style={{ filter: "blur(3px)", opacity: 0.18, pointerEvents: "none" }}
      >
        <div className="flex items-center justify-between">
          <div className="h-5 w-28 rounded bg-white/20" />
          <div className="h-5 w-16 rounded bg-white/20" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-white/20" />
          <div className="h-16 w-16 rounded bg-white/20" />
          <div className="h-12 w-12 rounded-full bg-white/20" />
        </div>
        <div className="h-3 w-3/4 rounded bg-white/20" />
        <div className="h-3 w-1/2 rounded bg-white/20" />
      </div>

      {/* Lock CTA */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{
            background: "rgba(0,229,255,0.08)",
            border: "1px solid rgba(0,229,255,0.25)",
          }}
        >
          <Lock size={15} style={{ color: "rgba(0,229,255,0.8)" }} />
        </div>
        <p
          className="font-mono uppercase tracking-[0.12em]"
          style={{ fontSize: "9px", color: "rgba(0,229,255,0.6)" }}
        >
          Pro Required
        </p>
        <p
          className="font-semibold transition-colors hover:text-white"
          style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}
        >
          Tap to unlock →
        </p>
      </div>
    </div>
  )
}
