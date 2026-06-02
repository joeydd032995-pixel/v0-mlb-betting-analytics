/**
 * Data-backfill Agent — weekly cron entrypoint.
 *
 * Runs `scripts/data/refresh_statcast.py` for the rolling 14-day window
 * ending today (ET) so the Statcast tables stay fresh without re-pulling
 * the entire season every week.
 *
 * The script shells out to Python.  Failure to import pybaseball / connect
 * to the DB exits non-zero so the GH Actions run is marked failed.
 *
 * Env (all optional):
 *   AGENT_LOOKBACK_DAYS    Override the rolling window (default 14)
 *   AGENT_DRY_RUN=1        Pass --dry-run through to the Python script
 *   AGENT_SEASON_START     ISO date (YYYY-MM-DD) for the pitch-mix/zone
 *                          aggregate window; omitted → script default (Mar 1)
 */

import { spawnSync } from "node:child_process"
import path from "node:path"

function todayET(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
}

function shiftDays(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d)
}

function main(): number {
  const lookback = Number.parseInt(process.env.AGENT_LOOKBACK_DAYS ?? "14", 10)
  const lookbackDays = Number.isFinite(lookback) && lookback > 0 ? lookback : 14
  const to   = todayET()
  const from = shiftDays(to, -lookbackDays)
  const dryRun = process.env.AGENT_DRY_RUN === "1"

  const seasonStart = process.env.AGENT_SEASON_START?.trim()

  const script = path.join(process.cwd(), "scripts", "data", "refresh_statcast.py")
  const args = ["--from", from, "--to", to]
  if (seasonStart) args.push("--season-start", seasonStart)
  if (dryRun) args.push("--dry-run")

  console.log(`[data-backfill] window ${from} → ${to}, seasonStart=${seasonStart ?? "(default)"}, dryRun=${dryRun}`)
  const result = spawnSync(process.env.PYTHON ?? "python3", [script, ...args], {
    stdio: "inherit",
    env:   process.env,
  })
  if (result.error) {
    console.error("[data-backfill] failed to spawn python:", result.error.message)
    return 1
  }
  return result.status ?? 1
}

process.exit(main())
