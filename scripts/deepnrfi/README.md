# DeepNRFI training pipeline

Offline-trained LightGBM model that augments the live 7-model ensemble.
The TS bridge `lib/deepnrfi-model.ts` loads the artifacts produced here.

## Layout

```
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
  export_training_data.ts # Build training CSV from Postgres
  requirements.txt
```

## Workflow

1. **Export training data** (after the historical-sync route has populated `GameResult` and `ModelPrediction`):

   ```
   tsx scripts/deepnrfi/export_training_data.ts --from 2023-04-01 --to 2024-09-30
   ```

2. **Install Python deps** (once):

   ```
   python -m venv .venv && source .venv/bin/activate
   pip install -r scripts/deepnrfi/requirements.txt
   ```

3. **Train**:

   ```
   python scripts/deepnrfi/train.py --version v1
   ```

   Or to smoke-test end-to-end without real data:

   ```
   python scripts/deepnrfi/train.py --version v1 --dry-run
   ```

4. **Promote** by committing the new artifacts under `scripts/deepnrfi/artifacts/`.
   Set `ENABLE_DEEPNRFI=true` and `ENSEMBLE_VERSION=v2.9models` in your env to
   route predictions through the stacker.

5. **Backtest** v2 vs v1 before flipping the flag in production:

   ```
   python scripts/deepnrfi/backtest_v2.py --season 2024
   ```

## Compatibility notes

- The TS bridge parses the LightGBM **text format** (`booster.save_model(...)`).
  Categorical splits are not supported — keep features numeric.
- Feature order is locked by `manifest.json` → `featureOrder`.  When you add a
  new feature, also add it to `FEATURE_ORDER` in
  `lib/features/feature-vector.ts` and bump the version tag.
