/**
 * 2023 historical backfill driver — invokes the historical-sync route handler
 * directly (no dev server needed). Auth via RECOMPUTE_TOKEN bearer.
 *
 * Usage:
 *   DATABASE_URL=... RECOMPUTE_TOKEN=local npx tsx scripts/backfill-2023.ts [months...]
 *   (months default to 3..10)
 */

import { GET } from "../app/api/historical-sync/route"

const YEAR = 2023
const monthArgs = process.argv.slice(2).map(Number).filter(m => m >= 1 && m <= 12)
const MONTHS = monthArgs.length > 0 ? monthArgs : [3, 4, 5, 6, 7, 8, 9, 10]

if (!process.env.DATABASE_URL || !process.env.RECOMPUTE_TOKEN) {
  console.error("DATABASE_URL and RECOMPUTE_TOKEN must be set")
  process.exit(1)
}

async function main() {
  console.log(`2023 backfill — months: ${MONTHS.join(", ")}`)
  for (const month of MONTHS) {
    const t0 = Date.now()
    const req = new Request(`http://localhost/api/historical-sync?year=${YEAR}&month=${month}`, {
      headers: { authorization: `Bearer ${process.env.RECOMPUTE_TOKEN}` },
    })
    const res = await GET(req)
    const body = await res.json()
    console.log(`month ${month} (${((Date.now() - t0) / 1000).toFixed(0)}s):`, JSON.stringify(body))
    if (res.status !== 200) { console.error("aborting"); process.exit(1) }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
