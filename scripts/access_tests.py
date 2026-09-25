"""§3 access tests T1–T6. Prints pass/fail with measured sizes and timings; writes data/access_tests.json."""
import json, time, sys
import numpy as np, xarray as xr

SO = {"token": "anon"}
HRES = "gs://weatherbench2/datasets/hres/2016-2022-0012-1440x721.zarr"
ENS = "gs://weatherbench2/datasets/ifs_ens/2018-2022-240x121_equiangular_with_poles_conservative.zarr"
SD_URL = "https://mausam.imd.gov.in/imd_latest/contents/district_shapefiles/sd_boundary.json"
GIST = "https://gist.githubusercontent.com/planemad/d347ad7485344fb0ba4b470721825427/raw"
res = {}
which = sys.argv[1:] or ["T1", "T2", "T3", "T4", "T5", "T6"]


def box(da):
    return da.sortby("latitude").sel(latitude=slice(0, 40), longitude=slice(50, 100))


if "T1" in which:
    try:
        t0 = time.time()
        hres = xr.open_zarr(HRES, storage_options=SO)
        t_open = time.time() - t0
        v = hres["total_precipitation_24hr"]
        x = box(v.sel(time="2020-07-15T00", prediction_timedelta="5D")).load()
        dt = time.time() - t0
        ok = x.size > 0 and float(x.max()) < 1.0  # metres: a daily max < 1 m
        res["T1"] = dict(ok=bool(ok), shape=list(x.shape), open_s=round(t_open, 1), total_s=round(dt, 1),
                         units=v.attrs.get("units"), max_value=float(x.max()), mean_value=float(x.mean()),
                         chunks={k: v.encoding.get("chunks") for k in ["x"]}["x"],
                         dims=list(v.dims), n_time=int(hres.sizes["time"]),
                         leads=[str(l) for l in hres.prediction_timedelta.values[:3]] + ["..."],
                         vars=sorted(hres.data_vars))
        print("T1 HRES", "PASS" if ok else "FAIL", res["T1"])
    except Exception as e:
        res["T1"] = dict(ok=False, error=repr(e)); print("T1 FAIL", e)

if "T2" in which:
    try:
        t0 = time.time()
        ens = xr.open_zarr(ENS, storage_options=SO)
        v = ens["total_precipitation_24hr"]
        e = box(v.sel(time="2020-07-15T00", prediction_timedelta="5D")).load()
        dt = time.time() - t0
        ok = int(e.sizes.get("number", 0)) == 50
        res["T2"] = dict(ok=ok, sizes=dict(e.sizes), total_s=round(dt, 1), units=v.attrs.get("units"),
                         chunks=v.encoding.get("chunks"), dims=list(v.dims), vars=sorted(ens.data_vars),
                         time_range=[str(ens.time.values[0]), str(ens.time.values[-1])], n_time=int(ens.sizes["time"]))
        print("T2 ENS", "PASS" if ok else "FAIL", res["T2"])
    except Exception as e:
        res["T2"] = dict(ok=False, error=repr(e)); print("T2 FAIL", e)

if "T3" in which:
    try:
        import imdlib as imd
        t0 = time.time()
        imd.get_data("rain", 2020, 2020, fn_format="yearwise", file_dir="data/raw/imd")
        t_dl = time.time() - t0
        r = imd.open_data("rain", 2020, 2020, "yearwise", "data/raw/imd").get_xarray()
        s = dict(r.sizes)
        rain = r["rain"].where(r["rain"] >= 0)
        ok = s.get("time") == 366 and s.get("lat") == 129 and s.get("lon") == 135
        res["T3"] = dict(ok=ok, sizes=s, download_s=round(t_dl, 1), lat=[float(r.lat.min()), float(r.lat.max())],
                         lon=[float(r.lon.min()), float(r.lon.max())], land_cells=int(rain.isel(time=200).notnull().sum()),
                         jul15_india_mean_mm=float(rain.sel(time="2020-07-15").mean()))
        print("T3 IMD", "PASS" if ok else "FAIL", res["T3"])
    except Exception as e:
        res["T3"] = dict(ok=False, error=repr(e)); print("T3 FAIL", e)

if "T4" in which:
    import geopandas as gpd, urllib.request
    out = {}
    for label, url in [("imd", SD_URL), ("gist", GIST)]:
        try:
            t0 = time.time()
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            raw = urllib.request.urlopen(req, timeout=60).read()
            open(f"data/raw/sd_boundary_{label}.json", "wb").write(raw)
            g = gpd.read_file(f"data/raw/sd_boundary_{label}.json")
            out[label] = dict(ok=True, bytes=len(raw), n=len(g), crs=str(g.crs), cols=list(g.columns),
                              bounds=[round(b, 2) for b in g.total_bounds], s=round(time.time() - t0, 1))
        except Exception as e:
            out[label] = dict(ok=False, error=repr(e))
        print("T4", label, out[label])
    res["T4"] = out

if "T5" in which:
    # Phase 2 only. We only record whether the ECMWF Data Store TIGGE endpoint is reachable; no retrieval without credentials.
    import urllib.request
    try:
        req = urllib.request.Request("https://apps.ecmwf.int/datasets/data/tigge/", headers={"User-Agent": "Mozilla/5.0"})
        code = urllib.request.urlopen(req, timeout=30).status
        res["T5"] = dict(ok=None, note="Phase 2 only; endpoint reachable (HTTP %s); retrieval needs ECMWF account - not attempted" % code)
    except Exception as e:
        res["T5"] = dict(ok=None, note="Phase 2 only; not attempted", probe_error=repr(e))
    print("T5", res["T5"])

if "T6" in which:
    try:
        hres = xr.open_zarr(HRES, storage_options=SO); ens = xr.open_zarr(ENS, storage_options=SO)
        leads = np.array([np.timedelta64(d, "D") for d in range(1, 11)])
        t0 = time.time()
        a = box(hres["total_precipitation_24hr"].sel(time="2020-07-16T00", prediction_timedelta=leads)).load()
        th = time.time() - t0
        t0 = time.time()
        b = box(ens["total_precipitation_24hr"].sel(time="2020-07-16T00", prediction_timedelta=leads)).load()
        te = time.time() - t0
        n_inits = 5 * 365 * 2
        res["T6"] = dict(ok=True, hres_s_per_init_10leads=round(th, 2), ens_s_per_init_10leads=round(te, 2),
                         hres_MB=round(a.nbytes / 1e6, 2), ens_MB=round(b.nbytes / 1e6, 2),
                         est_hours_2018_2022_serial=round(n_inits * (th + te) / 3600, 1))
        print("T6 timing", res["T6"])
    except Exception as e:
        res["T6"] = dict(ok=False, error=repr(e)); print("T6 FAIL", e)

try:
    prev = json.load(open("data/access_tests.json"))
except Exception:
    prev = {}
prev.update(res)
json.dump(prev, open("data/access_tests.json", "w"), indent=1, default=str)
