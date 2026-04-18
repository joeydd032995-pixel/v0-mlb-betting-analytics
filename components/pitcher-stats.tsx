"use client"

import type { Pitcher, Team } from "@/lib/types"
import { Card } from "@/components/ui/card"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { bayesianShrinkage } from "@/lib/nrfi-models"
import { METRIC_GLOSSARY } from "@/lib/types"
import { HelpCircle } from "lucide-react"

interface Props {
  pitchers: Pitcher[]
  teams: Map<string, Team>
}

function pct(n: number, decimals = 1) {
  return `${(n * 100).toFixed(decimals)}%`
}

function nrfiColor(rate: number) {
  if (rate >= 0.74) return "text-emerald-400"
  if (rate >= 0.66) return "text-sky-400"
  if (rate >= 0.60) return "text-amber-400"
  return "text-rose-400"
}

function NrfiBar({ rate }: { rate: number }) {
  const pctVal = rate * 100
  const color =
    rate >= 0.74 ? "bg-emerald-500" : rate >= 0.66 ? "bg-sky-500" : rate >= 0.60 ? "bg-amber-500" : "bg-rose-500"
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pctVal}%` }} />
      </div>
      <span className={cn("text-sm font-bold tabular-nums", nrfiColor(rate))}>{pct(rate)}</span>
    </div>
  )
}

// ─── Idea 2: Bayesian Sample Size Meter ──────────────────────────────────────

/**
 * Shows how much the prediction model trusts this pitcher's season data
 * versus the league average. More starts = more season data weight.
 *
 * Rationale: A pitcher with 3 starts and 100% NRFI is likely overperforming.
 * The Bayesian model automatically shrinks that toward the 62% league mean.
 * This bar makes that adjustment visible to the bettor.
 */
function BayesianTrustMeter({
  nrfiRate,
  starts,
}: {
  nrfiRate: number
  starts: number
}) {
  const { shrunkenRate, dataWeight } = bayesianShrinkage(nrfiRate, starts)
  const seasonPct = Math.round(dataWeight * 100)
  const leaguePct = 100 - seasonPct
  const rawPct = Math.round(nrfiRate * 100)
  const adjPct = Math.round(shrunkenRate * 100)
  const changed = Math.abs(rawPct - adjPct) >= 2  // only note if shrinkage is meaningful

  const barColor =
    dataWeight >= 0.80 ? "bg-emerald-500" :
    dataWeight >= 0.60 ? "bg-amber-500" :
    "bg-rose-500"

  const textColor =
    dataWeight >= 0.80 ? "text-emerald-400" :
    dataWeight >= 0.60 ? "text-amber-400" :
    "text-rose-400"

  return (
    <div className="min-w-[112px] space-y-0.5">
      {/* Fill bar */}
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", barColor)}
            style={{ width: `${seasonPct}%` }}
          />
        </div>
        <span className={cn("text-[10px] font-semibold tabular-nums", textColor)}>
          {seasonPct}%
        </span>
      </div>
      {/* Labels */}
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <span>{seasonPct}% season</span>
        <span className="text-zinc-700">·</span>
        <span>{leaguePct}% avg</span>
      </div>
      {/* Adjusted rate (only shown when shrinkage makes a visible difference) */}
      {changed && (
        <div className="text-[10px] tabular-nums text-muted-foreground">
          Adj NRFI:{" "}
          <span className={cn("font-semibold", adjPct >= rawPct ? "text-emerald-400" : "text-amber-400")}>
            {adjPct}%
          </span>
          <span className="text-zinc-600"> (raw {rawPct}%)</span>
        </div>
      )}
    </div>
  )
}

function LastFiveHeatmap({ results }: { results: boolean[] }) {
  return (
    <div className="flex gap-0.5">
      {results.map((r, i) => (
        <div
          key={i}
          className={cn(
            "h-5 w-5 rounded-sm flex items-center justify-center text-[9px] font-bold transition-all hover:scale-110",
            r
              ? "bg-emerald-500/30 border border-emerald-500/60 text-emerald-300"
              : "bg-rose-500/30 border border-rose-500/60 text-rose-300"
          )}
          title={`Game ${i + 1}: ${r ? "NRFI" : "YRFI"}`}
        >
          {r ? "N" : "Y"}
        </div>
      ))}
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
  align?: "left" | "center" | "right"
}) {
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
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

export function PitcherStats({ pitchers, teams }: Props) {
  const sorted = [...pitchers].sort(
    (a, b) => b.firstInning.nrfiRate - a.firstInning.nrfiRate
  )

  return (
    <div className="space-y-4">
      {/* Tier legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground">Elite (≥74%)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-sky-500" />
          <span className="text-muted-foreground">Good (66–73%)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="text-muted-foreground">Average (60–65%)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          <span className="text-muted-foreground">Vulnerable (&lt;60%)</span>
        </span>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-muted/20">
              <th className="px-4 py-3"><TableHeaderWithTooltip label="Pitcher" /></th>
              <th className="px-3 py-3"><TableHeaderWithTooltip label="Team" /></th>
              <th className="px-3 py-3"><TableHeaderWithTooltip label="NRFI Rate" glossaryKey="nrfiRate" /></th>
              <th className="px-3 py-3"><TableHeaderWithTooltip label="Last 5" align="center" /></th>
              <th className="px-3 py-3"><TableHeaderWithTooltip label="1st ERA" align="right" /></th>
              <th className="px-3 py-3"><TableHeaderWithTooltip label="1st WHIP" align="right" /></th>
              <th className="px-3 py-3"><TableHeaderWithTooltip label="K%" glossaryKey="kRate" align="right" /></th>
              <th className="px-3 py-3"><TableHeaderWithTooltip label="BB%" glossaryKey="bbRate" align="right" /></th>
              <th className="px-3 py-3"><TableHeaderWithTooltip label="xR/inn" glossaryKey="xR" align="right" /></th>
              <th className="px-3 py-3"><TableHeaderWithTooltip label="GS" align="right" /></th>
              <th className="px-3 py-3"><TableHeaderWithTooltip label="Model Trust" /></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, idx) => {
              const team = teams.get(p.teamId)
              const fi = p.firstInning
              return (
                <tr
                  key={p.id}
                  className="border-b border-border/30 transition-colors hover:bg-muted/20"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4 text-right">{idx + 1}</span>
                      <div>
                        <p className="font-semibold text-foreground">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.throws}HP · Age {p.age}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs font-medium text-muted-foreground">
                      {team?.abbreviation ?? p.teamId.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <NrfiBar rate={fi.nrfiRate} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-center">
                      <LastFiveHeatmap results={fi.last5Results} />
                    </div>
                  </td>
                  <td className={cn("px-3 py-3 text-right tabular-nums font-medium", nrfiColor(fi.nrfiRate))}>
                    {fi.era.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                    {fi.whip.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                    {pct(fi.kRate)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                    {pct(fi.bbRate)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                    {fi.avgRunsAllowed.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                    {fi.startCount}
                  </td>
                  <td className="px-3 py-3">
                    <BayesianTrustMeter nrfiRate={fi.nrfiRate} starts={fi.startCount} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {sorted.map((p, idx) => {
          const team = teams.get(p.teamId)
          const fi = p.firstInning
          return (
            <Card key={p.id} className="border border-border/50 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                    <p className="font-semibold">{p.name}</p>
                    <span className="text-xs text-muted-foreground">{team?.abbreviation}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.throws}HP · Age {p.age}</p>
                </div>
                <NrfiBar rate={fi.nrfiRate} />
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">1st ERA</p>
                  <p className={cn("font-semibold tabular-nums", nrfiColor(fi.nrfiRate))}>{fi.era.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">K%</p>
                  <p className="font-semibold tabular-nums">{pct(fi.kRate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">BB%</p>
                  <p className="font-semibold tabular-nums">{pct(fi.bbRate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">xR/inn</p>
                  <p className="font-semibold tabular-nums">{fi.avgRunsAllowed.toFixed(2)}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Last 5:</span>
                <LastFiveHeatmap results={fi.last5Results} />
              </div>
              <div className="mt-2 border-t border-border/30 pt-2">
                <p className="text-[10px] text-muted-foreground mb-1">Model Trust</p>
                <BayesianTrustMeter nrfiRate={fi.nrfiRate} starts={fi.startCount} />
              </div>
            </Card>
          )
        })}
      </div>

      {/* Model note */}
      <p className="text-xs text-muted-foreground">
        * NRFI Rate = % of starts where 0 runs allowed in the 1st inning. Last 5 dots: green = NRFI, red = YRFI.
        Model Trust shows how much of the prediction is based on season data vs the 62% league average —
        pitchers with &lt;5 GS are automatically shrunk toward the mean (Bayesian hierarchical shrinkage).
        "Adj NRFI" is the rate the engine actually uses after shrinkage.
      </p>
    </div>
  )
}
