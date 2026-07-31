import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Capture what PrismaClient was constructed with, so we can tell whether the
// Neon HTTP adapter was wired in or the standard pooled connection was used.
const constructorArgs: Record<string, unknown>[] = []

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    constructor(opts: Record<string, unknown>) {
      constructorArgs.push(opts)
    }
  },
}))
vi.mock("@prisma/adapter-neon", () => ({
  PrismaNeonHTTP: class {
    constructor(public conn: unknown) {}
  },
}))
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({}) }))

const ORIGINAL = { ...process.env }

async function loadPrisma(env: Record<string, string | undefined>) {
  vi.resetModules()
  constructorArgs.length = 0
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  await import("@/lib/prisma")
  return constructorArgs[0]
}

beforeEach(() => {
  // `globalThis.prisma` is cached outside production; clear it so each case
  // actually re-runs the factory.
  delete (globalThis as Record<string, unknown>).prisma
})

afterEach(() => {
  process.env = { ...ORIGINAL }
  delete (globalThis as Record<string, unknown>).prisma
})

describe("Neon HTTP driver guard", () => {
  it("refuses the HTTP driver in production even when the flag is set", async () => {
    // This is the case that matters. The HTTP driver cannot run interactive
    // transactions, and bet placement and bankroll writes depend on them — so
    // enabling this against a live deployment would break them at runtime.
    const opts = await loadPrisma({
      NODE_ENV: "production",
      PRISMA_NEON_HTTP: "true",
      DATABASE_URL: "postgresql://u:p@example.neon.tech/db",
    })

    expect(opts).not.toHaveProperty("adapter")
    expect(opts).toHaveProperty("datasources")
  })

  it("uses the HTTP driver outside production when the flag is set", async () => {
    const opts = await loadPrisma({
      NODE_ENV: "development",
      PRISMA_NEON_HTTP: "true",
      DATABASE_URL: "postgresql://u:p@example.neon.tech/db",
    })

    expect(opts).toHaveProperty("adapter")
  })

  it("uses the standard connection when the flag is absent", async () => {
    const opts = await loadPrisma({
      NODE_ENV: "development",
      PRISMA_NEON_HTTP: undefined,
      DATABASE_URL: "postgresql://u:p@example.neon.tech/db",
    })

    expect(opts).not.toHaveProperty("adapter")
    expect(opts).toHaveProperty("datasources")
  })

  it("does not enable on a truthy-looking value other than 'true'", async () => {
    const opts = await loadPrisma({
      NODE_ENV: "development",
      PRISMA_NEON_HTTP: "1",
      DATABASE_URL: "postgresql://u:p@example.neon.tech/db",
    })

    expect(opts).not.toHaveProperty("adapter")
  })
})
