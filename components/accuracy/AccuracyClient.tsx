"use client"

import { useEffect, useState } from "react"
import { AccuracyDashboard } from "@/components/accuracy-dashboard"
import { AccuracyCharts } from "@/components/accuracy/AccuracyCharts"
import { KpiCard } from "@/components/diamond/KpiCard"
import { SectionLabel } from "@/components/diamond/SectionLabel"
import {
  loadTrackedPredictions,
  computeExtendedAccuracy,
  type TrackedPrediction,
  type ExtendedModelAccuracy,
} from "@/lib/prediction-store"

interface Props {
  /** Pre-fetched DB predictions (serialized from Server Component) */
  dbPredictions: TrackedPrediction[]
}

export function AccuracyClient({ dbPredictions }: Props) {
  const [accuracy, setAccuracy] = useState<ExtendedModelAccuracy | null>(null)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const local = loadTrackedPredictions()

    // Merge: DB rows are the baseline; localStorage wins on conflict (more recent).
    // Settled DB rows fill in results for predictions that are only pending locally.
    const localById = new Map(local.map((p) => [p.id, p]))
    const dbById    = new Map(dbPredictions.map((p) => [p.id, p]))

    const merged = new Map<string, TrackedPrediction>()

    // Start with DB rows
    for (const [id, dbRow] of dbById) {
      merged.set(id, dbRow)
    }
    // Override with local rows, but promote settled status from DB if local is still pending
    for (const [id, localRow] of localById) {
      const dbRow = dbById.get(id)
      if (dbRow && dbRow.status === "complete" && localRow.status === "pending") {
        // DB has a result that hasn't been applied locally yet — use DB version
        merged.set(id, dbRow)
      } else {
        merged.set(id, localRow)
      }
    }

    const all = [...merged.values()]
    setTotal(all.length)
    setAccuracy(computeExtendedAccuracy(all))
  }, [dbPredictions])

  if (!accuracy) {
    return (
      <div
        className="rounded-[14px] border border-ds-line p-8 text-center"
        style={{ background: "var(--ds-panel)" }}
      >
        <p className="font-jet text-[12px] text-ds-muted">Loading accuracy data…</p>
      </div>
    )
  }

  return (
    <>
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          metric="Overall Accuracy"
          value={`${(accuracy.accuracy * 100).toFixed(1)}%`}
          delta={`${total} tracked`}
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

      {/* Charts */}
      <SectionLabel index="02">Model Analytics</SectionLabel>
      <AccuracyCharts accuracy={accuracy} />

      {/* Detailed breakdown */}
      <SectionLabel index="03">Detailed Breakdown</SectionLabel>
      <AccuracyDashboard accuracy={accuracy} />
    </>
  )
}
