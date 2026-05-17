/**
 * Removed: this legacy path only emitted real values for `ensemble7_nrfi` and
 * filled every other feature column with a league-average placeholder, which
 * silently poisoned training with point-in-time leakage / staleness.
 *
 * Use the point-in-time Python builder instead:
 *
 *   python scripts/deepnrfi/build_real_training_set.py --from 2023-04-01 --to 2024-09-30
 *
 * See scripts/deepnrfi/README.md for the full workflow.
 */

console.error(
  "scripts/deepnrfi/export_training_data.ts has been removed.\n" +
    "Use the point-in-time builder instead:\n" +
    "  python scripts/deepnrfi/build_real_training_set.py --from YYYY-MM-DD --to YYYY-MM-DD\n" +
    "See scripts/deepnrfi/README.md for details.",
)
process.exit(1)
