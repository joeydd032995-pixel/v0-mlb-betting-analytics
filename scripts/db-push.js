#!/usr/bin/env node
// Runs `prisma db push` only when DATABASE_URL is available (Vercel/CI).
// Silently skips when DATABASE_URL is absent (local builds without a DB).
// Logs a warning (but does NOT exit non-zero) if the push fails so that
// a schema-push issue never blocks the Next.js build from completing.
const { execSync } = require("child_process")

if (!process.env.DATABASE_URL) {
  console.log("[db-push] DATABASE_URL not set — skipping prisma db push")
  process.exit(0)
}

try {
  execSync("prisma db push --skip-generate", { stdio: "inherit" })
} catch (err) {
  console.warn("[db-push] prisma db push failed — build will continue.")
  console.warn("[db-push] Run 'npx prisma db push' manually to apply schema changes.")
  console.warn("[db-push] Error:", err.message)
  // Exit 0 so the Next.js build is not blocked by a DB connectivity issue.
  process.exit(0)
}
