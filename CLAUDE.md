# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev                  # Start dev server at localhost:3000
pnpm build                # Run db-push + prisma generate + next build
pnpm start                # Start production server
pnpm lint                 # ESLint check
pnpm lint:fix             # ESLint auto-fix
pnpm type-check           # TypeScript check (no emit)
pnpm build:prod           # type-check + lint + next build (full gate)
npx prisma generate       # Regenerate Prisma client after schema changes
npx prisma db push        # Push schema to Neon DB (non-migration)
npx prisma studio         # Open Prisma Studio GUI
```

Tests: vitest suites in `__tests__/` (`pnpm test`). CI runs type-check + lint + build + unit tests (`.github/workflows/ci.yml`).

Husky runs `eslint --fix` on staged `.ts`/`.tsx` files via lint-staged before every commit.

## Architecture

### Tech Stack
- **Framework:** Next.js 16 (App Router), React 19, TypeScript 5
- **Styling:** Tailwind CSS v4 + shadcn/ui (Radix UI primitives) + `components/ui/`
- **Auth:** Clerk (`@clerk/nextjs`) — middleware at `middleware.ts` protects `/dashboard`, `/bets`, `/watchlist`, `/bankroll`, `/history`, `/accuracy`, `/insights`
- **Database:** Neon PostgreSQL via Prisma v5 ORM (`prisma/schema.prisma`)
- **DB singleton:** `lib/prisma.ts` — always import `{ prisma }` from here
- **Charts:** Recharts
- **Package manager:** pnpm (use `pnpm` not `npm` for local dev; CI uses `npm ci`)

### Prediction Engine

The core of the app is a **7-model ensemble** for NRFI/YRFI (No/Yes Run First Inning) probability. Entry point: `lib/nrfi-engine.ts → computeAllPredictions(games, pitchers, teams)`.

Data flow:
1. `lib/api/live-data.ts` — fetches today's games from MLB Stats API, odds from The Odds API, weather from OpenWeatherMap; returns typed `Game`, `Pitcher`, `Team` maps
2. `lib/nrfi-engine.ts` — orchestrates per-game prediction; applies Bayesian shrinkage, weather/umpire multipliers; calls `lib/nrfi-models.ts`
3. `lib/nrfi-models.ts` — implements the 7 models: Poisson, ZIP, Markov Chain (24-state), MAPRE, logisticMeta, nnInteraction, hierarchicalBayes; weights defined in `ENSEMBLE_WEIGHTS`
4. `lib/calibration.ts` — monotonic piecewise-linear calibration over knots applied to raw ensemble output (currently the identity mapping pending an out-of-sample refit — see AUDIT_REPORT.md P1-4)
5. Final formula: `clamp(0.76 × calibrated + 0.24 × LEAGUE_ANCHOR, 0.18, 0.85)`
   where `LEAGUE_ANCHOR = calibrateWithMonotonicSpline(0.516)` — equals 0.516 under the identity calibration (computed at module load, not a magic constant)

Scale convention: every per-pitcher `nrfiRate` is the HALF-INNING scoreless rate
(league average `LEAGUE_HALF_NRFI = √0.516 ≈ 0.718`); the game-level league NRFI
rate is `LEAGUE_AVG_NRFI = 0.516`. Shrinkage priors must target the half-inning
constant — see AUDIT_REPORT.md P0-1 and `__tests__/audit-regression.test.ts`.

API route `app/api/predictions/route.ts` calls `getLiveGameSlate()` → `computeAllPredictions()` and returns JSON. All date resolution uses ET timezone: `new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())`.

### Database Schema (Prisma)

Key tables in `prisma/schema.prisma`:
- `User` — Clerk userId as PK (synced via `app/api/webhooks/clerk/route.ts`)
- `WatchlistItem` — per-user game watchlist
- `Bet` — per-user bet records (prediction: "NRFI"|"YRFI", result: nullable)
- `Bankroll` + `BankrollTransaction` — running ledger
- `GameResult` — global ground truth (first-inning runs per game, synced by `app/api/historical-sync/route.ts`)
- `ModelPrediction` — system-wide prediction records with actual results; `backtested=true` for prior seasons
- `EnsembleDiagnostic` — written only when `ENABLE_DIAGNOSTICS=true`
- `BacktestRun` — walk-forward validation results

### External APIs

| API | Auth | Purpose |
|-----|------|---------|
| MLB Stats API (`statsapi.mlb.com/api/v1`) | None (free) | Schedules, pitcher stats, linescores |
| The Odds API | `THE_ODDS_API_KEY` | NRFI/YRFI live odds; market key: `batter_first_inning_scored` |
| OpenWeatherMap | `OPENWEATHER_API_KEY` | Stadium weather |
| SportsBlaze | `SPORTSBLAZE_API_KEY` | Optional enhanced splits |

MLB Stats API is always available and free; all other external data falls back to mock data in `lib/mock-data.ts` when keys are absent.

### Key Source Files

| File | Purpose |
|------|---------|
| `lib/types.ts` | All TypeScript interfaces — source of truth for `Game`, `Pitcher`, `Team`, `NRFIPrediction`, etc. |
| `lib/nrfi-engine.ts` | Ensemble orchestration, blend constants, confidence scoring, recommendation tiers |
| `lib/nrfi-models.ts` | 7 model implementations + `ENSEMBLE_WEIGHTS` + Bayesian shrinkage helpers |
| `lib/calibration.ts` | Monotonic piecewise-linear calibration (19 knots; identity until refit) |
| `lib/weather.ts` | Vector wind + humidity multiplier |
| `lib/api/live-data.ts` | Live game slate builder (MLB + odds + weather) |
| `lib/api/mlb-stats.ts` | MLB Stats API wrappers |
| `lib/constants/mlb-teams.ts` | Static team registry with `apiId` (MLB numeric ID) |
| `lib/constants/mlb-stadiums.ts` | Stadium park factors + GPS coords |
| `lib/prediction-store.ts` | `buildTrackedPrediction()` — converts `NRFIPrediction` → DB shape |
| `lib/config.ts` | Central statistical constants — wOBA weights, FIP constant, Kelly settings, league averages (2024 MLB); consumed by `lib/advanced-stats.ts` |

### API Routes

- `GET /api/predictions` — today's live predictions (force-dynamic)
- `GET /api/results?date=YYYY-MM-DD` — first-inning run results from MLB linescore
- `GET /api/historical-sync?year=YYYY&month=M` — DB backfill: upserts `GameResult` + `ModelPrediction` rows into Neon, one month per call; re-score (`?skip=false`) requires auth
- `GET /api/backfill?from=YYYY-MM-DD&to=YYYY-MM-DD` — localStorage backfill (max 30 days): returns `TrackedPrediction[]` JSON for the client-side accuracy dashboard; does **not** write to DB
- `GET /api/games` — game list
- `GET /api/performance` — model accuracy stats
- `POST /api/bets`, `GET /api/bets`, `PATCH /api/bets/[id]` — bet tracker
- `GET/POST /api/watchlist`, `DELETE /api/watchlist/[gameId]` — watchlist
- `GET/POST /api/bankroll` — bankroll management
- `POST /api/webhooks/clerk` — Clerk user sync to DB (uses `svix` for webhook verification)
- `GET /api/export-data` — downloads full history as CSV (joins `GameResult` + `ModelPrediction` on gamePk)
- `GET /api/db-status` — deployment diagnostic: DB connectivity check + env var presence report
- `GET /api/debug` — deployment diagnostic: MLB Stats API connectivity + today's schedule
- `POST /api/contact` — stub enterprise inquiry handler (logs only, no CRM wired yet)

### Environment Variables

See `.env.example` for full documentation. Required for full functionality:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` — auth
- `DATABASE_URL` — Neon PostgreSQL connection string (pooled)
- `THE_ODDS_API_KEY` — live odds
- `OPENWEATHER_API_KEY` — stadium weather

## Important Patterns

- **ET dates everywhere:** Use `new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())` — never `new Date().toISOString().split("T")[0]` (which is UTC)
- **Prisma import:** Always `import { prisma } from "@/lib/prisma"` (singleton pattern)
- **API route config:** Dynamic routes set `export const dynamic = "force-dynamic"` and long-running routes set `export const maxDuration = 300`
- **Path aliases:** `@/` maps to project root (configured in `tsconfig.json`)
- **Tailwind v4:** Config is in `postcss.config.mjs`; CSS variables in `app/globals.css`
- **No Google Fonts:** Layout uses CSS variables for fonts (`app/layout.tsx`)
