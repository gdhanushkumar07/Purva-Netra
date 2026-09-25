"""End-to-end offline pipeline (spec §5–§11).

    python -m purva_netra.pipeline all          # table → labels → features → models → eval → predictions
    python -m purva_netra.pipeline table|fit|eval|predict

Splits come from configs/base.yaml (train 2018–2020, calib 2021, test 2022). Every quantity that is
"learned" — bust thresholds, climatologies, regimes, analog library, models, calibrators — is fitted
inside a fold on that fold's training years only. Leave-one-year-out folds refit everything.
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np, pandas as pd, yaml

from .config import load_config, ROOT
from .table import build_table
from .labels import add_log_error, fit_thresholds, add_bust, add_high_impact
from .features import fit_climatologies, add_ensemble_features, add_revision, add_flipflop
from .baselines import b0_fit, b0_predict, b2_fit, b2_predict
from . import model as M
from .evaluate import week_block_bootstrap, library_report, reliability_table, hit_rate_at_far, bss, brier

YEARS = [2018, 2019, 2020, 2021, 2022]


def git_hash():
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    except Exception:
        return None


# ------------------------------------------------------------------------------------------------
def base_table(cfg):
    p = Path(cfg["paths"]["processed"]) / "table.parquet"
    t = pd.read_parquet(p) if p.exists() else build_table()
    t = add_log_error(t)
    t = add_flipflop(add_revision(t))           # issue-time only: independent of folds
    return t


def state_inputs(t):
    """Load 1.5° fields if extract_state has run; else None (state/regime/analog groups are skipped)."""
    from .state_features import state_files, load_all_fields, raw_state_table
    files = state_files()
    inits = sorted(t.init.unique())
    cover = np.mean([pd.Timestamp(i) in files for i in inits]) if inits else 0
    if cover < 0.95:
        print(f"[state] fields available for {cover:.0%} of inits → state/regime/analog features skipped")
        return None
    inits = [pd.Timestamp(i) for i in inits]
    F = load_all_fields(inits)
    return dict(inits=inits, F=F, raw=raw_state_table(inits, F))


def fold_features(t, cfg, train_years, S):
    """Labels + features for one fold (everything learned from train_years only)."""
    b = cfg["bust"]
    tr = t[t.init.dt.year.isin(train_years) & t.o_rain.notna()]
    thr, thr_meta = fit_thresholds(tr, q=b["quantile"], win=b["doy_window"])
    d = add_high_impact(add_bust(t, thr, floor_mm=b["floor_mm"]),
                        obs_frac=cfg["high_impact"]["obs_frac"], low=cfg["high_impact"]["fcst_frac_low"])
    clim = fit_climatologies(d[d.init.dt.year.isin(train_years) & (d.bust >= 0)])
    d = add_ensemble_features(d, clim)
    art = dict(thresholds=thr, threshold_meta=thr_meta, clim_years=clim["years"])
    if S is not None:
        from .state_features import add_state_features, add_regimes, add_analogs
        d = add_state_features(d, S["raw"], train_years)
        d, rm, names = add_regimes(d, S["inits"], S["F"], train_years)
        d, mem = add_analogs(d, S["inits"], S["F"], train_years, cfg)
        art.update(regime_names=names)
    return d, art


def run_fold(d, train_years, calib_years, test_years, ablate=True, shap_rows=False):
    lab = d[d.bust >= 0]
    tr = lab[lab.init.dt.year.isin(train_years)]
    ca = lab[lab.init.dt.year.isin(calib_years)]
    out_rows = d[d.init.dt.year.isin(list(calib_years) + list(test_years))].copy()
    feats = M.available(tr)
    fit, val = M.early_stop_split(tr)

    m0, m2 = b0_fit(tr), b2_fit(tr)
    out_rows["p_b0"], out_rows["p_b2"] = b0_predict(m0, out_rows), b2_predict(m2, out_rows)
    ok = ca.spread_anom.notna()
    iso_b2 = M.calibrate(b2_predict(m2, ca[ok]), ca[ok].bust)
    out_rows["p_b2iso"] = np.where(out_rows.p_b2.notna(), iso_b2.predict(out_rows.p_b2.fillna(0)), np.nan)
    if "an_bust_rate" in feats:
        okc = ca.an_bust_rate.notna()
        iso_b3 = M.calibrate(ca[okc].an_bust_rate, ca[okc].bust)
        out_rows["p_b3"] = np.where(out_rows.an_bust_rate.notna(), iso_b3.predict(out_rows.an_bust_rate.fillna(0)), np.nan)

    clf = M.fit_main(fit, val, feats)
    raw_ca = M.predict_raw(clf, ca)
    iso = M.calibrate(raw_ca, ca.bust)
    out_rows["p_m_raw"] = M.predict_raw(clf, out_rows)
    out_rows["p_m"] = iso.predict(out_rows.p_m_raw)
    q50, q90 = M.fit_quantile(fit, val, feats, 0.5), M.fit_quantile(fit, val, feats, 0.9)
    out_rows["err_q50"], out_rows["err_q90"] = M.predict_q(q50, out_rows), M.predict_q(q90, out_rows)
    models = dict(clf=clf, iso=iso, q50=q50, q90=q90, b0=m0, b2=m2, iso_b2=iso_b2, feats=feats)

    if ablate:
        ab = yaml.safe_load(open(ROOT / "configs" / "ablations.yaml"))["ablations"]
        for name, spec in ab.items():
            if spec.get("no_calibration"):
                out_rows[f"p_{name}"] = out_rows.p_m_raw.clip(1e-4, 1 - 1e-4)
                continue
            if "keep_groups" in spec:
                fs = [f for g in spec["keep_groups"] for f in M.GROUPS[g]] + spec.get("keep", [])
            else:
                drop = {f for g in spec["drop_groups"] for f in M.GROUPS[g]}
                fs = [f for f in feats if f not in drop]
            fs = [f for f in feats if f in fs]
            if fs == feats:     # group absent (e.g. no state fields) → identical to main model
                out_rows[f"p_{name}"] = out_rows.p_m; continue
            c = M.fit_main(fit, val, fs)
            i2 = M.calibrate(M.predict_raw(c, ca), ca.bust)
            out_rows[f"p_{name}"] = i2.predict(M.predict_raw(c, out_rows))
    return out_rows, models


# ------------------------------------------------------------------------------------------------
def score_table(df, cols, ref="p_b0", n_boot=1000):
    rows = []
    for c in cols:
        if c not in df or df[c].isna().all():
            continue
        s = df[df[c].notna() & df[ref].notna() & df.p_b2.notna()]
        rep = library_report(s, c)[0]
        ci0 = week_block_bootstrap(s, c, "p_b0", n=n_boot)
        ci2 = week_block_bootstrap(s, c, "p_b2", n=n_boot)
        rows.append(dict(model=c[2:], n=rep["n"], brier=rep["brier_scores"], bss_b0=ci0["bss"], bss_b0_lo=ci0["lo"],
                         bss_b0_hi=ci0["hi"], bss_b2=ci2["bss"], bss_b2_lo=ci2["lo"], bss_b2_hi=ci2["hi"],
                         roc_auc=rep["roc_auc"], pr_auc=rep["pr_auc"], ece=rep["ece"],
                         hit_at_far20=hit_rate_at_far(s[c], s.bust)))
    return pd.DataFrame(rows)


def by_lead(df, cols, n_boot=500):
    rows = []
    for L, g in df.groupby("lead"):
        for c in cols:
            if c not in g or g[c].isna().all():
                continue
            s = g[g[c].notna() & g.p_b2.notna()]
            ci0 = week_block_bootstrap(s, c, "p_b0", n=n_boot)
            ci2 = week_block_bootstrap(s, c, "p_b2", n=n_boot)
            rows.append(dict(lead=int(L), model=c[2:], bss_b0=ci0["bss"], lo_b0=ci0["lo"], hi_b0=ci0["hi"],
                             bss_b2=ci2["bss"], lo_b2=ci2["lo"], hi_b2=ci2["hi"]))
    return pd.DataFrame(rows)


def gate(loyo_by_lead):
    m = loyo_by_lead[(loyo_by_lead.model == "m") & loyo_by_lead.lead.between(3, 10)]
    passed = bool(len(m) == 8 and (m.lo_b2 > 0).all())
    return passed, m


def run_all(cfg=None, loyo=True, n_boot=1000):
    cfg = cfg or load_config()
    out = Path(cfg["paths"]["processed"]); (out / "eval").mkdir(parents=True, exist_ok=True)
    t = base_table(cfg)
    years_present = sorted(t.init.dt.year.unique())
    need = sorted(set(cfg["years"]["train"] + cfg["years"]["calib"] + cfg["years"]["test"]))
    missing = [y for y in need if y not in years_present]
    if missing:
        raise SystemExit(f"Archive incomplete: no forecasts for years {missing}. Run extraction first "
                         f"(scripts/extract_loop.sh). Refusing to evaluate on a partial split.")
    S = state_inputs(t)
    tr_y, ca_y, te_y = cfg["years"]["train"], cfg["years"]["calib"], cfg["years"]["test"]

    # Primary fold
    d, art = fold_features(t, cfg, tr_y, S)
    base = d[d.bust >= 0].groupby([d.init.dt.year.rename("year"), "lead"]).bust.mean().unstack()
    print("base rate by year × lead\n", base.round(3))
    pr, models = run_fold(d, tr_y, ca_y, te_y)
    test = pr[pr.init.dt.year.isin(te_y) & (pr.bust >= 0)]
    cols = ["p_b0", "p_b2", "p_b2iso", "p_b3", "p_m", "p_m_raw"] + [f"p_A{i}" for i in range(1, 8)]
    st = score_table(test, cols, n_boot=n_boot)
    bl = by_lead(test, ["p_b2", "p_b2iso", "p_b3", "p_m"], n_boot=max(200, n_boot // 2))
    print(st.round(4).to_string())

    # Leave-one-year-out
    loyo_preds = []
    if loyo:
        for y in YEARS:
            cal = [y + 1] if y + 1 in YEARS else [y - 1]
            trn = [x for x in YEARS if x not in (y, cal[0])]
            dy, _ = (d, art) if (trn == tr_y and cal == ca_y) else fold_features(t, cfg, trn, S)
            py, _ = run_fold(dy, trn, cal, [y], ablate=False)
            loyo_preds.append(py[py.init.dt.year == y].assign(fold=y))
        lp = pd.concat(loyo_preds)
        lp = lp[lp.bust >= 0]
        loyo_bl = by_lead(lp, ["p_b2", "p_b2iso", "p_m"], n_boot=max(200, n_boot // 2))
        loyo_st = score_table(lp, ["p_b0", "p_b2", "p_b2iso", "p_m"], n_boot=n_boot)
        passed, gm = gate(loyo_bl)
    else:
        lp, loyo_bl, loyo_st, passed = None, None, None, False

    version = f"m-{git_hash() or 'nogit'}" if passed else f"b2-{git_hash() or 'nogit'}"
    shipped = "m" if passed else "b2iso"
    res = dict(version=version, shipped=shipped, gate_passed=passed, splits=cfg["years"],
               features=models["feats"], threshold_meta=art["threshold_meta"], regime_names=art.get("regime_names"),
               primary=st.to_dict("records"), primary_by_lead=bl.to_dict("records"),
               loyo=loyo_st.to_dict("records") if loyo_st is not None else None,
               loyo_by_lead=loyo_bl.to_dict("records") if loyo_bl is not None else None,
               base_rate=base.round(4).to_dict())
    json.dump(res, open(out / "eval" / "results.json", "w"), indent=1, default=str)
    pr.to_parquet(out / "eval" / "primary_predictions.parquet", index=False)
    if lp is not None:
        lp.to_parquet(out / "eval" / "loyo_predictions.parquet", index=False)
    write_ledger(test, shipped, version, res, out)
    ship(pr, models, shipped, version, art, cfg, te_y)
    return res


def write_ledger(test, shipped, version, res, out):
    col = f"p_{shipped}"
    y = test.bust.to_numpy()
    rel = reliability_table(test[col].to_numpy(), y)
    b30 = rel[(rel.bin_lo <= 0.3) & (rel.bin_hi > 0.3)].iloc[0]
    headline = (f"When the tool says {b30.bin_lo:.0%}–{b30.bin_hi:.0%} (mean {b30.mean_p:.0%}), busts happened "
                f"{b30.obs_freq:.0%} of the time (n = {int(b30.n)}; test year {', '.join(map(str, res['splits']['test']))}, all assessed regions)."
                if b30.n > 0 else None)
    # Proof chart: B0 (reference, BSS ≡ 0), B2 and our model only — three validated categorical slots.
    sk = [dict(lead=L, model="b0", bss_vs_b0=0.0, lo=0.0, hi=0.0) for L in range(1, 11)]
    for r in res["primary_by_lead"]:
        if r["model"] in ("b2", "m"):
            sk.append(dict(lead=r["lead"], model="model" if r["model"] == "m" else "b2",
                           bss_vs_b0=r["bss_b0"], lo=r["lo_b0"], hi=r["hi_b0"]))
    gate_text = ("Gate passed: leave-one-year-out BSS vs the spread baseline B2 has a 95% lower bound > 0 for Day 3–10. "
                 "Shipping the LightGBM model.") if res["gate_passed"] else \
                ("Gate NOT passed: the model does not beat the ensemble-spread baseline B2 with a 95% lower bound > 0 "
                 "for every Day 3–10 (leave-one-year-out). Shipping B2 + isotonic calibration + analog cards.")
    led = dict(split="test", years=res["splits"]["test"], shipped=shipped, headline=headline,
               gate=dict(passed=res["gate_passed"], text=gate_text), reliability=rel.to_dict("records"),
               skill_by_lead=sk, scores={r["model"]: {k: v for k, v in r.items() if k != "model"} for r in res["primary"]})
    json.dump(led, open(out / "eval" / f"{version}.json", "w"), indent=1, default=float)


def ship(pr, models, shipped, version, art, cfg, test_years):
    """Write the replay store for the test year(s) with the shipped model."""
    from .predict import finalize, add_change_vs_prev, write_store
    from .explain import shap_groups
    rows = pr[pr.init.dt.year.isin(test_years)].copy()
    p = rows[f"p_{shipped}"].to_numpy()
    if shipped == "m":
        ok = rows.spread_anom.notna()
        contrib = [dict() for _ in range(len(rows))]
        cg = shap_groups(models["clf"], M._prep(rows[ok], models["feats"]), models["feats"])
        for j, i in enumerate(np.flatnonzero(ok.to_numpy())):
            contrib[i] = cg[j]
        source = "shap"
    else:
        contrib, source = None, "rule"
    analogs = None
    if "an_cases" in rows:
        analogs = []
        for a in rows.an_cases:
            cs = json.loads(a) if isinstance(a, str) else []
            analogs.append(dict(n=len(cs), n_bust=sum(c["bust"] for c in cs),
                                ex_date=next((c["init"][:10] for c in cs if c["bust"]), cs[0]["init"][:10] if cs else "")) if cs else None)
    names = art.get("regime_names") or {}
    reg_sent = None
    if "regime" in rows:
        rows["regime"] = rows.regime.map(lambda r: names.get(int(r), {}).get("name") if pd.notna(r) else None)
    pred = finalize(rows, p, contrib, source, analogs, reg_sent)
    pred = add_change_vs_prev(pred)
    base = write_store(pred, version)
    json.dump(dict(version=version, kind=f"shipped={shipped}; held-out test {test_years}", threshold_meta=art["threshold_meta"]),
              open(base / "meta.json", "w"), indent=1, default=str)
    (base.parent / "ACTIVE").write_text(version)
    return base


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd == "table":
        print(build_table().shape)
    elif cmd in ("all", "fit", "eval", "predict"):
        run_all()
