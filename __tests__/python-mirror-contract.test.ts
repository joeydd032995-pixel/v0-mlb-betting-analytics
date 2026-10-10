/**
 * Cross-language contract: the Python training pipeline restates TypeScript
 * constants because it cannot import them, and this test is what keeps the two
 * copies equal.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * scripts/deepnrfi/transforms.py carried the header "TS sources of truth (keep
 * in sync)" and __tests__/audit-v2-regression.test.ts carried the comment "If
 * this test fails you changed the engine's final blend — update transforms.py".
 * Neither is a test of Python. When LEAGUE_AVG_NRFI moved 0.516 → 0.5056 in
 * lib/nrfi-models.ts, the whole TS suite stayed green while transforms.py kept
 * the old value — reintroducing exactly the train/serve skew that module was
 * written to prevent (AUDIT_REPORT_V2.md V2-1).
 *
 * So this test parses the Python source and compares the numbers. A prose
 * instruction to a future maintainer is not a guard; this is.
 *
 * It reads the .py files as text rather than executing them, so it needs no
 * Python interpreter and runs in the normal vitest node environment.
 */

import { describe, it, expect } from "vitest"
import * as fs from "node:fs"
import * as path from "node:path"
import { LEAGUE_AVG_NRFI, LEAGUE_HALF_NRFI, getDynamicPriorWeight } from "@/lib/nrfi-models"
import { FINAL_BLEND_CONTRACT } from "@/lib/nrfi-engine"
import { SERVING_FEATURE_CONTRACT_VERSION } from "@/lib/features/feature-vector"
import { LEAGUE_FIRST_INNING_RUNS_PER_HALF } from "@/lib/api/shared-helpers"
import { makePitcher } from "./fixtures"

const DEEPNRFI = path.resolve(__dirname, "../scripts/deepnrfi")
const transformsSrc = fs.readFileSync(path.join(DEEPNRFI, "transforms.py"), "utf8")
const builderSrc = fs.readFileSync(path.join(DEEPNRFI, "build_real_training_set.py"), "utf8")

/**
 * Read a module-level `NAME = <number>` assignment out of Python source.
 *
 * Deliberately anchored to the start of a line so an assignment nested inside a
 * function or a value merely mentioned in a comment cannot satisfy it, and
 * deliberately strict about there being exactly one — two assignments to the
 * same name is itself the drift this file is guarding against.
 */
function pyConst(src: string, name: string): number {
  const re = new RegExp(`^${name}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)\\s*(?:#.*)?$`, "gm")
  const hits = [...src.matchAll(re)]
  expect(hits, `expected exactly one module-level numeric \`${name} = ...\` in the Python source`)
    .toHaveLength(1)
  return parseFloat(hits[0][1])
}

describe("python mirror contract (scripts/deepnrfi/*.py vs lib/*.ts)", () => {
  it("transforms.py LEAGUE_AVG_NRFI equals the engine's league rate", () => {
    // The specific drift that motivated this test.
    expect(pyConst(transformsSrc, "LEAGUE_AVG_NRFI")).toBe(LEAGUE_AVG_NRFI)
  })

  it("transforms.py derives the half-inning rate rather than restating it", () => {
    // A literal 0.7183 here would go stale the next time the game rate moves,
    // so require the sqrt relationship in the source, not just a matching value.
    expect(transformsSrc).toMatch(/^LEAGUE_HALF_NRFI\s*=\s*math\.sqrt\(LEAGUE_AVG_NRFI\)/m)
    expect(Math.sqrt(pyConst(transformsSrc, "LEAGUE_AVG_NRFI"))).toBeCloseTo(LEAGUE_HALF_NRFI, 15)
  })

  it("transforms.py reproduces the final-blend contract", () => {
    expect(pyConst(transformsSrc, "ENSEMBLE_BLEND")).toBe(FINAL_BLEND_CONTRACT.ensembleBlend)
    expect(pyConst(transformsSrc, "FINAL_CLAMP_MIN")).toBe(FINAL_BLEND_CONTRACT.clampMin)
    expect(pyConst(transformsSrc, "FINAL_CLAMP_MAX")).toBe(FINAL_BLEND_CONTRACT.clampMax)
    // LEAGUE_ANCHOR is an alias, not a literal — pin the aliasing too.
    expect(transformsSrc).toMatch(/^LEAGUE_ANCHOR\s*=\s*LEAGUE_AVG_NRFI/m)
    expect(FINAL_BLEND_CONTRACT.leagueAnchor).toBe(LEAGUE_AVG_NRFI)
  })

  it("transforms.py uses the same league runs-per-half as shared-helpers", () => {
    expect(pyConst(transformsSrc, "LEAGUE_FIRST_INNING_RUNS_PER_HALF"))
      .toBe(LEAGUE_FIRST_INNING_RUNS_PER_HALF)
  })

  it("transforms.py derives RUNS_COEF from the half rate rather than hard-coding 0.636", () => {
    expect(transformsSrc).toMatch(
      /^RUNS_COEF\s*=\s*-math\.log\(LEAGUE_HALF_NRFI\)\s*\/\s*LEAGUE_FIRST_INNING_RUNS_PER_HALF/m
    )
  })

  it("the Python shrinkage prior weights match getDynamicPriorWeight", () => {
    // 30 / 50 / 80 appear as literals in dynamic_prior_weight; assert the TS
    // function still returns those for the three branches it mirrors.
    expect(getDynamicPriorWeight(makePitcher("p-bullpen", { isBullpenGame: true }))).toBe(80)
    expect(getDynamicPriorWeight(makePitcher("p-33", { startCount: 33 }))).toBe(30)        // 99 < 100
    expect(getDynamicPriorWeight(makePitcher("p-vet", { careerFirstInnings: 150 }))).toBe(50)
    for (const k of [30, 50, 80]) {
      expect(transformsSrc, `dynamic_prior_weight should still return ${k}`).toContain(`return ${k}`)
    }
  })

  it("the training feature contract version matches the serving side", () => {
    // Bumping one without the other is what lets rows built under different
    // feature semantics be treated as interchangeable.
    expect(pyConst(transformsSrc, "TRAINING_FEATURE_CONTRACT_VERSION"))
      .toBe(SERVING_FEATURE_CONTRACT_VERSION)
  })

  it("the builder does not keep its own copy of the league rate", () => {
    // It used to: a third literal 0.516, which drifted independently.
    expect(builderSrc).not.toMatch(/^LEAGUE_AVG_NRFI\s*=/m)
    expect(builderSrc).toMatch(/^\s+LEAGUE_AVG_NRFI,$/m)   // imported from transforms
  })

  it("no Python file outside transforms.py declares these constants", () => {
    const guarded = ["LEAGUE_AVG_NRFI", "LEAGUE_HALF_NRFI", "ENSEMBLE_BLEND", "LEAGUE_ANCHOR"]
    const offenders: string[] = []
    for (const f of fs.readdirSync(DEEPNRFI)) {
      if (!f.endsWith(".py") || f === "transforms.py") continue
      const src = fs.readFileSync(path.join(DEEPNRFI, f), "utf8")
      for (const name of guarded) {
        if (new RegExp(`^${name}\\s*=\\s*-?\\d`, "m").test(src)) offenders.push(`${f}:${name}`)
      }
    }
    expect(offenders, "declare these in transforms.py and import them").toEqual([])
  })
})
