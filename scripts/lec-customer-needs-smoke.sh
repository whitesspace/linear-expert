#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lec-smoke-lib.sh"
load_lec_smoke_env

CUSTOMER_NAME="Smoke Need Customer $(date +%s)"

echo "[customer-needs] create customer"
CUSTOMER_OUT=$(./scripts/lec customers create --title "$CUSTOMER_NAME" --domain "need.smoke.example.com" --json)
CUSTOMER_ID=$(echo "$CUSTOMER_OUT" | jq -r '.result.customerId')
echo "customerId=$CUSTOMER_ID"

echo "[customer-needs] create"
CREATE_OUT=$(./scripts/lec customer-needs create --body "created by smoke" --customer "$CUSTOMER_ID" --json)
ID=$(echo "$CREATE_OUT" | jq -r '.result.customerNeedId')
echo "id=$ID"

echo "[customer-needs] update"
./scripts/lec customer-needs update --id "$ID" --body "updated by smoke" --json | jq -r '.result.success'

echo "[customer-needs] delete"
./scripts/lec customer-needs delete --id "$ID" --json | jq -r '.result.success'

echo "[customer-needs] unarchive"
./scripts/lec customer-needs unarchive --id "$ID" --json | jq -r '.result.success'

echo "[customer-needs] cleanup customer"
./scripts/lec customers delete --id "$CUSTOMER_ID" --json | jq -r '.result.success'

echo "CUSTOMER_NEEDS_OK"
