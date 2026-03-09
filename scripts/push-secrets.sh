#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker"
ENV_FILE="$ROOT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

required=(
  LINEAR_CLIENT_ID
  LINEAR_CLIENT_SECRET
  LINEAR_WEBHOOK_SECRET
  OPENCLAW_INTERNAL_SECRET
)

for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing required secret: $key"
    exit 1
  fi
done

cd "$WORKER_DIR"

printf '%s' "$LINEAR_CLIENT_ID" | npx wrangler secret put LINEAR_CLIENT_ID
printf '%s' "$LINEAR_CLIENT_SECRET" | npx wrangler secret put LINEAR_CLIENT_SECRET
printf '%s' "$LINEAR_WEBHOOK_SECRET" | npx wrangler secret put LINEAR_WEBHOOK_SECRET
printf '%s' "$OPENCLAW_INTERNAL_SECRET" | npx wrangler secret put OPENCLAW_INTERNAL_SECRET

echo "Secrets pushed successfully."
