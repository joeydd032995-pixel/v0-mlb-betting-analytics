// drizzle.config.ts
// Drizzle Kit configuration — used by `npx drizzle-kit push` and
// `npx drizzle-kit generate` to manage the Vercel Postgres schema.
//
// Usage:
//   npx drizzle-kit push         → push schema directly to the DB (quick for dev)
//   npx drizzle-kit generate     → generate SQL migration files
//   npx drizzle-kit studio       → open Drizzle Studio visual DB browser

import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema:    "./lib/db/schema.ts",
  out:       "./drizzle",
  dialect:   "postgresql",
  dbCredentials: {
    // @vercel/postgres uses POSTGRES_URL automatically; drizzle-kit needs it
    // explicitly here. Make sure POSTGRES_URL is set in your .env.local.
    url: process.env.POSTGRES_URL!,
  },
  verbose: true,
  strict:  true,
})
