"use client"

import { HfLog } from "@/components/diamond/HfLog"
import { Panel } from "@/components/diamond/Panel"
import type { Pitcher } from "@/lib/types"

interface Props {
  pitcher: Pitcher
}

export function GameLogGrid({ pitcher }: Props) {
  const fi = pitcher.firstInning

  // result "W" = NRFI (no run scored in 1st), "L" = YRFI (run scored)
  const games = fi.last5Results.map((nrfi, i) => ({
    result: (nrfi ? "W" : "L") as "W" | "L",
    isShutout: nrfi && (fi.last5RunsAllowed[i] ?? 0) === 0,
    score: fi.last5RunsAllowed[i] !== undefined
      ? `${fi.last5RunsAllowed[i] === 0 ? "NRFI" : `YRFI (${fi.last5RunsAllowed[i]} R)`}`
      : undefined,
  }))

  return (
    <Panel title="Game Log — 1st Inning" chip={`Last ${games.length} starts`}>
      {games.length > 0 ? (
        <HfLog games={games} />
      ) : (
        <p className="font-jet text-[12px] text-ds-muted text-center py-8">No game log data</p>
      )}
    </Panel>
  )
}
