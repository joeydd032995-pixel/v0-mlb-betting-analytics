/**
 * Audit-V2 regression guards (see AUDIT_REPORT_V2.md).
 *
 * Pins:
 *  1. The cross-language final-blend contract that
 *     scripts/deepnrfi/transforms.py inverts for training parity.
 *  2. Serving feature-vector invariants the training-set builder now mirrors
 *     (wind token domain, shrinkage chain, ensemble7 pre-anchor pass-through).
 *  3. The engine's realistic dynamic range — a correlated pitcher-quality
 *     sweep must stay monotone and must not collapse toward the anchor
 *     (compressed output ⇒ no resolution ⇒ Brier pinned at the base rate).
 */
import { describe, it, expect } from "vitest"
import { computeNRFIPrediction, FINAL_BLEND_CONTRACT } from "@/lib/nrfi-engine"
import {
  applyDynamicShrinkage,
  getDynamicPriorWeight,
  LEAGUE_AVG_NRFI,
} from "@/lib/nrfi-models"
import { buildDeepNrfiFeatures } from "@/lib/features/feature-vector"
import { makeGame, makePitcher, makeTeam } from "./fixtures"
import type { Pitcher, Weather } from "@/lib/types"

// ─── 1. Cross-language final-blend contract ───────────────────────────────────

describe("final-blend contract (mirrored by scripts/deepnrfi/transforms.py)", () => {
  it("constants match the Python transforms module", () => {
    // If this test fails you changed the engine's final blend — update
    // ENSEMBLE_BLEND / LEAGUE_ANCHOR / FINAL_CLAMP_* in transforms.py and
    // re-run scripts/deepnrfi/test_transforms.py before shipping.
    expect(FINAL_BLEND_CONTRACT).toEqual({
      ensembleBlend: 0.76,
      leagueAnchor:  LEAGUE_AVG_NRFI, // 0.516 under the identity calibration
      clampMin:      0.18,
      clampMax:      0.85,
    })
  })

  it("anchor inversion round-trips inside the clamp window", () => {
    const { ensembleBlend: b, leagueAnchor: a, clampMin, clampMax } = FINAL_BLEND_CONTRACT
    for (let cal = 0.1; cal <= 0.951; cal += 0.05) {
      const final = b * cal + (1 - b) * a
      if (final <= clampMin || final >= clampMax) continue
      const recovered = (final - (1 - b) * a) / b
      expect(recovered).toBeCloseTo(cal, 12)
    }
  })
})

// ─── 2. Serving feature-vector invariants ─────────────────────────────────────

function featureArgs(weather: Partial<Weather> = {}, ensemble7?: number) {
  const game = makeGame({
    weather: {
      temperature: 75, windSpeed: 12, windDirection: "out",
      conditions: "clear", humidity: 40, ...weather,
    } as Weather,
  })
  return {
    game,
    homePitcher: makePitcher("pitcher-home"),
    awayPitcher: makePitcher("pitcher-away"),
    homeTeam: makeTeam("team-home"),
    awayTeam: makeTeam("team-away"),
    ensemble7Nrfi: ensemble7,
  }
}

describe("serving feature-vector invariants (builder must match these)", () => {
  it("weather_wind_in_out is always a token in {−1, 0, +1}", () => {
    const dirs: Array<[Weather["windDirection"], number]> = [
      ["out", 1], ["in", -1], ["crosswind", 0], ["calm", 0],
    ]
    for (const [dir, expected] of dirs) {
      const { vector } = buildDeepNrfiFeatures(featureArgs({ windDirection: dir }))
      expect(vector.weather_wind_in_out).toBe(expected)
    }
    const dome = buildDeepNrfiFeatures(featureArgs({ conditions: "dome" }))
    expect(dome.vector.weather_wind_in_out).toBe(0)
  })

  it("shrunk_nrfi equals the applyDynamicShrinkage chain and stays in [0.35, 0.92]", () => {
    for (const [rate, starts] of [[0.60, 4], [0.72, 18], [0.88, 30]] as const) {
      const p = makePitcher("pitcher-home", { nrfiRate: rate, startCount: starts })
      const args = featureArgs()
      args.homePitcher = p
      const { vector } = buildDeepNrfiFeatures(args)
      const expected = applyDynamicShrinkage(p, getDynamicPriorWeight(p))
      expect(vector.home_pitcher_shrunk_nrfi).toBeCloseTo(expected, 12)
      expect(vector.home_pitcher_shrunk_nrfi).toBeGreaterThanOrEqual(0.35)
      expect(vector.home_pitcher_shrunk_nrfi).toBeLessThanOrEqual(0.92)
    }
  })

  it("ensemble7_nrfi passes through PRE-anchor (no blend applied) and defaults to the league rate", () => {
    const withValue = buildDeepNrfiFeatures(featureArgs({}, 0.643))
    expect(withValue.vector.ensemble7_nrfi).toBe(0.643)
    expect(withValue.presence.ensemble7_nrfi).toBe(1)
    const missing = buildDeepNrfiFeatures(featureArgs({}, undefined))
    expect(missing.vector.ensemble7_nrfi).toBe(LEAGUE_AVG_NRFI)
    expect(missing.presence.ensemble7_nrfi).toBe(0)
  })

  it("start_count is the season-scale startCount (not a windowed count)", () => {
    const p = makePitcher("pitcher-home", { startCount: 31 })
    const args = featureArgs()
    args.homePitcher = p
    const { vector } = buildDeepNrfiFeatures(args)
    expect(vector.home_pitcher_start_count).toBe(31)
  })
})

// ─── 3. Dynamic-range guard ───────────────────────────────────────────────────

/** Realistic co-varying pitcher archetype: q ∈ [0, 1], worst → best starter. */
function realPitcher(id: string, q: number): Pitcher {
  const p = makePitcher(id, {
    nrfiRate: 0.60 + 0.25 * q,
    startCount: 22,
    kRate: 0.16 + 0.14 * q,
  })
  p.firstInning.whip = 1.55 - 0.6 * q
  p.firstInning.bbRate = 0.115 - 0.05 * q
  p.firstInning.hrPer9 = 1.7 - 1.0 * q
  p.firstInning.era = 5.6 - 3.2 * q
  p.overall.era = 5.2 - 2.8 * q
  return p
}

describe("dynamic-range guard — output must not collapse toward the anchor", () => {
  it("correlated quality sweep is monotone with span in [0.12, 0.40]", () => {
    const game = makeGame({ date: "2026-06-15" })
    const teams = new Map([
      ["team-home", makeTeam("team-home")],
      ["team-away", makeTeam("team-away")],
    ])
    const probs: number[] = []
    for (let q = 0; q <= 1.001; q += 0.125) {
      const pred = computeNRFIPrediction(
        game,
        new Map([
          ["pitcher-home", realPitcher("pitcher-home", q)],
          ["pitcher-away", realPitcher("pitcher-away", q)],
        ]),
        teams,
      )
      expect(pred).not.toBeNull()
      probs.push(pred!.nrfiProbability)
    }
    for (let i = 1; i < probs.length; i++) {
      expect(probs[i]).toBeGreaterThanOrEqual(probs[i - 1] - 1e-12)
    }
    const span = probs[probs.length - 1] - probs[0]
    // Collapse below ~0.12 means predictions cluster at the anchor (no
    // resolution → Brier pinned at the base rate → no bettable signal).
    // Span above ~0.40 for this fixture family means an environment or
    // shrinkage layer stopped damping small-sample noise.
    expect(span).toBeGreaterThanOrEqual(0.12)
    expect(span).toBeLessThanOrEqual(0.40)
  })
})
