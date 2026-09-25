"""IMD subdivision polygons, fractional land-only area weights on the IMD / WB2 grids, area means."""
from pathlib import Path
import geopandas as gpd, numpy as np, regionmask, xarray as xr

from .config import load_config, ROOT

ZONE_NAMES = {"NORTH WEST INDIA": "NW", "CENTRAL INDIA": "Central",
              "EAST AND NORTH EAST INDIA": "East & NE", "SOUTH PENINSULA": "South"}
ISLANDS = {"LAKSHADWEEP", "A & N ISLAND"}
WEIGHTS_DIR = ROOT / "data" / "raw" / "weights"


def load_regions(src: str | None = None) -> gpd.GeoDataFrame:
    """36 IMD subdivisions in WGS84. The IMD file declares EPSG:4326 but stores UTM 44N metres (T4)."""
    cfg = load_config()
    out = Path(cfg["paths"]["regions"])
    if src is None and out.exists():
        return gpd.read_file(out)
    g = gpd.read_file(src or ROOT / "data/raw/sd_boundary_imd.json")
    if g.total_bounds[2] > 1000:  # metres, not degrees
        g = g.set_crs(32644, allow_override=True)
    g = g.to_crs(4326)
    g = g.rename(columns={"subdivisio": "name", "region_cod": "imd_region"})
    g = g.dissolve("name", aggfunc="first").reset_index()
    g["zone"] = [("Islands" if n in ISLANDS else ZONE_NAMES[z]) for n, z in zip(g.name, g.imd_region)]
    g = g.sort_values(["zone", "name"]).reset_index(drop=True)
    g["rid"] = range(len(g))
    g = g[["rid", "name", "zone", "imd_region", "STATE", "geometry"]]
    assert len(g) == 36, f"expected 36 subdivisions, got {len(g)}"
    out.parent.mkdir(parents=True, exist_ok=True)
    g.to_file(out, driver="GeoJSON")
    return g


def fallback_boxes(lat=(6, 38), lon=(66, 100), step=2.0):
    import shapely.geometry as sg
    rows = [dict(name=f"box_{a}_{b}", geometry=sg.box(b, a, b + step, a + step))
            for a in np.arange(*lat, step) for b in np.arange(*lon, step)]
    g = gpd.GeoDataFrame(rows, crs=4326); g["rid"] = range(len(g)); return g


def frac_mask(gdf, lat, lon) -> xr.DataArray:
    m = regionmask.from_geopandas(gdf, names="name", numbers="rid")
    return m.mask_3D_frac_approx(xr.Dataset(coords={"lat": lat, "lon": lon}), drop=False)


def imd_weights(gdf, imd_rain: xr.DataArray) -> xr.DataArray:
    """(region, lat, lon) weights on the IMD 0.25° grid: polygon fraction × cos(lat) × IMD land cell.
    Identical grid points to WB2 HRES 0.25°, so the same weights serve the forecast."""
    land = imd_rain.notnull().any("time")
    frac = frac_mask(gdf, imd_rain.lat.values, imd_rain.lon.values)
    w = frac * np.cos(np.deg2rad(frac.lat)) * land
    tot = w.sum(("lat", "lon"))
    return (w / tot.where(tot > 0)).fillna(0.0).rename("w_imd")


def _agg_matrix(fine: np.ndarray, coarse: np.ndarray, step: float) -> np.ndarray:
    """A[i, j] = share of fine cell i that falls in coarse cell j (cells whose centre sits on a
    coarse-cell edge are split 50/50)."""
    A = np.zeros((len(fine), len(coarse)))
    for i, x in enumerate(fine):
        for j, c in enumerate(coarse):
            d = abs(x - c)
            A[i, j] = 1.0 if d < step / 2 - 1e-6 else (0.5 if abs(d - step / 2) < 1e-6 else 0.0)
    return A


def coarse_weights(w_fine: xr.DataArray, lat_c: np.ndarray, lon_c: np.ndarray, step=1.5) -> xr.DataArray:
    """Conservatively aggregate fine land-only weights onto a coarse grid (e.g. WB2 ENS 1.5°)."""
    Alat = _agg_matrix(w_fine.lat.values, lat_c, step)
    Alon = _agg_matrix(w_fine.lon.values, lon_c, step)
    wc = np.einsum("rab,ai,bj->rij", w_fine.values, Alat, Alon)
    wc = wc / wc.sum(axis=(1, 2), keepdims=True).clip(1e-12)
    return xr.DataArray(wc, dims=("region", "lat", "lon"),
                        coords={"region": w_fine.region.values, "lat": lat_c, "lon": lon_c}, name="w_coarse")


def region_mean(da: xr.DataArray, w: xr.DataArray) -> xr.DataArray:
    if "latitude" in da.dims:
        da = da.rename({"latitude": "lat", "longitude": "lon"})
    da = da.sel(lat=w.lat, lon=w.lon, method="nearest", tolerance=1e-3)
    da = da.assign_coords(lat=w.lat.values, lon=w.lon.values)
    return (da.fillna(0) * w).sum(("lat", "lon"))


def build_weights(imd_rain: xr.DataArray) -> dict:
    """Build and cache the three weight arrays (IMD 0.25°, WB2 0.25° (= IMD), WB2 1.5°)."""
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    g = load_regions()
    w_imd = imd_weights(g, imd_rain)
    lat_c = np.arange(6.0, 39.0 + 1e-6, 1.5); lon_c = np.arange(66.0, 100.5 + 1e-6, 1.5)
    w_ens = coarse_weights(w_imd, lat_c, lon_c)
    w_imd.to_netcdf(WEIGHTS_DIR / "w_imd.nc"); w_ens.to_netcdf(WEIGHTS_DIR / "w_ens.nc")
    return dict(imd=w_imd, hres=w_imd, ens=w_ens)


def load_weights() -> dict:
    w_imd = xr.open_dataarray(WEIGHTS_DIR / "w_imd.nc").load()
    return dict(imd=w_imd, hres=w_imd, ens=xr.open_dataarray(WEIGHTS_DIR / "w_ens.nc").load())
