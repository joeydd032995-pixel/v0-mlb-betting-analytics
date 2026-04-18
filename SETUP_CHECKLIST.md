# HomeplateMetrics Setup Checklist

Track your progress through the 20-minute setup process.

---

## Phase 1: Prerequisites (2 minutes)

- [ ] Node.js 18+ installed (`node --version`)
- [ ] Git installed (`git --version`)
- [ ] Repository cloned locally

---

## Phase 2: Environment Configuration (5 minutes)

- [ ] Copy `.env.local.template` to `.env.local`
  ```bash
  cp .env.local.template .env.local
  ```

- [ ] Install dependencies
  ```bash
  npm install
  ```

---

## Phase 3: Clerk Authentication Setup (5 minutes)

⏱️ **Estimated: 5 minutes**

### Get Clerk Keys

- [ ] Go to https://dashboard.clerk.com
- [ ] Click "Create application"
- [ ] Enter any name (e.g., "HomeplateMetrics")
- [ ] Select "Email/Password" (optional: add Google/Apple)
- [ ] Go to "API Keys" tab
- [ ] Copy **Publishable Key** (`pk_test_...`)
- [ ] Copy **Secret Key** (`sk_test_...`)

### Add to `.env.local`

- [ ] Paste `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...`
- [ ] Paste `CLERK_SECRET_KEY=sk_test_...`

---

## Phase 4: Database Setup (5 minutes)

⏱️ **Estimated: 5 minutes**

### Create Neon Project

- [ ] Go to https://console.neon.tech
- [ ] Click "Create new project"
- [ ] Choose "PostgreSQL" (default)
- [ ] Enter any name (e.g., "homeplate-metrics")
- [ ] Click "Create"

### Get Connection String

- [ ] In project dashboard, click "Connection Details"
- [ ] Switch to "Connection string" tab
- [ ] Select "Pooled connection" (important for serverless)
- [ ] Copy the full connection string

### Add to `.env.local`

- [ ] Paste `DATABASE_URL=postgresql://...`

### Initialize Database Schema

- [ ] Run:
  ```bash
  npx prisma generate
  npx prisma migrate dev --name init
  ```
- [ ] Verify tables created: `npx prisma studio`

---

## Phase 5: The Odds API Setup (5 minutes)

⏱️ **Estimated: 5 minutes**

### Create Account & Get Key

- [ ] Go to https://the-odds-api.com
- [ ] Click "Sign Up" → Create free account
- [ ] Go to Dashboard
- [ ] Copy API Key

### Add to `.env.local`

- [ ] Paste `THE_ODDS_API_KEY=your_key_here`
- [ ] Keep `THE_ODDS_API_BOOKMAKERS=draftkings,fanduel,betmgm,caesars`

### Verify

- [ ] Test API (replace YOUR_KEY):
  ```bash
  curl "https://api.odds.api.io/v4/sports/baseball_mlb/odds?apiKey=YOUR_KEY&regions=us&markets=batter_first_inning_scored&oddsFormat=american" | head -50
  ```

---

## Phase 6: OpenWeatherMap Setup (5 minutes)

⏱️ **Estimated: 5 minutes**

### Create Account & Get Key

- [ ] Go to https://openweathermap.org/api
- [ ] Click "Sign Up" → Create free account
- [ ] Go to Dashboard
- [ ] Copy API Key from "API Keys" tab

### Add to `.env.local`

- [ ] Paste `OPENWEATHER_API_KEY=your_key_here`
- [ ] Keep `OPENWEATHER_UNITS=imperial`

### Verify

- [ ] Test API (replace YOUR_KEY):
  ```bash
  curl "https://api.openweathermap.org/data/2.5/weather?lat=40.7128&lon=-74.0060&appid=YOUR_KEY&units=imperial" | head -50
  ```

---

## Phase 7: Local Testing (3 minutes)

### Start Dev Server

- [ ] Run:
  ```bash
  npm run dev
  ```
- [ ] Wait for "ready - started server on 0.0.0.0:3000"

### Verify Configuration

- [ ] Visit http://localhost:3000/api/debug
- [ ] Should show all APIs configured (check for ✓)

### Test Each Feature

