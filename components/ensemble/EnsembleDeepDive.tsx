"use client"

import { useState, useCallback } from "react"
import { EnsembleHeadline } from "./EnsembleHeadline"
import { ModelContributionBar } from "./ModelContributionBar"
import { PoissonPanel } from "./PoissonPanel"
import { BayesianPanel } from "./BayesianPanel"
import { ZipPanel } from "./ZipPanel"
import { MarkovDiamond } from "./MarkovDiamond"
import { SensitivityControls } from "./SensitivityControls"
import { MonteCarloButton } from "./MonteCarloButton"
import { SectionLabel } from "@/components/diamond/SectionLabel"
import { recomputeWithAdjustments } from "@/lib/nrfi-engine"
import { computeMarkovStateSnapshot } from "@/lib/nrfi-models"
import type { NRFIPrediction, SensitivityAdjustments } from "@/lib/types"
import type { MarkovStateSnapshot } from "@/lib/nrfi-models"
import type { Game, Pitcher, Team } from "@/lib/types"

interface Props {
  initialPrediction: NRFIPrediction
  initialSnapshot: MarkovStateSnapshot
  game: Game
  /** Plain objects — converted to Maps internally for engine calls */
  pitchersRecord: Record<string, Pitcher>
  teamsRecord: Record<string, Team>
  homeLabel?: string
  awayLabel?: string
}

export function EnsembleDeepDive({
  initialPrediction,
  initialSnapshot,
  game,
  pitchersRecord,
  teamsRecord,
  homeLabel = "Home",
  awayLabel = "Away",
}: Props) {
  const [prediction, setPrediction] = useState<NRFIPrediction>(initialPrediction)
  const [snapshot, setSnapshot] = useState<MarkovStateSnapshot>(initialSnapshot)
  const [isComputing, setIsComputing] = useState(false)

  const handleSensitivity = useCallback(
    (adj: SensitivityAdjustments) => {
      setIsComputing(true)
      // Pure TS computation — synchronous, <2ms for typical inputs
      const result = recomputeWithAdjustments(game, new Map(Object.entries(pitchersRecord)), new Map(Object.entries(teamsRecord)), adj)
      if (result) {
        setPrediction(result)
        // Recompute Markov snapshot if home half-inning PA outcomes are available
        const homePA = result.modelBreakdown?.homeHalfInning?.paOutcomes
        const awayPA = result.modelBreakdown?.awayHalfInning?.paOutcomes
        if (homePA && awayPA) {
          // PAOutcomes uses { out, walk, single, double, triple, hr } (no Prob suffix)
          setSnapshot(computeMarkovStateSnapshot({
            out:    (homePA.outProb    + awayPA.outProb)    / 2,
            walk:   (homePA.walkProb   + awayPA.walkProb)   / 2,
            single: (homePA.singleProb + awayPA.singleProb) / 2,
            double: (homePA.doubleProb + awayPA.doubleProb) / 2,
            triple: (homePA.tripleProb + awayPA.tripleProb) / 2,
            hr:     (homePA.hrProb     + awayPA.hrProb)     / 2,
          }))
        }
      }
      setIsComputing(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, pitchersRecord, teamsRecord]
  )

  const mb = prediction.modelBreakdown
  const homeHalf = mb?.homeHalfInning
  const awayHalf = mb?.awayHalfInning

  return (
    <div className="space-y-6">
      {/* Headline */}
      <EnsembleHeadline
        prediction={prediction}
        marketNrfiOdds={game.odds?.nrfiOdds ?? -115}
      />

      {/* Sensitivity */}
      <SectionLabel index="02">Sensitivity Analysis</SectionLabel>
      <SensitivityControls
        onResult={handleSensitivity}
        isComputing={isComputing}
      />

      {/* Model Contribution */}
      <SectionLabel index="03">Model Contributions</SectionLabel>
      <ModelContributionBar modelBreakdown={mb} />

      {/* Half-inning stats panels */}
      <SectionLabel index="04">Probabilistic Models</SectionLabel>
      <div className="grid gap-4 lg:grid-cols-2">
        <PoissonPanel home={homeHalf} away={awayHalf} homeLabel={homeLabel} awayLabel={awayLabel} />
        <BayesianPanel home={homeHalf} away={awayHalf} homeLabel={homeLabel} awayLabel={awayLabel} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ZipPanel home={homeHalf} away={awayHalf} homeLabel={homeLabel} awayLabel={awayLabel} />
        <MonteCarloButton
          homeNrfiProb={prediction.homeScores0Prob}
          awayNrfiProb={prediction.awayScores0Prob}
          homeLabel={homeLabel}
          awayLabel={awayLabel}
        />
      </div>

      {/* Markov Diamond */}
      <SectionLabel index="05">Markov Base-Out Matrix</SectionLabel>
      <MarkovDiamond snapshot={snapshot} />
    </div>
  )
}
