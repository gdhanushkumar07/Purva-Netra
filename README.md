# PURVA-NETRA · Forecast Trust Console

**Know when to trust the forecast.**

Smart India Hackathon 2026 · Problem Statement 26079 (MoES / NCMRWF) — *AI-Based Forecast Bust Detection for Medium-Range Weather Forecasts*.

PURVA-NETRA is a **forecast-trust layer, not a weather model**. For each of India's 36 IMD meteorological subdivisions and each lead day (Day 1–10) it gives:

- a calibrated probability that the rainfall forecast will **bust**
- a confidence band — High ✓ / Normal ○ / Reduced ▲ / Low ◆
- the expected error (q50 / q90), shown as the range of rain likely to be observed
- up to 3 plain-language reasons, from fixed templates only (English / हिन्दी)
- the 5 most similar past forecasts and how they went wrong

It ships as an installable, offline-capable web-app (PWA) backed by a small FastAPI service that replays precomputed Parquet predictions.

The build spec is [IMPLEMENTATION.md](IMPLEMENTATION.md).

---

## Status (2026-09-25) — read this first

| Area | State |
| --- | --- |
| §3 access tests | T1 HRES ✅ · T2 ENS (50 members) ✅ · T3 IMD ✅ · T4 IMD subdivisions ✅ · T5 TIGGE: Phase 2, not attempted · T6 timing measured (see below) |
| Region masks, IMD truth 2018–2022 | ✅ built. 34 of 36 subdivisions have IMD land cells. **A & N Islands and Lakshadweep have none, so they are shown as "Not assessed".** |
| Thin slice (July 2020) | ✅ extraction → join → labels → B2 → predictions Parquet → API → UI, end to end. **This is plumbing only: it is in-sample and not a skill claim.** It is labelled PLACEHOLDER in the UI. |
| Full archive 2018–2022 | ⛔ **Not extracted.** It needs a cloud VM (see *Why the full archive is not here yet*). |
| Model, held-out evaluation, gate §9 | Code complete and tested on synthetic data. **No held-out results exist yet.** `make pipeline` refuses to run on an incomplete archive. |
| Web-app | ✅ all screens. 31/31 Playwright tests pass, including axe on 13 routes × light/dark. |
| Docker | Files written (`purva-netra-api`, `purva-netra-web`). **Not built or tested: Docker is not installed on the development machine.** |

### Why the full archive is not here yet (T6)

The development laptop's link is ≈1.7–1.9 MB/s, and it runs at the same speed against Cloudflare and GCS, so the bottleneck is the local link. WB2's 1.5° ENS Zarr stores each chunk as one init × 50 members × 8 six-hourly leads × the whole globe (≈40 MB). India's Day 1–10 therefore needs 6 chunks, ≈240 MB per init, or ≈876 GB for 3,652 inits. That is ≈115 h of reads serially on this link. WB2 publishes no cheaper ENS layout: the 0.25° file is worse and the 64×32 file is too coarse. The spec (§2) already puts extraction on Colab or a GCP VM. `notebooks/01_extract_colab.ipynb` and `scripts/extract_loop.sh` do exactly that, and both are resumable.

---

## Quick start

```bash
make env                 # Python 3.12 venv (uv) + npm ci
make access              # §3 access tests → data/access_tests.json
make truth               # IMD rain 2018–2022 + subdivision masks + truth table
make forecasts START=2020-07-01 END=2020-07-31   # WB2 extraction (resumable; full period on a cloud VM)
make thinslice           # July-2020 plumbing slice → replay store
make test                # pytest: regions, timing, labels, leakage, pipeline smoke (20 tests)

# full pipeline once 2018–2022 forecasts (+ `make state`) are extracted:
make all                 # data → labels → features → models → evaluation → predictions

# run the console
.venv/bin/uvicorn api.main:app --port 8000
cd web && npx vite build && npx vite preview --port 5173     # http://localhost:5173
make e2e                 # Playwright + axe (uses installed Chrome: PW_CHANNEL=chrome)

docker compose up --build   # API :8000, web :5173 — offline (untested here, see Status)
```

## Data sources and licences

| Data | Source | Licence / terms |
| --- | --- | --- |
| ECMWF IFS HRES 0.25° and 1.5°, 2018–2022 | WeatherBench 2, `gs://weatherbench2/datasets/hres/…` (Rasp et al. 2024) | ECMWF data, **CC BY 4.0**, attribution to ECMWF required (bucket `datasets/hres/LICENSE`) |
| ECMWF IFS ENS 50 members, 1.5° | WeatherBench 2, `gs://weatherbench2/datasets/ifs_ens/…` | ECMWF data. No LICENSE file under `ifs_ens/` (HTTP 404). Assumed the same ECMWF terms as HRES. **VERIFY** |
| IMD 0.25° gridded daily rainfall | IMD Pune, `imdpune.gov.in/cmpg/Griddata/rainfall.php` (Pai et al. 2014), read with `imdlib` | IMD terms of use; cite IMD |
| IMD meteorological subdivisions | `mausam.imd.gov.in/imd_latest/contents/district_shapefiles/sd_boundary.json` | No licence stated; IMD cited as source |

