/**
 * Guards on lib/anchor-eras.ts — the table saying which final-blend pipeline
 * wrote a stored prediction.
 *
 * The load-bearing test here is "the newest era's anchor equals LEAGUE_AVG_NRFI".
 * Every era's anchor is a frozen literal on purpose (an era describes rows
 * already written, so it must not follow a constant that moves underneath it),
 * which means re-estimating the league rate without appending a new era would
 * otherwise go unnoticed and silently mis-invert every row written afterwards.
 * That assertion turns it into a CI failure with an obvious remedy.
 */

import { describe, it, expect } from "vitest"
import {
  ANCHOR_ERAS,
  AUDIT_FIX_AT,
  CLAMP_MAX,
  CLAMP_MIN,
  CURRENT_ERA,
  ENSEMBLE_BLEND,
  LEAGUE_RECAL_AT,
  describeEraAssignment,
  eraForContentDate,
  invertFinalForEra,
  knotInverse,
  PRE_AUDIT_KNOTS,
} from "@/lib/anchor-eras"
import { LEAGUE_AVG_NRFI } from "@/lib/nrfi-models"
import { FINAL_BLEND_CONTRACT } from "@/lib/nrfi-engine"

describe("anchor-era table", () => {
  it("the newest era's anchor is the engine's current league rate", () => {
    // If this fails you changed LEAGUE_AVG_NRFI without appending an era.
    // Append one: freeze the outgoing value as the previous era's anchor, set
    // the new era's `from` to the deploy time, and leave its `to` null.
    // Do NOT "fix" this by making the era anchor read LEAGUE_AVG_NRFI — that
    // defeats the point, because rows already written kept the old anchor.
    expect(CURRENT_ERA.anchor).toBe(LEAGUE_AVG_NRFI)
    expect(CURRENT_ERA.to).toBeNull()
  })

  it("agrees with the engine's live final-blend contract", () => {
    expect(ENSEMBLE_BLEND).toBe(FINAL_BLEND_CONTRACT.ensembleBlend)
    expect(CLAMP_MIN).toBe(FINAL_BLEND_CONTRACT.clampMin)
    expect(CLAMP_MAX).toBe(FINAL_BLEND_CONTRACT.clampMax)
    expect(CURRENT_ERA.anchor).toBe(FINAL_BLEND_CONTRACT.leagueAnchor)
  })

  it("is contiguous, ordered and open at both ends", () => {
    expect(ANCHOR_ERAS[0].from).toBeNull()
    expect(ANCHOR_ERAS[ANCHOR_ERAS.length - 1].to).toBeNull()
    for (let i = 0; i < ANCHOR_ERAS.length - 1; i++) {
      const a = ANCHOR_ERAS[i]
      const b = ANCHOR_ERAS[i + 1]
      expect(a.to, `era ${a.id} must end where ${b.id} begins`).not.toBeNull()
      expect(a.to!.getTime()).toBe(b.from!.getTime())
    }
  })

  it("has distinct ids and no two eras claiming the same anchor", () => {
    const ids = ANCHOR_ERAS.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    const anchors = ANCHOR_ERAS.map((e) => e.anchor)
    expect(new Set(anchors).size, "two eras with one anchor is a merge, not an era")
      .toBe(anchors.length)
  })

  it("assigns a content date to exactly one era, on both sides of each boundary", () => {
    const ms = 1
    for (const boundary of [AUDIT_FIX_AT, LEAGUE_RECAL_AT]) {
      const before = eraForContentDate(new Date(boundary.getTime() - ms))
      const atOrAfter = eraForContentDate(boundary)
      expect(before.id).not.toBe(atOrAfter.id)
      // `from` is inclusive, `to` exclusive — a row written exactly at the
      // boundary belongs to the NEW era.
      expect(atOrAfter.from!.getTime()).toBe(boundary.getTime())
    }
    expect(eraForContentDate(new Date("2020-01-01T00:00:00Z")).id).toBe("PRE_AUDIT")
    expect(eraForContentDate(new Date("2099-01-01T00:00:00Z")).id).toBe(CURRENT_ERA.id)
  })
})

