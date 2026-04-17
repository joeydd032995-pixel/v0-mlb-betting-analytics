"use client"

import type { Game, NRFIPrediction, Team, Pitcher } from "@/lib/types"
import { GamePredictionCard } from "@/components/game-prediction-card"
import { cn } from "@/lib/utils"
import {
  Zap,
  Target,
  Flame,
  CloudSun,
  Building2,
  Wind,
  Thermometer,
  Clock,
  Activity,
} from "lucide-react"

interface Props {
  game: Game
  prediction: NRFIPrediction
  homeTeam: Team
  awayTeam: Team
  homePitcher: Pitcher
  awayPitcher: Pitcher
  onLockIn?: () => void
}

function pct(n: number, d = 1) {
  return `${(n * 100).toFixed(d)}%`
}

function formatOdds(n: number) {
  return n > 0 ? `+${n}` : `${n}`
}

export function NeonCockpit({
  game,
  prediction,
  homeTeam,
  awayTeam,
  homePitcher,
  awayPitcher,
  onLockIn,
}: Props) {
  const nrfiPct = Math.round(prediction.nrfiProbability * 100)
  const yrfiPct = 100 - nrfiPct
  const isNrfi = prediction.nrfiProbability >= 0.5
  const rec = prediction.recommendation
  const va = prediction.valueAnalysis

  // "Strong" readings unlock extra glow intensity
  const isStrong = rec === "STRONG_NRFI" || rec === "STRONG_YRFI"
  const ringColor = isNrfi ? "#22c55e" : "#f43f5e"
  const ringTextColor = isNrfi ? "text-[#4ade80]" : "text-[#fb7185]"
  const ringGlow = isNrfi
    ? isStrong
      ? "neon-glow-emerald-strong"
      : "neon-glow-emerald"
    : "neon-glow-crimson"

  // Circle math: r = 82, circumference ≈ 515
  const circumference = 2 * Math.PI * 82
  const displayedPct = isNrfi ? nrfiPct : yrfiPct
  const dashLength = (displayedPct / 100) * circumference

  const recLabel: Record<NRFIPrediction["recommendation"], string> = {
    STRONG_NRFI: "STRONG NRFI",
    LEAN_NRFI: "LEAN NRFI",
    TOSS_UP: "TOSS-UP",
    LEAN_YRFI: "LEAN YRFI",
    STRONG_YRFI: "STRONG YRFI",
  }

  const kellyLabel =
    va && va.recommendedBet !== "NO_BET"
      ? `${(va.kellyFraction * 100).toFixed(1)}% · ${va.recommendedBet}`
      : "No value edge"

  const edgePct =
    va && va.recommendedBet !== "NO_BET"
      ? va.recommendedBet === "NRFI"
        ? va.nrfiEdge
        : va.yrfiEdge
      : 0

  const w = game.weather

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      {/* Cockpit hero: matchup + neon probability gauge */}
      <section
        className={cn(
          "relative overflow-hidden rounded-3xl border border-[#1f2937] bg-[#0f172a]/70 p-6 sm:p-10 backdrop-blur-md",
          "shadow-[0_0_0_1px_rgba(34,211,238,0.08)_inset]"
        )}
      >
        {/* subtle header line */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#22d3ee]/60 to-transparent" />

        {/* Matchup header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#94a3b8]">
              <Activity className="h-3 w-3 text-[#22d3ee]" />
              <span>Neon Cockpit</span>
              <span className="text-[#475569]">·</span>
              <Clock className="h-3 w-3" />
              <span>
                {game.time} {game.timeZone}
              </span>
            </div>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#f8fafc] sm:text-3xl">
              {awayTeam.abbreviation}{" "}
              <span className="text-[#475569]">@</span> {homeTeam.abbreviation}
            </h2>
            <p className="mt-0.5 text-xs text-[#94a3b8] truncate">
              {awayPitcher.name} ({awayPitcher.throws}HP) vs{" "}
              {homePitcher.name} ({homePitcher.throws}HP) · {game.venue}
            </p>
          </div>

          {/* Weather chip */}
          <div
            className={cn(
              "flex items-center gap-2 rounded-2xl border border-[#1f2937] bg-[#0a0a0a]/60 px-3 py-1.5 text-xs text-[#cbd5e1]"
            )}
          >
            {w.conditions === "dome" ? (
              <>
                <Building2 className="h-3.5 w-3.5 text-[#22d3ee]" />
                <span>Dome</span>
              </>
            ) : (
              <>
                <Thermometer className="h-3.5 w-3.5 text-[#facc15]" />
                <span className="font-metric">{w.temperature}°F</span>
                {w.windSpeed > 3 && (
                  <>
                    <Wind className="ml-1 h-3.5 w-3.5 text-[#22d3ee]" />
                    <span className="font-metric">
                      {w.windSpeed}mph {w.windDirection}
                    </span>
                  </>
                )}
                {w.conditions !== "clear" && (
                  <>
                    <CloudSun className="ml-1 h-3.5 w-3.5 text-[#94a3b8]" />
                    <span className="capitalize">{w.conditions}</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Gauge */}
        <div className="relative mx-auto flex w-full flex-col items-center">
          <div className="relative h-64 w-64 sm:h-80 sm:w-80">
            <svg
              className="-rotate-90 h-full w-full"
              viewBox="0 0 200 200"
              aria-hidden="true"
            >
              {/* base ring */}
              <circle
                cx="100"
                cy="100"
                r="82"
                fill="none"
                stroke="#1f2937"
                strokeWidth="14"
              />
              {/* progress ring with neon glow */}
              <circle
                cx="100"
                cy="100"
                r="82"
                fill="none"
                stroke={ringColor}
                strokeWidth="16"
                strokeLinecap="round"
                strokeDasharray={`${dashLength} ${circumference}`}
                className={cn(
                  "transition-[stroke-dasharray] duration-500 ease-out",
                  ringGlow
                )}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div
                className={cn(
                  "font-metric text-5xl font-bold leading-none sm:text-6xl",
                  ringTextColor
                )}
              >
                {displayedPct}%
              </div>
              <div className="mt-2 text-xs uppercase tracking-[0.3em] text-[#94a3b8]">
                P({isNrfi ? "NRFI" : "YRFI"})
              </div>
            </div>
          </div>

          {/* Split probs */}
          <div className="mt-4 flex items-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-[#22c55e] neon-glow-emerald" />
              <span className="text-[#94a3b8]">NRFI</span>
              <span className="font-metric font-semibold text-[#4ade80]">
                {nrfiPct}%
              </span>
            </div>
            <div className="h-3 w-px bg-[#1f2937]" />
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-[#f43f5e] neon-glow-crimson" />
              <span className="text-[#94a3b8]">YRFI</span>
              <span className="font-metric font-semibold text-[#fb7185]">
                {yrfiPct}%
              </span>
            </div>
          </div>
        </div>

        {/* Action row */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold tracking-wide uppercase",
              isNrfi
                ? "bg-[#22c55e]/10 text-[#4ade80] ring-1 ring-[#22c55e]/40"
                : cn(
                    "bg-[#f43f5e]/12 text-[#fb7185] ring-1 ring-[#f43f5e]/50",
                    isStrong && "neon-glow-crimson"
                  )
            )}
          >
            <Flame className="h-4 w-4" />
            {recLabel[rec]}
          </span>

          <span className="inline-flex items-center gap-2 rounded-2xl bg-[#0a0a0a]/70 px-4 py-2 text-sm text-[#cbd5e1] ring-1 ring-[#1f2937]">
            <Target className="h-4 w-4 text-[#facc15] neon-glow-amber" />
            <span className="text-[#94a3b8]">Kelly</span>
            <span className="font-metric font-semibold text-[#facc15]">
              {kellyLabel}
            </span>
          </span>

          {va && va.recommendedBet !== "NO_BET" && (
            <span className="inline-flex items-center gap-2 rounded-2xl bg-[#0a0a0a]/70 px-4 py-2 text-sm text-[#cbd5e1] ring-1 ring-[#22d3ee]/40">
              <span className="text-[#94a3b8]">Edge</span>
              <span className="font-metric font-semibold text-[#22d3ee]">
                +{(edgePct * 100).toFixed(1)}%
              </span>
              <span className="text-[#475569]">·</span>
              <span className="font-metric text-[#f8fafc]">
                {formatOdds(
                  va.recommendedBet === "NRFI" ? va.nrfiOdds : va.yrfiOdds
                )}
              </span>
            </span>
          )}

          <button
            type="button"
            onClick={onLockIn}
            disabled={!va || va.recommendedBet === "NO_BET"}
            className={cn(
              "group inline-flex cursor-pointer items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-[0.98]",
              "bg-gradient-to-r from-[#facc15] to-[#fb923c] text-[#0a0a0a] hover:brightness-110",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#facc15] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]",
              "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
            )}
          >
            <Zap className="h-4 w-4" />
            Lock In Bet
          </button>
        </div>

        {/* Expected runs strip */}
        <div className="mt-8 grid grid-cols-2 gap-3">
          <ExpectedRunStat
            label={`${awayTeam.abbreviation} xR (1st)`}
            value={prediction.awayExpectedRuns.toFixed(3)}
            sub={`${pct(prediction.awayScores0Prob)} score 0`}
          />
          <ExpectedRunStat
            label={`${homeTeam.abbreviation} xR (1st)`}
            value={prediction.homeExpectedRuns.toFixed(3)}
            sub={`${pct(prediction.homeScores0Prob)} score 0`}
          />
        </div>
      </section>

      {/* Reused full card — all factors, breakdown, value analysis intact */}
      <section className="relative">
        <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#94a3b8]">
          <span className="h-px w-8 bg-[#22d3ee]/50" />
          <span>Full Breakdown</span>
        </div>
        <div className="[&_[data-slot=card]]:border-[#1f2937] [&_[data-slot=card]]:bg-[#0f172a]/60 [&_[data-slot=card]]:backdrop-blur">
          <GamePredictionCard
            game={game}
            prediction={prediction}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            homePitcher={homePitcher}
            awayPitcher={awayPitcher}
          />
        </div>
      </section>
    </div>
  )
}

function ExpectedRunStat({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="rounded-2xl border border-[#1f2937] bg-[#0a0a0a]/50 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-[#94a3b8]">
        {label}
      </p>
      <p className="font-metric mt-1 text-xl font-semibold text-[#f8fafc]">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-[#94a3b8]">{sub}</p>
    </div>
  )
}