## Method (short)

- **Regions and truth.** 36 IMD polygons. The file declares EPSG:4326 but its coordinates are UTM 44N, so the CRS is overridden. Weights are the fractional polygon mask × cos(lat) × IMD land cells. HRES 0.25° sits on the same grid points as IMD, so forecast and truth average over identical land cells. ENS 1.5° weights are the fine land weights aggregated conservatively.
- **Time alignment** is done in one place, `src/purva_netra/timing.py`: `valid_date = floor(init + lead)`. IMD's rain day ends 03 UTC, so 00 UTC forecast windows end 3 h early and 12 UTC windows end 9 h late.
- **Bust.** `log_err = |ln(1+F) − ln(1+O)|`. A forecast busts when `log_err` exceeds the training-year Q90 for (region, lead, day-of-year ±15 d) **and** |F − O| ≥ 5 mm.
- **Features.** Ensemble spread anomaly and friends, forecast-state anomalies (q850, u850, MSLP min; 1.5° HRES, because HRES has no TCWV), revision and the Flip-Flop Index (`scores`), regimes (PCA + k-means on the initial state) with low-pressure and western-disturbance rule detectors, and analog error memory (latitude-weighted EOFs via `xeofs`, BallTree, own year always excluded).
- **Models.** B0 (climatology) and B2 (logistic on spread anomaly + lead) as the spec requires. Also reported: B2iso (B2 + isotonic) and B3 (analog bust rate + isotonic). The main model is LightGBM, monotone in spread, early-stopped on the last 3 months of the training years, with isotonic calibration on 2021 and quantile heads for error q50/q90.
- **Splits.** Train 2018–2020, calibrate 2021, test 2022, plus leave-one-year-out. Thresholds, climatologies, regimes, the analog library and models are all refit inside each fold. Splits are by year, and CIs come from a whole-week block bootstrap.
- **Gate (§9).** The LightGBM model ships only if leave-one-year-out BSS vs B2 has a 95% lower bound > 0 for every Day 3–10. Otherwise B2 + isotonic + analog cards ship, and the Trust Ledger says so.
- **Ablations A1–A7.** The spec doesn't define them, so the definitions were frozen in `configs/ablations.yaml` before any result existed. The case list was frozen in `configs/cases.yaml` the same way.
- **Explanations.** Fixed template sentences (English and Hindi) ranked by TreeSHAP group contribution, or by fixed rules when B2 ships. No generated text.

### Choices worth knowing

- xeofs `EOF(solver="auto")` uses a randomized SVD, so `scores()` ≠ `transform()` (max diff 0.17 in a test). It is pinned to `solver="full"`, which agrees to 1e-14.
- `imdlib.get_data` hung on this network. The same official endpoint works with `curl -X POST -d rain=YYYY`, and `imdlib` still reads the files.
- The Reliability Matrix is an accessible HTML grid rather than an ECharts canvas: real focusable cells, arrow-key navigation, screen-reader labels, axe-checkable. All other charts use ECharts.

## Results

**There are no held-out results yet**, because the 2018–2022 archive is not extracted. Nothing below is a skill claim.

Thin-slice plumbing checks (July 2020, in-sample, 24–62 inits):

- Base rate of `bust`: 10.6% overall, 9.1–11.3% by lead (spec expects 8–10%, and the tests require 5–12%).
- Day-1 HRES vs IMD, land-only subdivision means: r = 0.84, falling to ≈0.60 by Day 10, with MAE rising from 5.3 to 8.1 mm. Units and valid-date alignment are consistent (`docs/sanity_day1.png`).

Once the archive exists, `make all` writes `data/processed/eval/results.json`, the Trust Ledger JSON and the replay store, and `notebooks/20_results.ipynb` renders BSS vs B0/B2 with CIs, reliability diagrams, ROC/PR-AUC for bust and hi_bust, pinball losses, ablations and case studies.

## Limitations

- **IFS, not NCUM.** Trained and evaluated on ECMWF IFS from WeatherBench 2. NCMRWF's NCUM / NEPS-G is the Phase 2 adapter (TIGGE), untested.
- **Five seasons.** 2018–2022: three training years, one calibration year, one test year.
- **3-h time offset.** 00 UTC windows end 3 h before IMD's 03 UTC day end (12 UTC windows: +9 h).
- **Land-only truth.** IMD gridded rain covers land only. A & N Islands and Lakshadweep are not assessed.
- **Replay only.** Near-real-time is Phase 2 and not built. The UI shows a REPLAY badge on every screen.
- The rule detectors (depression vorticity threshold, WD trough) use fixed defaults and are **not tuned** on labelled events. Regimes carry neutral names ("Regime A…") until someone reviews their composites. The Hindi strings are a first draft awaiting native-speaker review.

