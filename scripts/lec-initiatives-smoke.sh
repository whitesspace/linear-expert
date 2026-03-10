#!/usr/bin/env bash
set -euo pipefail

set -a; source ~/.openclaw/keys/.env; set +a

echo "[initiatives] list"
ID=$(./scripts/lec initiatives list --limit 1 --json | jq -r '.result.initiatives[0].id')
echo "id=$ID"

echo "[initiatives] get"
./scripts/lec initiatives get --id "$ID" --json | jq -r '.result.initiative.name'

echo "INITIATIVES_OK"
