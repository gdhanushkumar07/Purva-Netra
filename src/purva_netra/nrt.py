"""Near-real-time job runner (spec §14; ops spec §2).

Stages: discover → fetch → validate → extract → features → inference → explain → publish, and a
separate daily `verify` job when IMD real-time rain arrives. Every stage writes status, timings,
row counts and logs to the ops DB (ops/db.py).

Guarantees
  * one run at a time      — fcntl lock on data/ops/nrt.lock (+ DB check); a second run → RunnerBusy
  * idempotent per init    — a published cycle is a no-op unless force=True
  * resumable              — retry starts at the failed stage and reuses earlier stage outputs
  * atomic publish         — predictions are written to a temp file, validated, then os.replace()d;
                             the CURRENT pointer is swapped last. Readers never see a partial cycle.

Upstream: ECMWF open data (ecmwf-opendata) by default; PN_UPSTREAM=mock selects a SYNTHETIC
upstream used only by tests and the offline demo — its cycles are recorded with source='mock'
and the UI labels them so.

CLI:  python -m purva_netra.nrt run-latest [--force] | run-job <id> | verify | status
"""
import fcntl, json, os, subprocess, sys, time, traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path
import numpy as np, pandas as pd, xarray as xr

from .config import ROOT
from .ops import db
from .ops.db import STAGES

def nrt_root() -> Path:
    return Path(os.environ.get("PN_NRT_DIR", ROOT / "data" / "nrt"))
LEAD_STEPS = list(range(24, 241, 24))
REVISION_THRESHOLD = 0.4          # same fixed threshold as explain.RULES["revision"]


class RunnerBusy(Exception):
    def __init__(self, job_id):
        super().__init__(f"another NRT job is running (job {job_id})")
        self.job_id = job_id


class UpstreamUnreachable(Exception):
    pass


class StageError(Exception):
    pass


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def ikey(init) -> str:
    return pd.Timestamp(init).strftime("%Y%m%d%H")


def workdir(init) -> Path:
    return nrt_root() / "work" / ikey(init)


def published_dir() -> Path:
    return nrt_root() / "published"


def nrt_enabled() -> bool:
    return os.environ.get("NRT_ENABLED", "true").lower() not in ("0", "false", "no")


# ---------------------------------------------------------------------------------- upstreams
class EcmwfUpstream:
    name = "ecmwf-opendata"

    # ECMWF limits its portal to 500 simultaneous connections (HTTP 429) and publishes the same open
    # data on AWS/Azure/Google mirrors; PN_ECMWF_SOURCE picks one (default: aws).
    def _client(self, retries=1, wait=5):
        from ecmwf.opendata import Client
        return Client(source=os.environ.get("PN_ECMWF_SOURCE", "aws"), maximum_retries=retries, retry_after=wait)

    def latest(self) -> pd.Timestamp:
        try:
            t = self._client().latest(stream="enfo", type="pf", param="tp", step=240)
        except Exception as e:
            raise UpstreamUnreachable(f"{type(e).__name__}: {e}") from e
        return pd.Timestamp(t)

    def fetch(self, init, out: Path, log) -> Path:
        """Download HRES (oper fc) and the 50 perturbed ENS members (pf) accumulated tp for steps 24…240,
        crop each step to the IMD 0.25° land grid immediately (global GRIB deleted), convert to 24-h mm.
        Open data has no control member (cf) for tp — and training (WB2 ifs_ens) also uses the 50 pf members."""
        from .regions import load_weights
        w = load_weights()["hres"]
        lat, lon = w.lat.values, w.lon.values
        init = pd.Timestamp(init)
        c = self._client(retries=5, wait=30)       # 429s happen; back off
        tmp = out / "grib"; tmp.mkdir(parents=True, exist_ok=True)

        def crop(path):
            ds = xr.open_dataset(path, engine="cfgrib", backend_kwargs={"indexpath": ""})
            da = ds["tp"].sel(latitude=lat, longitude=lon, method="nearest", tolerance=1e-3).load()
            ds.close(); path.unlink(missing_ok=True)
            return da

        base = dict(date=init.strftime("%Y-%m-%d"), time=init.hour, param="tp")
        try:
            p = tmp / "oper.grib2"
            c.retrieve(stream="oper", type="fc", step=LEAD_STEPS, target=str(p), **base)
            hres = crop(p)                                       # (step, lat, lon) accumulated m
            log("INFO", f"HRES tp: {hres.sizes['step']} steps")
            pf = []
            for s in LEAD_STEPS:
                p = tmp / f"pf_{s}.grib2"
                c.retrieve(stream="enfo", type="pf", step=s, target=str(p), **base)
                pf.append(crop(p))
                log("INFO", f"ENS pf step {s} h: {pf[-1].sizes.get('number', 0)} members")
        except UpstreamUnreachable:
            raise
        except Exception as e:
            raise StageError(f"fetch failed: {type(e).__name__}: {e}") from e
        pf = xr.concat(pf, dim="step")                            # (step, number, lat, lon)
        ens = pf.transpose("step", "number", ...)
        return _write_fields(hres, ens, out)


