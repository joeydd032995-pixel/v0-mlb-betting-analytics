import { describe, it, expect } from "vitest"
import { normalizeStatcastPitcher } from "../lib/api/statcast-normalize"

// The `payload Json` column is untyped at the DB boundary, so the normalizer is
// the single guard that keeps malformed rows from injecting NaN/undefined into
// the DeepNRFI feature vector. Each test pins one concept.

const VALID_FULL = {
  fbVeloAvg: 95.2,
  fbSpinAvg: 2410,
  breaking_pct: 0.34,
  stuffPlus: 112.5,
  releaseHeight: 6.1,
  releaseSide: -1.8,
}

describe("normalizeStatcastPitcher", () => {
  it("returns all six fields for a complete, finite payload", () => {
    expect(normalizeStatcastPitcher(VALID_FULL)).toEqual(VALID_FULL)
  })

  it("returns only the four core fields when release fields are absent", () => {
    const { releaseHeight, releaseSide, ...core } = VALID_FULL
    const result = normalizeStatcastPitcher(core)
    expect(result).toEqual(core)
    expect(result).not.toHaveProperty("releaseHeight")
    expect(result).not.toHaveProperty("releaseSide")
  })

  it("drops a non-finite release field but keeps the core summary", () => {
    const result = normalizeStatcastPitcher({ ...VALID_FULL, releaseHeight: null, releaseSide: NaN })
    expect(result).not.toBeNull()
    expect(result).not.toHaveProperty("releaseHeight")
    expect(result).not.toHaveProperty("releaseSide")
    expect(result?.stuffPlus).toBe(112.5)
  })

  it("returns null when a core field is missing", () => {
    const { stuffPlus, ...partial } = VALID_FULL
    expect(normalizeStatcastPitcher(partial)).toBeNull()
  })

  it("returns null when a core field is non-finite", () => {
    expect(normalizeStatcastPitcher({ ...VALID_FULL, fbVeloAvg: NaN })).toBeNull()
    expect(normalizeStatcastPitcher({ ...VALID_FULL, fbSpinAvg: "2400" })).toBeNull()
    expect(normalizeStatcastPitcher({ ...VALID_FULL, breaking_pct: Infinity })).toBeNull()
  })

  it("returns null for null, undefined, and non-object input", () => {
    expect(normalizeStatcastPitcher(null)).toBeNull()
    expect(normalizeStatcastPitcher(undefined)).toBeNull()
    expect(normalizeStatcastPitcher("not an object")).toBeNull()
    expect(normalizeStatcastPitcher(42)).toBeNull()
    expect(normalizeStatcastPitcher([])).toBeNull()
  })

  it("ignores unknown keys and still returns the summary", () => {
    const result = normalizeStatcastPitcher({ ...VALID_FULL, k_pct: 0.28, garbage: "x" })
    expect(result).toEqual(VALID_FULL)
    expect(result).not.toHaveProperty("k_pct")
    expect(result).not.toHaveProperty("garbage")
  })
})
