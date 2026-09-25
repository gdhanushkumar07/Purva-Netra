"""Feature builders. Every function uses only information available at the row's init time:
climatologies come from training years (passed in), revision/FFI look only at earlier cycles."""
import numpy as np, pandas as pd, xarray as xr


# ---- climatologies (fitted on TRAIN years only) -------------------------------------------
def fit_climatologies(train: pd.DataFrame) -> dict:
    return dict(
        spread=train.groupby(["rid", "lead", "month"]).ens_spread.mean().rename("spread_clim").reset_index(),
        f_rain=train.groupby(["rid", "lead", "month"]).f_rain.mean().rename("f_rain_clim").reset_index(),
        years=sorted(train.init.dt.year.unique().tolist()),
    )


# ---- 6.1 ensemble ---------------------------------------------------------------------------
def add_ensemble_features(df, clim):
    df = df.drop(columns=["spread_clim", "f_rain_clim"], errors="ignore")
    df = df.merge(clim["spread"], on=["rid", "lead", "month"], how="left")
    df = df.merge(clim["f_rain"], on=["rid", "lead", "month"], how="left")
    df["spread_anom"] = df.ens_spread / (df.spread_clim + 0.1)
    df["hres_minus_em"] = np.abs(df.f_rain - df.ens_mean)
    df["ens_iqr_rel"] = (df.ens_q90 - df.ens_q10) / (df.ens_mean + 1)
    df["f_rain_anom"] = np.log1p(df.f_rain) - np.log1p(df.f_rain_clim)
    df["doy_sin"] = np.sin(2 * np.pi * df.doy / 366)
    df["doy_cos"] = np.cos(2 * np.pi * df.doy / 366)
    return df


# ---- 6.3 revision (cycle-to-cycle) ----------------------------------------------------------
def add_revision(df):
    key = ["rid", "valid_date"]
    df = df.sort_values(key + ["init"]).reset_index(drop=True)
    g = df.groupby(key)
    prev_init = g.init.shift(1)
    df["prev12_f"] = g.f_rain.shift(1).where(df.init - prev_init == pd.Timedelta(hours=12))
    prev2_init = g.init.shift(2)
    df["prev24_f"] = g.f_rain.shift(2).where(df.init - prev2_init == pd.Timedelta(hours=24))
    df["rev12"] = np.abs(np.log1p(df.f_rain) - np.log1p(df.prev12_f))
    df["rev24"] = np.abs(np.log1p(df.f_rain) - np.log1p(df.prev24_f))
    return df


def add_flipflop(df, n_cycles=4):
    """Flip-Flop Index (Griffiths et al. 2019) over the latest n cycles for the same (rid, valid_date),
    computed with scores.continuous.flip_flop_index. Windows end at the current row → past only."""
    import scores
    df = df.sort_values(["rid", "valid_date", "init"]).reset_index(drop=True)
    vals = df.f_rain.to_numpy()
    grp = df.groupby(["rid", "valid_date"]).indices
    # collect all complete windows, evaluate in one vectorised scores call
    rows, wins = [], []
    for _, ix in grp.items():
        ix = np.sort(ix)
        inits = df.init.values[ix]
        for j in range(n_cycles - 1, len(ix)):
            w = ix[j - n_cycles + 1: j + 1]
            if (inits[j] - inits[j - n_cycles + 1]) == np.timedelta64(12 * (n_cycles - 1), "h"):
                rows.append(ix[j]); wins.append(vals[w])
    df["ffi4"] = np.nan
    if rows:
        da = xr.DataArray(np.log1p(np.array(wins)), dims=("case", "cycle"))
        ffi = scores.continuous.flip_flop_index(da, sampling_dim="cycle")
        df.loc[rows, "ffi4"] = ffi.values
    return df