class MockUpstream:
    """SYNTHETIC upstream for tests and the offline demo. Never presented as ECMWF data."""
    name = "mock"

    def latest(self) -> pd.Timestamp:
        if os.environ.get("PN_MOCK_UNREACHABLE"):
            raise UpstreamUnreachable("mock upstream set unreachable (PN_MOCK_UNREACHABLE)")
        fixed = os.environ.get("PN_MOCK_LATEST")
        if fixed:
            return pd.Timestamp(fixed)
        t = utcnow() - timedelta(hours=8)
        return pd.Timestamp(t.date()) + pd.Timedelta(hours=0 if t.hour < 12 else 12)

    def fetch(self, init, out: Path, log) -> Path:
        if os.environ.get("PN_MOCK_FAIL") == "fetch":
            raise StageError("simulated fetch failure (PN_MOCK_FAIL=fetch)")
        from .regions import load_weights
        w = load_weights()["hres"]
        rng = np.random.default_rng(int(ikey(init)) % 2**32)
        nlat, nlon = len(w.lat), len(w.lon)
        steps = np.array(LEAD_STEPS)
        daily = rng.gamma(0.8, 6.0, size=(len(steps), nlat, nlon)) / 1000        # m / day
        acc = np.cumsum(daily, axis=0)
        mem = acc[:, None] * np.exp(rng.normal(0, 0.25 + 0.03 * np.arange(len(steps))[:, None, None, None],
                                               size=(len(steps), 51, nlat, nlon)))
        mem = np.maximum.accumulate(mem, axis=0)
        co = dict(latitude=w.lat.values, longitude=w.lon.values)
        hres = xr.DataArray(acc, dims=("step", "latitude", "longitude"), coords=dict(step=steps, **co))
        ens = xr.DataArray(mem, dims=("step", "number", "latitude", "longitude"), coords=dict(step=steps, number=np.arange(51), **co))
        log("WARN", "MOCK upstream: synthetic fields (test/demo only)")
        time.sleep(float(os.environ.get("PN_MOCK_DELAY", "0")))
        return _write_fields(hres, ens, out)


