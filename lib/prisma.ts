// lib/prisma.ts
// Prisma client singleton — always `import { prisma } from "@/lib/prisma"`,
// never `new PrismaClient()` directly (avoids exhausting connections under
// Next.js dev hot-reload). Supports an opt-in Neon-over-HTTPS adapter
// (PRISMA_NEON_HTTP=true, dev-only — see the comment below for why it's
// refused in production) for sandboxes that block the Postgres wire port.

import { PrismaClient } from "@prisma/client"
import { PrismaNeonHTTP } from "@prisma/adapter-neon"
import { neon } from "@neondatabase/serverless"

const globalForPrisma = global as unknown as { prisma: PrismaClient }

// Resolve connection URL from whichever env var is present.
// Vercel Postgres / Neon use several naming conventions; this covers the common ones.
const dbUrl =
  process.env.DATABASE_URL            ??
  process.env.POSTGRES_URL_PGDATABASE ??
  process.env.POSTGRES_PRISMA_URL     ??
  process.env.POSTGRES_URL

/**
 * Opt-in escape hatch: talk to Neon over HTTPS instead of the Postgres wire
 * protocol.
 *
 * Some sandboxed environments (including the agent container this repo is often
 * worked on from) allow outbound 443 but block TCP 5432, which makes the normal
 * client unable to connect at all.  Neon serves SQL over HTTPS, so this lets
 * scripts and one-off verification runs reach the same database from there.
 *
 * Off unless `PRISMA_NEON_HTTP=true`, and **refused outright in production**.
 *
 * That refusal is not caution for its own sake: the HTTP driver cannot run
 * interactive transactions, and this app depends on them in a dozen places —
 * `placeBetAction` and friends in app/actions.ts, plus the bets and bankroll
 * routes, all use `prisma.$transaction(async (tx) => …)`.  Enabling this against
 * a live deployment would break bet placement and bankroll writes at runtime.
 * Making it structurally impossible beats documenting the hazard and hoping.
 */
const useNeonHttp =
  process.env.PRISMA_NEON_HTTP === "true" && process.env.NODE_ENV !== "production"

if (process.env.PRISMA_NEON_HTTP === "true" && process.env.NODE_ENV === "production") {
  console.warn(
    "[prisma] Ignoring PRISMA_NEON_HTTP in production — the Neon HTTP driver " +
      "cannot run the interactive transactions this app relies on. Using the " +
      "standard pooled connection instead."
  )
}

function createClient(): PrismaClient {
  const log: ("error" | "warn")[] =
    process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]

  if (useNeonHttp && dbUrl) {
    return new PrismaClient({ log, adapter: new PrismaNeonHTTP(neon(dbUrl)) })
  }

  return new PrismaClient({
    log,
    // Runtime override so any of the variable names above work regardless of
    // what schema.prisma declares via env("DATABASE_URL").
    ...(dbUrl && { datasources: { db: { url: dbUrl } } }),
  })
}

export const prisma = globalForPrisma.prisma || createClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
