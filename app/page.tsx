"use client"

import { useEffect, useMemo, useState } from "react"
import {
  RefreshCw,
  Grid3X3,
  List,
  Activity,
  DollarSign,
  Target,
  Flame,
} from "lucide-react"
import { PredictionHeader } from "@/components/prediction-header"
import { GamePredictionCard } from "@/components/game-prediction-card"
import { NeonCockpit } from "@/components/neon-cockpit"
import { AuthNav } from "@/components/auth-nav"
import type { Game, NRFIPrediction, Pitcher, Team } from "@/lib/types"
import {
  buildTrackedPrediction,
  upsertPredictions,
  loadTrackedPredictions,
  autoRecordResults,
  computeExtendedAccuracy,
  type TrackedPrediction,
  type ExtendedModelAccuracy,
} from "@/lib/prediction-store"
import { cn } from "@/lib/utils"
import { useAuth } from "@clerk/nextjs"
import { toast } from "sonner"

interface ApiResponse {
  predictions: NRFIPrediction[]
  games: Game[]
  pitchersById: Record<string, Pitcher>
  teamsById: Record<string, Team>
  date: string
  noGames?: boolean
}

function pct(n: number, d = 1) {
  return `${(n * 100).toFixed(d)}%`
}

export default function HomeplateMetricsPage() {
  const [liveData, setLiveData] = useState<ApiResponse | null>(null)
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [isGridMode, setIsGridMode] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // ── Auth welcome toast (parity with prior behavior) ────────────────────────
  const { isLoaded: authLoaded, isSignedIn } = useAuth()
  useEffect(() => {
    if (!authLoaded || !isSignedIn) return
    const KEY = "nrfi_welcome_shown"
    if (!sessionStorage.getItem(KEY)) {
      toast.success("Signed in successfully", {
        description: "Welcome to HomeplateMetrics — Neon Terminal",
        duration: 4000,
      })
      sessionStorage.setItem(KEY, "1")
    }
  }, [authLoaded, isSignedIn])

  // ── Prediction tracking store ──────────────────────────────────────────────
  const [trackedPredictions, setTrackedPredictions] = useState<TrackedPrediction[]>([])
  const [trackingAccuracy, setTrackingAccuracy] = useState<ExtendedModelAccuracy>(() =>
    computeExtendedAccuracy([]),
  )

  useEffect(() => {
    const stored = loadTrackedPredictions()
    setTrackedPredictions(stored)
    setTrackingAccuracy(computeExtendedAccuracy(stored))

    // Auto-sync pending results on mount
    const pendingDates = [
      ...new Set(stored.filter((p) => p.status === "pending").map((p) => p.date)),
    ]
    if (pendingDates.length > 0) {
      void syncResults(pendingDates)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function syncResults(dates: string[]) {
    try {
      let latest = loadTrackedPredictions()
      for (const date of dates) {
        const res = await fetch(`/api/results?date=${date}`)
        if (!res.ok) continue
        const data = await res.json()
        if (!data.results) continue
        const { predictions: updated, recorded } = autoRecordResults(data.results)
        if (recorded > 0) latest = updated
      }
      setTrackedPredictions(latest)
      setTrackingAccuracy(computeExtendedAccuracy(latest))
    } catch {
      /* non-fatal */
    }
  }

  // ── Live data loader — reuses /api/predictions (revalidate 300) ────────────
  async function loadGames(manual = false) {
    if (manual) setRefreshing(true)
    else setIsLoading(true)
    try {
      const r = await fetch("/api/predictions")
      const d: ApiResponse & { error?: string } = await r.json()
      if (!r.ok) throw new Error(d?.error ?? `API returned ${r.status}`)
      setLiveData(d)
      setError(null)

      // Auto-save today's predictions into the tracking store
      if (!d.noGames && d.games?.length > 0 && d.predictions?.length > 0) {
        const pitcherMap = new Map<string, Pitcher>(Object.entries(d.pitchersById ?? {}))
        const teamMap = new Map<string, Team>(Object.entries(d.teamsById ?? {}))
        const gameMap = new Map<string, Game>(d.games.map((g) => [g.id, g]))
        const incoming = d.predictions
          .map((pred) => {
            const game = gameMap.get(pred.gameId)
            if (!game) return null
            return buildTrackedPrediction(pred, game, pitcherMap, teamMap, d.date)
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
        const merged = upsertPredictions(incoming)
        setTrackedPredictions(merged)
        setTrackingAccuracy(computeExtendedAccuracy(merged))
      }

      if (
        d.games.length > 0 &&
        (!selectedGameId || !d.games.some((g) => g.id === selectedGameId))
      ) {
        setSelectedGameId(d.games[0].id)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setIsLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadGames()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Derived maps / view models ─────────────────────────────────────────────
  const games = liveData?.games ?? []
  const predictions = liveData?.predictions ?? []

  const pitcherMap = useMemo(
    () => new Map(Object.entries(liveData?.pitchersById ?? {})),
    [liveData],
  )
  const teamMap = useMemo(
    () => new Map(Object.entries(liveData?.teamsById ?? {})),
    [liveData],
  )

  const predictionByGameId = useMemo(() => {
    const m = new Map<string, NRFIPrediction>()
    predictions.forEach((p) => m.set(p.gameId, p))
    return m
  }, [predictions])

  const selectedGame = games.find((g) => g.id === selectedGameId) ?? null
  const selectedPred = selectedGame ? predictionByGameId.get(selectedGame.id) ?? null : null
  const selectedHomeTeam = selectedGame ? teamMap.get(selectedGame.homeTeamId) ?? null : null
  const selectedAwayTeam = selectedGame ? teamMap.get(selectedGame.awayTeamId) ?? null : null
  const selectedHomePitcher = selectedGame
    ? pitcherMap.get(selectedGame.homePitcherId) ?? null
    : null
  const selectedAwayPitcher = selectedGame
    ? pitcherMap.get(selectedGame.awayPitcherId) ?? null
    : null

  function handleLockIn() {
    if (!selectedPred?.valueAnalysis || selectedPred.valueAnalysis.recommendedBet === "NO_BET") {
      toast.error("No value edge on this matchup")
      return
    }
    const va = selectedPred.valueAnalysis
    toast.success(`Locked: ${va.recommendedBet}`, {
      description: `Kelly ${pct(va.kellyFraction)} · Edge +${(
        (va.recommendedBet === "NRFI" ? va.nrfiEdge : va.yrfiEdge) * 100
      ).toFixed(1)}%`,
    })
  }

  return (
    <div className="neon-bg min-h-screen overflow-hidden bg-gradient-to-br from-[#0a0a0a] to-[#111827] font-sans text-[#f8fafc]">
      {/* ─── Top Command Bar ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 border-b border-[#1f2937] bg-[#111827]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-y-3 px-6 py-4">
          <div className="flex items-center gap-x-3">
            <span className="bg-gradient-to-r from-[#a78bfa] to-[#c4b5fd] bg-clip-text text-3xl font-bold tracking-tighter text-transparent">
              HomeplateMetrics
            </span>
            <span className="text-sm font-medium text-[#94a3b8]">Neon Terminal</span>
          </div>

          {/* Compact global KPIs — full reuse of existing header */}
          <div className="hidden flex-1 px-6 xl:block">
            <PredictionHeader predictions={predictions} accuracy={trackingAccuracy} />
          </div>

          <div className="flex items-center gap-x-3">
            <button
              onClick={() => setIsGridMode((v) => !v)}
              aria-pressed={isGridMode}
              className="flex cursor-pointer items-center gap-x-2 rounded-2xl bg-[#1f2937] px-5 py-2.5 text-sm font-medium transition-all duration-200 hover:bg-[#374151] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] active:scale-95"
            >
              {isGridMode ? <List className="h-4 w-4" /> : <Grid3X3 className="h-4 w-4" />}
              {isGridMode ? "Detail View" : "Grid View"}
            </button>
            <button
              onClick={() => loadGames(true)}
              aria-label="Refresh predictions"
              className="cursor-pointer rounded-2xl p-3 transition-all duration-200 hover:bg-[#374151] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
            >
              <RefreshCw className={cn("h-5 w-5 text-[#22d3ee]", refreshing && "animate-spin")} />
            </button>
            <AuthNav />
          </div>
        </div>

        {/* KPI header inlined on narrower viewports */}
        <div className="mx-auto max-w-screen-2xl px-6 pb-4 xl:hidden">
          <PredictionHeader predictions={predictions} accuracy={trackingAccuracy} />
        </div>
      </div>

      {/* ─── Main grid ───────────────────────────────────────────────────── */}
      <div className="mx-auto flex max-w-screen-2xl min-h-[calc(100vh-73px)] flex-col lg:h-[calc(100vh-73px)] lg:flex-row">
        {/* Ultra-slim sidebar (master game list) */}
        <aside className="w-full shrink-0 border-b border-[#1f2937] bg-[#0a0a0a]/95 p-4 lg:w-72 lg:border-b-0 lg:border-r lg:overflow-y-auto">
          <div className="mb-4 flex items-center justify-between px-2">
            <div className="text-xs uppercase tracking-widest text-[#94a3b8]">
              Today&apos;s Games
            </div>
            <span className="rounded-full border border-[#1f2937] bg-[#111827]/70 px-2 py-0.5 text-[10px] font-medium text-[#94a3b8]">
              {games.length}
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[72px] animate-pulse rounded-3xl border border-[#1f2937] bg-[#111827]/40"
                />
              ))}
            </div>
          ) : error ? (
            <p className="px-2 text-sm text-[#fb7185]">Failed to load: {error}</p>
          ) : games.length === 0 ? (
            <p className="px-2 text-sm text-[#94a3b8]">No games scheduled today.</p>
          ) : (
            games.map((game) => {
              const pred = predictionByGameId.get(game.id)
              const homeTeam = teamMap.get(game.homeTeamId)
              const awayTeam = teamMap.get(game.awayTeamId)
              if (!pred || !homeTeam || !awayTeam) return null

              const nrfiPct = Math.round(pred.nrfiProbability * 100)
              const isNrfi = pred.nrfiProbability >= 0.5
              const displayPct = isNrfi ? nrfiPct : 100 - nrfiPct
              const va = pred.valueAnalysis
              const edge =
                va && va.recommendedBet !== "NO_BET"
                  ? (va.recommendedBet === "NRFI" ? va.nrfiEdge : va.yrfiEdge) * 100
                  : 0
              const edgeColor =
                va?.recommendedBet === "YRFI"
                  ? "bg-[#f43f5e]/12 text-[#fb7185]"
                  : "bg-[#22c55e]/12 text-[#4ade80]"
              const isSelected = selectedGameId === game.id

              return (
                <button
                  key={game.id}
                  onClick={() => setSelectedGameId(game.id)}
                  className={cn(
                    "group mb-3 flex w-full cursor-pointer items-center justify-between rounded-3xl border border-transparent p-4 text-left transition-all duration-200 hover:bg-[#1f2937]",
                    isSelected
                      ? "bg-[#1f2937] ring-1 ring-[#a78bfa] neon-ring-purple"
                      : "hover:border-[#1f2937]",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[#f8fafc]">
                      {awayTeam.abbreviation}{" "}
                      <span className="text-[#475569]">@</span>{" "}
                      {homeTeam.abbreviation}
                    </div>
                    <div className="mt-0.5 text-xs text-[#94a3b8]">
                      {game.time} {game.timeZone}
                    </div>
                  </div>
                  <div className="ml-3 shrink-0 text-right">
                    <div
                      className={cn(
                        "font-metric text-2xl font-semibold leading-none",
                        isNrfi ? "text-[#4ade80]" : "text-[#fb7185]",
                      )}
                    >
                      {displayPct}%
                    </div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-wider text-[#94a3b8]">
                      {isNrfi ? "NRFI" : "YRFI"}
                    </div>
                    {edge >= 3 && (
                      <div
                        className={cn(
                          "mt-1 rounded-2xl px-2.5 py-0.5 text-[10px] font-semibold",
                          edgeColor,
                        )}
                      >
                        +{edge.toFixed(1)}% EDGE
                      </div>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </aside>

        {/* Central area */}
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          {isLoading ? (
            <div className="mx-auto h-80 max-w-5xl animate-pulse rounded-3xl border border-[#1f2937] bg-[#111827]/40" />
          ) : isGridMode ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {games.map((game) => {
                const pred = predictionByGameId.get(game.id)
                const homeTeam = teamMap.get(game.homeTeamId)
                const awayTeam = teamMap.get(game.awayTeamId)
                const homePitcher = pitcherMap.get(game.homePitcherId)
                const awayPitcher = pitcherMap.get(game.awayPitcherId)
                if (!pred || !homeTeam || !awayTeam || !homePitcher || !awayPitcher) return null
                return (
                  <div
                    key={game.id}
                    className="[&_[data-slot=card]]:border-[#1f2937] [&_[data-slot=card]]:bg-[#0f172a]/60 [&_[data-slot=card]]:backdrop-blur"
                  >
                    <GamePredictionCard
                      game={game}
                      prediction={pred}
                      homeTeam={homeTeam}
                      awayTeam={awayTeam}
                      homePitcher={homePitcher}
                      awayPitcher={awayPitcher}
                    />
                  </div>
                )
              })}
            </div>
          ) : selectedGame &&
            selectedPred &&
            selectedHomeTeam &&
            selectedAwayTeam &&
            selectedHomePitcher &&
            selectedAwayPitcher ? (
            <NeonCockpit
              game={selectedGame}
              prediction={selectedPred}
              homeTeam={selectedHomeTeam}
              awayTeam={selectedAwayTeam}
              homePitcher={selectedHomePitcher}
              awayPitcher={selectedAwayPitcher}
              onLockIn={handleLockIn}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[#94a3b8]">
              Select a game from the sidebar to begin
            </div>
          )}
        </main>

        {/* Right contextual panel */}
        <aside className="w-full shrink-0 border-t border-[#1f2937] bg-[#0a0a0a]/95 p-6 lg:w-80 lg:border-t-0 lg:border-l lg:overflow-y-auto">
          <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-widest text-[#94a3b8]">
            <Activity className="h-3 w-3 text-[#22d3ee] neon-glow-cyan" />
            Contextual Insights
          </div>

          {selectedGame &&
          selectedPred &&
          selectedHomeTeam &&
          selectedAwayTeam &&
          selectedHomePitcher &&
          selectedAwayPitcher ? (
            <div className="space-y-5">
              <CompactPitcherCard
                label={`${selectedAwayTeam.abbreviation} Starter`}
                pitcher={selectedAwayPitcher}
              />
              <CompactPitcherCard
                label={`${selectedHomeTeam.abbreviation} Starter`}
                pitcher={selectedHomePitcher}
              />
              <CompactTeamCard
                label={`${selectedAwayTeam.abbreviation} Offense`}
                team={selectedAwayTeam}
              />
              <CompactTeamCard
                label={`${selectedHomeTeam.abbreviation} Offense`}
                team={selectedHomeTeam}
              />
              {selectedPred.valueAnalysis &&
                selectedPred.valueAnalysis.recommendedBet !== "NO_BET" && (
                  <ValueHint va={selectedPred.valueAnalysis} />
                )}
            </div>
          ) : (
            <p className="text-sm text-[#94a3b8]">Select a game to see pitcher and team context.</p>
          )}
        </aside>
      </div>
    </div>
  )
}

// ─── Compact right-panel cards (reuse existing data; no new types) ──────────

function CompactPitcherCard({ label, pitcher }: { label: string; pitcher: Pitcher }) {
  const fi = pitcher.firstInning
  const nrfiPct = Math.round(fi.nrfiRate * 100)
  const tier =
    fi.nrfiRate >= 0.74
      ? "text-[#4ade80]"
      : fi.nrfiRate >= 0.66
        ? "text-[#22d3ee]"
        : fi.nrfiRate >= 0.6
          ? "text-[#facc15]"
          : "text-[#fb7185]"
  const barColor =
    fi.nrfiRate >= 0.74
      ? "bg-[#22c55e]"
      : fi.nrfiRate >= 0.66
        ? "bg-[#06b6d4]"
        : fi.nrfiRate >= 0.6
          ? "bg-[#facc15]"
          : "bg-[#f43f5e]"

  return (
    <div className="rounded-2xl border border-[#1f2937] bg-[#111827]/60 p-4 backdrop-blur">
      <div className="mb-1 text-[10px] uppercase tracking-widest text-[#94a3b8]">{label}</div>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#f8fafc]">{pitcher.name}</p>
          <p className="text-[11px] text-[#94a3b8]">
            {pitcher.throws}HP · Age {pitcher.age} · {fi.startCount} GS
          </p>
        </div>
        <span className={cn("font-metric text-xl font-semibold", tier)}>{nrfiPct}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#0a0a0a]">
        <div className={cn("h-full rounded-full", barColor)} style={{ width: `${nrfiPct}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <Stat label="1st ERA" value={fi.era.toFixed(2)} />
        <Stat label="WHIP" value={fi.whip.toFixed(2)} />
        <Stat label="K%" value={`${(fi.kRate * 100).toFixed(0)}%`} />
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-[#94a3b8]">Last 5</span>
        <div className="flex gap-1">
          {fi.last5Results.map((r, i) => (
            <span
              key={i}
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                r ? "bg-[#22c55e] neon-glow-emerald" : "bg-[#f43f5e] neon-glow-crimson",
              )}
              title={r ? "NRFI" : "YRFI"}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function CompactTeamCard({ label, team }: { label: string; team: Team }) {
  const fi = team.firstInning
  const yrfiPct = Math.round(fi.yrfiRate * 100)
  const tier =
    fi.yrfiRate >= 0.44
      ? "text-[#fb7185]"
      : fi.yrfiRate >= 0.38
        ? "text-[#facc15]"
        : fi.yrfiRate >= 0.32
          ? "text-[#22d3ee]"
          : "text-[#4ade80]"
  const barColor =
    fi.yrfiRate >= 0.44
      ? "bg-[#f43f5e]"
      : fi.yrfiRate >= 0.38
        ? "bg-[#facc15]"
        : fi.yrfiRate >= 0.32
          ? "bg-[#06b6d4]"
          : "bg-[#22c55e]"
  const fillPct = Math.min((fi.yrfiRate / 0.55) * 100, 100)

  return (
    <div className="rounded-2xl border border-[#1f2937] bg-[#111827]/60 p-4 backdrop-blur">
      <div className="mb-1 text-[10px] uppercase tracking-widest text-[#94a3b8]">{label}</div>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#f8fafc]">
            {team.city} {team.name}
          </p>
          <p className="text-[11px] text-[#94a3b8]">
            {team.league} {team.division} · {fi.runsPerGame.toFixed(2)} R/G 1st
          </p>
        </div>
        <div className="text-right">
          <span className={cn("font-metric text-xl font-semibold", tier)}>{yrfiPct}%</span>
          <div className="text-[10px] uppercase tracking-wider text-[#94a3b8]">YRFI</div>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#0a0a0a]">
        <div className={cn("h-full rounded-full", barColor)} style={{ width: `${fillPct}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <Stat label="OPS" value={fi.ops.toFixed(3)} />
        <Stat label="wOBA" value={fi.woba.toFixed(3)} />
        <Stat label="L10" value={`${Math.round(fi.last10YrfiRate * 100)}%`} />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#1f2937] bg-[#0a0a0a]/60 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-[#94a3b8]">{label}</div>
      <div className="font-metric text-sm font-semibold text-[#f8fafc]">{value}</div>
    </div>
  )
}

function ValueHint({ va }: { va: NonNullable<NRFIPrediction["valueAnalysis"]> }) {
  const isYrfi = va.recommendedBet === "YRFI"
  const edge = isYrfi ? va.yrfiEdge : va.nrfiEdge
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 backdrop-blur",
        isYrfi
          ? "border-[#f43f5e]/40 bg-[#f43f5e]/10 neon-glow-crimson"
          : "border-[#22c55e]/40 bg-[#22c55e]/10 neon-glow-emerald",
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#f8fafc]">
        <Flame className={cn("h-3 w-3", isYrfi ? "text-[#fb7185]" : "text-[#4ade80]")} />
        Value Edge · {va.recommendedBet}
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <div className="text-[9px] uppercase tracking-wider text-[#94a3b8]">Edge</div>
          <div className="font-metric text-sm font-semibold text-[#f8fafc]">
            +{(edge * 100).toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-[#94a3b8]">Kelly</div>
          <div className="font-metric text-sm font-semibold text-[#facc15]">
            {(va.kellyFraction * 100).toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-[#94a3b8]">EV</div>
          <div
            className={cn(
              "font-metric text-sm font-semibold",
              va.expectedValue >= 0 ? "text-[#4ade80]" : "text-[#fb7185]",
            )}
          >
            {va.expectedValue >= 0 ? "+" : ""}
            {(va.expectedValue * 100).toFixed(1)}%
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-[#94a3b8]">
        <Target className="h-3 w-3 text-[#22d3ee]" />
        NRFI {va.nrfiOdds > 0 ? "+" : ""}
        {va.nrfiOdds} · YRFI {va.yrfiOdds > 0 ? "+" : ""}
        {va.yrfiOdds}
        <DollarSign className="ml-auto h-3 w-3 text-[#facc15]" />
      </div>
    </div>
  )
}
