import { describe, it, expect } from "vitest"
import { normalizeStatcastPitcher } from "../lib/api/statcast-normalize"
import { toPitchEntries } from "../lib/pitcher/pitch-mix-display"

// The DB `payload Json` column is untyped, so normalizeStatcastPitcher is the
// single guard that keeps malformed pitchMix/zoneWhiff out of the pitcher UI.
// toPitchEntries maps raw Statcast pitch codes to display rows for the donut.

const CORE = {
  fbVeloAvg: 95.2,
  fbSpinAvg: 2410,
  breaking_pct: 0.34,
  stuffPlus: 112.5,
}
const PITCH_MIX = [
  { code: "FF", usage: 0.52, velocityMph: 95.2 },
  { code: "SL", usage: 0.31, velocityMph: 86.1 },
  { code: "CH", usage: 0.17, velocityMph: 88.0 },
]
const ZONE_25 = Array.from({ length: 25 }, (_, i) => (i % 5) * 0.08)

describe("normalizeStatcastPitcher — core summary", () => {
  it("returns the core summary with no rich fields when only core is present", () => {
    const r = normalizeStatcastPitcher(CORE)
    expect(r).toEqual(CORE)
    expect(r).not.toHaveProperty("pitchMix")
    expect(r).not.toHaveProperty("zoneWhiff")
  })

  it("returns null when a core field is missing or non-finite", () => {
    const { stuffPlus: _stuffPlus, ...partial } = CORE
    expect(normalizeStatcastPitcher(partial)).toBeNull()
    expect(normalizeStatcastPitcher({ ...CORE, fbVeloAvg: NaN })).toBeNull()
    expect(normalizeStatcastPitcher(null)).toBeNull()
    expect(normalizeStatcastPitcher([])).toBeNull()
  })
})

describe("normalizeStatcastPitcher — pitchMix", () => {
  it("passes through a valid pitchMix", () => {
    const r = normalizeStatcastPitcher({ ...CORE, pitchMix: PITCH_MIX })
    expect(r?.pitchMix).toEqual(PITCH_MIX)
  })

  it("drops individual entries with non-finite usage or velocity, keeps the rest", () => {
    const r = normalizeStatcastPitcher({
      ...CORE,
      pitchMix: [
        { code: "FF", usage: 0.6, velocityMph: 95 },
        { code: "SL", usage: NaN, velocityMph: 86 },
        { code: "CH", usage: 0.4, velocityMph: Infinity },
      ],
    })
    expect(r?.pitchMix).toEqual([{ code: "FF", usage: 0.6, velocityMph: 95 }])
  })

  it("omits pitchMix entirely when empty or all entries are invalid", () => {
    expect(normalizeStatcastPitcher({ ...CORE, pitchMix: [] })).not.toHaveProperty("pitchMix")
    expect(
      normalizeStatcastPitcher({ ...CORE, pitchMix: [{ code: "FF", usage: NaN, velocityMph: NaN }] })
    ).not.toHaveProperty("pitchMix")
  })

  it("omits pitchMix when it isn't an array", () => {
    expect(normalizeStatcastPitcher({ ...CORE, pitchMix: "nope" })).not.toHaveProperty("pitchMix")
  })
})

describe("normalizeStatcastPitcher — zoneWhiff", () => {
  it("passes through a length-25 finite array", () => {
    const r = normalizeStatcastPitcher({ ...CORE, zoneWhiff: ZONE_25 })
    expect(r?.zoneWhiff).toEqual(ZONE_25)
  })

  it("omits zoneWhiff when length ≠ 25", () => {
    expect(normalizeStatcastPitcher({ ...CORE, zoneWhiff: [0.1, 0.2, 0.3] })).not.toHaveProperty("zoneWhiff")
  })

  it("omits zoneWhiff when any cell is non-finite", () => {
    const bad = [...ZONE_25]
    bad[12] = NaN
    expect(normalizeStatcastPitcher({ ...CORE, zoneWhiff: bad })).not.toHaveProperty("zoneWhiff")
  })
})

describe("toPitchEntries", () => {
  it("maps known codes to display names and colors, preserving order and values", () => {
    const entries = toPitchEntries(PITCH_MIX)
    expect(entries.map((e) => e.name)).toEqual(["Four-Seam FB", "Slider", "Changeup"])
    expect(entries[0].usage).toBe(0.52)
    expect(entries[0].velocityMph).toBe(95.2)
    expect(entries[0].color).toMatch(/^var\(--ds-/)
  })

  it("falls back to the uppercased code and neutral color for unknown codes", () => {
    const entries = toPitchEntries([{ code: "xx", usage: 1, velocityMph: 80 }])
    expect(entries[0].name).toBe("XX")
    expect(entries[0].color).toBe("var(--ds-muted)")
  })
})
