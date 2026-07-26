import { SectionLabel } from "@/components/diamond/SectionLabel"
import { ModelInsights, type EngineFacts } from "@/components/model-insights"
import { FeatureImportanceChart } from "@/components/insights/FeatureImportanceChart"
import { FINAL_BLEND_CONTRACT, CONFIDENCE_THRESHOLDS, NRFI_CALL_THRESHOLD_PUBLIC } from "@/lib/nrfi-engine"
import { ENSEMBLE_WEIGHTS } from "@/lib/nrfi-models"
import {
  CALIBRATION_IS_IDENTITY,
  CALIBRATION_KNOT_COUNT,
  CALIBRATION_DOMAIN,
} from "@/lib/calibration"

/**
 * Snapshot of the live engine constants, read here in the Server Component and
 * passed down as plain data.
 *
 * Importing the engine directly into the client bundle would pull in the whole
 * model stack; more importantly, the "How It Works" copy used to restate these
 * values as hand-written literals and had drifted badly from the code — wrong
 * league anchor, wrong clamps, wrong weights, wrong confidence cutoffs, and a
 * calibration stage described as fitted when it is an identity map.
 */
function readEngineFacts(): EngineFacts {
  return {
    ensembleBlend: FINAL_BLEND_CONTRACT.ensembleBlend,
    leagueAnchor:  FINAL_BLEND_CONTRACT.leagueAnchor,
    clampMin:      FINAL_BLEND_CONTRACT.clampMin,
    clampMax:      FINAL_BLEND_CONTRACT.clampMax,
    callThreshold: NRFI_CALL_THRESHOLD_PUBLIC,
    confidenceHigh:   CONFIDENCE_THRESHOLDS.high,
    confidenceMedium: CONFIDENCE_THRESHOLDS.medium,
    weights: {
      poisson:           ENSEMBLE_WEIGHTS.poisson,
      zip:               ENSEMBLE_WEIGHTS.zip,
      markov:            ENSEMBLE_WEIGHTS.markov,
      mapre:             ENSEMBLE_WEIGHTS.mapre,
      logisticMeta:      ENSEMBLE_WEIGHTS.logisticMeta,
      nnInteraction:     ENSEMBLE_WEIGHTS.nnInteraction,
      hierarchicalBayes: ENSEMBLE_WEIGHTS.hierarchicalBayes,
    },
    calibrationIsIdentity: CALIBRATION_IS_IDENTITY,
    calibrationKnotCount:  CALIBRATION_KNOT_COUNT,
    calibrationDomain:     [CALIBRATION_DOMAIN[0], CALIBRATION_DOMAIN[1]],
  }
}

export default async function InsightsPage() {
  let userId: string | null = null
  try {
    const { auth } = await import("@clerk/nextjs/server")
    const session = await auth()
    userId = session.userId
  } catch {
    // Clerk not configured — proceed without auth
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--ds-bg)" }}>
      <main className="mx-auto max-w-[1480px] px-7 py-7 space-y-6">
        <SectionLabel index="01">Model Insights</SectionLabel>

        <SectionLabel index="02">Feature Importance (SHAP-style)</SectionLabel>
        <FeatureImportanceChart leagueAnchor={FINAL_BLEND_CONTRACT.leagueAnchor} />

        <SectionLabel index="03">Engine Breakdown</SectionLabel>
        <ModelInsights userId={userId} engineFacts={readEngineFacts()} />
      </main>
    </div>
  )
}
