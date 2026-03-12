#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lec-smoke-lib.sh"
load_lec_smoke_env

NAME="Smoke Customer $(date +%s)"

echo "[customers] create"
CREATE_OUT=$(./scripts/lec customers create --title "$NAME" --domain "smoke.example.com" --size 10 --json)
ID=$(echo "$CREATE_OUT" | jq -r '.result.customerId')
echo "id=$ID"

echo "[customers] update"
./scripts/lec customers update --id "$ID" --domain "updated.smoke.example.com" --json | jq -r '.result.success'

echo "[customers] delete"
./scripts/lec customers delete --id "$ID" --json | jq -r '.result.success'

echo "CUSTOMERS_OK"
