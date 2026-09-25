"""Verification of P(bust): Brier / BSS with week-block bootstrap CIs, reliability, ROC/PR-AUC.
Headline numbers come from library code (scores, xskillscore, scikit-learn); the hand-written
brier/bss below are only used inside the bootstrap loop and are cross-checked against them."""
import numpy as np, pandas as pd, xarray as xr


def brier(p, y):
    return float(np.mean((np.asarray(p) - np.asarray(y)) ** 2))


def bss(p, p_ref, y):
    return 1 - brier(p, y) / brier(p_ref, y)


def week_block_bootstrap(df, p_col, ref_col, n=1000, seed=0, y_col="bust"):
    """95% CI of BSS(p vs ref) by resampling whole ISO weeks of init dates."""
    rng = np.random.default_rng(seed)
    wk = df.init.dt.to_period("W")
    idx = {w: np.flatnonzero(wk.values == w) for w in wk.unique()}
    weeks = list(idx)
    p, r, y = df[p_col].to_numpy(), df[ref_col].to_numpy(), df[y_col].to_numpy()
    vals = []
    for _ in range(n):
        ii = np.concatenate([idx[weeks[j]] for j in rng.integers(0, len(weeks), len(weeks))])
        vals.append(bss(p[ii], r[ii], y[ii]))
    lo, med, hi = np.percentile(vals, [2.5, 50, 97.5])
    return dict(bss=bss(p, r, y), lo=lo, med=med, hi=hi, n_weeks=len(weeks))


def library_report(df, p_col, y_col="bust"):
    import scores, xskillscore as xs
    from sklearn.metrics import roc_auc_score, average_precision_score, brier_score_loss
    from sklearn.calibration import calibration_curve
    y = xr.DataArray(df[y_col].values.astype(float), dims="case")
    p = xr.DataArray(df[p_col].values.astype(float), dims="case")
    out = {
        "n": int(len(df)), "base_rate": float(df[y_col].mean()),
        "brier_scores": float(scores.probability.brier_score(p, y)),
        "brier_sklearn": float(brier_score_loss(df[y_col], df[p_col])),
        "roc_auc": float(roc_auc_score(df[y_col], df[p_col])) if df[y_col].nunique() > 1 else np.nan,
        "pr_auc": float(average_precision_score(df[y_col], df[p_col])) if df[y_col].nunique() > 1 else np.nan,
    }
    edges = np.linspace(0, 1, 11)
    rel = xs.reliability(y.astype(bool), p, dim="case", probability_bin_edges=edges)
    frac_pos, mean_pred = calibration_curve(df[y_col], df[p_col], n_bins=10)
    counts = np.histogram(df[p_col], bins=edges)[0]
    out["ece"] = expected_calibration_error(df[p_col].to_numpy(), df[y_col].to_numpy(), edges)
    assert abs(out["brier_scores"] - out["brier_sklearn"]) < 1e-4
    return out, rel, (frac_pos, mean_pred, counts)


def expected_calibration_error(p, y, edges):
    b = np.clip(np.digitize(p, edges) - 1, 0, len(edges) - 2)
    e = 0.0
    for k in range(len(edges) - 1):
        m = b == k
        if m.any():
            e += m.mean() * abs(p[m].mean() - y[m].mean())
    return float(e)


def reliability_table(p, y, edges=np.linspace(0, 1, 11)):
    b = np.clip(np.digitize(p, edges) - 1, 0, len(edges) - 2)
    rows = []
    for k in range(len(edges) - 1):
        m = b == k
        rows.append(dict(bin_lo=edges[k], bin_hi=edges[k + 1], n=int(m.sum()),
                         mean_p=float(p[m].mean()) if m.any() else None,
                         obs_freq=float(y[m].mean()) if m.any() else None))
    return pd.DataFrame(rows)


def hit_rate_at_far(p, y, far=0.2):
    from sklearn.metrics import roc_curve
    fpr, tpr, _ = roc_curve(y, p)
    return float(np.interp(far, fpr, tpr))
