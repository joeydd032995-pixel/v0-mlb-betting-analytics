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

The app ships with **realistic mock data** that powers the full UI. To enable live predictions, connect the following APIs:
- **Required:** The Odds API + OpenWeatherMap
- **Built-in (no auth):** MLB Stats API
- **Optional:** SportsBlaze

---

### 1. The Odds API

Provides NRFI/YRFI odds from DraftKings, FanDuel, BetMGM, Caesars, and 40+ bookmakers.

**Website:** [the-odds-api.com](https://the-odds-api.com)  
**Docs:** [the-odds-api.com/liveapi/guides/v4/](https://the-odds-api.com/liveapi/guides/v4/)  
**Free tier:** 500 requests/month  
**Env variable:** `THE_ODDS_API_KEY`

**Key Endpoints:**

| Endpoint | Purpose |
|---|---|
| `GET /v4/sports/baseball_mlb/events` | Today's MLB event IDs |
| `GET /v4/sports/baseball_mlb/odds?markets=batter_first_inning_scored` | NRFI/YRFI odds for all games |
| `GET /v4/sports/baseball_mlb/events/{eventId}/odds` | Odds for a specific game |

**Example:**

```typescript
// lib/api/odds.ts
const ODDS_BASE = "https://api.the-odds-api.com/v4"

export async function fetchNrfiOdds(eventId?: string) {
  const url = eventId
    ? `${ODDS_BASE}/sports/baseball_mlb/events/${eventId}/odds`
    : `${ODDS_BASE}/sports/baseball_mlb/odds`

  const res = await fetch(
    `${url}?apiKey=${process.env.THE_ODDS_API_KEY}` +
    `&regions=us&markets=batter_first_inning_scored&oddsFormat=american`,
    { next: { revalidate: 60 } }
  )
  const data = await res.json()
  return data.bookmakers ?? data ?? []
}
```

> **Market key:** `batter_first_inning_scored` is the NRFI/YRFI prop market.

---

### 2. OpenWeatherMap API

Provides current and forecast weather at each MLB stadium's GPS coordinates.

**Website:** [openweathermap.org/api](https://openweathermap.org/api)  
**Free tier:** 1,000 calls/day  
**Env variable:** `OPENWEATHER_API_KEY`

**Key Endpoints:**

| Endpoint | Purpose |
|---|---|
| `GET /data/2.5/weather?lat={lat}&lon={lon}&appid={key}&units=imperial` | Current weather at stadium |
| `GET /data/3.0/onecall?lat={lat}&lon={lon}&appid={key}` | Hourly forecast for game-time weather |

**Stadium Coordinates (pre-configured):**

```typescript
// lib/constants/stadiums.ts
export const STADIUM_COORDS: Record<string, { lat: number; lon: number; dome: boolean }> = {
  "loanDepot Park":   { lat: 25.7781, lon: -80.2197, dome: true  },
  "Petco Park":       { lat: 32.7073, lon: -117.1566, dome: false },
  "Busch Stadium":    { lat: 38.6226, lon: -90.1928,  dome: false },
  "Yankee Stadium":   { lat: 40.8296, lon: -73.9262,  dome: false },
  "Wrigley Field":    { lat: 41.9484, lon: -87.6553,  dome: false },
  "Globe Life Field": { lat: 32.7512, lon: -97.0832,  dome: false },
  // ... add all 30 stadiums
}

export async function fetchGameWeather(venue: string) {
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

### 3. MLB Stats API

**Official free API from MLB.com** — provides game schedules, starting pitchers, pitcher stats, and team statistics. No authentication or API key required.

**Website:** [statsapi.mlb.com](https://statsapi.mlb.com)  
**Docs:** [github.com/toddrob99/MLB-StatsAPI](https://github.com/toddrob99/MLB-StatsAPI)  
**Auth:** None — completely free and unlimited  
**Env variable:** None required ✓

**Advantages:**
- ✓ Completely free (no API key, no plan tiers)
- ✓ No seasonal restrictions (access 2026 and all current seasons)
- ✓ Official MLB.com data source
- ✓ Unlimited requests (reasonable rate-limiting expected)

**Key Endpoints:**

| Endpoint | Purpose |
|---|---|
| `GET /schedule?sportId=1&date=YYYY-MM-DD` | Today's MLB game slate with probable starters |
| `GET /people/{pitcherId}?hydrate=stats(group=[pitching])` | Pitcher season stats (ERA, WHIP, strikeouts, walks) |
| `GET /teams/{teamId}?hydrate=stats` | Team season stats (AVG, OBP, SLG, OPS) |
| `GET /game/{gamePk}/feed/live` | Live/completed game with play-by-play data |

**Example:**

```typescript
// lib/api/mlb-stats.ts
const BASE_URL = "https://statsapi.mlb.com/api/v1"

export async function fetchGamesByDate(date: string) {
  const res = await fetch(`${BASE_URL}/schedule?sportId=1&date=${date}`, {
    next: { revalidate: 300 },
  })
  const data = await res.json()
  return data.dates?.[0]?.games ?? []
}

export async function fetchPitcherStats(playerId: number) {
  const res = await fetch(
    `${BASE_URL}/people/${playerId}?hydrate=stats(group=[pitching])`,
    { next: { revalidate: 3600 } }
  )
  const data = await res.json()
  const pitcher = data.people?.[0]
  return pitcher?.seasonStats?.pitching ?? null
}

export async function fetchTeamStats(teamId: number) {
  const res = await fetch(`${BASE_URL}/teams/${teamId}?hydrate=stats`, {
    next: { revalidate: 3600 },
  })
  const data = await res.json()
  const hittingStats = data.stats?.find(s => s.type.displayName === "season")?.stats ?? {}
  return { stats: { hitting: hittingStats } }
}
```

---

### 4. SportsBlaze API (Optional — Enhanced Analytics)

Advanced MLB batting splits, pitcher xStats, and matchup-level analytics.

**Website:** [sportsblaze.com](https://sportsblaze.com)  
**Docs:** [docs.sportsblaze.com](https://docs.sportsblaze.com)  
**Auth:** Query parameter `?key=YOUR_KEY`  
**Env variable:** `SPORTSBLAZE_API_KEY`

**Example:**

```typescript
// lib/api/sportsblaze.ts
const BASE = process.env.SPORTSBLAZE_BASE_URL ?? "https://api.sportsblaze.com"

export async function fetchPitcherSplits(playerId: string) {
  const res = await fetch(
    `${BASE}/mlb/v1/players/${playerId}/splits?key=${process.env.SPORTSBLAZE_API_KEY}`,
    { next: { revalidate: 300 } }
  )
  return res.json()
}
```

> If `SPORTSBLAZE_API_KEY` is not set, the engine falls back to API-Sports data.

---

### API Call Budget (Daily Estimates)

| API | Calls/Day | Free Tier Limit | Notes |
|---|---|---|---|
| The Odds API | ~30 | ~16/day (500/mo) | NRFI/YRFI odds per game |
| OpenWeatherMap | ~20 | 1,000/day | 1 call per outdoor stadium |
| **MLB Stats API** | **~40** | **Unlimited** | **Schedule + pitcher stats (no auth)** |
| SportsBlaze | ~15 | varies | Optional enhanced splits |

> **Cost savings:** MLB Stats API is completely free and unlimited, replacing the need to upgrade API-Sports. No plan restrictions or seasonal blocking.

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `THE_ODDS_API_KEY` | ✓ Yes | NRFI/YRFI odds from 40+ bookmakers |
| `OPENWEATHER_API_KEY` | ✓ Yes | Stadium weather at game time |
| `SPORTSBLAZE_API_KEY` | Optional | Enhanced batting splits and xStats |
| `NEXT_PUBLIC_APP_URL` | Optional | Full URL for metadata/OG images |

**Note:** No API key is needed for MLB game data — the app uses the free, official MLB Stats API (`statsapi.mlb.com`) which requires no authentication.

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
GET /api/v1/people/{pitcherId}/stats?stats=statSplits&group=pitching&sitCodes=1&season=2026
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
- `THE_ODDS_API_KEY` ✓ Required
- `OPENWEATHER_API_KEY` ✓ Required
- `SPORTSBLAZE_API_KEY` (optional)
- `NEXT_PUBLIC_APP_URL` → your deployed URL

No API key needed for MLB game data (uses free MLB Stats API).

---

## Disclaimer

This tool is intended for informational and educational purposes. NRFI/YRFI probabilities are statistical estimates and do not guarantee outcomes. Sports betting involves risk; never wager more than you can afford to lose. Verify that sports betting is legal in your jurisdiction before participating.

---

## License

MIT © 2026
