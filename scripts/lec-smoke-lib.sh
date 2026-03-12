#!/usr/bin/env bash
set -euo pipefail

load_lec_smoke_env() {
  set -a
  source ~/.openclaw/keys/.env
  set +a
}
