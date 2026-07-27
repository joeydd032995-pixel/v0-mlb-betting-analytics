/**
 * Umpire-profile scraper (the deferred Phase-6 item in lib/features/umpire-zone.ts).
 *
 * For every gamePk in game_results:
 *   1. Load the MLB boxscore (cache-first — shares scripts/deepnrfi/data/boxscores/
 *      with the DeepNRFI Python builder; same raw API JSON format).
 *   2. Extract the Home Plate umpire and total game strikeouts (both pitching staffs).
 * Then aggregate per umpire:
 *   - careerNrfi:    empirical-Bayes shrunk NRFI rate, prior = league 0.516, k = 20
 *   - zoneTightness: clamp(−zK/2, −1, 1) where zK is the shrunk z-score (n/(n+20))
 *                    of the umpire's mean K/game vs the league distribution.
 *                    Fewer strikeouts ⇒ tighter zone ⇒ positive tightness
 *                    (matches the UmpireProfile doc: +1 = very tight).
 *   - sample:        raw game count
 *
 * Output: lib/features/umpire-profiles.generated.ts (imported by umpire-zone.ts).
 * Idempotent — regenerates the whole file from scratch each run; re-run after
 * new game_results rows land (e.g. the 2023 backfill).
 *
 * Usage:  DATABASE_URL=... npx tsx scripts/data/refresh_umpires.ts [--limit=N]
 */

import { PrismaClient } from "@prisma/client"
import crypto from "crypto"
import * as fs from "fs"
import * as path from "path"

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1) }
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } })

const CACHE_DIR = path.join(process.cwd(), "scripts", "deepnrfi", "data", "boxscores")
const OUT_FILE = path.join(process.cwd(), "lib", "features", "umpire-profiles.generated.ts")
const CONCURRENCY = 8
const SHRINK_K = 20
const LEAGUE_NRFI = 0.516
// A real MLB boxscore payload runs tens-to-low-hundreds of KB; this caps
// well above that to guard against an unexpectedly huge response being
// written to disk, without risking false rejections on legitimate games.
const MAX_BOXSCORE_BYTES = 5_000_000

const LIMIT_ARG = process.argv.find(a => a.startsWith("--limit="))
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split("=")[1]) : Infinity

interface GameObs { umpId: number; umpName: string; nrfi: boolean; gameK: number | null }

/**
 * Atomically write `data` to `filePath`: write to a uniquely-named temp file
 * in the same directory, then rename it over `filePath`. `fs.renameSync`
 * within one filesystem is atomic on POSIX, so concurrent readers never see
 * a partially-written file, and a crash mid-write only ever leaves an
 * orphaned `.tmp-*` file — never a truncated `cachePath`.
 */
