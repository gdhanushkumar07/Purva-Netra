"""Thin end-to-end slice (July 2020): table → labels → features → B0/B2 → predictions Parquet.

PLUMBING ONLY. July 2020 is a training year; thresholds, climatologies and B2 are fitted on
the first 20 days and scored on the rest of the same month. Numbers printed here are NOT
skill claims and are labelled as such in the replay store (model_version thinslice-*).
"""
import json
import numpy as np, pandas as pd

from purva_netra.table import build_table
from purva_netra.labels import add_log_error, fit_thresholds, add_bust, add_high_impact
from purva_netra.features import fit_climatologies, add_ensemble_features, add_revision, add_flipflop
from purva_netra.baselines import b0_fit, b0_predict, b2_fit, b2_predict
from purva_netra.evaluate import week_block_bootstrap, library_report
from purva_netra.predict import finalize, add_change_vs_prev, write_store
from purva_netra import bundle as B

VERSION = "thinslice-b2-2020-07"
t = add_log_error(build_table("2020-07-01", "2020-07-31T12"))
print("table", t.shape, "inits", t.init.nunique(), "rows with truth", t.o_rain.notna().sum())

fit = t[(t.init < "2020-07-21") & t.o_rain.notna()]
thr, meta = fit_thresholds(fit, q=0.9, win=15)
t = add_high_impact(add_bust(t, thr, floor_mm=5.0))
lab = t[t.bust >= 0]
print("base rate overall", round(lab.bust.mean(), 3))
print("base rate by lead", lab.groupby("lead").bust.mean().round(3).to_dict())

clim = fit_climatologies(fit)
t = add_flipflop(add_revision(add_ensemble_features(t, clim)))
fit = t[(t.init < "2020-07-21") & (t.bust >= 0)]
m0, m2 = b0_fit(fit), b2_fit(fit)
t["p_b0"], t["p_b2"] = b0_predict(m0, t), b2_predict(m2, t)
eq = fit.groupby(["rid", "lead"]).log_err.quantile([0.5, 0.9]).unstack()
eq.columns = ["err_q50", "err_q90"]
t = t.join(eq, on=["rid", "lead"])

ev = t[(t.init >= "2020-07-21") & (t.bust >= 0)]
if ev.bust.nunique() > 1:
    print("[plumbing check, in-sample year] B2 vs B0:", week_block_bootstrap(ev, "p_b2", "p_b0", n=200))
    print("[plumbing check] library report B2:", library_report(ev, "p_b2")[0])

# Save the placeholder bundle (what NRT inference loads) with metadata that says what it really is.
b_meta = dict(training_period="2020-07-01 → 2020-07-20 inits (in-sample placeholder)", calibration_period=None,
              calibration_date=None, test_result=None, forecast_model="ECMWF IFS (WeatherBench 2 archive)",
              spec_training_period="2018–2020", spec_calibration_period="2021",
              note="Plumbing placeholder: B2 spread baseline fitted on July 2020 only. Not a skill claim.")
B.save(VERSION, kind="placeholder", model_type="b2_logistic", model=m2, features=["spread_anom", "lead"],
       clim=dict(spread=fit_climatologies(fit)["spread"], f_rain=fit_climatologies(fit)["f_rain"]),
       thresholds=thr, err_q=eq.reset_index(), train=fit, meta=b_meta)
bnd = B.load(VERSION)
gc = B.group_contributions(bnd, t)
print("linear-SHAP group contributions, first assessed row:", next(g for g in gc if g))
pred = finalize(t, t.p_b2.to_numpy(), None, "rule", group_contrib=gc)
pred = add_change_vs_prev(pred)
base = write_store(pred, VERSION)
print("wrote", base, pred.init.nunique(), "inits")
json.dump(dict(version=VERSION, kind="thin-slice (in-sample, plumbing only)", threshold_meta=meta, bundle_meta=b_meta,
               bands=[0, .05, .15, .30, 1]), open(base / "meta.json", "w"), indent=1)
