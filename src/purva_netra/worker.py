"""purva-netra-worker: APScheduler loop for the NRT pipeline (separate process / container).

  * every 30 min  — poll ECMWF open data (Client.latest); run the pipeline for a new 00/12 UTC cycle
  * daily 06:30 UTC — verify: join published predictions with IMD real-time rain (imdlib)
  * every 60 s    — heartbeat; every 10 min — disk usage of data/
NRT_ENABLED=false keeps the worker alive (heartbeat + 'NRT disabled' health) but runs nothing —
the offline SIH demo mode.
"""
import os, shutil, subprocess, time
from apscheduler.schedulers.blocking import BlockingScheduler

from .config import ROOT
from .ops import db
from . import nrt


def heartbeat():
    db.set_health("worker", "ok", dict(nrt_enabled=nrt.nrt_enabled(), pid=os.getpid(),
                                       upstream=nrt.get_upstream().name))


def disk():
    data = ROOT / "data"
    try:
        out = subprocess.run(["du", "-sk", str(data)], capture_output=True, text=True, timeout=120).stdout.split()[0]
        used_gb = int(out) / 1024 / 1024
    except Exception:
        used_gb = None
    tot = shutil.disk_usage(data)
    db.set_health("disk", "ok" if tot.free / tot.total > 0.1 else "warn",
                  dict(data_gb=None if used_gb is None else round(used_gb, 2), free_gb=round(tot.free / 1e9, 1),
                       total_gb=round(tot.total / 1e9, 1)))


def poll():
    if not nrt.nrt_enabled():
        db.set_health("upstream_latest", "disabled", dict(note="NRT disabled (NRT_ENABLED=false)"))
        return
    try:
        latest = nrt.get_upstream().latest()
        db.set_health("upstream_latest", "ok", dict(init=str(latest), source=nrt.get_upstream().name))
    except nrt.UpstreamUnreachable as e:
        db.set_health("upstream_latest", "fail", dict(error=str(e), source=nrt.get_upstream().name))
        return
    cyc = db.one("SELECT status FROM cycles WHERE init=?", (str(latest),))
    if cyc and cyc["status"] == "published":
        return
    try:
        jid = nrt.start_job("nrt", "scheduler", init=latest, spawn=False)
        nrt.run_job(jid)
    except nrt.RunnerBusy:
        pass


def verify():
    if nrt.nrt_enabled():
        try:
            nrt.run_job(nrt.start_job("verify", "scheduler", spawn=False))
        except nrt.RunnerBusy:
            pass


def main():
    db.init_db()
    heartbeat(); disk()
    s = BlockingScheduler(timezone="UTC")
    s.add_job(heartbeat, "interval", seconds=60)
    s.add_job(disk, "interval", minutes=10)
    s.add_job(poll, "interval", minutes=int(os.environ.get("PN_POLL_MIN", 30)), next_run_time=None if not nrt.nrt_enabled() else __import__("datetime").datetime.now())
    s.add_job(verify, "cron", hour=6, minute=30)
    print("purva-netra-worker started; NRT_ENABLED =", nrt.nrt_enabled(), "upstream =", nrt.get_upstream().name, flush=True)
    s.start()


if __name__ == "__main__":
    main()
