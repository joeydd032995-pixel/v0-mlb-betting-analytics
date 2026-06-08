"use client"

import type { Game, NRFIPrediction, Team, Pitcher, ModelBreakdown } from "@/lib/types"
import { METRIC_GLOSSARY } from "@/lib/types"
import Link from "next/link"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DeepNrfiPanel } from "@/components/ensemble/DeepNrfiPanel"
import { MonteCarloHistogram } from "@/components/ensemble/MonteCarloHistogram"
import { StackContributionBar } from "@/components/ensemble/StackContributionBar"
import {
  Wind, Thermometer, Building2, Clock,
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
  DollarSign, BrainCircuit, AlertTriangle, HelpCircle,
  BarChart3, History, Lock, Zap,
} from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import type { Tier } from "@/lib/subscription"

interface Props {
  game: Game
  prediction: NRFIPrediction
  homeTeam: Team
  awayTeam: Team
  homePitcher: Pitcher
  awayPitcher: Pitcher
  /** Current user tier — controls paywall rendering */
  tier?: Tier
  /**
   * When true, the card is the single free teaser:
   * - NRFI % is shown prominently as the "sell point"
   * - Recommendation badge and confidence badge are blurred with a lock
   * - Factors list, value analysis, and model tabs are hidden
   */
  isFreeTease?: boolean
}

function pct(n: number) { return `${(n * 100).toFixed(1)}%` }
function formatOdds(n: number) { return n > 0 ? `+${n}` : `${n}` }
type MetricGlossaryKey = keyof typeof METRIC_GLOSSARY

// ─── Arc Gauge ────────────────────────────────────────────────────────────────
// All constants are spec-locked — do not change.
const ARC_R  = 80
const ARC_CX = 100
const ARC_CY = 90
const START_DEG = -210
const SWEEP_DEG = 200
const VW = 200
const VH = 140

function polarToXY(angleDeg: number, r: number, cx: number, cy: number) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(startDeg: number, endDeg: number, r: number, cx: number, cy: number) {
  const s = polarToXY(startDeg, r, cx, cy)
  const e = polarToXY(endDeg, r, cx, cy)
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`
}

function ArcGauge({ probability, id }: { probability: number; id: string }) {
  const isNrfi = probability >= 0.5
  const pctVal = isNrfi
    ? Math.round(probability * 100)
    : Math.round((1 - probability) * 100)

  const fillEnd = START_DEG + SWEEP_DEG * probability
  const trackPath = arcPath(START_DEG, START_DEG + SWEEP_DEG, ARC_R, ARC_CX, ARC_CY)
  const fillPath  = arcPath(START_DEG, fillEnd, ARC_R, ARC_CX, ARC_CY)

  const trackColor = isNrfi ? "rgba(0,230,118,0.12)" : "rgba(255,23,68,0.12)"
  const fillGrad   = isNrfi ? `url(#${id}-grad-nrfi)` : `url(#${id}-grad-yrfi)`
  const textColor  = isNrfi ? "var(--hm-grass)" : "var(--hm-blood)"
  const labelText  = isNrfi ? "NRFI" : "YRFI"

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      className="w-[100px] sm:w-[130px] flex-shrink-0"
      style={{ overflow: "hidden" }}
    >
      <defs>
        <linearGradient id={`${id}-grad-nrfi`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--hm-diamond)" />
          <stop offset="100%" stopColor="var(--hm-grass)" />
        </linearGradient>
        <linearGradient id={`${id}-grad-yrfi`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--hm-gold)" />
          <stop offset="100%" stopColor="var(--hm-blood)" />
        </linearGradient>
        <filter id={`${id}-glow`}>
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Track */}
      <path d={trackPath} fill="none" stroke={trackColor} strokeWidth="7" strokeLinecap="round" />

      {/* Fill arc */}
      <path
        d={fillPath}
        fill="none"
        stroke={fillGrad}
        strokeWidth="7"
        strokeLinecap="round"
        filter={`url(#${id}-glow)`}
      />

      {/* Percentage */}
      <text
        x={ARC_CX} y={ARC_CY + 5}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="'Bebas Neue', sans-serif"
        fontSize="28"
        fill={textColor}
        letterSpacing="0.5"
      >
        {pctVal}%
      </text>

      {/* NRFI / YRFI label */}
      <text
        x={ARC_CX} y={ARC_CY + 22}
        textAnchor="middle"
        fontFamily="'DM Mono', monospace"
        fontSize="8"
        fill={textColor}
        letterSpacing="2"
        opacity="0.85"
      >
        {labelText}
      </text>

      {/* Axis labels */}
      <text x={14} y={VH - 3} textAnchor="middle" fontFamily="'DM Mono', monospace" fontSize="7" fill="var(--hm-smoke)">YRFI</text>
      <text x={VW - 14} y={VH - 3} textAnchor="middle" fontFamily="'DM Mono', monospace" fontSize="7" fill="var(--hm-smoke)">NRFI</text>
    </svg>
  )
}

