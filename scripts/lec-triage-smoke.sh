#!/usr/bin/env bash
set -euo pipefail
TEAM=${TEAM:-WS}

set -a; source ~/.openclaw/keys/.env; set +a

echo "[triage] list (state=Triage, exclude done/cancelled)"
./scripts/lec triage list --team "$TEAM" --limit 10 --exclude-done --exclude-cancelled --json | jq '.ok, .result.success, (.result.issues|length)'

echo "TRIAGE_OK"
