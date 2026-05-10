"use client"

/**
 * EnsembleVersionBreakdown — server-data view for v1 vs v2 (Ensemble++)
 * accuracy and Brier score, plus a model-conviction bucket view.
 *
 * Reads from `/api/performance` so it shows real, DB-backed numbers (the
 * existing AccuracyDashboard reads from localStorage TrackedPredictions).
 */

import { useEffect, useState } from "react"
import { Layers } from "lucide-react"
import { cn } from "@/lib/utils"

interface VersionGroup {
  total:    number
  correct:  number
  accuracy: number
  brier:    number
}
interface EdgeBucket extends VersionGroup {
  key:   string
  label: string
  lo:    number
  hi:    number
}
interface PerformanceResponse {
  hasData?:      boolean
  byVersion?:    { v1: VersionGroup | null; v2: VersionGroup | null }
  byEdgeBucket?: EdgeBucket[]
}

function pct(n: number, decimals = 1) {
  return `${(n * 100).toFixed(decimals)}%`
}

function VersionCard({ label, group, accent }: { label: string; group: VersionGroup | null; accent: "sky" | "fuchsia" }) {
  const accentClass =
    accent === "fuchsia"
      ? "border-fuchsia-500/30 bg-fuchsia-500/5"
      : "border-sky-500/30 bg-sky-500/5"
  const headerClass = accent === "fuchsia" ? "text-fuchsia-300" : "text-sky-300"

  if (!group || group.total === 0) {
    return (
      <div className={cn("rounded-md border p-3 text-xs", accentClass)}>
        <p className={cn("font-semibold mb-1", headerClass)}>{label}</p>
        <p className="text-muted-foreground">No completed predictions on this version yet.</p>
      </div>
    )
  }

  return (
    <div className={cn("rounded-md border p-3", accentClass)}>
      <p className={cn("text-xs font-semibold mb-2", headerClass)}>{label}</p>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Accuracy</p>
          <p className="text-base font-bold tabular-nums">{pct(group.accuracy)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Brier</p>
          <p className="text-base font-bold tabular-nums">{group.brier.toFixed(3)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">N</p>
          <p className="text-base font-bold tabular-nums">{group.total}</p>
        </div>
      </div>
    </div>
  )
}

export function EnsembleVersionBreakdown() {
  const [data, setData] = useState<PerformanceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/performance")
      .then((r) => r.json())
      .then((json: PerformanceResponse) => {
        if (cancelled) return
        setData(json)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="rounded-md border border-border/30 bg-card/50 p-3 text-xs text-muted-foreground">
        Loading Ensemble++ breakdown…
      </div>
    )
  }
  if (error || !data || !data.hasData) {
    return (
      <div className="rounded-md border border-border/30 bg-card/50 p-3 text-xs text-muted-foreground">
        {error ?? "No completed predictions yet."}
      </div>
    )
  }

  const v1 = data.byVersion?.v1 ?? null
  const v2 = data.byVersion?.v2 ?? null
  const buckets = data.byEdgeBucket ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-fuchsia-300">
        <Layers className="h-3.5 w-3.5" />
        Ensemble version comparison
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <VersionCard label="v1.7models · legacy 7-model" group={v1} accent="sky" />
        <VersionCard label="v2.9models · Ensemble++"     group={v2} accent="fuchsia" />
      </div>

      {buckets.length > 0 && (
        <div className="rounded-md border border-border/30 bg-card/50 p-3">
          <p className="mb-2 text-xs font-semibold">By model conviction (|p − 0.50|)</p>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left font-normal pb-1.5">Bucket</th>
                <th className="text-right font-normal pb-1.5">N</th>
                <th className="text-right font-normal pb-1.5">Accuracy</th>
                <th className="text-right font-normal pb-1.5">Brier</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.key} className="border-t border-border/20">
                  <td className="py-1.5">{b.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{b.total}</td>
                  <td className="py-1.5 text-right tabular-nums">{b.total > 0 ? pct(b.accuracy) : "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">{b.total > 0 ? b.brier.toFixed(3) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Without per-game odds we bucket by deviation from the 50/50 split as a model-conviction proxy.
          </p>
        </div>
      )}
    </div>
  )
}
