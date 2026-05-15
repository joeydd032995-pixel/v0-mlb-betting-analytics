# DeepNRFI training pipeline

Offline-trained LightGBM model that augments the live 7-model ensemble.
The TS bridge `lib/deepnrfi-model.ts` loads the artifacts produced here.

## Layout

```text
scripts/deepnrfi/
  data/                 # CSV exports (gitignored)
  artifacts/            # Committed model artifacts
    manifest.json
    model_v{N}.txt
    feature_importance_v{N}.json
    calibration_v{N}.json
  train.py              # LightGBM trainer
  predict.py            # Offline batch scorer
  recalibrate.py        # Refit calibration spline only
  backtest_v2.py        # Compare v1 (7 models) vs v2 (9 models) on holdout
  build_real_training_set.py # Point-in-time training CSV builder (canonical)
  requirements.txt
```

## Workflow

Training sets are built with the **point-in-time builder**, which reconstructs
real Statcast + lineup features per game so the model trains on real outcomes
without a 14–30 day production shadow window.  (The previous TypeScript
exporter `export_training_data.ts` filled every non-ensemble feature with a
league-average placeholder and has been removed — it was a point-in-time
leakage / staleness hazard.)

### Point-in-time real training set

Total wall-clock ~4–6 hours, mostly background.  Run from the repo root.

1. **Install Python deps** (once):

   ```bash
   python -m venv .venv && source .venv/bin/activate
   pip install -r scripts/deepnrfi/requirements.txt
   ```

2. **Build the training CSV.**  This pulls Statcast, fetches MLB Stats
   boxscores for each game, joins against `GameResult` × `ModelPrediction`,
   and writes `scripts/deepnrfi/data/training.csv`.  Both heavy fetches are
   cached to disk so a re-run resumes instantly.

   ```bash
   DATABASE_URL="<your Neon URL>" \
     python scripts/deepnrfi/build_real_training_set.py \
       --from 2023-04-01 --to 2024-09-30
   ```

3. **Train** on the real CSV:

   ```bash
   python scripts/deepnrfi/train.py --version v1
   ```

   Inspect `scripts/deepnrfi/artifacts/manifest.json`.  If walk-forward CV
   `brier < 0.245` you have evidence the model generalises; promote in
   production.  If not, iterate on features or wait for more data.

4. **Promote** by committing the artifacts under `scripts/deepnrfi/artifacts/`
   and setting `ENABLE_DEEPNRFI=true` + `ENSEMBLE_VERSION=v2.9models` in the
   runtime env (Vercel for production, GH Actions Variables for crons).

5. **Backtest** v2 vs v1 once a few days of v2 predictions have completed:

   ```bash
   python scripts/deepnrfi/backtest_v2.py --season 2024
   ```

## Compatibility notes

- The TS bridge parses the LightGBM **text format** (`booster.save_model(...)`).
  Categorical splits are not supported — keep features numeric.
- Feature order is locked by `manifest.json` → `featureOrder`.  When you add a
  new feature, also add it to `FEATURE_ORDER` in
  `lib/features/feature-vector.ts` and bump the version tag.
