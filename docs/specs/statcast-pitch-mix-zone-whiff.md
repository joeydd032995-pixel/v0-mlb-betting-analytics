# Spec: Full Statcast — Pitch Mix + Zone Whiff Backfill

> Status: **DRAFT — awaiting human approval** (Phase 1 of spec-driven workflow).
> Branch: `claude/statcast-pitch-mix-zone-whiff` (cut from `main`).

## Objective

The pitcher deep-dive page (`/pitcher/[playerId]`) renders two "Quality of
Stuff" panels — **Pitch Mix** and **Strike Zone Whiff%** — that today always
display synthetic data estimated from strikeout rate and print the warning
*"⚠ Estimated — real Statcast data unavailable via free MLB API."* The free MLB
Stats API genuinely doesn't expose pitch-by-pitch data, and nothing in the app
fetches or stores it.

**What we're building:** a real Statcast data path for these two panels.
pybaseball (already used by `scripts/data/refresh_statcast.py`) returns
pitch-level rows; we will aggregate per-pitcher **pitch-mix** and a **5×5
zone-whiff grid**, store them in the existing `pitcher_statcast.payload` JSON,
and consume them on the pitcher page so the panels show real data with a
"Statcast" badge — falling back to today's estimate when data is absent.

**User:** someone viewing a pitcher's profile to judge arsenal and swing-and-miss
locations.

**Success looks like:** for a pitcher with a populated, sufficiently-sampled
`pitcher_statcast` row, both panels render real pitch usage/velocity and real
per-zone whiff%, the "Estimated" warning disappears, and the chip reads
"Statcast". For an unpopulated/thin pitcher, behavior is unchanged from today.

### Decisions (confirmed with stakeholder)
- **Whiff metric:** whiff% = swinging strikes / swings (standard whiff rate).
- **Zone grid:** 5×5 bins over `plate_x ∈ [−0.83, 0.83]` ft and `plate_z` over
  the rulebook zone (`sz_bot`..`sz_top`, falling back to ~1.5–3.5 ft).
- **Pitch mix:** full arsenal — every distinct pitch type, no "Other" bucket.
- **Thin data:** min-sample gate (≥ 200 pitches season-to-date). Below it, store
  no `pitchMix`/`zoneWhiff`, so the UI keeps the estimated fallback.

## Tech Stack
- **App:** Next.js 16 (App Router), React 19, TypeScript 5 (existing).
- **DB:** Neon Postgres via Prisma 5 — existing `pitcher_statcast` table
  (`prisma/schema.prisma`), JSON `payload` column. **No schema migration**
  (payload is untyped JSON; we add keys).
- **Backfill:** Python 3, pybaseball + pandas + psycopg (existing
  `scripts/data/refresh_statcast.py`, `scripts/data/requirements.txt`).
- **Tests:** vitest (existing, `__tests__/`).

## Commands
```bash
pnpm dev                  # local app
pnpm test                 # vitest (pure TS mappers/validators)
pnpm type-check           # tsc --noEmit
pnpm lint                 # eslint
pnpm exec next build      # compile (full `pnpm build` needs DATABASE_URL)
# Backfill (manual; needs DATABASE_URL + pybaseball):
python scripts/data/refresh_statcast.py --from 2024-04-01 --to 2024-09-30
python scripts/data/refresh_statcast.py --from 2024-04-01 --to 2024-04-07 --dry-run
```

