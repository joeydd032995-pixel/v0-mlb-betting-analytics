import { cn } from "@/lib/utils"

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
}

const VARIANT_CFG: Record<KpiVariant, { bar: string; hover: string; text: string }> = {
  diamond: { bar: "linear-gradient(90deg, var(--hm-diamond), transparent)", hover: "rgba(0,229,255,0.15)", text: "var(--hm-diamond)" },
  grass:   { bar: "linear-gradient(90deg, var(--hm-grass), transparent)",   hover: "rgba(0,230,118,0.15)", text: "var(--hm-grass)" },
  blood:   { bar: "linear-gradient(90deg, var(--hm-blood), transparent)",   hover: "rgba(255,23,68,0.15)",  text: "var(--hm-blood)" },
  gold:    { bar: "linear-gradient(90deg, var(--hm-gold), transparent)",    hover: "rgba(255,214,0,0.15)",  text: "var(--hm-gold)" },
  slate:   { bar: "linear-gradient(90deg, var(--hm-slate), transparent)",   hover: "rgba(96,125,139,0.15)", text: "var(--hm-mist)" },
  // legacy aliases
  cy:      { bar: "linear-gradient(90deg, var(--hm-diamond), transparent)", hover: "rgba(0,229,255,0.15)", text: "var(--hm-diamond)" },
  gr:      { bar: "linear-gradient(90deg, var(--hm-grass), transparent)",   hover: "rgba(0,230,118,0.15)", text: "var(--hm-grass)" },
  bl:      { bar: "linear-gradient(90deg, #5c8bff, transparent)",           hover: "rgba(92,139,255,0.15)", text: "#5c8bff" },
  tl:      { bar: "linear-gradient(90deg, #00bcd4, transparent)",           hover: "rgba(0,188,212,0.15)",  text: "#00bcd4" },
}

export function KpiCard({
  metric, value, delta, deltaPositive, variant = "cy", className, icon, subtext,
}: KpiCardProps) {
  const cfg = VARIANT_CFG[variant]
  return (
    <div
      className={cn("relative overflow-hidden rounded-xl px-4 py-[14px] group transition-colors", className)}
      style={{
        background: "linear-gradient(160deg, var(--hm-pitch) 0%, var(--hm-void) 100%)",
        border: "1px solid var(--hm-fence)",
      }}
    >
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
        className="font-mono uppercase tracking-[0.24em]"
        style={{ fontSize: "9px", color: "var(--hm-smoke)" }}
      >
        {metric}
      </div>

      <div
        className="font-headline leading-none mt-[6px] tracking-[0.01em] text-[26px] sm:text-[30px] lg:text-[32px]"
        style={{ color: "var(--hm-chalk)" }}
      >
        {value}
      </div>

      {subtext && (
        <div
          className="font-mono uppercase tracking-[0.16em] mt-[4px]"
          style={{ fontSize: "8px", color: "var(--hm-smoke)" }}
        >
          {subtext}
        </div>
      )}

      {delta && (
        <div
          className={cn("font-mono mt-[5px] uppercase tracking-[0.05em]")}
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
