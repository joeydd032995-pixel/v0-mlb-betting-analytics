import { auth } from "@clerk/nextjs/server"
import { SectionLabel } from "@/components/diamond/SectionLabel"
import { HistoryClient } from "@/components/history/HistoryClient"
import { loadDbTrackedPredictions, TRACKED_PREDICTION_CAP } from "@/lib/server/tracked-predictions"
import type { TrackedPrediction } from "@/lib/prediction-store"

export default async function HistoryPage() {
  const { userId } = await auth()

  let dbPredictions: TrackedPrediction[] = []
  let totalAvailable = 0

  if (userId) {
    try {
      const loaded = await loadDbTrackedPredictions(userId)
      dbPredictions  = loaded.rows
      totalAvailable = loaded.totalAvailable
    } catch (err) {
      console.error("[history] DB query failed — falling back to localStorage only:", err)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--ds-bg)" }}>
      <main className="mx-auto max-w-[1480px] px-7 py-7 space-y-6">
        <SectionLabel index="01">Prediction History</SectionLabel>
        <HistoryClient
          dbPredictions={dbPredictions}
          dbTotalAvailable={totalAvailable}
          dbCap={TRACKED_PREDICTION_CAP}
        />
      </main>
    </div>
  )
}
