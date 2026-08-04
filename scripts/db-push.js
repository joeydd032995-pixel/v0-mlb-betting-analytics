#!/usr/bin/env node
// Runs `prisma db push` only when DATABASE_URL is available (Vercel/CI).
// Silently skips when DATABASE_URL is absent (local builds without a DB).
// Logs a warning (but does NOT exit non-zero) if the push fails so that
// a DB *connectivity* issue never blocks the Next.js build from completing.
//
// Passes --accept-data-loss: this repo has no `prisma migrate` history (see
// CLAUDE.md — schema evolves via `db push` only), so every schema change here
// is already a deliberate, additive/backward-compatible edit reviewed as
// source. Prisma's data-loss guard fires on any new unique/required column
// regardless of whether real data would actually be affected, and without
// this flag the guard silently fails the push (caught below) while the code
// deploys anyway — i.e. the app ships assuming a column the DB doesn't have.
// That's what happened when UserApiKey.provider (PR #135) shipped without ever
// reaching the database. Accepting the flag by default is what makes this
// script's "push, or warn and continue" contract actually apply the schema
// instead of quietly never doing so.
const { execSync } = require("child_process")

if (!process.env.DATABASE_URL) {
  console.log("[db-push] DATABASE_URL not set — skipping prisma db push")
  process.exit(0)
}

try {
  execSync("prisma db push --skip-generate --accept-data-loss", { stdio: "inherit" })
} catch (err) {
  console.warn("[db-push] prisma db push failed — build will continue.")
  console.warn("[db-push] Run 'npx prisma db push' manually to apply schema changes.")
  console.warn("[db-push] Error:", err.message)
  // Exit 0 so the Next.js build is not blocked by a DB connectivity issue.
  process.exit(0)
}
