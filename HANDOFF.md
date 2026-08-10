# Handoff Guide

This project has a lot of documentation, accumulated over several audit and
development cycles. This file is the map: what exists, what it's for, and in
what order to read it if you're new here. It doesn't duplicate content —
follow the links.

## Start here, in order

1. **[README.md](./README.md)** — what the product is, how the NRFI/YRFI
   model works conceptually, quick start, full env var reference, project
   structure. Read this first for the "what and why."
2. **[CLAUDE.md](./CLAUDE.md)** — the precise, current architecture reference:
   exact data flow, every API route, every DB table, the tier/billing
   subsystem, the AI chat assistant. This is the file kept most rigorously in
   sync with the code (Claude Code reads it on every session in this repo) —
   when in doubt about "what does this actually do right now," trust this
   file over the narrative docs below.
3. **`prisma/schema.prisma`** — the DB schema itself, comment-annotated per
   table. Cross-reference against CLAUDE.md's "Database Schema" section.

Between the two, README + CLAUDE.md is enough to be productive. Everything
below is either setup mechanics or historical/investigative record.

## Setup

| Doc | Use it for |
|---|---|
| [API_SETUP_GUIDE.md](./API_SETUP_GUIDE.md) | Step-by-step instructions for obtaining every external API key (Clerk, Neon, The Odds API, OpenWeatherMap, SportsBlaze, Stripe, Upstash) |
| [SETUP_CHECKLIST.md](./SETUP_CHECKLIST.md) | A literal checklist to tick through for a first-time local setup (~20 min) |
| [ENV_LOCAL_EXAMPLE.md](./ENV_LOCAL_EXAMPLE.md) | An annotated `.env.local` template — pairs with `.env.example` |
| `.env.example` | The canonical, exhaustive list of every environment variable with inline docs |

If you're setting up the project for the first time: `API_SETUP_GUIDE.md` →
`SETUP_CHECKLIST.md` → `cp .env.example .env.local` and fill it in.

## Historical / investigative record

These are point-in-time audit and evaluation reports. They're valuable for
understanding *why* the code looks the way it does (several non-obvious
guards and comments in `lib/nrfi-models.ts`, `lib/nrfi-engine.ts`, and
`lib/calibration.ts` exist specifically because of findings below), but they
are **not living documentation** — don't treat a past report as describing
current behavior without checking the code or CLAUDE.md first. Read
newest-first if you only have time for one.

| Doc | Date | What it covers |
|---|---|---|
| [AUDIT_REPORT_V2.md](./AUDIT_REPORT_V2.md) | 2026-07-17 | Second audit: DeepNRFI training-pipeline/serving-path parity, evaluation-tooling integrity. Found and fixed 5 train/serve skews. |
| [V3_EVALUATION_REPORT.md](./V3_EVALUATION_REPORT.md) | 2026-07-17 | Evaluation of a proposed v3 meta-learner stacked on the v1 ensemble outputs. Verdict: HOLD — did not clear the promotion bar. |
| [AUDIT_FIXES.md](./AUDIT_FIXES.md) | 2026-06-09 | Finding-by-finding remediation status for AUDIT_REPORT.md, with measured before/after numbers |
| [AUDIT_REPORT.md](./AUDIT_REPORT.md) | 2026-06-09 | The original deep quantitative audit: full pipeline, line-by-line formula verification. Root cause of the half-inning/game-level scale-mismatch fix referenced throughout `lib/nrfi-models.ts` (see `AUDIT_REPORT.md P0-1`) |
| [CODE_AUDIT.md](./CODE_AUDIT.md) | 2026-04-18 | Earlier, lighter-weight security/code-quality pass |
| [ARCHITECTURE_DECISION.md](./ARCHITECTURE_DECISION.md) | 2026-04-18 | Why the project moved from Supabase to Neon + Prisma for persistence |
| [CONFIDENCE_BLEND_DISCOVERY_SPEC.md](./CONFIDENCE_BLEND_DISCOVERY_SPEC.md) | 2026-07-19 | Spec for an internal discovery/backtesting tool (per-model confidence-bucket blend search). Check its `## Status` header before assuming it shipped. |
| [docs/specs/statcast-pitch-mix-zone-whiff.md](./docs/specs/statcast-pitch-mix-zone-whiff.md) | — | Spec for backfilling real Statcast pitch-mix/zone-whiff data to replace the synthetic estimates on the pitcher deep-dive page. Check its `Status` header before assuming it shipped. |

**A pattern worth knowing:** several of these are P0/P1/P2-numbered findings
(e.g. `AUDIT_REPORT.md P0-1`, `AUDIT_REPORT.md P1-4`) that are cited directly
in code comments and in CLAUDE.md. If you see a `P#-#` reference in a comment
and want the full story, it's in `AUDIT_REPORT.md` or `AUDIT_REPORT_V2.md`.

## Where things live (quick map)

This condenses CLAUDE.md's "Key Source Files" table and project structure —
see those for the full picture.

- **Prediction engine** — `lib/nrfi-engine.ts` (orchestration) →
  `lib/nrfi-models.ts` (7 models) → `lib/calibration.ts` (calibration). Entry
  point: `computeAllPredictions()`.
- **Live data fetching** — `lib/api/live-data.ts` (`getLiveGameSlate()`),
  fanning out to `lib/api/mlb-stats.ts`, `lib/api/odds.ts`,
  `lib/api/weather.ts`, `lib/api/sportsblaze.ts`, `lib/api/statcast.ts`.
- **Database** — `prisma/schema.prisma` (schema), `lib/prisma.ts` (client
  singleton — always import from here).
- **Subscriptions/billing** — `lib/tiers.ts` (rules), `lib/subscription.ts`
  (lookup), `lib/require-tier.ts` (route guard), `lib/stripe.ts` (client),
  `app/api/stripe/*` + `app/api/webhooks/stripe` (checkout/portal/sync). See
  CLAUDE.md's "Subscriptions & Tier Gating" section.
- **AI chat assistant** — `app/api/chat/route.ts` in, `lib/ai/*` for the
  provider-failover chain and tool-calling loops. See CLAUDE.md's "AI Chat
  Assistant" section — it's the most detailed subsystem writeup in this repo.
- **API routes** — `app/api/*/route.ts`; the full annotated list is in
  CLAUDE.md's "API Routes" section.
- **Scripts** — `scripts/data/` (Statcast refresh cron), `scripts/deepnrfi/`
  (LightGBM training/backtest/recalibration tooling + `artifacts/`),
  `scripts/agents/` (orchestration helpers for the specialized Claude Code
  agents used on this repo — see `.claude/agents/`).
- **Tests** — `__tests__/*.test.ts` (vitest). Notably
  `audit-regression.test.ts` and `audit-v2-regression.test.ts` pin the fixes
  from the two audit reports above so they can't silently regress; treat
  those as load-bearing, not incidental.

## Commands

See CLAUDE.md's "Commands" section — `pnpm dev`, `pnpm build:prod` (the full
type-check + lint + build gate), `pnpm test`. CI (`.github/workflows/ci.yml`)
runs the same gate on every push/PR.
