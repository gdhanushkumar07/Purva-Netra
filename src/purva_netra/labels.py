"""Bust labels. Thresholds are fitted on training-year rows only and saved with their metadata."""
import numpy as np, pandas as pd


def add_log_error(df):
    df = df.copy()
    df["log_err"] = np.abs(np.log1p(df.f_rain) - np.log1p(df.o_rain))
    df["abs_err_mm"] = np.abs(df.f_rain - df.o_rain)
    df["doy"] = df.valid_date.dt.dayofyear
    df["month"] = df.valid_date.dt.month
    return df


def fit_thresholds(train, q=0.90, win=15):
    """Q90 of log_err per (rid, lead, doy) with a ±win-day circular window. Train years only.
    Returns (table, meta) — meta records which years were used (checked by test_leakage)."""
    rows = []
    for (rid, lead), g in train.groupby(["rid", "lead"]):
        d = g.doy.values; e = g.log_err.values
        for doy in range(1, 367):
            dist = np.minimum(np.abs(d - doy), 366 - np.abs(d - doy))
            sel = e[dist <= win]
            rows.append((rid, lead, doy, np.quantile(sel, q) if len(sel) else np.nan, len(sel)))
    thr = pd.DataFrame(rows, columns=["rid", "lead", "doy", "thr", "n"])
    meta = dict(years=sorted(train.valid_date.dt.year.unique().tolist()),
                init_years=sorted(train.init.dt.year.unique().tolist()), q=q, win=win)
    return thr, meta


def add_bust(df, thr, floor_mm=5.0):
    df = df.drop(columns=["thr"], errors="ignore").merge(thr[["rid", "lead", "doy", "thr"]],
                                                         on=["rid", "lead", "doy"], how="left")
    df["bust"] = ((df.log_err > df.thr) & (df.abs_err_mm >= floor_mm)).astype(int)
    df.loc[df.o_rain.isna() | df.thr.isna(), "bust"] = -1   # -1 = unlabelled (no truth or no threshold)
    return df


def add_high_impact(df, obs_frac=0.10, low=0.02):
    miss = (df.o_heavy_frac >= obs_frac) & (df.f_heavy_frac < low)
    fa = (df.f_heavy_frac >= obs_frac) & (df.o_heavy_frac < low)
    df["hi_bust"] = (miss | fa).astype(int)
    df["hi_type"] = np.select([miss, fa], ["miss", "false_alarm"], "none")
    return df
