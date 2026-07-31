import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { loadTrackedPredictions, type TrackedPrediction } from "@/lib/prediction-store"

// migrateThreshold is private and only reachable through loadTrackedPredictions,
// which needs a browser-ish global. Vitest runs in the node environment, so both
// window and localStorage are stubbed here.
const STORE_KEY = "nrfi_predictions_v1"

function makeStorage(seed: unknown) {
  let value = JSON.stringify(seed)
  return {
    getItem: (k: string) => (k === STORE_KEY ? value : null),
    setItem: (k: string, v: string) => {
      if (k === STORE_KEY) value = v
    },
    removeItem: () => {},
    get raw() {
      return value
    },
  }
}

/** Minimum shape that survives isValidTrackedPrediction. */
function row(over: Partial<TrackedPrediction>): Record<string, unknown> {
  return {
    id: "745804",
    date: "2026-05-01",
    nrfiProbability: 0.6,
    yrfiProbability: 0.4,
    status: "complete",
    prediction: "NRFI",
    ...over,
  }
}

let storage: ReturnType<typeof makeStorage>

function install(seed: unknown) {
  storage = makeStorage(seed)
  ;(globalThis as Record<string, unknown>).window = {}
  ;(globalThis as Record<string, unknown>).localStorage = storage
}

beforeEach(() => {
  delete (globalThis as Record<string, unknown>).window
  delete (globalThis as Record<string, unknown>).localStorage
})

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window
  delete (globalThis as Record<string, unknown>).localStorage
})

describe("threshold migration", () => {
  it("leaves rows alone when the stored call already matches the threshold", () => {
    install([row({ nrfiProbability: 0.6, prediction: "NRFI", correct: true, actualResult: "NRFI" })])

    const [p] = loadTrackedPredictions()

    expect(p.prediction).toBe("NRFI")
    expect(p.correct).toBe(true)
  })

  it("rescores `correct` when re-labelling a settled row", () => {
    // Written under the old 0.34 threshold: called NRFI at p=0.40 and scored
    // correct against a NRFI result. Under the 0.5 threshold the call flips to
    // YRFI — so the row is now WRONG about a game it previously got right.
    // Leaving `correct` alone would claim a YRFI call won on an NRFI game.
    install([
      row({ nrfiProbability: 0.4, prediction: "NRFI", actualResult: "NRFI", correct: true }),
    ])

    const [p] = loadTrackedPredictions()

    expect(p.prediction).toBe("YRFI")
    expect(p.correct).toBe(false)
  })

  it("rescores a re-labelled row that becomes correct", () => {
    install([
      row({ nrfiProbability: 0.4, prediction: "NRFI", actualResult: "YRFI", correct: false }),
    ])

    const [p] = loadTrackedPredictions()

    expect(p.prediction).toBe("YRFI")
    expect(p.correct).toBe(true)
  })

  it("keeps `correct` undefined on an unsettled row", () => {
    install([
      row({ nrfiProbability: 0.4, prediction: "NRFI", status: "pending", actualResult: undefined }),
    ])

    const [p] = loadTrackedPredictions()

    expect(p.prediction).toBe("YRFI")
    expect(p.correct).toBeUndefined()
  })

  it("persists the migration so it only runs once", () => {
    install([
      row({ nrfiProbability: 0.4, prediction: "NRFI", actualResult: "NRFI", correct: true }),
    ])

    loadTrackedPredictions()

    const persisted = JSON.parse(storage.raw) as TrackedPrediction[]
    expect(persisted[0].prediction).toBe("YRFI")
    expect(persisted[0].correct).toBe(false)
  })
})
