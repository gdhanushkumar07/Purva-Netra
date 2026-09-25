"""Model bundle: everything inference needs, saved with honest metadata.

models/<version>/bundle.joblib + models/ACTIVE. Used by the NRT runner (§14) and by /ops/model.
The bundle records what the model *actually* is (e.g. the July-2020 in-sample placeholder),
not what the spec intends; the UI shows these fields verbatim."""
import json, subprocess
from datetime import datetime, timezone
from pathlib import Path
import joblib, numpy as np, pandas as pd

from .config import ROOT, load_config
from .explain import GROUPS

DRIFT_FEATURES = ["spread_anom", "f_rain_anom", "an_novelty"]


def models_dir() -> Path:
    return Path(load_config()["paths"]["models"])


def git_hash():
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip() or None
    except Exception:
        return None


def feature_reference(train: pd.DataFrame) -> dict:
    """Training distributions for PSI drift: decile edges + counts per feature (None if absent)."""
    ref = {}
    for f in DRIFT_FEATURES:
        if f in train and train[f].notna().sum() > 100:
            v = train[f].dropna().to_numpy()
            edges = np.unique(np.quantile(v, np.linspace(0, 1, 11)))
            cnt = np.histogram(v, bins=edges)[0]
            ref[f] = dict(edges=edges.tolist(), frac=(cnt / cnt.sum()).tolist(), n=int(len(v)))
        else:
            ref[f] = None
    return ref


def save(version: str, *, kind: str, model_type: str, model, features: list, clim: dict, thresholds: pd.DataFrame,
         err_q: pd.DataFrame, train: pd.DataFrame, meta: dict, calibrator=None, activate=True) -> Path:
    d = models_dir() / version
    d.mkdir(parents=True, exist_ok=True)
    bg = train[features].dropna()
    b = dict(version=version, kind=kind, model_type=model_type, model=model, calibrator=calibrator, features=features,
             clim=clim, thresholds=thresholds, err_q=err_q, shap_background=bg.sample(min(len(bg), 5000), random_state=0),
             feature_ref=feature_reference(train),
             meta=dict(meta, git=git_hash(), created=datetime.now(timezone.utc).isoformat(timespec="seconds")))
    joblib.dump(b, d / "bundle.joblib")
    (d / "meta.json").write_text(json.dumps({k: v for k, v in b.items() if k in ("version", "kind", "model_type", "features", "meta")},
                                            indent=1, default=str))
    if activate:
        (models_dir() / "ACTIVE").write_text(version)
    return d


def load(version: str | None = None) -> dict | None:
    md = models_dir()
    v = version or ((md / "ACTIVE").read_text().strip() if (md / "ACTIVE").exists() else None)
    p = md / str(v) / "bundle.joblib"
    return joblib.load(p) if v and p.exists() else None


def load_meta(version: str | None = None) -> dict | None:
    md = models_dir()
    v = version or ((md / "ACTIVE").read_text().strip() if (md / "ACTIVE").exists() else None)
    p = md / str(v) / "meta.json"
    return json.loads(p.read_text()) if v and p.exists() else None


def predict(b: dict, df: pd.DataFrame) -> np.ndarray:
    X = df[b["features"]]
    ok = X.notna().all(axis=1).to_numpy()
    p = np.full(len(df), np.nan)
    if ok.any():
        raw = b["model"].predict_proba(X[ok])[:, 1]
        p[ok] = b["calibrator"].predict(raw) if b.get("calibrator") is not None else raw
    return p


def group_contributions(b: dict, df: pd.DataFrame) -> list[dict | None]:
    """Per-row SHAP contribution summed by evidence group (log-odds for the linear B2 model,
    TreeSHAP for LightGBM). Features outside every evidence group (e.g. lead) are reported
    under their own key so nothing is hidden. Rows with missing inputs → None."""
    import shap
    feats = b["features"]
    X = df[feats]
    ok = X.notna().all(axis=1).to_numpy()
    out: list[dict | None] = [None] * len(df)
    if not ok.any():
        return out
    if b["model_type"] == "b2_logistic":
        bg = b["shap_background"]
        ex = shap.LinearExplainer(b["model"], shap.maskers.Independent(bg, max_samples=len(bg)))
        sv = np.asarray(ex.shap_values(X[ok]))
    else:
        sv = shap.TreeExplainer(b["model"]).shap_values(X[ok])
        sv = sv[1] if isinstance(sv, list) else sv
    grp_of = {f: g for g, fs in GROUPS.items() for f in fs}
    for j, i in enumerate(np.flatnonzero(ok)):
        d: dict[str, float] = {}
        for k, f in enumerate(feats):
            key = grp_of.get(f, f"term:{f}")
            d[key] = d.get(key, 0.0) + float(sv[j, k])
        out[i] = d
    return out
