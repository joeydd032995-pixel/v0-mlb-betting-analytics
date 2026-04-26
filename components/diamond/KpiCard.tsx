import { cn } from "@/lib/utils"

interface KpiCardProps {
  metric: string
  value: string | number
  delta?: string
  deltaPositive?: boolean
  variant?: "cy" | "gr" | "bl" | "tl"
  className?: string
}

const barVariants = {
  cy: "",
  gr: "ds-kpi-bar-gr",
  bl: "ds-kpi-bar-bl",
  tl: "ds-kpi-bar-gr",
}

export function KpiCard({ metric, value, delta, deltaPositive, variant = "cy", className }: KpiCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl bg-[#0a1426] border border-ds-line px-4 py-[14px] ds-kpi-bar",
        barVariants[variant],
        className
      )}
    >
      <div className="font-jet text-[10px] uppercase tracking-[0.22em] text-ds-muted">{metric}</div>
      <div
        className="font-display text-[28px] font-semibold tracking-[-0.02em] mt-[6px] leading-none"
        style={{ color: "var(--ds-ink)" }}
      >
        {value}
      </div>
      {delta && (
        <div
          className={cn(
            "font-jet text-[10px] mt-[6px] uppercase tracking-[0.05em]",
            deltaPositive !== false ? "text-ds-gr" : "text-ds-bad"
          )}
        >
          {deltaPositive !== false ? "▲" : "▼"} {delta}
        </div>
      )}
    </div>
  )
}