// ─── Recommendation badge ─────────────────────────────────────────────────────
const REC_CFG: Record<NRFIPrediction["recommendation"], { label: string; color: string; bg: string; border: string }> = {
  STRONG_NRFI: { label: "STRONG NRFI", color: "var(--hm-grass)",  bg: "rgba(0,230,118,.10)", border: "rgba(0,230,118,.45)" },
  LEAN_NRFI:   { label: "LEAN NRFI",   color: "var(--hm-grass)",  bg: "rgba(0,230,118,.06)", border: "rgba(0,230,118,.25)" },
  TOSS_UP:     { label: "TOSS-UP",     color: "var(--hm-smoke)",  bg: "rgba(96,125,139,.10)", border: "rgba(96,125,139,.35)" },
  LEAN_YRFI:   { label: "LEAN YRFI",   color: "var(--hm-blood)",  bg: "rgba(255,23,68,.06)", border: "rgba(255,23,68,.25)" },
  STRONG_YRFI: { label: "STRONG YRFI", color: "var(--hm-blood)",  bg: "rgba(255,23,68,.10)", border: "rgba(255,23,68,.45)" },
}

function RecommendationBadge({ rec }: { rec: NRFIPrediction["recommendation"] }) {
  const cfg = REC_CFG[rec]
  return (
    <span
      className="inline-flex items-center rounded-[4px] px-[8px] py-[3px] font-mono tracking-[0.1em] uppercase"
      style={{ fontSize: "10px", color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      {cfg.label}
    </span>
  )
}

function ConfidenceBadge({ level, score }: { level: NRFIPrediction["confidence"]; score: number }) {
  const color = level === "High" ? "var(--hm-gold)" : level === "Medium" ? "var(--hm-diamond)" : "var(--hm-smoke)"
  const bg    = level === "High" ? "rgba(255,214,0,.08)"  : level === "Medium" ? "rgba(0,229,255,.08)" : "rgba(96,125,139,.08)"
  const bdr   = level === "High" ? "rgba(255,214,0,.35)"  : level === "Medium" ? "rgba(0,229,255,.3)"  : "rgba(96,125,139,.3)"
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[4px] px-[8px] py-[3px] font-mono tracking-[0.08em] uppercase"
      style={{ fontSize: "9px", color, background: bg, border: `1px solid ${bdr}` }}
    >
      {level} <span style={{ opacity: 0.7 }}>{score}</span>
    </span>
  )
}

// ─── Probability bar ──────────────────────────────────────────────────────────
function ProbabilityBar({ nrfi }: { nrfi: number }) {
  const nrfiPct = Math.round(nrfi * 100)
  return (
    <div className="w-full">
      <div className="flex h-2 overflow-hidden rounded-[2px]">
        <div
          className="transition-all duration-500"
          style={{ width: `${nrfiPct}%`, background: "var(--hm-grass)" }}
        />
        <div className="flex-1 transition-all duration-500" style={{ background: "var(--hm-blood)" }} />
      </div>
      <div className="mt-1 flex justify-between">
        <span className="font-mono tracking-[0.08em]" style={{ fontSize: "9px", color: "var(--hm-grass)" }}>NRFI {nrfiPct}%</span>
        <span className="font-mono tracking-[0.08em]" style={{ fontSize: "9px", color: "var(--hm-blood)" }}>YRFI {100 - nrfiPct}%</span>
      </div>
    </div>
  )
}

// ─── Form pips ────────────────────────────────────────────────────────────────
function FormPip({ value }: { value: boolean }) {
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-[2px] font-mono font-bold"
      style={{
        fontSize: "9px",
        background: value ? "rgba(0,230,118,0.15)" : "rgba(255,23,68,0.12)",
        color: value ? "var(--hm-grass)" : "var(--hm-blood)",
        border: `1px solid ${value ? "rgba(0,230,118,0.3)" : "rgba(255,23,68,0.25)"}`,
      }}
    >
      {value ? "N" : "Y"}
    </span>
  )
}

function PitcherFormRow({ name, results }: { name: string; results: boolean[] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 truncate font-ui" style={{ fontSize: "11px", color: "var(--hm-mist)" }}>{name}</span>
      <div className="flex gap-1">{results.map((r, i) => <FormPip key={i} value={r} />)}</div>
      <span className="font-mono" style={{ fontSize: "9px", color: "var(--hm-smoke)" }}>
        {results.filter(Boolean).length}/{results.length}
      </span>
    </div>
  )
}

