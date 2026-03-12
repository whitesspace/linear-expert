#!/usr/bin/env bash
set -euo pipefail

# Smoke test for lec + linear-expert worker internal routes.
# Requires OPENCLAW_INTERNAL_SECRET in env.

source "$(dirname "$0")/lec-smoke-lib.sh"
load_lec_smoke_env

TEAM=${TEAM:-PCF}

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
COMMENT_JSON=$(./scripts/lec comment create --team "$TEAM" --issue "$ISSUE_KEY" --body "[lec-smoke] comment" --json)
COMMENT_ID=$(echo "$COMMENT_JSON" | jq -r '.result.comment.id')
echo "commentId=$COMMENT_ID"

echo "[5.1] comment update"
./scripts/lec comment update --team "$TEAM" --id "$COMMENT_ID" --body "[lec-smoke] comment updated" --json | jq '.ok'

echo "[5.2] comment resolve"
./scripts/lec comment resolve --team "$TEAM" --id "$COMMENT_ID" --json | jq '.ok'

echo "[5.3] comment unresolve"
./scripts/lec comment unresolve --team "$TEAM" --id "$COMMENT_ID" --json | jq '.ok'

echo "[6] attachment"
ATTACHMENT_JSON=$(./scripts/lec attachment add --team "$TEAM" --issue "$ISSUE_KEY" --url "https://example.com" --title "[lec-smoke] attachment" --json)
ATTACHMENT_ID=$(echo "$ATTACHMENT_JSON" | jq -r '.result.attachment.id')
echo "attachmentId=$ATTACHMENT_ID"

echo "[6.1] attachment delete"
./scripts/lec attachment delete --team "$TEAM" --id "$ATTACHMENT_ID" --json | jq '.ok'

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

echo "[9] issue archive/delete"
ARCHIVE_JSON=$(./scripts/lec issue create --team "$TEAM" --title "[lec-smoke] archive $(date +%s)" --description "smoke" --json)
ARCHIVE_KEY=$(echo "$ARCHIVE_JSON" | jq -r '.result.issue.identifier')
./scripts/lec issue archive --team "$TEAM" --issue "$ARCHIVE_KEY" --json | jq '.ok'

DELETE_JSON=$(./scripts/lec issue create --team "$TEAM" --title "[lec-smoke] delete $(date +%s)" --description "smoke" --json)
DELETE_KEY=$(echo "$DELETE_JSON" | jq -r '.result.issue.identifier')
./scripts/lec issue delete --team "$TEAM" --issue "$DELETE_KEY" --json | jq '.ok'

echo "[10] comment delete"
./scripts/lec comment delete --team "$TEAM" --id "$COMMENT_ID" --json | jq '.ok'

echo "ALL_OK"
