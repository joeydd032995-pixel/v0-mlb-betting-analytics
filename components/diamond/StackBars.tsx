"use client"

import { cn } from "@/lib/utils"

interface StackBarRow {
  name: string
  role?: string
  fb?: number   // four-seam fastball %
  cb?: number   // curveball %
  sl?: number   // slider %
  ch?: number   // changeup %
  ip?: string   // innings pitched label
}

interface StackBarsProps {
  data: StackBarRow[]
  className?: string
}

const COLORS = {
  fb: "#22d3ee",
  cb: "#10b981",
  sl: "#3b82f6",
  ch: "#a7f3d0",
}

export function StackBars({ data, className }: StackBarsProps) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {data.map((row, i) => {
        const total = (row.fb ?? 0) + (row.cb ?? 0) + (row.sl ?? 0) + (row.ch ?? 0)
        return (
          <div key={i} className="grid grid-cols-[80px_1fr_50px] gap-3 items-center">
            <div className="font-jet text-[11px] text-ds-ink-2 tracking-[0.05em] truncate">
              {row.name}
              {row.role && <span className="block text-ds-muted text-[9px] uppercase tracking-[0.15em] mt-0.5">{row.role}</span>}
            </div>
            <div className="h-5 bg-[#0a1426] border border-ds-line rounded-[5px] overflow-hidden flex">
              {(["fb", "cb", "sl", "ch"] as const).map((key) => {
                const val = row[key] ?? 0
                if (!val) return null
                const pct = total > 0 ? (val / total) * 100 : 0
                const labels: Record<string, string> = { fb: "FB", cb: "CB", sl: "SL", ch: "CH" }
                const bgs: Record<string, string> = {
                  fb: "linear-gradient(90deg,#22d3ee,#06b6d4)",
                  cb: "linear-gradient(90deg,#10b981,#14b8a6)",
                  sl: "linear-gradient(90deg,#3b82f6,#1d4ed8)",
                  ch: "linear-gradient(90deg,#a7f3d0,#67e8f9)",
                }
                return (
                  <div
                    key={key}
                    className="h-full grid place-items-center font-jet font-semibold text-[9px] tracking-[0.05em]"
                    style={{
                      width: `${pct}%`,
                      background: bgs[key],
                      color: key === "sl" ? "rgba(255,255,255,0.9)" : "rgba(4,16,24,0.75)",
                    }}
                  >
                    {pct > 14 ? labels[key] : ""}
                  </div>
                )
              })}
            </div>
            <div className="font-jet text-[11px] text-ds-ink-2 text-right">{row.ip ?? ""}</div>
          </div>
        )
      })}
      {/* Legend */}
      <div className="flex gap-4 justify-end font-jet text-[10px] text-ds-muted uppercase tracking-[0.08em] flex-wrap mt-1">
        {Object.entries(COLORS).map(([k, c]) => (
          <span key={k}>
            <i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-[-1px]" style={{ background: c }} />
            {k.toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  )
}