function TeamFormRow({ abbr, results }: { abbr: string; results: boolean[] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 font-mono uppercase tracking-[0.1em]" style={{ fontSize: "9px", color: "var(--hm-smoke)" }}>
        {abbr} <span style={{ opacity: 0.5 }}>off</span>
      </span>
      <div className="flex gap-1">{results.map((r, i) => <FormPip key={i} value={r} />)}</div>
      <span className="font-mono" style={{ fontSize: "9px", color: "var(--hm-smoke)" }}>
        {results.filter(Boolean).length}/{results.length}
      </span>
    </div>
  )
}

// ─── Factor icon ──────────────────────────────────────────────────────────────
function FactorIcon({ impact }: { impact: NRFIPrediction["factors"][0]["impact"] }) {
  if (impact === "positive") return <TrendingUp className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--hm-grass)" }} />
  if (impact === "negative") return <TrendingDown className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--hm-blood)" }} />
  return <Minus className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--hm-smoke)" }} />
}

// ─── Weather badge ────────────────────────────────────────────────────────────
function WeatherBadge({ game }: { game: Game }) {
  const w = game.weather
  if (w.conditions === "dome") {
    return (
      <span className="flex items-center gap-1 font-mono tracking-[0.06em]" style={{ fontSize: "9px", color: "var(--hm-smoke)" }}>
        <Building2 size={11} /> DOME
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 font-mono tracking-[0.06em]" style={{ fontSize: "9px", color: "var(--hm-smoke)" }}>
      <Thermometer size={11} />
      {w.temperature}°F
      {w.windSpeed > 3 && (
        <><Wind size={11} className="ml-0.5" />{w.windSpeed}mph</>
      )}
    </span>
  )
}

// ─── Model consensus ──────────────────────────────────────────────────────────
function consensusLabel(score: number) {
  if (score >= 0.80) return { label: "Models Agree",   color: "var(--hm-grass)",  bg: "rgba(0,230,118,.07)",  bdr: "rgba(0,230,118,.3)" }
  if (score >= 0.55) return { label: "Mixed Signals",  color: "var(--hm-gold)",   bg: "rgba(255,214,0,.07)",  bdr: "rgba(255,214,0,.3)" }
  return               { label: "Models Diverge", color: "var(--hm-blood)",  bg: "rgba(255,23,68,.07)",  bdr: "rgba(255,23,68,.3)" }
}

function ModelConsensusBadge({ consensus }: { consensus: number }) {
  const c = consensusLabel(consensus)
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[4px] px-[8px] py-[3px] font-mono tracking-[0.08em] uppercase"
      style={{ fontSize: "9px", color: c.color, background: c.bg, border: `1px solid ${c.bdr}` }}
    >
      <BrainCircuit size={10} />{c.label}
    </span>
  )
}

// ─── Model tooltip label ──────────────────────────────────────────────────────
function MetricLabel({ label, glossaryKey }: { label: string; glossaryKey: MetricGlossaryKey }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 cursor-help">
          <span className="font-mono uppercase tracking-[0.1em]" style={{ fontSize: "8px", color: "var(--hm-smoke)" }}>{label}</span>
          <HelpCircle size={9} style={{ color: "var(--hm-smoke)", opacity: 0.5 }} />
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{METRIC_GLOSSARY[glossaryKey]}</TooltipContent>
    </Tooltip>
  )
}

// ─── Model breakdown panel ────────────────────────────────────────────────────
function ModelRow({ name, p, detail }: { name: string; p: number; detail: string }) {
  const pctVal = Math.round(p * 100)
  const isNrfi = p >= 0.5
  return (
    <div>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="w-24 font-mono uppercase tracking-[0.06em]" style={{ fontSize: "9px", color: "var(--hm-mist)" }}>{name}</span>
        <span className="flex-1 truncate font-ui" style={{ fontSize: "10px", color: "var(--hm-smoke)" }}>{detail}</span>
        <span className="font-mono font-bold tabular-nums" style={{ fontSize: "10px", color: isNrfi ? "var(--hm-grass)" : "var(--hm-blood)" }}>{pctVal}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-[2px]" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-[2px] transition-all"
          style={{ width: `${pctVal}%`, background: isNrfi ? "var(--hm-grass)" : "var(--hm-blood)" }}
        />
      </div>
    </div>
  )
}

