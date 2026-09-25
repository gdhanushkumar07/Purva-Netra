"""Operations console + NRT runner (ops spec §6). Hermetic: temp ops.db / NRT dir, SYNTHETIC
mock upstream (PN_UPSTREAM=mock), no network. The placeholder model bundle in models/ is used."""
import json, os, threading, time
from pathlib import Path

import pandas as pd, pytest
from fastapi.testclient import TestClient

PW = "change-me-operator"
OPS_ROUTES = [("get", "/ops/status"), ("get", "/ops/jobs"), ("get", "/ops/jobs/1"), ("get", "/ops/jobs/1/logs"),
              ("post", "/ops/run-latest"), ("post", "/ops/jobs/1/retry"), ("post", "/ops/refresh?init=2026-09-25T00"),
              ("post", "/ops/verify"), ("get", "/ops/model"), ("get", "/ops/drift"), ("get", "/ops/audit"),
              ("get", "/ops/users"), ("get", "/ops/cycles")]


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("PN_OPS_DB", str(tmp_path / "ops" / "ops.db"))
    monkeypatch.setenv("PN_NRT_DIR", str(tmp_path / "nrt"))
    monkeypatch.setenv("PN_UPSTREAM", "mock")
    monkeypatch.setenv("PN_MOCK_LATEST", "2026-09-25T00")
    monkeypatch.setenv("PN_MODE", "nrt")
    monkeypatch.setenv("NRT_ENABLED", "true")
    monkeypatch.setenv("PN_COOKIE_SECURE", "false")
    monkeypatch.setenv("PN_USERS", str(Path(__file__).resolve().parents[1] / "configs" / "users.example.yaml"))
    from api.auth import reset_rate_limit
    reset_rate_limit()
    return tmp_path


def client(role=None):
    from api.main import app
    c = TestClient(app)
    if role:
        r = c.post("/auth/login", json=dict(username=role, password="change-me-admin" if role == "admin" else PW))
        assert r.status_code == 200, r.text
    return c


def run_sync(**params):
    from purva_netra import nrt
    jid = nrt.create_job("nrt", "test", params=params)
    return jid, nrt.run_job(jid)


# ---------------------------------------------------------------- access control
def test_viewer_gets_403_on_every_ops_route(env):
    c = client("viewer")
    for m, path in OPS_ROUTES:
        assert getattr(c, m)(path).status_code == 403, path


def test_anonymous_is_rejected_on_every_ops_route(env):
    c = client()
    for m, path in OPS_ROUTES:
        assert getattr(c, m)(path).status_code in (401, 403), path


def test_operator_cannot_read_admin_routes_but_admin_can(env):
    assert client("operator").get("/ops/audit").status_code == 403
    a = client("admin")
    assert a.get("/ops/audit").status_code == 200 and a.get("/ops/users").status_code == 200


def test_login_rate_limit(env):
    c = client()
    codes = [c.post("/auth/login", json=dict(username="operator", password="wrong")).status_code for _ in range(7)]
    assert codes[:5] == [401] * 5 and codes[5:] == [429, 429]
    # even the right password is refused while limited
    assert c.post("/auth/login", json=dict(username="operator", password=PW)).status_code == 429


def test_session_cookie_flags(env, monkeypatch):
    monkeypatch.setenv("PN_COOKIE_SECURE", "true")
    from api.main import app
    r = TestClient(app).post("/auth/login", json=dict(username="operator", password=PW))
    h = r.headers["set-cookie"].lower()
    assert "httponly" in h and "samesite=strict" in h and "secure" in h


# ---------------------------------------------------------------- runner guarantees
def test_full_run_publishes_atomically_with_360_rows(env):
    jid, st = run_sync()
    assert st == "done"
    from purva_netra import nrt
    df = pd.read_parquet(nrt.published_dir() / "2026092500.parquet")
    assert len(df) == 360 and df.p_bust.notna().sum() == 340         # 2 islands: no IMD land cells
    assert (nrt.nrt_root() / "CURRENT").read_text().startswith("2026-09-25")
    assert set(df.source) == {"mock"} and set(df.model_kind) == {"placeholder"}
    assert [s["status"] for s in nrt.stages(jid)] == ["done"] * 8


def test_rerun_finished_init_is_noop(env):
    run_sync()
    jid, st = run_sync()
    from purva_netra import nrt
    assert st == "noop"
    ss = {s["name"]: s["status"] for s in nrt.stages(jid)}
    assert ss["discover"] == "done" and all(v == "skipped" for k, v in ss.items() if k != "discover")
    _, st3 = run_sync(force=True)
    assert st3 == "done"                                               # force re-runs


def test_second_concurrent_run_returns_409(env, monkeypatch):
    monkeypatch.setenv("PN_MOCK_DELAY", "4")
    from purva_netra import nrt
    jid = nrt.create_job("nrt", "test")
    t = threading.Thread(target=nrt.run_job, args=(jid,)); t.start()
    time.sleep(1.0)
    c = client("operator")
    r = c.post("/ops/run-latest")
    assert r.status_code == 409 and r.json()["running_job"] == jid
    with pytest.raises(nrt.RunnerBusy):                               # the lock also refuses a direct run
        j2 = nrt.create_job("nrt", "test2"); nrt.run_job(j2)
    t.join()


