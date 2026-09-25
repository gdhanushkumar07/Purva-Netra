import numpy as np, pytest
from purva_netra.regions import load_regions, load_weights

NO_LAND = {"A & N ISLAND", "LAKSHADWEEP"}   # no IMD 0.25° land cells (documented limitation)


@pytest.fixture(scope="module")
def g():
    return load_regions()


@pytest.fixture(scope="module")
def W():
    return load_weights()


def test_36_subdivisions(g):
    assert len(g) == 36 and g.rid.tolist() == list(range(36))
    minx, miny, maxx, maxy = g.total_bounds
    assert 66 < minx < 70 and 5 < miny < 8 and 96 < maxx < 99 and 35 < maxy < 38   # WGS84 over India


@pytest.mark.parametrize("grid", ["imd", "ens"])
def test_weights_sum_to_one(g, W, grid):
    s = W[grid].sum(("lat", "lon")).to_series()
    for rid, name in zip(g.rid, g.name):
        if name in NO_LAND:
            assert s[rid] == 0
        else:
            assert abs(s[rid] - 1) < 1e-6, name


def test_kerala_centroid_in_kerala_mask(g, W):
    k = g[g.name == "KERALA"].iloc[0]
    c = k.geometry.representative_point()
    w = W["imd"].sel(region=k.rid).sel(lat=c.y, lon=c.x, method="nearest")
    assert float(w) > 0
    others = W["imd"].sel(lat=c.y, lon=c.x, method="nearest").drop_sel(region=k.rid)
    assert float(others.max()) < float(w)