function ModelBreakdownPanel({ bd, awayAbbr, homeAbbr }: { bd: ModelBreakdown; awayAbbr: string; homeAbbr: string }) {
  const hh = bd.homeHalfInning
  const ah = bd.awayHalfInning
  const baseModels = [
    { name: "Poisson", p: hh.poissonNrfi * ah.poissonNrfi, detail: "Bayesian-shrunk λ via e^(−λ)" },
    { name: "ZIP",     p: hh.zipNrfi * ah.zipNrfi, detail: `ω ${(hh.zipOmega * 100).toFixed(0)}% / ${(ah.zipOmega * 100).toFixed(0)}% lockdown` },
    { name: "Markov",  p: hh.markovNrfi * ah.markovNrfi, detail: "24-state base-out chain · handedness" },
    { name: "MAPRE",   p: hh.mapreNrfi * ah.mapreNrfi, detail: "sOPS+, BAbip, HR/PA, HFA, rest" },
  ]
  const metaModels = [
    ...(hh.logisticMetaNrfi != null && ah.logisticMetaNrfi != null
      ? [{ name: "Logistic Stack", p: hh.logisticMetaNrfi * ah.logisticMetaNrfi, detail: "Logistic regression on base-4 avg" }] : []),
    ...(hh.nnInteractionNrfi != null && ah.nnInteractionNrfi != null
      ? [{ name: "NN Interaction", p: (hh.nnInteractionNrfi + ah.nnInteractionNrfi) / 2, detail: "Poisson × Markov cross-model interaction" }] : []),
    ...(hh.hierarchicalBayesNrfi != null && ah.hierarchicalBayesNrfi != null
      ? [{ name: "Hier. Bayes", p: (hh.hierarchicalBayesNrfi + ah.hierarchicalBayesNrfi) / 2, detail: "Dynamic-prior shrunk pitcher rate" }] : []),
  ]
  const { label, color, bg, bdr } = consensusLabel(bd.modelConsensus)

  return (
    <div
      className="mt-3 rounded-[8px] p-3"
      style={{ background: "rgba(0,229,255,0.04)", border: "1px solid rgba(0,229,255,0.15)" }}
    >
      <div className="flex items-center justify-between mb-2.5">
        <p className="flex items-center gap-1.5 font-mono uppercase tracking-[0.1em]" style={{ fontSize: "9px", color: "var(--hm-diamond)" }}>
          <BrainCircuit size={12} />
          {metaModels.length > 0 ? "7-MODEL ENSEMBLE" : "MODEL ENSEMBLE"}
        </p>
        <span
          className="inline-flex items-center rounded-[3px] px-[6px] py-[2px] font-mono uppercase tracking-[0.06em]"
          style={{ fontSize: "8px", color, background: bg, border: `1px solid ${bdr}` }}
        >
          {label}
        </span>
      </div>
      <div className="space-y-2">{baseModels.map((m) => <ModelRow key={m.name} {...m} />)}</div>
      {metaModels.length > 0 && (
        <>
          <div className="my-2 flex items-center gap-2">
            <div className="flex-1" style={{ borderTop: "1px solid rgba(0,229,255,0.12)" }} />
            <span className="font-mono uppercase tracking-[0.14em]" style={{ fontSize: "8px", color: "var(--hm-smoke)" }}>Meta-models</span>
            <div className="flex-1" style={{ borderTop: "1px solid rgba(0,229,255,0.12)" }} />
          </div>
          <div className="space-y-2">{metaModels.map((m) => <ModelRow key={m.name} {...m} />)}</div>
        </>
      )}
      <div className="mt-2.5 grid grid-cols-2 gap-x-4 pt-2 font-mono" style={{ borderTop: "1px solid rgba(0,229,255,0.1)", fontSize: "9px" }}>
        <div>
          <span style={{ color: "var(--hm-smoke)" }}>{awayAbbr} trust </span>
          <span style={{ color: "var(--hm-diamond)" }}>{(bd.homeHalfInning.bayesianDataWeight * 100).toFixed(0)}% season</span>
        </div>
        <div>
          <span style={{ color: "var(--hm-smoke)" }}>{homeAbbr} trust </span>
          <span style={{ color: "var(--hm-diamond)" }}>{(bd.awayHalfInning.bayesianDataWeight * 100).toFixed(0)}% season</span>
        </div>
      </div>
      {bd.consensusNote && (
        <div className="mt-1.5 flex items-start gap-1 font-ui" style={{ fontSize: "10px", color: "var(--hm-gold)" }}>
          <AlertTriangle size={11} className="flex-shrink-0 mt-px" />
          <span className="italic">{bd.consensusNote}</span>
        </div>
      )}
    </div>
  )
}

// ─── Blurred-badge wrapper for free teaser mode ───────────────────────────────
function LockedBadgeWrapper({
  children,
  onUnlock,
}: {
  children: React.ReactNode
  onUnlock: () => void
}) {
  return (
    <div className="relative inline-flex select-none">
      <div style={{ filter: "blur(5px)", pointerEvents: "none" }}>
        {children}
      </div>
      <button
        onClick={onUnlock}
        className="absolute inset-0 flex items-center justify-center gap-1 rounded"
        style={{ background: "rgba(0,0,0,0.4)" }}
        aria-label="Unlock signal — upgrade to Pro"
      >
        <Lock size={9} style={{ color: "#00e5ff" }} />
        <span className="font-mono tracking-[0.1em] uppercase" style={{ fontSize: "8px", color: "#00e5ff" }}>
          Pro
        </span>
      </button>
    </div>
  )
}