## Web-app (spec §13)

Screens: Briefing, Matrix, Map (day scrubber, layer switcher, split map), Region (Overview / Why / Evolution / Verify / History), Time Machine replay, Compare, Trust Ledger, Watchlist, Method and Settings. All view state lives in the URL. Also included: Ctrl-K palette, driver.js tour following the §18 run-sheet, English/Hindi, light/dark ("ops room"), texture option, PNG/PDF/text export, and in-app watchlist alerts. MapLibre draws the subdivision polygons only, with no basemap tiles, so it works fully offline.

**Colour validation.** The P(bust) diverging scale is centred on the 10% base rate. Each arm, in light and dark, was run through the dataviz palette validator: monotone lightness, one hue, step gaps ≥ 0.06. The light near-neutral steps sit under the 2:1 ordinal light-end floor by design, as heatmap steps that recede toward the surface; cells carry a hairline border plus text. The categorical proof-chart slots B0/B2/model pass CVD and normal-vision checks in both modes. Light-mode aqua is at 2.74:1, so that chart carries direct labels and a table view.

**§13.12 checklist.** ✅ colour never alone (icons, labels, texture) · ✅ keyboard reachable, visible focus · ✅ table view for every chart and the matrix · ✅ axe: no serious/critical issues on 13 routes × 2 themes · ✅ text contrast ≥ 4.5:1 (axe) · ✅ `prefers-reduced-motion` · ⛔ Hindi reviewed by a native speaker · ✅ Playwright: brief → matrix → region → why → export, and a full replay.

Screenshots: `docs/screens/` (`make screens`).

## §18 demo script (7 minutes; the in-app **Guided tour** follows it)

| Time | Screen | Presenter says / does |
| --- | --- | --- |
| 0:00 | Method | "Forecasts sometimes bust. NCMRWF asked: can we know *before* — which region, which day?" |
| 0:30 | Briefing | "What a forecaster sees at 8 am: regions flagged, the most uncertain day, the biggest changes since the last cycle." |
| 1:00 | Matrix → Map | Show the matrix, then press ▶ on the day scrubber to show where risk travels, Day 1 → 10. |
| 2:00 | Region → Why | Reasons in plain words; open the analog cards: "k of 5 similar past forecasts busted." |
| 3:00 | Evolution | "Here is how the forecast for this day changed across cycles." |
| 3:30 | Time Machine | Replay a case from the frozen list, advancing day by day: truth appears and the score ticker counts hits, misses and false alarms. |
| 5:00 | Trust Ledger | Skill vs lead for B0, B2 and our model with CIs, plus the reliability diagram. The gate verdict is stated plainly. |
| 6:00 | Export + phone | One-click PNG/PDF bulletin; the same region on a phone (PWA). |
| 6:30 | Method | Limitations and the path to NCMRWF (NEPS-G adapter). |

Fallback: a recorded video of the same flow. The app runs offline.

Until the full archive is processed, the demo runs on the July-2020 plumbing slice. The UI marks it **PLACEHOLDER**, the Trust Ledger shows "No held-out evaluation yet", and the only replay case available is *Assam and Bihar floods, July 2020*.

## Repository layout

```
purva-netra/
├── IMPLEMENTATION.md      spec          ├── api/main.py             FastAPI "PURVA-NETRA API"
├── configs/               base.yaml, cases.yaml (frozen), ablations.yaml (frozen), regions/
├── src/purva_netra/       config, regions, timing, extract_wb2, extract_state, truth_imd, table, labels,
│                          features, state_features, regimes, analogs, baselines, model, explain,
│                          evaluate, predict, pipeline
├── scripts/               access_tests.py, extract_loop.sh, thin_slice.py, make_notebooks.py
├── notebooks/             00_access_tests, 01_extract_colab, 10_eda_errors, 20_results
├── tests/                 test_regions, test_timing, test_labels, test_leakage, test_pipeline_smoke
├── web/                   React 18 + TS + Vite, shadcn/ui (Radix), Tailwind, MapLibre, ECharts, TanStack Query,
│                          Zustand, react-i18next, vite-plugin-pwa, driver.js, cmdk; tests/e2e (Playwright + axe)
├── docs/                  screens/, sanity_day1.png, REPORT.md
├── Dockerfile, web/Dockerfile, docker-compose.yml, Makefile
```

Attribution: contains modified ECMWF data (via WeatherBench 2) and IMD data.
