#!/usr/bin/env bash
set -euo pipefail
TEAM=${TEAM:-PCF}

source "$(dirname "$0")/lec-smoke-lib.sh"
load_lec_smoke_env

echo "[triage] list (state=Triage, exclude done/cancelled)"
./scripts/lec triage list --team "$TEAM" --limit 10 --exclude-done --exclude-cancelled --json | jq '.ok, .result.success, (.result.issues|length)'

echo "TRIAGE_OK"