- [ ] **Authentication:** Visit http://localhost:3000/sign-in
  - [ ] Should load Clerk hosted UI
  - [ ] Sign up with test email
  - [ ] Should redirect to dashboard

- [ ] **Navigation:** All 11 nav items should work
  - [ ] http://localhost:3000/ (Dashboard)
  - [ ] http://localhost:3000/grid (Grid)
  - [ ] http://localhost:3000/accuracy (Accuracy)
  - [ ] http://localhost:3000/history (History)
  - [ ] http://localhost:3000/insights (Insights)
  - [ ] http://localhost:3000/odds (Odds & EV) ← Requires The Odds API
  - [ ] http://localhost:3000/weather (Weather) ← Requires OpenWeatherMap
  - [ ] http://localhost:3000/resources (Resources)
  - [ ] http://localhost:3000/community (Community)
  - [ ] http://localhost:3000/weekly-recap (Weekly)
  - [ ] http://localhost:3000/glossary (Glossary)

- [ ] **Database:** Visit http://localhost:3000/dashboard (after signing in)
  - [ ] Should show "0 bets" (empty state)
  - [ ] No database errors in browser console

- [ ] **Odds:** Visit http://localhost:3000/odds
  - [ ] Should show live odds calculator
  - [ ] If Odds API not working: will show placeholder data

- [ ] **Weather:** Visit http://localhost:3000/weather
  - [ ] Should show weather simulator
  - [ ] If OpenWeatherMap not working: will show placeholder data

---

## Phase 8: Optional Enhancements (Skip for MVP)

- [ ] Add Sentry error monitoring
  - [ ] Go to https://sentry.io
  - [ ] Create project
  - [ ] Add `SENTRY_DSN` to `.env.local`

- [ ] Add SportsBlaze analytics (future)
  - [ ] Go to https://sportsblaze.com
  - [ ] Create account
  - [ ] Add `SPORTSBLAZE_API_KEY` to `.env.local`

---

## Verification Summary

### ✅ All Required APIs

| API | Status | Location |
|-----|--------|----------|
| Clerk | ✓ Configured | Dashboard → sign-in works |
| Neon | ✓ Configured | Dashboard → "0 bets" shows |
| The Odds API | ✓ Configured | /odds → live odds display |
| OpenWeatherMap | ✓ Configured | /weather → live conditions |
| MLB Stats | ✓ Built-in | All pages with game data |

### ✅ Full Feature Check

- [ ] Sign up → authenticate with Clerk
- [ ] Add game to watchlist (future: /watchlist)
- [ ] Place a bet (future: /bets)
- [ ] View odds & calculate EV
- [ ] Check weather & park factors
- [ ] View weekly recap
- [ ] Export data

---

## Troubleshooting

### ❌ "Missing publishableKey" Error

```
@clerk/clerk-react: Missing publishableKey.
```

**Fix:**
1. Verify `.env.local` has `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
2. Restart dev server: `npm run dev`

### ❌ Database Connection Error

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Fix:**
1. Verify `DATABASE_URL` in `.env.local`
2. Check format: `postgresql://user:password@host/database?schema=public&sslmode=require`
3. Test connection: `psql $DATABASE_URL -c "SELECT 1"`

### ❌ Odds API Returns 404

**Fix:**
1. Verify `THE_ODDS_API_KEY` is correct
2. Check account has free tier available at https://the-odds-api.com
3. Wait 5 minutes after account creation (API key activation delay)

### ❌ Weather API Returns 401

**Fix:**
1. Verify `OPENWEATHER_API_KEY` is correct
2. Check account at https://openweathermap.org
3. Wait 10 minutes after account creation (API key activation delay)

---

## Final Steps

- [ ] Run tests: `npm run test` (if available)
- [ ] Run linter: `npm run lint` (if available)
- [ ] Check TypeScript: `npx tsc --noEmit`
- [ ] Review `.env.local` (verify all 4 required APIs)
- [ ] Delete `.env.local` template, keep only `.env.local` with your keys

---

## Ready for Development! 🚀

Once all items are checked:

```bash
npm run dev
# → Open http://localhost:3000
# → Explore all 11 navigation pages
# → Sign in with test account
# → Try placing a bet
# → Check live odds and weather
```

**Total setup time:** ~20 minutes

**Questions?** See `API_SETUP_GUIDE.md` for detailed documentation.
