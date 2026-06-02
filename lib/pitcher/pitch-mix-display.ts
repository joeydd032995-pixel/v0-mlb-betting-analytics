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

// Four coarse buckets for the staff StackBars view. Codes not listed (incl.
// changeups, splitters, knuckleballs, and anything unrecognized) fall into `ch`
// so the four buckets stay collectively exhaustive.
const FB_CODES = new Set(["FF", "SI", "FC", "FA", "FT"])
const SL_CODES = new Set(["SL", "ST", "SV"])
const CB_CODES = new Set(["CU", "KC"])

type ArsenalBuckets = { fb: number; sl: number; cb: number; ch: number }

/**
 * Fold a full pitch arsenal into integer fb/sl/cb/ch percentages that sum to
 * exactly 100 (largest-remainder rounding). Returns all zeros for an empty
 * arsenal. Velocity is ignored — bucketing is by pitch type only.
 */
export function foldArsenalToBuckets(pitchMix: StatcastPitchType[]): ArsenalBuckets {
  const raw: ArsenalBuckets = { fb: 0, sl: 0, cb: 0, ch: 0 }
  let total = 0
  for (const p of pitchMix) {
    const code = p.code.toUpperCase()
    total += p.usage
    if (FB_CODES.has(code)) raw.fb += p.usage
    else if (SL_CODES.has(code)) raw.sl += p.usage
    else if (CB_CODES.has(code)) raw.cb += p.usage
    else raw.ch += p.usage
  }
  if (total <= 0) return { fb: 0, sl: 0, cb: 0, ch: 0 }

  const keys = ["fb", "sl", "cb", "ch"] as const
  const exact = keys.map((k) => ({ k, pct: (raw[k] / total) * 100 }))
  const out: ArsenalBuckets = { fb: 0, sl: 0, cb: 0, ch: 0 }
  let allocated = 0
  for (const { k, pct } of exact) {
    out[k] = Math.floor(pct)
    allocated += out[k]
  }
  // Hand the leftover points to the largest fractional remainders so Σ = 100.
  const byFrac = exact
    .map(({ k, pct }) => ({ k, frac: pct - Math.floor(pct) }))
    .sort((a, b) => b.frac - a.frac)
  for (let i = 0; allocated < 100 && i < byFrac.length; i++, allocated++) {
    out[byFrac[i].k] += 1
  }
  return out
}
