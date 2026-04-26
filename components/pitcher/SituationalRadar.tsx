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
    { subject: "Home", A: fi.homeNrfiRate },
    { subject: "NRFI Overall", A: fi.nrfiRate },
    { subject: "Away", A: fi.awayNrfiRate },
    { subject: "K%", A: Math.min(1, fi.kRate * 2.5) },
    { subject: "WHIP−", A: Math.max(0, 1 - fi.whip / 2) },
    { subject: "ERA−", A: Math.max(0, 1 - fi.era / 9) },
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
