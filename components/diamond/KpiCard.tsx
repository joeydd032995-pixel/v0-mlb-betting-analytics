import { cn } from "@/lib/utils"
import { InfoTip } from "@/components/diamond/InfoTip"

type KpiVariant = "diamond" | "grass" | "blood" | "gold" | "slate" | "cy" | "gr" | "bl" | "tl"

interface KpiCardProps {
  metric: string
  value: string | number
  delta?: string
  deltaPositive?: boolean
  variant?: KpiVariant
  className?: string
  icon?: React.ReactNode
  subtext?: string
  /**
   * One line on what the tile is showing. Rendered in normal case beneath the
   * value — unlike `subtext`, which is a short uppercase mono label.
   */
  description?: string
  /** What this tile does not cover — shown on hover/focus of an ⓘ by the label. */
  info?: string
}

const VARIANT_CFG: Record<KpiVariant, { bar: string; text: string }> = {
  diamond: { bar: "linear-gradient(90deg, var(--hm-diamond), transparent)", text: "var(--hm-diamond)" },
  grass:   { bar: "linear-gradient(90deg, var(--hm-grass), transparent)",   text: "var(--hm-grass)" },
  blood:   { bar: "linear-gradient(90deg, var(--hm-blood), transparent)",   text: "var(--hm-blood)" },
  gold:    { bar: "linear-gradient(90deg, var(--hm-gold), transparent)",    text: "var(--hm-gold)" },
  slate:   { bar: "linear-gradient(90deg, var(--hm-slate), transparent)",   text: "var(--hm-mist)" },
  // legacy aliases
  cy:      { bar: "linear-gradient(90deg, var(--hm-diamond), transparent)", text: "var(--hm-diamond)" },
  gr:      { bar: "linear-gradient(90deg, var(--hm-grass), transparent)",   text: "var(--hm-grass)" },
  bl:      { bar: "linear-gradient(90deg, #5c8bff, transparent)",           text: "#5c8bff" },
  tl:      { bar: "linear-gradient(90deg, #00bcd4, transparent)",           text: "#00bcd4" },
}

export function KpiCard({
  metric, value, delta, deltaPositive, variant = "cy", className, icon, subtext, description, info,
}: KpiCardProps) {
  const cfg = VARIANT_CFG[variant]
  return (
    <div className={cn("hm-panel-lift overflow-hidden px-4 py-[14px] group transition-colors", className)}>
      {/* Top-right icon */}
      {icon && (
        <div className="absolute top-3 right-3 opacity-40" style={{ color: cfg.text }}>
          {icon}
        </div>
      )}

      {/* Bottom accent bar */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0, right: 0, bottom: 0,
          height: "2px",
          background: cfg.bar,
          opacity: 0.8,
        }}
      />

      <div
        className={cn("flex items-center gap-1 font-mono uppercase tracking-[0.14em]", icon && "pr-5")}
        style={{ fontSize: "9px", color: "var(--hm-smoke)" }}
      >
        {metric}
        {info && <InfoTip text={info} />}
      </div>

      <div
        className="font-headline leading-none mt-[6px] tracking-[0.01em] text-[26px] sm:text-[30px] lg:text-[32px]"
        style={{ color: "var(--hm-chalk)" }}
      >
        {value}
      </div>

      {subtext && (
        <div
          className="font-mono uppercase tracking-[0.14em] mt-[4px]"
          style={{ fontSize: "8px", color: "var(--hm-smoke)" }}
        >
          {subtext}
        </div>
      )}

      {description && (
        <p
          className="mt-[6px] font-mono text-[10px] leading-snug"
          style={{ color: "var(--hm-smoke)" }}
        >
          {description}
        </p>
      )}

      {delta && (
        <div
          className={cn("font-mono mt-[5px] uppercase tracking-[0.14em]")}
          style={{
            fontSize: "9px",
            color: deltaPositive === true
              ? "var(--hm-grass)"
              : deltaPositive === false
                ? "var(--hm-blood)"
                : "var(--hm-smoke)",
          }}
        >
          {deltaPositive === true ? "▲ " : deltaPositive === false ? "▼ " : ""}{delta}
        </div>
      )}
    </div>
  )
}
