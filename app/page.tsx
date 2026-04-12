"use client"

import { useEffect, useMemo, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { GamePredictionCard } from "@/components/game-prediction-card"
import { PredictionHeader } from "@/components/prediction-header"
import { PitcherStats } from "@/components/pitcher-stats"
import { TeamStats } from "@/components/team-stats"
import { HistoryTable } from "@/components/history-table"
import {
  buildTrackedPrediction,
  upsertPredictions,
  loadTrackedPredictions,
  recordResult,
  deletePrediction,
  autoRecordResults,
  computeExtendedAccuracy,
  type TrackedPrediction,
  type ExtendedModelAccuracy,
} from "@/lib/prediction-store"
import type { FilterOptions, NRFIPrediction, Game, Pitcher, Team } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Activity, LineChart, Users, History, SlidersHorizontal, X, RefreshCw, DatabaseZap, Lock, Zap } from "lucide-react"
import { AuthNav } from "@/components/auth-nav"
import { useAuth } from "@clerk/nextjs"
import { toast } from "sonner"
import { useSubscription } from "@/components/subscription-provider"
import Link from "next/link"

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

// ─── Locked pick teaser card ──────────────────────────────────────────────────
function LockedPickCard({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-lg border border-border/40 bg-card/40 min-h-[260px]">
      {/* Blurred background suggestion */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background/90 z-10" />
      {/* Fake shimmer rows to suggest content */}
      <div className="p-4 space-y-3 opacity-30 select-none pointer-events-none">
        <div className="h-3 w-2/3 rounded bg-muted/60 animate-pulse" />
        <div className="h-8 w-1/2 rounded bg-muted/40 animate-pulse" />
        <div className="h-3 w-full rounded bg-muted/30 animate-pulse" />
        <div className="h-3 w-3/4 rounded bg-muted/30 animate-pulse" />
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="h-14 rounded bg-muted/20 animate-pulse" />
          <div className="h-14 rounded bg-muted/20 animate-pulse" />
        </div>
      </div>
      {/* Lock overlay */}
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/40 border border-border/50">
          <Lock className="h-4.5 w-4.5 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">Pick locked</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Upgrade to unlock unlimited daily picks</p>
        </div>
        <button
          onClick={onUnlock}
          className="flex items-center gap-1.5 rounded-md bg-primary/90 hover:bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors"
        >
          <Zap className="h-3.5 w-3.5" />
          Unlock all picks
        </button>
      </div>
    </div>
  )
}

// ─── Locked tab overlay ────────────────────────────────────────────────────────
function LockedTabOverlay({
  title,
  description,
  context,
  onUnlock,
}: {
  title: string
  description: string
  context: "pitchers" | "teams" | "history"
  onUnlock: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border/40 bg-muted/10 py-20 px-6 text-center gap-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/30 border border-border/50">
        <Lock className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">{description}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onUnlock}
          className="flex items-center gap-1.5 rounded-md bg-primary/90 hover:bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors"
        >
          <Zap className="h-4 w-4" />
          Upgrade
        </button>
        <Link
          href="/pricing"
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
        >
          See all plans
        </Link>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [filters, setFilters] = useState<FilterOptions>(defaultFilters)

  // ── Subscription context ─────────────────────────────────────────────────────
  const {
    isPaid,
    hasHistory,
    hasPitcherInsights,
    remainingPicksToday,
    openUpgradeModal,
  } = useSubscription()

  // ── Auth state (Clerk) ───────────────────────────────────────────────────────
  const { isLoaded: authLoaded, isSignedIn } = useAuth()

  // Show a one-time welcome toast the first time a user arrives while signed in.
  // sessionStorage is cleared when the browser tab closes, so signing in again
  // in a new session will show the toast again — which is intentional.
  useEffect(() => {
    if (!authLoaded || !isSignedIn) return
    const TOAST_KEY = "nrfi_welcome_shown"
    if (!sessionStorage.getItem(TOAST_KEY)) {
      toast.success("Signed in successfully", {
        description: "Welcome to the NRFI/YRFI Prediction Engine!",
        duration: 4000,
      })
      sessionStorage.setItem(TOAST_KEY, "1")
    }
  }, [authLoaded, isSignedIn])

  // ── Live data state ──────────────────────────────────────────────────────────
  const [liveData, setLiveData] = useState<{
    predictions: NRFIPrediction[]
    games: Game[]
    pitchersById: Record<string, Pitcher>
    teamsById: Record<string, Team>
    date: string
    noGames?: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── Prediction tracking store ────────────────────────────────────────────────
  const [trackedPredictions, setTrackedPredictions] = useState<TrackedPrediction[]>([])
  const [trackingAccuracy, setTrackingAccuracy] = useState<ExtendedModelAccuracy>(() =>
    computeExtendedAccuracy([])
  )

  // Load from localStorage on mount, then immediately sync all pending predictions
  // across the full season so accuracy stats are up to date on every refresh.
  // Note: basePredictions is passed to syncResults to avoid the stale-state race
  // condition where trackedPredictions is still [] when the effect fires.
  useEffect(() => {
    const stored = loadTrackedPredictions()
    setTrackedPredictions(stored)
    setTrackingAccuracy(computeExtendedAccuracy(stored))

    const hasPending = stored.some((p) => p.status === "pending")
    if (hasPending) {
      // Collect ALL dates with pending predictions (full season coverage)
      const allPendingDates = [...new Set(
        stored.filter((p) => p.status === "pending").map((p) => p.date)
      )]
      syncResults(allPendingDates, stored)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch("/api/predictions")
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d?.error ?? `API returned ${r.status}`)
        return d
      })
      .then((d) => {
        setLiveData(d)
        setLoading(false)

        // Auto-save today's predictions to the tracking store
        if (!d.noGames && d.games?.length > 0 && d.predictions?.length > 0) {
          const pitcherMap = new Map<string, Pitcher>(Object.entries(d.pitchersById ?? {}))
          const teamMap    = new Map<string, Team>(Object.entries(d.teamsById ?? {}))
          const incoming   = (d.predictions as NRFIPrediction[]).map((pred, i) =>
            buildTrackedPrediction(pred, d.games[i] as Game, pitcherMap, teamMap, d.date)
          )
          const updated = upsertPredictions(incoming)
          setTrackedPredictions(updated)
          setTrackingAccuracy(computeExtendedAccuracy(updated))
        }
      })
      .catch((e: Error) => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  const pitcherMap = useMemo(
    () => new Map(Object.entries(liveData?.pitchersById ?? {})),
    [liveData]
  )
  const teamMap = useMemo(
    () => new Map(Object.entries(liveData?.teamsById ?? {})),
    [liveData]
  )
  const predictions = liveData?.predictions ?? []
  const todayGames = liveData?.games ?? []

  // ── Store callbacks ──────────────────────────────────────────────────────────
  const handleRecordResult = (id: string, homeRuns: number, awayRuns: number) => {
    const updated = recordResult(id, homeRuns, awayRuns)
    setTrackedPredictions(updated)
    setTrackingAccuracy(computeExtendedAccuracy(updated))
  }

  const handleDeletePrediction = (id: string) => {
    const updated = deletePrediction(id)
    setTrackedPredictions(updated)
    setTrackingAccuracy(computeExtendedAccuracy(updated))
  }

  // ── Results sync ─────────────────────────────────────────────────────────────
  const [syncing, setSyncing] = useState(false)
  const [lastSyncInfo, setLastSyncInfo] = useState<string | null>(null)
  const [backfilling, setBackfilling] = useState(false)

  const syncResults = async (dates?: string[], basePredictions?: TrackedPrediction[]) => {
    setSyncing(true)
    try {
      // Use basePredictions when provided (e.g. on mount before state is set)
      // to avoid reading stale closure state
      const baseData = basePredictions ?? trackedPredictions
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
      const pendingDates = new Set<string>(
        baseData
          .filter((p) => p.status === "pending")
          .map((p) => p.date)
      )
      pendingDates.add(today)
      // Also check yesterday in case games ended after midnight ET
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      pendingDates.add(
        new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(yesterday)
      )

      const targetDates = dates ?? [...pendingDates]

      let totalRecorded = 0
      let latestPredictions = trackedPredictions

      for (const date of targetDates) {
        const res = await fetch(`/api/results?date=${date}`)
        if (!res.ok) continue
        const data = await res.json()
        if (!data.results) continue

        const { predictions: updated, recorded } = autoRecordResults(data.results)
        if (recorded > 0) {
          latestPredictions = updated
          totalRecorded += recorded
        }
      }

      if (totalRecorded > 0) {
        setTrackedPredictions(latestPredictions)
        setTrackingAccuracy(computeExtendedAccuracy(latestPredictions))
        setLastSyncInfo(`${totalRecorded} result${totalRecorded !== 1 ? "s" : ""} recorded`)
      } else {
        setLastSyncInfo("No new results")
      }
    } catch {
      setLastSyncInfo("Sync failed")
    } finally {
      setSyncing(false)
    }
  }

  // Backfill historical predictions from season start to yesterday
  const backfillSeason = async () => {
    setBackfilling(true)
    setLastSyncInfo(null)
    try {
      // 2026 MLB season started ~March 20; go back 30 days from today to cover the full season
      const toDate = new Date()
      toDate.setDate(toDate.getDate() - 1) // yesterday (games are complete)
      const to = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(toDate)
      const fromDate = new Date()
      fromDate.setDate(fromDate.getDate() - 30)
      const from = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(fromDate)

      const res = await fetch(`/api/backfill?from=${from}&to=${to}`)
      if (!res.ok) throw new Error(`Backfill API error ${res.status}`)
      const data = await res.json()

      if (data.predictions && data.predictions.length > 0) {
        const merged = upsertPredictions(data.predictions)
        setTrackedPredictions(merged)
        setTrackingAccuracy(computeExtendedAccuracy(merged))
        const completed = (data.predictions as TrackedPrediction[]).filter(
          (p) => p.status === "complete"
        ).length
        setLastSyncInfo(
          `Imported ${completed} completed result${completed !== 1 ? "s" : ""} across ${data.datesProcessed} day${data.datesProcessed !== 1 ? "s" : ""}`
        )
      } else {
        setLastSyncInfo("No historical data found")
      }
    } catch {
      setLastSyncInfo("Backfill failed")
    } finally {
      setBackfilling(false)
    }
  }

  // Apply filters and sort
  const filtered = useMemo(() => {
    let items = predictions.map((pred, i) => ({
      pred,
      game: todayGames[i],
      homeTeam: teamMap.get(todayGames[i]?.homeTeamId ?? "")!,
      awayTeam: teamMap.get(todayGames[i]?.awayTeamId ?? "")!,
      homePitcher: pitcherMap.get(todayGames[i]?.homePitcherId ?? "")!,
      awayPitcher: pitcherMap.get(todayGames[i]?.awayPitcherId ?? "")!,
    })).filter((x) => x.game && x.homeTeam && x.awayTeam && x.homePitcher && x.awayPitcher)

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
              {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </span>
            <span className="rounded-full border border-border/50 bg-muted/30 px-2.5 py-0.5 text-muted-foreground">
              {todayGames.length} games
            </span>

            {/* Upgrade CTA — shown for free users */}
            {!isPaid && (
              <Link
                href="/pricing"
                className="hidden sm:flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 px-2.5 py-1 text-xs font-semibold text-primary transition-colors"
              >
                <Zap className="h-3 w-3" />
                Upgrade
              </Link>
            )}

            {/* Auth controls — Sign In / Sign Up for guests, UserButton for members */}
            <AuthNav />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* Stats header */}
        <PredictionHeader predictions={predictions} accuracy={trackingAccuracy} isPaid={isPaid} />

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

            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-lg border border-border/30 bg-muted/20 h-64 animate-pulse" />
                ))}
              </div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 py-12 text-center space-y-2 px-4">
                <p className="text-sm font-semibold text-destructive">Failed to load live predictions</p>
                <p className="text-xs text-muted-foreground">{error}</p>
                <p className="text-xs text-muted-foreground">
                  Check{" "}
                  <a href="/api/debug" target="_blank" className="underline text-primary">
                    /api/debug
                  </a>{" "}
                  to diagnose the API connection.
                </p>
              </div>
            ) : liveData?.noGames ? (
              <div className="rounded-lg border border-border/40 bg-muted/10 py-16 text-center space-y-1">
                <p className="text-sm font-medium text-foreground">No games scheduled today</p>
                <p className="text-xs text-muted-foreground">Check back on the next scheduled game day.</p>
              </div>
            ) : filtered.length === 0 ? (
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
              <>
                {/* Free-tier pick quota banner */}
                {!isPaid && filtered.length > 0 && (
                  <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-xs">
                    <span className="text-amber-300">
                      Free plan: <strong>1 pick per day</strong> — {remainingPicksToday > 0 ? `${remainingPicksToday} remaining today` : "limit reached"}
                    </span>
                    <Link href="/pricing" className="font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-2 transition-colors">
                      Upgrade for unlimited →
                    </Link>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filtered.map(({ pred, game, homeTeam, awayTeam, homePitcher, awayPitcher }, index) => {
                    // Free users: first pick is always visible; lock the rest
                    const isLocked = !isPaid && index >= remainingPicksToday

                    if (isLocked) {
                      return (
                        <LockedPickCard
                          key={game.id}
                          onUnlock={() => openUpgradeModal("picks")}
                        />
                      )
                    }

                    return (
                      <GamePredictionCard
                        key={game.id}
                        game={game}
                        prediction={pred}
                        homeTeam={homeTeam}
                        awayTeam={awayTeam}
                        homePitcher={homePitcher}
                        awayPitcher={awayPitcher}
                        showAdvanced={isPaid}
                      />
                    )
                  })}
                </div>
              </>
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
            {hasPitcherInsights ? (
              <PitcherStats pitchers={[...pitcherMap.values()]} teams={teamMap} />
            ) : (
              <LockedTabOverlay
                title="Pitcher insights require Monthly or Annual"
                description="Full pitcher rankings, Bayesian trust meters, first-inning ERA/WHIP/K%/xR, and matchup analytics."
                context="pitchers"
                onUnlock={() => openUpgradeModal("pitchers")}
              />
            )}
          </TabsContent>

          {/* ── Teams Tab ── */}
          <TabsContent value="teams" className="mt-4">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-foreground">Team First-Inning Offense</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Sorted by YRFI rate — how often each team scores in the first inning.
              </p>
            </div>
            {hasPitcherInsights ? (
              <TeamStats teams={[...teamMap.values()]} />
            ) : (
              <LockedTabOverlay
                title="Team analytics require Monthly or Annual"
                description="Deep-dive first-inning offense splits, home/away YRFI rates, L10 trend data, and league rankings."
                context="teams"
                onUnlock={() => openUpgradeModal("teams")}
              />
            )}
          </TabsContent>

          {/* ── History Tab ── */}
          <TabsContent value="history" className="mt-4">
            {hasHistory ? (
              <>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Historical Predictions</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Predictions are auto-saved daily. 1st-inning results are fetched automatically
                      from the MLB Stats API once games end.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {lastSyncInfo && (
                      <span className="text-xs text-muted-foreground">{lastSyncInfo}</span>
                    )}
                    <button
                      onClick={backfillSeason}
                      disabled={backfilling || syncing}
                      title="Retroactively import predictions and results for the past 30 days to populate season accuracy stats"
                      className="flex items-center gap-1.5 rounded border border-border/50 bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 disabled:opacity-50"
                    >
                      <DatabaseZap className={cn("h-3 w-3", backfilling && "animate-pulse")} />
                      {backfilling ? "Importing…" : "Import Season Data"}
                    </button>
                    <button
                      onClick={() => syncResults()}
                      disabled={syncing || backfilling}
                      className="flex items-center gap-1.5 rounded border border-border/50 bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 disabled:opacity-50"
                    >
                      <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
                      {syncing ? "Syncing…" : "Sync Results"}
                    </button>
                    <span className="rounded-full border border-border/50 bg-muted/30 px-2.5 py-0.5 text-xs text-muted-foreground">
                      {trackingAccuracy.totalTracked} tracked
                    </span>
                  </div>
                </div>
                <HistoryTable
                  predictions={trackedPredictions}
                  accuracy={trackingAccuracy}
                  onRecordResult={handleRecordResult}
                  onDelete={handleDeletePrediction}
                />
              </>
            ) : (
              <LockedTabOverlay
                title="History tracking requires Monthly or Annual"
                description="Track your prediction accuracy over time, record 1st-inning results, view per-model performance breakdowns, and review monthly ROI trends."
                context="history"
                onUnlock={() => openUpgradeModal("history")}
              />
            )}
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
