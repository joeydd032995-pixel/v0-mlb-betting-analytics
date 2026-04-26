"use client"

import { HfRadar } from "@/components/diamond/HfRadar"
import { Panel } from "@/components/diamond/Panel"
import type { Pitcher } from "@/lib/types"

interface Props {
  pitcher: Pitcher
}

export function SituationalRadar({ pitcher }: Props) {
  const fi = pitcher.firstInning
  const data = [
    { subject: "vs RHB", A: fi.awayNrfiRate },
    { subject: "Home", A: fi.homeNrfiRate },
    { subject: "NRFI Overall", A: fi.nrfiRate },
    { subject: "Away", A: fi.awayNrfiRate },
    { subject: "vs LHB", A: fi.homeNrfiRate },
    { subject: "K%", A: Math.min(1, fi.kRate * 2.5) },
  ]

  return (
    <Panel title="Situational Profile" chip="1st inning">
      <HfRadar
        data={data}
        labelA={pitcher.name.split(" ").pop() ?? "Pitcher"}
      />
    </Panel>
  )
}
