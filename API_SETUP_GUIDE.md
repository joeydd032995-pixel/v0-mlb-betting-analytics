# HomeplateMetrics API Setup Guide

Complete guide to configure all required and optional APIs for full functionality.

---

## Table of Contents

1. [Quick Start (Copy-Paste Template)](#quick-start)
2. [Required APIs](#required-apis)
3. [Optional APIs](#optional-apis)
4. [Configuration Steps](#configuration-steps)
5. [API Usage & Rate Limits](#api-usage--rate-limits)
6. [Testing & Verification](#testing--verification)

---

## Quick Start

Copy `.env.example` to `.env.local` and fill in your credentials:

```bash
cp .env.example .env.local
```

Then complete the following sections. **All REQUIRED fields must be filled before the app works.**

---

## Required APIs

### 1. Clerk Authentication

**Purpose:** Sign-in/sign-up, user identity, JWT tokens for protected routes

**Setup:**
1. Go to https://dashboard.clerk.com
2. Click "Create Application"
3. Choose a name, enable "Email/Password" (optional: Google, Apple)
4. Copy keys from "API Keys" tab

**Environment Variables:**

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL=/
```

**Used In:**
- `app/layout.tsx` – ClerkProvider wrapper
- `app/sign-in/[[...sign-in]]/page.tsx` – Sign-in form
- `app/sign-up/[[...sign-up]]/page.tsx` – Sign-up form
- `middleware.ts` – Auth middleware for protected routes
- `app/dashboard/page.tsx` – Auth check for user stats

**Status:** ✅ Already configured in project

---

### 2. Neon PostgreSQL Database

**Purpose:** Store user watchlist, bets, bankroll balance (Phase 3.1)

**Setup:**
1. Go to https://console.neon.tech
2. Create new project
3. Copy "Pooled connection string" from Connection Details
4. Format: `postgresql://user:password@host/database?schema=public&sslmode=require`

**Environment Variables:**

```env
DATABASE_URL=postgresql://user:password@host/database?schema=public&sslmode=require
```

**Database Schema (Auto-created with Prisma):**

```sql
-- WatchlistItem: Games user is watching
CREATE TABLE "WatchlistItem" (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  gameId TEXT NOT NULL,
  createdAt TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX "WatchlistItem_userId_gameId_key" ON "WatchlistItem"(userId, gameId);

-- Bet: User's bets with P&L tracking
CREATE TABLE "Bet" (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  gameId TEXT NOT NULL,
  amount DECIMAL NOT NULL,
  odds DECIMAL NOT NULL,
  prediction TEXT NOT NULL,
  result TEXT,
  pnl DECIMAL,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);
CREATE INDEX "Bet_userId_idx" ON "Bet"(userId);

-- Bankroll: User's starting/current balance
CREATE TABLE "Bankroll" (
  id TEXT PRIMARY KEY,
  userId TEXT UNIQUE NOT NULL,
  startingBalance DECIMAL NOT NULL,
  currentBalance DECIMAL NOT NULL,
  updatedAt TIMESTAMP DEFAULT NOW()
);
```

**Migration Commands:**

```bash
# Generate Prisma client from schema.prisma
npx prisma generate

# Run migrations on Neon
npx prisma migrate dev --name init

# Optional: Seed database
npx prisma db seed
```

**Used In:**
- `app/dashboard/page.tsx` – Fetch user stats
- `app/watchlist/page.tsx` – Display watched games
- `app/bets/page.tsx` – Display user bets with P&L
- `lib/prisma.ts` – Singleton PrismaClient

**Status:** 🟡 Schema defined, needs Neon connection string

---

### 3. The Odds API

**Purpose:** Live NRFI/YRFI odds from multiple bookmakers for value bet identification

**Setup:**
1. Go to https://the-odds-api.com
2. Sign up for free account
3. Copy API key from dashboard
4. Free tier: 500 requests/month (plenty for MVP)

**Environment Variables:**

```env
THE_ODDS_API_KEY=your_api_key_here
THE_ODDS_API_BOOKMAKERS=draftkings,fanduel,betmgm,caesars
```

**API Endpoints Used:**

```
GET https://api.odds.api.io/v4/sports/baseball_mlb/odds
  ?apiKey={THE_ODDS_API_KEY}
  &regions=us
  &markets=batter_first_inning_scored
  &oddsFormat=american
  &bookmakers={THE_ODDS_API_BOOKMAKERS}
```

**Response Format:**

```json
{
  "id": "...",
  "sport_key": "baseball_mlb",
  "sport_title": "MLB",
  "commence_time": "2026-04-18T18:05:00Z",
  "home_team": "New York Yankees",
  "away_team": "Baltimore Orioles",
  "bookmakers": [
    {
      "key": "draftkings",
      "title": "DraftKings",
      "markets": [
        {
          "key": "batter_first_inning_scored",
          "outcomes": [
            {
              "name": "Yes",
              "price": -110
            },
            {
              "name": "No",
              "price": -110
            }
          ]
        }
      ]
    }
  ]
}
```

**Used In:**
- `lib/api/odds.ts` – Fetch NRFI/YRFI odds
- `/app/api/predictions/route.ts` – Combine with model predictions
- `components/odds-calculator.tsx` – Display sample odds

**Status:** 🟡 Code implemented, needs API key

**Daily Usage:** ~30 calls/day (within free tier)

---

### 4. OpenWeatherMap API

**Purpose:** Live weather at stadium for game time (temperature, wind, humidity, clouds)

**Setup:**
1. Go to https://openweathermap.org/api
2. Sign up for free account
3. Subscribe to "Current Weather Data" API (free)
4. Copy API key from dashboard
5. Free tier: 1,000 calls/day

**Environment Variables:**

```env
OPENWEATHER_API_KEY=your_api_key_here
OPENWEATHER_UNITS=imperial
```

**API Endpoints Used:**

```
GET https://api.openweathermap.org/data/2.5/weather
  ?lat={LATITUDE}
  &lon={LONGITUDE}
  &appid={OPENWEATHER_API_KEY}
  &units=imperial
```

**Response Format:**

```json
{
  "coord": {
    "lon": -74.0060,
    "lat": 40.7128
  },
  "weather": [
    {
      "id": 800,
      "main": "Clear",
      "description": "clear sky",
      "icon": "01d"
    }
  ],
  "main": {
    "temp": 68.5,
    "feels_like": 67.0,
    "temp_min": 64.2,
    "temp_max": 72.1,
    "pressure": 1013,
    "humidity": 55
  },
  "wind": {
    "speed": 8.5,
    "deg": 210,
    "gust": 12.3
  },
  "clouds": {
    "all": 10
  }
}
```

**Used In:**
- `lib/api/weather.ts` – Fetch stadium weather
- `components/weather-simulator.tsx` – Display real-time conditions
- `/app/api/predictions/route.ts` – Weather multiplier calculations

**Status:** 🟡 Code implemented, needs API key

**Daily Usage:** ~20 calls/day (within free tier)

---

## Optional APIs

### SportsBlaze API

**Purpose:** Advanced MLB player/team analytics (batting splits, pitcher xStats)

**Setup:**
1. Go to https://sportsblaze.com
2. Sign up for free account
3. Copy API key from dashboard

**Environment Variables:**

```env
SPORTSBLAZE_API_KEY=your_api_key_here
SPORTSBLAZE_BASE_URL=https://api.sportsblaze.com
```

**Status:** 🔵 Not integrated yet (future enhancement)

**Daily Usage:** ~15 calls/day

---

## Built-In APIs (No Authentication Required)

### MLB Stats API

**Purpose:** Official source for game schedules, pitcher stats, team stats

**Setup:** ✅ No setup required — completely free and no API key needed

**Base URL:** https://statsapi.mlb.com/api/v1

**Common Endpoints:**

```
GET /schedule?sportId=1&season=2026  – Game schedule
GET /teams/{teamId}                   – Team info
GET /people/{playerId}                – Player stats
GET /stats?type=pitching&personId=xxx – Pitcher stats
```

**Used In:**
- `lib/api/mlb-stats.ts` – Fetch schedules and stats
- `/app/api/predictions/route.ts` – Get game data
- All game display components

**Status:** ✅ Already integrated

**Daily Usage:** ~40 calls/day (unlimited free tier)

---

## Configuration Steps

### Step 1: Create `.env.local`

```bash
cp .env.example .env.local
```

### Step 2: Fill in Required APIs

#### Clerk
1. https://dashboard.clerk.com → Create Application
2. Copy keys to `.env.local`

#### Neon Database
1. https://console.neon.tech → Create Project
2. Copy pooled connection string to `DATABASE_URL`

#### The Odds API
1. https://the-odds-api.com → Sign up
2. Copy API key to `THE_ODDS_API_KEY`

#### OpenWeatherMap
1. https://openweathermap.org → Sign up
2. Copy API key to `OPENWEATHER_API_KEY`

### Step 3: Initialize Database

```bash
# Generate Prisma client
npx prisma generate

# Create database tables on Neon
npx prisma migrate dev --name init

# Optional: Seed with sample data
npx prisma db seed
```

### Step 4: Test Configuration

```bash
# Check which APIs are configured
curl http://localhost:3000/api/debug

# Should show: ✓ Clerk, ✓ Neon, ✓ The Odds API, ✓ OpenWeatherMap
```

---

## API Usage & Rate Limits

### Free Tier Summary

| API | Free Limit | Actual Usage | Safety Buffer |
|-----|-----------|--------------|----------------|
| **Clerk** | Unlimited | Auth checks | ✅ Unlimited |
| **Neon** | 3 GB storage, unlimited queries | Database | ✅ Plenty |
| **The Odds API** | 500 req/month | ~30/day | ✅ 16x buffer |
| **OpenWeatherMap** | 1,000 req/day | ~20/day | ✅ 50x buffer |
| **MLB Stats API** | Unlimited | ~40/day | ✅ Unlimited |

### Caching Strategy

The app uses Next.js `fetch()` with `revalidate` to minimize API calls:

```typescript
// Odds data refreshed every 60 seconds
fetch(oddsUrl, { next: { revalidate: 60 } })

// Schedule/pitcher data refreshed every 5 minutes
fetch(scheduleUrl, { next: { revalidate: 300 } })
```

---

## Testing & Verification

### 1. Check Configuration

```bash
curl http://localhost:3000/api/debug
```

Expected response:

```json
{
  "status": "Configuration loaded",
  "clerk": "✓ Configured",
  "database": "✓ Connected to Neon",
  "oddApiKey": "✓ Set",
  "weatherApiKey": "✓ Set",
  "mlbApiUrl": "✓ Available"
}
```

### 2. Test Each API

#### Clerk Sign-In
```bash
# Visit http://localhost:3000/sign-in
# Should redirect to Clerk hosted UI
```

#### Database
```bash
npx prisma studio
# Browse WatchlistItem, Bet, Bankroll tables
```

#### The Odds API
```bash
curl "https://api.odds.api.io/v4/sports/baseball_mlb/odds?apiKey=YOUR_KEY&regions=us&markets=batter_first_inning_scored&oddsFormat=american"
```

#### OpenWeatherMap
```bash
curl "https://api.openweathermap.org/data/2.5/weather?lat=40.7128&lon=-74.0060&appid=YOUR_KEY&units=imperial"
```

#### MLB Stats API
```bash
curl "https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=2026"
```

### 3. End-to-End Tests

- [ ] Sign up with Clerk
- [ ] Navigate to `/dashboard` – should show "0 bets" (empty)
- [ ] Navigate to `/odds` – should show real live odds if Odds API configured
- [ ] Navigate to `/weather` – should show stadium weather conditions
- [ ] Try `/api/predictions` – should return predictions if all APIs connected

---

## Troubleshooting

### "Missing publishableKey" Error

**Problem:** Clerk keys not configured

**Solution:**
1. Create `.env.local` from `.env.example`
2. Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` from https://dashboard.clerk.com
3. Restart dev server

### Database Connection Refused

**Problem:** `DATABASE_URL` not set or Neon credentials wrong

**Solution:**
1. Check `.env.local` has `DATABASE_URL`
2. Verify format: `postgresql://user:password@host/database?schema=public&sslmode=require`
3. Test connection: `psql $DATABASE_URL -c "SELECT 1"`

### "The Odds API is not set" Warning

**Problem:** API key missing, odds calculator shows placeholder data

**Solution:**
1. Sign up at https://the-odds-api.com
2. Add `THE_ODDS_API_KEY` to `.env.local`
3. Restart dev server
4. Test: `curl /api/debug`

### No Weather Data

**Problem:** OpenWeatherMap API key missing

**Solution:**
1. Sign up at https://openweathermap.org
2. Add `OPENWEATHER_API_KEY` to `.env.local`
3. Restart dev server

---

## Security Best Practices

⚠️ **NEVER commit `.env.local` to git**

1. `.env.local` is in `.gitignore` ✅
2. Environment variables prefixed `NEXT_PUBLIC_` are safe to expose (Clerk publishable key)
3. All other variables (API keys, database URL, secrets) are server-side only
4. Store secrets in production using:
   - Vercel Environment Variables (if deployed on Vercel)
   - GitHub Secrets (if using GitHub Actions)
   - Heroku Config Vars (if deployed on Heroku)

---

## Summary Table

| Component | Type | Status | Setup Time |
|-----------|------|--------|-----------|
| **Clerk** | Auth | ✅ Ready | 5 min |
| **Neon** | Database | 🟡 Needs connection | 5 min |
| **The Odds API** | Data | 🟡 Needs key | 5 min |
| **OpenWeatherMap** | Data | 🟡 Needs key | 5 min |
| **MLB Stats API** | Data | ✅ Ready | 0 min |
| **Total Setup Time** | | | **20 minutes** |

---

## Next Steps

1. ✅ Create `.env.local` from `.env.example`
2. ⏳ Get Clerk keys (5 min)
3. ⏳ Get Neon connection string (5 min)
4. ⏳ Get The Odds API key (5 min)
5. ⏳ Get OpenWeatherMap key (5 min)
6. ⏳ Run `npx prisma migrate dev --name init`
7. ✅ Run `npm run dev`
8. ✅ Test at `http://localhost:3000/api/debug`

**Estimated total time:** ~20 minutes for full setup

---

**Need help?** See documentation:
- Clerk: https://clerk.com/docs
- Neon: https://neon.tech/docs
- The Odds API: https://the-odds-api.com/liveapi/guides/v4/
- OpenWeatherMap: https://openweathermap.org/api
- MLB Stats API: https://github.com/toddrob99/MLB-StatsAPI
