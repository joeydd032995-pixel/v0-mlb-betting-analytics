/**
 * GET /api/feature-importance
 *
 *   ?gameId=...   → returns the per-game DeepNRFI top contributions persisted
 *                   on `ModelPrediction.deepNrfiTopFeatures`.
 *   ?global=true  → returns the global gain + mean-abs-SHAP report from the
 *                   active artifact's feature_importance_v{N}.json.
 *
 * Both responses degrade gracefully — when the artifact / column is missing
 * we return `{ available: false, ... }` rather than 500-ing.  The UI just
 * hides the panel in that case.
 */

import { NextResponse, type NextRequest } from "next/server"
import { promises as fs } from "node:fs"
import path from "node:path"
import { prisma } from "@/lib/prisma"
import type { FeatureContribution } from "@/lib/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"  // we read artifact files from disk

const ARTIFACT_DIR = path.join(process.cwd(), "scripts", "deepnrfi", "artifacts")

interface Manifest { activeVersion: string; importanceFile?: string }
interface ImportanceFile { features: Array<{ name: string; gain: number; meanAbsShap: number }> }

async function readGlobalImportance(): Promise<
  { available: true; version: string; features: ImportanceFile["features"] }
  | { available: false; reason: string }
> {
  try {
    const manifestPath = path.join(ARTIFACT_DIR, "manifest.json")
    const manifestRaw = await fs.readFile(manifestPath, "utf8")
    const manifest = JSON.parse(manifestRaw) as Manifest
    const importanceFile = manifest.importanceFile ?? `feature_importance_${manifest.activeVersion}.json`
    const importanceRaw = await fs.readFile(path.join(ARTIFACT_DIR, importanceFile), "utf8")
    const parsed = JSON.parse(importanceRaw) as ImportanceFile
    return { available: true, version: manifest.activeVersion, features: parsed.features }
  } catch (err) {
    return { available: false, reason: (err as Error).message }
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const gameId = url.searchParams.get("gameId")
  const wantGlobal = url.searchParams.get("global") === "true"

  if (wantGlobal) {
    const data = await readGlobalImportance()
    return NextResponse.json(data)
  }

  if (!gameId) {
    return NextResponse.json(
      { error: "Provide ?gameId=... or ?global=true" },
      { status: 400 },
    )
  }

  // Pull the most recent ModelPrediction row for this game.  We index on date
  // / season but not on gameId; gameId in the engine is e.g. "auto-12345" while
  // ModelPrediction.id is the gamePk-derived string.  Match on id loosely.
  try {
    const row = await prisma.modelPrediction.findFirst({
      where:   { id: gameId },
      orderBy: { createdAt: "desc" },
      select:  { deepNrfi: true, deepNrfiTopFeatures: true, ensembleVersion: true },
    })
    if (!row || row.deepNrfiTopFeatures == null) {
      return NextResponse.json({ available: false, reason: "No DeepNRFI data for this game." })
    }
    return NextResponse.json({
      available: true,
      gameId,
      ensembleVersion: row.ensembleVersion,
      probability: row.deepNrfi,
      topFeatures: row.deepNrfiTopFeatures as unknown as FeatureContribution[],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[/api/feature-importance]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
