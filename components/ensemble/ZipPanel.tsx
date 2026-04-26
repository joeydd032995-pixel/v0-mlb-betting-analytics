"use client"

import { useState } from "react"
import { Panel } from "@/components/diamond/Panel"
import type { HalfInningModelBreakdown } from "@/lib/types"

interface Props {
  home?: HalfInningModelBreakdown
  away?: HalfInningModelBreakdown
  homeLabel?: string
  awayLabel?: string
}

const OMEGA_STEPS = [0.05, 0.10, 0.15, 0.20, 0.25]

function zipNrfi(omega: number, lambda: number): number {
  return omega + (1 - omega) * Math.exp(-lambda)
}

export function ZipPanel({ home, away, homeLabel = "Home", awayLabel = "Away" }: Props) {
  const [locked, setLocked] = useState<Set<string>>(new Set())

  const baseOmegaHome = home?.zipOmega ?? 0.12
  const baseOmegaAway = away?.zipOmega ?? 0.12
  const baseLambdaHome = home?.zipLambda ?? home?.mapreLambdaAdj ?? 0.42
  const baseLambdaAway = away?.zipLambda ?? away?.mapreLambdaAdj ?? 0.42

  const toggle = (key: string) => {
    setLocked((prev: Set<string>) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Compute effective omegas: locked cells override; unlocked = base
  // We show a 5x5 grid: rows = home omega scenarios, cols = away omega scenarios
  const lockedHomeSteps = OMEGA_STEPS.filter((_, i) => locked.has(`r${i}`))
  const lockedAwaySteps = OMEGA_STEPS.filter((_, i) => locked.has(`c${i}`))

  const effectiveOmegaHome = lockedHomeSteps.length > 0
    ? lockedHomeSteps.reduce((a, b) => a + b, 0) / lockedHomeSteps.length
    : baseOmegaHome
  const effectiveOmegaAway = lockedAwaySteps.length > 0
    ? lockedAwaySteps.reduce((a, b) => a + b, 0) / lockedAwaySteps.length
    : baseOmegaAway

  const combinedNrfi = zipNrfi(effectiveOmegaHome, baseLambdaHome) *
    zipNrfi(effectiveOmegaAway, baseLambdaAway)

  return (
    <Panel title="ZIP Lockdown Grid" chip="ω scenario matrix">
      <div className="flex gap-6 items-start">
        {/* Grid */}
        <div>
          <div className="font-jet text-[9px] uppercase tracking-[0.15em] text-ds-muted mb-2 text-center">
            {awayLabel} ω →
          </div>
          <div className="flex items-start gap-1.5">
            <div className="flex flex-col items-center gap-1.5 mr-1">
              <div className="font-jet text-[8px] text-ds-muted rotate-[-90deg] translate-y-[28px] whitespace-nowrap origin-center" style={{ writingMode: "vertical-lr" }}>
                {homeLabel} ω ↓
              </div>
            </div>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${OMEGA_STEPS.length}, 44px)` }}>
              {/* Column headers */}
              {OMEGA_STEPS.map((aw, ci) => (
                <button
                  key={`ch-${ci}`}
                  onClick={() => toggle(`c${ci}`)}
                  className="font-jet text-[9px] text-center transition-colors"
                  style={{ color: locked.has(`c${ci}`) ? "var(--ds-gr)" : "var(--ds-dim)" }}
                >
                  {(aw * 100).toFixed(0)}%
                </button>
              ))}

              {/* Grid cells */}
              {OMEGA_STEPS.map((hw, ri) => (
                OMEGA_STEPS.map((aw, ci) => {
                  const cellKey = `${ri}-${ci}`
                  const isLocked = locked.has(cellKey)
                  const nrfi = zipNrfi(hw, baseLambdaHome) * zipNrfi(aw, baseLambdaAway)
                  const intensity = nrfi
                  return (
                    <button
                      key={cellKey}
                      onClick={() => toggle(cellKey)}
                      title={`Home ω=${(hw*100).toFixed(0)}% × Away ω=${(aw*100).toFixed(0)}% → NRFI ${(nrfi*100).toFixed(1)}%`}
                      className="h-[36px] rounded-[6px] flex items-center justify-center font-jet text-[9px] font-semibold border transition-all"
                      style={{
                        background: isLocked
                          ? `rgba(16, 185, 129, ${0.15 + intensity * 0.25})`
                          : `rgba(34, 211, 238, ${0.04 + intensity * 0.18})`,
                        borderColor: isLocked ? "var(--ds-gr)" : "var(--ds-line)",
                        color: isLocked ? "var(--ds-gr)" : "var(--ds-cy)",
                        boxShadow: isLocked ? "0 0 8px rgba(16,185,129,0.25)" : "none",
                      }}
                    >
                      {(nrfi * 100).toFixed(0)}%
                    </button>
                  )
                })
              ))}

              {/* Row headers (after grid — we render them as hidden spacers then add inline) */}
            </div>

            {/* Row headers */}
            <div className="flex flex-col gap-1.5 ml-1" style={{ marginTop: "calc(9px + 0.375rem)" }}>
              {OMEGA_STEPS.map((hw, ri) => (
                <button
                  key={`rh-${ri}`}
                  onClick={() => toggle(`r${ri}`)}
                  className="font-jet text-[9px] h-[36px] flex items-center transition-colors"
                  style={{ color: locked.has(`r${ri}`) ? "var(--ds-cy)" : "var(--ds-dim)" }}
                >
                  {(hw * 100).toFixed(0)}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="flex-1 min-w-[120px] space-y-3">
          <div>
            <div className="font-jet text-[9px] uppercase tracking-[0.18em] text-ds-muted">Effective ZIP NRFI</div>
            <div
              className="font-display text-[28px] font-bold"
              style={{
                color: combinedNrfi >= 0.55 ? "var(--ds-gr)" : combinedNrfi >= 0.40 ? "var(--ds-cy)" : "var(--ds-bad)",
              }}
            >
              {(combinedNrfi * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="font-jet text-[9px] uppercase tracking-[0.18em] text-ds-muted">{homeLabel} ω (base)</div>
            <div className="font-display text-[16px] font-semibold text-ds-cy">{(baseOmegaHome * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div className="font-jet text-[9px] uppercase tracking-[0.18em] text-ds-muted">{awayLabel} ω (base)</div>
            <div className="font-display text-[16px] font-semibold text-ds-cy">{(baseOmegaAway * 100).toFixed(1)}%</div>
          </div>
          <p className="font-jet text-[9px] text-ds-dim leading-relaxed">
            Click cells to toggle lockdown. Click row/col headers to lock entire scenario.
          </p>
        </div>
      </div>
    </Panel>
  )
}
