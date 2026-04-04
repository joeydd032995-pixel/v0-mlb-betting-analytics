/**
 * Debug endpoint — returns raw API-Sports responses to diagnose
 * league IDs and season parameters.
 *
 * GET /api/debug
 */
import { NextResponse } from "next/server"

const BASE = "https://v1.baseball.api-sports.io"

async function apiGet(path: string) {
  const key = process.env.API_SPORTS_KEY ?? ""
  if (!key) return { error: "API_SPORTS_KEY not set" }
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "x-apisports-key": key },
      cache: "no-store",
    })
    const text = await res.text()
    try {
      return { status: res.status, data: JSON.parse(text) }
    } catch {
      return { status: res.status, raw: text.slice(0, 500) }
    }
  } catch (e) {
    return { error: String(e) }
  }
}

export const dynamic = "force-dynamic"

export async function GET() {
  const today = new Date().toISOString().split("T")[0]

  const [leagues, gamesLeague1, gamesLeague2, status] = await Promise.all([
    apiGet("/leagues"),
    apiGet(`/games?league=1&season=2026&date=${today}`),
    apiGet(`/games?league=2&season=2026&date=${today}`),
    apiGet("/status"),
  ])

  return NextResponse.json({
    today,
    apiKey: process.env.API_SPORTS_KEY ? "SET ✓" : "MISSING ✗",
    status,
    leagues,
    gamesLeague1_2026: gamesLeague1,
    gamesLeague2_2026: gamesLeague2,
  })
}
