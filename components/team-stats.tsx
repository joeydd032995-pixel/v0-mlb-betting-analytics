"use client"

import type { Team } from "@/lib/types"
import { Card } from "@/components/ui/card"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, HelpCircle } from "lucide-react"
import { METRIC_GLOSSARY } from "@/lib/types"

interface Props {
  teams: Team[]
}

function pct(n: number, d = 1) {
  return `${(n * 100).toFixed(d)}%`
}

function yrfiColor(rate: number) {
  if (rate >= 0.44) return "text-rose-400"
  if (rate >= 0.38) return "text-amber-400"
  if (rate >= 0.32) return "text-sky-400"
  return "text-emerald-400"
}

function RateBar({ rate, max = 0.55 }: { rate: number; max?: number }) {
  const fill = Math.min(rate / max, 1) * 100
  const color =
    rate >= 0.44 ? "bg-rose-500" : rate >= 0.38 ? "bg-amber-500" : rate >= 0.32 ? "bg-sky-500" : "bg-emerald-500"
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${fill}%` }} />
    </div>
  )
}

function TableHeaderWithTooltip({
  label,
  glossaryKey,
  align = "left",
}: {
  label: string
  glossaryKey?: keyof typeof METRIC_GLOSSARY
  align?: "left" | "right"
}) {
  const alignClass = align === "right" ? "text-right" : "text-left"
  if (!glossaryKey) {
    return (
      <span className={`text-xs font-semibold uppercase tracking-wide text-muted-foreground ${alignClass}`}>
        {label}
      </span>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`flex items-center gap-1 cursor-help ${alignClass}`}>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
          <HelpCircle className="h-3 w-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors" />
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{METRIC_GLOSSARY[glossaryKey]}</TooltipContent>
    </Tooltip>
  )
}

export function TeamStats({ teams }: Props) {
  const sorted = [...teams].sort(
    (a, b) => b.firstInning.yrfiRate - a.firstInning.yrfiRate
  )

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          <span className="text-muted-foreground">Aggressive (≥44% YRFI)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="text-muted-foreground">Active (38–43%)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-sky-500" />
          <span className="text-muted-foreground">Average (32–37%)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground">Quiet (&lt;32%)</span>
        </span>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-muted/20">
              <th className="px-4 py-3"><TableHeaderWithTooltip label="Team" /></th>
              <th className="px-3 py-3"><TableHeaderWithTooltip label="YRFI Rate" glossaryKey="yrfiRate" /></th>
              <th className="px-3 py-3"><TableHeaderWithTooltip label="xR/1st" glossaryKey="xR" align="right" /></th>
              <th className="px-3 py-3"><TableHeaderWithTooltip label="OPS" glossaryKey="ops" align="right" /></th>
              <th className="px-3 py-3"><TableHeaderWithTooltip label="wOBA" glossaryKey="woba" align="right" /></th>
              <th className="px-3 py-3"><TableHeaderWithTooltip label="K%" glossaryKey="kRate" align="right" /></th>
              <th className="px-3 py-3"><TableHeaderWithTooltip label="BB%" glossaryKey="bbRate" align="right" /></th>
              <th className="px-3 py-3"><TableHeaderWithTooltip label="Home YRFI" glossaryKey="yrfiRate" align="right" /></th>
              <th className="px-3 py-3"><TableHeaderWithTooltip label="Away YRFI" glossaryKey="yrfiRate" align="right" /></th>
              <th className="px-3 py-3"><TableHeaderWithTooltip label="L10" align="right" /></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, idx) => {
              const fi = t.firstInning
              const trend =
                fi.last10YrfiRate > fi.yrfiRate + 0.04
                  ? "up"
                  : fi.last10YrfiRate < fi.yrfiRate - 0.04
                    ? "down"
                    : "flat"
              return (
                <tr key={t.id} className="border-b border-border/30 transition-colors hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4 text-right">{idx + 1}</span>
                      <div>
                        <p className="font-semibold text-foreground">{t.city} {t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.league} {t.division}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="space-y-1">
                      <RateBar rate={fi.yrfiRate} />
                      <span className={cn("text-sm font-bold tabular-nums", yrfiColor(fi.yrfiRate))}>
                        {pct(fi.yrfiRate)}
                      </span>
                    </div>
                  </td>
                  <td className={cn("px-3 py-3 text-right tabular-nums font-medium", yrfiColor(fi.yrfiRate))}>
                    {fi.runsPerGame.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                    {fi.ops.toFixed(3)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                    {fi.woba.toFixed(3)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                    {pct(fi.kRate)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                    {pct(fi.bbRate)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                    {pct(fi.homeYrfiRate)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                    {pct(fi.awayYrfiRate)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-rose-400" />}
                      {trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-emerald-400" />}
                      <span className={cn("tabular-nums text-xs font-medium", yrfiColor(fi.last10YrfiRate))}>
                        {pct(fi.last10YrfiRate)}
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {sorted.map((t, idx) => {
          const fi = t.firstInning
          return (
            <Card key={t.id} className="border border-border/50 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                    <p className="font-semibold">{t.abbreviation}</p>
                    <span className="text-xs text-muted-foreground">{t.league}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.city} {t.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">YRFI Rate</p>
                  <p className={cn("text-lg font-bold tabular-nums", yrfiColor(fi.yrfiRate))}>
                    {pct(fi.yrfiRate)}
                  </p>
                </div>
              </div>
              <div className="mt-2">
                <RateBar rate={fi.yrfiRate} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">xR/1st</p>
                  <p className="font-semibold tabular-nums">{fi.runsPerGame.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">OPS</p>
                  <p className="font-semibold tabular-nums">{fi.ops.toFixed(3)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">L10 YRFI</p>
                  <p className={cn("font-semibold tabular-nums", yrfiColor(fi.last10YrfiRate))}>
                    {pct(fi.last10YrfiRate)}
                  </p>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        * YRFI Rate = % of games where the team scored in the 1st inning. L10 = last 10 games. All stats reflect 2026 season through April 4.
      </p>
    </div>
  )
}
