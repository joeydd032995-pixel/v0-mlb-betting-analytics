"use client"

import type { HistoricalResult, ModelAccuracy } from "@/lib/types"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { CheckCircle2, XCircle } from "lucide-react"

interface Props {
  results: HistoricalResult[]
  accuracy: ModelAccuracy
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

function ConfBadge({ level }: { level: HistoricalResult["confidence"] }) {
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

export function HistoryTable({ results, accuracy }: Props) {
  return (
    <div className="space-y-6">
      {/* Accuracy summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "Overall Accuracy",
            value: pct(accuracy.accuracy),
            sub: `${accuracy.correct}/${accuracy.totalPredictions}`,
            color: "text-emerald-400",
          },
          {
            label: "NRFI Accuracy",
            value: pct(accuracy.nrfiAccuracy),
            sub: "When predicting NRFI",
            color: "text-sky-400",
          },
          {
            label: "YRFI Accuracy",
            value: pct(accuracy.yrfiAccuracy),
            sub: "When predicting YRFI",
            color: "text-violet-400",
          },
          {
            label: "High-Conf Accuracy",
            value: pct(accuracy.highConfAccuracy),
            sub: `ROI: +${pct(accuracy.roi)}`,
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

      {/* Monthly accuracy */}
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
                  m.accuracy >= 0.72 ? "text-emerald-400" : m.accuracy >= 0.66 ? "text-sky-400" : "text-amber-400"
                )}
              >
                {pct(m.accuracy)}
              </p>
              <p className="text-xs text-muted-foreground">{m.predictions} picks</p>
              <p className={cn("text-xs font-medium tabular-nums", m.roi > 0 ? "text-emerald-400" : "text-rose-400")}>
                {m.roi > 0 ? "+" : ""}{pct(m.roi)} ROI
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Desktop results table */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Recent Predictions</h3>
        <div className="hidden md:block overflow-x-auto rounded-lg border border-border/50">
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
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id} className="border-b border-border/30 transition-colors hover:bg-muted/20">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{r.date}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{r.awayTeam} @ {r.homeTeam}</span>
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground max-w-[160px]">
                    <span className="truncate block">{r.awayPitcher}</span>
                    <span className="truncate block">{r.homePitcher}</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium">
                    <span
                      className={cn(
                        r.nrfiProbability >= 0.57
                          ? "text-emerald-400"
                          : r.nrfiProbability <= 0.45
                            ? "text-rose-400"
                            : "text-muted-foreground"
                      )}
                    >
                      {pct(r.nrfiProbability)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className={cn(
                        "inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold",
                        r.prediction === "NRFI"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-rose-500/15 text-rose-300"
                      )}
                    >
                      {r.prediction}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {r.correct ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <XCircle className="h-4 w-4 text-rose-400" />
                      )}
                      <span className={cn("text-xs font-medium", r.correct ? "text-emerald-400" : "text-rose-400")}>
                        {r.actualResult}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <ConfBadge level={r.confidence} />
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-muted-foreground tabular-nums">
                    {r.runsFirstInning.away}–{r.runsFirstInning.home}
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-muted-foreground tabular-nums">
                    {r.prediction === "NRFI" ? formatOdds(r.nrfiOdds) : formatOdds(r.yrfiOdds)}
                  </td>
                  <td className={cn("px-3 py-3 text-right text-xs font-medium tabular-nums",
                    r.profitLoss != null
                      ? r.profitLoss > 0 ? "text-emerald-400" : "text-rose-400"
                      : "text-muted-foreground"
                  )}>
                    {formatPnL(r.profitLoss)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile results */}
      <div className="grid gap-3 md:hidden">
        {results.map((r) => (
          <Card key={r.id} className="border border-border/50 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">{r.date}</p>
                <p className="mt-0.5 font-medium">{r.awayTeam} @ {r.homeTeam}</p>
                <p className="text-xs text-muted-foreground">{r.awayPitcher} vs {r.homePitcher}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {r.correct ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-rose-400" />
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={cn(
                  "rounded px-2 py-0.5 font-semibold",
                  r.prediction === "NRFI" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
                )}
              >
                {r.prediction}
              </span>
              <span className="text-muted-foreground">{pct(r.nrfiProbability)}</span>
              <ConfBadge level={r.confidence} />
              {r.profitLoss != null && (
                <span className={cn("font-medium", r.profitLoss > 0 ? "text-emerald-400" : "text-rose-400")}>
                  {formatPnL(r.profitLoss)}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Result: {r.actualResult} · 1st inning score: {r.runsFirstInning.away}–{r.runsFirstInning.home}
            </p>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        * P/L shown as flat-stake units on the recommended bet. High-confidence bets only placed at &gt;68 confidence score.
      </p>
    </div>
  )
}
