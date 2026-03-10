#!/usr/bin/env bash
set -euo pipefail

set -a; source ~/.openclaw/keys/.env; set +a

NAME="SmokeLabel $(date +%s)"

echo "[labels] create"
ID=$(./scripts/lec labels create --title "$NAME" --description "created by smoke" --json | jq -r '.result.labelId')
echo "id=$ID"

echo "[labels] update"
./scripts/lec labels update --id "$ID" --description "updated by smoke" --json | jq -r '.result.success'

echo "[labels] retire"
./scripts/lec labels retire --id "$ID" --json | jq -r '.result.success'

echo "[labels] restore"
./scripts/lec labels restore --id "$ID" --json | jq -r '.result.success'

echo "LABELS_OK"
