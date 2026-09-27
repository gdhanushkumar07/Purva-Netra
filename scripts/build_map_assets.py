"""Derive display-only map assets from the EXISTING IMD subdivision GeoJSON (no new datasets):

  web/public/geo/adjacency.json      rid → neighbouring rids (shared boundary, 0.02° tolerance for the
                                      simplified web polygons) — used only to group adjacent elevated-risk
                                      subdivisions into a "risk footprint" view
  web/public/geo/india_outline.geojson  dissolved outer boundary (Light/Dark basemap context)

Usage: .venv/bin/python scripts/build_map_assets.py
"""
import json
from pathlib import Path
import geopandas as gpd

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "web" / "public" / "geo" / "imd_subdivisions.geojson"
g = gpd.read_file(SRC)
buf = g.geometry.buffer(0.02)                       # tolerate slivers from simplification
adj = {int(r): sorted(int(o) for o, og in zip(g.rid, buf) if o != r and bg.intersects(og))
       for r, bg in zip(g.rid, buf)}
(SRC.parent / "adjacency.json").write_text(json.dumps(adj))
outline = gpd.GeoDataFrame(geometry=[g.geometry.buffer(0.01).union_all().buffer(-0.01).simplify(0.03)], crs=g.crs)
outline.to_file(SRC.parent / "india_outline.geojson", driver="GeoJSON", COORDINATE_PRECISION=3)
print("adjacency:", sum(len(v) for v in adj.values()) // 2, "shared boundaries;",
      "isolated:", [int(r) for r, v in adj.items() if not v])
