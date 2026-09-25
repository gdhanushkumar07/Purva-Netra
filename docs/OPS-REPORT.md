# Operations console and NRT: short report (2026-09-25)

## What is live
- **The job runner against real ECMWF Open Data.** discover → fetch → validate → extract → features → inference → explain → publish runs on real IFS HRES + 50-member ENS `tp` from the ECMWF Open Data mirrors (`ecmwf-opendata`), cropped to the IMD land grid. Real-run history is in `data/ops/ops.db`, jobs 1–3:
  - Job 1 failed at `fetch`: open data has no control member (`cf`) for `tp`. Fix: use the 50 perturbed members, which is also what training used.
  - Job 2 was a retry that resumed at `fetch`. It failed with AWS S3 **503 "Slow Down"** (ECMWF limits connections; the direct portal had also answered 429s).
  - Job 3 was a retry through the Azure mirror (`PN_ECMWF_SOURCE=azure`) and **succeeded end to end on real data**: cycle **12 UTC 24 Sep 2026**, fetch 32 min (35.6 MB of cropped fields, 50 members × 10 leads), then validate, extract, features, inference, explain and publish, 360 rows published atomically in `data/nrt/published/2026092412.parquet`.
  - Sanity check: Day-1 HRES averages 12.8 mm across regions (ensemble mean 13.1, maximum 70.8 mm), spread averages 0.79× normal, and mean P(bust) by lead is 7–10%.
  - The probabilities come from the **placeholder** model. The ECMWF data is real; the trust estimates are not a skill claim.
- **The state store, locking, idempotency, resume-on-retry, atomic publish, audit and roles.** These are real code paths, exercised by 16 pytest tests and the Playwright NRT project.
- **API metrics.** p50, p95 and error rate over the last hour are measured by the request-timing middleware; `/ops/status` takes about 10–30 ms warm (budget 200 ms).
- **Frontend health.** Each browser posts its build version every 2 min, and the API compares it with its own. With no heartbeat the status reads "Not monitored".

## What is simulated (and labelled)
- **`PN_UPSTREAM=mock`** generates **SYNTHETIC** fields for tests and the offline demo. Every cycle it produces carries `source = mock`; the top bar says `MOCK UPSTREAM` and `/ops` says `(SYNTHETIC)`. Its PSI drift warnings (spread 6.4, f_rain 0.37) are real computations. They correctly show that synthetic data doesn't look like July 2020.
- **The model is the placeholder.** NRT inference runs the July-2020 **in-sample** B2 bundle (`thinslice-b2-2020-07`), labelled PLACEHOLDER everywhere. No trained 2018–2020 model exists, because the archive isn't extracted.

## Known gaps
- **No held-out model.** So "Test 2022: BSS vs B2" is "Not available", and calibration drift can't be compared (insufficient verified data, then no test CI).
- **ECMWF throttling.** From this network, ENS downloads hit 429 and S3 503s. A production deployment should run the worker close to a mirror, and may need to fetch fewer byte ranges per request.
- **IMD real-time truth (`verify`)** is implemented via `imdlib.get_real_data` with a timeout, but it hasn't been exercised end to end here: no NRT cycle is old enough to have truth yet. Recall that `imdlib`'s downloader hung on this network for the archive, so the verify job may need the same curl fallback.
- **The worker** was run only in unit form (imports, scheduling functions). It was not left running as a daemon. The NRT test stack deliberately runs without it, so the console truthfully shows "Worker unknown".
- **Docker** (api + worker + web) is written but has never been built: Docker isn't installed here.
- **The frontend heartbeat** proves that a client is alive and on the matching build, not that every screen works. Playwright covers the screens.
- **Hindi.** The Ops console and login strings are English-only. The nav label is translated, and the new forecast-screen strings (DNA, Evolution) are in both languages. The Hindi still needs review by a native speaker.
- **SSO/OIDC** is a hook only. Sessions are HS256 JWTs with the secret in `data/ops/session.key` (or `PN_SECRET`).

## Test output
In `docs/test-output/`:
- `pytest.txt`: 36 passed (16 ops)
- `vitest.txt`: 18 passed
- `playwright.txt`: replay 53, nrt 5, offline 2, all passed

Measured UI performance: lens switch ≈ 12–21 ms, day change ≈ 6–16 ms, cycle switch ≈ 17–23 ms.
