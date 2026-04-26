"use client"

import { useState } from "react"
import { RosterCard } from "@/components/diamond/RosterCard"
import { CmpGrid } from "@/components/diamond/CmpGrid"
import type { Pitcher } from "@/lib/types"

interface Props {
  pitchers: Pitcher[]
}

export function RosterGrid({ pitchers }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [compare, setCompare] = useState<string | null>(null)

  const pitcherA = pitchers.find(p => p.id === selected)
  const pitcherB = pitchers.find(p => p.id === compare)

  const handleClick = (id: string) => {
    if (!selected) {
      setSelected(id)
    } else if (id === selected) {
      setSelected(compare)
      setCompare(null)
    } else if (!compare) {
      setCompare(id)
    } else {
      setCompare(id)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
        {pitchers.map(p => {
          const initials = p.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
          return (
            <RosterCard
              key={p.id}
              initials={initials}
              name={p.name}
              role={p.firstInning.startCount > 3 ? "Starter" : "Reliever"}
              value={p.firstInning.era.toFixed(2)}
              valueLabel="ERA"
              tag={p.firstInning.nrfiRate > 0.72 ? "NRFI+" : undefined}
              selected={p.id === selected}
              compare={p.id === compare}
              onClick={() => handleClick(p.id)}
            />
          )
        })}
      </div>

      {pitcherA && pitcherB && (
        <div
          className="rounded-[14px] border border-ds-line p-4"
          style={{ background: "linear-gradient(180deg, var(--ds-panel), var(--ds-panel-2))" }}
        >
          <div className="font-jet text-[10px] uppercase tracking-[0.2em] text-ds-muted mb-3">
            Head-to-Head Comparison
          </div>
          <CmpGrid
            nameA={pitcherA.name.split(" ").pop() ?? "A"}
            nameB={pitcherB.name.split(" ").pop() ?? "B"}
            items={[
              { label: "ERA (1st)",  valueA: pitcherA.firstInning.era.toFixed(2),   valueB: pitcherB.firstInning.era.toFixed(2),   fracA: (pitcherA.firstInning.era + pitcherB.firstInning.era) > 0 ? 1 - pitcherA.firstInning.era / (pitcherA.firstInning.era + pitcherB.firstInning.era) : 0.5 },
              { label: "K%",        valueA: `${(pitcherA.firstInning.kRate * 100).toFixed(1)}%`, valueB: `${(pitcherB.firstInning.kRate * 100).toFixed(1)}%` },
              { label: "WHIP",      valueA: pitcherA.firstInning.whip.toFixed(3),   valueB: pitcherB.firstInning.whip.toFixed(3),  fracA: (pitcherA.firstInning.whip + pitcherB.firstInning.whip) > 0 ? 1 - pitcherA.firstInning.whip / (pitcherA.firstInning.whip + pitcherB.firstInning.whip) : 0.5 },
              { label: "NRFI Rate", valueA: `${(pitcherA.firstInning.nrfiRate * 100).toFixed(1)}%`, valueB: `${(pitcherB.firstInning.nrfiRate * 100).toFixed(1)}%` },
              { label: "Starts",    valueA: pitcherA.firstInning.startCount, valueB: pitcherB.firstInning.startCount },
            ]}
          />
          <p className="font-jet text-[10px] text-ds-muted mt-3">
            Click another pitcher to change comparison. Click a selected pitcher to deselect.
          </p>
        </div>
      )}

      {pitcherA && !pitcherB && (
        <p className="font-jet text-[11px] text-ds-muted text-center py-2">
          Click a second pitcher to compare
        </p>
      )}
    </div>
  )
}
