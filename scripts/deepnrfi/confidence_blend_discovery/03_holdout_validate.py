"""
Stage 3 of confidence-bucket blend discovery: validate the <=3 pre-registered
candidates (frozen by 02_combo_search.py --freeze-preregistration) against the
2026 holdout only, applying all 4 statistical-bar checks from
CONFIDENCE_BLEND_DISCOVERY_SPEC.md:
  1. n >= 150 qualifying holdout games
  2. out-of-sample (structural -- holdout rows were never touched by Stage 1/2)
  3. Wilson 95% lower bound > 0.524 (breakeven)
  4. Multiple-comparison control: refuses to validate more than 3 frozen
     candidates, and refuses to append a second holdout run for a candidate
     set that differs from a prior run against the same holdout snapshot
     (see spec: re-running Stage 1/2 with a new list after seeing a holdout
     result is not permitted -- a new holdout period would be required).

Records holdout provenance every run: as-of timestamp, dataset snapshot
identifier (CSV sha256+filename, or DB row-count+createdAt watermark), and a
best-effort prediction-generation-cutoff note (CSV mode inherits the app's
documented point-in-time guarantees rather than independently re-verifying
per-row; DB mode can additionally check createdAt predates game date).

Usage:
    python 03_holdout_validate.py --csv path/to/nrfi-data-all-<date>.csv
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    BREAKEVEN_THRESHOLD, HOLDOUT_SEASON, MIN_HOLDOUT_GAMES,
    combo_hit_rate, load_games, load_manifest, save_manifest, utcnow_iso, wilson_ci,
    add_data_source_args,
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_data_source_args(p)
    p.add_argument("--manifest", default=str(Path(__file__).resolve().parent / "search_manifest.json"))
    return p.parse_args()


def main() -> int:
    args = parse_args()
    manifest_path = Path(args.manifest)
    manifest = load_manifest(manifest_path)

    if not manifest.get("preregistration_frozen"):
        print("No frozen pre-registration found -- run 02_combo_search.py --freeze-preregistration first.",
              file=sys.stderr)
        return 2

    candidates = manifest.get("preregistered_candidates", [])
    if len(candidates) == 0 or len(candidates) > 3:
        print(f"Expected 1-3 pre-registered candidates, found {len(candidates)}", file=sys.stderr)
        return 2

    df, source = load_games(args.csv, args.db_url)
    if source.get("is_smoke_schema"):
        print("Refusing to run the real holdout validation against the smoke-test schema "
              "(scratchpad enrichment CSV) -- use a real /api/export-data?model=all export.",
              file=sys.stderr)
        return 2

    holdout = df[df["season"] == HOLDOUT_SEASON]
    if len(holdout) == 0:
        print(f"No rows found for holdout season {HOLDOUT_SEASON}", file=sys.stderr)
        return 2

    as_of = utcnow_iso()
    candidate_key = tuple(sorted((c["combo_id"], c["rule"]) for c in candidates))

    prior_runs = manifest.get("holdout_runs", [])
    for prior in prior_runs:
        prior_key = tuple(sorted((c[0], c[1]) for c in prior["candidate_keys"]))
        if prior_key != candidate_key:
            print("A prior holdout run exists for a DIFFERENT frozen candidate set. Per the spec, "
                  "re-running Stage 1/2 with a new candidate list against the same holdout is not "
                  "permitted -- a genuinely new holdout period would be needed. Refusing to proceed.",
                  file=sys.stderr)
            return 2

    if source["mode"] == "csv":
        cutoff_note = ("CSV mode: leakage-freeness inherited from the app's documented "
                        "point-in-time guarantees (app/api/historical-sync/route.ts); "
                        "not independently re-verified per row in this run.")
    else:
        cutoff_note = ("DB mode: createdAt watermark recorded; per-row createdAt-precedes-game-date "
                        "check not yet implemented in this script -- treat as a partial guarantee.")

    dataset_snapshot_id = (
        {"csv_filename": Path(source["path"]).name, "sha256": source["sha256"]}
        if source["mode"] == "csv"
        else {"n_rows": source["n_rows_raw"], "created_at_watermark": source["created_at_watermark"],
              "ensemble_version": source["ensemble_version"]}
    )

    print(f"=== Stage 3 holdout validation (season {HOLDOUT_SEASON}, n={len(holdout)} rows) ===")
    print(f"As-of: {as_of}")
    print(f"Dataset snapshot: {dataset_snapshot_id}")
    print(f"Cutoff note: {cutoff_note}\n")

    qualify_cache: dict = {}
    run_results = []
    any_pass = False
    for cand in candidates:
        constraints = [tuple(c) for c in cand["combo_constraints"]]
        rule = cand["rule"]
        stats = combo_hit_rate(holdout, constraints, rule, qualify_cache=qualify_cache)
        n, wins = stats["n"], stats["wins"]
        lo, hi = wilson_ci(wins, n) if n > 0 else (float("nan"), float("nan"))

        bar_n = n >= MIN_HOLDOUT_GAMES
        bar_oos = True  # structural: holdout rows untouched by Stage 1/2
        bar_ci = (lo > BREAKEVEN_THRESHOLD) if n > 0 else False
        bar_mc = len(candidates) <= 3
        eligible = bar_n and bar_oos and bar_ci and bar_mc
        any_pass = any_pass or eligible

        result = {
            "combo_id": cand["combo_id"], "rule": rule, "combo_constraints": constraints,
            "side": cand["side"], "train_hit_rate": cand["hit_rate"],
            "holdout_n": n, "holdout_wins": wins, "holdout_hit_rate": stats["hit_rate"],
            "wilson_lower_bound": lo, "wilson_upper_bound": hi,
            "breakeven_threshold": BREAKEVEN_THRESHOLD,
            "bar_min_sample": bar_n, "bar_out_of_sample": bar_oos,
            "bar_ci_floor": bar_ci, "bar_multiple_comparison": bar_mc,
            "eligible": eligible,
        }
        run_results.append(result)

        verdict = "CLEARS BAR" if eligible else "does not clear bar"
        print(f"[{cand['combo_id']}:{rule}] holdout n={n} wins={wins} "
              f"hit_rate={stats['hit_rate'] if n else float('nan'):.4f} "
              f"wilson_lower={lo:.4f} -> {verdict}")

    print(f"\nFinal verdict: {'AT LEAST ONE CANDIDATE CLEARS THE BAR' if any_pass else 'NO CANDIDATE CLEARED THE BAR (clean negative)'}")

    manifest.setdefault("holdout_runs", [])
    manifest["holdout_runs"].append({
        "as_of_timestamp": as_of,
        "dataset_snapshot_id": dataset_snapshot_id,
        "prediction_generation_cutoff_note": cutoff_note,
        "holdout_season": HOLDOUT_SEASON,
        "holdout_n_rows": len(holdout),
        "candidate_keys": list(candidate_key),
        "results": run_results,
        "any_candidate_cleared_bar": any_pass,
    })
    save_manifest(manifest_path, manifest)
    print(f"\nAppended holdout run to {manifest_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
