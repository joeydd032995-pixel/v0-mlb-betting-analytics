"""
Stage 2 of confidence-bucket blend discovery: enumerate 2-4-distinct-model,
same-side combos drawn from Stage 1's eligible cells (n >= 150), score every
combo under BOTH qualification rules (AND: all listed models qualify; OR: at
least one qualifies -- see CONFIDENCE_BLEND_DISCOVERY_SPEC.md Open Question #4),
and append every combo tested (survivors and non-survivors alike) to
search_manifest.json for reproducibility.

Also performs the human-reviewed pre-registration freeze: selecting <=3
primary candidates from this ranking BEFORE Stage 3 ever touches the holdout.

Usage:
    # Search + rank (train period only):
    python 02_combo_search.py --csv path/to/nrfi-data-all-<date>.csv

    # After reviewing the printed rankings, freeze <=3 candidates by their
    # printed combo_id (one researcher decision, not a scripted top-N cut):
    python 02_combo_search.py --freeze-preregistration \\
        --candidates <id1>,<id2>,<id3> \\
        --rationale "Chosen for highest train hit-rate with distinct model coverage"
"""

from __future__ import annotations

import argparse
import itertools
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    MIN_TRAIN_CELL_GAMES, TRAIN_SEASONS,
    combo_hit_rate, combo_id, load_games, load_manifest, save_manifest, utcnow_iso,
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--manifest", default=str(Path(__file__).resolve().parent / "search_manifest.json"))
    p.add_argument("--freeze-preregistration", action="store_true",
                    help="Freeze <=3 pre-registered candidates from an existing stage2_combos manifest; skips search.")
    p.add_argument("--candidates", default=None, help="Comma-separated combo_id(:rule) values to freeze, e.g. 'abc123:AND,def456:OR'")
    p.add_argument("--rationale", default=None, help="Free-text reason for the pre-registration choice (required with --freeze-preregistration)")
    p.add_argument("--label", default=None)

    src = p.add_argument_group("data source (required unless --freeze-preregistration)")
    src.add_argument("--csv")
    src.add_argument("--db-url")
    return p.parse_args()


def bucket_bounds(label: str) -> tuple[float, float]:
    # "[60,70)" / "[90,100]" -> (60.0, 70.0) / (90.0, 100.0)
    inner = label.strip("[]()")
    lo, hi = inner.split(",")
    return float(lo), float(hi)


def enumerate_combos(eligible_cells: list[dict]) -> list[list[tuple]]:
    """eligible_cells: stage1 cells with n >= MIN_TRAIN_CELL_GAMES. Returns a
    list of same-side, distinct-model constraint lists of size 2-4."""
    by_side: dict[str, dict[str, list[dict]]] = {"NRFI": {}, "YRFI": {}}
    for c in eligible_cells:
        by_side[c["side"]].setdefault(c["model"], []).append(c)

    combos: list[list[tuple]] = []
    for side, model_cells in by_side.items():
        models = sorted(model_cells.keys())
        for size in (2, 3, 4):
            for model_subset in itertools.combinations(models, size):
                cell_choices = [model_cells[m] for m in model_subset]
                for combo_cells in itertools.product(*cell_choices):
                    constraints = []
                    for cell in combo_cells:
                        lo, hi = bucket_bounds(cell["bucket"])
                        constraints.append((cell["model"], side, lo, hi))
                    combos.append(sorted(constraints, key=lambda c: c[0]))
    # Dedup identical constraint sets (shouldn't occur given distinct models
    # per subset, but the spec requires the search itself to guarantee it).
    seen = set()
    deduped = []
    for combo in combos:
        key = tuple(combo)
        if key not in seen:
            seen.add(key)
            deduped.append(combo)
    return deduped


