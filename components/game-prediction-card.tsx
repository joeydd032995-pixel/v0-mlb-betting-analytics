"use client"

import type { Game, NRFIPrediction, Team, Pitcher, ModelBreakdown } from "@/lib/types"
import { METRIC_GLOSSARY } from "@/lib/types"
import { Card } from "@/components/ui/card"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  HelpCircle,
  BarChart3,
  History,
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

type MetricGlossaryKey = keyof typeof METRIC_GLOSSARY

function MetricLabel({ label, glossaryKey }: { label: string; glossaryKey: MetricGlossaryKey }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 cursor-help">
          <span className="text-xs text-muted-foreground">{label}</span>
          <HelpCircle className="h-3 w-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors" />
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{METRIC_GLOSSARY[glossaryKey]}</TooltipContent>
    </Tooltip>
  )
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

function ProbabilityGauge({ probability }: { probability: number }) {
  const pct = Math.round(probability * 100)
  const isNrfi = probability >= 0.5

  // Create conic gradient: emerald (NRFI) from 0 to probability, rose (YRFI) for remainder
  const gaugeStyle = {
    background: `conic-gradient(
      from 0deg,
      #10b981 0deg,
      #10b981 ${probability * 360}deg,
      #f43f5e ${probability * 360}deg,
      #f43f5e 360deg
    )`,
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24 rounded-full flex items-center justify-center" style={gaugeStyle}>
        {/* Inner circle to create donut effect */}
        <div className="absolute w-20 h-20 rounded-full bg-background flex items-center justify-center">
          <div className="text-center">
            <div className={cn(
              "text-2xl font-black tabular-nums leading-none",
              isNrfi ? "text-emerald-400" : "text-rose-400"
            )}>
              {pct}%
            </div>
          </div>
        </div>
      </div>
      <div className="text-xs font-semibold text-muted-foreground">
        {isNrfi ? "NRFI" : "YRFI"}
      </div>
    </div>
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
  const hh = bd.homeHalfInning
  const ah = bd.awayHalfInning

  const baseModels = [
    {
      name: "Poisson",
      p: hh.poissonNrfi * ah.poissonNrfi,
      detail: "Bayesian-shrunk λ via e^(−λ)",
    },
    {
      name: "ZIP",
      p: hh.zipNrfi * ah.zipNrfi,
      detail: `ω ${(hh.zipOmega * 100).toFixed(0)}% / ${(ah.zipOmega * 100).toFixed(0)}% lockdown`,
    },
    {
      name: "Markov",
      p: hh.markovNrfi * ah.markovNrfi,
      detail: "24-state base-out chain · handedness splits",
    },
    {
      name: "MAPRE",
      p: hh.mapreNrfi * ah.mapreNrfi,
      detail: "sOPS+, BAbip, HR/PA, HFA, rest/travel",
    },
  ]

  const metaModels = [
    ...(hh.logisticMetaNrfi != null && ah.logisticMetaNrfi != null
      ? [{ name: "Logistic Stack", p: hh.logisticMetaNrfi * ah.logisticMetaNrfi, detail: "Logistic regression stacked on base-4 avg" }]
      : []),
    ...(hh.nnInteractionNrfi != null && ah.nnInteractionNrfi != null
      ? [{ name: "NN Interaction", p: (hh.nnInteractionNrfi + ah.nnInteractionNrfi) / 2, detail: "Poisson × Markov cross-model interaction" }]
      : []),
    ...(hh.hierarchicalBayesNrfi != null && ah.hierarchicalBayesNrfi != null
      ? [{ name: "Hier. Bayes", p: (hh.hierarchicalBayesNrfi + ah.hierarchicalBayesNrfi) / 2, detail: "Dynamic-prior shrunk pitcher rate" }]
      : []),
  ]

  const hasMeta = metaModels.length > 0
  const ensembleLabel = hasMeta ? "7-Model Ensemble" : "Model Ensemble"

  const { label, cls } = consensusLabel(bd.modelConsensus)

  const ModelRow = ({ name, p, detail }: { name: string; p: number; detail: string }) => {
    const pct = Math.round(p * 100)
    const isNrfi = p >= 0.5
    return (
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="w-24 text-[11px] font-semibold text-foreground/80">{name}</span>
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
  }

  return (
    <div className="mt-3 rounded-md border border-sky-500/20 bg-sky-500/5 p-3">
      <div className="flex items-center justify-between mb-2.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-300">
          <BrainCircuit className="h-3.5 w-3.5" />
          {ensembleLabel}
        </p>
        <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold", cls)}>
          {label}
        </span>
      </div>

      {/* Base models */}
      <div className="space-y-2">
        {baseModels.map((m) => <ModelRow key={m.name} {...m} />)}
      </div>

      {/* Meta-models separator + rows */}
      {hasMeta && (
        <>
          <div className="my-2 flex items-center gap-2">
            <div className="flex-1 border-t border-sky-500/20" />
            <span className="text-[9px] font-semibold uppercase tracking-wider text-sky-400/60">Meta-models</span>
            <div className="flex-1 border-t border-sky-500/20" />
          </div>
          <div className="space-y-2">
            {metaModels.map((m) => <ModelRow key={m.name} {...m} />)}
          </div>
        </>
      )}

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

      {/* Teams row + Matchup summary */}
      <div className="border-b border-border/50 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* Away team */}
          <div className="flex flex-col items-start gap-0.5 min-w-0">
            <span className="text-lg font-bold text-foreground">{awayTeam.abbreviation}</span>
            <span className="text-xs text-muted-foreground truncate">{awayPitcher.name}</span>
            <span className="text-xs text-zinc-500">{awayPitcher.throws}HP · {pct(awayPitcher.firstInning.nrfiRate)} NRFI</span>
          </div>

          {/* Center probability gauge */}
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <span className="text-xs font-medium text-muted-foreground">@</span>
            <ProbabilityGauge probability={prediction.nrfiProbability} />
          </div>

          {/* Home team */}
          <div className="flex flex-col items-end gap-0.5 min-w-0">
            <span className="text-lg font-bold text-foreground">{homeTeam.abbreviation}</span>
            <span className="text-xs text-muted-foreground truncate">{homePitcher.name}</span>
            <span className="text-xs text-zinc-500">{homePitcher.throws}HP · {pct(homePitcher.firstInning.nrfiRate)} NRFI</span>
          </div>
        </div>
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="overview" className="flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b border-border/30 bg-transparent px-4 py-2">
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="historical" className="gap-1.5">
            <History className="h-3.5 w-3.5" />
            Historical
          </TabsTrigger>
          <TabsTrigger value="pitchers" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Pitchers
          </TabsTrigger>
          <TabsTrigger value="accuracy" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Accuracy
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-0 flex-1 space-y-3 border-t border-border/30 p-4">
          {/* Probability bar */}
          <div>
            <ProbabilityBar nrfi={prediction.nrfiProbability} yrfi={prediction.yrfiProbability} />
          </div>

          {/* Tags row */}
          <div className="flex flex-wrap items-center gap-2">
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
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-muted/30 px-3 py-2">
              <MetricLabel label={`${awayTeam.abbreviation} xR (1st)`} glossaryKey="xR" />
              <p className="text-sm font-semibold tabular-nums">{prediction.awayExpectedRuns.toFixed(3)}</p>
              <MetricLabel label={`${pct(prediction.awayScores0Prob)} score 0`} glossaryKey="nrfiRate" />
            </div>
            <div className="rounded-md bg-muted/30 px-3 py-2">
              <MetricLabel label={`${homeTeam.abbreviation} xR (1st)`} glossaryKey="xR" />
              <p className="text-sm font-semibold tabular-nums">{prediction.homeExpectedRuns.toFixed(3)}</p>
              <MetricLabel label={`${pct(prediction.homeScores0Prob)} score 0`} glossaryKey="nrfiRate" />
            </div>
          </div>

          {/* Recent form pills — pitchers */}
          <div className="flex flex-col gap-1.5 border-t border-border/30 pt-3">
            <PitcherFormRow name={awayPitcher.name} results={awayPitcher.firstInning.last5Results} />
            <PitcherFormRow name={homePitcher.name} results={homePitcher.firstInning.last5Results} />
          </div>

          {/* Recent form pills — team offense */}
          {(awayTeam.firstInning.last5Results || homeTeam.firstInning.last5Results) && (
            <div className="flex flex-col gap-1.5 border-t border-border/30 pt-3">
              {awayTeam.firstInning.last5Results && (
                <TeamFormRow abbr={awayTeam.abbreviation} results={awayTeam.firstInning.last5Results} />
              )}
              {homeTeam.firstInning.last5Results && (
                <TeamFormRow abbr={homeTeam.abbreviation} results={homeTeam.firstInning.last5Results} />
              )}
            </div>
          )}

          {/* Key Factors section */}
          {prediction.factors.length > 0 && (
            <div className="border-t border-border/30 pt-3">
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center justify-between text-xs text-muted-foreground transition-colors"
              >
                <span className="font-medium">Key Factors ({prediction.factors.length})</span>
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>

              {expanded && (
                <div className="mt-2 space-y-2">
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
                    <div className="rounded-md border border-violet-500/20 bg-violet-500/5 p-3">
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
            </div>
          )}
        </TabsContent>

        {/* Historical Tab */}
        <TabsContent value="historical" className="mt-0 flex-1 border-t border-border/30 p-4 space-y-3">
          <div className="rounded-md bg-muted/30 p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Matchup History</p>
            <p className="text-xs text-muted-foreground">
              Head-to-head records between {awayTeam.abbreviation} and {homeTeam.abbreviation} from previous seasons coming soon.
            </p>
          </div>
          <div className="rounded-md bg-muted/30 p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Recent Series</p>
            <p className="text-xs text-muted-foreground">
              Last 10 games between these teams and NRFI/YRFI results will appear here.
            </p>
          </div>
        </TabsContent>

        {/* Pitchers Tab */}
        <TabsContent value="pitchers" className="mt-0 flex-1 border-t border-border/30 p-4">
          <div className="space-y-3">
            {/* Away pitcher */}
            <div className="rounded-md border border-border/40 bg-muted/10 p-3">
              <div className="mb-2">
                <p className="text-sm font-bold text-foreground">{awayTeam.abbreviation}: {awayPitcher.name}</p>
                <p className="text-xs text-muted-foreground">{awayPitcher.throws}HP · {awayPitcher.firstInning.startCount} starts</p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div>
                  <p className="text-muted-foreground">NRFI Rate</p>
                  <p className="font-semibold text-foreground">{pct(awayPitcher.firstInning.nrfiRate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">K Rate</p>
                  <p className="font-semibold text-foreground">{pct(awayPitcher.firstInning.kRate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">BB Rate</p>
                  <p className="font-semibold text-foreground">{pct(awayPitcher.firstInning.bbRate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Era</p>
                  <p className="font-semibold text-foreground">{awayPitcher.firstInning.era.toFixed(2)}</p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-border/30">
                <p className="text-xs text-muted-foreground mb-1">Last 5 games (NRFI)</p>
                <div className="flex gap-1">
                  {awayPitcher.firstInning.last5Results.map((r, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-5 w-5 rounded-sm text-[10px] font-bold flex items-center justify-center",
                        r ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                      )}
                    >
                      {r ? "N" : "Y"}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Home pitcher */}
            <div className="rounded-md border border-border/40 bg-muted/10 p-3">
              <div className="mb-2">
                <p className="text-sm font-bold text-foreground">{homeTeam.abbreviation}: {homePitcher.name}</p>
                <p className="text-xs text-muted-foreground">{homePitcher.throws}HP · {homePitcher.firstInning.startCount} starts</p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div>
                  <p className="text-muted-foreground">NRFI Rate</p>
                  <p className="font-semibold text-foreground">{pct(homePitcher.firstInning.nrfiRate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">K Rate</p>
                  <p className="font-semibold text-foreground">{pct(homePitcher.firstInning.kRate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">BB Rate</p>
                  <p className="font-semibold text-foreground">{pct(homePitcher.firstInning.bbRate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Era</p>
                  <p className="font-semibold text-foreground">{homePitcher.firstInning.era.toFixed(2)}</p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-border/30">
                <p className="text-xs text-muted-foreground mb-1">Last 5 games (NRFI)</p>
                <div className="flex gap-1">
                  {homePitcher.firstInning.last5Results.map((r, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-5 w-5 rounded-sm text-[10px] font-bold flex items-center justify-center",
                        r ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                      )}
                    >
                      {r ? "N" : "Y"}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Accuracy Tab */}
        <TabsContent value="accuracy" className="mt-0 flex-1 border-t border-border/30 p-4 space-y-3">
          <div className="rounded-md border border-border/40 bg-muted/10 p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Game Result</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{awayTeam.abbreviation} runs (1st inning)</span>
                <span className="font-mono font-semibold text-foreground">—</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{homeTeam.abbreviation} runs (1st inning)</span>
                <span className="font-mono font-semibold text-foreground">—</span>
              </div>
              <div className="flex items-center justify-between text-xs pt-2 border-t border-border/30">
                <span className="text-muted-foreground">Prediction Accuracy</span>
                <span className="font-semibold text-muted-foreground">Pending</span>
              </div>
            </div>
          </div>
          <div className="rounded-md bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground italic">
              Game result will be recorded after the first inning concludes. Accuracy metrics will be calculated automatically.
            </p>
          </div>
        </TabsContent>
      </Tabs>
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

function TeamFormRow({ abbr, results }: { abbr: string; results: boolean[] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 text-xs text-muted-foreground">
        {abbr} <span className="text-zinc-600">off</span>
      </span>
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
