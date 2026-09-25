"""Forecast extraction from WeatherBench 2 Zarr → one small Parquet per init (resumable).

Rows: (init, lead, rid) with HRES rain and 50-member ENS statistics, all as land-only
area means over each IMD subdivision (weights from regions.py).

Usage: python -m purva_netra.extract_wb2 2020-07-01 2020-07-31
"""
import sys, time
from pathlib import Path
import numpy as np, pandas as pd, xarray as xr

from .config import load_config
from .regions import load_weights, region_mean
from .timing import valid_date

SO = {"token": "anon", "requests_timeout": 180}  # a stalled read raises instead of hanging
LEADS = np.array([np.timedelta64(d, "D") for d in range(1, 11)]).astype("timedelta64[ns]")
HEAVY = 64.5


def open_sources(cfg):
    hres = xr.open_zarr(cfg["paths"]["wb2_hres"], storage_options=SO)
    ens = xr.open_zarr(cfg["paths"]["wb2_ens"], storage_options=SO)
    return hres, ens


def extract_init(init, hres, ens, W) -> pd.DataFrame:
    wh, we = W["hres"], W["ens"]
    # Deterministic forecast being judged (m → mm), IMD-identical 0.25° grid
    f = hres["total_precipitation_24hr"].sel(time=init, prediction_timedelta=LEADS)
    f = f.sel(latitude=wh.lat.values, longitude=wh.lon.values, method="nearest", tolerance=1e-3).load().clip(min=0) * 1000
    f_rain = region_mean(f, wh)
    f_heavy = region_mean((f >= HEAVY).astype("f4"), wh)

    # Ensemble at 1.5° (m → mm)
    tp = ens["total_precipitation_24hr"].sel(time=init, prediction_timedelta=LEADS)
    tp = tp.sel(latitude=we.lat.values, longitude=we.lon.values, method="nearest", tolerance=1e-3).load().clip(min=0) * 1000
    tp_r = region_mean(tp, we)                                  # (number, lead, region)
    heavy_m = region_mean((tp >= HEAVY).astype("f4"), we)       # gridpoint fraction per member
    stats = xr.Dataset({
        "f_rain": f_rain, "f_heavy_frac": f_heavy,
        "ens_mean": tp_r.mean("number"), "ens_spread": tp_r.std("number"),
        "ens_log_spread": np.log1p(tp_r).std("number"),
        "p_heavy_member": (tp_r >= HEAVY).mean("number"),
        "ens_heavy_frac": heavy_m.mean("number"),
        "ens_q10": tp_r.quantile(0.1, "number").drop_vars("quantile"),
        "ens_q90": tp_r.quantile(0.9, "number").drop_vars("quantile"),
        "ens_n": tp_r.notnull().sum("number"),
    })
    df = stats.drop_vars([c for c in stats.coords if c not in ("prediction_timedelta", "region")]) \
              .to_dataframe().reset_index()
    df = df.rename(columns={"prediction_timedelta": "lead", "region": "rid"})
    df["lead"] = (df["lead"] / np.timedelta64(1, "D")).astype(int)
    df.insert(0, "init", pd.Timestamp(init))
    df["valid_date"] = valid_date(df["init"], df["lead"])
    return df


def run(start: str, end: str, out_dir: str | None = None):
    cfg = load_config()
    out = Path(out_dir or Path(cfg["paths"]["interim"]) / "fcst")
    W = load_weights()
    hres, ens = open_sources(cfg)
    inits = pd.date_range(start, pd.Timestamp(end) + pd.Timedelta(hours=12), freq="12h")
    for init in inits:
        p = out / f"{init:%Y}" / f"{init:%Y%m%d%H}.parquet"
        if p.exists():
            continue
        t0 = time.time()
        try:
            df = extract_init(init, hres, ens, W)
        except Exception as e:  # record, keep going; missing cycles are reported downstream
            print(f"{init} FAILED {e!r}", flush=True)
            continue
        p.parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(p, index=False)
        print(f"{init} ok rows={len(df)} {time.time()-t0:.1f}s", flush=True)


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2])
