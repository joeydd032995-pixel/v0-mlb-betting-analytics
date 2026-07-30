import { cn } from "@/lib/utils"
import { InfoTip } from "@/components/diamond/InfoTip"

type AccentVariant = "diamond" | "grass" | "blood" | "gold" | "none"

const ACCENT_COLOR: Record<AccentVariant, string> = {
  diamond: "rgba(0,229,255,0.27)",
  grass:   "rgba(0,230,118,0.27)",
  blood:   "rgba(255,23,68,0.27)",
  gold:    "rgba(255,214,0,0.27)",
  none:    "transparent",
}

interface PanelProps {
  children: React.ReactNode
  className?: string
  title?: string
  chip?: string
  accent?: AccentVariant
  /** One line on what this panel shows, rendered under the title. */
  description?: string
  /** What it does not cover — shown on hover/focus of an ⓘ beside the title. */
  info?: string
}

export function Panel({
  children, className, title, chip, accent = "diamond", description, info,
}: PanelProps) {
  const topColor = ACCENT_COLOR[accent]
  return (
    <div
      className={cn("hm-panel p-[18px]", className)}
      style={{ "--panel-accent": topColor } as React.CSSProperties}
    >
      {/* Top accent edge */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          height: "1px",
          background: topColor,
          pointerEvents: "none",
        }}
      />

      {title && (
        <div className={cn("flex items-center justify-between gap-2", description ? "mb-[6px]" : "mb-[14px]")}>
          <h3
            className="flex items-center gap-1 font-mono uppercase tracking-[0.24em]"
            style={{ fontSize: "10px", color: "var(--hm-smoke)" }}
          >
            {title}
            {info && <InfoTip text={info} />}
          </h3>
          {chip && (
            <span
              className="font-mono tracking-[0.08em] rounded-[4px] px-[8px] py-[2px]"
              style={{
                fontSize: "9px",
                color: "var(--hm-diamond)",
                background: "rgba(0,229,255,0.08)",
                border: "1px solid rgba(0,229,255,0.25)",
              }}
            >
              {chip}
            </span>
          )}
        </div>
      )}
      {description && (
        <p
          className="font-mono text-[10px] leading-relaxed mb-[14px]"
          style={{ color: "var(--hm-smoke)" }}
        >
          {description}
        </p>
      )}
      {children}
    </div>
  )
}
