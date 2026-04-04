"use client"

import { useMemo, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { GamePredictionCard } from "@/components/game-prediction-card"
import { PredictionHeader } from "@/components/prediction-header"
import { PitcherStats } from "@/components/pitcher-stats"
import { TeamStats } from "@/components/team-stats"
import { HistoryTable } from "@/components/history-table"
import { todayGames, teamMap, pitcherMap, historicalResults, modelAccuracy } from "@/lib/mock-data"
import { computeAllPredictions } from "@/lib/nrfi-engine"
import type { FilterOptions } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Activity, LineChart, Users, History, SlidersHorizontal, X } from "lucide-react"

// ─── Filter controls ──────────────────────────────────────────────────────────

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
  const hasActive =
    filters.confidenceLevel !== "all" ||
    filters.recommendation !== "all" ||
    filters.league !== "all" ||
    filters.showValueOnly ||
    filters.sortBy !== "time"

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
            hasActive
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/50"
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {hasActive && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
        </button>
        {/* Sort pills */}
        {(["time", "probability", "confidence", "edge"] as FilterOptions["sortBy"][]).map((s) => (
          <button
            key={s}
            onClick={() => onChange({ ...filters, sortBy: s })}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors capitalize",
              filters.sortBy === s
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border/50 bg-muted/20 text-muted-foreground hover:bg-muted/40"
            )}
          >
            {s === "probability" ? "probability" : s === "confidence" ? "confidence" : s === "edge" ? "edge" : "time"}
          </button>
        ))}
        {hasActive && (
          <button
            onClick={() => onChange(defaultFilters)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {open && (
        <div className="flex flex-wrap gap-3 rounded-lg border border-border/40 bg-muted/10 p-3">
          {/* Confidence */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Confidence</p>
            <div className="flex gap-1">
              {(["all", "High", "Medium", "Low"] as FilterOptions["confidenceLevel"][]).map((v) => (
                <button
                  key={v}
                  onClick={() => onChange({ ...filters, confidenceLevel: v })}
                  className={cn(
                    "rounded border px-2.5 py-1 text-xs font-medium transition-colors",
                    filters.confidenceLevel === v
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border/40 text-muted-foreground hover:bg-muted/30"
                  )}
                >
                  {v === "all" ? "All" : v}
                </button>
              ))}
            </div>
          </div>
          {/* Recommendation */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Recommendation</p>
            <div className="flex flex-wrap gap-1">
              {(["all", "NRFI", "YRFI", "toss-up"] as FilterOptions["recommendation"][]).map((v) => (
                <button
                  key={v}
                  onClick={() => onChange({ ...filters, recommendation: v })}
                  className={cn(
                    "rounded border px-2.5 py-1 text-xs font-medium transition-colors",
                    filters.recommendation === v
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border/40 text-muted-foreground hover:bg-muted/30"
                  )}
                >
                  {v === "all" ? "All" : v.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {/* League */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">League</p>
            <div className="flex gap-1">
              {(["all", "AL", "NL"] as FilterOptions["league"][]).map((v) => (
                <button
                  key={v}
                  onClick={() => onChange({ ...filters, league: v })}
                  className={cn(
                    "rounded border px-2.5 py-1 text-xs font-medium transition-colors",
                    filters.league === v
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border/40 text-muted-foreground hover:bg-muted/30"
                  )}
                >
                  {v === "all" ? "All" : v}
                </button>
              ))}
            </div>
          </div>
          {/* Value only */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Value Bets</p>
            <button
              onClick={() => onChange({ ...filters, showValueOnly: !filters.showValueOnly })}
              className={cn(
                "rounded border px-2.5 py-1 text-xs font-medium transition-colors",
                filters.showValueOnly
                  ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
                  : "border-border/40 text-muted-foreground hover:bg-muted/30"
              )}
            >
              Value Only
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [filters, setFilters] = useState<FilterOptions>(defaultFilters)

  // Compute all predictions
  const predictions = useMemo(
    () => computeAllPredictions(todayGames, pitcherMap, teamMap),
    []
  )

  // Apply filters and sort
  const filtered = useMemo(() => {
    let items = predictions.map((pred, i) => ({
      pred,
      game: todayGames[i],
      homeTeam: teamMap.get(todayGames[i].homeTeamId)!,
      awayTeam: teamMap.get(todayGames[i].awayTeamId)!,
      homePitcher: pitcherMap.get(todayGames[i].homePitcherId)!,
      awayPitcher: pitcherMap.get(todayGames[i].awayPitcherId)!,
    }))

    if (filters.confidenceLevel !== "all") {
      items = items.filter((x) => x.pred.confidence === filters.confidenceLevel)
    }
    if (filters.recommendation !== "all") {
      items = items.filter((x) => {
        if (filters.recommendation === "NRFI") {
          return x.pred.recommendation === "STRONG_NRFI" || x.pred.recommendation === "LEAN_NRFI"
        }
        if (filters.recommendation === "YRFI") {
          return x.pred.recommendation === "STRONG_YRFI" || x.pred.recommendation === "LEAN_YRFI"
        }
        return x.pred.recommendation === "TOSS_UP"
      })
    }
    if (filters.league !== "all") {
      items = items.filter(
        (x) => x.homeTeam.league === filters.league || x.awayTeam.league === filters.league
      )
    }
    if (filters.showValueOnly) {
      items = items.filter(
        (x) => x.pred.valueAnalysis && x.pred.valueAnalysis.recommendedBet !== "NO_BET"
      )
    }

    // Sort
    switch (filters.sortBy) {
      case "probability":
        items.sort((a, b) => Math.abs(b.pred.nrfiProbability - 0.5) - Math.abs(a.pred.nrfiProbability - 0.5))
        break
      case "confidence":
        items.sort((a, b) => b.pred.confidenceScore - a.pred.confidenceScore)
        break
      case "edge":
        items.sort((a, b) => {
          const eA = a.pred.valueAnalysis
            ? Math.max(Math.abs(a.pred.valueAnalysis.nrfiEdge), Math.abs(a.pred.valueAnalysis.yrfiEdge))
            : 0
          const eB = b.pred.valueAnalysis
            ? Math.max(Math.abs(b.pred.valueAnalysis.nrfiEdge), Math.abs(b.pred.valueAnalysis.yrfiEdge))
            : 0
          return eB - eA
        })
        break
      default:
        // time — already in game order
        break
    }

    return items
  }, [predictions, filters])

  return (
    <div className="min-h-screen bg-background">
      {/* Top header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400">
              <Activity className="h-4.5 w-4.5" />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-none tracking-tight text-foreground sm:text-base">
                NRFI/YRFI Prediction Engine
              </h1>
              <p className="text-xs text-muted-foreground">Advanced Poisson Model · 2026 MLB Season</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="hidden rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-emerald-400 sm:inline">
              April 4, 2026
            </span>
            <span className="rounded-full border border-border/50 bg-muted/30 px-2.5 py-0.5 text-muted-foreground">
              {predictions.length} games
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* Stats header */}
        <PredictionHeader predictions={predictions} accuracy={modelAccuracy} />

        {/* Tabs */}
        <Tabs defaultValue="games">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="games" className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              Today&apos;s Games
            </TabsTrigger>
            <TabsTrigger value="pitchers" className="flex items-center gap-1.5">
              <LineChart className="h-3.5 w-3.5" />
              Pitchers
            </TabsTrigger>
            <TabsTrigger value="teams" className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Teams
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              History
            </TabsTrigger>
          </TabsList>

          {/* ── Games Tab ── */}
          <TabsContent value="games" className="mt-4 space-y-4">
            <FilterBar filters={filters} onChange={setFilters} />

            {filtered.length === 0 ? (
              <div className="rounded-lg border border-border/40 bg-muted/10 py-16 text-center">
                <p className="text-sm text-muted-foreground">No games match the current filters.</p>
                <button
                  onClick={() => setFilters(defaultFilters)}
                  className="mt-2 text-xs text-primary underline underline-offset-2"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map(({ pred, game, homeTeam, awayTeam, homePitcher, awayPitcher }) => (
                  <GamePredictionCard
                    key={game.id}
                    game={game}
                    prediction={pred}
                    homeTeam={homeTeam}
                    awayTeam={awayTeam}
                    homePitcher={homePitcher}
                    awayPitcher={awayPitcher}
                  />
                ))}
              </div>
            )}

            {/* Model explanation */}
            <div className="rounded-lg border border-border/30 bg-muted/10 p-4 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground/80">How the model works</p>
              <p>
                The engine uses a <strong className="text-foreground/70">Poisson scoring model</strong>: for each half-inning, expected runs (λ) are
                derived from the pitcher&apos;s historical first-inning NRFI rate via λ = −ln(NRFI Rate), then adjusted
                multiplicatively for the opposing lineup&apos;s first-inning offensive factor, park factor, and weather.
              </p>
              <p>
                P(NRFI) = P(home scores 0) × P(away scores 0) = e<sup>−λ<sub>home</sub></sup> × e<sup>−λ<sub>away</sub></sup>
              </p>
              <p>
                Value bets are identified when the model&apos;s implied probability exceeds the bookmaker&apos;s
                by ≥3%. Kelly Criterion (25% fractional) sizes the recommended wager.
              </p>
            </div>
          </TabsContent>

          {/* ── Pitchers Tab ── */}
          <TabsContent value="pitchers" className="mt-4">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-foreground">Pitcher Rankings — First Inning</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Sorted by NRFI rate. All metrics apply to the first inning only.
              </p>
            </div>
            <PitcherStats pitchers={[...pitcherMap.values()]} teams={teamMap} />
          </TabsContent>

          {/* ── Teams Tab ── */}
          <TabsContent value="teams" className="mt-4">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-foreground">Team First-Inning Offense</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Sorted by YRFI rate — how often each team scores in the first inning.
              </p>
            </div>
            <TeamStats teams={[...teamMap.values()]} />
          </TabsContent>

          {/* ── History Tab ── */}
          <TabsContent value="history" className="mt-4">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-foreground">Historical Predictions</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Model accuracy and bet-by-bet results since the start of the 2026 season.
              </p>
            </div>
            <HistoryTable results={historicalResults} accuracy={modelAccuracy} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-border/30 px-4 py-6 text-center">
        <p className="text-xs text-muted-foreground">
          NRFI/YRFI Prediction Engine · Statistical model for informational purposes only · Not financial advice
        </p>
      </footer>
    </div>
  )
}
