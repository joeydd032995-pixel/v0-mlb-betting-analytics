import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { SectionLabel } from "@/components/diamond/SectionLabel"
import { HistoryClient } from "@/components/history/HistoryClient"
import type { TrackedPrediction } from "@/lib/prediction-store"

export default async function HistoryPage() {
  const { userId } = await auth()
  let dbPredictions: TrackedPrediction[] = []

  if (userId) {
    try {
      const rows = await prisma.modelPrediction.findMany({
        where: { OR: [{ userId }, { userId: null }] },
        orderBy: { createdAt: "desc" },
        take: 2000,
      })

      dbPredictions = rows.map((r) => ({
        id:             r.id,
        date:           r.date,
        homeTeam:       r.homeTeam,
        awayTeam:       r.awayTeam,
        homeTeamId:     "",
        awayTeamId:     "",
        homePitcher:    r.homePitcher,
        awayPitcher:    r.awayPitcher,
        venue:          "",
        nrfiProbability: r.nrfiProbability,
        yrfiProbability: 1 - r.nrfiProbability,
        prediction:     r.prediction as "NRFI" | "YRFI",
        confidence:     r.confidence as TrackedPrediction["confidence"],
        confidenceScore: r.confidenceScore,
        poissonNrfi:    r.poissonNrfi,
        zipNrfi:        r.zipNrfi,
        markovNrfi:     r.markovNrfi,
        mapreNrfi:      r.mapreNrfi ?? undefined,
        ensembleNrfi:   r.ensembleNrfi,
        modelConsensus: r.modelConsensus,
        // ZIP / Bayesian diagnostics still come from the modelBreakdown blob (no flat
        // columns for these yet; may be absent for older rows).
        homeZipOmega:       (r.modelBreakdown as Record<string, number> | null)?.homeZipOmega ?? 0,
        awayZipOmega:       (r.modelBreakdown as Record<string, number> | null)?.awayZipOmega ?? 0,
        homeBayesianWeight: (r.modelBreakdown as Record<string, number> | null)?.homeBayesianWeight ?? 0,
        awayBayesianWeight: (r.modelBreakdown as Record<string, number> | null)?.awayBayesianWeight ?? 0,
        // Read from the flat columns, not modelBreakdown — that blob's shape varies
        // by write path (historical-sync never sets it; the prediction agent stores
        // nrfi-engine's raw nested homeHalfInning/awayHalfInning shape, not these
        // flat keys), so the flat columns are the only reliable source here.
        logisticMetaNrfi:      r.logisticMetaNrfi      ?? undefined,
        nnInteractionNrfi:     r.nnInteractionNrfi     ?? undefined,
        hierarchicalBayesNrfi: r.hierarchicalBayesNrfi ?? undefined,
        modelInputs: (r.modelBreakdown as { modelInputs?: TrackedPrediction["modelInputs"] } | null)?.modelInputs ?? {
          homePitcherNrfiRate: 0, awayPitcherNrfiRate: 0,
          homeOffenseFactor: 1,   awayOffenseFactor: 1,
          parkFactor: 1,          weatherMultiplier: 1,
          recentFormMultiplier: 1,
          homePitcherStarts: 0,   awayPitcherStarts: 0,
          temperatureF: 72,       windSpeed: 5,
          windDirection: "unknown", conditions: "clear",
        },
        status:       r.status === "complete" ? "complete" : "pending",
        savedAt:      r.createdAt.toISOString(),
        actualResult: r.actualResult as "NRFI" | "YRFI" | undefined,
        correct:      r.correct ?? undefined,
      }))
    } catch (err) {
      console.error("[history] DB query failed — falling back to localStorage only:", err)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--ds-bg)" }}>
      <main className="mx-auto max-w-[1480px] px-7 py-7 space-y-6">
        <SectionLabel index="01">Prediction History</SectionLabel>
        <HistoryClient dbPredictions={dbPredictions} />
      </main>
    </div>
  )
}
