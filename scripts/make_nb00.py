import nbformat as nbf
nb = nbf.v4.new_notebook()
C, M = nbf.v4.new_code_cell, nbf.v4.new_markdown_cell
nb.cells = [
 M("# 00 · Access tests (spec §3)\nT1–T6 as specified. The live code is `scripts/access_tests.py`; set `RUN_LIVE=True` to re-run it "
   "(≈10 min + downloads). With `RUN_LIVE=False` this notebook shows the measurements recorded by that script on **2026-09-25** "
   "from the development laptop (link ≈1.7 MB/s, measured against speed.cloudflare.com)."),
 C("RUN_LIVE = False\nimport json, subprocess, sys, pandas as pd\nif RUN_LIVE:\n    subprocess.run([sys.executable, '../scripts/access_tests.py'], cwd='..', check=True)\nres = json.load(open('../data/access_tests.json'))\nlist(res)"),
 M("## Summary"),
 C("rows = []\nfor k in ['T1','T2','T3','T5','T6']:\n    r = res[k]; rows.append(dict(test=k, ok=r.get('ok'), detail={kk: vv for kk, vv in r.items() if kk not in ('ok','vars','leads')}))\nrows.append(dict(test='T4', ok=res['T4']['imd']['ok'], detail=res['T4']['imd']))\npd.set_option('display.max_colwidth', 300)\npd.DataFrame(rows)"),
 M("## Findings\n"
   "* **T1** HRES: `total_precipitation_24hr` in metres (no `units` attr); chunk = one global field per (init, lead). No `total_column_water_vapour` → state features use `specific_humidity` 850 hPa.\n"
   "* **T2** ENS 1.5°: 50 members, 2018-01-01 → 2022-12-31T12. Chunk = (1 init, 50 members, 8 × 6-h leads, global) ≈ 40 MB → Day 1–10 needs 6 chunks ≈ 240 MB per init.\n"
   "* **T3** IMD: `imdlib.get_data` hung on this network (requests over NAT64); the same official endpoint works with `curl -X POST -d rain=YYYY`. `imdlib.open_data` reads the files.\n"
   "* **T4** IMD `sd_boundary.json`: 36 polygons; declares EPSG:4326 but coordinates are UTM 44N metres → `set_crs(32644, allow_override=True)`. A & N Islands and Lakshadweep have **no IMD land cells** → no truth.\n"
   "* **T5** Phase 2 only, not attempted.\n"
   "* **T6** HRES ≈ 8 s/init, ENS ≈ 105 s/init at ≈1.9 MB/s. Full 2018–2022 (3 652 inits) ≈ 876 GB ENS reads ≈ 115 h serial on this link → full extraction must run on Colab / a GCP VM (spec §2)."),
]
nbf.write(nb, "notebooks/00_access_tests.ipynb")
