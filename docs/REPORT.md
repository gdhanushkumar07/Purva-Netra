# PURVA-NETRA — build report (2026-09-25)

## Summary

The whole product path works end to end on real data for July 2020: WeatherBench 2 extraction → IMD truth → labels → ensemble-spread baseline → Parquet replay store → API → Forecast Trust Console. It is tested (Python 20/20, Vitest 7/7, Playwright + axe 32/32).

**There is no measured skill vs B2 yet.** The 2018–2022 archive could not be extracted from the development laptop: the ENS needs ≈876 GB of chunk reads over a ≈1.8 MB/s link. The spec already puts that step on a cloud VM. Until it runs, the modelling pipeline refuses to produce evaluation numbers, the Trust Ledger says "No held-out evaluation yet", and the UI labels the model PLACEHOLDER.

## What works (verified)

| Item | Evidence |
| --- | --- |
| §3 access tests | T1 HRES ✅ (8 s/init), T2 ENS 50 members ✅ (105 s/init), T3 IMD 366×129×135 ✅, T4 36 IMD polygons ✅ (UTM 44N CRS mislabelled as 4326, fixed), T5 not attempted (Phase 2), T6 measured → `notebooks/00_access_tests.ipynb` |
| Masks and truth | 34/36 subdivisions have IMD land cells, and their weights sum to 1 on the IMD 0.25° and ENS 1.5° grids. IMD truth for 2018–2022 is built (62,084 region-days, no NaN). |
| Alignment sanity (§4.4) | Day-1 HRES vs IMD, July 2020: r = 0.81 (Kerala, Vidarbha and Assam plotted in `docs/sanity_day1.png`); r falls to 0.61 by Day 10 |
| Thin slice (July 2020, 62 inits) | Base rate 11.1% overall, 8.4–12.2% by lead (in-sample thresholds; plumbing only) |
| Leakage guards | Revision uses only earlier cycles (real + synthetic), FFI window ends at the current row, thresholds and climatologies come from train years only and don't move when test rows change, analogs never return same-year cases, shuffled labels have no skill |
| Pipeline code | Folds + LOYO, B0/B2/B2iso/B3, LightGBM + isotonic + q50/q90 heads, ablations A1–A7, gate, ledger and replay-store writer. The full fold runs on synthetic data (smoke test). |
| Verify tab | Heavy-rain contingency scores via `nwpeval` (POD/FAR/CSI/ETS); POD left blank when no event was observed, never invented |
| Web-app | All §13.4 screens, URL state, en/hi, dark mode, PWA, tour, Ctrl-K, export, phone field view. Axe: no serious/critical issues on 13 routes × 2 themes. |

## What failed or is incomplete

1. **Full-archive extraction (blocking).** Cause: bandwidth (T6). Fix: run `notebooks/01_extract_colab.ipynb` or `scripts/extract_loop.sh <start> <end>` per year on a GCP VM or Colab, copy `data/interim/{fcst,state}` back, then `make table pipeline`.
2. **No held-out skill numbers.** This follows from 1. No BSS, reliability, PR-AUC, ablations or gate decision have been computed, and none are claimed.
3. **Docker is untested.** Docker is not installed on the development machine, so the compose file and both Dockerfiles have not been built.
4. **`imdlib.get_data` hangs** on this network. The workaround uses the same official IMD endpoint via curl, with `imdlib` still reading the files. The data is identical.
5. **Hindi strings** are a first draft awaiting review by a native speaker.
6. **A stale API process once returned the old `/verify` shape and blanked the app**, and axe didn't notice because a blank page has no violations. Fixed with an error boundary per screen, and the e2e suite now asserts every route renders a heading and throws no page errors.
7. **Playwright's bundled Chromium** failed to download on this link, so the tests run on the installed Google Chrome (`PW_CHANNEL=chrome`).

## Measured skill vs B2

**Not available.** Evaluation requires 2018–2022 (train 2018–20, calibration 2021, test 2022). When it runs, the §9 gate (LOYO BSS vs B2, 95% lower bound > 0 for Day 3–10) is applied automatically. If the model fails the gate, B2 + isotonic + analog cards ship and the Trust Ledger states it.

## Open risks

- **The model may not beat B2.** Ensemble spread is a strong predictor. The code and UI are built so a negative result ships cleanly.
- **Label noise from time offsets.** 12 UTC windows end 9 h after the IMD day closes. A sensitivity check (00 UTC only) is cheap once the archive exists.
- **Small subdivisions** (Coastal Karnataka: 46 IMD cells; SHWB & Sikkim: 62) give noisy area means and may inflate bust rates in hilly terrain.
- **Rule detectors** (depression, WD) use fixed, untuned thresholds, and **regimes** have neutral names until someone reviews their composites.
- **ENS licence file** is absent in the WB2 `ifs_ens/` folder, so the terms are assumed to match HRES (ECMWF, CC BY 4.0) and need verifying.
- **Distribution shift to NCUM / NEPS-G.** Everything is trained on IFS.
