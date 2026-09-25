"""Leakage guards (spec §10)."""
import numpy as np, pandas as pd, pytest

from purva_netra.labels import add_log_error, fit_thresholds, add_bust
from purva_netra.features import add_revision, add_flipflop, fit_climatologies, add_ensemble_features
from purva_netra.baselines import b0_climatology
from purva_netra.evaluate import bss
from purva_netra import model as M


def _check_revision(t):
    t = add_revision(t)
    has = t.dropna(subset=["prev12_f"])
    assert len(has) > 0
    prev = t.set_index(["rid", "valid_date", "init"]).f_rain
    for _, r in has.sample(min(500, len(has)), random_state=0).iterrows():
        assert prev.loc[(r.rid, r.valid_date, r.init - pd.Timedelta(hours=12))] == r.prev12_f


def test_revision_uses_only_past_synthetic(synthetic_table):
    _check_revision(add_log_error(synthetic_table))


def test_revision_uses_only_past_real(real_table):
    _check_revision(real_table)


def test_flipflop_window_ends_at_current_row(synthetic_table):
    t = add_flipflop(add_log_error(synthetic_table))
    # Changing a LATER cycle's forecast must not change an earlier row's FFI
    g = t.dropna(subset=["ffi4"]).iloc[0]
    later = (t.rid == g.rid) & (t.valid_date == g.valid_date) & (t.init > g.init)
    t2 = t.copy(); t2.loc[later, "f_rain"] = t2.loc[later, "f_rain"] * 10 + 50
    t2 = add_flipflop(t2.drop(columns="ffi4"))
    v1 = t.set_index(["rid", "valid_date", "init"]).ffi4.loc[(g.rid, g.valid_date, g.init)]
    v2 = t2.set_index(["rid", "valid_date", "init"]).ffi4.loc[(g.rid, g.valid_date, g.init)]
    assert v1 == pytest.approx(v2)


def test_thresholds_train_only(synthetic_table, cfg):
    t = add_log_error(synthetic_table)
    tr = t[t.init.dt.year.isin(cfg["years"]["train"])]
    _, meta = fit_thresholds(tr)
    assert set(meta["init_years"]) <= set(cfg["years"]["train"])


def test_thresholds_do_not_depend_on_test_rows(synthetic_table, cfg):
    t = add_log_error(synthetic_table)
    tr = t[t.init.dt.year.isin(cfg["years"]["train"])]
    thr1, _ = fit_thresholds(tr)
    t2 = t.copy(); te = t2.init.dt.year.isin(cfg["years"]["test"]); t2.loc[te, "o_rain"] *= 5
    thr2, _ = fit_thresholds(add_log_error(t2)[t2.init.dt.year.isin(cfg["years"]["train"])])
    assert np.allclose(thr1.thr, thr2.thr, equal_nan=True)


def test_climatology_train_only(synthetic_table, cfg):
    t = add_log_error(synthetic_table)
    clim = fit_climatologies(t[t.init.dt.year.isin(cfg["years"]["train"])])
    assert set(clim["years"]) <= set(cfg["years"]["train"])


def test_analogs_exclude_same_year():
    from purva_netra.analogs import AnalogMemory
    rng = np.random.default_rng(0)
    n = 300
    X = rng.normal(size=(n, 4, 7, 7)).astype("float32")
    years = np.repeat([2018, 2019, 2020], n // 3)
    doy = rng.integers(1, 366, n)
    inits = [pd.Timestamp(f"{y}-01-01") + pd.Timedelta(days=int(d) - 1) for y, d in zip(years, doy)]
    meta = pd.DataFrame(dict(init=inits, lead=3, doy=doy, year=years, log_err=rng.random(n),
                             bust=rng.integers(0, 2, n), f_rain=1.0, o_rain=2.0))
    mem = AnalogMemory(k=20, n_eofs=5, doy_window=366).fit({(0, 3): X}, {(0, 3): meta}, {(0, 3): np.linspace(10, 20, 7)})
    for r in range(0, n, 37):   # query with the library's own cases: its own year must never come back
        res = mem.query((0, 3), X[r], int(meta.doy[r]), int(years[r]))
        assert res["an_cases"] and all(pd.Timestamp(c["init"]).year != years[r] for c in res["an_cases"])


def test_shuffled_labels_have_no_skill(synthetic_table, cfg):
    t = add_log_error(synthetic_table)
    tr_y, te_y = cfg["years"]["train"], cfg["years"]["test"]
    thr, _ = fit_thresholds(t[t.init.dt.year.isin(tr_y)])
    t = add_bust(t, thr)
    t = add_ensemble_features(t, fit_climatologies(t[t.init.dt.year.isin(tr_y)]))
    train = t[t.init.dt.year.isin(tr_y) & (t.bust >= 0)]
    test = t[t.init.dt.year.isin(te_y) & (t.bust >= 0)]
    y = train.bust.sample(frac=1, random_state=0).values
    feats = M.available(train, ["lead", "rid", "doy_sin", "doy_cos", "spread_anom", "ens_log_spread", "hres_minus_em", "ens_iqr_rel"])
    fit, val = M.early_stop_split(train.assign(bust=y))
    clf = M.fit_main(fit, val, feats)
    p = M.predict_raw(clf, test)
    assert bss(p, b0_climatology(train.assign(bust=y), test), test.bust) < 0.01
