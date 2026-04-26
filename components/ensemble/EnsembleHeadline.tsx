"use client"

import type { NRFIPrediction } from "@/lib/types"

interface Props {
  prediction: NRFIPrediction
  marketNrfiOdds?: number
}

function oddsToProb(americanOdds: number): number {
  if (americanOdds > 0) return 100 / (americanOdds + 100)
  return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100)
}

function probToAmerican(prob: number): string {
  if (prob >= 0.5) return `-${Math.round(prob / (1 - prob) * 100)}`
  return `+${Math.round((1 - prob) / prob * 100)}`
}

export function EnsembleHeadline({ prediction, marketNrfiOdds = -115 }: Props) {
  const p = prediction.nrfiProbability
  const impliedProb = oddsToProb(marketNrfiOdds)
  const edge = ((p - impliedProb) * 100).toFixed(1)
  const edgePositive = p > impliedProb
  const impliedOdds = probToAmerican(impliedProb)
  const modelOdds = probToAmerican(p)
  const cs = prediction.confidenceScore

  const confidenceColor =
    cs >= 75 ? "var(--ds-gr)" : cs >= 55 ? "var(--ds-cy)" : "var(--ds-warn)"

  return (
    <div
      className="rounded-[16px] border border-ds-line p-6 relative overflow-hidden"
      style={{ background: "linear-gradient(160deg, var(--ds-panel) 0%, var(--ds-panel-2) 100%)" }}
    >
      {/* radial glow behind probability */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 60% 50% at 20% 50%, ${p >= 0.55 ? "rgba(16,185,129,0.06)" : "rgba(249,115,115,0.06)"} 0%, transparent 70%)`,
        }}
      />

      <div className="relative flex flex-wrap gap-8 items-center">
        {/* Big probability */}
        <div>
          <div className="font-jet text-[10px] uppercase tracking-[0.25em] text-ds-muted mb-1">
            P(NRFI) — Ensemble
          </div>
          <div
            className="font-display font-bold leading-none"
            style={{
              fontSize: "72px",
              background: p >= 0.55
                ? "linear-gradient(135deg, #10b981, #22d3ee)"
                : "linear-gradient(135deg, #f97373, #f59e0b)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {(p * 100).toFixed(1)}%
          </div>
          <div className="font-jet text-[11px] text-ds-muted mt-1">
            Recommendation:{" "}
            <span
              className="font-semibold"
              style={{
              color: prediction.recommendation.includes("NRFI") ? "var(--ds-gr)"
                : prediction.recommendation.includes("YRFI") ? "var(--ds-bad)"
                : "var(--ds-warn)"
            }}
            >
              {prediction.recommendation}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px self-stretch" style={{ background: "var(--ds-line)" }} />

        {/* Odds comparison */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <div>
            <div className="font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted mb-0.5">Model Odds</div>
            <div className="font-display text-[22px] font-semibold text-ds-cy">{modelOdds}</div>
          </div>
          <div>
            <div className="font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted mb-0.5">Market Odds</div>
            <div className="font-display text-[22px] font-semibold text-ds-ink-2">{impliedOdds}</div>
          </div>
          <div>
            <div className="font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted mb-0.5">Edge</div>
            <div
              className="font-display text-[22px] font-semibold"
              style={{ color: edgePositive ? "var(--ds-gr)" : "var(--ds-bad)" }}
            >
              {edgePositive ? "+" : ""}{edge}%
            </div>
          </div>
          <div>
            <div className="font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted mb-0.5">Confidence</div>
            <div className="font-display text-[22px] font-semibold" style={{ color: confidenceColor }}>
              {cs.toFixed(0)}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px self-stretch" style={{ background: "var(--ds-line)" }} />

        {/* Confidence bar */}
        <div className="flex-1 min-w-[140px]">
          <div className="font-jet text-[9px] uppercase tracking-[0.2em] text-ds-muted mb-2">Confidence Score</div>
          <div className="h-2 rounded-full bg-ds-line overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${cs}%`,
                background: `linear-gradient(90deg, ${confidenceColor}, ${confidenceColor}88)`,
                boxShadow: `0 0 8px ${confidenceColor}66`,
              }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="font-jet text-[9px] text-ds-dim">0</span>
            <span className="font-jet text-[9px]" style={{ color: confidenceColor }}>{cs.toFixed(0)} / 100</span>
          </div>
          <div className="font-jet text-[9px] text-ds-muted mt-2">
            {prediction.confidence} Confidence · {prediction.factors.length} factors analyzed
          </div>
        </div>
      </div>
    </div>
  )
}
