/**
 * Export historical games + features into scripts/deepnrfi/data/training.csv.
 *
 * Joins:
 *   - GameResult (label: nrfi)
 *   - ModelPrediction (legacy 7-model ensemble probability)
 *   - Reconstructed feature vector (currently a placeholder — Phase 2 ships the
 *     adapter but real reconstruction needs historical pitcher/team snapshots
 *     which aren't in the schema yet; for now we only export rows that already
 *     have a stored ensembleNrfi and emit the synthetic-feature defaults).
 *
 * Usage:
 *   tsx scripts/deepnrfi/export_training_data.ts --from 2023-04-01 --to 2024-09-30
 *
 * The CSV schema matches the `nrfi` label + every key in DeepNrfiFeatureVector,
 * which is what scripts/deepnrfi/train.py expects.
 */

import fs from "node:fs"
import path from "node:path"
import { prisma } from "../../lib/prisma"
import { FEATURE_ORDER } from "../../lib/features/feature-vector"

interface Args { from: string; to: string; out: string }

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const get = (flag: string, dflt?: string) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : dflt
  }
  return {
    from: get("--from") ?? "2023-04-01",
    to: get("--to") ?? new Date().toISOString().slice(0, 10),
    out: get("--out") ?? path.join(process.cwd(), "scripts", "deepnrfi", "data", "training.csv"),
  }
}

async function main(): Promise<void> {
  const args = parseArgs()
  const rows = await prisma.gameResult.findMany({
    where: { date: { gte: args.from, lte: args.to } },
    orderBy: { date: "asc" },
  })
  const predictions = await prisma.modelPrediction.findMany({
    where: { date: { gte: args.from, lte: args.to }, status: "complete" },
  })
  const predByKey = new Map<string, typeof predictions[number]>()
  for (const p of predictions) {
    predByKey.set(`${p.date}|${p.homeTeam}|${p.awayTeam}`, p)
  }

  const header = ["gameId", "date", "season", "homeTeam", "awayTeam", "nrfi", ...FEATURE_ORDER]
  fs.mkdirSync(path.dirname(args.out), { recursive: true })
  const out = fs.createWriteStream(args.out)
  out.write(header.join(",") + "\n")

  let written = 0
  for (const r of rows) {
    const key = `${r.date}|${r.homeTeam}|${r.awayTeam}`
    const pred = predByKey.get(key)
    if (!pred) continue   // need ensemble7 signal as a feature
    const featureValues = FEATURE_ORDER.map((feat) => {
      // Only ensemble7_nrfi has a real source today; the rest are league-default
      // placeholders that the trainer will treat as low-information until the
      // feature reconstruction agent (Phase 6) backfills real per-game snapshots.
      if (feat === "ensemble7_nrfi") return pred.ensembleNrfi
      return ""
    })
    const cells = [
      String(r.gamePk), r.date, String(r.season), r.homeTeam, r.awayTeam,
      r.nrfi ? "1" : "0", ...featureValues,
    ]
    out.write(cells.join(",") + "\n")
    written++
  }
  out.end()
  console.log(`[export-training] wrote ${written} rows to ${args.out}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
