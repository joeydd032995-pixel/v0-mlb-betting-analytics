# Dashboard Overhaul — Task Plan

## Target State

Replace the current dashboard intelligence section with 6 data-driven cards:

| Card | Replaces | Source |
|------|----------|--------|
| Season NRFI Accuracy (+ yesterday's best NRFI model) | Season Accuracy | DB: ModelPrediction |
| Season YRFI Accuracy (+ yesterday's best YRFI model) | Season Accuracy (split) | DB: ModelPrediction |
| Yesterday's NRFI/YRFI Results | High Confidence | DB: ModelPrediction |
| Today's Top NRFI Pick | Today's Games (enhanced) | Live predictions |
| Model ROI (unit-based, no $ value) | Model ROI (updated) | DB: ModelPrediction |
| Best Overall Models (top 2, dynamic rank) | — (new) | DB: ModelPrediction |

Value Bets card: **removed**.

---

## Step 1 — New API endpoint: `/api/dashboard-stats`

**File:** `app/api/dashboard-stats/route.ts`

Single endpoint that returns all card data in one round-trip. Queries needed:

### 1a. Season NRFI Accuracy
```
ModelPrediction where status=complete AND prediction=NRFI
→ { total, correct, accuracy }
```

### 1b. Season YRFI Accuracy
```
ModelPrediction where status=complete AND prediction=YRFI
→ { total, correct, accuracy }
```

### 1c. Yesterday's best model — NRFI games
For each completed prediction from yesterday where `actualResult = "NRFI"`:
- Model is "correct for NRFI" if its probability >= 0.5
- Compare Poisson (`poissonNrfi`), ZIP (`zipNrfi`), Markov (`markovNrfi`), Ensemble (`ensembleNrfi`)
- Return model name with highest accuracy on yesterday's NRFI-actual games

### 1d. Yesterday's best model — YRFI games
Same logic, `actualResult = "YRFI"`, correct when model probability < 0.5.

### 1e. Yesterday's results summary
```
ModelPrediction where date=yesterday AND status=complete
→ {
    nrfiPredicted, nrfiCorrect,
    yrfiPredicted, yrfiCorrect
  }
```

### 1f. Model ROI (unit-based)
Assume standard -110 odds for all predictions.
- Win = +0.909 units (100/110)
- Loss = -1.0 unit

```
For all ModelPrediction where status=complete AND correct != null:
→ totalUnits = sum(correct ? +0.909 : -1.0)
→ totalBets = count
→ roi = totalUnits / totalBets * 100  (%)
```

### 1g. Best overall models (top 2)
Re-use the per-model accuracy logic from `/api/performance`:
- Score each model (Poisson, ZIP, Markov, Ensemble) by `correct / total`
- Return top 2 sorted descending

**Status:** [ ] Not started

---

## Step 2 — Today's Top NRFI Pick (server-side)

**File:** `app/dashboard/page.tsx` (server component — fetch inline)

- Call `/api/predictions` from the server component
- Filter for `confidence = "High"`
- Sort by `nrfiProbability` descending
- Surface the top 1 game: matchup, NRFI%, confidence score, home/away pitcher names

If no High confidence games exist, fall back to highest `confidenceScore` regardless of tier.
If no predictions at all (off-season / no games today), show "No games today".

**Status:** [ ] Not started

---

## Step 3 — Dashboard page UI

**File:** `app/dashboard/page.tsx`

### Layout

```
Row A (2 cols): Season NRFI Accuracy | Season YRFI Accuracy
Row B (2 cols): Yesterday's Results  | Today's Top NRFI Pick
Row C (2 cols): Model ROI            | Best Overall Models
────────────────────────────────────────────────────────────
Row D (existing nav cards): Watchlist | Bets | Accuracy | Insights
Row E (existing): Your Stats
```

### Card specs

**Season NRFI Accuracy**
- Headline: `XX.X%` accuracy on NRFI predictions
- Sub: `N correct / M predicted`
- Badge: "Yesterday's best NRFI model: [Model Name]"

**Season YRFI Accuracy**
- Same structure, YRFI side
- Badge: "Yesterday's best YRFI model: [Model Name]"

**Yesterday's Results**
- 2×2 grid: NRFI Correct | NRFI Predicted / YRFI Correct | YRFI Predicted
- Overall yesterday accuracy as headline

**Today's Top NRFI Pick**
- Matchup: `AWAY @ HOME`
- NRFI probability % + confidence score
- Starting pitchers (home + away)
- Links to ensemble deep-dive for that game

**Model ROI**
- Headline: `+X.XX u` or `-X.XX u` (units)
- Sub: `N bets tracked · X% ROI`
- Note: "1 unit per prediction, -110 assumed"

**Best Overall Models**
- Rank 1: Model name + accuracy %
- Rank 2: Model name + accuracy %
- Note: "Updates automatically as predictions are synced"

**Status:** [ ] Not started

---

## Step 4 — Wire up & verify

- Confirm `dashboard-stats` returns correct values against known DB state
- Verify yesterday's best model logic handles edge cases:
  - No completed games yesterday (off-day) → show "N/A"
  - Tie between models → pick alphabetically first
- Verify Today's Top Pick shows/hides gracefully when no games
- Confirm unit ROI math: manual spot-check 5 rows from DB
- Run `pnpm type-check` + `pnpm lint`

**Status:** [ ] Not started

---

## Progress Tracker

| Step | Description | Status |
|------|-------------|--------|
| 1 | `/api/dashboard-stats` endpoint | [x] |
| 2 | Today's Top NRFI Pick (server fetch) | [x] |
| 3 | Dashboard UI — new cards | [x] |
| 4 | Wire up, edge cases, type-check | [x] |

## Notes
- Pre-existing type errors in unrelated files (`app/actions.ts`, `app/api/bets`, `app/bets/page.tsx`, etc.) stem from `@prisma/client` not being generated. Run `npx prisma generate` to resolve them.
- Steps 2 + 3 were combined — top pick fetch is inline in the server component.
- `dashboard-stats` API route remains available for external callers if needed.
