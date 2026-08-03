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
- **Package manager:** pnpm — the sole lockfile is `pnpm-lock.yaml` (no `package-lock.json`); CI runs `pnpm install --frozen-lockfile` too

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
- `FreePick` — one row per ET date, the pinned FREE-tier daily pick; written by `lib/server/free-pick.ts` on the first non-empty `/api/predictions` slate for that date, insert-only so later requests can't move it
- `EnsembleDiagnostic` — written only when `ENABLE_DIAGNOSTICS=true`
- `BacktestRun` — walk-forward validation results
- `UserApiKey` — per-user Anthropic API key for the chat assistant, encrypted at rest (see "AI Chat Assistant" above)

### External APIs

| API | Auth | Purpose |
|-----|------|---------|
| MLB Stats API (`statsapi.mlb.com/api/v1`) | None (free) | Schedules, pitcher stats, linescores |
| The Odds API | `THE_ODDS_API_KEY` | NRFI/YRFI live odds; market key: `batter_first_inning_scored` |
| OpenWeatherMap | `OPENWEATHER_API_KEY` | Stadium weather |
| SportsBlaze | `SPORTSBLAZE_API_KEY` | Optional enhanced splits |
| Baseball Savant / Statcast (via `pybaseball`) | None (scraped, free) | Pitch-level Statcast summaries for DeepNRFI features; `scripts/data/refresh_statcast.py` refreshes the `pitcher_statcast` / `batter_statcast` Postgres tables on a weekly GitHub Actions cron; read via `lib/api/statcast.ts` |

MLB Stats API is always available and free; The Odds API, OpenWeatherMap, and SportsBlaze fall back to mock data in `lib/mock-data.ts` when keys are absent. Statcast has no fallback data — `lib/api/statcast.ts` returns `null` when a player has no row yet, and callers impute with league-average defaults.

### AI Chat Assistant

`POST /api/chat` (auth-gated, `app/api/chat/route.ts`) powers a floating chat bubble (`components/assistant/ChatBubble.tsx`, mounted globally in `app/layout.tsx` next to `TweaksPanel`) that answers general baseball questions from model knowledge and pulls real-time data via tool-calling — no chat history is persisted server-side (client holds the transcript). The bubble renders on every page (including public ones); signed-out users see a sign-in prompt instead of a live chat. `components/assistant/ChatMessages.tsx` holds the shared transcript/input/fetch logic.

