"""/ops — Operations console API. Every route is role-guarded on the server.

Status rules: a check is "ok" only if it actually ran; every item carries `checked_at`; anything
not measured is "unknown" / "not_monitored" — never success.
"""
import asyncio, json, os, shutil, statistics, subprocess, time
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np, pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from .auth import require, current_user, load_users
from purva_netra import nrt, bundle as B
from purva_netra.ops import db
from purva_netra.ops.db import STAGES

ROOT = Path(__file__).resolve().parents[1]
router = APIRouter(prefix="/ops", tags=["ops"])
FRESH_H, OLD_H = 18, 36
API_VERSION = os.environ.get("PN_BUILD") or (subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT,
                                                            capture_output=True, text=True).stdout.strip() or "unknown")


def mode() -> str:
    return os.environ.get("PN_MODE", "replay").upper().replace("_", "-")


def is_nrt() -> bool:
    return mode() == "NEAR-REAL-TIME" or mode() == "NRT"


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(t):
    return None if t is None else pd.Timestamp(t).strftime("%Y-%m-%dT%H:%M:%SZ")


def age_h(ts):
    """Hours since `ts` (naive values are UTC; 'Z' strings are parsed as UTC)."""
    if not ts:
        return None
    t = pd.Timestamp(ts)
    t = t.tz_convert(None) if t.tzinfo else t
    return round((utcnow() - t).total_seconds() / 3600, 1)


def freshness(h):
    if h is None:
        return "unknown"
    return "fresh" if h < FRESH_H else "stale" if h < OLD_H else "old"


