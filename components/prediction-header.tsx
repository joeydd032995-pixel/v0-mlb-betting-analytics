"use client"

import type { NRFIPrediction } from "@/lib/types"
import type { ModelAccuracy } from "@/lib/types"
import { Activity, TrendingUp, Target, Zap, BarChart2, HelpCircle } from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { METRIC_GLOSSARY } from "@/lib/types"

interface Props {
  predictions: NRFIPrediction[]
  accuracy: ModelAccuracy
}

const ACCENT_BARS = [
  "linear-gradient(90deg, var(--hm-grass), transparent)",
  "linear-gradient(90deg, var(--hm-diamond), transparent)",
  "linear-gradient(90deg, var(--hm-gold), transparent)",
  "linear-gradient(90deg, #a855f7, transparent)",
  "linear-gradient(90deg, var(--hm-blood), transparent)",
]

function LabelWithTooltip({
  label,
  glossaryKey,
}: {
  label: string
  glossaryKey?: keyof typeof METRIC_GLOSSARY
}) {
  if (!glossaryKey) {
    return (
      <span
        className="font-mono uppercase tracking-[0.24em] block"
        style={{ fontSize: "8px", color: "var(--hm-smoke)" }}
      >
        {label}
      </span>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 cursor-help">
          <span
            className="font-mono uppercase tracking-[0.24em]"
            style={{ fontSize: "8px", color: "var(--hm-smoke)" }}
          >
            {label}
          </span>
          <HelpCircle style={{ width: 10, height: 10, color: "var(--hm-smoke)", opacity: 0.6 }} />
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{METRIC_GLOSSARY[glossaryKey]}</TooltipContent>
    </Tooltip>
  )
}

export function PredictionHeader({ predictions, accuracy }: Props) {
  const highConf = predictions.filter((p) => p.confidence === "High").length
  const hasOddsData = predictions.some((p) => p.valueAnalysis !== undefined)
  const valueBets = predictions.filter(
    (p) => p.valueAnalysis && p.valueAnalysis.recommendedBet !== "NO_BET"
  ).length
  const nrfiLeans = predictions.filter(
    (p) => p.recommendation === "STRONG_NRFI" || p.recommendation === "LEAN_NRFI"
  ).length

  const tiles = [
    {
      label: "Season Accuracy",
      glossaryKey: "accuracy" as const,
      value: accuracy.totalPredictions > 0 ? `${(accuracy.accuracy * 100).toFixed(1)}%` : "—",
      sub: accuracy.totalPredictions > 0
        ? `${accuracy.correct}/${accuracy.totalPredictions} CORRECT`
        : "SEASON JUST STARTED",
      icon: <Target size={18} />,
    },
    {
      label: "Today's Games",
      glossaryKey: undefined,
      value: predictions.length.toString(),
      sub: `${nrfiLeans} NRFI LEAN${nrfiLeans !== 1 ? "S" : ""}`,
      icon: <Activity size={18} />,
    },
    {
      label: "High Confidence",
      glossaryKey: "confidence" as const,
      value: highConf.toString(),
      sub: accuracy.totalPredictions > 0
        ? `${(accuracy.highConfAccuracy * 100).toFixed(1)}% HIST. ACCURACY`
        : "NO DATA YET",
      icon: <Zap size={18} />,
    },
    {
      label: "Value Bets",
      glossaryKey: "edge" as const,
      value: !hasOddsData && predictions.length > 0 ? "N/A" : valueBets.toString(),
      sub: !hasOddsData && predictions.length > 0
        ? "ODDS DATA UNAVAILABLE"
        : accuracy.totalPredictions > 0
          ? `${(accuracy.roi * 100).toFixed(1)}% SEASON ROI`
          : "NO BETS TRACKED",
      icon: <TrendingUp size={18} />,
    },
    {
      label: "Model ROI 2026",
      glossaryKey: "roi" as const,
      value: accuracy.totalPredictions > 0
        ? `${accuracy.roi >= 0 ? "+" : ""}${(accuracy.roi * 100).toFixed(1)}%`
        : "—",
      sub: "FLAT-STAKE · VALUE BETS",
      icon: <BarChart2 size={18} />,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile, i) => (
        <div
          key={tile.label}
          className="relative overflow-hidden rounded-xl px-4 py-[14px] transition-colors"
          style={{
            background: "linear-gradient(160deg, var(--hm-pitch) 0%, var(--hm-void) 100%)",
            border: "1px solid var(--hm-fence)",
          }}
        >
          {/* Icon top-right */}
          <div
            className="absolute top-3 right-3"
            style={{ color: "var(--hm-smoke)", opacity: 0.4 }}
          >
            {tile.icon}
          </div>

          {/* Bottom accent bar */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0, right: 0, bottom: 0,
              height: "2px",
              background: ACCENT_BARS[i],
              opacity: 0.85,
            }}
          />

          <LabelWithTooltip label={tile.label} glossaryKey={tile.glossaryKey} />

          <div
            className="font-headline leading-none mt-[6px] text-[26px] sm:text-[28px] lg:text-[30px] tracking-[0.01em]"
            style={{ color: "var(--hm-chalk)" }}
          >
            {tile.value}
          </div>

          <div
            className="font-mono uppercase tracking-[0.16em] mt-[4px]"
            style={{ fontSize: "8px", color: "var(--hm-smoke)" }}
          >
            {tile.sub}
          </div>
        </div>
      ))}
    </div>
  )
}
