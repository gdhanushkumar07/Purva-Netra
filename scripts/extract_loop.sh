#!/usr/bin/env bash
# Resumable extraction with restarts: re-runs until every init in [start, end] has a Parquet.
# usage: scripts/extract_loop.sh 2020-07-01 2020-07-31
set -u
cd "$(dirname "$0")/.."
for i in $(seq 1 50); do
  .venv/bin/python -W ignore -m purva_netra.extract_wb2 "$1" "$2" && break
  echo "extract exited non-zero; restart $i" ; sleep 10
done