def test_fetch_failure_skips_later_stages_and_retry_resumes_from_fetch(env, monkeypatch):
    from purva_netra import nrt
    monkeypatch.setenv("PN_MOCK_FAIL", "fetch")
    jid, st = run_sync()
    ss = {s["name"]: s["status"] for s in nrt.stages(jid)}
    assert st == "failed" and ss["discover"] == "done" and ss["fetch"] == "failed"
    assert all(ss[n] == "skipped" for n in ["validate", "extract", "features", "inference", "explain", "publish"])
    assert "fetch" in nrt.job(jid)["error"] and nrt.job(jid)["traceback"]
    monkeypatch.delenv("PN_MOCK_FAIL")
    rid = nrt.retry_job(jid, "test")
    # retry was spawned as a subprocess by start_job; run inline instead for determinism
    st2 = nrt.run_job(rid) if nrt.job(rid)["status"] == "queued" else None
    deadline = time.time() + 60
    while nrt.job(rid)["status"] in ("queued", "running") and time.time() < deadline:
        time.sleep(0.5)
    r = nrt.job(rid)
    ss2 = {s["name"]: s["status"] for s in nrt.stages(rid)}
    assert r["status"] == "done" and r["attempt"] == 2
    assert ss2["discover"] == "reused" and ss2["fetch"] == "done" and ss2["publish"] == "done"


def test_atomic_publish_readers_never_see_partial_files(env):
    """Hammer the reader glob while publishing; every visible file must be complete and valid."""
    from purva_netra import nrt
    import duckdb
    stop, seen, bad = threading.Event(), [], []

    def reader():
        while not stop.is_set():
            for p in nrt.published_dir().glob("*.parquet") if nrt.published_dir().exists() else []:
                try:
                    n = duckdb.connect().execute(f"SELECT count(*) FROM '{p}'").fetchone()[0]
                    seen.append(n)
                    if n != 360:
                        bad.append(n)
                except Exception as e:           # a partial file would fail to parse
                    bad.append(repr(e))
    th = threading.Thread(target=reader); th.start()
    try:
        for _ in range(2):
            run_sync(force=True)
    finally:
        stop.set(); th.join()
    assert seen and not bad
    assert not list(nrt.published_dir().glob(".*part"))


def test_publish_validation_rejects_bad_frames(env):
    from purva_netra import nrt
    df = pd.DataFrame(dict(rid=list(range(36)) * 10, p_bust=0.1))
    nrt.validate_publish(df)                                          # 360 rows OK
    with pytest.raises(nrt.StageError):
        nrt.validate_publish(df.head(359))
    df2 = df.copy(); df2.loc[5, "p_bust"] = float("nan")
    with pytest.raises(nrt.StageError):
        nrt.validate_publish(df2)


# ---------------------------------------------------------------- drift, audit, offline
def test_drift_insufficient_below_200_verified(env):
    c = client("operator")
    d = c.get("/ops/drift").json()
    assert d["calibration"]["status"] == "insufficient"
    assert d["calibration"]["text"] == "Insufficient verified data (n = 0 / 200)"
    feats = {f["feature"]: f["status"] for f in d["features"]}
    assert feats["an_novelty"] == "not_in_model"                     # placeholder has no analog features


def test_every_control_writes_an_audit_row(env, monkeypatch):
    monkeypatch.setenv("PN_MOCK_DELAY", "0")
    from purva_netra.ops import db
    c = client("operator")
    before = len(db.rows("SELECT * FROM audit WHERE action NOT IN ('login','logout')"))
    for m, path in [("post", "/ops/run-latest"), ("post", "/ops/jobs/999/retry"), ("post", "/ops/refresh?init=2026-09-25T00"),
                    ("post", "/ops/verify")]:
        getattr(c, m)(path)
        time.sleep(0.2)
    rows_ = db.rows("SELECT action, result FROM audit WHERE action NOT IN ('login','logout') ORDER BY id")
    assert len(rows_) - before == 4
    assert {r["action"] for r in rows_} >= {"run-latest", "retry", "refresh", "verify"}
    for r in rows_:
        assert json.loads(r["result"])["status"] in (202, 400, 409)


def test_offline_nrt_disabled_status_loads(env, monkeypatch):
    monkeypatch.setenv("NRT_ENABLED", "false")
    monkeypatch.setenv("PN_MOCK_UNREACHABLE", "1")
    c = client("operator")
    s = c.get("/ops/status")
    assert s.status_code == 200
    j = s.json()
    assert j["controls"]["enabled"] is False and "NRT disabled" in j["controls"]["reason"]
    assert j["overall"]["state"] in ("Degraded", "Down") and "NRT disabled" in j["overall"]["reasons"]
    assert c.post("/ops/run-latest").status_code == 409


def test_upstream_unreachable_is_reported_not_crashing(env, monkeypatch):
    monkeypatch.setenv("PN_MOCK_UNREACHABLE", "1")
    jid, st = run_sync()
    from purva_netra import nrt
    assert st == "failed" and "Upstream unreachable" in nrt.job(jid)["error"]
    j = client("operator").get("/ops/status").json()
    assert j["data"]["upstream"]["status"] == "unreachable"
    assert "Upstream unreachable" in j["overall"]["reasons"]


def test_status_is_fast_and_never_claims_unrun_checks(env):
    c = client("operator")
    c.get("/ops/status")
    t = time.perf_counter(); j = c.get("/ops/status").json(); ms = (time.perf_counter() - t) * 1000
    assert ms < 200, ms
    comps = {x["name"]: x["status"] for x in j["pipeline"]["components"]}
    assert comps["Data ingestion"] == "unknown" and comps["Frontend"] == "not_monitored"   # nothing ran yet
    assert j["data"]["freshness"] == "unknown" and j["data"]["upstream"]["status"] == "unknown"
