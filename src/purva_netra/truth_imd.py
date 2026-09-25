"""IMD 0.25° gridded daily rainfall → land-only subdivision means (the ground truth)."""
from pathlib import Path
import imdlib as imd, pandas as pd, xarray as xr

from .config import load_config
from .regions import region_mean

HEAVY = 64.5


def open_imd_year(year: int, imd_dir: str) -> xr.DataArray:
    da = imd.open_data("rain", year, year, "yearwise", imd_dir).get_xarray()["rain"]
    return da.where(da >= 0)                      # IMD uses -999 for missing / sea


def imd_region_rain(years, w_imd, cfg=None) -> pd.DataFrame:
    cfg = cfg or load_config()
    out = []
    for y in years:
        da = open_imd_year(y, cfg["paths"]["imd_dir"])
        o = region_mean(da, w_imd)
        heavy = region_mean((da >= HEAVY).astype(float).where(da.notnull()), w_imd)
        df = xr.merge([o.rename("o_rain"), heavy.rename("o_heavy_frac")]).to_dataframe().reset_index()
        out.append(df[["time", "region", "o_rain", "o_heavy_frac"]])
    df = pd.concat(out).rename(columns={"time": "valid_date", "region": "rid"})
    valid = (w_imd.sum(("lat", "lon")) > 0).to_series()
    return df[df.rid.map(valid)].reset_index(drop=True)   # regions with no IMD land cells have no truth


def build_truth(years=range(2018, 2023)):
    from .regions import load_weights
    cfg = load_config()
    df = imd_region_rain(years, load_weights()["imd"], cfg)
    p = Path(cfg["paths"]["interim"]) / "truth_imd.parquet"
    df.to_parquet(p, index=False)
    return df


if __name__ == "__main__":
    d = build_truth()
    print(d.shape, d.valid_date.min(), d.valid_date.max(), d.rid.nunique(), "regions")