// ─── Main card ────────────────────────────────────────────────────────────────
export function GamePredictionCard({
  game, prediction, homeTeam, awayTeam, homePitcher, awayPitcher,
  tier: _tier = "FREE", isFreeTease = false,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const router = useRouter()
  const isNrfiFavored = prediction.nrfiProbability >= 0.5
  const va = prediction.valueAnalysis
  const gaugeId = `gauge-${game.id}`

  // Top stripe color — fall back to neutral for free teaser (recommendation may be stripped)
  const rec = prediction.recommendation
  const stripeColor = isFreeTease
    ? (isNrfiFavored ? "var(--hm-grass)" : "var(--hm-blood)")
    : (isNrfiFavored ? "var(--hm-grass)" : (!rec || rec === "TOSS_UP") ? "var(--hm-smoke)" : "var(--hm-blood)")

  return (
    <div
      className="flex flex-col overflow-hidden rounded-[14px] relative"
      style={{
        background: "linear-gradient(160deg, var(--hm-pitch) 0%, var(--hm-void) 100%)",
        border: "1px solid var(--hm-fence)",
      }}
    >
      {/* Top accent stripe */}
      <div aria-hidden style={{ height: "2px", background: stripeColor, opacity: 0.75 }} />

      {/* Header row */}
      <div
        className="flex items-center justify-between px-3 sm:px-4 py-2"
        style={{ borderBottom: "1px solid var(--hm-fence)" }}
      >
        <div className="flex items-center gap-2">
          <Clock size={11} style={{ color: "var(--hm-smoke)" }} />
          <span className="font-mono tracking-[0.06em]" style={{ fontSize: "10px", color: "var(--hm-mist)" }}>
            {game.time} {game.timeZone}
          </span>
          <span className="hidden sm:inline" style={{ color: "var(--hm-fence)" }}>·</span>
          <span className="hidden sm:inline font-ui truncate max-w-[140px]" style={{ fontSize: "11px", color: "var(--hm-smoke)" }}>
            {game.venue}
          </span>
        </div>
        <WeatherBadge game={game} />
      </div>

      {/* Matchup row */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 sm:py-4">
        {/* Away team */}
        <div className="flex flex-col items-start gap-[3px] flex-1 min-w-0">
          <span
            className="font-headline leading-none tracking-[0.03em]"
            style={{ fontSize: "22px", color: "var(--hm-chalk)" }}
          >
            {awayTeam.abbreviation}
          </span>
          <span className="font-ui truncate max-w-full" style={{ fontSize: "11px", color: "var(--hm-mist)" }}>
            {awayPitcher.name}
          </span>
          <span className="font-mono uppercase tracking-[0.06em]" style={{ fontSize: "9px", color: "var(--hm-smoke)" }}>
            {awayPitcher.throws}HP · {pct(awayPitcher.firstInning.nrfiRate)} NRFI
          </span>
        </div>

        {/* Arc gauge */}
        <ArcGauge probability={prediction.nrfiProbability} id={gaugeId} />

        {/* Home team */}
        <div className="flex flex-col items-end gap-[3px] flex-1 min-w-0">
          <span
            className="font-headline leading-none tracking-[0.03em]"
            style={{ fontSize: "22px", color: "var(--hm-chalk)" }}
          >
            {homeTeam.abbreviation}
          </span>
          <span className="font-ui truncate max-w-full text-right" style={{ fontSize: "11px", color: "var(--hm-mist)" }}>
            {homePitcher.name}
          </span>
          <span className="font-mono uppercase tracking-[0.06em]" style={{ fontSize: "9px", color: "var(--hm-smoke)" }}>
            {pct(homePitcher.firstInning.nrfiRate)} NRFI · {homePitcher.throws}HP
          </span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex flex-col">
        <TabsList
          className="w-full justify-start rounded-none bg-transparent pt-1 pb-0 gap-0 overflow-x-auto tabs-scroll"
          style={{
            paddingLeft: "12px",
            paddingRight: "12px",
            borderBottom: "1px solid var(--hm-fence)",
          }}
        >
          {[
            { value: "overview",   icon: <BarChart3 size={11} />, label: "OVERVIEW" },
            { value: "historical", icon: <History size={11} />,   label: "HISTORY" },
            { value: "pitchers",   icon: <TrendingUp size={11} />, label: "PITCHERS" },
            { value: "accuracy",   icon: <BarChart3 size={11} />, label: "ACCURACY" },
          ].map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="whitespace-nowrap shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--hm-diamond)] data-[state=active]:text-[var(--hm-diamond)] transition-colors bg-transparent"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--hm-smoke)",
              }}
            >
              {tab.icon}{tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview" className="mt-0 flex-1 p-3 sm:p-4 space-y-3">
          {/* FREE TEASER: "Today's Best Pick" label above the probability bar */}
          {isFreeTease && (
            <div
              className="flex items-center justify-between rounded-[8px] px-3 py-2"
              style={{
                background: "linear-gradient(135deg, rgba(0,229,255,0.06), rgba(0,230,118,0.04))",
                border: "1px solid rgba(0,229,255,0.2)",
              }}
            >
              <span
                className="font-mono uppercase tracking-[0.14em]"
                style={{ fontSize: "9px", color: "#00e5ff" }}
              >
                🏆 Today&apos;s Best Pick
              </span>
              <span
                className="font-mono uppercase tracking-[0.1em]"
                style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)" }}
              >
                Highest Confidence
              </span>
            </div>
          )}

          <ProbabilityBar nrfi={prediction.nrfiProbability} />

          <div className="flex flex-wrap items-center gap-2">
            {/* Recommendation badge — blurred in free tease mode */}
            {isFreeTease ? (
              <LockedBadgeWrapper onUnlock={() => router.push("/pricing")}>
                {/* Render a placeholder badge since recommendation is stripped */}
                <span
                  className="inline-flex items-center gap-1 rounded-[4px] px-[8px] py-[3px] font-mono tracking-[0.08em] uppercase"
                  style={{ fontSize: "9px", color: "#00e676", background: "rgba(0,230,118,0.10)", border: "1px solid rgba(0,230,118,0.45)" }}
                >
                  SIGNAL
                </span>
              </LockedBadgeWrapper>
            ) : (
              prediction.recommendation && <RecommendationBadge rec={prediction.recommendation} />
            )}

            {/* Confidence badge — blurred in free tease mode */}
            {isFreeTease ? (
              <LockedBadgeWrapper onUnlock={() => router.push("/pricing")}>
                <span
                  className="inline-flex items-center gap-1 rounded-[4px] px-[8px] py-[3px] font-mono tracking-[0.08em] uppercase"
                  style={{ fontSize: "9px", color: "#00e5ff", background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.3)" }}
                >
                  CONF
                </span>
              </LockedBadgeWrapper>
            ) : (
              prediction.confidence && prediction.confidenceScore != null &&
              <ConfidenceBadge level={prediction.confidence} score={prediction.confidenceScore} />
            )}

            {!isFreeTease && prediction.modelBreakdown && (
              <ModelConsensusBadge consensus={prediction.modelBreakdown.modelConsensus} />
            )}
            {!isFreeTease && va && va.recommendedBet !== "NO_BET" && (
              <span
                className="inline-flex items-center gap-1 rounded-[4px] px-[8px] py-[3px] font-mono tracking-[0.08em] uppercase"
                style={{ fontSize: "9px", color: "#a855f7", background: "rgba(168,85,247,.08)", border: "1px solid rgba(168,85,247,.3)" }}
              >
                <DollarSign size={10} />
                Value {formatOdds(va.recommendedBet === "NRFI" ? va.nrfiOdds : va.yrfiOdds)}
                {" "}+{((va.recommendedBet === "NRFI" ? va.nrfiEdge : va.yrfiEdge) * 100).toFixed(1)}%
              </span>
            )}
          </div>

          {/* FREE TEASER: Upgrade nudge instead of locked content */}
          {isFreeTease && (
            <button
              onClick={() => router.push("/pricing")}
              className="flex w-full items-center justify-center gap-2 rounded-[8px] py-2.5 text-xs font-semibold transition-opacity hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, rgba(0,229,255,0.12), rgba(0,230,118,0.08))",
                border: "1px solid rgba(0,229,255,0.3)",
                color: "#00e5ff",
              }}
            >
              <Zap size={12} />
              Unlock full signal, confidence &amp; today&apos;s games
            </button>
          )}

          {/* xR grid — shown in all tiers (non-sensitive data) */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { abbr: awayTeam.abbreviation, xR: prediction.awayExpectedRuns, p0: prediction.awayScores0Prob },
              { abbr: homeTeam.abbreviation, xR: prediction.homeExpectedRuns, p0: prediction.homeScores0Prob },
            ].map((t) => (
              <div key={t.abbr} className="rounded-[8px] px-3 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--hm-fence)" }}>
                <MetricLabel label={`${t.abbr} xR (1st)`} glossaryKey="xR" />
                <p className="font-mono font-semibold tabular-nums my-1" style={{ fontSize: "13px", color: "var(--hm-chalk)" }}>{t.xR.toFixed(3)}</p>
                <MetricLabel label={`${pct(t.p0)} score 0`} glossaryKey="nrfiRate" />
              </div>
            ))}
          </div>

          {/* Pitcher/team form rows — hidden in free tease (PRO+ only) */}
          {!isFreeTease && (
            <>
              <div
                className="flex flex-col gap-1.5 pt-3"
                style={{ borderTop: "1px solid var(--hm-fence)" }}
              >
                <PitcherFormRow name={awayPitcher.name} results={awayPitcher.firstInning.last5Results} />
                <PitcherFormRow name={homePitcher.name} results={homePitcher.firstInning.last5Results} />
              </div>

              {(awayTeam.firstInning.last5Results || homeTeam.firstInning.last5Results) && (
                <div className="flex flex-col gap-1.5 pt-3" style={{ borderTop: "1px solid var(--hm-fence)" }}>
                  {awayTeam.firstInning.last5Results && <TeamFormRow abbr={awayTeam.abbreviation} results={awayTeam.firstInning.last5Results} />}
                  {homeTeam.firstInning.last5Results && <TeamFormRow abbr={homeTeam.abbreviation} results={homeTeam.firstInning.last5Results} />}
                </div>
              )}
            </>
          )}

          {/* Key factors — hidden in free tease (PRO+ only) */}
          {!isFreeTease && prediction.factors && prediction.factors.length > 0 && (
            <div className="pt-3" style={{ borderTop: "1px solid var(--hm-fence)" }}>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center justify-between transition-colors"
                style={{ color: "var(--hm-smoke)", fontSize: "11px" }}
              >
                <span className="font-ui">Key Factors ({prediction.factors.length})</span>
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {expanded && (
                <div className="mt-2 space-y-2">
                  <ul className="space-y-2">
                    {prediction.factors.map((f, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <FactorIcon impact={f.impact} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-ui font-semibold" style={{ fontSize: "11px", color: "var(--hm-chalk)" }}>{f.name}</span>
                            {f.value && <span className="font-mono" style={{ fontSize: "10px", color: "var(--hm-smoke)" }}>{f.value}</span>}
                          </div>
                          <p className="font-ui leading-relaxed" style={{ fontSize: "10px", color: "var(--hm-smoke)" }}>{f.description}</p>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {prediction.modelBreakdown && (
                    <ModelBreakdownPanel bd={prediction.modelBreakdown} awayAbbr={awayTeam.abbreviation} homeAbbr={homeTeam.abbreviation} />
                  )}

                  <StackContributionBar ensembleVersion={prediction.ensembleVersion} ensembleWeights={prediction.ensembleWeights} />
                  <DeepNrfiPanel deepNrfi={prediction.deepNrfi} />
                  <MonteCarloHistogram mc={prediction.monteCarlo} />

                  {va && (
                    <div className="rounded-[8px] p-3" style={{ background: "rgba(168,85,247,.05)", border: "1px solid rgba(168,85,247,.2)" }}>
                      <p className="font-mono uppercase tracking-[0.1em] mb-2" style={{ fontSize: "9px", color: "#a855f7" }}>
                        Value Analysis · {game.odds?.bookmaker}
                      </p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono" style={{ fontSize: "10px" }}>
                        <span style={{ color: "var(--hm-smoke)" }}>NRFI Odds</span>
                        <span style={{ color: "var(--hm-mist)" }}>{formatOdds(va.nrfiOdds)} ({pct(va.impliedNrfiProb)} implied)</span>
                        <span style={{ color: "var(--hm-smoke)" }}>YRFI Odds</span>
                        <span style={{ color: "var(--hm-mist)" }}>{formatOdds(va.yrfiOdds)} ({pct(va.impliedYrfiProb)} implied)</span>
                        {va.recommendedBet !== "NO_BET" && (
                          <>
                            <span style={{ color: "var(--hm-smoke)" }}>Model Edge</span>
                            <span style={{ color: "#a855f7", fontWeight: 600 }}>
                              +{((va.recommendedBet === "NRFI" ? va.nrfiEdge : va.yrfiEdge) * 100).toFixed(2)}% on {va.recommendedBet}
                            </span>
                            <span style={{ color: "var(--hm-smoke)" }}>Kelly Size</span>
                            <span style={{ color: "var(--hm-mist)" }}>{pct(va.kellyFraction)} of bankroll</span>
                            <span style={{ color: "var(--hm-smoke)" }}>Expected Value</span>
                            <span style={{ color: va.expectedValue > 0 ? "var(--hm-grass)" : "var(--hm-blood)", fontWeight: 600 }}>
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

        {/* Historical tab */}
        <TabsContent value="historical" className="mt-0 flex-1 p-3 sm:p-4 space-y-3">
          {[
            { title: "Matchup History", desc: `Head-to-head records between ${awayTeam.abbreviation} and ${homeTeam.abbreviation} from previous seasons coming soon.` },
            { title: "Recent Series",   desc: "Last 10 games between these teams and NRFI/YRFI results will appear here." },
          ].map((block) => (
            <div key={block.title} className="rounded-[8px] p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--hm-fence)" }}>
              <p className="font-mono uppercase tracking-[0.12em] mb-2" style={{ fontSize: "9px", color: "var(--hm-smoke)" }}>{block.title}</p>
              <p className="font-ui" style={{ fontSize: "11px", color: "var(--hm-smoke)" }}>{block.desc}</p>
            </div>
          ))}
        </TabsContent>

        {/* Pitchers tab */}
        <TabsContent value="pitchers" className="mt-0 flex-1 p-3 sm:p-4 space-y-3">
          {[
            { team: awayTeam, pitcher: awayPitcher },
            { team: homeTeam, pitcher: homePitcher },
          ].map(({ team, pitcher }) => (
            <div key={team.abbreviation} className="rounded-[8px] p-3" style={{ border: "1px solid var(--hm-fence)", background: "rgba(255,255,255,0.02)" }}>
              <div className="mb-2">
                <p className="font-ui font-bold" style={{ fontSize: "13px", color: "var(--hm-chalk)" }}>{team.abbreviation}: {pitcher.name}</p>
                <p className="font-mono uppercase tracking-[0.08em]" style={{ fontSize: "9px", color: "var(--hm-smoke)" }}>
                  {pitcher.throws}HP · {pitcher.firstInning.startCount} starts
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {[
                  { label: "NRFI Rate", val: pct(pitcher.firstInning.nrfiRate) },
                  { label: "K Rate",    val: pct(pitcher.firstInning.kRate) },
                  { label: "BB Rate",   val: pct(pitcher.firstInning.bbRate) },
                  { label: "ERA",       val: pitcher.firstInning.era.toFixed(2) },
                ].map((stat) => (
                  <div key={stat.label}>
                    <p className="font-mono uppercase tracking-[0.1em]" style={{ fontSize: "8px", color: "var(--hm-smoke)" }}>{stat.label}</p>
                    <p className="font-mono tabular-nums font-semibold" style={{ fontSize: "12px", color: "var(--hm-chalk)" }}>{stat.val}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--hm-fence)" }}>
                <p className="font-mono uppercase tracking-[0.1em] mb-1.5" style={{ fontSize: "8px", color: "var(--hm-smoke)" }}>Last 5 (NRFI)</p>
                <div className="flex gap-1">{pitcher.firstInning.last5Results.map((r, i) => <FormPip key={i} value={r} />)}</div>
              </div>
            </div>
          ))}
        </TabsContent>

        {/* Accuracy tab */}
        <TabsContent value="accuracy" className="mt-0 flex-1 p-3 sm:p-4 space-y-3">
          <div className="rounded-[8px] p-3" style={{ border: "1px solid var(--hm-fence)", background: "rgba(255,255,255,0.02)" }}>
            <p className="font-mono uppercase tracking-[0.12em] mb-2" style={{ fontSize: "9px", color: "var(--hm-smoke)" }}>Game Result</p>
            <div className="space-y-2">
              {[awayTeam.abbreviation, homeTeam.abbreviation].map((abbr) => (
                <div key={abbr} className="flex items-center justify-between">
                  <span className="font-ui" style={{ fontSize: "11px", color: "var(--hm-smoke)" }}>{abbr} runs (1st inning)</span>
                  <span className="font-mono font-semibold" style={{ fontSize: "12px", color: "var(--hm-mist)" }}>—</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--hm-fence)" }}>
                <span className="font-ui" style={{ fontSize: "11px", color: "var(--hm-smoke)" }}>Prediction Accuracy</span>
                <span className="font-mono uppercase tracking-[0.1em]" style={{ fontSize: "9px", color: "var(--hm-smoke)" }}>PENDING</span>
              </div>
            </div>
          </div>
          <div className="rounded-[8px] p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--hm-fence)" }}>
            <p className="font-ui italic" style={{ fontSize: "11px", color: "var(--hm-smoke)" }}>
              Result recorded after first inning. Accuracy calculated automatically.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-3 sm:px-4 py-2.5"
        style={{ borderTop: "1px solid var(--hm-fence)" }}
      >
        <div className="flex flex-wrap gap-1.5">
          {prediction.factors?.slice(0, 3).map((f, i) => (
            <span
              key={i}
              className="hm-chip"
              style={{
                borderColor: f.impact === "positive" ? "rgba(0,230,118,.3)"  : f.impact === "negative" ? "rgba(255,23,68,.3)"  : undefined,
                color:       f.impact === "positive" ? "var(--hm-grass)"     : f.impact === "negative" ? "var(--hm-blood)"     : undefined,
              }}
            >
              {f.name}
            </span>
          ))}
        </div>
        <Link
          href={`/ensemble/${game.id}`}
          className="font-mono uppercase tracking-[0.15em] transition-colors"
          style={{ fontSize: "9px", color: "var(--hm-smoke)" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--hm-diamond)" }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--hm-smoke)" }}
        >
          Ensemble ›
        </Link>
      </div>
    </div>
  )
}