- **Model:** `claude-haiku-4-5` (cheapest current Claude model) as the primary provider, configured via `CONFIG.chat` in `lib/config.ts`. Static system prompt (`lib/ai/chat-system-prompt.ts`) is prompt-cached (`cache_control: ephemeral`) on the Anthropic path — never interpolate per-request data into it.
- **Tools:** `lib/ai/chat-tools.ts` wraps existing `lib/api/mlb-stats.ts` / `lib/api/live-data.ts` functions (today's slate, linescore, pitcher/team stats, first-inning splits, active starters) — no new data-fetching logic, and it's the single hand-written source of truth for tool schemas. `lib/ai/chat-tool-adapters.ts` derives the OpenAI-format tool list from it for the fallback providers — never hand-write a second copy of a tool's schema.
- **Multi-provider failover:** `lib/ai/chat-provider-chain.ts` (`runChatWithFailover`) tries Anthropic (user's own key, else shared `ANTHROPIC_API_KEY`) → Groq (`GROQ_API_KEY`) → OpenRouter (`OPENROUTER_API_KEY`), in that order, only attempting a provider if it's configured and falling through to the next on auth/rate-limit/server/network errors. Each attempt runs its own bounded tool-call loop (capped at `CONFIG.chat.maxToolIterations`) so live MLB lookups keep working through the whole chain: `lib/ai/chat-loop-anthropic.ts` (content-block format) for Anthropic, `lib/ai/chat-loop-openai-compatible.ts` (`tool_calls`/`role:"tool"` format, shared wire format) for Groq/OpenRouter. `lib/ai/openai-compatible-client.ts` is the Groq/OpenRouter equivalent of `lib/ai/anthropic-client.ts` — both built on the official `openai` SDK with a custom `baseURL`, never a bespoke HTTP client per provider. This is reliability-only failover — there is no user-facing provider picker and no cost-based routing. Free-tier model slugs (`CONFIG.chat.fallbackModels`) are env-overridable since providers deprecate/rename them over time.
- **Cost controls:** per-user Upstash rate limit (`lib/ai/chat-rate-limit.ts`, separate from the IP-based limiter in `lib/rate-limit.ts`) plus a per-user daily message cap (Upstash counter keyed by ET date). Both no-op (allow everything) when Upstash isn't configured, matching existing app behavior. These caps apply identically regardless of key source or which provider in the chain ultimately answers.
- **Per-user API key:** users can optionally set their own Anthropic API key on `/account` (`components/chat-api-key-form.tsx` → `setChatApiKeyAction`/`clearChatApiKeyAction` in `app/actions.ts`), encrypted at rest via `lib/crypto/api-key-encryption.ts` (AES-256-GCM, keyed by `ENCRYPTION_KEY`) in the `UserApiKey` Prisma model. The decrypted key is never sent to the client — only a masked `lastFour` indicator is.
- **Auth:** `/api/chat` is in `middleware.ts`'s `isProtectedRoute` — cost control is the reason, not just personalization. The bubble itself is unauthenticated UI (renders everywhere) but gates on Clerk's `useAuth()` client-side before calling the API.
- Do not add another LLM integration path outside this one (e.g. Vercel AI SDK, a bespoke HTTP client per provider) — fold any new provider into `lib/ai/chat-provider-chain.ts` and its adapter layer instead.

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
- `GET /api/free-pick-accuracy` — **public** (no auth): track record of the FREE tier's one daily pick, for the home-page KPI card. Hybrid reconstruction: a pinned `FreePick` row (written by `/api/predictions` via `lib/server/free-pick.ts` on the first non-empty slate of the day) is graded from its exact game; any date with no pin (everything before `FreePick` existed) falls back to replaying the highest-`confidenceScore` `ModelPrediction` row via `selectFreePick()` (`lib/tier-gating.ts`) — use that helper, never a private copy of the rule. Live rows only (`backtested: false`); publicly cacheable since the body is identical for every caller
- `POST /api/bets`, `GET /api/bets`, `PATCH /api/bets/[id]` — bet tracker
- `GET/POST /api/watchlist`, `DELETE /api/watchlist/[gameId]` — watchlist
- `GET/POST /api/bankroll` — bankroll management
- `POST /api/webhooks/clerk` — Clerk user sync to DB (uses `svix` for webhook verification)
- `GET /api/export-data` — downloads full history as CSV (joins `GameResult` + `ModelPrediction` on gamePk)
- `GET /api/db-status` — deployment diagnostic: DB connectivity check + env var presence report
- `GET /api/debug` — deployment diagnostic: MLB Stats API connectivity + today's schedule
- `POST /api/contact` — stub enterprise inquiry handler (logs only, no CRM wired yet)
- `POST /api/chat` — AI chat assistant (auth required); see "AI Chat Assistant" above

### Environment Variables

See `.env.example` for full documentation. Required for full functionality:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` — auth
- `DATABASE_URL` — Neon PostgreSQL connection string (pooled)
- `THE_ODDS_API_KEY` — live odds
- `OPENWEATHER_API_KEY` — stadium weather
- `ANTHROPIC_API_KEY` — AI chat assistant (floating bubble, all pages)
- `ENCRYPTION_KEY` — required only if users are allowed to store their own Anthropic key on `/account`
- `GROQ_API_KEY` / `OPENROUTER_API_KEY` — optional, enables chat failover to free providers when Anthropic is unavailable

## Important Patterns

- **ET dates everywhere:** Use `new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())` — never `new Date().toISOString().split("T")[0]` (which is UTC)
- **Prisma import:** Always `import { prisma } from "@/lib/prisma"` (singleton pattern)
- **API route config:** Dynamic routes set `export const dynamic = "force-dynamic"` and long-running routes set `export const maxDuration = 300`
- **Path aliases:** `@/` maps to project root (configured in `tsconfig.json`)
- **Tailwind v4:** Config is in `postcss.config.mjs`; CSS variables in `app/globals.css`
- **No Google Fonts:** Layout uses CSS variables for fonts (`app/layout.tsx`)
