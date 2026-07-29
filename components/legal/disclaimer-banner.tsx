import Link from "next/link"

export function DisclaimerBanner() {
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-2 rounded-[6px] px-3 py-2 text-center"
      style={{
        background: "rgba(255,23,68,0.06)",
        border: "1px solid rgba(255,23,68,0.18)",
      }}
    >
      <span
        className="font-mono tracking-[0.02em]"
        style={{ fontSize: "11px", color: "var(--hm-smoke)" }}
      >
        Homeplate Metrics is a statistical analytics tool, not a sportsbook. Predictions are probability estimates, not guarantees. 18+ only.
      </span>
      <Link
        href="/disclaimer"
        className="transition-colors"
        style={{ fontSize: "11px", color: "var(--hm-diamond)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}
      >
        Responsible Gambling ↗
      </Link>
    </div>
  )
}
