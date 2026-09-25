# PURVA-NETRA — `make all` rebuilds data → labels → features → models → predictions.
PY ?= .venv/bin/python
START ?= 2018-01-01
END   ?= 2022-12-31

.PHONY: all env access data forecasts state truth table pipeline thinslice test e2e web up screens

all: data pipeline

env:
	uv venv --python 3.12 .venv && uv pip install --python $(PY) -e .
	cd web && npm ci

access:             ## §3 access tests T1–T6
	$(PY) scripts/access_tests.py

data: truth forecasts state table

truth:              ## IMD 0.25° rain 2018–2022 (curl: imdlib's downloader hangs on some networks) → subdivision means
	for y in 2018 2019 2020 2021 2022; do [ -s data/raw/imd/rain/$$y.grd ] || curl -sS -A "Mozilla/5.0" -X POST -d "rain=$$y" \
	  https://imdpune.gov.in/cmpg/Griddata/rainfall.php -o data/raw/imd/rain/$$y.grd; done
	$(PY) -c "from purva_netra.regions import load_regions; load_regions('data/raw/sd_boundary_imd.json')"
	$(PY) -m purva_netra.truth_imd

forecasts:          ## WB2 HRES + ENS → per-init Parquet (resumable; run on a cloud VM for the full period)
	scripts/extract_loop.sh $(START) $(END)

state:              ## WB2 HRES 1.5° state fields → per-init npz (resumable)
	$(PY) -W ignore -m purva_netra.extract_state $(START) $(END)

table:
	$(PY) -m purva_netra.pipeline table

pipeline:           ## labels → features → models → evaluation → predictions (refuses on an incomplete archive)
	$(PY) -W ignore -m purva_netra.pipeline all

thinslice:          ## July 2020 plumbing slice (in-sample; not a skill claim)
	$(PY) -W ignore scripts/thin_slice.py

test:
	$(PY) -m pytest -q -W ignore

e2e:                ## needs API on :8000 and `npm run preview` on :5173
	cd web && npx playwright test

web:
	cd web && npx vite build

up:
	docker compose up --build

screens:
	cd web && node tests/screens.mjs ../docs/screens
