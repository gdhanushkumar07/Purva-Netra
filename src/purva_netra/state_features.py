"""State features, regimes and analog patterns from the 1.5° HRES fields (extract_state.py)."""
from pathlib import Path
import numpy as np, pandas as pd

from .config import load_config
from .extract_state import LAT, LON, VARS
from .regions import load_regions
from .regimes import low_detector, BAY, ARAB, WD, RegimeModel
from .analogs import AnalogMemory, region_box, pattern

IDX = {v: i for i, v in enumerate(VARS)}


def state_files():
    cfg = load_config()
    return {pd.to_datetime(p.stem, format="%Y%m%d%H"): p
            for p in sorted((Path(cfg["paths"]["interim"]) / "state").glob("*/*.npz"))}


def load_all_fields(inits):
    """(n_init, lead 0..10, var, lat, lon) float16 for the given inits (missing → NaN)."""
    files = state_files()
    out = np.full((len(inits), 11, len(VARS), len(LAT), len(LON)), np.nan, dtype="float16")
    for k, i in enumerate(inits):
        if i in files:
            out[k] = np.load(files[i])["fields"]
    return out


def centroids():
    g = load_regions()
    pts = g.geometry.representative_point()
    return {int(r): (float(p.y), float(p.x)) for r, p in zip(g.rid, pts)}


def raw_state_table(inits, F):
    """Per (init, lead 1..10, rid) raw box statistics (±2.5° box) + domain rule inputs."""
    cen = centroids()
    rows = []
    zla, zlo = (LAT >= WD[0][0]) & (LAT <= WD[0][1]), (LON >= WD[1][0]) & (LON <= WD[1][1])
    for k, init in enumerate(inits):
        if np.isnan(F[k, 1, 0, 0, 0]):
            continue
        for L in range(1, 11):
            f = F[k, L].astype("float32")
            lb, la_ = low_detector(f, BAY), low_detector(f, ARAB)
            z_wd = float(f[IDX["z500"]][np.ix_(zla, zlo)].mean())
            for rid, (y, x) in cen.items():
                la, lo = region_box(y, x, half=2.5)
                if not la.any() or not lo.any():
                    continue
                rows.append((init, L, rid, float(f[IDX["q850"]][np.ix_(la, lo)].mean()),
                             float(f[IDX["u850"]][np.ix_(la, lo)].mean()), float(f[IDX["mslp"]][np.ix_(la, lo)].min()),
                             lb, la_, z_wd))
    return pd.DataFrame(rows, columns=["init", "lead", "rid", "q850", "u850", "mslp_min", "low_bay", "low_arabian", "z500_wd"])


def add_state_features(df, st, train_years):
    """Anomalies vs train-year climatology per (rid, lead, month); WD trough = z500 anomaly < −1σ."""
    d = df.merge(st, on=["init", "lead", "rid"], how="left")
    tr = d[d.init.dt.year.isin(train_years)]
    for v in ["q850", "u850", "mslp_min"]:
        c = tr.groupby(["rid", "lead", "month"])[v].mean().rename(f"{v}_clim")
        d = d.drop(columns=[f"{v}_clim"], errors="ignore").join(c, on=["rid", "lead", "month"])
        d[f"{v}_anom"] = d[v] - d[f"{v}_clim"]
    zc = tr.groupby("month").z500_wd.agg(["mean", "std"])
    z = d.month.map(zc["mean"]); s = d.month.map(zc["std"])
    d["wd_trough"] = ((d.z500_wd - z) / (s + 1e-6) < -1).astype(float).where(d.z500_wd.notna())
    for c in ["low_bay", "low_arabian"]:
        d[c] = d[c].astype(float)
    return d


def add_regimes(df, inits, F, train_years, k=7):
    idx = {i: n for n, i in enumerate(inits)}
    train_inits = [i for i in inits if i.year in train_years and not np.isnan(F[idx[i], 0, 0, 0, 0])]
    rm = RegimeModel(k=k)
    X = np.array([rm._x(F[idx[i]].astype("float32")) for i in train_inits])
    rm.mu, rm.sd = X.mean(0), X.std(0) + 1e-6
    from sklearn.decomposition import PCA
    from sklearn.cluster import KMeans
    Z = (X - rm.mu) / rm.sd
    rm.pca = PCA(rm.n_pc, random_state=0).fit(Z)
    rm.km = KMeans(k, n_init=20, random_state=0).fit(rm.pca.transform(Z))
    lab = {}
    for i in inits:
        f = F[idx[i]]
        if not np.isnan(f[0, 0, 0, 0]):
            lab[i] = rm.predict(f.astype("float32"))
    df = df.copy()
    df["regime"] = df.init.map(lab)
    # neutral names + month mix from TRAIN inits (meteorological naming needs human review)
    s = pd.Series({i: lab[i] for i in train_inits})
    names = {}
    for c in range(k):
        mm = pd.Series([i.month for i in s.index[s == c]]).value_counts(normalize=True)
        names[c] = dict(name=f"Regime {'ABCDEFGHIJ'[c]}", top_months=mm.head(3).index.tolist(), share=float((s == c).mean()))
    return df, rm, names


def add_analogs(df, inits, F, train_years, cfg):
    """Fit per-(rid, lead) analog memory on TRAIN rows, query every row (own year excluded)."""
    idx = {i: n for n, i in enumerate(inits)}
    cen = centroids()
    a = cfg["analogs"]
    mem = AnalogMemory(k=a["k"], n_eofs=a["n_eofs"], doy_window=a["doy_window"])
    has = df.init.map(lambda i: i in idx and not np.isnan(F[idx[i], 1, 0, 0, 0]))
    lab = df[has & (df.bust >= 0)]
    tr = lab[lab.init.dt.year.isin(train_years)]
    X_train, meta, lat_by = {}, {}, {}
    boxes = {rid: region_box(*cen[rid], half=5.0) for rid in cen}
    for (rid, lead), g in tr.groupby(["rid", "lead"]):
        la, lo = boxes[rid]
        X_train[(rid, lead)] = np.stack([pattern(F[idx[i], lead].astype("float32"), la, lo) for i in g.init])
        meta[(rid, lead)] = g.assign(year=g.init.dt.year)[["init", "lead", "doy", "year", "log_err", "bust", "f_rain", "o_rain"]]
        lat_by[(rid, lead)] = LAT[la]
    mem.fit(X_train, meta, lat_by)
    df = df.copy()
    for c in ["an_err_mean", "an_err_q90", "an_bust_rate", "an_novelty", "an_n"]:
        df[c] = np.nan
    df["an_cases"] = "[]"
    import json
    q = df[has]
    for (rid, lead), g in q.groupby(["rid", "lead"]):
        if (rid, lead) not in mem.store:
            continue
        la, lo = boxes[rid]
        X = np.stack([pattern(F[idx[i], lead].astype("float32"), la, lo) for i in g.init])
        res = mem.query_many((rid, lead), X, g.doy.to_numpy(), g.init.dt.year.to_numpy())
        for c in ["an_err_mean", "an_err_q90", "an_bust_rate", "an_novelty", "an_n"]:
            df.loc[g.index, c] = [r[c] for r in res]
        df.loc[g.index, "an_cases"] = [json.dumps(r["an_cases"]) for r in res]
    return df, mem
