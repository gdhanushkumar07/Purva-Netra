"""§6.5 analog error memory: per (rid, lead), latitude-weighted EOFs (xeofs) of the forecast pattern in a
10°×10° box around the region, and a BallTree over TRAIN-year cases whose *errors* are known.

Queries never return cases from the query's own year (leave-one-year-out for training rows; for
calibration/test rows the library only holds training years anyway)."""
import numpy as np, pandas as pd, xarray as xr
from sklearn.neighbors import BallTree

from .extract_state import LAT, LON, VARS

IDX = {v: i for i, v in enumerate(VARS)}
PATTERN_VARS = ["tp24", "q850", "u850", "mslp"]


def region_box(lat_c, lon_c, half=5.0):
    la = (LAT >= lat_c - half) & (LAT <= lat_c + half)
    lo = (LON >= lon_c - half) & (LON <= lon_c + half)
    return la, lo


def pattern(fields_l, la, lo):
    """(var, lat, lon) pattern for one forecast lead; rain as log1p."""
    out = []
    for v in PATTERN_VARS:
        a = fields_l[IDX[v]][np.ix_(la, lo)]
        out.append(np.log1p(np.clip(a, 0, None)) if v == "tp24" else a)
    return np.stack(out)


class AnalogMemory:
    def __init__(self, k=20, n_eofs=10, doy_window=30):
        self.k, self.n, self.win = k, n_eofs, doy_window
        self.store = {}

    def fit(self, X_train: dict, meta_train: dict, lat_by_key: dict):
        """X_train[(rid, lead)] = array (case, var, lat, lon); meta_train = DataFrame per key with
        init, doy, year, log_err, bust, f_rain, o_rain (TRAIN years only)."""
        import xeofs as xe
        for key, X in X_train.items():
            mu, sd = X.mean(0, keepdims=True), X.std(axis=(0, 2, 3), keepdims=True) + 1e-6
            Xs = (X - mu) / sd
            lat = lat_by_key[key]
            da = xr.DataArray(Xs, dims=("sample", "var", "lat", "lon"),
                              coords={"sample": np.arange(len(Xs)), "var": np.arange(Xs.shape[1]), "lat": lat,
                                      "lon": np.arange(Xs.shape[3])})
            n = min(self.n, len(Xs) - 1)
            eof = xe.single.EOF(n_modes=n, use_coslat=True, solver="full")  # "auto" (randomized) makes scores() ≠ transform()
            eof.fit(da, dim="sample")
            Z = eof.scores().transpose("sample", "mode").values
            tree = BallTree(Z)
            nn = tree.query(Z[: min(500, len(Z))], k=2)[0][:, 1]
            self.store[key] = dict(eof=eof, mu=mu, sd=sd, lat=lat, Z=Z, tree=tree,
                                   typical=float(np.median(nn)) + 1e-9, meta=meta_train[key].reset_index(drop=True))
        return self

    def _project(self, key, X):
        s = self.store[key]
        Xs = (X - s["mu"]) / s["sd"]
        da = xr.DataArray(Xs, dims=("sample", "var", "lat", "lon"),
                          coords={"sample": np.arange(len(Xs)), "var": np.arange(Xs.shape[1]), "lat": s["lat"],
                                  "lon": np.arange(Xs.shape[3])})
        return s["eof"].transform(da).transpose("sample", "mode").values

    def query_many(self, key, X, doy, year, n_cases=5):
        """Vectorised queries for many rows of one (rid, lead)."""
        s = self.store[key]
        Z = self._project(key, X)
        kq = min(10 * self.k, len(s["Z"]))
        D, I = s["tree"].query(Z, k=kq)
        m = s["meta"]
        mdoy, myear = m.doy.to_numpy(), m.year.to_numpy()
        out = []
        for r in range(len(Z)):
            d, i = D[r], I[r]
            circ = np.minimum(np.abs(mdoy[i] - doy[r]), 366 - np.abs(mdoy[i] - doy[r]))
            ok = (circ <= self.win) & (myear[i] != year[r])
            d, i = d[ok][: self.k], i[ok][: self.k]
            if len(i) == 0:
                out.append(dict(an_err_mean=np.nan, an_err_q90=np.nan, an_bust_rate=np.nan, an_novelty=np.nan, an_n=0, an_cases=[]))
                continue
            sub = m.iloc[i]
            cases = [dict(init=str(pd.Timestamp(c.init)), lead=int(c.lead), f_rain=float(c.f_rain), o_rain=float(c.o_rain),
                          log_err=float(c.log_err), bust=int(c.bust), similarity=float(1 / (1 + dd / s["typical"])))
                     for c, dd in zip(sub.head(n_cases).itertuples(), d[:n_cases])]
            out.append(dict(an_err_mean=float(sub.log_err.mean()), an_err_q90=float(sub.log_err.quantile(0.9)),
                            an_bust_rate=float(sub.bust.mean()), an_novelty=float(d[0] / s["typical"]), an_n=int(len(i)),
                            an_cases=cases))
        return out

    def query(self, key, x, doy, year, exclude_days=15):
        return self.query_many(key, x[None], np.array([doy]), np.array([year]))[0]