# ------------------------------------------------------------------------------ request metrics
class Metrics:
    def __init__(self):
        self.q: deque = deque()
        self._last_snap = 0.0

    def add(self, ms, status):
        t = time.time()
        self.q.append((t, ms, status))
        while self.q and t - self.q[0][0] > 3600:
            self.q.popleft()
        if t - self._last_snap > 60:
            self._last_snap = t
            try:
                db.set_health("api_metrics", "ok", self.summary())
            except Exception:
                pass

    def summary(self):
        if not self.q:
            return dict(requests=0, p50_ms=None, p95_ms=None, error_rate=None, window="1h")
        ms = sorted(x[1] for x in self.q)
        err = sum(1 for x in self.q if x[2] >= 500)
        return dict(requests=len(ms), p50_ms=round(ms[len(ms) // 2], 1), p95_ms=round(ms[int(len(ms) * 0.95) - 1 if len(ms) > 1 else 0], 1),
                    error_rate=round(err / len(ms), 4), window="1h")


METRICS = Metrics()


async def timing_middleware(request: Request, call_next):
    t = time.perf_counter()
    try:
        resp = await call_next(request)
    except Exception:
        METRICS.add((time.perf_counter() - t) * 1000, 500)
        raise
    if not request.url.path.endswith("/logs"):          # SSE streams would skew latency
        METRICS.add((time.perf_counter() - t) * 1000, resp.status_code)
    return resp


# ------------------------------------------------------------------------------ panels
def _stages_of(jid):
    return db.rows("SELECT name,status,started_at,finished_at,duration_s,rows,message FROM stages WHERE job_id=? ORDER BY ord", (jid,))


def data_panel():
    up = db.get_health("upstream_latest")
    upstream = dict(status="unknown", init=None, checked_at=None, error=None)
    if up:
        upstream = dict(status="reachable" if up["status"] == "ok" else "unreachable",
                        init=(up["value"] or {}).get("init"), source=(up["value"] or {}).get("source"),
                        checked_at=up["checked_at"], error=(up["value"] or {}).get("error"))
    processed = db.one("SELECT init, source FROM cycles WHERE status='published' ORDER BY init DESC LIMIT 1")
    fetch = db.one("""SELECT j.init, s.finished_at FROM stages s JOIN jobs j ON j.id=s.job_id
                      WHERE s.name='fetch' AND s.status='done' ORDER BY s.finished_at DESC LIMIT 1""")
    cur = (nrt.nrt_root() / "CURRENT")
    published = cur.read_text().strip() if cur.exists() else None
    h = age_h(published)
    truth = db.one("SELECT MAX(valid_date) AS latest, COUNT(*) AS n FROM verifications")
    waiting = None
    pubs = sorted(nrt.published_dir().glob("*.parquet"))
    if pubs:
        import duckdb
        today = pd.Timestamp(utcnow().date())
        with duckdb.connect() as con:
            n_due = con.execute(f"SELECT count(*) FROM '{nrt.published_dir().as_posix()}/*.parquet' WHERE p_bust IS NOT NULL AND valid_date < ?",
                                [today]).fetchone()[0]
        waiting = max(0, int(n_due) - int(truth["n"] or 0))
    imd = db.get_health("imd_truth")
    return dict(
        upstream=upstream,
        latest_processed=processed["init"] if processed else None, processed_source=processed["source"] if processed else None,
        last_fetch=dict(init=fetch["init"], at=fetch["finished_at"]) if fetch else None,
        published=published, data_age_h=h, freshness=freshness(h),
        truth=dict(latest_valid_date=truth["latest"], verified=int(truth["n"] or 0), waiting=waiting,
                   status=imd["status"] if imd else "unknown", checked_at=imd["checked_at"] if imd else None),
    )


def component(name, status, detail, checked_at):
    return dict(name=name, status=status, detail=detail, checked_at=checked_at)


def pipeline_panel():
    last = db.one("SELECT * FROM jobs WHERE type IN ('nrt','refresh') ORDER BY id DESC LIMIT 1")
    stages = _stages_of(last["id"]) if last else [dict(name=n, status="pending") for n in STAGES]

    def stage_health(names):
        r = db.one(f"""SELECT s.status, s.finished_at, s.message FROM stages s JOIN jobs j ON j.id=s.job_id
                       WHERE s.name IN ({",".join("?" * len(names))}) AND s.status IN ('done','failed')
                       ORDER BY COALESCE(s.finished_at, j.created_at) DESC LIMIT 1""", names)
        if not r:
            return "unknown", "never ran", None
        return ("ok" if r["status"] == "done" else "fail"), r["message"], r["finished_at"]

    comps = []
    for label, names in (("Data ingestion", ["fetch", "validate"]), ("Feature generation", ["extract", "features"]),
                         ("ML inference", ["inference", "explain", "publish"])):
        s, d, t = stage_health(names)
        comps.append(component(label, s, d, t))
    comps.append(component("API", "ok", f"answering; version {API_VERSION}", db.now()))
    fe = db.get_health("frontend")
    if not fe:
        comps.append(component("Frontend", "not_monitored", "no heartbeat received", None))
    else:
        v = fe["value"] or {}
        recent = age_h(fe["checked_at"]) is not None and age_h(fe["checked_at"]) * 60 <= 5
        match = v.get("version") == API_VERSION
        st = "ok" if (recent and match) else "warn" if recent else "not_monitored"
        comps.append(component("Frontend", st, f"build {v.get('version')} vs API {API_VERSION}"
                               + ("" if recent else " (no heartbeat in 5 min)"), fe["checked_at"]))
    return dict(latest_job=last and {k: last[k] for k in ("id", "type", "init", "status", "started_at", "finished_at",
                                                           "duration_s", "triggered_by", "attempt", "error", "source")},
                stages=stages, components=comps)


def model_panel():
    m = B.load_meta()
    if not m:
        return dict(available=False, reason="No model bundle (models/ACTIVE)")
    meta = m.get("meta", {})
    return dict(available=True, version=m["version"], kind=m["kind"], model_type=m["model_type"], features=m["features"],
                git=meta.get("git"), created=meta.get("created"), training_period=meta.get("training_period"),
                calibration_period=meta.get("calibration_period"), calibration_date=meta.get("calibration_date"),
                test_result=meta.get("test_result"), forecast_model=meta.get("forecast_model"),
                spec_training_period=meta.get("spec_training_period"), spec_calibration_period=meta.get("spec_calibration_period"),
                note=meta.get("note"), drift=drift_summary())


def psi(ref, values):
    edges = np.array(ref["edges"], float)
    e = edges.copy(); e[0], e[-1] = -np.inf, np.inf
    cur = np.histogram(values, bins=e)[0] / max(len(values), 1)
    exp = np.array(ref["frac"], float)
    cur, exp = np.clip(cur, 1e-4, None), np.clip(exp, 1e-4, None)
    return float(np.sum((cur - exp) * np.log(cur / exp)))


def drift_summary():
    b = None
    feats = []
    pubs = sorted(nrt.published_dir().glob("*.parquet"))
    cutoff = pd.Timestamp(utcnow()) - pd.Timedelta(days=30)
    recent = [p for p in pubs if pd.to_datetime(p.stem, format="%Y%m%d%H") >= cutoff]
    df = pd.concat([pd.read_parquet(p) for p in recent], ignore_index=True) if recent else None
    b = B.load()
    ref = (b or {}).get("feature_ref", {})
    feat_src = None
    if df is not None:                       # features are in work dirs; published rows carry spread_anom only
        fp = [nrt.workdir(pd.to_datetime(p.stem, format="%Y%m%d%H")) / "features.parquet" for p in recent]
        fp = [p for p in fp if p.exists()]
        feat_src = pd.concat([pd.read_parquet(p) for p in fp], ignore_index=True) if fp else None
    for f in B.DRIFT_FEATURES:
        r = ref.get(f) if ref else None
        if r is None:
            feats.append(dict(feature=f, status="not_in_model", psi=None, n=0, note="Not in this model version"))
        elif feat_src is None or f not in feat_src or feat_src[f].notna().sum() == 0:
            feats.append(dict(feature=f, status="insufficient", psi=None, n=0, note="No NRT cycles in the last 30 days"))
        else:
            v = feat_src[f].dropna().to_numpy()
            val = psi(r, v)
            feats.append(dict(feature=f, status="warn" if val > 0.2 else "ok", psi=round(val, 3), n=int(len(v)),
                              note="PSI > 0.2: distribution shifted vs training" if val > 0.2 else "PSI ≤ 0.2"))
    n = int((db.one("SELECT COUNT(*) AS n FROM verifications") or {"n": 0})["n"])
    test = ((B.load_meta() or {}).get("meta") or {}).get("test_result")
    if n < 200:
        cal = dict(status="insufficient", n=n, needed=200, text=f"Insufficient verified data (n = {n} / 200)")
    elif not test:
        cal = dict(status="unknown", n=n, text="No 2022 test result for this model version — cannot compare")
    else:
        v = db.rows("SELECT p_bust, bust FROM verifications WHERE bust >= 0")
        brier = float(np.mean([(r["p_bust"] - r["bust"]) ** 2 for r in v]))
        worse = brier > test.get("brier_hi", np.inf)
        cal = dict(status="warn" if worse else "ok", n=n, brier=round(brier, 4), test=test,
                   text="Brier worse than the 2022 test CI" if worse else "Within the 2022 test CI")
    return dict(features=feats, calibration=cal, checked_at=db.now())


def system_panel():
    last = db.one("SELECT id FROM jobs WHERE type IN ('nrt','refresh') AND status IN ('done','failed') ORDER BY id DESC LIMIT 1")
    last_st = {s["name"]: s["duration_s"] for s in _stages_of(last["id"])} if last else {}
    since = (utcnow() - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
    med = {}
    for n in STAGES:
        v = [r["duration_s"] for r in db.rows("SELECT s.duration_s AS duration_s FROM stages s JOIN jobs j ON j.id=s.job_id WHERE s.name=? AND s.status='done' AND s.finished_at>=?", (n, since)) if r["duration_s"] is not None]
        med[n] = round(statistics.median(v), 2) if v else None
    failed = db.rows("SELECT id,type,init,error,finished_at FROM jobs WHERE status='failed' AND created_at>=? ORDER BY id DESC", (since,))
    disk = db.get_health("disk")
    worker = db.get_health("worker")
    wk_age = age_h(worker["checked_at"]) if worker else None
    lp = db.get_health("last_publish")
    return dict(
        api=dict(status="up", version=API_VERSION, **METRICS.summary(), checked_at=db.now()),
        stage_times=[dict(stage=n, last_s=last_st.get(n), median_7d_s=med[n]) for n in STAGES],
        last_prediction=dict(init=(lp["value"] or {}).get("init"), at=lp["checked_at"]) if lp else None,
        failed_jobs_7d=failed,
        disk=dict(**(disk["value"] or {}), checked_at=disk["checked_at"]) if disk else dict(status="unknown", checked_at=None),
        worker=dict(status=("ok" if wk_age is not None and wk_age * 60 <= 5 else "down" if worker else "unknown"),
                    enabled=(worker["value"] or {}).get("nrt_enabled") if worker else None,
                    last_heartbeat=worker["checked_at"] if worker else None),
    )


def controls_panel():
    a = nrt.active_job()
    if not is_nrt():
        return dict(enabled=False, reason="REPLAY mode: NRT controls are disabled. Set PN_MODE=nrt to operate the pipeline.",
                    running_job=None)
    if not nrt.nrt_enabled():
        return dict(enabled=False, reason="NRT disabled (NRT_ENABLED=false).", running_job=a and a["id"])
    return dict(enabled=a is None, reason=f"Job {a['id']} is running" if a else None, running_job=a and a["id"])


def replay_panel():
    base = ROOT / "data" / "processed" / "predictions"
    vs = sorted(p.name.split("=", 1)[1] for p in base.glob("model=*")) if base.exists() else []
    active = (base / "ACTIVE").read_text().strip() if (base / "ACTIVE").exists() else (vs[-1] if vs else None)
    files = sorted((base / f"model={active}").glob("**/*.parquet")) if active else []
    return dict(versions=vs, active=active, cycles=len(files),
                first=files[0].stem if files else None, last=files[-1].stem if files else None, checked_at=db.now())


def overall(d, p, s):
    if not is_nrt():
        r = replay_panel()
        return dict(state="Healthy" if r["cycles"] else "Down",
                    reasons=[f"Replay store {r['active']} with {r['cycles']} cycles"] if r["cycles"] else ["Replay store empty"])
    reasons, state = [], "Healthy"
    if not nrt.nrt_enabled():
        reasons.append("NRT disabled"); state = "Degraded"
    if d["upstream"]["status"] == "unreachable":
        reasons.append("Upstream unreachable"); state = "Degraded"
    if d["upstream"]["status"] == "unknown":
        reasons.append("Upstream never checked"); state = "Degraded"
    if d["freshness"] in ("stale", "unknown"):
        reasons.append(f"Data {d['freshness']}" + (f" ({d['data_age_h']} h)" if d["data_age_h"] is not None else "")); state = "Degraded"
    if d["freshness"] == "old":
        reasons.append(f"Data old ({d['data_age_h']} h)"); state = "Down"
    if p["latest_job"] and p["latest_job"]["status"] == "failed":
        reasons.append(f"Last job failed ({p['latest_job']['error']})"); state = "Down" if d["freshness"] != "fresh" else "Degraded"
    if s["worker"]["status"] != "ok" and nrt.nrt_enabled():
        reasons.append(f"Worker {s['worker']['status']}"); state = "Degraded" if state == "Healthy" else state
    return dict(state=state, reasons=reasons or ["All checks passed"])


# ------------------------------------------------------------------------------ routes
@router.get("/status")
def status(user=Depends(require("operator"))):
    t = time.perf_counter()
    db.init_db()
    d, p, s = data_panel(), pipeline_panel(), system_panel()
    out = dict(mode="NEAR-REAL-TIME" if is_nrt() else "REPLAY", nrt_enabled=nrt.nrt_enabled(), upstream_kind=nrt.get_upstream().name,
               overall=overall(d, p, s), data=d, pipeline=p, model=model_panel(), system=s, controls=controls_panel(),
               replay=replay_panel(), checked_at=db.now(), user=user)
    out["elapsed_ms"] = round((time.perf_counter() - t) * 1000, 1)
    return out


@router.get("/jobs")
def jobs(limit: int = 20, status: str | None = None, user=Depends(require("operator"))):
    q, p = "SELECT id,type,init,status,started_at,finished_at,duration_s,triggered_by,attempt,error,source,created_at FROM jobs", []
    if status:
        q += " WHERE status=?"; p.append(status)
    return db.rows(q + " ORDER BY id DESC LIMIT ?", (*p, min(limit, 200)))


@router.get("/jobs/{jid}")
def job_detail(jid: int, user=Depends(require("operator"))):
    j = nrt.job(jid)
    if not j:
        raise HTTPException(404, "no such job")
    return dict(j, stages=_stages_of(jid))


@router.get("/jobs/{jid}/logs")
async def job_logs(jid: int, request: Request, stream: bool = True, user=Depends(require("operator"))):
    j = nrt.job(jid)
    if not j:
        raise HTTPException(404, "no such job")
    if j["status"] not in ("queued", "running") or not stream:
        return db.rows("SELECT id,ts,level,msg FROM logs WHERE job_id=? ORDER BY id", (jid,))

    async def gen():
        last = 0
        while True:
            for r in db.rows("SELECT id,ts,level,msg FROM logs WHERE job_id=? AND id>? ORDER BY id", (jid, last)):
                last = r["id"]
                yield f"data: {json.dumps(r)}\n\n"
            jj = nrt.job(jid)
            if jj["status"] not in ("queued", "running"):
                yield f"event: end\ndata: {json.dumps(dict(status=jj['status']))}\n\n"
                return
            if await request.is_disconnected():
                return
            await asyncio.sleep(1)
    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _guard_controls():
    c = controls_panel()
    if not is_nrt() or not nrt.nrt_enabled():
        raise HTTPException(409, c["reason"])


def _start(user, action, params, fn):
    _guard_controls()
    try:
        jid = fn()
    except nrt.RunnerBusy as e:
        db.audit(user["username"], action, params, dict(status=409, running_job=e.job_id))
        return JSONResponse(status_code=409, content=dict(detail=str(e), running_job=e.job_id))
    except ValueError as e:
        db.audit(user["username"], action, params, dict(status=400, error=str(e)))
        raise HTTPException(400, str(e))
    db.audit(user["username"], action, params, dict(status=202, job_id=jid))
    return JSONResponse(status_code=202, content=dict(job_id=jid))


@router.post("/run-latest")
def run_latest(force: bool = False, user=Depends(require("operator"))):
    return _start(user, "run-latest", dict(force=force),
                  lambda: nrt.start_job("nrt", user["username"], params=dict(force=force)))


@router.post("/jobs/{jid}/retry")
def retry(jid: int, user=Depends(require("operator"))):
    return _start(user, "retry", dict(job_id=jid), lambda: nrt.retry_job(jid, user["username"]))


@router.post("/refresh")
def refresh(init: str, user=Depends(require("operator"))):
    def go():
        if not (nrt.workdir(init) / "features.parquet").exists():
            raise ValueError(f"no features for {init}; run the full cycle first")
        return nrt.start_job("refresh", user["username"], init=init, params=dict(refresh=True))
    return _start(user, "refresh", dict(init=init), go)


@router.post("/verify")
def verify(user=Depends(require("operator"))):
    return _start(user, "verify", {}, lambda: nrt.start_job("verify", user["username"]))


@router.get("/model")
def model(user=Depends(require("operator"))):
    return model_panel()


@router.get("/drift")
def drift(user=Depends(require("operator"))):
    return drift_summary()


@router.get("/audit")
def audit(limit: int = 200, user=Depends(require("admin"))):
    return db.rows("SELECT * FROM audit ORDER BY id DESC LIMIT ?", (min(limit, 1000),))


@router.get("/users")
def users(user=Depends(require("admin"))):
    return [dict(username=u["username"], role=u["role"]) for u in load_users().values()]


@router.get("/cycles")
def cycles(user=Depends(require("operator"))):
    return db.rows("SELECT * FROM cycles ORDER BY init DESC LIMIT 60")


class Heartbeat(BaseModel):
    version: str


@router.post("/heartbeat")
def heartbeat(hb: Heartbeat):
    """Frontend liveness + build version (public: sent by every client, stores no user data)."""
    db.init_db()
    db.set_health("frontend", "ok" if hb.version == API_VERSION else "warn", dict(version=hb.version))
    return dict(ok=True, expected=API_VERSION)