## Project Structure (files touched)
```
lib/types.ts                              → extend StatcastPitcherSummary (+ pitchMix?, zoneWhiff?)
lib/api/statcast-normalize.ts             → NEW: validate/normalize the richer payload (pure)
lib/api/statcast.ts                       → fetchStatcastPitcher passes payload through normalizer
lib/pitcher/pitch-mix-display.ts          → NEW: map raw pitch-type codes → PitchEntry[] (name/color/usage/velo)
app/pitcher/[playerId]/page.tsx           → read pitcher_statcast, pass props to the two panels
components/pitcher/PitchMixDonut.tsx       → (unchanged API) receives real `pitches`
components/pitcher/StrikeZoneHeatmap.tsx   → (unchanged API) receives real `values`
scripts/data/refresh_statcast.py          → add summarise_pitch_mix(df) + summarise_zone_whiff(df); merge into pitcher payload
__tests__/statcast-pitch-mix.test.ts       → NEW: vitest for normalizer + display mapper
docs/specs/statcast-pitch-mix-zone-whiff.md → this spec
```

## Data Model (payload additions — backward-compatible)
Extend `StatcastPitcherSummary` with two optional fields:
```ts
export interface StatcastPitchType {
  code: string        // raw Statcast pitch_type, e.g. "FF","SL","CH","CU","SI","FC","ST","KC"
  usage: number       // 0–1 share of this pitcher's pitches
  velocityMph: number // mean release_speed for this type
}
export interface StatcastPitcherSummary {
  // ...existing: fbVeloAvg, fbSpinAvg, breaking_pct, stuffPlus, releaseHeight?, releaseSide?
  /** Full arsenal usage/velocity, descending by usage. Present only when n_pitches ≥ MIN_PITCHES. */
  pitchMix?: StatcastPitchType[]
  /** 25 whiff% values (swstr/swings), row-major top-left→bottom-right 5×5. Present only when gated. */
  zoneWhiff?: number[]
}
```
- `MIN_PITCHES = 200` (shared constant; Python + TS agree).
- Existing numeric summary fields are unchanged, so the NRFI feature vector
  (`lib/features/feature-vector.ts`) is unaffected.

## Backfill Computation (`refresh_statcast.py`)
Operates on the already-pulled `statcast()` DataFrame `df`.

**`summarise_pitch_mix(df)`** — per `pitcher`:
- `n_pitches = count`; skip pitchers with `n_pitches < MIN_PITCHES`.
- group by `pitch_type`: `usage = count/n_pitches`, `velocityMph = mean(release_speed)`.
- drop null/`"PO"`/`"EP"`-style non-pitches; emit list sorted by usage desc.

**`summarise_zone_whiff(df)`** — per `pitcher`:
- swings = `description ∈ {swinging_strike, swinging_strike_blocked, foul,
  foul_tip, hit_into_play}`; whiffs = `{swinging_strike, swinging_strike_blocked}`.
- bin `plate_x` into 5 cols over `[−0.83, 0.83]`; bin `plate_z` into 5 rows over
  `[sz_bot, sz_top]` per-row (fallback `[1.5, 3.5]`), **row 0 = top** (high
  pitches) to match the component's row-major top-left→bottom-right order.
- cell value = `whiffs / swings` (0 when swings == 0); output length-25 array.
- skip pitchers with `n_pitches < MIN_PITCHES`.

Merge both into the existing pitcher payload dict before `upsert(...,
"pitcher_statcast", ...)`. Keys absent when gated out.

## UI Consumption (`app/pitcher/[playerId]/page.tsx`)
- After `fetchPitcherStats`, also call `fetchStatcastPitcher(String(numericId))`
  (existing adapter) → `statcast | null`; attach to the built `Pitcher`.
- `lib/pitcher/pitch-mix-display.ts`: `toPitchEntries(pitchMix) → PitchEntry[]`
  mapping `code → {name,color}` via a static table (FF→"Four-Seam FB", SL→
  "Slider", etc.; unknown code → uppercased code + neutral color). Pass-through
  `usage`, `velocityMph`.
- Render:
  ```tsx
  <PitchMixDonut kRate={...} pitches={statcast?.pitchMix ? toPitchEntries(statcast.pitchMix) : undefined} />
  <StrikeZoneHeatmap kRate={...} values={statcast?.zoneWhiff} />
  ```
  Panels already flip chip→"Statcast" and hide the warning when the prop is
  present. No component-internal changes required.

