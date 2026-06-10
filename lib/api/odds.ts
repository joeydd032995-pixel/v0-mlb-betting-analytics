const BASE_URL = "https://api.the-odds-api.com/v4"
const API_KEY = process.env.THE_ODDS_API_KEY ?? ""

interface OddsEvent {
  id: string
  home_team: string
  away_team: string
  bookmakers: Array<{
    key: string
    markets: Array<{
      key: string
      outcomes: Array<{ name: string; price: number }>
    }>
  }>
}

export type { OddsEvent }

export async function fetchAllNrfiOdds(): Promise<OddsEvent[]> {
  if (!API_KEY) {
    console.warn("[odds] THE_ODDS_API_KEY is not set — skipping odds fetch")
    return []
  }
  const url =
    `${BASE_URL}/sports/baseball_mlb/odds` +
    `?regions=us&markets=batter_first_inning_scored&oddsFormat=american&apiKey=${encodeURIComponent(API_KEY)}`
  try {
    const res = await fetch(url, { next: { revalidate: 60 }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) {
      // Log status and remaining quota header only — never log the full URL.
      const remaining = res.headers.get("x-requests-remaining") ?? "unknown"
      console.error(`[odds] HTTP ${res.status} — requests remaining: ${remaining}`)
      return []
    }
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[odds] fetch error:", msg)
    return []
  }
}

/** American-odds comparison: higher payout for the bettor wins (+120 > +110 > -105 > -110). */
function betterAmericanOdds(a: number, b: number): boolean {
  // Convert to net profit per unit for a like-for-like comparison.
  const profit = (o: number) => (o > 0 ? o / 100 : 100 / Math.abs(o))
  return profit(a) > profit(b)
}

/**
 * Extract the best available NRFI/YRFI prices across ALL bookmakers carrying
 * the market (line shopping), rather than whichever book happened to be first
 * in the response (AUDIT_REPORT.md P2-11).  When the two sides come from
 * different books the bookmaker label records both.
 */
export function extractNrfiOdds(
  event: OddsEvent
): { nrfiOdds: number; yrfiOdds: number; bookmaker: string } | null {
  let best: { nrfiOdds: number; nrfiBook: string; yrfiOdds: number; yrfiBook: string } | null = null

  for (const bookmaker of event.bookmakers) {
    const market = bookmaker.markets.find((m) => m.key === "batter_first_inning_scored")
    if (!market) continue

    const yesOutcome = market.outcomes.find((o) => o.name === "Yes")
    const noOutcome = market.outcomes.find((o) => o.name === "No")
    if (!yesOutcome || !noOutcome) continue

    if (!best) {
      best = {
        nrfiOdds: noOutcome.price, nrfiBook: bookmaker.key,
        yrfiOdds: yesOutcome.price, yrfiBook: bookmaker.key,
      }
      continue
    }
    if (betterAmericanOdds(noOutcome.price, best.nrfiOdds)) {
      best.nrfiOdds = noOutcome.price
      best.nrfiBook = bookmaker.key
    }
    if (betterAmericanOdds(yesOutcome.price, best.yrfiOdds)) {
      best.yrfiOdds = yesOutcome.price
      best.yrfiBook = bookmaker.key
    }
  }

  if (!best) return null
  return {
    nrfiOdds: best.nrfiOdds,
    yrfiOdds: best.yrfiOdds,
    bookmaker: best.nrfiBook === best.yrfiBook ? best.nrfiBook : `${best.nrfiBook}/${best.yrfiBook}`,
  }
}
