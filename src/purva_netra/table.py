"""§4.4 join: per-init forecast Parquets + IMD truth → data/processed/table.parquet."""
from pathlib import Path
import pandas as pd

from .config import load_config


def load_forecasts(start=None, end=None) -> pd.DataFrame:
    cfg = load_config()
    files = sorted((Path(cfg["paths"]["interim"]) / "fcst").glob("*/*.parquet"))
    if start or end:
        s = pd.Timestamp(start or "1900"); e = pd.Timestamp(end or "2100")
        files = [f for f in files if s <= pd.to_datetime(f.stem, format="%Y%m%d%H") <= e]
    return pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)


def build_table(start=None, end=None) -> pd.DataFrame:
    cfg = load_config()
    fc = load_forecasts(start, end)
    truth = pd.read_parquet(Path(cfg["paths"]["interim"]) / "truth_imd.parquet")
    table = fc.merge(truth, on=["valid_date", "rid"], how="left")   # keep rows without truth (unassessed)
    # regions with no IMD land cells have zero weights: their "means" are meaningless → NaN
    from .regions import load_weights
    has_land = (load_weights()["imd"].sum(("lat", "lon")) > 0).to_series()
    fcols = [c for c in fc.columns if c not in ("init", "lead", "rid", "valid_date")]
    table.loc[~table.rid.map(has_land), fcols] = float("nan")
    table["assessed"] = table.rid.map(has_land)
    table.to_parquet(Path(cfg["paths"]["processed"]) / "table.parquet", index=False)
    return table
