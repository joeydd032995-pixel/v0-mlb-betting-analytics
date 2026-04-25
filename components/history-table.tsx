"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { CheckCircle2, XCircle, ClipboardList, ChevronDown, ChevronRight, Trash2, Download } from "lucide-react"
import type { TrackedPrediction, ExtendedModelAccuracy, PerModelAccuracy } from "@/lib/prediction-store"

interface Props {
  predictions: TrackedPrediction[]
  accuracy: ExtendedModelAccuracy
  onRecordResult: (id: string, homeRuns: number, awayRuns: number) => void
  onDelete: (id: string) => void
  dateRange?: { from: Date; to: Date }
  onExportCSV?: () => void
}

function pct(n: number, d = 1) {
  return `${(n * 100).toFixed(d)}%`
}

function formatOdds(n?: number) {
  if (n == null) return "—"
  return n > 0 ? `+${n}` : `${n}`
}

function formatPnL(pnl?: number) {
  if (pnl == null) return "—"
  return pnl > 0 ? `+${pnl.toFixed(2)}u` : `${pnl.toFixed(2)}u`
}

function exportToCSV(predictions: TrackedPrediction[]): void {
  if (predictions.length === 0) return

  // Prepare CSV headers
  const headers = [
    "Date",
    "Matchup",
    "Prediction",
    "NRFI%",
    "Confidence",
    "Status",
    "Actual Result",
    "1st Inning Runs",
    "Correct",
    "Odds",
    "Profit/Loss",
  ]

  // Prepare rows
  const rows = predictions.map((p) => [
    p.date,
    `${p.awayTeam} @ ${p.homeTeam}`,
    p.prediction,
    `${(p.nrfiProbability * 100).toFixed(1)}%`,
    p.confidence,
    p.status,
    p.actualResult || "—",
    p.runsFirstInning ? `${p.runsFirstInning.away}-${p.runsFirstInning.home}` : "—",
    p.actualResult ? (p.prediction === p.actualResult ? "YES" : "NO") : "—",
    p.prediction === "NRFI" && p.nrfiOdds ? formatOdds(p.nrfiOdds) : p.prediction === "YRFI" && p.yrfiOdds ? formatOdds(p.yrfiOdds) : "—",
    formatPnL(p.profitLoss),
  ])

  // Build CSV content
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n")

  // Create blob and download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `nrfi_predictions_${new Date().toISOString().split("T")[0]}.csv`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function ConfBadge({ level }: { level: TrackedPrediction["confidence"] }) {
  const cls =
    level === "High"
      ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
      : level === "Medium"
        ? "text-sky-400 bg-sky-400/10 border-sky-400/20"
        : "text-zinc-400 bg-zinc-400/10 border-zinc-400/20"
  return (
    <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium", cls)}>
      {level}
    </span>
  )
}

// ─── Record Result form ───────────────────────────────────────────────────────

function RecordResultForm({
  pred,
  onSubmit,
  onCancel,
}: {
  pred: TrackedPrediction
  onSubmit: (homeRuns: number, awayRuns: number) => void
  onCancel: () => void
}) {
  const [homeRuns, setHomeRuns] = useState("")
  const [awayRuns, setAwayRuns] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const h = parseInt(homeRuns, 10)
    const a = parseInt(awayRuns, 10)
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) return
    onSubmit(h, a)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 flex flex-wrap items-end gap-3 rounded-md border border-border/40 bg-muted/10 p-3"
    >
      <div className="space-y-1">
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          {pred.awayTeam} runs
        </label>
        <input
          type="number"
          min={0}
          max={20}
          value={awayRuns}
          onChange={(e) => setAwayRuns(e.target.value)}
          placeholder="0"
          className="w-16 rounded border border-border/50 bg-background px-2 py-1 text-sm tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          required
        />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          {pred.homeTeam} runs
        </label>
        <input
          type="number"
          min={0}
          max={20}
          value={homeRuns}
          onChange={(e) => setHomeRuns(e.target.value)}
          placeholder="0"
          className="w-16 rounded border border-border/50 bg-background px-2 py-1 text-sm tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          required
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 transition-colors"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-border/40 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/20 transition-colors"
        >
          Cancel
        </button>
      </div>
      <p className="w-full text-[10px] text-muted-foreground">
        Enter runs scored by each team in the 1st inning only.
      </p>
    </form>
  )
}

// ─── Per-model accuracy panel ─────────────────────────────────────────────────

