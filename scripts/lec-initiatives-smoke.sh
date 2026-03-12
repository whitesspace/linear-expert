#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lec-smoke-lib.sh"
load_lec_smoke_env

echo "[initiatives] create"
CREATE_OUT=$(./scripts/lec initiatives create --title "Smoke Initiative $(date +%s)" --description "created by smoke" --json)
ID=$(echo "$CREATE_OUT" | jq -r '.result.initiativeId')
echo "id=$ID"

echo "[initiatives] update"
./scripts/lec initiatives update --id "$ID" --description "updated by smoke" --json | jq -r '.result.success'

echo "[initiatives] archive"
./scripts/lec initiatives archive --id "$ID" --json | jq -r '.result.success'

echo "INITIATIVES_OK"