function writeFileAtomic(filePath: string, data: string): void {
  const tmpPath = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(6).toString("hex")}`
  let renamed = false
  try {
    fs.writeFileSync(tmpPath, data)
    fs.renameSync(tmpPath, filePath)
    renamed = true
  } finally {
    if (!renamed) {
      try { fs.unlinkSync(tmpPath) } catch { /* best-effort cleanup */ }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Minimal shape check on a parsed MLB boxscore payload before it's trusted
 * enough to cache or hand to extractObs(). Only validates the two properties
 * the rest of this script actually reads (`teams.home`, `teams.away`).
 */
function isValidBoxscore(json: unknown): json is Record<string, unknown> {
  if (!isRecord(json)) return false
  const teams = json.teams
  if (!isRecord(teams)) return false
  return isRecord(teams.home) && isRecord(teams.away)
}

async function fetchBoxscore(gamePk: number): Promise<Record<string, unknown> | null> {
  const cachePath = path.join(CACHE_DIR, `${gamePk}.json`)
  if (fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"))
      if (isValidBoxscore(cached)) return cached
      // cache exists but doesn't match expected shape — fall through and refetch
    } catch { /* corrupt — refetch */ }
  }
  const res = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`)
  if (!res.ok) return null
  const contentType = res.headers.get("content-type") ?? ""
  if (!contentType.includes("application/json")) {
    console.warn(`gamePk ${gamePk}: unexpected content-type "${contentType}" — skipping (not cached)`)
    return null
  }
  const contentLength = Number(res.headers.get("content-length"))
  if (Number.isFinite(contentLength) && contentLength > MAX_BOXSCORE_BYTES) {
    console.warn(`gamePk ${gamePk}: response too large (${contentLength} bytes) — skipping (not cached)`)
    return null
  }
  let json: unknown
  try {
    json = await res.json()
  } catch {
    return null
  }
  if (!isValidBoxscore(json)) {
    console.warn(`gamePk ${gamePk}: boxscore response failed shape validation — skipping (not cached)`)
    return null
  }
  // Content-Length can be absent (e.g. chunked transfer), so re-check the
  // actual serialized size before writing — belt-and-suspenders with the
  // header check above.
  const serialized = JSON.stringify(json)
  if (serialized.length > MAX_BOXSCORE_BYTES) {
    console.warn(`gamePk ${gamePk}: serialized response too large (${serialized.length} bytes) — skipping (not cached)`)
    return null
  }
  // Cache-write is atomic (temp file + rename); the Python builder writes the identical payload.
  try { writeFileAtomic(cachePath, serialized) } catch { /* best-effort, non-fatal */ }
  return json
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function extractObs(box: any, nrfi: boolean): GameObs | null {
  const hp = (box?.officials ?? []).find((o: any) => o?.officialType === "Home Plate")
  if (!hp?.official?.id) return null
  const homeK = box?.teams?.home?.teamStats?.pitching?.strikeOuts
  const awayK = box?.teams?.away?.teamStats?.pitching?.strikeOuts
  const gameK = typeof homeK === "number" && typeof awayK === "number" ? homeK + awayK : null
  return { umpId: hp.official.id, umpName: hp.official.fullName ?? String(hp.official.id), nrfi, gameK }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function main() {
  console.log("Umpire-profile refresh")
  console.log(`Run at: ${new Date().toISOString()}`)
  fs.mkdirSync(CACHE_DIR, { recursive: true })

  const games = await prisma.gameResult.findMany({
    select: { gamePk: true, nrfi: true },
    orderBy: { gamePk: "asc" },
    ...(Number.isFinite(LIMIT) ? { take: LIMIT } : {}),
  })
  console.log(`game_results rows: ${games.length}`)

  const obs: GameObs[] = []
  let fetched = 0, cacheHits = 0, missing = 0

  // Simple worker pool
  let cursor = 0
  async function worker() {
    while (cursor < games.length) {
      const g = games[cursor++]
      const cached = fs.existsSync(path.join(CACHE_DIR, `${g.gamePk}.json`))
      const box = await fetchBoxscore(g.gamePk)
      if (cached) cacheHits++; else fetched++
      if (!box) { missing++; continue }
      const o = extractObs(box, g.nrfi)
      if (o) obs.push(o); else missing++
      const done = cacheHits + fetched
      if (done % 500 === 0) console.log(`  ${done}/${games.length} (cache ${cacheHits}, fetched ${fetched}, missing ${missing})`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  console.log(`done: ${obs.length} usable games (cache ${cacheHits}, fetched ${fetched}, missing ${missing})`)

  // ── Aggregate per umpire ────────────────────────────────────────────────────
  const byUmp = new Map<number, { name: string; n: number; nrfi: number; kSum: number; kN: number }>()
  for (const o of obs) {
    const u = byUmp.get(o.umpId) ?? { name: o.umpName, n: 0, nrfi: 0, kSum: 0, kN: 0 }
    u.n++
    if (o.nrfi) u.nrfi++
    if (o.gameK !== null) { u.kSum += o.gameK; u.kN++ }
    byUmp.set(o.umpId, u)
  }

  // League K/game mean from all observed games; umpire-level spread from umpires with ≥5 games
  const kObs = obs.filter(o => o.gameK !== null).map(o => o.gameK as number)
  const leagueK = kObs.length > 0 ? kObs.reduce((s, v) => s + v, 0) / kObs.length : 16
  const umpMeans = [...byUmp.values()].filter(u => u.kN >= 5).map(u => u.kSum / u.kN)
  const kStd = umpMeans.length > 1
    ? Math.sqrt(umpMeans.reduce((s, v) => s + (v - leagueK) ** 2, 0) / umpMeans.length) || 1
    : 1
  console.log(`umpires: ${byUmp.size}   league K/game (umpire-mean): ${leagueK.toFixed(2)} ± ${kStd.toFixed(2)}`)

  const entries = [...byUmp.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([id, u]) => {
      const careerNrfi = (u.nrfi + SHRINK_K * LEAGUE_NRFI) / (u.n + SHRINK_K)
      const meanK = u.kN > 0 ? u.kSum / u.kN : leagueK
      const z = ((meanK - leagueK) / kStd) * (u.kN / (u.kN + SHRINK_K))
      const zoneTightness = Math.max(-1, Math.min(1, -z / 2))  // fewer K ⇒ tighter ⇒ +
      return { id, name: u.name, zoneTightness, careerNrfi, sample: u.n }
    })

  // ── Emit generated TS ───────────────────────────────────────────────────────
  const lines = [
    `/**`,
    ` * AUTO-GENERATED by scripts/data/refresh_umpires.ts — do not edit by hand.`,
    ` * Generated: ${new Date().toISOString()}`,
    ` * Source: game_results (${obs.length} games) + MLB boxscore officials.`,
    ` * careerNrfi is EB-shrunk toward ${LEAGUE_NRFI} (k=${SHRINK_K}); zoneTightness = clamp(−zK/2, −1, 1).`,
    ` */`,
    ``,
    `import type { UmpireProfile } from "./umpire-zone"`,
    ``,
    `export const GENERATED_UMPIRE_PROFILES: Record<string, Readonly<UmpireProfile>> = {`,
    ...entries.map(e =>
      `  "${e.id}": { zoneTightness: ${e.zoneTightness.toFixed(4)}, careerNrfi: ${e.careerNrfi.toFixed(4)}, sample: ${e.sample} }, // ${e.name}`
    ),
    `}`,
    ``,
  ]
  writeFileAtomic(OUT_FILE, lines.join("\n"))
  console.log(`wrote ${entries.length} profiles → ${path.relative(process.cwd(), OUT_FILE)}`)

  // Sanity peek: top-5 by sample
  for (const e of entries.slice(0, 5)) {
    console.log(`  ${e.name.padEnd(20)} n=${String(e.sample).padStart(4)}  nrfi=${e.careerNrfi.toFixed(3)}  tight=${e.zoneTightness.toFixed(3)}`)
  }

  await prisma.$disconnect()
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1) })
