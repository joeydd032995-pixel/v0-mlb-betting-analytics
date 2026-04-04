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
  try {
    const url = `${BASE_URL}/sports/baseball_mlb/odds?apiKey=${API_KEY}&regions=us&markets=batter_first_inning_scored&oddsFormat=american`
    const res = await fetch(url, { next: { revalidate: 60 } })
    if (!res.ok) {
      console.error(`[odds] HTTP ${res.status}`)
      return []
    }
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch (err) {
    console.error("[odds] fetch error:", err)
    return []
  }
}

export function extractNrfiOdds(
  event: OddsEvent
): { nrfiOdds: number; yrfiOdds: number; bookmaker: string } | null {
  for (const bookmaker of event.bookmakers) {
    const market = bookmaker.markets.find((m) => m.key === "batter_first_inning_scored")
    if (!market) continue

    const yesOutcome = market.outcomes.find((o) => o.name === "Yes")
    const noOutcome = market.outcomes.find((o) => o.name === "No")

    if (yesOutcome && noOutcome) {
      return {
        nrfiOdds: noOutcome.price,
        yrfiOdds: yesOutcome.price,
        bookmaker: bookmaker.key,
      }
    }
  }
  return null
}
