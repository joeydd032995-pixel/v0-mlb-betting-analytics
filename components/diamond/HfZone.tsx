"use client"

import { useState } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface HfZoneProps {
  /** 25 values (5×5), row-major order, top-left = outside high-away */
  values: number[]
  /** Label for each cell (e.g. zone number or location name) */
  labels?: string[]
  /** Max value for color scaling */
  maxValue?: number
  caption?: string
  className?: string
  onCellClick?: (index: number, value: number) => void
}

function cellColor(v: number, max: number) {
  const t = Math.min(1, v / (max || 1))
  // low→dark teal, high→cyan→green-yellow
  if (t < 0.33) return `rgba(11,91,110,${0.3 + t * 1.5})`
  if (t < 0.66) return `rgba(34,211,238,${0.35 + t * 0.6})`
  return `rgba(16,185,129,${0.5 + t * 0.5})`
}

export function HfZone({
  values,
  labels,
  maxValue,
  caption,
  className,
  onCellClick,
}: HfZoneProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const max = maxValue ?? Math.max(...values, 0.01)

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        className="relative grid grid-cols-5 gap-[3px] p-[10px] bg-[#06101f] border border-ds-line rounded-[10px] max-w-[260px] mx-auto"
      >
        {/* Strike zone border overlay */}
        <div
          className="pointer-events-none absolute border border-dashed border-white/25 rounded-[4px]"
          style={{ left: "calc(20% + 8px)", right: "calc(20% + 8px)", top: "calc(20% + 8px)", bottom: "calc(20% + 8px)" }}
        />
        {values.map((v, i) => (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  "aspect-square rounded-[3px] flex items-center justify-center font-jet text-[9px] text-white/60 transition-all duration-150",
                  hovered === i && "ring-1 ring-ds-cy ring-offset-0",
                  onCellClick && "cursor-pointer hover:opacity-90"
                )}
                style={{ background: cellColor(v, max) }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onCellClick?.(i, v)}
              >
                {labels?.[i] ?? ""}
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="font-jet text-[11px] bg-ds-panel border-ds-line text-ds-ink"
            >
              <p>{labels?.[i] ? `Zone ${labels[i]}: ` : `Cell ${i + 1}: `}<strong>{(v * 100).toFixed(1)}%</strong></p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex items-center justify-between font-jet text-[10px] text-ds-muted max-w-[260px] mx-auto w-full uppercase tracking-[0.1em]">
        <span>Low</span>
        <div className="flex-1 h-2 mx-2.5 rounded-full" style={{ background: "linear-gradient(90deg,#0a2a3a,#0b5b6e,#22d3ee,#10b981,#fffbe0)" }} />
        <span>High</span>
      </div>
      {caption && (
        <p className="text-center font-jet text-[10px] text-ds-muted uppercase tracking-[0.15em]">{caption}</p>
      )}
    </div>
  )
}
