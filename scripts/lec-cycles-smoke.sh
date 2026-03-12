#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lec-smoke-lib.sh"
load_lec_smoke_env

echo "[cycles] list"
./scripts/lec cycles list --limit 3 --json | jq -r '.ok'

echo "CYCLES_OK"
