"""State / pattern fields from WB2 HRES at 1.5° (same IFS HRES forecast, conservatively regridded by WB2).

Per init: India domain (0–40°N, 50–100°E) fields at leads 0…10 days for
tp24 (mm), q850 (g/kg), u850, v850 (m/s), z500 (dam), mslp (hPa) → data/interim/state/YYYY/<init>.npz
Lead 0 is the initial state (used for regimes); leads 1–10 feed state features and analog patterns.
HRES has no total_column_water_vapour (T1) → specific_humidity at 850 hPa is used.

Usage: python -m purva_netra.extract_state 2020-07-01 2020-07-31
"""
import sys, time
from pathlib import Path
import numpy as np, pandas as pd, xarray as xr

from .config import load_config

SO = {"token": "anon", "requests_timeout": 180}
HRES_15 = "gs://weatherbench2/datasets/hres/2016-2022-0012-240x121_equiangular_with_poles_conservative.zarr"
LEADS = np.array([np.timedelta64(d, "D") for d in range(0, 11)]).astype("timedelta64[ns]")
LAT = np.arange(0.0, 40.0 + 1e-6, 1.5)
LON = np.arange(50.0, 100.5 + 1e-6, 1.5)
VARS = ["tp24", "q850", "u850", "v850", "z500", "mslp"]


def extract_init(init, ds) -> np.ndarray:
    sel = dict(time=init, prediction_timedelta=LEADS)
    box = dict(latitude=LAT, longitude=LON, method="nearest", tolerance=1e-3)
    pl = ds[["specific_humidity", "u_component_of_wind", "v_component_of_wind"]].sel(level=850).sel(**sel).sel(**box)
    z = ds["geopotential"].sel(level=500).sel(**sel).sel(**box)
    sfc = ds[["mean_sea_level_pressure", "total_precipitation_24hr"]].sel(**sel).sel(**box)
    pl, z, sfc = pl.load(), z.load(), sfc.load()
    tp = sfc.total_precipitation_24hr.fillna(0).clip(min=0) * 1000     # lead 0 has no 24-h total → 0
    arrs = [tp, pl.specific_humidity * 1000, pl.u_component_of_wind, pl.v_component_of_wind,
            z / 98.0665, sfc.mean_sea_level_pressure / 100]
    out = np.stack([a.transpose("prediction_timedelta", "latitude", "longitude").values for a in arrs], axis=1)
    return out.astype("float32")                                           # (lead 0..10, var, lat, lon)


def run(start, end):
    cfg = load_config()
    out = Path(cfg["paths"]["interim"]) / "state"
    ds = xr.open_zarr(HRES_15, storage_options=SO)
    for init in pd.date_range(start, pd.Timestamp(end) + pd.Timedelta(hours=12), freq="12h"):
        p = out / f"{init:%Y}" / f"{init:%Y%m%d%H}.npz"
        if p.exists():
            continue
        t0 = time.time()
        try:
            a = extract_init(init, ds)
        except Exception as e:
            print(f"{init} FAILED {e!r}", flush=True); continue
        p.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(p, fields=a.astype("float16"), lat=LAT, lon=LON, vars=np.array(VARS))
        print(f"{init} ok {time.time()-t0:.1f}s", flush=True)


def load_state(init) -> np.ndarray | None:
    cfg = load_config()
    p = Path(cfg["paths"]["interim"]) / "state" / f"{pd.Timestamp(init):%Y}" / f"{pd.Timestamp(init):%Y%m%d%H}.npz"
    return np.load(p)["fields"].astype("float32") if p.exists() else None


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2])
