"use client"

import type { Pitcher, Team } from "@/lib/types"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

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

function FormDots({ results }: { results: boolean[] }) {
  return (
    <div className="flex gap-1">
      {results.map((r, i) => (
        <span
          key={i}
          className={cn(
            "h-2 w-2 rounded-full",
            r ? "bg-emerald-400" : "bg-rose-400"
          )}
          title={r ? "NRFI" : "YRFI"}
        />
      ))}
    </div>
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
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pitcher</th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team</th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">NRFI Rate</th>
              <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last 5</th>
              <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">1st ERA</th>
              <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">1st WHIP</th>
              <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">K%</th>
              <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">BB%</th>
              <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">xR/inn</th>
              <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">GS</th>
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
                      <FormDots results={fi.last5Results} />
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
                <FormDots results={fi.last5Results} />
              </div>
            </Card>
          )
        })}
      </div>

      {/* Model note */}
      <p className="text-xs text-muted-foreground">
        * NRFI Rate = % of starts where 0 runs allowed in the 1st inning. Last 5 dots: green = NRFI achieved, red = YRFI. Stats reflect 2025 season through April 2.
      </p>
    </div>
  )
}
