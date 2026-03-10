#!/usr/bin/env bash
set -euo pipefail

# Smoke test for lec + linear-expert worker internal routes.
# Requires OPENCLAW_INTERNAL_SECRET in env.

TEAM=${TEAM:-WS}

echo "[1] auth status"
./scripts/lec auth status --plain

echo "[2] create issue"
ISSUE_JSON=$(./scripts/lec issue create --team "$TEAM" --title "[lec-smoke] issue $(date +%s)" --description "smoke" --json)
ISSUE_KEY=$(echo "$ISSUE_JSON" | jq -r '.result.issue.identifier')
echo "issue=$ISSUE_KEY"

echo "[3] get issue"
./scripts/lec issue get --team "$TEAM" --issue "$ISSUE_KEY" --json | jq '.result.issue.identifier'

echo "[4] update issue"
./scripts/lec issue update --team "$TEAM" --issue "$ISSUE_KEY" --title "[lec-smoke] updated" --json | jq '.ok'

echo "[5] comment"
./scripts/lec comment create --team "$TEAM" --issue "$ISSUE_KEY" --body "[lec-smoke] comment" --json | jq '.ok'

echo "[6] attachment"
./scripts/lec attachment add --team "$TEAM" --issue "$ISSUE_KEY" --url "https://example.com" --title "[lec-smoke] attachment" --json | jq '.ok'

echo "[7] relation"
TARGET_JSON=$(./scripts/lec issue create --team "$TEAM" --title "[lec-smoke] rel target $(date +%s)" --description "smoke" --json)
TARGET_KEY=$(echo "$TARGET_JSON" | jq -r '.result.issue.identifier')
REL_JSON=$(./scripts/lec relation add --team "$TEAM" --issue "$ISSUE_KEY" --relation relates_to --target "$TARGET_KEY" --json)
echo "$REL_JSON" | jq '.result.relation'

echo "[8] project CRUD"
PROJ_JSON=$(./scripts/lec project create --team "$TEAM" --title "[lec-smoke] proj $(date +%s)" --description "smoke" --json)
PROJ_ID=$(echo "$PROJ_JSON" | jq -r '.result.project.id')
echo "projectId=$PROJ_ID"
./scripts/lec project get --team "$TEAM" --project "$PROJ_ID" --json | jq '.result.project.id'
./scripts/lec project update --team "$TEAM" --project "$PROJ_ID" --description "smoke2" --json | jq '.result.project.description'
./scripts/lec project delete --team "$TEAM" --project "$PROJ_ID" --json | jq '.result.success'

echo "ALL_OK"