def _write_fields(hres_acc, ens_acc, out: Path) -> Path:
    """Accumulated tp (m) → 24-h totals (mm) per lead day; saved as one netCDF."""
    def daily(a):
        d = a.diff("step", label="upper")
        first = a.isel(step=[0])
        return (xr.concat([first, d], dim="step").clip(min=0) * 1000)
    h = daily(hres_acc.transpose("step", "latitude", "longitude"))
    e = daily(ens_acc.transpose("step", "number", "latitude", "longitude"))
    st = h.step.values
    hours = (st / np.timedelta64(1, "h")) if np.issubdtype(st.dtype, np.timedelta64) else st   # GRIB: timedelta
    lead = (np.asarray(hours) // 24).astype(int)
    ds = xr.Dataset({"hres": h.assign_coords(step=lead).rename(step="lead", latitude="lat", longitude="lon"),
                     "ens": e.assign_coords(step=lead).rename(step="lead", latitude="lat", longitude="lon")})
    p = out / "fields.nc"
    tmp = out / "fields.nc.part"
    ds.to_netcdf(tmp); os.replace(tmp, p)
    return p


def get_upstream():
    return MockUpstream() if os.environ.get("PN_UPSTREAM", "ecmwf") == "mock" else EcmwfUpstream()


# ---------------------------------------------------------------------------------- locking
def lock_path() -> Path:
    p = db.db_path().parent / "nrt.lock"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def pid_alive(pid) -> bool:
    if not pid:
        return False
    try:
        os.kill(int(pid), 0)
        return True
    except OSError:
        return False


def active_job():
    """The queued/running job whose process is alive, else None (stale rows are closed)."""
    for j in db.rows("SELECT * FROM jobs WHERE status IN ('queued','running') ORDER BY id DESC"):
        if j["status"] == "queued" and not j["pid"]:
            age = (utcnow() - datetime.strptime(j["created_at"], "%Y-%m-%dT%H:%M:%SZ")).total_seconds()
            if age < 120:
                return j
        if pid_alive(j["pid"]):
            return j
        db.execute("UPDATE jobs SET status='failed', error=?, finished_at=? WHERE id=?",
                   ("process ended without finishing (stale)", db.now(), j["id"]))
    return None


class Lock:
    def __enter__(self):
        self.f = open(lock_path(), "w")
        try:
            fcntl.flock(self.f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.f.close()
            a = active_job()
            raise RunnerBusy(a["id"] if a else None)
        return self

    def __exit__(self, *a):
        fcntl.flock(self.f, fcntl.LOCK_UN); self.f.close()


# ---------------------------------------------------------------------------------- job records
def create_job(type_, triggered_by, init=None, attempt=1, params=None, status="queued") -> int:
    db.init_db()
    jid = db.execute("INSERT INTO jobs(type,init,status,triggered_by,attempt,params,created_at) VALUES(?,?,?,?,?,?,?)",
                     (type_, None if init is None else str(pd.Timestamp(init)), status, triggered_by, attempt,
                      json.dumps(params or {}), db.now()))
    names = ["verify"] if type_ == "verify" else STAGES
    for k, n in enumerate(names):
        db.execute("INSERT INTO stages(job_id,name,ord,status) VALUES(?,?,?, 'pending')", (jid, n, k))
    return jid


def job(jid):
    return db.one("SELECT * FROM jobs WHERE id=?", (jid,))


def stages(jid):
    return db.rows("SELECT * FROM stages WHERE job_id=? ORDER BY ord", (jid,))


def set_stage(jid, name, **kw):
    sets = ", ".join(f"{k}=?" for k in kw)
    db.execute(f"UPDATE stages SET {sets} WHERE job_id=? AND name=?", (*kw.values(), jid, name))


# ---------------------------------------------------------------------------------- stages
class Ctx:
    def __init__(self, jid, init=None, force=False):
        self.jid, self.init, self.force = jid, init, force
        self.up = get_upstream()
        self.bundle = None

    def log(self, level, msg):
        db.log(self.jid, level, msg)

    @property
    def wd(self) -> Path:
        d = workdir(self.init); d.mkdir(parents=True, exist_ok=True); return d


def st_discover(c: Ctx):
    try:
        latest = c.up.latest()
        db.set_health("upstream_latest", "ok", dict(init=str(latest), source=c.up.name))
    except UpstreamUnreachable as e:
        db.set_health("upstream_latest", "fail", dict(error=str(e), source=c.up.name))
        raise StageError(f"Upstream unreachable: {e}")
    if c.init is None:
        c.init = latest
    db.execute("INSERT OR IGNORE INTO cycles(init,source,discovered_at,status) VALUES(?,?,?, 'discovered')",
               (str(pd.Timestamp(c.init)), c.up.name, db.now()))
    db.execute("UPDATE jobs SET init=?, source=? WHERE id=?", (str(pd.Timestamp(c.init)), c.up.name, c.jid))
    c.log("INFO", f"upstream latest = {latest}; processing {c.init} ({c.up.name})")
    return None, f"latest upstream {latest}"


def st_fetch(c: Ctx):
    p = c.up.fetch(c.init, c.wd, c.log)
    return None, f"{p.stat().st_size / 1e6:.1f} MB cropped fields"


def st_validate(c: Ctx):
    ds = xr.open_dataset(c.wd / "fields.nc")
    h, e = ds.hres, ds.ens
    problems = []
    if sorted(h.lead.values.tolist()) != list(range(1, 11)):
        problems.append(f"HRES leads {h.lead.values.tolist()}")
    if int(e.sizes["number"]) < 50:            # 50 perturbed members (as in training)
        problems.append(f"ENS members {int(e.sizes['number'])} < 50")
    if int(h.isnull().sum()) or int(e.isnull().sum()):
        problems.append("NaN in cropped fields")
    if float(h.max()) > 2000 or float(e.max()) > 2000:
        problems.append("implausible 24-h rain > 2000 mm")
    ds.close()
    if problems:
        raise StageError("validation failed: " + "; ".join(problems))
    (c.wd / "validated.json").write_text(json.dumps(dict(ok=True, at=db.now())))
    return int(h.size + e.size), "fields valid (10 leads, ≥50 members, no NaN)"


def st_extract(c: Ctx):
    from .extract_wb2 import summarise, to_rows
    from .regions import load_weights
    w = load_weights()["hres"]
    ds = xr.open_dataset(c.wd / "fields.nc")
    stats = summarise(ds.hres.load(), ds.ens.load(), w, w)     # NRT ENS is 0.25°: same land weights
    df = to_rows(stats, c.init, "lead")
    ds.close()
    has_land = (w.sum(("lat", "lon")) > 0).to_series()
    fcols = [x for x in df.columns if x not in ("init", "lead", "rid", "valid_date")]
    df.loc[~df.rid.map(has_land), fcols] = np.nan
    df["assessed"] = df.rid.map(has_land)
    _atomic_parquet(df, c.wd / "extract.parquet")
    return len(df), "region means (land-only)"


def _prev_extracts(init, n=3):
    out = []
    for k in range(1, n + 1):
        p = workdir(pd.Timestamp(init) - pd.Timedelta(hours=12 * k)) / "extract.parquet"
        if p.exists():
            out.append(pd.read_parquet(p))
    return out


def st_features(c: Ctx):
    from .features import add_revision, add_flipflop
    from . import bundle as B
    c.bundle = c.bundle or B.load()
    if c.bundle is None:
        raise StageError("no model bundle (models/ACTIVE) — run the offline pipeline first")
    cur = pd.read_parquet(c.wd / "extract.parquet")
    hist = pd.concat([cur] + _prev_extracts(c.init), ignore_index=True)
    hist["doy"] = hist.valid_date.dt.dayofyear
    hist["month"] = hist.valid_date.dt.month
    hist = add_flipflop(add_revision(hist))                        # only earlier cycles are used
    d = hist[hist.init == pd.Timestamp(c.init)].copy()
    cl = c.bundle["clim"]
    for c_name, tbl in (("spread_clim", cl["spread"]), ("f_rain_clim", cl["f_rain"])):
        d = d.drop(columns=[c_name], errors="ignore").merge(tbl, on=["rid", "lead", "month"], how="left")
        fb = tbl.groupby(["rid", "lead"])[c_name].mean()
        d[c_name] = d[c_name].fillna(pd.Series(list(zip(d.rid, d.lead))).map(fb).set_axis(d.index))
    d["spread_anom"] = d.ens_spread / (d.spread_clim + 0.1)
    d["hres_minus_em"] = np.abs(d.f_rain - d.ens_mean)
    d["ens_iqr_rel"] = (d.ens_q90 - d.ens_q10) / (d.ens_mean + 1)
    d["f_rain_anom"] = np.log1p(d.f_rain) - np.log1p(d.f_rain_clim)
    d["doy_sin"], d["doy_cos"] = np.sin(2 * np.pi * d.doy / 366), np.cos(2 * np.pi * d.doy / 366)
    _atomic_parquet(d, c.wd / "features.parquet")
    n_rev = int(d.rev12.notna().sum())
    return len(d), f"features built; revision available for {n_rev} rows (needs earlier NRT cycles)"


def st_inference(c: Ctx):
    from . import bundle as B
    c.bundle = c.bundle or B.load()
    d = pd.read_parquet(c.wd / "features.parquet")
    d["p_bust"] = B.predict(c.bundle, d)
    d["p_b2"] = d.p_bust if c.bundle["model_type"] == "b2_logistic" else np.nan
    eq = c.bundle["err_q"].set_index(["rid", "lead"])[["err_q50", "err_q90"]]
    d = d.drop(columns=["err_q50", "err_q90"], errors="ignore").join(eq, on=["rid", "lead"])
    _atomic_parquet(d, c.wd / "inference.parquet")
    return int(d.p_bust.notna().sum()), f"model {c.bundle['version']} ({c.bundle['kind']})"


def st_explain(c: Ctx):
    from . import bundle as B
    from .predict import finalize
    c.bundle = c.bundle or B.load()
    d = pd.read_parquet(c.wd / "inference.parquet")
    gc = B.group_contributions(c.bundle, d)
    src = "rule" if c.bundle["model_type"] == "b2_logistic" else "shap"
    contribs = [g or {} for g in gc] if src == "shap" else None
    out = finalize(d, d.p_bust.to_numpy(), contribs, src, group_contrib=gc)
    _atomic_parquet(out, c.wd / "explained.parquet")
    return len(out), f"template reasons ({src}) + SHAP group contributions"


def validate_publish(df: pd.DataFrame):
    if len(df) != 360:
        raise StageError(f"publish validation: {len(df)} rows ≠ 360")
    assessed = df[df.rid.isin(df[df.p_bust.notna()].rid.unique())]
    if df.groupby("rid").p_bust.apply(lambda s: s.isna().any() and s.notna().any()).any():
        raise StageError("publish validation: partial NaN p_bust within a region")
    if assessed.p_bust.isna().any() or df.p_bust.notna().sum() < 340:
        raise StageError("publish validation: NaN p_bust for assessed regions")


def st_publish(c: Ctx):
    from . import bundle as B
    from .predict import add_change_vs_prev
    c.bundle = c.bundle or B.load()
    d = pd.read_parquet(c.wd / "explained.parquet")
    prev_files = [p for p in sorted(published_dir().glob("*.parquet")) if p.stem < ikey(c.init)]
    if prev_files:                                   # change vs the previous published cycle (same valid date)
        pv = pd.read_parquet(prev_files[-1])
        comb = add_change_vs_prev(pd.concat([pv[d.columns.intersection(pv.columns)], d], ignore_index=True))
        d = comb[comb.init == pd.Timestamp(c.init)].copy()
    else:
        d = add_change_vs_prev(d)
    d["model_version"] = c.bundle["version"]
    d["model_kind"] = c.bundle["kind"]
    d["source"] = c.up.name
    d["mode"] = "nrt"
    validate_publish(d)
    pd_ = published_dir(); pd_.mkdir(parents=True, exist_ok=True)
    _atomic_parquet(d, pd_ / f"{ikey(c.init)}.parquet")
    _atomic_text(nrt_root() / "CURRENT", str(pd.Timestamp(c.init)))
    db.execute("UPDATE cycles SET status='published' WHERE init=?", (str(pd.Timestamp(c.init)),))
    db.set_health("last_publish", "ok", dict(init=str(pd.Timestamp(c.init)), source=c.up.name, rows=len(d)))
    return len(d), f"published {ikey(c.init)} (atomic)"


STAGE_FN = dict(discover=st_discover, fetch=st_fetch, validate=st_validate, extract=st_extract,
                features=st_features, inference=st_inference, explain=st_explain, publish=st_publish)
STAGE_OUTPUT = dict(fetch="fields.nc", validate="validated.json", extract="extract.parquet", features="features.parquet",
                    inference="inference.parquet", explain="explained.parquet")


def _atomic_parquet(df, path: Path):
    tmp = path.with_name(f".{path.name}.part")          # not matched by *.parquet globs
    df.to_parquet(tmp, index=False)
    os.replace(tmp, path)


def _atomic_text(path: Path, text: str):
    tmp = path.with_name(f".{path.name}.part")
    tmp.write_text(text); os.replace(tmp, path)


# ---------------------------------------------------------------------------------- execution
def run_job(jid: int):
    """Execute a queued job (type nrt | refresh | verify). Holds the lock for the whole run."""
    j = job(jid)
    try:
        lk = Lock().__enter__()
    except RunnerBusy as e:
        db.execute("UPDATE jobs SET status='failed', error=?, finished_at=? WHERE id=?", (str(e), db.now(), jid))
        raise
    t0 = time.time()
    db.execute("UPDATE jobs SET status='running', started_at=?, pid=? WHERE id=?", (db.now(), os.getpid(), jid))
    params = json.loads(j["params"] or "{}")
    try:
        if j["type"] == "verify":
            return _finish(jid, t0, *run_verify(jid))
        c = Ctx(jid, init=j["init"] and pd.Timestamp(j["init"]), force=params.get("force", False))
        resume = params.get("resume_from")
        if j["type"] == "refresh":
            resume = "inference"
        names = STAGES
        start = names.index(resume) if resume else 0
        # idempotency: already published and not forced → no-op
        if j["type"] == "nrt" and not c.force and start == 0:
            _run_stage(c, "discover")
            cyc = db.one("SELECT status FROM cycles WHERE init=?", (str(pd.Timestamp(c.init)),))
            if cyc and cyc["status"] == "published":
                for n in names[1:]:
                    set_stage(jid, n, status="skipped", message="cycle already published (no-op)")
                c.log("INFO", f"{c.init} already published — nothing to do (use force to re-run)")
                return _finish(jid, t0, "noop", None)
            start = 1
        for n in names[:start]:
            if db.one("SELECT 1 FROM stages WHERE job_id=? AND name=? AND status='done'", (jid, n)):
                continue                                   # ran in this job (e.g. discover) — keep 'done'
            out = STAGE_OUTPUT.get(n)
            ok = n == "discover" or (c.init is not None and out and (workdir(c.init) / out).exists())
            if not ok:
                raise StageError(f"cannot resume at {resume}: output of {n} missing")
            set_stage(jid, n, status="reused", message="output reused from earlier run")
        if start > 0:
            db.execute("UPDATE cycles SET status='processing' WHERE init=?", (str(pd.Timestamp(c.init)),))
            db.execute("UPDATE jobs SET source=? WHERE id=?", (c.up.name, jid))      # resumed jobs skip discover
        for n in names[start:]:
            _run_stage(c, n)
        return _finish(jid, t0, "done", None)
    except Exception as e:
        tb = traceback.format_exc()
        cur = db.one("SELECT name FROM stages WHERE job_id=? AND status='running'", (jid,))
        failed_at = cur["name"] if cur else None
        if failed_at:
            set_stage(jid, failed_at, status="failed", finished_at=db.now(), message=str(e)[:500])
        db.execute("UPDATE stages SET status='skipped', message='skipped: earlier stage failed' WHERE job_id=? AND status='pending'", (jid,))
        db.log(jid, "ERROR", f"{failed_at or 'job'} failed: {e}")
        db.execute("UPDATE jobs SET traceback=? WHERE id=?", (tb, jid))
        j2 = job(jid)
        if j2["init"]:
            db.execute("UPDATE cycles SET status='failed' WHERE init=? AND status!='published'", (j2["init"],))
        return _finish(jid, t0, "failed", f"{failed_at or 'job'}: {e}")
    finally:
        lk.__exit__()


def _run_stage(c: Ctx, name: str):
    t = time.time()
    set_stage(c.jid, name, status="running", started_at=db.now())
    c.log("INFO", f"stage {name} started")
    rows_, msg = STAGE_FN[name](c)
    set_stage(c.jid, name, status="done", finished_at=db.now(), duration_s=round(time.time() - t, 2), rows=rows_, message=msg)
    c.log("INFO", f"stage {name} done in {time.time() - t:.1f}s — {msg}")


def _finish(jid, t0, status, error):
    db.execute("UPDATE jobs SET status=?, error=?, finished_at=?, duration_s=? WHERE id=?",
               (status, error, db.now(), round(time.time() - t0, 2), jid))
    return status


def start_job(type_, triggered_by, init=None, params=None, attempt=1, spawn=True) -> int:
    """API entry: refuse if something runs (RunnerBusy), create the job, run it in a child process."""
    a = active_job()
    if a:
        raise RunnerBusy(a["id"])
    jid = create_job(type_, triggered_by, init=init, params=params, attempt=attempt)
    if spawn:
        p = subprocess.Popen([sys.executable, "-m", "purva_netra.nrt", "run-job", str(jid)], cwd=ROOT,
                             stdout=subprocess.DEVNULL, stderr=open(db.db_path().parent / f"job-{jid}.stderr", "w"),
                             start_new_session=True, env=os.environ.copy())
        db.execute("UPDATE jobs SET pid=? WHERE id=?", (p.pid, jid))
    return jid


def retry_job(jid: int, triggered_by: str) -> int:
    j = job(jid)
    if not j or j["status"] != "failed":
        raise ValueError("only failed jobs can be retried")
    failed = db.one("SELECT name FROM stages WHERE job_id=? AND status='failed'", (jid,))
    resume = failed["name"] if failed and failed["name"] != "discover" else None
    return start_job(j["type"], triggered_by, init=j["init"], attempt=j["attempt"] + 1,
                     params=dict(json.loads(j["params"] or "{}"), resume_from=resume, retry_of=jid))


# ---------------------------------------------------------------------------------- verify (daily)
def run_verify(jid):
    """Join published NRT predictions with IMD real-time gridded rain once it exists."""
    from . import bundle as B
    from .labels import add_log_error, add_bust
    t = time.time()
    set_stage(jid, "verify", status="running", started_at=db.now())
    b = B.load()
    pubs = sorted(published_dir().glob("*.parquet"))
    if not pubs:
        set_stage(jid, "verify", status="done", finished_at=db.now(), rows=0, message="no published NRT cycles")
        return "done", None
    pred = pd.concat([pd.read_parquet(p) for p in pubs], ignore_index=True)
    done = {(r["init"], r["rid"], r["lead"]) for r in db.rows("SELECT init, rid, lead FROM verifications")}
    today = pd.Timestamp(utcnow().date())
    todo = pred[(pred.valid_date < today) & pred.p_bust.notna()]
    todo = todo[[(str(i), int(r), int(l)) not in done for i, r, l in zip(todo.init, todo.rid, todo.lead)]]
    if todo.empty:
        set_stage(jid, "verify", status="done", finished_at=db.now(), rows=0, message="nothing waiting for truth")
        return "done", None
    truth = imd_realtime_truth(sorted(todo.valid_date.dt.strftime("%Y-%m-%d").unique()), lambda l, m: db.log(jid, l, m))
    if truth is None or truth.empty:
        db.set_health("imd_truth", "warn", dict(waiting=int(len(todo)), note="IMD real-time rain not available yet"))
        set_stage(jid, "verify", status="done", finished_at=db.now(), rows=0,
                  message=f"IMD truth not available yet; {len(todo)} predictions waiting")
        return "done", None
    v = todo.drop(columns=["o_rain", "o_heavy_frac", "log_err", "abs_err_mm", "bust", "thr"], errors="ignore") \
            .merge(truth, on=["valid_date", "rid"], how="inner")
    v = add_bust(add_log_error(v), b["thresholds"])
    for r in v.itertuples():
        db.execute("INSERT OR REPLACE INTO verifications VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                   (str(r.init), int(r.rid), int(r.lead), str(r.valid_date.date()), float(r.p_bust), float(r.f_rain),
                    float(r.o_rain), float(r.log_err), None if pd.isna(r.thr) else float(r.thr), int(r.bust), db.now()))
    db.set_health("imd_truth", "ok", dict(latest_valid=str(truth.valid_date.max().date()), verified=int(len(v))))
    set_stage(jid, "verify", status="done", finished_at=db.now(), duration_s=round(time.time() - t, 2), rows=len(v),
              message=f"verified {len(v)} predictions")
    return "done", None


def imd_realtime_truth(dates, log, timeout=120):
    """IMD real-time 0.25° rain via imdlib (real data; network). Returns region means or None."""
    import threading, imdlib as imd
    from .regions import load_weights, region_mean
    d = nrt_root() / "imd_rt"; d.mkdir(parents=True, exist_ok=True)
    res = {}

    def go():
        try:
            res["data"] = imd.get_real_data("rain", dates[0], dates[-1], file_dir=str(d))
        except Exception as e:
            res["err"] = e
    th = threading.Thread(target=go, daemon=True); th.start(); th.join(timeout)
    if th.is_alive() or "err" in res:
        log("WARN", f"IMD real-time rain unavailable: {res.get('err', 'timeout')}")
        return None
    da = res["data"].get_xarray()["rain"]
    da = da.where(da >= 0)
    w = load_weights()["imd"]
    o = region_mean(da, w).to_dataframe(name="o_rain").reset_index().rename(columns={"time": "valid_date", "region": "rid"})
    return o


# ---------------------------------------------------------------------------------- CLI
if __name__ == "__main__":
    db.init_db()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "run-job":
        print(run_job(int(sys.argv[2])))
    elif cmd == "run-latest":
        jid = create_job("nrt", "cli", params=dict(force="--force" in sys.argv))
        print(jid, run_job(jid))
    elif cmd == "verify":
        jid = create_job("verify", "cli")
        print(jid, run_job(jid))
    else:
        print(json.dumps(db.rows("SELECT id,type,init,status,error FROM jobs ORDER BY id DESC LIMIT 10"), indent=1))
