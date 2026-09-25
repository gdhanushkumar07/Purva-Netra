"""Operations state store: SQLite at data/ops/ops.db (WAL mode, one file, no server).

Tables (spec): cycles, jobs, stages, logs, health_checks, audit — plus `verifications`
(NRT predictions joined with IMD truth by the verify job). `init_db()` is idempotent and is
the migration entry point (`python -m purva_netra.ops.db`)."""
import json, os, sqlite3, time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from ..config import ROOT

STAGES = ["discover", "fetch", "validate", "extract", "features", "inference", "explain", "publish"]
SCHEMA_VERSION = 1

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS cycles(
  init TEXT PRIMARY KEY, source TEXT NOT NULL, discovered_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'discovered');          -- discovered|processing|published|failed
CREATE TABLE IF NOT EXISTS jobs(
  id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, init TEXT,
  status TEXT NOT NULL,                                 -- queued|running|done|failed|noop|cancelled
  started_at TEXT, finished_at TEXT, duration_s REAL, triggered_by TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1, error TEXT, traceback TEXT, pid INTEGER,
  params TEXT, source TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS jobs_init ON jobs(init);
CREATE TABLE IF NOT EXISTS stages(
  job_id INTEGER NOT NULL, name TEXT NOT NULL, ord INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',               -- pending|running|done|failed|skipped|reused
  started_at TEXT, finished_at TEXT, duration_s REAL, rows INTEGER, message TEXT,
  PRIMARY KEY(job_id, name));
CREATE TABLE IF NOT EXISTS logs(
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, ts TEXT NOT NULL,
  level TEXT NOT NULL, msg TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS logs_job ON logs(job_id, id);
CREATE TABLE IF NOT EXISTS health_checks(
  name TEXT PRIMARY KEY, status TEXT NOT NULL, value TEXT, checked_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT NOT NULL, action TEXT NOT NULL,
  params TEXT, result TEXT, ts TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS verifications(
  init TEXT NOT NULL, rid INTEGER NOT NULL, lead INTEGER NOT NULL, valid_date TEXT NOT NULL,
  p_bust REAL, f_rain REAL, o_rain REAL, log_err REAL, thr REAL, bust INTEGER, verified_at TEXT NOT NULL,
  PRIMARY KEY(init, rid, lead));
"""


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def db_path() -> Path:
    return Path(os.environ.get("PN_OPS_DB", ROOT / "data" / "ops" / "ops.db"))


_READY: set[str] = set()


def connect() -> sqlite3.Connection:
    p = db_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(p, timeout=10, isolation_level=None)   # autocommit; explicit BEGIN where needed
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA busy_timeout=10000")
    if str(p) not in _READY:                                     # schema is created lazily, once per file
        con.executescript(SCHEMA)
        _READY.add(str(p))
    return con


@contextmanager
def conn():
    c = connect()
    try:
        yield c
    finally:
        c.close()


def init_db():
    with conn() as c:
        c.executescript(SCHEMA)
        c.execute("INSERT OR REPLACE INTO meta VALUES('schema_version', ?)", (str(SCHEMA_VERSION),))
    return db_path()


def rows(sql, params=()):
    with conn() as c:
        return [dict(r) for r in c.execute(sql, params).fetchall()]


def one(sql, params=()):
    r = rows(sql, params)
    return r[0] if r else None


def execute(sql, params=()):
    with conn() as c:
        cur = c.execute(sql, params)
        return cur.lastrowid


def set_health(name: str, status: str, value=None):
    """status: ok|warn|fail|unknown|disabled. value: any JSON-serialisable detail."""
    execute("INSERT OR REPLACE INTO health_checks(name,status,value,checked_at) VALUES(?,?,?,?)",
            (name, status, json.dumps(value, default=str), now()))


def get_health(name: str):
    r = one("SELECT * FROM health_checks WHERE name=?", (name,))
    if r and r["value"]:
        r["value"] = json.loads(r["value"])
    return r


def audit(user: str, action: str, params=None, result=None):
    execute("INSERT INTO audit(user,action,params,result,ts) VALUES(?,?,?,?,?)",
            (user, action, json.dumps(params or {}, default=str), json.dumps(result, default=str), now()))


def log(job_id: int, level: str, msg: str):
    execute("INSERT INTO logs(job_id,ts,level,msg) VALUES(?,?,?,?)", (job_id, now(), level, msg))


if __name__ == "__main__":
    print("initialised", init_db())
