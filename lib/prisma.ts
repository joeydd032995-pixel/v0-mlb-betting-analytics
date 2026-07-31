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
 * Off unless `PRISMA_NEON_HTTP=true`, so production and CI keep the pooled TCP
 * connection they have always used.  The HTTP driver does not support
 * interactive transactions — another reason not to make it the default.
 */
const useNeonHttp = process.env.PRISMA_NEON_HTTP === "true"

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
