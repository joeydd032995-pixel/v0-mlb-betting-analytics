"use client"

import { useState } from "react"
import { RemoveWatchlistButton } from "./RemoveWatchlistButton"
import type { WatchlistPrediction } from "@/lib/types"

interface WatchlistRowProps {
  gameId: string
  added: string
  prediction: WatchlistPrediction | null
}

const CONFIDENCE_COLOR: Record<string, string> = {
  High:   "text-emerald-400",
  Medium: "text-amber-400",
  Low:    "text-ds-muted",
}

export function WatchlistRow({ gameId, added, prediction }: WatchlistRowProps) {
  const [removed, setRemoved] = useState(false)
  if (removed) return null

  const nrfiPct = prediction ? Math.round(prediction.nrfiProbability * 100) : null
  const confColor = prediction ? (CONFIDENCE_COLOR[prediction.confidence] ?? "text-ds-muted") : ""

  return (
    <tr className="border-b border-ds-line/50 last:border-0 hover:bg-white/[0.02]">
      {/* Matchup */}
      <td className="px-4 py-3">
        {prediction ? (
          <div>
            <span className="font-jet text-[12px] text-ds-fg">{prediction.awayTeam}</span>
            <span className="font-jet text-[10px] text-ds-muted mx-1">@</span>
            <span className="font-jet text-[12px] text-ds-fg">{prediction.homeTeam}</span>
          </div>
        ) : (
          <span className="font-jet text-[11px] text-ds-muted">{gameId}</span>
        )}
      </td>

      {/* Starters */}
      <td className="px-4 py-3 hidden sm:table-cell">
        {prediction ? (
          <div className="flex flex-col gap-0.5">
            <span className="font-jet text-[10px] text-ds-muted">{prediction.awayPitcher || "TBD"}</span>
            <span className="font-jet text-[10px] text-ds-muted">{prediction.homePitcher || "TBD"}</span>
          </div>
        ) : (
          <span className="font-jet text-[10px] text-ds-muted">—</span>
        )}
      </td>

      {/* NRFI % */}
      <td className="px-4 py-3">
        {nrfiPct !== null ? (
          <span className={`font-jet text-[12px] font-bold ${nrfiPct >= 55 ? "text-emerald-400" : nrfiPct >= 48 ? "text-ds-fg" : "text-rose-400"}`}>
            {nrfiPct}%
          </span>
        ) : (
          <span className="font-jet text-[10px] text-ds-muted">—</span>
        )}
      </td>

      {/* Signal (confidence + prediction) */}
      <td className="px-4 py-3 hidden md:table-cell">
        {prediction ? (
          <div className="flex items-center gap-1.5">
            <span className={`font-jet text-[10px] ${confColor}`}>{prediction.confidence}</span>
            <span className="font-jet text-[9px] text-ds-muted/50">·</span>
            <span className="font-jet text-[10px] text-ds-muted">{prediction.prediction}</span>
          </div>
        ) : (
          <span className="font-jet text-[10px] text-ds-muted">—</span>
        )}
      </td>

      {/* Added */}
      <td className="px-4 py-3 font-jet text-[11px] text-ds-muted">{added}</td>

      {/* Remove */}
      <td className="px-4 py-3 text-right">
        <RemoveWatchlistButton gameId={gameId} onRemoved={() => setRemoved(true)} />
      </td>
    </tr>
  )
}
