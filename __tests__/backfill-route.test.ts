import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ auth: vi.fn(), schedule: vi.fn() }))
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }))
vi.mock("@/lib/api/mlb-stats", () => ({ fetchGamesByDate: mocks.schedule, fetchGameLinescore: vi.fn() }))
vi.mock("@/lib/server/asof-slate", () => ({ buildAsOfSlate: vi.fn() }))
vi.mock("@/lib/nrfi-engine", () => ({ computeAllPredictions: vi.fn() }))
vi.mock("@/lib/prediction-store", () => ({ buildTrackedPrediction: vi.fn() }))
import { GET } from "@/app/api/backfill/route"

const request = () => new Request("https://example.com/api/backfill?from=2026-09-01&to=2026-09-01")
describe("season import access and upstream failures", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ userId: "user_test" }) })
  it("keeps unauthenticated imports protected", async () => {
    mocks.auth.mockResolvedValue({ userId: null })
    expect((await GET(request())).status).toBe(401)
    expect(mocks.schedule).not.toHaveBeenCalled()
  })
  it("does not report success when the upstream request throws", async () => {
    mocks.schedule.mockRejectedValue(new Error("upstream unavailable"))
    const res = await GET(request())
    expect(res.status).toBe(502)
    expect((await res.json()).failedDates).toEqual(["2026-09-01"])
  })
  it("allows a genuinely empty schedule", async () => {
    mocks.schedule.mockResolvedValue([])
    const res = await GET(request())
    expect(res.status).toBe(200)
    expect((await res.json()).predictions).toEqual([])
  })
})

describe("strict schedule loading", () => {
  it("requests strict upstream error handling for imports", async () => {
    mocks.auth.mockResolvedValue({ userId: "user_test" })
    mocks.schedule.mockResolvedValue([])
    await GET(request())
    expect(mocks.schedule).toHaveBeenCalledWith("2026-09-01", { strict: true })
  })
})
