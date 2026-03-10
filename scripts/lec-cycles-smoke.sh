#!/usr/bin/env bash
set -euo pipefail

set -a; source ~/.openclaw/keys/.env; set +a

echo "[cycles] list"
./scripts/lec cycles list --limit 3 --json | jq -r '.ok'

echo "CYCLES_OK"
