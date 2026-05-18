/**
 * DeepNRFI inference bridge.
 *
 * Loads a LightGBM booster exported in the official text format and scores
 * the flat feature vector defined in lib/features/feature-vector.ts.
 *
 * Pure JS — no native deps — but **requires the Node.js runtime** because the
 * loader uses `fs.readFileSync`, `path.join`, and `process.cwd()`.  It is not
 * compatible with the Vercel Edge runtime or other V8-isolate runtimes.  Any
 * Next.js route that consumes `predictDeepNRFI` must opt into the Node runtime
 * via `export const runtime = "nodejs"`.
 *
 * Parses only the subset of the LightGBM text format we need: numeric splits,
 * leaf outputs, default direction, and tree weights.  Unsupported fields
 * (categorical splits, NaN handling beyond `default_left`) trigger a hard load
 * failure that downgrades the engine to the legacy 7-model path with a warning.
 *
 * Artifact layout under `scripts/deepnrfi/artifacts/`:
 *   manifest.json          — { activeVersion, featureOrder, brier, logLoss, ... }
 *   model_v{N}.txt         — LightGBM booster (model.save_model(...))
 *   calibration_v{N}.json  — { knots: [[raw, calibrated], ...] }
 *   feature_importance_v{N}.json (UI-only, not loaded here)
 */

import type { DeepNrfiFeatureVector, DeepNrfiFeaturePresence, DeepNrfiResult, FeatureContribution } from "./types"
import { FEATURE_ORDER } from "./features/feature-vector"

// Node-only modules are loaded lazily through a runtime-resolved `require` so
// that bundlers (Turbopack/webpack) do not try to include `node:fs` /
// `node:path` in the client bundle when this module is transitively reached
// from a "use client" component.  The engine's only client-facing entry point
// (`recomputeWithAdjustments`) never sets `ENABLE_DEEPNRFI`, so the loader
// below is never invoked in the browser.
type FsModule = typeof import("node:fs")
type PathModule = typeof import("node:path")

function nodeRequire<T>(specifier: string): T | null {
  if (typeof window !== "undefined") return null
  try {
    // The `Function("return require")()` indirection prevents static analysis
    // from picking up these modules; on Node it resolves to the runtime require.
    const req = Function("return typeof require !== 'undefined' ? require : null")() as
      | ((id: string) => unknown)
      | null
    return req ? (req(specifier) as T) : null
  } catch {
    return null
  }
}

let cachedFs: FsModule | null | undefined
let cachedPath: PathModule | null | undefined

function getFs(): FsModule | null {
  if (cachedFs !== undefined) return cachedFs
  cachedFs = nodeRequire<FsModule>("node:fs")
  return cachedFs
}

function getPath(): PathModule | null {
  if (cachedPath !== undefined) return cachedPath
  cachedPath = nodeRequire<PathModule>("node:path")
  return cachedPath
}

interface Manifest {
  activeVersion: string
  featureOrder?: string[]
  modelFile?: string
  calibrationFile?: string
  brier?: number
  logLoss?: number
  trainedAt?: string
}

interface CalibrationFile {
  knots: [number, number][]
}

interface TreeNode {
  feature?: number
  threshold?: number
  defaultLeft?: boolean
  leftChild?: number
  rightChild?: number
  leafValue?: number
}

interface Tree {
  nodes: TreeNode[]
  /** Index 0 is always the root. */
  root: number
  /** Tree weight (LightGBM stores `shrinkage_rate` per tree as `shrinkage`). */
  shrinkage: number
}

interface Booster {
  trees: Tree[]
  /** Named feature order from the booster header (`feature_names`). */
  featureNames: string[]
  /** Initial score (LightGBM stores under "[init_score]" in newer versions). */
  initScore: number
  /** "binary" objective uses logistic transform on raw score. */
  objective: "binary" | "regression"
}

interface LoadedHandle {
  booster: Booster
  calibrationKnots: [number, number][] | null
  manifest: Manifest
}

let CACHED_HANDLE: LoadedHandle | null | undefined = undefined  // undefined = not yet attempted

function artifactDir(): string | null {
  const path = getPath()
  if (!path) return null
  // process.cwd() is also Node-only; behind the same browser guard as fs/path.
  return path.join(process.cwd(), "scripts", "deepnrfi", "artifacts")
}

// ─── Booster parser ──────────────────────────────────────────────────────────

