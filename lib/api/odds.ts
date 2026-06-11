const BASE_URL = "https://api.the-odds-api.com/v4"
const API_KEY = process.env.THE_ODDS_API_KEY ?? ""

const SGO_BASE_URL = "https://api.sportsgameodds.com/v2"
const SGO_API_KEY = process.env.SPORTS_GAME_ODDS_API_KEY ?? ""

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

// ─── SportsGameOdds source ────────────────────────────────────────────────────

interface SGOOddsEntry {
  bookOdds: string | null
}

interface SGOEvent {
  eventID: string
  teams: {
    home: { names: { long: string } }
    away: { names: { long: string } }
  }
  odds: Record<string, SGOOddsEntry>
}

/**
 * Fetch NRFI/YRFI odds from SportsGameOdds (free tier includes 1st-inning O/U).
 * Normalises to the same OddsEvent shape used by The Odds API integration so
 * all downstream matching and extraction code works unchanged.
 *
 * Market keys:
 *   points-all-1i-ou-under  → NRFI (under 0.5 first-inning runs)
 *   points-all-1i-ou-over   → YRFI (over 0.5 first-inning runs)
 */
async function fetchAllNrfiOddsSGO(): Promise<OddsEvent[]> {
  if (!SGO_API_KEY) return []
  try {
    const res = await fetch(
      `${SGO_BASE_URL}/events/?sportID=BASEBALL&leagueID=MLB&oddsAvailable=true`,
      {
        headers: { "X-Api-Key": SGO_API_KEY },
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) {
      console.error(`[odds/sgo] HTTP ${res.status}`)
      return []
    }
    const data = await res.json()
    const events: SGOEvent[] = Array.isArray(data?.data) ? data.data : []

    const result: OddsEvent[] = []
    for (const e of events) {
      const under = e.odds["points-all-1i-ou-under"]
      const over  = e.odds["points-all-1i-ou-over"]
      if (!under?.bookOdds || !over?.bookOdds) continue
      const nrfiPrice = parseInt(under.bookOdds, 10)
      const yrfiPrice = parseInt(over.bookOdds, 10)
      if (isNaN(nrfiPrice) || isNaN(yrfiPrice)) continue
      result.push({
        id: e.eventID,
        home_team: e.teams.home.names.long,
        away_team: e.teams.away.names.long,
        bookmakers: [{
          key: "sportsgameodds",
          markets: [{
            key: "batter_first_inning_scored",
            outcomes: [
              { name: "Yes", price: yrfiPrice },  // YRFI = over 0.5
              { name: "No",  price: nrfiPrice },  // NRFI = under 0.5
            ],
          }],
        }],
      })
    }
    return result
  } catch (err) {
    console.error("[odds/sgo] fetch error:", err instanceof Error ? err.message : String(err))
    return []
  }
}

// ─── Public fetch (SGO preferred, The Odds API fallback) ─────────────────────

export async function fetchAllNrfiOdds(): Promise<OddsEvent[]> {
  // SportsGameOdds carries NRFI/YRFI on its free tier — try it first.
  if (SGO_API_KEY) {
    const sgoOdds = await fetchAllNrfiOddsSGO()
    if (sgoOdds.length > 0) return sgoOdds
    console.warn("[odds/sgo] returned 0 events — falling back to The Odds API")
  }

  if (!API_KEY) {
    console.warn("[odds] No odds API key set — skipping odds fetch")
    return []
  }
  const url =
    `${BASE_URL}/sports/baseball_mlb/odds` +
    `?regions=us&markets=batter_first_inning_scored&oddsFormat=american&apiKey=${encodeURIComponent(API_KEY)}`
  try {
    const res = await fetch(url, { next: { revalidate: 60 }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) {
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
