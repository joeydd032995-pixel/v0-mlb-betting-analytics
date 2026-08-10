# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For a full index of this project's docs (setup guides, audit reports, specs) and a "where things live" map for onboarding, see [`HANDOFF.md`](./HANDOFF.md).

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
- `UserApiKey` — per-user Anthropic/Groq/OpenRouter API key for the chat assistant, encrypted at rest (see "AI Chat Assistant" above)
- `Subscription` — one row per Clerk userId, Stripe-backed tier state (`tier`: "FREE"\|"PRO"\|"ELITE"; `status` mirrors the Stripe subscription status); created on first checkout, kept in sync by `app/api/webhooks/stripe/route.ts` (see "Subscriptions & Tier Gating" below)
- `PitcherStatcast` / `BatterStatcast` — per-player, per-date Statcast payload cache (`payload` is a raw JSON blob), unique on `(mlbamId, date)`; populated weekly by `scripts/data/refresh_statcast.py`, read via `lib/api/statcast.ts`

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
- **Tools:** `lib/ai/chat-tools.ts` wraps existing functions — no new data-fetching logic — and is the single hand-written source of truth for tool schemas. `lib/ai/chat-tool-adapters.ts` derives the OpenAI-format tool list from it for the fallback providers — never hand-write a second copy of a tool's schema. Three groups: **MLB data** (`lib/api/mlb-stats.ts` / `live-data.ts` — slate, linescore, pitcher/team stats, first-inning splits, starters); **product** (`get_predictions`, `get_game_analysis`, `get_model_accuracy` — the NRFI engine and its track record); **account** (`get_my_bets`, `get_my_bankroll`, `get_my_watchlist` via `lib/server/user-chat-data.ts`).
- **Tool context & the paywall:** `runTool(name, input, ctx)` takes a `ToolContext { userId, tier }` threaded from `/api/chat` (Clerk session + `resolveUserTierWithRetry`, fail-closed on an unresolved tier) through `runChatWithFailover` → both loops. **Any tool returning predictions MUST route through `applyTierGating`** — and must gate the **full slate for the date, then filter**, never gate a single-game subset: `applyTierGating` picks the FREE teaser by ranking `confidenceScore`, so a one-element array makes that element "top" unconditionally and lets a FREE user walk the slate one game at a time. `gatedPredictionsForDate()` is the shared helper that does this correctly; `__tests__/chat-tools-tier.test.ts` is the regression guard. Account tools take `userId` from `ctx` only — never from a model-supplied argument.
- **Per-user context vs prompt caching:** `SYSTEM_PROMPT` must stay byte-stable (it carries `cache_control: ephemeral` on the Anthropic path). Per-user tier goes through `tierContextLine(tier)` as a **separate uncached** system block — never interpolate into `SYSTEM_PROMPT`.
- **Multi-provider failover:** `lib/ai/chat-provider-chain.ts` (`runChatWithFailover`) tries Anthropic (user's own key, else shared `ANTHROPIC_API_KEY`) → Groq (`GROQ_API_KEY`) → OpenRouter (`OPENROUTER_API_KEY`), in that order, only attempting a provider if it's configured and falling through to the next on auth/rate-limit/server/network errors. Each attempt runs its own bounded tool-call loop (capped at `CONFIG.chat.maxToolIterations`) so live MLB lookups keep working through the whole chain: `lib/ai/chat-loop-anthropic.ts` (content-block format) for Anthropic, `lib/ai/chat-loop-openai-compatible.ts` (`tool_calls`/`role:"tool"` format, shared wire format) for Groq/OpenRouter. `lib/ai/openai-compatible-client.ts` is the Groq/OpenRouter equivalent of `lib/ai/anthropic-client.ts` — both built on the official `openai` SDK with a custom `baseURL`, never a bespoke HTTP client per provider. This is reliability-only failover — there is no user-facing provider picker and no cost-based routing. Free-tier model slugs (`CONFIG.chat.fallbackModels`) are env-overridable since providers deprecate/rename them over time.
- **Cost controls:** per-user Upstash rate limit (`lib/ai/chat-rate-limit.ts`, separate from the IP-based limiter in `lib/rate-limit.ts`) plus a per-user daily message cap (Upstash counter keyed by ET date). Both no-op (allow everything) when Upstash isn't configured, matching existing app behavior. These caps apply identically regardless of key source or which provider in the chain ultimately answers.
- **Per-user API keys:** users can optionally set their own key for each provider (Anthropic, Groq, OpenRouter) on `/account` (`components/chat-api-key-form.tsx` → `setChatApiKeyAction`/`clearChatApiKeyAction` in `app/actions.ts`), encrypted at rest via `lib/crypto/api-key-encryption.ts` (AES-256-GCM, keyed by `ENCRYPTION_KEY`) in the `UserApiKey` Prisma model — one row per `(userId, provider)`, unique on that pair. `app/api/chat/route.ts` decrypts every row for the user into a `UserProviderKeys` map and passes it to `runChatWithFailover`; `getAnthropicClient`/`getGroqClient`/`getOpenRouterClient` all accept an optional per-user key and prefer it over the shared env var for that provider only — a saved key has no effect on a different provider or on an earlier step of the chain that already succeeded. The decrypted key is never sent to the client — only a masked `lastFour` indicator is.
- **Auth:** `/api/chat` is in `middleware.ts`'s `isProtectedRoute` — cost control is the reason, not just personalization. The bubble itself is unauthenticated UI (renders everywhere) but gates on Clerk's `useAuth()` client-side before calling the API.
- Do not add another LLM integration path outside this one (e.g. Vercel AI SDK, a bespoke HTTP client per provider) — fold any new provider into `lib/ai/chat-provider-chain.ts` and its adapter layer instead.

### Subscriptions & Tier Gating (Stripe)

Three tiers — `"FREE" | "PRO" | "ELITE"` — gate both prediction fields (via `applyTierGating`, see "AI Chat Assistant" above) and whole routes/pages.

- **Rules vs. lookup split:** `lib/tiers.ts` is the pure, client-safe rulebook — `Tier`, the `Feature` union, and `FEATURE_MIN_TIER` (the single source of truth for what each tier unlocks) plus `hasAccess(tier, feature)`. No Prisma/Clerk imports, so it's safe in client components. `lib/subscription.ts` is the server-only *lookup* — `getUserTier`, `getUserTierInfo`, `resolveUserTierWithRetry` (reads the `Subscription` table) — and re-exports the `lib/tiers.ts` rules so existing server imports keep working.
- **Route guard:** `lib/require-tier.ts`'s `requireFeature(feature)` is the standard guard for any API route serving PRO/ELITE-only data — a bare `auth()` signed-in check is not enough, it only proves the user is logged in, not that they've paid. Returns `{ ok: false, response }` (401 unauthenticated, 503 `tier_unresolved` on a failed DB lookup — fails closed rather than silently downgrading a paying user to FREE, 403 `upgrade_required` when the tier is too low) or `{ ok: true, tier, userId }`. `getPageTier()` is the server-component equivalent for gating whole pages.
- **Checkout & billing:** `POST /api/stripe/checkout` creates a Stripe Checkout session for an upgrade (price ID allowlisted against `NEXT_PUBLIC_STRIPE_*_PRICE_ID` env vars); `POST /api/stripe/portal` creates a Stripe Customer Portal session for self-service billing management. Both require a `Subscription.stripeCustomerId`, created lazily on first checkout.
- **Webhook sync:** `POST /api/webhooks/stripe` (`app/api/webhooks/stripe/route.ts`) is the only writer of subscription state — `checkout.session.completed`, `customer.subscription.created`/`updated` upsert the `Subscription` row (tier derived from the Stripe price ID via `priceIdToTier`); `customer.subscription.deleted` resets the row to `tier: "FREE"`. Must read the raw request body (`req.text()`, never `req.json()`) for Stripe signature verification, and must bypass Clerk middleware (no Clerk session on a Stripe-originated request).
- **`lib/stripe.ts`:** lazily-initialized Stripe client (`getStripe()` / the `stripe` proxy) so the module can be imported at build time without `STRIPE_SECRET_KEY` set. Server-only.
- **Admin bypass:** `ADMIN_USER_IDS` (comma-separated Clerk user IDs) grants unrestricted access outside the normal tier lookup — checked ad hoc (e.g. `app/api/debug-tier/route.ts`), not baked into `hasAccess`.

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
- `GET /api/db-status` — deployment diagnostic (auth required): DB connectivity check + env var presence report + `encryptionKey` status (`ok`, or `reason: "missing" | "wrong_length" | "non_hex"` from `getEncryptionKeyStatus()`). Use the `encryptionKey` field to tell an unset `ENCRYPTION_KEY` apart from one that's set but malformed — the two need opposite fixes and are otherwise indistinguishable. Values are never exposed, only derived status
- `GET /api/debug` — deployment diagnostic: MLB Stats API connectivity + today's schedule
- `GET /api/debug-tier` — diagnostic: reports the caller's resolved tier + whether they're in `ADMIN_USER_IDS`; gated by `x-debug-token: <DEBUG_SECRET>` header, same as `/api/debug`
- `POST /api/contact` — stub enterprise inquiry handler (logs only, no CRM wired yet)
- `POST /api/chat` — AI chat assistant (auth required); see "AI Chat Assistant" above
- `POST /api/backtest`, `GET /api/backtest` — walk-forward backtest runner: POST computes Brier/accuracy/ROI-Kelly/Sharpe/max-drawdown over a season range (joining `ModelPrediction` to `GameResult` for ground truth) and persists a `BacktestRun` row; GET lists the caller's 20 most recent runs. Both auth required
- `GET /api/cron/daily-sync` — Vercel Cron (09:00 UTC daily): fans out to `/api/historical-sync` for the current month (+ previous month during the first 3 days of a month), then settles every pending prediction via `settlePendingPredictions()`. `Authorization: Bearer <CRON_SECRET>`, dev-only bypass when `CRON_SECRET` is unset
- `GET /api/cron/settle-results` — attaches first-inning results to pending predictions without regenerating them (`?lookbackDays=N`, `?dryRun=true`); also runs at the end of `/api/cron/daily-sync` — this route exists for manual backlog sweeps. Same `CRON_SECRET` auth
- `GET /api/feature-importance` — `?gameId=...` returns the persisted per-game DeepNRFI top feature contributions (`ModelPrediction.deepNrfiTopFeatures`); `?global=true` returns the model artifact's global gain/SHAP report from `scripts/deepnrfi/artifacts/`. ELITE-only (`requireFeature("deepnrfi")`); degrades to `{ available: false }` rather than 500 when data/artifacts are missing
- `GET /api/monte-carlo?gameId=...&nSims=...` — first-inning run distribution for a game: reads the persisted `ModelPrediction.monteCarloDistribution` when available, otherwise resimulates live (capped at 50k sims) via `lib/monte-carlo.ts`. ELITE-only (`requireFeature("montecarlo")`)
- `GET /api/weekly-recap` — **public** (no auth): DB-backed weekly performance for the most recent Mon–Sun window containing a completed, scored system-wide prediction (`userId: null` only); auto-advances over time. Uses the same Kelly/flat metrics as the backtester
- `POST /api/stripe/checkout` — creates a Stripe Checkout session for a tier upgrade; price ID allowlisted against `NEXT_PUBLIC_STRIPE_*_PRICE_ID`; auth required
- `POST /api/stripe/portal` — creates a Stripe Customer Portal session for billing self-service; requires an existing `Subscription.stripeCustomerId`; auth required
- `GET /api/subscription/me` — the caller's resolved tier info (`{ tier, isActive, cancelAtPeriodEnd, currentPeriodEnd, stripeCustomerId, stripeSubscriptionId }`); returns FREE defaults when signed out, `503 { error: "tier_unresolved" }` on a failed DB lookup (never silently answers FREE for a real error — see "Subscriptions & Tier Gating" above)
- `POST /api/webhooks/stripe` — Stripe webhook receiver; sole writer of `Subscription` state (see "Subscriptions & Tier Gating" above). Bypasses Clerk middleware; verifies `stripe-signature` against `STRIPE_WEBHOOK_SECRET` using the raw request body

### Environment Variables

See `.env.example` for full documentation. Required for full functionality:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` — auth
- `DATABASE_URL` — Neon PostgreSQL connection string (pooled)
- `THE_ODDS_API_KEY` — live odds
- `OPENWEATHER_API_KEY` — stadium weather
- `ANTHROPIC_API_KEY` — AI chat assistant (floating bubble, all pages)
- `ENCRYPTION_KEY` — required only if users are allowed to store their own Anthropic key on `/account`
- `GROQ_API_KEY` / `OPENROUTER_API_KEY` — optional, enables chat failover to free providers when Anthropic is unavailable
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` — required for subscriptions/billing (`lib/stripe.ts`, `/api/webhooks/stripe`)
- `NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID` / `_PRO_ANNUAL_PRICE_ID` / `_ELITE_MONTHLY_PRICE_ID` / `_ELITE_ANNUAL_PRICE_ID` — Stripe price IDs allowlisted by `/api/stripe/checkout`
- `CRON_SECRET` — bearer token required by `/api/cron/*` routes (dev-only bypass when unset)
- `RECOMPUTE_TOKEN` — bearer token `/api/cron/daily-sync` uses to call `/api/historical-sync` server-to-server (no Clerk session available between crons)
- `ADMIN_USER_IDS` — comma-separated Clerk user IDs with an unrestricted-access bypass (checked ad hoc, e.g. `/api/debug-tier`)
- `DEBUG_SECRET` + `ENABLE_DEBUG_ENDPOINT` — gate `/api/debug` and `/api/debug-tier` in production

## Important Patterns

- **ET dates everywhere:** Use `new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())` — never `new Date().toISOString().split("T")[0]` (which is UTC)
- **Prisma import:** Always `import { prisma } from "@/lib/prisma"` (singleton pattern)
- **API route config:** Dynamic routes set `export const dynamic = "force-dynamic"` and long-running routes set `export const maxDuration = 300`
- **Path aliases:** `@/` maps to project root (configured in `tsconfig.json`)
- **Tailwind v4:** Config is in `postcss.config.mjs`; CSS variables in `app/globals.css`
- **No Google Fonts:** Layout uses CSS variables for fonts (`app/layout.tsx`)
