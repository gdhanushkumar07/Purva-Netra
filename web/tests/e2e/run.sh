#!/usr/bin/env bash
# Runs all three Playwright projects against their stacks. Assumes the REPLAY stack is up
# (API on PN_API, default :8010, + `PN_API=http://localhost:8010 npx vite preview --port 5173`).
# Starts/stops the NRT stacks itself on :${PN_NRT_API_PORT:-8011} + :5174 (never touches other ports).
set -u
cd "$(dirname "$0")/../.."          # web/
ROOT=..
fail=0
npx playwright test --project=replay || fail=1
stop() { pkill -f "uvicorn api.main:app --port ${PN_NRT_API_PORT:-8011}" ; pkill -f "vite preview --port 5174" ; sleep 1; }
stop; (cd $ROOT && PN_DEMO_DIR=data/demo-nrt scripts/nrt_demo_stack.sh); sleep 6
npx playwright test --project=nrt || fail=1
stop; (cd $ROOT && NRT_ENABLED=false PN_MOCK_UNREACHABLE=1 PN_DEMO_DIR=data/demo-nrt-offline scripts/nrt_demo_stack.sh); sleep 6
npx playwright test --project=offline || fail=1
stop
exit $fail
