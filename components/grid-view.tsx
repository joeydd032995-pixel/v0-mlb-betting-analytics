"use client"

import { cn } from "@/lib/utils"
import type { SortableItem } from "@/lib/utils/sorting"
import type { FilterOptions, NRFIPrediction } from "@/lib/types"
import { ChevronUp, ChevronDown } from "lucide-react"

interface GridViewProps {
  items: SortableItem[]
  sortBy: FilterOptions["sortBy"]
  onSortChange: (newSort: FilterOptions["sortBy"]) => void
}

function pct(n: number, decimals = 1) {
  return `${(n * 100).toFixed(decimals)}%`
}

function formatOdds(n?: number) {
  if (n == null) return "—"
  return n > 0 ? `+${n}` : `${n}`
}

function getRowBorderColor(rec: NRFIPrediction["recommendation"]) {
  if (rec === "STRONG_NRFI" || rec === "LEAN_NRFI") return "border-l-emerald-500"
  if (rec === "STRONG_YRFI" || rec === "LEAN_YRFI") return "border-l-rose-500"
  return "border-l-zinc-500"
}

function SortHeader({
  label,
  sortKey,
  currentSort,
  onSort,
}: {
  label: string
  sortKey: FilterOptions["sortBy"]
  currentSort: FilterOptions["sortBy"]
  onSort: (key: FilterOptions["sortBy"]) => void
}) {
  const isActive = currentSort === sortKey
  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
    >
      {label}
      {isActive ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3 opacity-30" />}
    </button>
  )
}

export function GridView({ items, sortBy, onSortChange }: GridViewProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border/30 bg-card/50 p-8 text-center">
        <p className="text-sm text-muted-foreground">No games match your filters.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border/30 bg-card/80 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-border/30 bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Game" sortKey="time" currentSort={sortBy} onSort={onSortChange} />
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">
                Rec.
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader label="NRFI" sortKey="probability" currentSort={sortBy} onSort={onSortChange} />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader label="Conf" sortKey="confidence" currentSort={sortBy} onSort={onSortChange} />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader label="Edge" sortKey="edge" currentSort={sortBy} onSort={onSortChange} />
              </th>
              <th className="px-4 py-3 text-right">Away xR</th>
              <th className="px-4 py-3 text-right">Home xR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {items.map(({ pred, game, awayTeam, homeTeam, awayPitcher, homePitcher }) => {
              const nrfiPct = Math.round(pred.nrfiProbability * 100)
              const va = pred.valueAnalysis
              const edge = va
                ? Math.max(Math.abs(va.nrfiEdge), Math.abs(va.yrfiEdge))
                : 0

              return (
                <tr
                  key={game.id}
                  className={cn(
                    "border-l-4 hover:bg-muted/30 transition-colors",
                    getRowBorderColor(pred.recommendation)
                  )}
                >
                  {/* Game */}
                  <td className="px-4 py-3 text-left">
                    <div className="space-y-0.5">
                      <div className="font-medium text-foreground">
                        {awayTeam.abbreviation} @ {homeTeam.abbreviation}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {game.time} · {awayPitcher.name} vs {homePitcher.name}
                      </div>
                    </div>
                  </td>

                  {/* Recommendation */}
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        "inline-block rounded px-2 py-1 text-[10px] font-semibold whitespace-nowrap",
                        pred.recommendation === "STRONG_NRFI"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : pred.recommendation === "LEAN_NRFI"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : pred.recommendation === "TOSS_UP"
                              ? "bg-zinc-500/20 text-zinc-300"
                              : pred.recommendation === "LEAN_YRFI"
                                ? "bg-rose-500/10 text-rose-400"
                                : "bg-rose-500/20 text-rose-300"
                      )}
                    >
                      {pred.recommendation.replace(/_/g, " ")}
                    </span>
                  </td>

                  {/* NRFI % */}
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    <span
                      className={
                        nrfiPct >= 60
                          ? "text-emerald-400"
                          : nrfiPct >= 50
                            ? "text-sky-400"
                            : nrfiPct >= 40
                              ? "text-amber-400"
                              : "text-rose-400"
                      }
                    >
                      {nrfiPct}%
                    </span>
                  </td>

                  {/* Confidence */}
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span
                      className={cn(
                        "font-medium",
                        pred.confidence === "High"
                          ? "text-amber-400"
                          : pred.confidence === "Medium"
                            ? "text-sky-400"
                            : "text-zinc-400"
                      )}
                    >
                      {pred.confidenceScore}
                    </span>
                  </td>

                  {/* Edge */}
                  <td className="px-4 py-3 text-right tabular-nums">
                    {edge > 0 ? (
                      <span className="text-violet-300 font-medium">+{(edge * 100).toFixed(1)}%</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Away xR */}
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {pred.awayExpectedRuns.toFixed(2)}
                  </td>

                  {/* Home xR */}
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {pred.homeExpectedRuns.toFixed(2)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="border-t border-border/30 bg-muted/20 px-4 py-2">
        <p className="text-[10px] text-muted-foreground">
          Showing {items.length} game{items.length !== 1 ? "s" : ""} · Colored left border: emerald = NRFI lean, rose = YRFI lean
        </p>
      </div>
    </div>
  )
}
