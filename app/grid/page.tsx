"use client"

import { useCallback, useEffect, useState } from "react"
import { GridView } from "@/components/grid-view"
import type { FilterOptions, NRFIPrediction, Game, Pitcher, Team } from "@/lib/types"
import { useSortableRows, type SortableItem } from "@/lib/utils/sorting"
import { SlidersHorizontal, X, RefreshCw } from "lucide-react"

const defaultFilters: FilterOptions = {
  confidenceLevel: "all",
  recommendation: "all",
  league: "all",
  minEdge: 0,
  sortBy: "time",
  showValueOnly: false,
}

function FilterBar({
  filters,
  onChange,
}: {
  filters: FilterOptions
  onChange: (f: FilterOptions) => void
}) {
  const [open, setOpen] = useState(false)
  const hasActiveFilters =
    filters.confidenceLevel !== "all" ||
    filters.recommendation !== "all" ||
    filters.league !== "all" ||
    filters.minEdge !== defaultFilters.minEdge ||
    filters.showValueOnly ||
    filters.sortBy !== "time"

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 rounded-lg border border-border/30 bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {hasActiveFilters && <span className="h-2 w-2 rounded-full bg-amber-400" />}
        </button>
        {hasActiveFilters && (
          <button
            onClick={() => onChange(defaultFilters)}
            className="flex items-center gap-1 rounded border border-border/30 px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/20 transition-colors"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {open && (
        <div className="rounded-lg border border-border/30 bg-muted/20 p-4 space-y-3">
          {/* Confidence */}
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">Confidence</p>
            <div className="flex flex-wrap gap-2">
              {(["all", "High", "Medium", "Low"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => onChange({ ...filters, confidenceLevel: c })}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    filters.confidenceLevel === c
                      ? "bg-primary text-primary-foreground"
                      : "border border-border/40 text-muted-foreground hover:bg-muted/30"
                  }`}
                >
                  {c === "all" ? "All" : c}
                </button>
              ))}
            </div>
          </div>

          {/* Recommendation */}
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">Recommendation</p>
            <div className="flex flex-wrap gap-2">
              {(["all", "NRFI", "YRFI", "toss-up"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => onChange({ ...filters, recommendation: r })}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    filters.recommendation === r
                      ? "bg-primary text-primary-foreground"
                      : "border border-border/40 text-muted-foreground hover:bg-muted/30"
                  }`}
                >
                  {r === "all" ? "All" : r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* League */}
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">League</p>
            <div className="flex flex-wrap gap-2">
              {(["all", "AL", "NL"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => onChange({ ...filters, league: l })}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    filters.league === l
                      ? "bg-primary text-primary-foreground"
                      : "border border-border/40 text-muted-foreground hover:bg-muted/30"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Value Only */}
          <div>
            <button
              onClick={() => onChange({ ...filters, showValueOnly: !filters.showValueOnly })}
              className={`w-full rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                filters.showValueOnly
                  ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                  : "border border-border/40 text-muted-foreground hover:bg-muted/30"
              }`}
            >
              Value Only
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function GridPage() {
  const [filters, setFilters] = useState<FilterOptions>(defaultFilters)
  const [liveData, setLiveData] = useState<{
    predictions: NRFIPrediction[]
    games: Game[]
    pitchersById: Record<string, Pitcher>
    teamsById: Record<string, Team>
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/predictions")
        if (!res.ok) throw new Error("Failed to fetch predictions")
        const data = await res.json()
        setLiveData(data)
      } catch (err) {
        console.error("Failed to load predictions:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const teamMap = new Map(
    liveData ? Object.entries(liveData.teamsById) : []
  )
  const pitcherMap = new Map(
    liveData ? Object.entries(liveData.pitchersById) : []
  )

  const items = useSortableRows(
    liveData?.predictions ?? [],
    liveData?.games ?? [],
    teamMap,
    pitcherMap,
    filters
  )

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Grid View</h1>
          <p className="text-sm text-muted-foreground">
            Sortable table of all games with predictions, probabilities, and value analysis.
          </p>
        </div>

        {/* Filters */}
        <FilterBar filters={filters} onChange={setFilters} />

        {/* Grid */}
        {loading ? (
          <div className="rounded-lg border border-border/30 bg-card/50 p-8 text-center">
            <div className="flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading games...</p>
            </div>
          </div>
        ) : (
          <GridView
            items={items}
            sortBy={filters.sortBy}
            onSortChange={(newSort) => setFilters({ ...filters, sortBy: newSort as FilterOptions["sortBy"] })}
          />
        )}
      </main>
    </div>
  )
}
