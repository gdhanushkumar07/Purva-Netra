"""PURVA-NETRA API — serves the precomputed replay store (Parquet) via DuckDB. Read-only except /feedback."""
import json, os, subprocess
from datetime import datetime, timezone
from pathlib import Path

import duckdb, pandas as pd, numpy as np, yaml
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
PROC = Path(os.environ.get("PN_PROCESSED", ROOT / "data" / "processed"))
FEEDBACK = Path(os.environ.get("PN_FEEDBACK", ROOT / "data" / "feedback"))
REGIONS = ROOT / "configs" / "regions" / "imd_subdivisions.geojson"
# Mode: PN_MODE=replay (default) | nrt — see is_nrt()


def _versions():
    base = PROC / "predictions"
    return sorted(p.name.split("=", 1)[1] for p in base.glob("model=*")) if base.exists() else []


def active_version():
    v = os.environ.get("PN_MODEL")
    vs = _versions()
    if v and v in vs:
        return v
    marker = PROC / "predictions" / "ACTIVE"
    if marker.exists() and marker.read_text().strip() in vs:
        return marker.read_text().strip()
    return vs[-1] if vs else None


from . import ops as ops_api
from .auth import router as auth_router
from purva_netra import nrt as nrt_mod

app = FastAPI(title="PURVA-NETRA API", version="0.2.0",
              description="Forecast-trust layer: P(bust), confidence, expected error, reasons and analogs "
                          "per IMD subdivision × Day 1–10. Replay mode serves precomputed predictions only.")
app.middleware("http")(ops_api.timing_middleware)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(auth_router)
app.include_router(ops_api.router)


def is_nrt() -> bool:
    return ops_api.is_nrt()
con = duckdb.connect()


def P(version=None):
    """Parquet glob of the store for the current mode. NRT and REPLAY never mix."""
    if is_nrt():
        pub = nrt_mod.published_dir()
        if not any(pub.glob("*.parquet")):
            raise HTTPException(503, "No NRT cycle has been published yet")
        return f"'{pub.as_posix()}/*.parquet'"      # atomic files only: temp files are dot-prefixed .part
    v = version or active_version()
    if not v:
        raise HTTPException(503, "No predictions in the replay store")
    return f"'{PROC.as_posix()}/predictions/model={v}/**/*.parquet'"


def q(sql, params=()):
    # one cursor per call: endpoints run in a thread pool and a DuckDB connection is not thread-safe
    with con.cursor() as cur:
        return cur.execute(sql, list(params)).df()


def records(df: pd.DataFrame):
    df = df.copy()
    for c in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[c]):
            df[c] = df[c].dt.strftime("%Y-%m-%dT%H:%M")
    return json.loads(df.to_json(orient="records", force_ascii=False))


def ts(s: str) -> pd.Timestamp:
    try:
        return pd.Timestamp(s)
    except Exception:
        raise HTTPException(422, f"bad timestamp {s!r}")


def regions_meta():
    feats = json.loads(REGIONS.read_text())["features"]
    return pd.DataFrame([f["properties"] for f in feats]).sort_values("rid").reset_index(drop=True)


REG = None


def reg():
    global REG
    if REG is None:
        REG = regions_meta()
    return REG


def _meta():
    v = active_version()
    p = PROC / "predictions" / f"model={v}" / "meta.json"
    return json.loads(p.read_text()) if v and p.exists() else {}


@app.get("/health")
def health():
    """Mode, data age and last successful update — the top-bar badge reads only this."""
    from purva_netra import bundle as Bn
    from purva_netra.ops import db as odb
    nrt_mode = is_nrt()
    try:
        last = q(f"SELECT max(init) AS last, min(init) AS first, count(DISTINCT init) AS n FROM {P()}").iloc[0]
        first, last_c, n = str(last["first"]), str(last["last"]), int(last["n"])
    except HTTPException:
        first = last_c = None; n = 0
    bm = Bn.load_meta() or {}
    out = dict(status="ok", mode="NEAR-REAL-TIME" if nrt_mode else "REPLAY", model_version=None, model_meta={},
               versions=_versions(), first_cycle=first, last_cycle=last_c, n_cycles=n, git=ops_api.API_VERSION,
               api_version=ops_api.API_VERSION, server_time=datetime.now(timezone.utc).isoformat(),
               model_kind=bm.get("kind"), model_bundle=dict(version=bm.get("version"), **{k: (bm.get("meta") or {}).get(k) for k in (
                   "training_period", "calibration_period", "spec_training_period", "spec_calibration_period", "forecast_model", "note")}))
    if nrt_mode:
        odb.init_db()
        lp = odb.get_health("last_publish")
        up = odb.get_health("upstream_latest")
        out.update(model_version=bm.get("version"),
                   data_age_h=ops_api.age_h(last_c), freshness=ops_api.freshness(ops_api.age_h(last_c)),
                   last_update=lp["checked_at"] if lp else None, source=(lp["value"] or {}).get("source") if lp else None,
                   upstream=dict(status=("reachable" if up["status"] == "ok" else "unreachable") if up else "unknown",
                                 checked_at=up["checked_at"] if up else None, init=(up["value"] or {}).get("init") if up else None),
                   nrt_enabled=nrt_mod.nrt_enabled())
    else:
        out.update(model_version=active_version(), model_meta=_meta(), data_age_h=None, freshness="replay",
                   last_update=_replay_built_at(), source="replay-store")
    return out