function ModelAccuracyPanel({ perModel }: { perModel: PerModelAccuracy[] }) {
  if (perModel.length === 0) return null
  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 p-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Per-Model Accuracy (completed predictions)
      </h4>
      <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {perModel.map((m) => {
          const color =
            m.accuracy >= 0.70
              ? "text-emerald-400"
              : m.accuracy >= 0.60
                ? "text-sky-400"
                : m.accuracy >= 0.50
                  ? "text-amber-400"
                  : "text-rose-400"
          const barColor =
            m.accuracy >= 0.70
              ? "bg-emerald-500"
              : m.accuracy >= 0.60
                ? "bg-sky-500"
                : m.accuracy >= 0.50
                  ? "bg-amber-500"
                  : "bg-rose-500"
          return (
            <div key={m.model} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{m.model}</span>
                <span className={cn("text-sm font-bold tabular-nums", color)}>
                  {m.totalPredictions > 0 ? pct(m.accuracy) : "—"}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all", barColor)}
                  style={{ width: m.totalPredictions > 0 ? `${m.accuracy * 100}%` : "0%" }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{m.correct}/{m.totalPredictions} correct</span>
                {m.totalPredictions > 0 && (
                  <span>MAE {m.mae.toFixed(3)}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        MAE = Mean Absolute Error between model probability and actual outcome (lower is better).
        Base models: Poisson, ZIP, Markov, MAPRE. Meta-models: Logistic Stack, NN Interaction, Hierarchical Bayes.
        The Ensemble is the final blended prediction used for recommendations.
      </p>
    </div>
  )
}

// ─── Model breakdown tooltip for completed rows ───────────────────────────────

function ModelBreakdownRow({ pred }: { pred: TrackedPrediction }) {
  return (
    <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
      <span>Poisson: <span className="font-medium text-foreground">{pct(pred.poissonNrfi)} NRFI</span></span>
      <span>ZIP: <span className="font-medium text-foreground">{pct(pred.zipNrfi)} NRFI</span></span>
      <span>Markov: <span className="font-medium text-foreground">{pct(pred.markovNrfi)} NRFI</span></span>
      {pred.logisticMetaNrfi != null && (
        <span>Logistic Stack: <span className="font-medium text-foreground">{pct(pred.logisticMetaNrfi)} NRFI</span></span>
      )}
      {pred.nnInteractionNrfi != null && (
        <span>NN Interact: <span className="font-medium text-foreground">{pct(pred.nnInteractionNrfi)} NRFI</span></span>
      )}
      {pred.hierarchicalBayesNrfi != null && (
        <span>Hier. Bayes: <span className="font-medium text-foreground">{pct(pred.hierarchicalBayesNrfi)} NRFI</span></span>
      )}
      <span>Consensus: <span className="font-medium text-foreground">{pct(pred.modelConsensus)}</span></span>
      <span>Home ZIP ω: <span className="font-medium text-foreground">{pct(pred.homeZipOmega)}</span></span>
      <span>Away ZIP ω: <span className="font-medium text-foreground">{pct(pred.awayZipOmega)}</span></span>
      <span>
        Bayesian weight (H/A):{" "}
        <span className="font-medium text-foreground">
          {pct(pred.homeBayesianWeight)}/{pct(pred.awayBayesianWeight)}
        </span>
      </span>
    </div>
  )
}

// ─── Pending section ──────────────────────────────────────────────────────────

function PendingSection({
  pending,
  onRecordResult,
  onDelete,
}: {
  pending: TrackedPrediction[]
  onRecordResult: (id: string, homeRuns: number, awayRuns: number) => void
  onDelete: (id: string) => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  if (pending.length === 0) return null

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-foreground">Pending Results</h3>
        <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-xs font-medium text-amber-400">
          {pending.length}
        </span>
      </div>
      <div className="space-y-2">
        {pending.map((pred) => (
          <div
            key={pred.id}
            className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground text-sm">
                    {pred.awayTeam} @ {pred.homeTeam}
                  </span>
                  <ConfBadge level={pred.confidence} />
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs font-semibold",
                      pred.prediction === "NRFI"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-rose-500/15 text-rose-300"
                    )}
                  >
                    {pred.prediction}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {pred.awayPitcher} vs {pred.homePitcher} · {pred.date}
                </p>
                <p className="text-xs text-muted-foreground">
                  NRFI {pct(pred.nrfiProbability)} · YRFI {pct(pred.yrfiProbability)}
                  {pred.nrfiOdds != null && (
                    <span className="ml-1">
                      · Odds {formatOdds(pred.nrfiOdds)}/{formatOdds(pred.yrfiOdds)}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setOpenId(openId === pred.id ? null : pred.id)}
                  className="flex items-center gap-1 rounded border border-border/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors"
                >
                  Record Result
                  {openId === pred.id
                    ? <ChevronDown className="h-3 w-3" />
                    : <ChevronRight className="h-3 w-3" />}
                </button>
                <button
                  onClick={() => onDelete(pred.id)}
                  className="rounded border border-border/30 p-1.5 text-muted-foreground hover:text-rose-400 hover:border-rose-400/30 transition-colors"
                  title="Remove prediction"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>

            {openId === pred.id && (
              <RecordResultForm
                pred={pred}
                onSubmit={(h, a) => {
                  onRecordResult(pred.id, h, a)
                  setOpenId(null)
                }}
                onCancel={() => setOpenId(null)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Completed row with expandable model breakdown ────────────────────────────

function CompletedRow({ pred, onDelete }: { pred: TrackedPrediction; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <tr
        className="border-b border-border/30 transition-colors hover:bg-muted/20 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{pred.date}</td>
        <td className="px-4 py-3">
          <span className="font-medium">{pred.awayTeam} @ {pred.homeTeam}</span>
        </td>
        <td className="px-3 py-3 text-xs text-muted-foreground max-w-[150px]">
          <span className="truncate block">{pred.awayPitcher}</span>
          <span className="truncate block">{pred.homePitcher}</span>
        </td>
        <td className="px-3 py-3 text-right tabular-nums font-medium">
          <span
            className={cn(
              pred.nrfiProbability >= 0.57
                ? "text-emerald-400"
                : pred.nrfiProbability <= 0.45
                  ? "text-rose-400"
                  : "text-muted-foreground"
            )}
          >
            {pct(pred.nrfiProbability)}
          </span>
        </td>
        <td className="px-3 py-3 text-center">
          <span
            className={cn(
              "inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold",
              pred.prediction === "NRFI"
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-rose-500/15 text-rose-300"
            )}
          >
            {pred.prediction}
          </span>
        </td>
        <td className="px-3 py-3 text-center">
          {pred.actualResult ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold",
                pred.prediction === pred.actualResult
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-rose-500/15 text-rose-300"
              )}
            >
              {pred.prediction === pred.actualResult ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <XCircle className="h-3 w-3" />
              )}
              {pred.actualResult}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-3 text-center">
          <ConfBadge level={pred.confidence} />
        </td>
        <td className="px-3 py-3 text-right text-xs text-muted-foreground tabular-nums">
          {pred.runsFirstInning ? `${pred.runsFirstInning.away}–${pred.runsFirstInning.home}` : "—"}
        </td>
        <td className="px-3 py-3 text-right text-xs text-muted-foreground tabular-nums">
          {pred.prediction === "NRFI" ? formatOdds(pred.nrfiOdds) : formatOdds(pred.yrfiOdds)}
        </td>
        <td
          className={cn(
            "px-3 py-3 text-right text-xs font-medium tabular-nums",
            pred.profitLoss != null
              ? pred.profitLoss > 0
                ? "text-emerald-400"
                : "text-rose-400"
              : "text-muted-foreground"
          )}
        >
          {formatPnL(pred.profitLoss)}
        </td>
        <td className="px-2 py-3 text-center">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="rounded p-1 text-muted-foreground hover:text-rose-400 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/20 bg-muted/5">
          <td colSpan={11} className="px-6 py-3">
            <ModelBreakdownRow pred={pred} />
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function HistoryTable({ predictions, accuracy, onRecordResult, onDelete, dateRange, onExportCSV }: Props) {
  // Filter by date range if provided
  const filtered = dateRange
    ? predictions.filter((p) => {
        const pDate = new Date(p.date)
        return pDate >= dateRange.from && pDate <= dateRange.to
      })
    : predictions

  const pending   = filtered.filter((p) => p.status === "pending")
  const completed = filtered.filter((p) => p.status === "complete")

  return (
    <div className="space-y-6">
      {/* ── Header with export button ── */}
      {onExportCSV && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {dateRange && `Filtered by date: ${dateRange.from.toLocaleDateString()} — ${dateRange.to.toLocaleDateString()}`}
          </p>
          <button
            onClick={() => {
              exportToCSV(filtered)
            }}
            className="flex items-center gap-1.5 rounded-md border border-border/30 bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      )}

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "Overall Accuracy",
            value: accuracy.totalPredictions > 0 ? pct(accuracy.accuracy) : "—",
            sub:
              accuracy.totalPredictions > 0
                ? `${accuracy.correct}/${accuracy.totalPredictions} correct`
                : "No completed results yet",
            color: "text-emerald-400",
          },
          {
            label: "NRFI Accuracy",
            value: accuracy.nrfiTotal > 0 ? pct(accuracy.nrfiAccuracy) : "—",
            sub: accuracy.nrfiTotal > 0
              ? `${accuracy.nrfiCorrect}/${accuracy.nrfiTotal} correct`
              : "When predicting NRFI",
            color: "text-sky-400",
          },
          {
            label: "YRFI Accuracy",
            value: accuracy.yrfiTotal > 0 ? pct(accuracy.yrfiAccuracy) : "—",
            sub: accuracy.yrfiTotal > 0
              ? `${accuracy.yrfiCorrect}/${accuracy.yrfiTotal} correct`
              : "When predicting YRFI",
            color: "text-violet-400",
          },
          {
            label: "High-Conf Accuracy",
            value: accuracy.highConfTotal > 0 ? pct(accuracy.highConfAccuracy) : "—",
            sub:
              accuracy.highConfTotal > 0
                ? `${accuracy.highConfCorrect}/${accuracy.highConfTotal} correct`
                : accuracy.totalPredictions > 0
                  ? "No completed High-Conf results"
                  : "No completed results yet",
            color: "text-amber-400",
          },
        ].map((s) => (
          <Card key={s.label} className="border border-border/50 p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", s.color)}>{s.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{s.sub}</p>
          </Card>
        ))}
      </div>

      {/* ── Per-model accuracy ── */}
      {accuracy.perModelAccuracy.length > 0 && accuracy.totalPredictions > 0 && (
        <ModelAccuracyPanel perModel={accuracy.perModelAccuracy} />
      )}

      {/* ── Monthly accuracy ── */}
      {accuracy.monthlyData.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Monthly Accuracy</h3>
          <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-6">
            {accuracy.monthlyData.map((m) => (
              <div
                key={m.month}
                className="rounded-lg border border-border/50 bg-card/50 px-3 py-2 text-center"
              >
                <p className="text-xs text-muted-foreground">{m.month}</p>
                <p
                  className={cn(
                    "text-lg font-bold tabular-nums",
                    m.accuracy >= 0.72
                      ? "text-emerald-400"
                      : m.accuracy >= 0.66
                        ? "text-sky-400"
                        : "text-amber-400"
                  )}
                >
                  {pct(m.accuracy)}
                </p>
                <p className="text-xs text-muted-foreground">{m.predictions} picks</p>
                <p
                  className={cn(
                    "text-xs font-medium tabular-nums",
                    m.roi > 0 ? "text-emerald-400" : "text-rose-400"
                  )}
                >
                  {m.roi > 0 ? "+" : ""}{pct(m.roi)} ROI
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pending results ── */}
      {pending.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Results for pending games are fetched automatically from the MLB Stats API once
          each game ends — use the <strong className="text-foreground">Sync Results</strong> button
          above to refresh, or enter runs manually below.
        </p>
      )}
      <PendingSection pending={pending} onRecordResult={onRecordResult} onDelete={onDelete} />

      {/* ── Completed predictions table ── */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Completed Predictions</h3>

        {completed.length === 0 ? (
          <div className="rounded-lg border border-border/40 bg-muted/10 py-12 text-center">
            <p className="text-sm font-medium text-foreground">No completed predictions yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Record 1st-inning results above and they&apos;ll appear here.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-lg border border-border/50 md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/20">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Matchup</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pitchers</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">NRFI%</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prediction</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Result</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conf</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">1st Inn</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Odds</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">P/L</th>
                    <th className="px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {completed.map((r) => (
                    <CompletedRow
                      key={r.id}
                      pred={r}
                      onDelete={() => onDelete(r.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="grid gap-3 md:hidden">
              {completed.map((r) => (
                <Card key={r.id} className="border border-border/50 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">{r.date}</p>
                      <p className="mt-0.5 font-medium">{r.awayTeam} @ {r.homeTeam}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.awayPitcher} vs {r.homePitcher}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {r.actualResult ? (
                        r.prediction === r.actualResult ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        ) : (
                          <XCircle className="h-5 w-5 text-rose-400" />
                        )
                      ) : null}
                      <button
                        onClick={() => onDelete(r.id)}
                        className="rounded p-1 text-muted-foreground hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 font-semibold",
                        r.prediction === "NRFI"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-rose-500/15 text-rose-300"
                      )}
                    >
                      {r.prediction}
                    </span>
                    <span className="text-muted-foreground">{pct(r.nrfiProbability)} NRFI</span>
                    <ConfBadge level={r.confidence} />
                    {r.profitLoss != null && (
                      <span
                        className={cn(
                          "font-medium",
                          r.profitLoss > 0 ? "text-emerald-400" : "text-rose-400"
                        )}
                      >
                        {formatPnL(r.profitLoss)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Result: {r.actualResult} · 1st inning:{" "}
                    {r.runsFirstInning ? `${r.runsFirstInning.away}–${r.runsFirstInning.home}` : "—"}
                  </p>
                  <div className="mt-2 border-t border-border/20 pt-2">
                    <ModelBreakdownRow pred={r} />
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        * P/L shown as flat-stake units on the recommended bet. Click any row to see the full
        per-model breakdown (Poisson / ZIP / Markov / Ensemble). High-confidence bets are
        predictions with a confidence score ≥ 62. ZIP ω = lockdown probability;
        high ω means the model expects a dominant 1-2-3 inning.
      </p>
    </div>
  )
}
