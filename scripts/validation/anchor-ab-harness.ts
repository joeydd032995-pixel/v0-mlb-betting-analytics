/**
 * End-to-end A/B of the engine under two LEAGUE_AVG_NRFI values.
 *
 * ── How to re-run ────────────────────────────────────────────────────────────
 * Needs two checkouts of this repo (one per constant) and a shared cache dir.
 * No DB and no API keys — only the free MLB Stats API.
 *
 *   SP=/tmp/anchor-ab && mkdir -p $SP/cache
 *   git worktree add $SP/wt-old <pre-change-commit>
 *   ln -s "$PWD/node_modules" $SP/wt-old/node_modules
 *   cp scripts/validation/anchor-ab-harness.ts $SP/wt-old/
 *
 *   # arm A populates the cache; arm B then reads identical bytes
 *   FETCH_CACHE=$SP/cache AB_OUT=$SP/new.json AB_LABEL=NEW REPO_ROOT="$PWD" \
 *     AB_DATES='["2026-05-19","2026-05-20"]' npx tsx scripts/validation/anchor-ab-harness.ts
 *   cd $SP/wt-old && FETCH_CACHE=$SP/cache AB_OUT=$SP/old.json AB_LABEL=OLD \
 *     REPO_ROOT=$SP/wt-old AB_DATES='["2026-05-19","2026-05-20"]' npx tsx anchor-ab-harness.ts
 *
 *   python3 scripts/validation/anchor-ab-compare.py $SP/new.json $SP/old.json
 *
 * Arm B reporting `misses=0` is the check that matters: a nonzero count means
 * the arms diverged on which raw inputs they read, and the comparison is not
 * attributable to the code change alone.
 *
 * Runs the REAL deployed path -- fetchGamesByDate -> buildAsOfSlate ->
 * computeAllPredictions -> fetchGameLinescore -- inside whichever checkout it
 * is executed from, and writes one JSON record per game.  Both checkouts read
 * the SAME raw MLB API bytes from a shared on-disk fetch cache, so the only
 * difference between the two runs is the code.
 *
 * This exists because the PR claimed "AUC unchanged by construction".  The
 * constant does not only re-centre the output: it moves the shrinkage prior
 * target, ERA_COEF/RUNS_COEF, the Markov exponent and the ZIP baseline, each
 * by a different amount, so ordering is an empirical question.
 */
import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"

const CACHE = process.env.FETCH_CACHE!
const OUT = process.env.AB_OUT!
const LABEL = process.env.AB_LABEL!
fs.mkdirSync(CACHE, { recursive: true })

// ── Shared on-disk fetch cache: guarantees both arms see identical raw bytes ──
const realFetch = globalThis.fetch
let hits = 0, misses = 0
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input.url
  const key = crypto.createHash("sha256").update(url).digest("hex")
  const file = path.join(CACHE, key + ".json")
  if (fs.existsSync(file)) {
    try {
      const { status, body } = JSON.parse(fs.readFileSync(file, "utf8"))
      hits++
      return new Response(body, { status, headers: { "content-type": "application/json" } })
    } catch { /* fall through and refetch */ }
  }
  misses++
  const res = await realFetch(input, init)
  const body = await res.text()
  if (res.status === 200) {
    const tmp = file + "." + process.pid + ".tmp"
    fs.writeFileSync(tmp, JSON.stringify({ status: res.status, body }))
    fs.renameSync(tmp, file)
  }
  return new Response(body, { status: res.status, headers: { "content-type": "application/json" } })
}) as any

const ROOT = process.env.REPO_ROOT!

async function main() {
  const { fetchGamesByDate, fetchGameLinescore } = await import(`${ROOT}/lib/api/mlb-stats.ts`)
  const { buildAsOfSlate } = await import(`${ROOT}/lib/server/asof-slate.ts`)
  const { computeAllPredictions } = await import(`${ROOT}/lib/nrfi-engine.ts`)
  const models = await import(`${ROOT}/lib/nrfi-models.ts`)

  const dates = JSON.parse(process.env.AB_DATES!) as string[]
  const rows: any[] = []

  for (const date of dates) {
    const season = parseInt(date.slice(0, 4), 10)
    const apiGames = await fetchGamesByDate(date, { strict: true })
    if (!apiGames || apiGames.length === 0) { console.error(`[${LABEL}] ${date}: no games`); continue }

    const { games, pitchers, teams, gameById } = await buildAsOfSlate(apiGames, date, season)
    const preds = computeAllPredictions(games, pitchers, teams)

    // Ground truth: first-inning runs from the linescore.
    const finals = apiGames.filter((g: any) => g.status.abstractGameState.toLowerCase() === "final")
    const ls = await Promise.all(finals.map((g: any) => fetchGameLinescore(g.gamePk)))
    const outcome: Record<string, 0 | 1> = {}   // 1 = NRFI (scoreless), 0 = YRFI
    for (let i = 0; i < finals.length; i++) {
      const l = ls[i]; if (!l) continue
      const inn = l.innings.find((x: any) => x.num === 1); if (!inn) continue
      const r = (inn.home.runs ?? 0) + (inn.away.runs ?? 0)
      outcome[String(finals[i].gamePk)] = r === 0 ? 1 : 0
    }

    for (const p of preds) {
      const g = gameById.get(p.gameId); if (!g) continue
      const y = outcome[g.id]
      if (y === undefined) continue          // unplayed / no linescore
      const hp = pitchers.get(g.homePitcherId)
      const ap = pitchers.get(g.awayPitcherId)
      rows.push({
        date, gameId: g.id, y,
        nrfiProbability: p.nrfiProbability,
        confidenceScore: p.confidenceScore,
        homeScores0Prob: p.homeScores0Prob,
        awayScores0Prob: p.awayScores0Prob,
        // pitcher inputs: these are themselves constant-dependent (ERA_COEF/RUNS_COEF)
        homeNrfiRate: hp?.firstInning.nrfiRate ?? null,
        awayNrfiRate: ap?.firstInning.nrfiRate ?? null,
        homeStarts: hp?.firstInning.startCount ?? null,
        awayStarts: ap?.firstInning.startCount ?? null,
      })
    }
    console.error(`[${LABEL}] ${date}: ${preds.length} preds, ${rows.length} scored so far`)
  }

  fs.writeFileSync(OUT, JSON.stringify({
    label: LABEL,
    constants: {
      LEAGUE_AVG_NRFI: models.LEAGUE_AVG_NRFI,
      LEAGUE_HALF_NRFI: models.LEAGUE_HALF_NRFI,
      MARKOV_CALIBRATION_EXPONENT: models.MARKOV_CALIBRATION_EXPONENT,
    },
    cache: { hits, misses },
    rows,
  }, null, 1))
  console.error(`[${LABEL}] wrote ${rows.length} rows; cache hits=${hits} misses=${misses}`)
}
main().catch(e => { console.error(e); process.exit(1) })
