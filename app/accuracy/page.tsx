"use client"

import { useEffect, useState } from "react"
import { AccuracyDashboard } from "@/components/accuracy-dashboard"
import { AccuracyCharts } from "@/components/accuracy/AccuracyCharts"
import { SectionLabel } from "@/components/diamond/SectionLabel"
import { KpiCard } from "@/components/diamond/KpiCard"
import {
  loadTrackedPredictions,
  computeExtendedAccuracy,
  type ExtendedModelAccuracy,
} from "@/lib/prediction-store"

export default function AccuracyPage() {
  const [accuracy, setAccuracy] = useState<ExtendedModelAccuracy | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const predictions = loadTrackedPredictions()
    const computed = computeExtendedAccuracy(predictions)
    setAccuracy(computed)
    setLoading(false)
  }, [])

  return (
    <div className="min-h-screen" style={{ background: "var(--ds-bg)" }}>
      <main className="mx-auto max-w-[1480px] px-7 py-7 space-y-6">
        <SectionLabel index="01">Accuracy Dashboard</SectionLabel>

        {loading ? (
          <div
            className="rounded-[14px] border border-ds-line p-8 text-center"
            style={{ background: "var(--ds-panel)" }}
          >
            <p className="font-jet text-[12px] text-ds-muted">Loading accuracy data…</p>
          </div>
        ) : accuracy ? (
          <>
            {/* KPI summary row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                metric="Overall Accuracy"
                value={`${(accuracy.accuracy * 100).toFixed(1)}%`}
                delta={`${accuracy.totalTracked} bets`}
                variant="cy"
              />
              <KpiCard
                metric="NRFI Accuracy"
                value={accuracy.nrfiTotal > 0 ? `${((accuracy.nrfiCorrect / accuracy.nrfiTotal) * 100).toFixed(1)}%` : "—"}
                delta={`${accuracy.nrfiTotal} tracked`}
                variant="gr"
              />
              <KpiCard
                metric="High-Conf Accuracy"
                value={accuracy.highConfTotal > 0 ? `${((accuracy.highConfCorrect / accuracy.highConfTotal) * 100).toFixed(1)}%` : "—"}
                delta={`${accuracy.highConfTotal} bets`}
                variant="bl"
              />
              <KpiCard
                metric="Flat-Stake P/L"
                value={`${accuracy.highConfPnL >= 0 ? "+" : ""}${accuracy.highConfPnL.toFixed(2)}u`}
                delta="High-conf only"
                deltaPositive={accuracy.highConfPnL >= 0}
                variant="cy"
              />
            </div>

            {/* Diamond Stats analytics charts */}
            <SectionLabel index="02">Model Analytics</SectionLabel>
            <AccuracyCharts accuracy={accuracy} />

            {/* Existing accuracy dashboard */}
            <SectionLabel index="03">Detailed Breakdown</SectionLabel>
            <AccuracyDashboard accuracy={accuracy} />
          </>
        ) : null}
      </main>
    </div>
  )
}
