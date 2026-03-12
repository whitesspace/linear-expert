#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lec-smoke-lib.sh"
load_lec_smoke_env

TEAM=${TEAM:-PCF}
PROJECT_NAME="Smoke Project $(date +%s)"

echo "[project-updates] create project"
PROJECT_OUT=$(./scripts/lec project create --team "$TEAM" --title "$PROJECT_NAME" --description "created by smoke" --json)
PROJECT_ID=$(echo "$PROJECT_OUT" | jq -r '.result.project.id')
echo "projectId=$PROJECT_ID"

echo "[project-updates] create"
CREATE_OUT=$(./scripts/lec project-updates create --team "$TEAM" --project "$PROJECT_ID" --body "created by smoke" --status "onTrack" --json)
ID=$(echo "$CREATE_OUT" | jq -r '.result.projectUpdateId')
echo "id=$ID"

echo "[project-updates] update"
./scripts/lec project-updates update --id "$ID" --body "updated by smoke" --status "atRisk" --json | jq -r '.result.success'

echo "[project-updates] delete"
./scripts/lec project-updates delete --id "$ID" --json | jq -r '.result.success'

echo "[project-updates] unarchive"
./scripts/lec project-updates unarchive --id "$ID" --json | jq -r '.result.success'

echo "[project-updates] cleanup project"
./scripts/lec project delete --team "$TEAM" --project "$PROJECT_ID" --json | jq -r '.result.success'

echo "PROJECT_UPDATES_OK"
