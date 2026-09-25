#!/usr/bin/env bash
# Isolated NEAR-REAL-TIME stack with the SYNTHETIC mock upstream (tests / offline demo):
# API :8001 (PN_MODE=nrt, temp ops.db + NRT dir) and web preview :5174 → proxies /api to :8001.
set -eu
cd "$(dirname "$0")/.."
D=${PN_DEMO_DIR:-data/demo-nrt}
rm -rf "$D"; mkdir -p "$D"
export PN_MODE=nrt PN_UPSTREAM=mock PN_OPS_DB="$PWD/$D/ops.db" PN_NRT_DIR="$PWD/$D/nrt" NRT_ENABLED=${NRT_ENABLED:-true}
export PN_MOCK_DELAY=${PN_MOCK_DELAY:-2} PN_MOCK_UNREACHABLE=${PN_MOCK_UNREACHABLE:-}
nohup .venv/bin/uvicorn api.main:app --port 8001 > logs/api-nrt.log 2>&1 &
(cd web && PN_API=http://localhost:8001 nohup npx vite preview --port 5174 --strictPort > ../logs/web-nrt.log 2>&1 &)
echo "NRT demo stack: http://localhost:5174 (API :8001, data in $D)"
