// lib/db/index.ts
// Drizzle ORM client — uses @vercel/postgres as the underlying driver.
//
// @vercel/postgres reads the POSTGRES_URL (or POSTGRES_URL_NON_POOLING) env
// var automatically — no manual connection string needed.
//
// Usage:
//   import { db } from "@/lib/db"
//   const rows = await db.select().from(usersSubscriptions).where(...)

import { drizzle } from "drizzle-orm/vercel-postgres"
import { sql } from "@vercel/postgres"
import * as schema from "./schema"

export const db = drizzle(sql, { schema })
export type DB = typeof db

// Re-export schema so callers can import everything from "@/lib/db"
export * from "./schema"