function parseBooster(text: string): Booster {
  const sections = text.split(/\n(?=Tree=\d+\n)/g)
  const header = sections.shift() ?? ""
  const headerKv: Record<string, string> = {}
  for (const line of header.split("\n")) {
    const eq = line.indexOf("=")
    if (eq < 0) continue
    headerKv[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  const featureNames = (headerKv["feature_names"] ?? "").split(/\s+/).filter(Boolean)
  const objective = (headerKv["objective"] ?? "").startsWith("binary") ? "binary" : "regression"

  const trees: Tree[] = []
  for (const block of sections) {
    const kv: Record<string, string> = {}
    for (const line of block.split("\n")) {
      const eq = line.indexOf("=")
      if (eq < 0) continue
      kv[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
    }
    const numLeaves = Number.parseInt(kv["num_leaves"] ?? "0", 10)
    if (numLeaves === 0) continue
    const splitFeature = (kv["split_feature"] ?? "").split(/\s+/).map(Number)
    const threshold = (kv["threshold"] ?? "").split(/\s+/).map(Number)
    const leftChild = (kv["left_child"] ?? "").split(/\s+/).map(Number)
    const rightChild = (kv["right_child"] ?? "").split(/\s+/).map(Number)
    const defaultDir = (kv["default_left"] ?? "").split(/\s+/).map((s) => s === "1")
    const decisionType = (kv["decision_type"] ?? "").split(/\s+/).map(Number)
    const leafValue = (kv["leaf_value"] ?? "").split(/\s+/).map(Number)
    const shrinkage = Number.parseFloat(kv["shrinkage"] ?? "1")

    // LightGBM packs flags into decision_type:
    //   bit 0       — categorical split (we only support numeric)
    //   bits 1..2   — missing-value mode: 00 = None, 01 = Zero, 10 = NaN
    //   bit 3       — default-left vs default-right (already read separately)
    // We only handle the "None" missing-value mode; any other mode would mean
    // we should re-route 0-or-NaN inputs differently than evalTree's NaN-only
    // branch does, so reject the artifact rather than silently mis-score.
    for (const d of decisionType) {
      if ((d & 1) === 1) {
        throw new Error("DeepNRFI artifact contains categorical splits (unsupported).")
      }
      const missingMode = (d >> 1) & 0b11
      if (missingMode !== 0) {
        throw new Error(
          `DeepNRFI artifact uses missing-value mode ${missingMode}; only "None" (0) is supported.`,
        )
      }
    }

    // Internal nodes: 0..numInternal-1; leaves indexed via negative children.
    const numInternal = splitFeature.length
    const nodes: TreeNode[] = []
    for (let i = 0; i < numInternal; i++) {
      // Children: positive = internal index, negative = ~leafIndex (i.e. -leafIdx - 1).
      const lcRaw = leftChild[i]
      const rcRaw = rightChild[i]
      const lcIdx = lcRaw >= 0 ? lcRaw : numInternal + (-lcRaw - 1)
      const rcIdx = rcRaw >= 0 ? rcRaw : numInternal + (-rcRaw - 1)
      nodes.push({
        feature: splitFeature[i],
        threshold: threshold[i],
        defaultLeft: defaultDir[i] ?? true,
        leftChild: lcIdx,
        rightChild: rcIdx,
      })
    }
    for (let l = 0; l < leafValue.length; l++) {
      nodes.push({ leafValue: leafValue[l] })
    }
    trees.push({ nodes, root: 0, shrinkage })
  }

  return {
    trees,
    featureNames,
    initScore: 0,
    objective,
  }
}

function evalTree(tree: Tree, x: number[]): number {
  let idx = tree.root
  while (true) {
    const node = tree.nodes[idx]
    if (node.leafValue !== undefined) return node.leafValue
    const v = x[node.feature ?? 0]
    const t = node.threshold ?? 0
    // <= goes left (LightGBM default).  NaN follows defaultLeft.
    const goLeft = Number.isNaN(v) ? !!node.defaultLeft : v <= t
    idx = goLeft ? (node.leftChild ?? 0) : (node.rightChild ?? 0)
  }
}

function evalBooster(booster: Booster, x: number[]): number {
  let raw = booster.initScore
  for (const tree of booster.trees) {
    raw += evalTree(tree, x)
  }
  if (booster.objective === "binary") return 1 / (1 + Math.exp(-raw))
  return raw
}

// ─── Calibration ─────────────────────────────────────────────────────────────

function applyCalibration(p: number, knots: [number, number][] | null): number {
  if (!knots || knots.length < 2) return p
  if (p <= knots[0][0]) return knots[0][1]
  const last = knots[knots.length - 1]
  if (p >= last[0]) return last[1]
  for (let i = 0; i < knots.length - 1; i++) {
    const [x1, y1] = knots[i]
    const [x2, y2] = knots[i + 1]
    if (p >= x1 && p <= x2) {
      const t = (p - x1) / (x2 - x1)
      return y1 + t * (y2 - y1)
    }
  }
  return p
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function loadDeepNrfiModel(): LoadedHandle | null {
  if (CACHED_HANDLE !== undefined) return CACHED_HANDLE
  const fs = getFs()
  const path = getPath()
  const dir = artifactDir()
  if (!fs || !path || !dir) {
    // Browser context (or Node without fs/path) — skip the artifact load and
    // let the caller fall back to the legacy ensemble.
    CACHED_HANDLE = null
    return null
  }
  try {
    const manifestPath = path.join(dir, "manifest.json")
    if (!fs.existsSync(manifestPath)) {
      CACHED_HANDLE = null
      return null
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest
    const modelFile = manifest.modelFile ?? `model_${manifest.activeVersion}.txt`
    const calibFile = manifest.calibrationFile ?? `calibration_${manifest.activeVersion}.json`
    const modelPath = path.join(dir, path.basename(modelFile))
    const calibPath = path.join(dir, path.basename(calibFile))
    if (!fs.existsSync(modelPath)) {
      console.warn(`[deepnrfi] manifest references missing model file ${modelFile} — falling back to legacy ensemble`)
      CACHED_HANDLE = null
      return null
    }
    const booster = parseBooster(fs.readFileSync(modelPath, "utf8"))
    const calibrationKnots = fs.existsSync(calibPath)
      ? (JSON.parse(fs.readFileSync(calibPath, "utf8")) as CalibrationFile).knots
      : null
    CACHED_HANDLE = { booster, calibrationKnots, manifest }
    return CACHED_HANDLE
  } catch (err) {
    console.warn(`[deepnrfi] artifact load failed: ${(err as Error).message} — falling back to legacy ensemble`)
    CACHED_HANDLE = null
    return null
  }
}

/** Reset the cached handle (used by tests). */
export function _resetDeepNrfiCache(): void {
  CACHED_HANDLE = undefined
}

/**
 * Convert a feature vector into a fixed-order numeric array using either the
 * manifest's featureOrder (preferred) or the canonical FEATURE_ORDER fallback.
 */
function vectorToArray(vector: DeepNrfiFeatureVector, order: string[]): number[] {
  const arr = new Array<number>(order.length)
  for (let i = 0; i < order.length; i++) {
    arr[i] = (vector as unknown as Record<string, number>)[order[i]] ?? Number.NaN
  }
  return arr
}

/**
 * Approximate per-feature contributions via single-feature ablation deltas.
 * Replaces each feature with its training-set median (encoded as 0 here for
 * simplicity — feature_importance file carries true means in production) and
 * measures the delta in the calibrated, clamped probability.  Top-K by |delta|.
 *
 * The ablated score must pass through the same calibration + clamp pipeline as
 * `fullProb`, otherwise the delta conflates calibration shift with the actual
 * feature impact (a no-op feature can show a ±0.05 delta from the spline alone).
 */
function calibrateAndClamp(raw: number, knots: [number, number][] | null): number {
  return Math.max(0.02, Math.min(0.98, applyCalibration(raw, knots)))
}

function computeContributions(
  booster: Booster,
  arr: number[],
  fullProb: number,
  calibrationKnots: [number, number][] | null,
  order: string[],
  presence: DeepNrfiFeaturePresence,
  topK = 5,
): FeatureContribution[] {
  const contributions: FeatureContribution[] = []
  for (let i = 0; i < order.length; i++) {
    const original = arr[i]
    arr[i] = 0  // median stand-in (DeepNRFI features are roughly centred at 0 for shrunk rates)
    const ablatedRaw = evalBooster(booster, arr)
    const ablated = calibrateAndClamp(ablatedRaw, calibrationKnots)
    arr[i] = original
    const delta = fullProb - ablated
    const name = order[i]
    contributions.push({
      name,
      value: delta,
      presence: (presence as unknown as Record<string, 0 | 1>)[name] ?? 0,
      impact: delta > 0.005 ? "NRFI" : delta < -0.005 ? "YRFI" : "NEUTRAL",
    })
  }
  contributions.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  return contributions.slice(0, topK)
}

/**
 * Score a feature vector with DeepNRFI.  Returns null when the artifact is
 * missing (caller treats that as "fall back to legacy ensemble").
 */
export function predictDeepNRFI(
  vector: DeepNrfiFeatureVector,
  presence: DeepNrfiFeaturePresence,
): DeepNrfiResult | null {
  const handle = loadDeepNrfiModel()
  if (!handle) return null
  const order = handle.manifest.featureOrder ?? FEATURE_ORDER
  const arr = vectorToArray(vector, order)
  const raw = evalBooster(handle.booster, arr)
  const probability = calibrateAndClamp(raw, handle.calibrationKnots)
  const topFeatures = computeContributions(
    handle.booster, arr, probability, handle.calibrationKnots, order, presence,
  )
  return {
    probability,
    topFeatures,
    modelVersion: handle.manifest.activeVersion,
  }
}
