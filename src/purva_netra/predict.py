"""Batch inference → replay store: data/processed/predictions/model=<v>/year=<y>/<init>.parquet."""
import json
from pathlib import Path
import numpy as np, pandas as pd

from .config import load_config
from . import explain as ex

OUT_COLS = ["init", "rid", "lead", "valid_date", "p_bust", "confidence", "p_b0", "p_b2",
            "err_q50", "err_q90", "obs_lo_mm", "obs_hi_mm", "hi_risk", "hi_type_fcst", "novelty",
            "spread_anom", "rev12", "ffi4", "regime", "f_rain", "ens_mean", "ens_q10", "ens_q90",
            "o_rain", "bust", "hi_bust", "log_err", "thr", "abs_err_mm", "f_heavy_frac", "o_heavy_frac",
            "reasons_en", "reasons_hi", "reason_groups", "reason_source", "contrib", "an_cases", "group_contrib"]


def bands(p, cfg=None):
    cfg = cfg or load_config()
    b = pd.cut(p, cfg["bands"]["edges"], labels=cfg["bands"]["labels"], include_lowest=True).astype(object)
    return pd.Series(b, index=getattr(p, "index", None)).where(pd.notna(p), "Not assessed").astype(str)


def hi_risk_rule(df):
    """HRES and ensemble disagree about heavy rain (fixed rule, documented in Method)."""
    miss_risk = (df.ens_heavy_frac >= 0.05) & (df.f_heavy_frac < 0.02)
    fa_risk = (df.f_heavy_frac >= 0.10) & (df.ens_heavy_frac < 0.02)
    return (miss_risk | fa_risk), np.select([miss_risk, fa_risk], ["miss", "false_alarm"], "none")


def obs_range(f_rain, q):
    """Log-error quantile q → range of observed rain consistent with it (mm)."""
    return np.maximum((1 + f_rain) * np.exp(-q) - 1, 0), (1 + f_rain) * np.exp(q) - 1


def finalize(rows: pd.DataFrame, p: np.ndarray, contribs, source: str, analogs=None, regime_sent=None, group_contrib=None):
    """group_contrib: per-row SHAP sums by evidence group (bundle.group_contributions), or None."""
    rows = rows.copy()
    rows["p_bust"] = p
    rows["confidence"] = bands(rows.p_bust)
    rows["obs_lo_mm"], rows["obs_hi_mm"] = obs_range(rows.f_rain, rows.err_q90)
    rows["hi_risk"], rows["hi_type_fcst"] = hi_risk_rule(rows)
    rows["novelty"] = rows.get("an_novelty", pd.Series(np.nan, index=rows.index))
    if "regime" not in rows:
        rows["regime"] = None
    en, hi, groups, cj = [], [], [], []
    for i, (_, r) in enumerate(rows.iterrows()):
        if source == "shap":
            gs = ex.top_groups(contribs[i]); c = contribs[i]
        else:
            rg = ex.rule_groups(r); gs = [g for g, _ in rg]; c = {g: v for g, v in rg}
        an = analogs[i] if analogs is not None else None
        rs = regime_sent[i] if regime_sent is not None else None
        s_en = [s for g in gs if (s := ex.sentence(g, r, "en", an, rs))]
        s_hi = [s for g in gs if (s := ex.sentence(g, r, "hi", an, rs))]
        en.append(s_en); hi.append(s_hi); groups.append(gs); cj.append(json.dumps(c))
    rows["reasons_en"], rows["reasons_hi"], rows["reason_groups"], rows["contrib"] = en, hi, groups, cj
    rows["reason_source"] = source
    rows["group_contrib"] = [json.dumps(g) if g else None for g in group_contrib] if group_contrib is not None else None
    if "an_cases" not in rows:
        rows["an_cases"] = "[]"
    for c in OUT_COLS:
        if c not in rows:
            rows[c] = np.nan
    return rows[OUT_COLS]


def add_change_vs_prev(pred: pd.DataFrame) -> pd.DataFrame:
    """P(bust) change vs the previous cycle for the same (rid, valid_date) — issue-time information."""
    pred = pred.sort_values(["rid", "valid_date", "init"])
    g = pred.groupby(["rid", "valid_date"])
    prev = g.p_bust.shift(1).where(pred.init - g.init.shift(1) == pd.Timedelta(hours=12))
    pred["change_vs_prev"] = pred.p_bust - prev
    return pred.sort_values(["init", "rid", "lead"])


def write_store(pred: pd.DataFrame, version: str):
    cfg = load_config()
    base = Path(cfg["paths"]["processed"]) / "predictions" / f"model={version}"
    for init, g in pred.groupby("init"):
        d = base / f"year={init:%Y}"; d.mkdir(parents=True, exist_ok=True)
        g.assign(model_version=version).to_parquet(d / f"{init:%Y%m%d%H}.parquet", index=False)
    return base
