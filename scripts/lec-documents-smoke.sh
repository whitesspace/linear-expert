#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lec-smoke-lib.sh"
load_lec_smoke_env

NAME="Smoke Doc $(date +%s)"

echo "[documents] create"
CREATE_OUT=$(./scripts/lec documents create --title "$NAME" --body "created by smoke" --json)
ID=$(echo "$CREATE_OUT" | jq -r '.result.documentId')
echo "id=$ID"

echo "[documents] update"
./scripts/lec documents update --id "$ID" --body "updated by smoke" --json | jq -r '.result.success'

echo "[documents] delete"
./scripts/lec documents delete --id "$ID" --json | jq -r '.result.success'

echo "[documents] unarchive"
./scripts/lec documents unarchive --id "$ID" --json | jq -r '.result.success'

echo "DOCUMENTS_OK"