describe("per-era inversion", () => {
  it("round-trips an identity-knot era exactly inside the clamp window", () => {
    for (const era of ANCHOR_ERAS.filter((e) => e.knots === null)) {
      for (let raw = 0.10; raw <= 0.951; raw += 0.05) {
        const final = ENSEMBLE_BLEND * raw + (1 - ENSEMBLE_BLEND) * era.anchor
        if (final <= CLAMP_MIN || final >= CLAMP_MAX) continue
        expect(invertFinalForEra(final, era)).toBeCloseTo(raw, 12)
      }
    }
  })

  it("round-trips the pre-audit era through its knot table", () => {
    const era = ANCHOR_ERAS.find((e) => e.id === "PRE_AUDIT")!
    expect(era.knots).not.toBeNull()
    const knotPredict = (knots: readonly [number, number][], x: number): number => {
      if (x <= knots[0][0]) return knots[0][1]
      for (let i = 0; i < knots.length - 1; i++) {
        const [x0, y0] = knots[i]
        const [x1, y1] = knots[i + 1]
        if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
      }
      return knots[knots.length - 1][1]
    }
    for (let raw = 0.15; raw <= 0.901; raw += 0.05) {
      const cal = knotPredict(PRE_AUDIT_KNOTS, raw)
      const final = ENSEMBLE_BLEND * cal + (1 - ENSEMBLE_BLEND) * era.anchor
      if (final <= CLAMP_MIN || final >= CLAMP_MAX) continue
      expect(invertFinalForEra(final, era)).toBeCloseTo(raw, 8)
    }
  })

  it("inverting with the WRONG era shifts raw by the anchor gap over the blend", () => {
    // The quantity the Codex P2 finding named: a row written under one anchor
    // and inverted with another is off by (1−β)(Δanchor)/β. Pinning it keeps
    // the error quantified rather than merely described in a comment.
    const post = ANCHOR_ERAS.find((e) => e.id === "POST_AUDIT")!
    const recal = ANCHOR_ERAS.find((e) => e.id === "POST_RECAL")!
    const raw = 0.55
    const writtenByRecal = ENSEMBLE_BLEND * raw + (1 - ENSEMBLE_BLEND) * recal.anchor
    const misInverted = invertFinalForEra(writtenByRecal, post)
    const expectedShift =
      ((1 - ENSEMBLE_BLEND) * (recal.anchor - post.anchor)) / ENSEMBLE_BLEND
    expect(misInverted - raw).toBeCloseTo(expectedShift, 12)
    expect(expectedShift).toBeCloseTo(-0.0032842, 6)
  })

  it("maps a clamped final to the clamp boundary's preimage, not past it", () => {
    const era = CURRENT_ERA
    const lowerPreimage = (CLAMP_MIN - (1 - ENSEMBLE_BLEND) * era.anchor) / ENSEMBLE_BLEND
    expect(invertFinalForEra(CLAMP_MIN, era)).toBeCloseTo(lowerPreimage, 12)
  })

  it("knotInverse is monotone and saturates outside the knot range", () => {
    expect(knotInverse(PRE_AUDIT_KNOTS, -1)).toBe(PRE_AUDIT_KNOTS[0][0])
    expect(knotInverse(PRE_AUDIT_KNOTS, 2)).toBe(PRE_AUDIT_KNOTS[PRE_AUDIT_KNOTS.length - 1][0])
    let prev = -Infinity
    for (let y = 0; y <= 1.0001; y += 0.01) {
      const x = knotInverse(PRE_AUDIT_KNOTS, y)
      expect(x).toBeGreaterThanOrEqual(prev - 1e-12)
      prev = x
    }
  })
})

describe("era assignment report", () => {
  it("names every era and totals the counts", () => {
    const out = describeEraAssignment(new Map([["POST_AUDIT", 9000], ["POST_RECAL", 1000]]))
    for (const era of ANCHOR_ERAS) expect(out).toContain(era.id)
    expect(out).toContain("total 10000 rows")
    expect(out).toContain("90.0%")
    expect(out).toContain("10.0%")
    expect(out).toContain("n=0")           // PRE_AUDIT absent from the map
  })

  it("does not divide by zero on an empty run", () => {
    expect(() => describeEraAssignment(new Map())).not.toThrow()
    expect(describeEraAssignment(new Map())).toContain("total 0 rows")
  })
})
