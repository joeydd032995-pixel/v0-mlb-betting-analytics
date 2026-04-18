#!/usr/bin/env node
// Runs `prisma db push` only when DATABASE_URL is available (Vercel/CI).
// Silently skips in local builds where the env var is absent.
const { execSync } = require("child_process")
if (!process.env.DATABASE_URL) {
  console.log("[db-push] DATABASE_URL not set — skipping prisma db push")
  process.exit(0)
}
execSync("prisma db push --skip-generate", { stdio: "inherit" })
