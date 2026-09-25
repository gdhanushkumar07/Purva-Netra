"""§6.4 regimes: PCA + k-means on the initial state (HRES 1.5° lead 0), plus rule detectors
evaluated on the forecast state at each lead. Everything is fitted on training years only."""
import numpy as np, pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA

from .extract_state import LAT, LON, VARS, load_state

IDX = {v: i for i, v in enumerate(VARS)}
REGIME_VARS = ["z500", "u850", "v850", "q850"]
LETTERS = "ABCDEFGHIJ"


def _box(lat, lon):
    return (LAT >= lat[0]) & (LAT <= lat[1]), (LON >= lon[0]) & (LON <= lon[1])


class RegimeModel:
    def __init__(self, k=7, n_pc=10, seed=0):
        self.k, self.n_pc, self.seed = k, n_pc, seed

    @staticmethod
    def _x(fields):  # fields: (lead, var, lat, lon) → flattened lead-0 regime vector
        return np.concatenate([fields[0, IDX[v]].ravel() for v in REGIME_VARS])

    def fit(self, inits_train):
        X = np.array([self._x(f) for i in inits_train if (f := load_state(i)) is not None])
        self.mu, self.sd = X.mean(0), X.std(0) + 1e-6
        Z = (X - self.mu) / self.sd
        self.pca = PCA(self.n_pc, random_state=self.seed).fit(Z)
        self.km = KMeans(self.k, n_init=20, random_state=self.seed).fit(self.pca.transform(Z))
        self.years = sorted({pd.Timestamp(i).year for i in inits_train})
        return self

    def predict(self, fields):
        z = (self._x(fields) - self.mu) / self.sd
        return int(self.km.predict(self.pca.transform(z[None]))[0])

    def describe(self, inits_train):
        """Neutral names + month composition. Meteorological names need human review of composites."""
        lab = {i: self.predict(f) for i in inits_train if (f := load_state(i)) is not None}
        s = pd.Series(lab)
        months = pd.Series([pd.Timestamp(i).month for i in s.index], index=s.index)
        out = {}
        for c in range(self.k):
            m = months[s == c].value_counts(normalize=True).sort_index()
            top = m.sort_values(ascending=False).head(3).index.tolist()
            out[c] = dict(name=f"Regime {LETTERS[c]}", months=sorted(top), share=float((s == c).mean()))
        return out


# ---- rule detectors on the forecast state at lead L --------------------------------------------
def vorticity850(u, v):
    """Relative vorticity (s⁻¹) by centred differences on the 1.5° grid."""
    R = 6.371e6
    dlat = np.deg2rad(1.5) * R
    coslat = np.cos(np.deg2rad(LAT))[:, None]
    dx = np.deg2rad(1.5) * R * coslat
    dvdx = np.gradient(v, axis=1) / dx
    dudy = np.gradient(u * coslat, axis=0) / dlat / coslat
    return dvdx - dudy


BAY = ((10, 25), (80, 95))
ARAB = ((8, 22), (60, 75))
WD = ((30, 40), (60, 80))
VORT_THR = 2e-5    # fixed default (s⁻¹), not tuned on labelled depressions — documented limitation


def low_detector(fields_l, box):
    la, lo = _box(*box)
    p = fields_l[IDX["mslp"]][np.ix_(la, lo)]
    zeta = vorticity850(fields_l[IDX["u850"]], fields_l[IDX["v850"]])[np.ix_(la, lo)]
    i, j = np.unravel_index(np.nanargmin(p), p.shape)
    return bool((p.mean() - p[i, j]) >= 4.0 and zeta[i, j] > VORT_THR)


def wd_score(fields_l, z500_clim_mean, z500_clim_sd):
    la, lo = _box(*WD)
    z = fields_l[IDX["z500"]][np.ix_(la, lo)].mean()
    return (z - z500_clim_mean) / (z500_clim_sd + 1e-6)
