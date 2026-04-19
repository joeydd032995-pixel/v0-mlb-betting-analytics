import { PrismaClient } from "@prisma/client"

const globalForPrisma = global as unknown as { prisma: PrismaClient }

// Resolve connection URL from whichever env var is present.
// Vercel Postgres / Neon use several naming conventions; this covers the common ones.
const dbUrl =
  process.env.DATABASE_URL            ??
  process.env.POSTGRES_URL_PGDATABASE ??
  process.env.POSTGRES_PRISMA_URL     ??
  process.env.POSTGRES_URL

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    // Runtime override so any of the variable names above work regardless of
    // what schema.prisma declares via env("DATABASE_URL").
    ...(dbUrl && { datasources: { db: { url: dbUrl } } }),
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
