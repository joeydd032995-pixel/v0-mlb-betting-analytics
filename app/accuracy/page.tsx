"use client"

import { useEffect, useState } from "react"
import { AccuracyDashboard } from "@/components/accuracy-dashboard"
import {
  loadTrackedPredictions,
  computeExtendedAccuracy,
  type ExtendedModelAccuracy,
} from "@/lib/prediction-store"
import { BarChart3 } from "lucide-react"

export default function AccuracyPage() {
  const [accuracy, setAccuracy] = useState<ExtendedModelAccuracy | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load tracked predictions from localStorage and compute accuracy
    const predictions = loadTrackedPredictions()
    const computed = computeExtendedAccuracy(predictions)
    setAccuracy(computed)
    setLoading(false)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Accuracy Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Track your NRFI/YRFI prediction performance and metrics over time.
              </p>
            </div>
          </div>
        </div>

        {/* Dashboard */}
        {loading ? (
          <div className="rounded-lg border border-border/30 bg-card/50 p-8 text-center">
            <p className="text-sm text-muted-foreground">Loading accuracy data...</p>
          </div>
        ) : accuracy ? (
          <AccuracyDashboard accuracy={accuracy} />
        ) : null}
      </main>
    </div>
  )
}
