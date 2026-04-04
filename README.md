# NRFI/YRFI Prediction Engine

> **Advanced Poisson-based first-inning run probability calculator for MLB.**

Predicts whether a game's first inning will produce zero runs (NRFI) or at least one run (YRFI), using a multi-factor statistical model built on pitcher first-inning NRFI rates, opposing lineup offense factors, park factors, weather, and recent form. Includes value-bet identification via Kelly Criterion.

---

## Table of Contents

1. [What is NRFI/YRFI](#what-is-nrfiyrfi)
2. [How the Model Works](#how-the-model-works)
3. [Features](#features)
4. [Quick Start](#quick-start)
5. [API Integrations](#api-integrations)
6. [Environment Variables](#environment-variables)
7. [Architecture](#architecture)
8. [Project Structure](#project-structure)
9. [Configuration](#configuration)
10. [Connecting Live Data](#connecting-live-data)
11. [Tech Stack](#tech-stack)
12. [License](#license)

---

## What is NRFI/YRFI

**NRFI** (No Run First Inning) and **YRFI** (Yes Run First Inning) are MLB betting markets that resolve entirely on whether any run is scored in the first inning of a game — by either team.

| Outcome | Condition |
|---|---|
| **NRFI** | Neither team scores in the 1st inning |
| **YRFI** | At least one team scores in the 1st inning |

These markets are popular because:
- They resolve in under 30 minutes regardless of game length
- They are heavily dependent on starting pitcher quality (top of the batting order, fresh arms)
- Bookmakers frequently misprice them relative to underlying pitcher stats

Historically, **~60% of MLB first innings produce zero runs**, making NRFI the slight favorite in most matchups — but this varies dramatically based on pitcher, ballpark, lineup, and weather.

---

## How the Model Works

The engine uses a **Poisson scoring model**. For each half-inning, the expected runs (λ) are derived from the opposing pitcher's historical NRFI rate and adjusted for contextual factors:

```
λ = −ln(pitcherNrfiRate) × offenseFactor × parkFactor × weatherMultiplier × recentFormMultiplier

P(team scores 0) = e^(−λ)          [Poisson PMF at k=0]

P(NRFI) = P(home scores 0) × P(away scores 0)
P(YRFI) = 1 − P(NRFI)
```

### Factor Breakdown

| Factor | Source | Effect |
|---|---|---|
| `pitcherNrfiRate` | Season NRFI % for that pitcher | Base λ via Poisson inversion |
| `offenseFactor` | Team's 1st-inning runs relative to league avg | Scales λ up/down |
| `parkFactor` | Ballpark run environment (1.0 = neutral) | Scales λ up/down |
| `weatherMultiplier` | Wind direction/speed, temperature | Scales λ up/down |
| `recentFormMultiplier` | Last-5-start NRFI results (30% weight) | Blended with season rate |

### Confidence Score

Confidence (0–100) is calculated from:
- **Distance from 50%** — predictions further from a coin flip earn higher confidence
- **Sample size** — pitchers with ≥18 starts get a bonus
- **Form consistency** — low variance over last 5 starts increases confidence

Scores ≥ 68 → **High** | 45–67 → **Medium** | < 45 → **Low**

### Value Bet Identification

For games with bookmaker odds, the engine calculates:

```
edge = modelProbability − impliedProbability(odds)
```

A value bet is flagged when `edge ≥ 3%`. Position size is determined by **Kelly Criterion** (25% fractional):

```
kellyFraction = ((b × p − q) / b) × 0.25

where b = decimal odds − 1, p = model probability, q = 1 − p
```

---

## Features

### Game Predictions
- Per-game NRFI probability with full Poisson model breakdown
- Expected runs (λ) for each team's half-inning
- Probability of each team scoring zero
- Recommendation tier: STRONG NRFI / LEAN NRFI / TOSS-UP / LEAN YRFI / STRONG YRFI
- Expandable factor list explaining each model input

### Value Analysis
- Bookmaker odds vs. model probability comparison
- Edge in percentage points
- Kelly Criterion bet sizing
- Expected value (EV) calculation

### Pitcher Analysis
- Season first-inning NRFI rate
- First-inning ERA, WHIP, K%, BB%, HR/9
- First batter OBP
- Last-5-start form (NRFI / YRFI dots)
- Home/away NRFI splits

### Team Analysis
- Season YRFI rate (how often each team scores in the 1st)
- First-inning OPS and wOBA
- Home/away YRFI splits
- Last-10-game YRFI trend with directional arrow

### Filters & Sorting
- Filter by confidence level, recommendation, league, value-only
- Sort by time, probability, confidence, or edge size

### Historical Tracker
- Prediction log with actual results
- Per-prediction P/L in flat-stake units
- Monthly accuracy and ROI
- High-confidence vs. overall accuracy comparison

---

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Installation

```bash
git clone https://github.com/joeydd032995-pixel/v0-mlb-betting-analytics.git
cd v0-mlb-betting-analytics

pnpm install
```

### Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production Build

```bash
pnpm build
pnpm start
```

### Environment Setup

```bash
cp .env.example .env.local
# Fill in your API keys — see API Integrations section below
```

---

## API Integrations

The app ships with **realistic mock data** that powers the full UI. To enable live predictions, connect the four external APIs below.

---

### 1. MLB Stats API (Free — No Key Required)

The official MLB Stats API provides game schedules, starting pitcher assignments, team rosters, and real-time game data.

**Base URL:** `https://statsapi.mlb.com/api/v1`

**Key Endpoints:**

| Endpoint | Purpose |
|---|---|
| `GET /schedule?sportId=1&date=YYYY-MM-DD` | Today's game slate with team and pitcher IDs |
| `GET /people/{personId}/stats?stats=statSplits&group=pitching` | Pitcher stat splits |
| `GET /teams/{teamId}/stats?stats=season&group=hitting` | Team hitting stats |
| `GET /game/{gamePk}/linescore` | Live linescore (for result tracking) |

**Example — Fetch today's schedule:**

```typescript
// lib/api/mlb.ts
const MLB_BASE = "https://statsapi.mlb.com/api/v1"

export async function fetchTodayGames(date: string) {
  const res = await fetch(
    `${MLB_BASE}/schedule?sportId=1&date=${date}&hydrate=team,probablePitcher,linescore`,
    { next: { revalidate: 300 } }  // cache 5 min
  )
  const data = await res.json()
  return data.dates?.[0]?.games ?? []
}

export async function fetchPitcherStats(pitcherId: number, season: number) {
  const res = await fetch(
    `${MLB_BASE}/people/${pitcherId}/stats?stats=statSplits&group=pitching&season=${season}&sitCodes=1`
  )
  const data = await res.json()
  // sitCodes=1 filters to first-inning stats
  return data.stats?.[0]?.splits ?? []
}
```

**No API key required.** Rate limit: ~unlimited for reasonable usage.

---

### 2. The Odds API

Provides NRFI/YRFI odds from DraftKings, FanDuel, BetMGM, Caesars, and others.

**Website:** [the-odds-api.com](https://the-odds-api.com)  
**Free tier:** 500 requests/month  
**Paid plans:** from $19/month for 10,000 requests

**Env variable:** `THE_ODDS_API_KEY`

**Key Endpoints:**

| Endpoint | Purpose |
|---|---|
| `GET /v4/sports/baseball_mlb/events` | Today's MLB event IDs |
| `GET /v4/sports/baseball_mlb/odds?markets=batter_first_inning_scored` | NRFI/YRFI odds |
| `GET /v4/sports/baseball_mlb/events/{eventId}/odds?markets=batter_first_inning_scored` | Odds for specific game |

**Example:**

```typescript
// lib/api/odds.ts
const ODDS_BASE = "https://api.the-odds-api.com/v4"

export async function fetchNrfiOdds(eventId: string) {
  const res = await fetch(
    `${ODDS_BASE}/sports/baseball_mlb/events/${eventId}/odds` +
    `?apiKey=${process.env.THE_ODDS_API_KEY}` +
    `&regions=us&markets=batter_first_inning_scored&oddsFormat=american`
  )
  const data = await res.json()
  return data.bookmakers ?? []
}
```

> **Note:** Market key for NRFI/YRFI is `batter_first_inning_scored`. Check The Odds API docs for the exact market slug, as it may vary by bookmaker.

---

### 3. OpenWeatherMap API

Provides current and forecast weather for MLB stadium locations.

**Website:** [openweathermap.org/api](https://openweathermap.org/api)  
**Free tier:** 1,000 calls/day (Current Weather API)  
**Paid plans:** from $40/month for forecasts

**Env variable:** `OPENWEATHER_API_KEY`

**Key Endpoint:**

| Endpoint | Purpose |
|---|---|
| `GET /data/2.5/weather?lat={lat}&lon={lon}` | Current weather at stadium coordinates |
| `GET /data/2.5/forecast?lat={lat}&lon={lon}` | 5-day / 3-hour forecast |

**Stadium Coordinates (pre-configured in the app):**

```typescript
// lib/constants/stadiums.ts
export const STADIUM_COORDS: Record<string, { lat: number; lon: number; dome: boolean }> = {
  "loanDepot Park":      { lat: 25.7781, lon: -80.2197, dome: true  },
  "Petco Park":          { lat: 32.7073, lon: -117.1566, dome: false },
  "Busch Stadium":       { lat: 38.6226, lon: -90.1928, dome: false },
  "Yankee Stadium":      { lat: 40.8296, lon: -73.9262, dome: false },
  "Wrigley Field":       { lat: 41.9484, lon: -87.6553, dome: false },
  "Globe Life Field":    { lat: 32.7512, lon: -97.0832, dome: false },
  // ... add all 30 stadiums
}

export async function fetchGameWeather(venue: string, gameTime: string) {
  const coords = STADIUM_COORDS[venue]
  if (!coords || coords.dome) return { conditions: "dome" as const }

  const res = await fetch(
    `https://api.openweathermap.org/data/2.5/weather` +
    `?lat=${coords.lat}&lon=${coords.lon}` +
    `&appid=${process.env.OPENWEATHER_API_KEY}&units=imperial`
  )
  const data = await res.json()
  return {
    temperature: Math.round(data.main.temp),
    windSpeed: Math.round(data.wind.speed),
    windDirection: mapWindDir(data.wind.deg, venue),
    conditions: mapConditions(data.weather[0].id),
    humidity: data.main.humidity,
  }
}
```

---

### 4. Sports Data IO — MLB API (Optional, Enhanced Stats)

For deeper first-inning stat splits not available from the free MLB Stats API.

**Website:** [sportsdata.io](https://sportsdata.io/mlb-api)  
**Free trial:** 1,000 calls  
**Paid plans:** from $9/month

**Env variable:** `SPORTSDATA_API_KEY`

**Key Endpoints:**

| Endpoint | Purpose |
|---|---|
| `GET /v3/mlb/stats/json/PitcherGameStatsByDate/{date}` | Per-game pitcher stats |
| `GET /v3/mlb/stats/json/PlayerSeasonStats/{season}` | Full season pitcher splits |
| `GET /v3/mlb/scores/json/GamesByDate/{date}` | Confirmed starters + weather |

**Example:**

```typescript
const SPORTSDATA_BASE = "https://api.sportsdata.io/v3/mlb"

export async function fetchPitcherSplits(playerId: number, season: number) {
  const res = await fetch(
    `${SPORTSDATA_BASE}/stats/json/PlayerSeasonStatsByPlayer/${season}/${playerId}`,
    { headers: { "Ocp-Apim-Subscription-Key": process.env.SPORTSDATA_API_KEY! } }
  )
  return res.json()
}
```

---

### API Call Budget (Daily Estimates)

| API | Calls/Day | Free Tier Limit | Notes |
|---|---|---|---|
| MLB Stats API | ~50 | Unlimited | Schedule + pitcher stats |
| The Odds API | ~30 | 500/month | NRFI/YRFI odds per game |
| OpenWeatherMap | ~30 | 1,000/day | 1 call per outdoor stadium |
| Sports Data IO | ~15 | 1,000 trial | Optional — enhanced splits |

**Total estimated daily calls: ~125** — well within all free tiers for daily use.

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `THE_ODDS_API_KEY` | For value bets | NRFI/YRFI odds from 40+ bookmakers |
| `OPENWEATHER_API_KEY` | For weather | Stadium weather at game time |
| `SPORTSDATA_API_KEY` | Optional | Enhanced first-inning stat splits |
| `MLB_STATS_API_BASE` | Optional | Override MLB API base URL |
| `NEXT_PUBLIC_APP_URL` | Optional | Full URL for metadata/OG images |

See `.env.example` for the complete list with descriptions.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     app/page.tsx (Client)                    │
│   Tabs: Today's Games │ Pitchers │ Teams │ History           │
└────────────────────────────┬────────────────────────────────┘
                             │
              ┌──────────────▼──────────────┐
              │    lib/nrfi-engine.ts        │
              │  computeAllPredictions()     │
              │  ─────────────────────────  │
              │  Poisson Model               │
              │  λ = −ln(nrfiRate)          │
              │    × offenseFactor          │
              │    × parkFactor             │
              │    × weatherMultiplier      │
              │    × recentFormMultiplier   │
              │                             │
              │  P(NRFI) = e^−λA × e^−λB   │
              └─────┬────────────┬──────────┘
                    │            │
          ┌─────────▼──┐   ┌────▼──────────┐
          │ lib/mock-  │   │ lib/types.ts   │
          │ data.ts    │   │ Full type      │
          │ (swap for  │   │ definitions    │
          │ live APIs) │   └───────────────┘
          └─────┬──────┘
                │ replaces with ↓
   ┌────────────┴─────────────────────────────┐
   │           Live API Layer                  │
   │  ┌─────────────┐  ┌────────────────────┐ │
   │  │ MLB Stats   │  │ The Odds API       │ │
   │  │ API (free)  │  │ (NRFI/YRFI odds)   │ │
   │  └─────────────┘  └────────────────────┘ │
   │  ┌─────────────┐  ┌────────────────────┐ │
   │  │ OpenWeather │  │ Sports Data IO     │ │
   │  │ (weather)   │  │ (enhanced splits)  │ │
   │  └─────────────┘  └────────────────────┘ │
   └──────────────────────────────────────────┘
```

---

## Project Structure

```
v0-mlb-betting-analytics/
├── app/
│   ├── layout.tsx               # Root layout (no Google Fonts — uses CSS vars)
│   ├── page.tsx                 # Main dashboard — all tabs, filters, game grid
│   ├── globals.css              # Tailwind base + dark-mode CSS variables
│   └── bankroll/
│       └── page.tsx             # Redirects to /
│
├── components/
│   ├── ui/                      # shadcn/ui base components
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   └── tabs.tsx
│   │
│   ├── game-prediction-card.tsx # Per-game NRFI card with probability bar,
│   │                            #   factor list, value analysis, form dots
│   ├── prediction-header.tsx    # 5-stat summary (accuracy, games, conf, value, ROI)
│   ├── pitcher-stats.tsx        # Pitcher rankings table with 1st-inning stats
│   ├── team-stats.tsx           # Team YRFI rate rankings table
│   ├── history-table.tsx        # Historical prediction log + accuracy summary
│   └── theme-provider.tsx       # next-themes wrapper
│
├── lib/
│   ├── types.ts                 # All TypeScript interfaces
│   ├── nrfi-engine.ts           # Core Poisson prediction engine
│   ├── mock-data.ts             # Realistic mock data (swap for live API calls)
│   └── utils.ts                 # cn() utility for className merging
│
├── .env.example                 # All environment variables documented
├── next.config.mjs              # Next.js config (TS errors ignored at build)
├── tailwind.config.ts           # Tailwind v4 config
├── tsconfig.json
└── package.json
```

---

## Configuration

### Model Parameters

Core Poisson model constants live in `lib/nrfi-engine.ts`:

```typescript
// Minimum edge before recommending a bet (3%)
const MIN_KELLY_EDGE = 0.03

// Fractional Kelly multiplier for position sizing (25%)
const KELLY_FRACTION = 0.25
```

### Weather Multiplier Tuning

```typescript
// In computeWeatherMultiplier()
// Wind blowing OUT: +0.45% per mph above 5 mph
multiplier += (weather.windSpeed - 5) * 0.0045

// Wind blowing IN: −0.30% per mph above 5 mph  
multiplier -= (weather.windSpeed - 5) * 0.003

// Temperature: cold (<50°F) suppresses scoring
multiplier -= (50 - weather.temperature) * 0.003

// Temperature: hot (>85°F) carries balls further
multiplier += (weather.temperature - 85) * 0.002
```

### Confidence Thresholds

```typescript
// In computeConfidence()
score >= 68  → "High"   confidence
score 45–67  → "Medium" confidence
score < 45   → "Low"    confidence
```

Adjust these thresholds in `nrfi-engine.ts` to control how aggressively High confidence is assigned.

### Recommendation Tiers

```typescript
// In getRecommendation()
nrfiProbability >= 0.65  → "STRONG_NRFI"
nrfiProbability >= 0.57  → "LEAN_NRFI"
nrfiProbability >= 0.47  → "TOSS_UP"
nrfiProbability >= 0.38  → "LEAN_YRFI"
nrfiProbability <  0.38  → "STRONG_YRFI"
```

---

## Connecting Live Data

### Step 1 — Replace mock-data with API calls

Create a new file `lib/api/live-data.ts`:

```typescript
import { fetchTodayGames } from "./mlb"
import { fetchNrfiOdds } from "./odds"
import { fetchGameWeather } from "./weather"
import type { Game, Pitcher, Team } from "../types"

export async function getLiveGameSlate(date: string): Promise<{
  games: Game[]
  pitchers: Map<string, Pitcher>
  teams: Map<string, Team>
}> {
  const mlbGames = await fetchTodayGames(date)
  
  const games: Game[] = await Promise.all(
    mlbGames.map(async (g: any) => {
      const weather = await fetchGameWeather(g.venue.name, g.gameDate)
      const odds = await fetchNrfiOdds(g.gamePk.toString())
      
      return {
        id: g.gamePk.toString(),
        date,
        time: formatGameTime(g.gameDate),
        timeZone: "ET",
        homeTeamId: g.teams.home.team.id.toString(),
        awayTeamId: g.teams.away.team.id.toString(),
        homePitcherId: g.teams.home.probablePitcher?.id?.toString() ?? "tbd",
        awayPitcherId: g.teams.away.probablePitcher?.id?.toString() ?? "tbd",
        venue: g.venue.name,
        parkFactor: PARK_FACTORS[g.venue.id] ?? 1.0,
        weather,
        odds: odds[0] ? parseNrfiOdds(odds[0]) : undefined,
      }
    })
  )

  // Fetch pitcher and team stats...
  const pitchers = await buildPitcherMap(games)
  const teams = await buildTeamMap(games)

  return { games, pitchers, teams }
}
```

### Step 2 — Add a Next.js API Route

```typescript
// app/api/predictions/route.ts
import { getLiveGameSlate } from "@/lib/api/live-data"
import { computeAllPredictions } from "@/lib/nrfi-engine"
import { format } from "date-fns"

export async function GET() {
  const today = format(new Date(), "yyyy-MM-dd")
  const { games, pitchers, teams } = await getLiveGameSlate(today)
  const predictions = computeAllPredictions(games, pitchers, teams)
  
  return Response.json({ predictions, games, date: today })
}

export const revalidate = 300  // Re-fetch every 5 minutes
```

### Step 3 — Update the Client

```typescript
// app/page.tsx — replace useMemo with useSWR
import useSWR from "swr"

const { data } = useSWR("/api/predictions", (url) => fetch(url).then(r => r.json()), {
  refreshInterval: 300_000  // auto-refresh every 5 min
})
```

---

## Pitcher NRFI Rate Calculation

To compute a pitcher's NRFI rate from raw MLB Stats API data, filter for first-inning events only. The MLB Stats API returns inning-by-inning data via the Game Feed endpoint:

```typescript
// GET https://statsapi.mlb.com/api/v1.1/game/{gamePk}/feed/live
// Look inside data.liveData.plays.playsByInning[0] for first-inning events

function computePitcherNrfiRate(gameLogs: GameLog[]): number {
  const firstInningStarts = gameLogs.filter(g => g.inning === 1 && g.isStarter)
  const nrfiCount = firstInningStarts.filter(g => g.runsAllowed === 0).length
  return nrfiCount / firstInningStarts.length
}
```

For current-season first-inning ERA, use the `statSplits` endpoint with `sitCodes=1` (first inning):

```
GET /api/v1/people/{pitcherId}/stats?stats=statSplits&group=pitching&sitCodes=1&season=2025
```

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js | 16.0.10 |
| UI Library | React | 19.2.0 |
| Language | TypeScript | 5.0.x |
| Styling | Tailwind CSS | v4.1.9 |
| Components | shadcn/ui + Radix UI | — |
| Icons | Lucide React | 0.454.0 |
| Analytics | Vercel Analytics | 1.3.1 |
| Package Manager | pnpm | — |

---

## Deployment

### Vercel (Recommended)

```bash
pnpm build  # Verify build passes locally
```

Then connect the repo to [vercel.com](https://vercel.com) and add environment variables in the Vercel dashboard.

### Environment Variables in Vercel

Go to **Project Settings → Environment Variables** and add:
- `THE_ODDS_API_KEY`
- `OPENWEATHER_API_KEY`
- `SPORTSDATA_API_KEY` (optional)
- `NEXT_PUBLIC_APP_URL` → your deployed URL

---

## Disclaimer

This tool is intended for informational and educational purposes. NRFI/YRFI probabilities are statistical estimates and do not guarantee outcomes. Sports betting involves risk; never wager more than you can afford to lose. Verify that sports betting is legal in your jurisdiction before participating.

---

## License

MIT © 2025