## Code Style
Match existing files. Pure, side-effect-free mappers; explicit league/grid
constants with comments; `?? undefined` to preserve the panels' presence checks.
```ts
const PITCH_META: Record<string, { name: string; color: string }> = {
  FF: { name: "Four-Seam FB", color: "var(--ds-cy)" },
  SL: { name: "Slider",       color: "var(--ds-bl)" },
  CH: { name: "Changeup",     color: "var(--ds-gr)" },
  CU: { name: "Curveball",    color: "var(--ds-warn)" },
  // SI, FC, ST, KC, FS, KN... + fallback
}
```

## Testing Strategy
- **vitest (`__tests__/statcast-pitch-mix.test.ts`)** — pure units only:
  - `normalizeStatcastPitcher`: accepts valid `pitchMix`/`zoneWhiff`; drops
    `zoneWhiff` whose length ≠ 25 or contains non-finite; drops malformed
    `pitchMix` entries; still returns the core summary when rich fields absent.
  - `toPitchEntries`: known codes → display names/colors; unknown code →
    fallback; order preserved; usage/velocity passed through.
- **Python:** validated manually via `--dry-run` against a short date range
  (prints head of pitch-mix / zone tables). No pytest in repo today — adding a
  Python test harness is **Ask-first** (see Boundaries), not in this scope.
- **Gates:** `pnpm test` green, `pnpm type-check` clean, `pnpm lint` 0 errors,
  `pnpm exec next build` succeeds.

## Boundaries
- **Always:** run the four gates before commit; keep payload additions optional
  and backward-compatible; preserve the estimated-fallback path; keep
  `MIN_PITCHES` identical in TS and Python.
- **Ask first:** any Prisma schema migration (not expected); adding a Python
  test framework / new Python deps; wiring the backfill into CI/cron; changing
  the NRFI feature vector or `FEATURE_ORDER`.
- **Never:** commit secrets/`DATABASE_URL`; alter the trained LightGBM artifact
  or `FEATURE_ORDER`; remove the estimated fallback; reshape existing summary
  fields consumed by the feature vector.

## Success Criteria (testable)
1. With a seeded `pitcher_statcast` row containing `pitchMix` + a length-25
   `zoneWhiff`, `/pitcher/[id]` shows real pitch list (names, usage%, velo) and a
   real whiff heatmap; both chips read "Statcast"; no warning text.
2. With no row (or a row gated out for < 200 pitches), both panels render exactly
   as today (estimated, warning shown). No errors/crashes.
3. `refresh_statcast.py --dry-run` prints non-empty pitch-mix and 25-length zone
   arrays for high-volume pitchers and omits sub-threshold pitchers.
4. `normalizeStatcastPitcher` rejects a `zoneWhiff` of wrong length / non-finite
   cells (unit-tested) so a malformed row can't reach the heatmap.
5. All four gates pass; `FEATURE_ORDER` and the NRFI engine output are byte-for-
   byte unchanged.

## Open Questions
- **Zone-cell sparsity:** with whiffs/swings, low-swing corner cells read 0.
  Acceptable for v1 (matches "no whiffs observed")? Alternative: shrink toward
  the pitcher's overall whiff% — deferred unless requested.
- **Velocity unit/rounding:** store raw mean mph (1 decimal) — component formats
  to 1 decimal. OK as-is.
- **Backfill scheduling:** this spec covers computation + storage + UI only. The
  nightly cron (Phase 6 in the script header) remains out of scope.

## Relationship to PR #94
Independent. PR #94 wires the *numeric* Statcast summary into the NRFI feature
vector; this feature adds *pitch-mix/zone* fields for the pitcher UI. They share
the `pitcher_statcast` table and `StatcastPitcherSummary` type but touch
different consumers. No merge-order dependency; if both land, the optional
fields coexist.
