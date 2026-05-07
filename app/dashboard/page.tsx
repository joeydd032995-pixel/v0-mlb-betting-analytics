import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Heart, DollarSign, TrendingUp, BarChart3, Target, Trophy, Calendar, Zap, TrendingDown } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getLiveGameSlate } from "@/lib/api/live-data"
import { computeAllPredictions } from "@/lib/nrfi-engine"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getETDate(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d)
}

const MODEL_KEYS = ["Poisson", "ZIP", "Markov", "Ensemble"] as const
type ModelKey = typeof MODEL_KEYS[number]

type PredRow = {
  prediction:   string
  actualResult: string | null
  correct:      boolean | null
  poissonNrfi:  number
  zipNrfi:      number
  markovNrfi:   number
  ensembleNrfi: number
}

function getModelProb(row: PredRow, m: ModelKey): number {
  switch (m) {
    case "Poisson":  return row.poissonNrfi
    case "ZIP":      return row.zipNrfi
    case "Markov":   return row.markovNrfi
    case "Ensemble": return row.ensembleNrfi
  }
}

function scoreModels(rows: PredRow[]) {
  const counts: Record<ModelKey, { correct: number; total: number }> = {
    Poisson:  { correct: 0, total: 0 },
    ZIP:      { correct: 0, total: 0 },
    Markov:   { correct: 0, total: 0 },
    Ensemble: { correct: 0, total: 0 },
  }
  for (const row of rows) {
    if (!row.actualResult) continue
    for (const m of MODEL_KEYS) {
      const call = getModelProb(row, m) >= 0.5 ? "NRFI" : "YRFI"
      counts[m].total++
      if (call === row.actualResult) counts[m].correct++
    }
  }
  return MODEL_KEYS.map((m) => ({
    model:    m,
    correct:  counts[m].correct,
    total:    counts[m].total,
    accuracy: counts[m].total > 0 ? counts[m].correct / counts[m].total : 0,
  })).sort((a, b) => b.accuracy - a.accuracy || a.model.localeCompare(b.model))
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  const yesterday = getETDate(-1)
  const today     = getETDate(0)

  type BetRow = { result: string | null; pnl: number | null }
  type BankrollRow = { currentBalance: number } | null

  const [betsRaw, watchlist, bankrollRaw, allCompleteRaw, yesterdayPredsRaw, slate] = await Promise.all([
    prisma.bet.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.watchlistItem.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.bankroll.findUnique({ where: { userId } }),
    prisma.modelPrediction.findMany({
      where:  { status: "complete" },
      select: {
        prediction: true, actualResult: true, correct: true,
        poissonNrfi: true, zipNrfi: true, markovNrfi: true, ensembleNrfi: true,
      },
    }),
    prisma.modelPrediction.findMany({
      where:  { status: "complete", date: yesterday },
      select: {
        prediction: true, actualResult: true, correct: true,
        poissonNrfi: true, zipNrfi: true, markovNrfi: true, ensembleNrfi: true,
      },
    }),
    getLiveGameSlate(today).catch(() => ({ games: [] as any[], pitchers: new Map(), teams: new Map() })),
  ])
  const bets           = betsRaw           as BetRow[]
  const bankroll       = bankrollRaw       as BankrollRow
  const allComplete    = allCompleteRaw    as PredRow[]
  const yesterdayPreds = yesterdayPredsRaw as PredRow[]

  // ── Season accuracy ────────────────────────────────────────────────────────
  const withResult  = allComplete.filter((p) => p.correct !== null)
  const nrfiPreds   = withResult.filter((p) => p.prediction === "NRFI")
  const yrfiPreds   = withResult.filter((p) => p.prediction === "YRFI")
  const nrfiCorrect = nrfiPreds.filter((p) => p.correct).length
  const yrfiCorrect = yrfiPreds.filter((p) => p.correct).length
  const seasonNrfiAcc = nrfiPreds.length > 0 ? nrfiCorrect / nrfiPreds.length : null
  const seasonYrfiAcc = yrfiPreds.length > 0 ? yrfiCorrect / yrfiPreds.length : null

  // ── Yesterday's best model per side ───────────────────────────────────────
  const yNrfiGames = yesterdayPreds.filter((p) => p.actualResult === "NRFI")
  const yYrfiGames = yesterdayPreds.filter((p) => p.actualResult === "YRFI")
  const bestNrfiModel = yNrfiGames.length > 0 ? scoreModels(yNrfiGames)[0] : null
  const bestYrfiModel = yYrfiGames.length > 0 ? scoreModels(yYrfiGames)[0] : null

  // ── Yesterday's results summary ────────────────────────────────────────────
  const yNrfiPredicted = yesterdayPreds.filter((p) => p.prediction === "NRFI")
  const yYrfiPredicted = yesterdayPreds.filter((p) => p.prediction === "YRFI")
  const yNrfiCorrect   = yNrfiPredicted.filter((p) => p.prediction === p.actualResult).length
  const yYrfiCorrect   = yYrfiPredicted.filter((p) => p.prediction === p.actualResult).length
  const yTotal         = yesterdayPreds.length
  const yTotalCorrect  = yesterdayPreds.filter((p) => p.prediction === p.actualResult).length
  const yAccuracy      = yTotal > 0 ? yTotalCorrect / yTotal : null

  // ── Model ROI (unit-based, −110 assumed) ───────────────────────────────────
  const WIN_UNIT  = 100 / 110
  const LOSS_UNIT = -1.0
  const totalUnits = withResult.reduce((sum, p) => sum + (p.correct ? WIN_UNIT : LOSS_UNIT), 0)
  const roiPct     = withResult.length > 0 ? (totalUnits / withResult.length) * 100 : null

  // ── Top 2 models overall ───────────────────────────────────────────────────
  const topModels = withResult.length > 0 ? scoreModels(withResult).slice(0, 2) : []

  // ── Today's top NRFI pick ──────────────────────────────────────────────────
  const predictions = computeAllPredictions(slate.games, slate.pitchers, slate.teams)
  const sorted = [...predictions].sort((a, b) => {
    const confOrder = { High: 0, Medium: 1, Low: 2 }
    const cDiff = confOrder[a.confidence] - confOrder[b.confidence]
    return cDiff !== 0 ? cDiff : b.nrfiProbability - a.nrfiProbability
  })
  const topPick = sorted[0] ?? null
  const topGame = topPick ? slate.games.find((g: any) => g.id === topPick.gameId) : null
  const topHomePitcher = topGame ? slate.pitchers.get(topGame.homePitcherId) : null
  const topAwayPitcher = topGame ? slate.pitchers.get(topGame.awayPitcherId) : null

  // ── User stats ─────────────────────────────────────────────────────────────
  const completedBets = bets.filter((b) => b.result)
  const totalPnL  = completedBets.reduce((sum, b) => sum + (b.pnl || 0), 0)
  const winRate   = completedBets.length > 0
    ? (completedBets.filter((b) => b.pnl && b.pnl > 0).length / completedBets.length) * 100
    : 0

  const hasSeasonData = withResult.length > 0

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">

        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-foreground">Dashboard</h1>
          <p className="text-lg text-muted-foreground">
            Model performance, today&apos;s best pick, and your betting stats.
          </p>
        </div>

        {/* ── Intelligence Cards ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

          {/* Season NRFI Accuracy */}
          <div className="rounded-lg border border-border/30 bg-card/50 p-6">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-sky-400" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Season NRFI Accuracy</span>
            </div>
            {hasSeasonData ? (
              <>
                <p className="text-3xl font-bold text-foreground mt-2">
                  {seasonNrfiAcc !== null ? `${(seasonNrfiAcc * 100).toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {nrfiCorrect} correct / {nrfiPreds.length} predicted
                </p>
                {bestNrfiModel ? (
                  <p className="text-xs text-sky-400 mt-3">
                    Yesterday&apos;s best NRFI model: <span className="font-semibold">{bestNrfiModel.model}</span>
                    {" "}({(bestNrfiModel.accuracy * 100).toFixed(0)}% on {yNrfiGames.length} games)
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground/60 mt-3">No games yesterday</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">No data synced yet</p>
            )}
          </div>

          {/* Season YRFI Accuracy */}
          <div className="rounded-lg border border-border/30 bg-card/50 p-6">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-rose-400" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Season YRFI Accuracy</span>
            </div>
            {hasSeasonData ? (
              <>
                <p className="text-3xl font-bold text-foreground mt-2">
                  {seasonYrfiAcc !== null ? `${(seasonYrfiAcc * 100).toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {yrfiCorrect} correct / {yrfiPreds.length} predicted
                </p>
                {bestYrfiModel ? (
                  <p className="text-xs text-rose-400 mt-3">
                    Yesterday&apos;s best YRFI model: <span className="font-semibold">{bestYrfiModel.model}</span>
                    {" "}({(bestYrfiModel.accuracy * 100).toFixed(0)}% on {yYrfiGames.length} games)
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground/60 mt-3">No games yesterday</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">No data synced yet</p>
            )}
          </div>

          {/* Yesterday's Results */}
          <div className="rounded-lg border border-border/30 bg-card/50 p-6">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-violet-400" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Yesterday&apos;s Results</span>
            </div>
            {yTotal > 0 ? (
              <>
                <p className="text-3xl font-bold text-foreground mt-2">
                  {yAccuracy !== null ? `${(yAccuracy * 100).toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{yTotalCorrect}/{yTotal} correct · {yesterday}</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded bg-card/60 px-3 py-2">
                    <p className="text-xs text-muted-foreground">NRFI</p>
                    <p className="text-sm font-semibold text-foreground">
                      {yNrfiCorrect}/{yNrfiPredicted.length}
                      <span className="text-xs text-muted-foreground font-normal ml-1">predicted</span>
                    </p>
                  </div>
                  <div className="rounded bg-card/60 px-3 py-2">
                    <p className="text-xs text-muted-foreground">YRFI</p>
                    <p className="text-sm font-semibold text-foreground">
                      {yYrfiCorrect}/{yYrfiPredicted.length}
                      <span className="text-xs text-muted-foreground font-normal ml-1">predicted</span>
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">No completed predictions for {yesterday}</p>
            )}
          </div>

          {/* Today's Top NRFI Pick */}
          <div className="rounded-lg border border-border/30 bg-card/50 p-6">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Today&apos;s Top NRFI Pick</span>
            </div>
            {topPick && topGame ? (
              <>
                <p className="text-2xl font-bold text-foreground mt-2">
                  {topGame.awayTeamId.toUpperCase()} @ {topGame.homeTeamId.toUpperCase()}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-lg font-semibold text-amber-400">
                    {(topPick.nrfiProbability * 100).toFixed(1)}% NRFI
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    topPick.confidence === "High"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : topPick.confidence === "Medium"
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {topPick.confidence} · {topPick.confidenceScore}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {topAwayPitcher?.name ?? "TBD"} vs {topHomePitcher?.name ?? "TBD"}
                </p>
                <Link
                  href={`/ensemble/${topPick.gameId}`}
                  className="inline-block mt-3 text-xs text-sky-400 hover:text-sky-300 transition-colors"
                >
                  View ensemble breakdown →
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">No games today</p>
            )}
          </div>

          {/* Model ROI */}
          <div className="rounded-lg border border-border/30 bg-card/50 p-6">
            <div className="flex items-center gap-2 mb-1">
              {totalUnits >= 0
                ? <TrendingUp className="h-4 w-4 text-emerald-400" />
                : <TrendingDown className="h-4 w-4 text-rose-400" />
              }
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Model ROI</span>
            </div>
            {hasSeasonData ? (
              <>
                <p className={`text-3xl font-bold mt-2 ${totalUnits >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {totalUnits >= 0 ? "+" : ""}{totalUnits.toFixed(2)}u
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {withResult.length} bets tracked
                  {roiPct !== null && ` · ${roiPct >= 0 ? "+" : ""}${roiPct.toFixed(1)}% ROI`}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-3">1 unit per prediction · −110 assumed</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">No data synced yet</p>
            )}
          </div>

          {/* Best Overall Models */}
          <div className="rounded-lg border border-border/30 bg-card/50 p-6">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Best Overall Models</span>
            </div>
            {topModels.length > 0 ? (
              <>
                <div className="mt-2 space-y-3">
                  {topModels.map((m, i) => (
                    <div key={m.model} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold w-4 ${i === 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                          #{i + 1}
                        </span>
                        <span className="text-sm font-semibold text-foreground">{m.model}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-foreground">
                          {(m.accuracy * 100).toFixed(1)}%
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">
                          ({m.correct}/{m.total})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground/60 mt-4">Updates as predictions are synced</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">No data synced yet</p>
            )}
          </div>

        </div>

        {/* ── Nav Cards ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/watchlist"
            className="group rounded-lg border border-border/30 bg-card/50 p-6 hover:bg-card/70 transition-colors"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-rose-500/20 text-rose-400 group-hover:bg-rose-500/30 transition-colors">
              <Heart className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-semibold text-foreground">Watchlist</h3>
            <p className="mt-1 text-xs text-muted-foreground">{watchlist.length} games tracked</p>
          </Link>

          <Link
            href="/bets"
            className="group rounded-lg border border-border/30 bg-card/50 p-6 hover:bg-card/70 transition-colors"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-violet-500/20 text-violet-400 group-hover:bg-violet-500/30 transition-colors">
              <DollarSign className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-semibold text-foreground">Bets</h3>
            <p className="mt-1 text-xs text-muted-foreground">{bets.length} bets total</p>
          </Link>

          <Link
            href="/accuracy"
            className="group rounded-lg border border-border/30 bg-card/50 p-6 hover:bg-card/70 transition-colors"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400 group-hover:bg-sky-500/30 transition-colors">
              <BarChart3 className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-semibold text-foreground">Accuracy</h3>
            <p className="mt-1 text-xs text-muted-foreground">View your metrics</p>
          </Link>

          <Link
            href="/insights"
            className="group rounded-lg border border-border/30 bg-card/50 p-6 hover:bg-card/70 transition-colors"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500/30 transition-colors">
              <TrendingUp className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-semibold text-foreground">Insights</h3>
            <p className="mt-1 text-xs text-muted-foreground">Explore model factors</p>
          </Link>
        </div>

        {/* ── Your Stats ────────────────────────────────────────────────────── */}
        <div className="rounded-lg border border-border/30 bg-card/50 p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Your Stats</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Bets</p>
              <p className="text-2xl font-bold text-foreground mt-1">{bets.length}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Win Rate</p>
              <p className="text-2xl font-bold text-foreground mt-1">{winRate.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total P/L</p>
              <p className={totalPnL > 0 ? "text-emerald-400" : "text-foreground"}>
                <span className="text-2xl font-bold">{totalPnL > 0 ? "+" : ""}{totalPnL.toFixed(2)}</span>
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Balance</p>
              <p className="text-2xl font-bold text-foreground mt-1">${bankroll?.currentBalance.toFixed(2) || "—"}</p>
            </div>
          </div>
        </div>

      </main>
    </div>
  )
}
