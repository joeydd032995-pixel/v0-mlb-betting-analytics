"use client"

import type { NRFIPrediction } from "@/lib/types"
import type { ModelAccuracy } from "@/lib/types"
import { Activity, TrendingUp, Target, Zap, BarChart2, HelpCircle } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { METRIC_GLOSSARY } from "@/lib/types"

interface Props {
  predictions: NRFIPrediction[]
  accuracy: ModelAccuracy
}

function LabelWithTooltip({ label, glossaryKey }: { label: string; glossaryKey?: keyof typeof METRIC_GLOSSARY }) {
  if (!glossaryKey) {
    return <p className="text-xs text-muted-foreground truncate">{label}</p>
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 cursor-help max-w-full">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <HelpCircle className="h-3 w-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors flex-shrink-0" />
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{METRIC_GLOSSARY[glossaryKey]}</TooltipContent>
    </Tooltip>
  )
}

export function PredictionHeader({ predictions, accuracy }: Props) {
  const highConf = predictions.filter((p) => p.confidence === "High").length
  const valueBets = predictions.filter(
    (p) => p.valueAnalysis && p.valueAnalysis.recommendedBet !== "NO_BET"
  ).length
  const strongNrfi = predictions.filter(
    (p) => p.recommendation === "STRONG_NRFI" || p.recommendation === "LEAN_NRFI"
  ).length

  const stats = [
    {
      label: "Season Accuracy",
      glossaryKey: "accuracy" as const,
      value: accuracy.totalPredictions > 0 ? `${(accuracy.accuracy * 100).toFixed(1)}%` : "—",
      sub: accuracy.totalPredictions > 0 ? `${accuracy.correct}/${accuracy.totalPredictions} correct` : "Season just started",
      icon: Target,
      color: "text-emerald-400",
      bg: "bg-emerald-400/10 border-emerald-400/20",
    },
    {
      label: "Today's Games",
      glossaryKey: undefined,
      value: predictions.length.toString(),
      sub: `${strongNrfi} NRFI lean${strongNrfi !== 1 ? "s" : ""}`,
      icon: Activity,
      color: "text-sky-400",
      bg: "bg-sky-400/10 border-sky-400/20",
    },
    {
      label: "High Confidence",
      glossaryKey: "confidence" as const,
      value: highConf.toString(),
      sub: accuracy.totalPredictions > 0 ? `${(accuracy.highConfAccuracy * 100).toFixed(1)}% hist. accuracy` : "No data yet",
      icon: Zap,
      color: "text-amber-400",
      bg: "bg-amber-400/10 border-amber-400/20",
    },
    {
      label: "Value Bets Found",
      glossaryKey: "edge" as const,
      value: valueBets.toString(),
      sub: accuracy.totalPredictions > 0 ? `${(accuracy.roi * 100).toFixed(1)}% season ROI` : "No bets tracked yet",
      icon: TrendingUp,
      color: "text-violet-400",
      bg: "bg-violet-400/10 border-violet-400/20",
    },
    {
      label: "Model ROI (2026)",
      glossaryKey: "roi" as const,
      value: accuracy.totalPredictions > 0 ? `+${(accuracy.roi * 100).toFixed(1)}%` : "—",
      sub: "Flat-stake on value bets",
      icon: BarChart2,
      color: "text-rose-400",
      bg: "bg-rose-400/10 border-rose-400/20",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <Card key={s.label} className={`border p-4 ${s.bg}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <LabelWithTooltip label={s.label} glossaryKey={s.glossaryKey} />
              <p className={`mt-1 text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground truncate">{s.sub}</p>
            </div>
            <s.icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${s.color}`} />
          </div>
        </Card>
      ))}
    </div>
  )
}
