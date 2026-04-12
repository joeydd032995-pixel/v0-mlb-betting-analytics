"use client"

import type { NRFIPrediction } from "@/lib/types"
import type { ModelAccuracy } from "@/lib/types"
import { Activity, TrendingUp, Target, Zap, BarChart2, Lock } from "lucide-react"
import { Card } from "@/components/ui/card"
import Link from "next/link"

interface Props {
  predictions: NRFIPrediction[]
  accuracy: ModelAccuracy
  /** When false (free tier), season accuracy and ROI stats are hidden. */
  isPaid?: boolean
}

export function PredictionHeader({ predictions, accuracy, isPaid = true }: Props) {
  const highConf = predictions.filter((p) => p.confidence === "High").length
  const valueBets = predictions.filter(
    (p) => p.valueAnalysis && p.valueAnalysis.recommendedBet !== "NO_BET"
  ).length
  const strongNrfi = predictions.filter(
    (p) => p.recommendation === "STRONG_NRFI" || p.recommendation === "LEAN_NRFI"
  ).length

  // Stats always visible (free + paid)
  const publicStats = [
    {
      label: "Today's Games",
      value: predictions.length.toString(),
      sub: `${strongNrfi} NRFI lean${strongNrfi !== 1 ? "s" : ""}`,
      icon: Activity,
      color: "text-sky-400",
      bg: "bg-sky-400/10 border-sky-400/20",
    },
    {
      label: "High Confidence",
      value: highConf.toString(),
      sub: "High-confidence picks today",
      icon: Zap,
      color: "text-amber-400",
      bg: "bg-amber-400/10 border-amber-400/20",
    },
  ]

  // Stats only visible for paid users
  const paidStats = [
    {
      label: "Season Accuracy",
      value: accuracy.totalPredictions > 0 ? `${(accuracy.accuracy * 100).toFixed(1)}%` : "—",
      sub: accuracy.totalPredictions > 0 ? `${accuracy.correct}/${accuracy.totalPredictions} correct` : "Season just started",
      icon: Target,
      color: "text-emerald-400",
      bg: "bg-emerald-400/10 border-emerald-400/20",
    },
    {
      label: "Value Bets Found",
      value: valueBets.toString(),
      sub: accuracy.totalPredictions > 0 ? `${(accuracy.roi * 100).toFixed(1)}% season ROI` : "No bets tracked yet",
      icon: TrendingUp,
      color: "text-violet-400",
      bg: "bg-violet-400/10 border-violet-400/20",
    },
    {
      label: "Model ROI (2026)",
      value: accuracy.totalPredictions > 0 ? `+${(accuracy.roi * 100).toFixed(1)}%` : "—",
      sub: "Flat-stake on value bets",
      icon: BarChart2,
      color: "text-rose-400",
      bg: "bg-rose-400/10 border-rose-400/20",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {/* Always-visible public stats */}
      {publicStats.map((s) => (
        <Card key={s.label} className={`border p-4 ${s.bg}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{s.label}</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground truncate">{s.sub}</p>
            </div>
            <s.icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${s.color}`} />
          </div>
        </Card>
      ))}

      {/* Paid-only stats — show locked version for free users */}
      {paidStats.map((s) =>
        isPaid ? (
          <Card key={s.label} className={`border p-4 ${s.bg}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{s.label}</p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground truncate">{s.sub}</p>
              </div>
              <s.icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${s.color}`} />
            </div>
          </Card>
        ) : (
          <Card
            key={s.label}
            className="border border-border/40 p-4 bg-muted/5 relative overflow-hidden"
          >
            <div className="flex items-start justify-between gap-2 opacity-40 select-none pointer-events-none">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{s.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-muted-foreground">—</p>
                <p className="mt-0.5 text-xs text-muted-foreground truncate">Requires paid plan</p>
              </div>
              <Lock className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
            </div>
            <Link
              href="/pricing"
              className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 bg-background/60 transition-opacity text-xs font-semibold text-primary"
            >
              Upgrade to unlock
            </Link>
          </Card>
        )
      )}
    </div>
  )
}
