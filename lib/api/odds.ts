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
  // Build URL separately so the key never appears in logged error messages.
  const url =
    `${BASE_URL}/sports/baseball_mlb/odds` +
    `?regions=us&markets=batter_first_inning_scored&oddsFormat=american&apiKey=${API_KEY}`
  try {
    const res = await fetch(url, { next: { revalidate: 60 } })
    if (!res.ok) {
      // Log status and remaining quota header only — never log the full URL.
      const remaining = res.headers.get("x-requests-remaining") ?? "unknown"
      console.error(`[odds] HTTP ${res.status} — requests remaining: ${remaining}`)
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
