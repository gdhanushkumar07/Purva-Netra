"""Fixtures. `synthetic_table` is SYNTHETIC data used only to exercise code paths and leakage
guards — never to report skill. Real-data tests use data/processed/table.parquet when present."""
from pathlib import Path
import numpy as np, pandas as pd, pytest

from purva_netra.config import load_config
from purva_netra.timing import valid_date

ROOT = Path(__file__).resolve().parents[1]


def make_synthetic(years=(2018, 2019, 2020, 2021, 2022), step_days=1, n_rid=4, seed=0):
    rng = np.random.default_rng(seed)
    inits = pd.DatetimeIndex([t for y in years for t in pd.date_range(f"{y}-01-01", f"{y}-12-31T12", freq=f"{step_days * 24}h")])
    inits = inits.append(inits + pd.Timedelta(hours=12)).sort_values()
    rows = []
    for init in inits:
        for lead in range(1, 11):
            for rid in range(n_rid):
                season = 1 + 8 * np.exp(-((init.dayofyear - 200) / 45) ** 2)
                f = rng.gamma(1.5, season)
                spread = (0.3 + 0.08 * lead) * (1 + rng.gamma(1.0, 0.6))
                o = max(0.0, (1 + f) * np.exp(rng.normal(0, spread)) - 1)
                em = f * np.exp(rng.normal(0, 0.1))
                rows.append((init, lead, rid, f, 0.0, em, spread * (1 + f) * 0.5, spread, 0.0, 0.0,
                             em * 0.5, em * 1.5, 50, o, 0.0))
    df = pd.DataFrame(rows, columns=["init", "lead", "rid", "f_rain", "f_heavy_frac", "ens_mean", "ens_spread",
                                     "ens_log_spread", "p_heavy_member", "ens_heavy_frac", "ens_q10", "ens_q90",
                                     "ens_n", "o_rain", "o_heavy_frac"])
    df["valid_date"] = valid_date(df.init, df.lead)
    df["assessed"] = True
    return df


@pytest.fixture(scope="session")
def cfg():
    return load_config()


@pytest.fixture(scope="session")
def synthetic_table():
    return make_synthetic()


@pytest.fixture(scope="session")
def real_table():
    p = ROOT / "data" / "processed" / "table.parquet"
    if not p.exists():
        pytest.skip("no real table yet (run extraction + build_table)")
    from purva_netra.labels import add_log_error
    from purva_netra.features import add_revision
    return add_revision(add_log_error(pd.read_parquet(p)))