def run_search(args: argparse.Namespace) -> int:
    if bool(args.csv) == bool(args.db_url):
        print("Search mode requires exactly one of --csv or --db-url", file=sys.stderr)
        return 2

    manifest_path = Path(args.manifest)
    manifest = load_manifest(manifest_path)
    if "stage1_bucket_cells" not in manifest:
        print(f"{manifest_path} has no stage1_bucket_cells -- run 01_bucket_backtest.py first", file=sys.stderr)
        return 2

    df, source = load_games(args.csv, args.db_url)
    train = df[df["season"].isin(TRAIN_SEASONS)]

    eligible = [c for c in manifest["stage1_bucket_cells"] if c["n"] >= MIN_TRAIN_CELL_GAMES]
    combos = enumerate_combos(eligible)
    print(f"Enumerated {len(combos)} distinct same-side combos (size 2-4) from {len(eligible)} eligible cells")

    qualify_cache: dict = {}  # shared across combos: many share the same (model,side,bucket) cell
    results = []
    for constraints in combos:
        row_common = {
            "combo_constraints": constraints,
            "models": sorted({c[0] for c in constraints}),
            "side": constraints[0][1],
            "size": len(constraints),
        }
        for rule in ("AND", "OR"):
            stats = combo_hit_rate(train, constraints, rule, qualify_cache=qualify_cache)
            cid = combo_id(constraints, rule)
            results.append({**row_common, "rule": rule, "combo_id": cid, **stats})

    # Sanity check: OR applicable-count must never be smaller than AND's for
    # the same constraint set (AND is a strict subset of OR by construction).
    by_constraints: dict[tuple, dict] = {}
    for r in results:
        key = tuple(r["combo_constraints"])
        by_constraints.setdefault(key, {})[r["rule"]] = r["n"]
    for key, ns in by_constraints.items():
        if "AND" in ns and "OR" in ns and ns["OR"] < ns["AND"]:
            raise AssertionError(f"OR n ({ns['OR']}) < AND n ({ns['AND']}) for {key} -- logic bug")

    and_ranked = sorted([r for r in results if r["rule"] == "AND" and r["n"] > 0], key=lambda r: -r["hit_rate"])
    or_ranked = sorted([r for r in results if r["rule"] == "OR" and r["n"] > 0], key=lambda r: -r["hit_rate"])

    print(f"\n=== Top 10 AND-rule combos (train, {TRAIN_SEASONS}) ===")
    for r in and_ranked[:10]:
        print(f"  [{r['combo_id']}] {r['side']:4s} n={r['n']:4d} hit_rate={r['hit_rate']:.4f}  {r['combo_constraints']}")

    print(f"\n=== Top 10 OR-rule combos (train, {TRAIN_SEASONS}) ===")
    for r in or_ranked[:10]:
        print(f"  [{r['combo_id']}] {r['side']:4s} n={r['n']:4d} hit_rate={r['hit_rate']:.4f}  {r['combo_constraints']}")

    manifest.setdefault("stage2_combos", [])
    existing_ids = {r["combo_id"] for r in manifest["stage2_combos"]}
    new_results = [r for r in results if r["combo_id"] not in existing_ids]
    manifest["stage2_combos"].extend(new_results)
    manifest["stage2_source"] = source
    manifest["stage2_generated_at"] = utcnow_iso()
    if args.label:
        manifest["stage2_label"] = args.label
    save_manifest(manifest_path, manifest)
    print(f"\nAppended {len(new_results)} new combo/rule rows to {manifest_path} "
          f"({len(manifest['stage2_combos'])} total)")
    print("\nReview the rankings above, then freeze <=3 candidates with:")
    print(f"  python {Path(__file__).name} --freeze-preregistration --candidates <combo_id>:<rule>,... --rationale \"...\"")
    return 0


def run_freeze(args: argparse.Namespace) -> int:
    if not args.candidates or not args.rationale:
        print("--freeze-preregistration requires --candidates and --rationale", file=sys.stderr)
        return 2

    manifest_path = Path(args.manifest)
    manifest = load_manifest(manifest_path)
    if "stage2_combos" not in manifest:
        print(f"{manifest_path} has no stage2_combos -- run the search first", file=sys.stderr)
        return 2

    picks = []
    for token in args.candidates.split(","):
        cid, _, rule = token.strip().partition(":")
        picks.append((cid, rule or "AND"))
    if len(picks) > 3:
        print(f"At most 3 pre-registered candidates allowed, got {len(picks)}", file=sys.stderr)
        return 2

    by_id_rule = {(r["combo_id"], r["rule"]): r for r in manifest["stage2_combos"]}
    frozen = []
    for cid, rule in picks:
        row = by_id_rule.get((cid, rule))
        if row is None:
            print(f"combo_id {cid} (rule={rule}) not found in stage2_combos", file=sys.stderr)
            return 2
        frozen.append(row)

    if manifest.get("preregistration_frozen"):
        existing = {(r["combo_id"], r["rule"]) for r in manifest.get("preregistered_candidates", [])}
        new = {(r["combo_id"], r["rule"]) for r in frozen}
        if existing != new:
            print("Pre-registration is already frozen with a different candidate set -- "
                  "refusing to overwrite (see spec: re-running Stage 1/2 against the same "
                  "holdout after seeing results is not permitted).", file=sys.stderr)
            return 2
        print("Pre-registration already frozen with this exact candidate set -- no change.")
        return 0

    manifest["preregistered_candidates"] = frozen
    manifest["preregistration_rationale"] = args.rationale
    manifest["preregistration_frozen"] = True
    manifest["preregistered_at"] = utcnow_iso()
    save_manifest(manifest_path, manifest)
    print(f"Froze {len(frozen)} pre-registered candidate(s) in {manifest_path}:")
    for r in frozen:
        print(f"  [{r['combo_id']}:{r['rule']}] train hit_rate={r['hit_rate']:.4f} n={r['n']} {r['combo_constraints']}")
    return 0


def main() -> int:
    args = parse_args()
    if args.freeze_preregistration:
        return run_freeze(args)
    return run_search(args)


if __name__ == "__main__":
    sys.exit(main())
