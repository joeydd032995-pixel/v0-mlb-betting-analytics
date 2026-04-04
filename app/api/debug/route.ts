/**
 * Debug endpoint — diagnoses API-Sports connectivity and league ID issues.
 * GET /api/debug
 */
import { NextResponse } from "next/server"

const BASE = process.env.API_SPORTS_BASE_URL ?? "https://v1.baseball.api-sports.io"
const SEASON = process.env.NEXT_PUBLIC_MLB_SEASON ?? "2026"

function buildHeaders(): HeadersInit {
  const key = process.env.API_SPORTS_KEY ?? ""
  if (process.env.API_SPORTS_RAPIDAPI_HOST) {
    return {
      "x-rapidapi-key": key,
      "x-rapidapi-host": process.env.API_SPORTS_RAPIDAPI_HOST,
    }
  }
  return { "x-apisports-key": key }
}

async function apiGet(path: string) {
  if (!process.env.API_SPORTS_KEY) return { error: "API_SPORTS_KEY not set" }
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: buildHeaders(),
      cache: "no-store",
    })
    const text = await res.text()
    try {
      const json = JSON.parse(text)
      return { status: res.status, results: json.results ?? null, errors: json.errors ?? null, response: json.response }
    } catch {
      return { status: res.status, raw: text.slice(0, 800) }
    }
  } catch (e) {
    return { fetchError: String(e) }
  }
}

export const dynamic = "force-dynamic"

export async function GET() {
  const today = new Date().toISOString().split("T")[0]

  // Try leagues to find correct MLB ID, and try several league IDs for today's games
  const [status, leagues, gL1, gL2, gL3, gL4] = await Promise.all([
    apiGet("/status"),
    apiGet("/leagues?name=MLB"),
    apiGet(`/games?league=1&season=${SEASON}&date=${today}`),
    apiGet(`/games?league=2&season=${SEASON}&date=${today}`),
    apiGet(`/games?league=3&season=${SEASON}&date=${today}`),
    apiGet(`/games?league=4&season=${SEASON}&date=${today}`),
  ])

  return NextResponse.json({
    env: {
      API_SPORTS_KEY: process.env.API_SPORTS_KEY ? "SET ✓" : "MISSING ✗",
      API_SPORTS_BASE_URL: BASE,
      API_SPORTS_LEAGUE_ID: process.env.API_SPORTS_LEAGUE_ID ?? "(default: 1)",
      API_SPORTS_RAPIDAPI_HOST: process.env.API_SPORTS_RAPIDAPI_HOST ?? "(not set — using direct api-sports.io)",
      NEXT_PUBLIC_MLB_SEASON: SEASON,
    },
    today,
    status,
    mlbLeaguesSearch: leagues,
    gameAttempts: {
      league_1: gL1,
      league_2: gL2,
      league_3: gL3,
      league_4: gL4,
    },
  }, { headers: { "Content-Type": "application/json" } })
}
