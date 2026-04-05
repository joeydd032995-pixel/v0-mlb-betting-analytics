"use client"

import type { Game, NRFIPrediction, Team, Pitcher, ModelBreakdown } from "@/lib/types"
import { Card } from "@/components/ui/card"
import {
  CloudSun,
  Wind,
  Thermometer,
  Building2,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  DollarSign,
  BrainCircuit,
  AlertTriangle,
} from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

interface Props {
  game: Game
  prediction: NRFIPrediction
  homeTeam: Team
  awayTeam: Team
  homePitcher: Pitcher
  awayPitcher: Pitcher
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}

function formatOdds(n: number) {
  return n > 0 ? `+${n}` : `${n}`
}

function RecommendationBadge({ rec }: { rec: NRFIPrediction["recommendation"] }) {
  const map = {
    STRONG_NRFI: { label: "STRONG NRFI", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
    LEAN_NRFI: { label: "LEAN NRFI", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
    TOSS_UP: { label: "TOSS-UP", cls: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40" },
    LEAN_YRFI: { label: "LEAN YRFI", cls: "bg-rose-500/10 text-rose-400 border-rose-500/30" },
    STRONG_YRFI: { label: "STRONG YRFI", cls: "bg-rose-500/20 text-rose-300 border-rose-500/40" },
  }
  const { label, cls } = map[rec]
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold tracking-wide", cls)}>
      {label}
    </span>
  )
}

function ConfidenceBadge({ level, score }: { level: NRFIPrediction["confidence"]; score: number }) {
  const cls =
    level === "High"
      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
      : level === "Medium"
        ? "bg-sky-500/15 text-sky-300 border-sky-500/30"
        : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium", cls)}>
      {level} {score}
    </span>
  )
}

function ProbabilityBar({ nrfi, yrfi }: { nrfi: number; yrfi: number }) {
  const nrfiPct = Math.round(nrfi * 100)
  const yrfiPct = 100 - nrfiPct
  return (
    <div className="w-full">
      <div className="flex h-3 overflow-hidden rounded-full">
        <div
          className="bg-emerald-500 transition-all"
          style={{ width: `${nrfiPct}%` }}
        />
        <div
          className="bg-rose-500 transition-all"
          style={{ width: `${yrfiPct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span className="text-emerald-400 font-medium">NRFI {nrfiPct}%</span>
        <span className="text-rose-400 font-medium">YRFI {yrfiPct}%</span>
      </div>
    </div>
  )
}

function FactorIcon({ impact }: { impact: NRFIPrediction["factors"][0]["impact"] }) {
  if (impact === "positive") return <TrendingUp className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
  if (impact === "negative") return <TrendingDown className="h-3.5 w-3.5 text-rose-400 flex-shrink-0" />
  return <Minus className="h-3.5 w-3.5 text-zinc-400 flex-shrink-0" />
}

function WeatherBadge({ game }: { game: Game }) {
  const w = game.weather
  if (w.conditions === "dome") {
    return (
      <span className="flex items-center gap-1 text-xs text-zinc-400">
        <Building2 className="h-3 w-3" /> Dome
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs text-zinc-400">
      <Thermometer className="h-3 w-3" />
      {w.temperature}°F
      {w.windSpeed > 3 && (
        <>
          <Wind className="ml-1 h-3 w-3" />
          {w.windSpeed}mph {w.windDirection}
        </>
      )}
    </span>
  )
}

// ─── Idea 1: Model Consensus Meter ───────────────────────────────────────────

function consensusLabel(score: number) {
  if (score >= 0.80) return { label: "Models Agree", cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/8" }
  if (score >= 0.55) return { label: "Mixed Signals", cls: "text-amber-400 border-amber-500/30 bg-amber-500/8" }
  return { label: "Models Diverge", cls: "text-rose-400 border-rose-500/30 bg-rose-500/8" }
}

/** Compact one-line consensus badge shown in the main (non-expanded) card */
function ModelConsensusBadge({ consensus }: { consensus: number }) {
  const { label, cls } = consensusLabel(consensus)
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium", cls)}>
      <BrainCircuit className="h-3 w-3" />
      {label}
    </span>
  )
}

/** Full model breakdown panel shown in the expanded section */
function ModelBreakdownPanel({
  bd,
  awayAbbr,
  homeAbbr,
}: {
  bd: ModelBreakdown
  awayAbbr: string
  homeAbbr: string
}) {
  // Game-level per-model NRFI: both half-innings must hold for NRFI
  // homeHalfInning = home pitcher (stops away team) ; awayHalfInning = away pitcher (stops home team)
  const models = [
    {
      name: "Poisson",
      p: bd.homeHalfInning.poissonNrfi * bd.awayHalfInning.poissonNrfi,
      detail: "Bayesian-shrunk λ via e^(−λ)",
    },
    {
      name: "ZIP",
      p: bd.homeHalfInning.zipNrfi * bd.awayHalfInning.zipNrfi,
      detail: `ω ${(bd.homeHalfInning.zipOmega * 100).toFixed(0)}% / ${(bd.awayHalfInning.zipOmega * 100).toFixed(0)}% lockdown`,
    },
    {
      name: "Markov",
      p: bd.homeHalfInning.markovNrfi * bd.awayHalfInning.markovNrfi,
      detail: "24-state base-out chain",
    },
  ]

  const { label, cls } = consensusLabel(bd.modelConsensus)

  return (
    <div className="mt-3 rounded-md border border-sky-500/20 bg-sky-500/5 p-3">
      <div className="flex items-center justify-between mb-2.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-300">
          <BrainCircuit className="h-3.5 w-3.5" />
          Model Ensemble
        </p>
        <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold", cls)}>
          {label}
        </span>
      </div>

      {/* Per-model probability bars */}
      <div className="space-y-2">
        {models.map(({ name, p, detail }) => {
          const pct = Math.round(p * 100)
          const isNrfi = p >= 0.5
          return (
            <div key={name}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="w-14 text-[11px] font-semibold text-foreground/80">{name}</span>
                <span className="flex-1 text-[10px] text-muted-foreground truncate">{detail}</span>
                <span className={cn("text-xs font-bold tabular-nums", isNrfi ? "text-emerald-400" : "text-rose-400")}>
                  {pct}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted/50">
                <div
                  className={cn("h-full rounded-full", isNrfi ? "bg-emerald-500" : "bg-rose-500")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Bayesian data-trust for each pitcher */}
      <div className="mt-2.5 grid grid-cols-2 gap-x-4 border-t border-sky-500/15 pt-2 text-[10px]">
        <div>
          <span className="text-muted-foreground">{awayAbbr} pitcher trust </span>
          <span className="font-semibold text-sky-300">
            {(bd.homeHalfInning.bayesianDataWeight * 100).toFixed(0)}% season
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">{homeAbbr} pitcher trust </span>
          <span className="font-semibold text-sky-300">
            {(bd.awayHalfInning.bayesianDataWeight * 100).toFixed(0)}% season
          </span>
        </div>
      </div>

      {/* Outlier note */}
      {bd.consensusNote && (
        <div className="mt-1.5 flex items-start gap-1 text-[10px] text-amber-400">
          <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-px" />
          <span className="italic">{bd.consensusNote}</span>
        </div>
      )}
    </div>
  )
}

export function GamePredictionCard({
  game,
  prediction,
  homeTeam,
  awayTeam,
  homePitcher,
  awayPitcher,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const nrfiPct = Math.round(prediction.nrfiProbability * 100)
  const isNrfiFavored = prediction.nrfiProbability >= 0.5
  const va = prediction.valueAnalysis

  return (
    <Card className="flex flex-col overflow-hidden border border-border/60 bg-card/80 backdrop-blur">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span className="font-medium">{game.time} {game.timeZone}</span>
          <span className="hidden sm:inline text-zinc-600">·</span>
          <span className="hidden sm:inline truncate max-w-[140px]">{game.venue}</span>
        </div>
        <div className="flex items-center gap-2">
          <WeatherBadge game={game} />
        </div>
      </div>

      {/* Main content */}
      <div className="p-4">
        {/* Teams row */}
        <div className="flex items-center justify-between gap-3">
          {/* Away team */}
          <div className="flex flex-col items-start gap-0.5 min-w-0">
            <span className="text-lg font-bold text-foreground">{awayTeam.abbreviation}</span>
            <span className="text-xs text-muted-foreground truncate">{awayPitcher.name}</span>
            <span className="text-xs text-zinc-500">{awayPitcher.throws}HP · {pct(awayPitcher.firstInning.nrfiRate)} NRFI</span>
          </div>

          {/* Center score area */}
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <span className="text-xs font-medium text-muted-foreground">@</span>
            <div
              className={cn(
                "text-3xl font-black tabular-nums leading-none",
                isNrfiFavored ? "text-emerald-400" : "text-rose-400"
              )}
            >
              {nrfiPct}%
            </div>
            <div className="text-xs text-muted-foreground">
              {isNrfiFavored ? "NRFI" : "YRFI"}
            </div>
          </div>

          {/* Home team */}
          <div className="flex flex-col items-end gap-0.5 min-w-0">
            <span className="text-lg font-bold text-foreground">{homeTeam.abbreviation}</span>
            <span className="text-xs text-muted-foreground truncate">{homePitcher.name}</span>
            <span className="text-xs text-zinc-500">{homePitcher.throws}HP · {pct(homePitcher.firstInning.nrfiRate)} NRFI</span>
          </div>
        </div>

        {/* Probability bar */}
        <div className="mt-4">
          <ProbabilityBar nrfi={prediction.nrfiProbability} yrfi={prediction.yrfiProbability} />
        </div>

        {/* Tags row */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <RecommendationBadge rec={prediction.recommendation} />
          <ConfidenceBadge level={prediction.confidence} score={prediction.confidenceScore} />
          {prediction.modelBreakdown && (
            <ModelConsensusBadge consensus={prediction.modelBreakdown.modelConsensus} />
          )}
          {va && va.recommendedBet !== "NO_BET" && (
            <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-300">
              <DollarSign className="h-3 w-3" />
              Value {formatOdds(va.recommendedBet === "NRFI" ? va.nrfiOdds : va.yrfiOdds)}
              {" "}
              <span className="text-violet-400">+{((va.recommendedBet === "NRFI" ? va.nrfiEdge : va.yrfiEdge) * 100).toFixed(1)}%</span>
            </span>
          )}
        </div>

        {/* Per-team expected runs */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-md bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">{awayTeam.abbreviation} xR (1st)</p>
            <p className="text-sm font-semibold tabular-nums">{prediction.awayExpectedRuns.toFixed(3)}</p>
            <p className="text-xs text-muted-foreground">{pct(prediction.awayScores0Prob)} score 0</p>
          </div>
          <div className="rounded-md bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">{homeTeam.abbreviation} xR (1st)</p>
            <p className="text-sm font-semibold tabular-nums">{prediction.homeExpectedRuns.toFixed(3)}</p>
            <p className="text-xs text-muted-foreground">{pct(prediction.homeScores0Prob)} score 0</p>
          </div>
        </div>

        {/* Recent form pills */}
        <div className="mt-3 flex flex-col gap-1.5">
          <PitcherFormRow name={awayPitcher.name} results={awayPitcher.firstInning.last5Results} />
          <PitcherFormRow name={homePitcher.name} results={homePitcher.firstInning.last5Results} />
        </div>
      </div>

      {/* Expand / collapse factors */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between border-t border-border/40 px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/20"
      >
        <span>Key Factors ({prediction.factors.length})</span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {expanded && (
        <div className="border-t border-border/30 bg-muted/10 px-4 pb-4 pt-3">
          <ul className="space-y-2">
            {prediction.factors.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <FactorIcon impact={f.impact} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-foreground/90">{f.name}</span>
                    {f.value && (
                      <span className="text-xs text-muted-foreground">{f.value}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
                </div>
              </li>
            ))}
          </ul>

          {/* Model ensemble breakdown */}
          {prediction.modelBreakdown && (
            <ModelBreakdownPanel
              bd={prediction.modelBreakdown}
              awayAbbr={awayTeam.abbreviation}
              homeAbbr={homeTeam.abbreviation}
            />
          )}

          {/* Value analysis detail */}
          {va && (
            <div className="mt-3 rounded-md border border-violet-500/20 bg-violet-500/5 p-3">
              <p className="text-xs font-semibold text-violet-300 mb-1.5">Value Analysis · {game.odds?.bookmaker}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">NRFI Odds</span>
                <span className="font-medium tabular-nums">{formatOdds(va.nrfiOdds)} ({pct(va.impliedNrfiProb)} implied)</span>
                <span className="text-muted-foreground">YRFI Odds</span>
                <span className="font-medium tabular-nums">{formatOdds(va.yrfiOdds)} ({pct(va.impliedYrfiProb)} implied)</span>
                {va.recommendedBet !== "NO_BET" && (
                  <>
                    <span className="text-muted-foreground">Model Edge</span>
                    <span className={cn("font-semibold tabular-nums", "text-violet-300")}>
                      +{((va.recommendedBet === "NRFI" ? va.nrfiEdge : va.yrfiEdge) * 100).toFixed(2)}%
                      {" "}on {va.recommendedBet}
                    </span>
                    <span className="text-muted-foreground">Kelly Size</span>
                    <span className="font-medium tabular-nums">{pct(va.kellyFraction)} of bankroll</span>
                    <span className="text-muted-foreground">Expected Value</span>
                    <span className={cn("font-semibold tabular-nums", va.expectedValue > 0 ? "text-emerald-400" : "text-rose-400")}>
                      {va.expectedValue > 0 ? "+" : ""}{(va.expectedValue * 100).toFixed(2)}%
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function PitcherFormRow({ name, results }: { name: string; results: boolean[] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">{name}</span>
      <div className="flex gap-1">
        {results.map((r, i) => (
          <span
            key={i}
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded-sm text-[10px] font-bold",
              r ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
            )}
          >
            {r ? "N" : "Y"}
          </span>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {results.filter(Boolean).length}/{results.length}
      </span>
    </div>
  )
}
