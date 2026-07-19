"""
Shared loading, bucketing, qualification, combination, and manifest helpers for
the confidence-bucket blend discovery scripts (01_bucket_backtest.py,
02_combo_search.py, 03_holdout_validate.py).

All three scripts import from here rather than from each other (Python can't
import a module whose filename starts with a digit, and — more importantly —
Stage 3's holdout validation MUST use the exact same qualification/combination
logic Stage 2 screened with, or the pre-registration discipline in
CONFIDENCE_BLEND_DISCOVERY_SPEC.md is silently broken).

See CONFIDENCE_BLEND_DISCOVERY_SPEC.md for the full spec this implements.

Usage (as a library only — no __main__):
    from common import load_games, MODEL_COLUMNS, combo_hit_rate, wilson_ci
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

try:
    import numpy as np
    import pandas as pd
    from statsmodels.stats.proportion import proportion_confint
except ImportError as e:
    print(f"Missing dep: {e}.  pip install -r scripts/deepnrfi/requirements.txt", file=sys.stderr)
    raise SystemExit(1) from e


ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "scripts" / "deepnrfi" / "confidence_blend_discovery" / "data"

# ─── Canonical search space (CONFIDENCE_BLEND_DISCOVERY_SPEC.md, Success Criteria) ──

MODEL_COLUMNS = [
    "poissonNrfi", "zipNrfi", "markovNrfi", "mapreNrfi",
    "logisticMetaNrfi", "nnInteractionNrfi", "hierarchicalBayesNrfi",
]
BUCKET_EDGES = [50, 60, 70, 80, 90, 100]
BUCKET_LABELS = ["[50,60)", "[60,70)", "[70,80)", "[80,90)", "[90,100]"]
BREAKEVEN_THRESHOLD = 0.524
MIN_TRAIN_CELL_GAMES = 150
MIN_HOLDOUT_GAMES = 150
TRAIN_SEASONS = (2023, 2024, 2025)
HOLDOUT_SEASON = 2026

# Mirrored from lib/nrfi-models.ts:626-638 (RAW_ENSEMBLE_WEIGHTS, renormalized as
# ENSEMBLE_WEIGHTS). Sum is already 1.00 so the two are numerically identical.
# NOT auto-synced across TS/Python — re-check both sides if production weights
# ever change via walk-forward CV evidence (see that file's comments).
ENSEMBLE_WEIGHTS = {
    "poissonNrfi":           0.12,
    "zipNrfi":               0.30,
    "markovNrfi":            0.48,
    "mapreNrfi":             0.10,
    "logisticMetaNrfi":      0.0,
    "nnInteractionNrfi":     0.0,
    "hierarchicalBayesNrfi": 0.0,
}

# The scratchpad enrichment artifact from an earlier session's v3-retrain
# analysis carries "_p" decimal-schema columns the real /api/export-data CSV
# never has. Detecting these lets us refuse it as real holdout input while
# still allowing it as a smoke-test fixture.
SMOKE_SCHEMA_MARKER_COLUMNS = ["poissonNrfi_p", "ensembleNrfi_new_p"]


class SchemaError(ValueError):
    pass


def add_data_source_args(p: argparse.ArgumentParser) -> None:
    """Attach the shared, mutually-exclusive --csv / --db-url flags."""
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--csv", help="Path to a CSV exported via GET /api/export-data?model=all")
    src.add_argument("--db-url", help="Neon/Postgres connection string (same as DATABASE_URL)")


def _is_smoke_schema(df: pd.DataFrame) -> bool:
    return any(c in df.columns for c in SMOKE_SCHEMA_MARKER_COLUMNS)


def _load_from_csv(csv_path: str) -> tuple[pd.DataFrame, dict]:
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"CSV not found: {path}")
    raw = pd.read_csv(path)

    is_smoke = _is_smoke_schema(raw)

    df = pd.DataFrame()
    if is_smoke:
        # Scratchpad enrichment schema: model columns already 0-100, plus a
        # parallel "_p" 0-1 set. Prefer the 0-100 set for consistency with the
        # real export, and derive nrfi from the "y"/"nrfi" column present there.
        for col in MODEL_COLUMNS:
            df[col] = pd.to_numeric(raw.get(col), errors="coerce") / 100.0
        if "nrfi" in raw.columns:
            df["nrfi_is_nrfi"] = raw["nrfi"].astype(str).str.upper().eq("NRFI")
        elif "y" in raw.columns:
            df["nrfi_is_nrfi"] = raw["y"].astype(int).eq(1)
        else:
            raise SchemaError("Smoke-test CSV has neither 'nrfi' nor 'y' column")
        df["season"] = pd.to_datetime(raw["date"]).dt.year if "season" not in raw.columns else raw["season"]
        df["date"] = raw["date"]
    else:
        required = {"date", "season", "nrfi", *MODEL_COLUMNS}
        missing = required - set(raw.columns)
        if missing:
            raise SchemaError(f"CSV missing expected export-data columns: {sorted(missing)}")
        for col in MODEL_COLUMNS:
            # pct() writes "" for null and a 0-100 string otherwise (see
            # app/api/export-data/route.ts) -> back to 0-1 float, NaN if blank.
            df[col] = pd.to_numeric(raw[col], errors="coerce") / 100.0
        df["nrfi_is_nrfi"] = raw["nrfi"].astype(str).str.upper().eq("NRFI")
        df["season"] = pd.to_numeric(raw["season"], errors="coerce").astype("Int64")
        df["date"] = raw["date"]

    source = {
        "mode": "csv",
        "path": str(path.resolve()),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "n_rows_raw": len(raw),
        "is_smoke_schema": is_smoke,
        "ensemble_version": None,   # not present in the export-data CSV schema
        "created_at_watermark": None,
    }
    return df, source


def _load_from_db(db_url: str) -> tuple[pd.DataFrame, dict]:
    try:
        import psycopg
    except ImportError as e:
        print("psycopg required for --db-url mode: pip install -r scripts/deepnrfi/requirements.txt",
              file=sys.stderr)
        raise SystemExit(1) from e

    cols_sql = ", ".join(f'mp."{c}"' for c in MODEL_COLUMNS)
    query = f"""
        SELECT gr.date, gr.season, gr.nrfi AS nrfi_is_nrfi,
               mp."ensembleVersion" AS ensemble_version,
               mp."createdAt" AS created_at,
               {cols_sql}
        FROM "GameResult" gr
        JOIN "ModelPrediction" mp ON mp.id = CAST(gr."gamePk" AS TEXT)
        ORDER BY gr.date ASC
    """
    with psycopg.connect(db_url) as conn:
        df = pd.read_sql(query, conn) if hasattr(pd, "read_sql") else None
        if df is None:
            with conn.cursor() as cur:
                cur.execute(query)
                rows = cur.fetchall()
                colnames = [d.name for d in cur.description]
            df = pd.DataFrame(rows, columns=colnames)

    for col in MODEL_COLUMNS:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    max_created = df["created_at"].max() if "created_at" in df.columns and len(df) else None
    source = {
        "mode": "db",
        "path": None,
        "sha256": None,
        "n_rows_raw": len(df),
        "is_smoke_schema": False,
        "ensemble_version": sorted(df["ensemble_version"].dropna().unique().tolist()) if "ensemble_version" in df.columns else None,
        "created_at_watermark": str(max_created) if max_created is not None else None,
    }
    return df.drop(columns=["created_at"], errors="ignore"), source


def load_games(csv_path: str | None, db_url: str | None) -> tuple[pd.DataFrame, dict]:
    """Returns (df, source_metadata). df has: date, season (Int64), nrfi_is_nrfi
    (bool), and each of MODEL_COLUMNS as a 0-1 float (NaN if null/missing)."""
    if bool(csv_path) == bool(db_url):
        raise ValueError("Exactly one of csv_path or db_url must be given")
    return _load_from_csv(csv_path) if csv_path else _load_from_db(db_url)


# ─── Bucket / side math ──────────────────────────────────────────────────────

def bucket_side_value(prob: float, side: Literal["NRFI", "YRFI"]) -> float:
    """0-1 prob -> 0-100 value on the given side (YRFI mirrors: 100 - nrfi%)."""
    pct = prob * 100.0
    return pct if side == "NRFI" else 100.0 - pct


def bucket_for(value_0_100: float) -> str | None:
    """Map a 0-100 value into one of the 5 fixed ranges, half-open except the
    last ([50,60) [60,70) [70,80) [80,90) [90,100]). None if out of [50,100]."""
    if pd.isna(value_0_100) or value_0_100 < 50 or value_0_100 > 100:
        return None
    for lo, hi, label in zip(BUCKET_EDGES[:-1], BUCKET_EDGES[1:], BUCKET_LABELS):
        is_last = hi == BUCKET_EDGES[-1]
        if value_0_100 >= lo and (value_0_100 < hi or (is_last and value_0_100 <= hi)):
            return label
    return None


# ─── Qualification + combination (shared by Stage 2 and Stage 3) ────────────

Constraint = tuple[str, Literal["NRFI", "YRFI"], float, float]  # (model, side, lo, hi)
QualifyCache = dict[tuple[str, str, float, float], "np.ndarray"]


def combo_id(constraints: list[Constraint], rule: Literal["AND", "OR"]) -> str:
    canon = sorted(constraints, key=lambda c: c[0])
    payload = json.dumps({"constraints": canon, "rule": rule}, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def _qualifies_array(df: pd.DataFrame, model: str, side: str, lo: float, hi: float,
                      cache: QualifyCache | None) -> "np.ndarray":
    """Bool array over all of df's rows: True where `model`'s probability
    (mirrored to `side`) falls in [lo,hi) (or [lo,hi] for the last bucket) AND
    is non-null. Null/out-of-range collapse to the same False -- a null model
    can never count as qualifying, which is exactly the desired semantics for
    both AND (drops the row) and OR (that model just doesn't contribute)."""
    key = (model, side, lo, hi)
    if cache is not None and key in cache:
        return cache[key]
    prob = df[model].to_numpy(dtype=float)
    val = prob * 100.0 if side == "NRFI" else (100.0 - prob * 100.0)
    qualifies = (val >= lo) & (val <= hi if hi >= 100 else val < hi)
    qualifies = qualifies & ~np.isnan(prob)
    if cache is not None:
        cache[key] = qualifies
    return qualifies


def combo_hit_rate(df: pd.DataFrame, constraints: list[Constraint], rule: Literal["AND", "OR"],
                    qualify_cache: QualifyCache | None = None) -> dict:
    """Evaluate one combo rule against df. All constraints in a combo must
    share one side (same-side-only construction; see spec Open Question #5).
    Fully vectorized (no per-row Python loop) -- pass a shared `qualify_cache`
    dict across many calls against the same df to reuse identical
    (model, side, bucket) qualification arrays between combos."""
    sides = {c[1] for c in constraints}
    if len(sides) != 1:
        raise ValueError(f"Combo constraints must share one side, got {sides}")
    combo_side = sides.pop()

    models = [c[0] for c in constraints]
    Q = np.column_stack([
        _qualifies_array(df, model, side, lo, hi, qualify_cache)
        for model, side, lo, hi in constraints
    ])  # shape (n_rows, k), bool

    applicable = Q.all(axis=1) if rule == "AND" else Q.any(axis=1)
    n = int(applicable.sum())
    if n == 0:
        return {"n": 0, "wins": 0, "hit_rate": None, "mean_weighted_prob": None}

    weights = np.array([ENSEMBLE_WEIGHTS[m] for m in models])
    prob_matrix = df[models].to_numpy(dtype=float)

    Qsub = Q[applicable].astype(float)
    # NaN entries where Q is False don't matter for the sums below (they're
    # multiplied by 0 via Qsub), but 0 * NaN = NaN in numpy/IEEE754, so the
    # underlying NaNs must be zeroed first or they'd contaminate every sum.
    Psub = np.nan_to_num(prob_matrix[applicable], nan=0.0)

    weighted_num = (Qsub * weights * Psub).sum(axis=1)
    weighted_den = (Qsub * weights).sum(axis=1)
    unweighted_num = (Qsub * Psub).sum(axis=1)
    unweighted_den = Qsub.sum(axis=1)
    # weighted_den > 0 whenever at least one qualifying model has nonzero
    # ENSEMBLE_WEIGHTS; falls back to an unweighted average of the qualifying
    # models only for combos where every qualifying model has weight 0 (e.g.
    # an all-meta-model combo) -- informational field only, doesn't affect
    # the hit-rate/wins calculation below.
    w_prob = np.where(
        weighted_den > 0,
        weighted_num / np.where(weighted_den > 0, weighted_den, 1.0),
        unweighted_num / np.where(unweighted_den > 0, unweighted_den, 1.0),
    )

    is_nrfi_actual = df["nrfi_is_nrfi"].to_numpy(dtype=bool)[applicable]
    predicted_is_nrfi = combo_side == "NRFI"
    wins = int((is_nrfi_actual == predicted_is_nrfi).sum())

    return {
        "n": n,
        "wins": wins,
        "hit_rate": wins / n,
        "mean_weighted_prob": float(np.mean(w_prob)),
    }


def wilson_ci(wins: int, n: int) -> tuple[float, float]:
    if n == 0:
        return (float("nan"), float("nan"))
    lo, hi = proportion_confint(wins, n, alpha=0.05, method="wilson")
    return float(lo), float(hi)


# ─── Manifest helpers (append-only) ──────────────────────────────────────────

def load_manifest(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text())
    return {}


def save_manifest(path: Path, manifest: dict) -> None:
    path.write_text(json.dumps(manifest, indent=2, default=str))


def append_only_set(manifest: dict, key: str, value) -> None:
    """Set manifest[key] = value, but refuse to overwrite an existing,
    different value -- stages must never mutate a prior stage's frozen output."""
    if key in manifest and manifest[key] != value:
        raise ValueError(f"Refusing to overwrite existing manifest['{key}'] (append-only)")
    manifest[key] = value


def append_only_extend_list(manifest: dict, key: str, items: list) -> None:
    manifest.setdefault(key, [])
    manifest[key].extend(items)


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
