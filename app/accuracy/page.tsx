import { auth } from "@clerk/nextjs/server"
import { SectionLabel } from "@/components/diamond/SectionLabel"
import { AccuracyClient } from "@/components/accuracy/AccuracyClient"
import { loadDbTrackedPredictions, TRACKED_PREDICTION_CAP } from "@/lib/server/tracked-predictions"
import { FINAL_BLEND_CONTRACT } from "@/lib/nrfi-engine"
import type { TrackedPrediction } from "@/lib/prediction-store"

export default async function AccuracyPage() {
  const { userId } = await auth()

  // Fetch DB predictions for the authenticated user.
  // These are passed to the Client Component to merge with localStorage,
  // providing cross-device accuracy data and backfilling settled results.
  let dbPredictions: TrackedPrediction[] = []
  let totalAvailable = 0

  if (userId) {
    try {
      const loaded = await loadDbTrackedPredictions(userId)
      dbPredictions  = loaded.rows
      totalAvailable = loaded.totalAvailable
    } catch (err) {
      console.error("[accuracy] DB query failed — falling back to localStorage only:", err)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--ds-bg)" }}>
      <main className="mx-auto max-w-[1480px] px-7 py-7 space-y-6">
        <SectionLabel index="01">Accuracy Dashboard</SectionLabel>
        <AccuracyClient
          dbPredictions={dbPredictions}
          dbTotalAvailable={totalAvailable}
          dbCap={TRACKED_PREDICTION_CAP}
          clampRange={[FINAL_BLEND_CONTRACT.clampMin, FINAL_BLEND_CONTRACT.clampMax]}
          leagueBaseline={FINAL_BLEND_CONTRACT.leagueAnchor}
        />
      </main>
    </div>
  )
}
