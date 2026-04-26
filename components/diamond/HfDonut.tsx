"use client"

import { cn } from "@/lib/utils"

interface HfDonutProps {
  /** Value 0–1 */
  value: number
  label?: string
  sublabel?: string
  size?: number
  strokeWidth?: number
  color?: string
  className?: string
}

export function HfDonut({
  value,
  label,
  sublabel,
  size = 220,
  strokeWidth = 18,
  color = "var(--ds-cy)",
  className,
}: HfDonutProps) {
  const r = (size - strokeWidth * 2) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.max(0, Math.min(1, value)))

  const cx = size / 2
  const cy = size / 2

  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        style={{ filter: "drop-shadow(0 10px 30px rgba(34,211,238,0.2))" }}
      >
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="var(--ds-line)"
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      {/* Center text */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none"
      >
        {sublabel && (
          <span className="font-jet text-[9px] uppercase tracking-[0.24em] text-ds-muted">{sublabel}</span>
        )}
        {label && (
          <span className="font-display text-[24px] font-semibold tracking-[-0.02em] mt-[2px] text-ds-ink">
            {label}
          </span>
        )}
      </div>
    </div>
  )
}
