#!/usr/bin/env bash
set -euo pipefail

set -a; source ~/.openclaw/keys/.env; set +a

echo "[labels] list"
./scripts/lec labels list --limit 3 --json | jq -r '.ok'

echo "LABELS_OK"