def _replay_built_at():
    v = active_version()
    p = PROC / "predictions" / f"model={v}" / "meta.json"
    return datetime.fromtimestamp(p.stat().st_mtime, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if v and p.exists() else None


@app.get("/regions")
def regions():
    return records(reg())


@app.get("/cycles")
def cycles(frm: str = "1900-01-01", to: str = "2100-01-01"):
    df = q(f"SELECT DISTINCT init FROM {P()} WHERE init BETWEEN ? AND ? ORDER BY init", [ts(frm), ts(to)])
    return records(df)


MATRIX_COLS = "rid, lead, valid_date, p_bust, confidence, hi_risk, hi_type_fcst, novelty, change_vs_prev, " \
              "reasons_en[1] AS top_reason_en, reasons_hi[1] AS top_reason_hi, f_rain, spread_anom, regime, " \
              "err_q90, obs_lo_mm, obs_hi_mm"   # no truth here: issue-time information only


@app.get("/matrix")
def matrix(init: str):
    cols = ", ".join(f"a.{c.strip()}" if " AS " not in c else c.strip().replace("reasons_", "a.reasons_")
                     for c in MATRIX_COLS.split(","))
    df = q(f"""SELECT {cols}, b.f_rain AS f_rain_prev, b.p_bust AS p_bust_prev
               FROM {P()} a LEFT JOIN {P()} b
                 ON b.rid = a.rid AND b.valid_date = a.valid_date AND b.init = a.init - INTERVAL 12 HOUR
               WHERE a.init = ? ORDER BY a.rid, a.lead""", [ts(init)])
    if df.empty:
        raise HTTPException(404, f"no cycle {init}")
    return records(df)


@app.get("/brief")
def brief(init: str, lang: str = "en"):
    t = ts(init)
    df = q(f"SELECT {MATRIX_COLS} FROM {P()} WHERE init = ?", [t])
    if df.empty:
        raise HTTPException(404, f"no cycle {init}")
    df = df.merge(reg()[["rid", "name", "zone"]], on="rid")
    a = df[df.p_bust.notna()]
    low = a[a.confidence == "Low"]
    by_day = a.groupby("lead").p_bust.mean()
    top = a.sort_values(["p_bust", "hi_risk"], ascending=[False, False]).head(10)
    ch = a[a.change_vs_prev.notna()].assign(ac=lambda d: d.change_vs_prev.abs()).sort_values("ac", ascending=False).head(10)
    return dict(
        init=t.strftime("%Y-%m-%dT%H:%M"),
        counts=dict(low_regions=int(low.rid.nunique()), low_cells=int(len(low)),
                    heavy_risk_regions=int(a[a.hi_risk].rid.nunique()),
                    most_uncertain_day=int(by_day.idxmax()) if len(by_day) else None,
                    assessed_regions=int(a.rid.nunique()), total_regions=int(df.rid.nunique())),
        top_risks=records(top[["rid", "name", "zone", "lead", "p_bust", "confidence", "hi_risk", "top_reason_en", "top_reason_hi"]]),
        biggest_changes=records(ch[["rid", "name", "lead", "p_bust", "change_vs_prev", "confidence"]]),
        regime=None,
    )


@app.get("/region/{rid}")
def region(rid: int, init: str):
    df = q(f"""SELECT lead, valid_date, p_bust, p_b0, p_b2, confidence, f_rain, ens_mean, ens_q10, ens_q90, err_q50, err_q90,
               obs_lo_mm, obs_hi_mm, spread_anom, novelty, hi_risk, hi_type_fcst, regime, rev12, ffi4
               FROM {P()} WHERE rid = ? AND init = ? ORDER BY lead""", [rid, ts(init)])
    if df.empty:
        raise HTTPException(404, "not found")
    r = reg().set_index("rid").loc[rid]
    return dict(rid=rid, name=r["name"], zone=r["zone"], days=records(df))


@app.get("/explain/{rid}")
def explain(rid: int, init: str, lead: int):
    df = q(f"""SELECT reasons_en, reasons_hi, reason_groups, reason_source, contrib, an_cases, regime, spread_anom,
               novelty, p_bust, confidence, f_rain, group_contrib FROM {P()} WHERE rid=? AND init=? AND lead=?""", [rid, ts(init), lead])
    if df.empty:
        raise HTTPException(404, "not found")
    r = df.iloc[0]
    to_list = lambda x: [] if x is None or (isinstance(x, float) and np.isnan(x)) else list(x)
    return dict(reasons_en=to_list(r.reasons_en), reasons_hi=to_list(r.reasons_hi), groups=to_list(r.reason_groups),
                source=r.reason_source, contrib=json.loads(r.contrib or "{}"), analogs=json.loads(r.an_cases or "[]"),
                regime=r.regime, spread_anom=None if pd.isna(r.spread_anom) else float(r.spread_anom),
                novelty=None if pd.isna(r.novelty) else float(r.novelty),
                p_bust=None if pd.isna(r.p_bust) else float(r.p_bust), confidence=r.confidence,
                group_contributions=group_contributions(r.get("group_contrib"), r))


EVIDENCE_GROUPS = ["spread", "revision", "analogs", "novelty", "regime", "state"]


def group_contributions(raw, row):
    """SHAP contribution per evidence group (log-odds for linear B2; TreeSHAP for LightGBM).
    Groups without features in the shipped model are returned with available=False — never 0."""
    from purva_netra import bundle as Bn
    feats = set((Bn.load_meta() or {}).get("features") or [])
    from purva_netra.explain import GROUPS
    d = json.loads(raw) if isinstance(raw, str) and raw else None
    out = []
    for g in EVIDENCE_GROUPS:
        in_model = bool(feats & set(GROUPS[g]))
        out.append(dict(group=g, available=in_model and d is not None,
                        value=(d or {}).get(g) if in_model else None,
                        reason=None if in_model else "Not available in this model version"))
    extra = {k: v for k, v in (d or {}).items() if k.startswith("term:")}
    return dict(groups=out, other_terms=extra, units="log-odds (SHAP)", source="shap" if d else None)


@app.get("/revision/{rid}")
def revision(rid: int, valid: str, upto: str | None = None, n: int = 8):
    """Forecasts from the last n cycles for one valid date (only cycles issued up to `upto`)."""
    upto_t = ts(upto) if upto else ts("2100-01-01")
    df = q(f"""SELECT init, lead, f_rain, ens_mean, ens_q10, ens_q90, p_bust, rev12, ffi4, spread_anom FROM {P()}
               WHERE rid=? AND valid_date=? AND init <= ? ORDER BY init DESC LIMIT ?""", [rid, ts(valid), upto_t, n])
    return records(df.sort_values("init"))


SEASONS = {1: "JF", 2: "JF", 3: "MAM", 4: "MAM", 5: "MAM", 6: "JJAS", 7: "JJAS", 8: "JJAS", 9: "JJAS",
           10: "OND", 11: "OND", 12: "OND"}


def contingency_scores(rid: int, t: pd.Timestamp):
    """IMD-style heavy-rain contingency scores (nwpeval) for this region over the replay store's season.
    Event = ≥ 64.5 mm/day over ≥ 10 % of the subdivision's IMD land cells (forecast: HRES 0.25°)."""
    import nwpeval, xarray as xr
    months = [m for m, s in SEASONS.items() if s == SEASONS[t.month]]
    df = q(f"""SELECT lead, f_heavy_frac, o_heavy_frac FROM {P()}
               WHERE rid=? AND year(valid_date)=? AND month(valid_date) IN ({",".join(map(str, months))})
               AND o_heavy_frac IS NOT NULL AND f_heavy_frac IS NOT NULL""", [rid, t.year])
    out = []
    for L, g in df.groupby("lead"):
        o = xr.DataArray(g.o_heavy_frac.to_numpy(), dims="case"); f = xr.DataArray(g.f_heavy_frac.to_numpy(), dims="case")
        sc = {k: float(getattr(nwpeval, k)(o, f, 0.10, dim="case")) for k in ("pod", "far", "csi", "ets")}
        out.append(dict(lead=int(L), n=int(len(g)), n_obs_events=int((g.o_heavy_frac >= 0.10).sum()),
                        n_fcst_events=int((g.f_heavy_frac >= 0.10).sum()),
                        **{k: (None if np.isnan(v) else v) for k, v in sc.items()}))
    return dict(season=f"{SEASONS[t.month]} {t.year}", event="≥ 64.5 mm/day over ≥ 10% of the subdivision", by_lead=out)


@app.get("/verify/{rid}")
def verify(rid: int, init: str):
    t = ts(init)
    df = q(f"""SELECT lead, valid_date, f_rain, o_rain, abs_err_mm, log_err, thr, bust, p_bust, confidence, hi_bust
               FROM {P()} WHERE rid=? AND init=? ORDER BY lead""", [rid, t])
    if df.empty:
        raise HTTPException(404, "not found")
    df["outcome"] = [outcome(p, b) for p, b in zip(df.p_bust, df.bust)]
    return dict(days=records(df), contingency=contingency_scores(rid, t))


def outcome(p, b, flag=0.15):
    """✓ hit: flagged (P ≥ 15%, Reduced/Low) and busted; ✗ miss: not flagged but busted;
    ! false alarm: flagged, no bust; · correct negative; None = no truth yet."""
    if p is None or pd.isna(p) or b is None or pd.isna(b) or b < 0:
        return None
    f = p >= flag
    return "hit" if f and b == 1 else "miss" if b == 1 else "false_alarm" if f else "correct_negative"


@app.get("/events")
def events():
    cases = yaml.safe_load(open(ROOT / "configs" / "cases.yaml"))["cases"]
    avail = set(pd.to_datetime(q(f"SELECT DISTINCT init FROM {P()}").init)) if active_version() else set()
    for c in cases:
        c["available"] = pd.Timestamp(c["init"]) in avail
    return cases


@app.get("/replay/{event}")
def replay(event: str, days: int = 10):
    cases = {c["id"]: c for c in yaml.safe_load(open(ROOT / "configs" / "cases.yaml"))["cases"]}
    if event in cases:
        start = pd.Timestamp(cases[event]["init"]); meta = cases[event]
    else:
        start = ts(event); meta = dict(id=event, name=f"Replay from {start:%Y-%m-%d %H} UTC")
    df = q(f"SELECT {MATRIX_COLS}, p_b2, o_rain, bust FROM {P()} WHERE init = ? ORDER BY rid, lead", [start])
    if df.empty:
        raise HTTPException(404, f"no cycle {start} in replay store")
    df["outcome"] = [outcome(p, b) for p, b in zip(df.p_bust, df.bust)]
    sc = df[df.outcome.notna()]
    by_day = []
    for d in range(1, days + 1):
        s = sc[sc.lead <= d]
        yb = s.bust.to_numpy(float)
        by_day.append(dict(day=d, hits=int((s.outcome == "hit").sum()), misses=int((s.outcome == "miss").sum()),
                           false_alarms=int((s.outcome == "false_alarm").sum()), n=int(len(s)),
                           brier=float(np.mean((s.p_bust - yb) ** 2)) if len(s) else None,
                           brier_b2=float(np.mean((s.p_b2 - yb) ** 2)) if len(s) else None))
    return dict(event=meta, init=start.strftime("%Y-%m-%dT%H:%M"), cells=records(df), ticker=by_day)


@app.get("/ledger")
def ledger(version: str | None = None):
    v = version or active_version()
    p = PROC / "eval" / f"{v}.json"
    if not p.exists():
        return dict(available=False, version=v,
                    reason="No held-out evaluation exists for this model version yet. "
                           "The Trust Ledger only shows results computed on held-out years.")
    return dict(available=True, version=v, **json.loads(p.read_text()))


class Feedback(BaseModel):
    rid: int
    init: str
    lead: int
    agree: bool
    note: str = ""
    user: str = "anonymous"


@app.post("/feedback")
def feedback(fb: Feedback):
    FEEDBACK.mkdir(parents=True, exist_ok=True)
    rec = fb.model_dump() | dict(ts=datetime.now(timezone.utc).isoformat(), model_version=active_version())
    with open(FEEDBACK / "feedback.jsonl", "a") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return dict(ok=True)


@app.on_event("startup")
def _warm():
    """Import/lazy-load everything /ops/status touches so the first request meets the 200 ms budget."""
    try:
        from purva_netra.ops import db as odb
        odb.init_db()
        ops_api.data_panel(); ops_api.pipeline_panel(); ops_api.system_panel(); ops_api.model_panel()
    except Exception as e:                      # never block startup (offline demo must come up)
        print("warm-up skipped:", e)
