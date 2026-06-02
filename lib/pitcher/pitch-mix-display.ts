/**
 * Maps raw Statcast `pitch_type` codes to the display shape the PitchMixDonut
 * renders (name + color), passing usage/velocity through. Pure — no I/O.
 */

import type { StatcastPitchType } from "@/lib/types"

interface PitchEntry {
  name: string
  usage: number
  velocityMph?: number
  color: string
}

const FALLBACK_COLOR = "var(--ds-muted)"

// Covers the common Statcast pitch_type codes; any code not listed (incl.
// PO/FO pitchouts that survive upstream filtering, or new codes) uses the
// neutral fallback. Ref: https://beanumber.github.io/abdwr3e/C_statcast.html
const PITCH_META: Record<string, { name: string; color: string }> = {
  FF: { name: "Four-Seam FB", color: "var(--ds-cy)" },
  SI: { name: "Sinker", color: "var(--ds-cy)" },
  FC: { name: "Cutter", color: "var(--ds-cy)" },
  FA: { name: "Fastball", color: "var(--ds-cy)" },
  FS: { name: "Splitter", color: "var(--ds-gr)" },
  CH: { name: "Changeup", color: "var(--ds-gr)" },
  SL: { name: "Slider", color: "var(--ds-bl)" },
  ST: { name: "Sweeper", color: "var(--ds-bl)" },
  SV: { name: "Slurve", color: "var(--ds-bl)" },
  CU: { name: "Curveball", color: "var(--ds-warn)" },
  KC: { name: "Knuckle-Curve", color: "var(--ds-warn)" },
  SC: { name: "Screwball", color: "var(--ds-warn)" },
  KN: { name: "Knuckleball", color: FALLBACK_COLOR },
  EP: { name: "Eephus", color: FALLBACK_COLOR },
}

/** Convert stored pitch-mix rows into renderable donut entries, order preserved. */
export function toPitchEntries(pitchMix: StatcastPitchType[]): PitchEntry[] {
  return pitchMix.map((p) => {
    const meta = PITCH_META[p.code] ?? { name: p.code.toUpperCase(), color: FALLBACK_COLOR }
    return { name: meta.name, color: meta.color, usage: p.usage, velocityMph: p.velocityMph }
  })
}
