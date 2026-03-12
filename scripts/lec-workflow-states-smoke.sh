#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lec-smoke-lib.sh"
load_lec_smoke_env

TEAM=${TEAM:-PCF}
NAME="Smoke State $(date +%s)"

echo "[workflow-states] create"
CREATE_OUT=$(./scripts/lec workflow-states create --team "$TEAM" --title "$NAME" --state "unstarted" --json)
ID=$(echo "$CREATE_OUT" | jq -r '.result.workflowStateId')
echo "id=$ID"

echo "[workflow-states] update"
./scripts/lec workflow-states update --id "$ID" --title "$NAME updated" --json | jq -r '.result.success'

echo "[workflow-states] archive"
./scripts/lec workflow-states archive --id "$ID" --json | jq -r '.result.success'

echo "WORKFLOW_STATES_OK"
