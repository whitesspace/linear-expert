# WS-37 — Dev replay: AgentSessionEvent.created → invocation pipeline

This runbook verifies the **invocation layer receiver** without needing a real Linear webhook.

It hits the **dev-only replay endpoint** which feeds a simulated `AgentSessionEvent.created` payload through the **same pipeline** as `/internal/invoke/agent-session` (no duplicated logic).

## Preconditions

- You have a reachable Worker URL (local `wrangler dev` or deployed env).
- You know the internal secret used by the worker:
  - `DEV_REPLAY_SECRET` if set (preferred), otherwise falls back to `OPENCLAW_INTERNAL_SECRET`.

## One-command replay

```bash
curl -sS \
  -X POST "$WORKER_URL/internal/invoke/replay/agent-session-created" \
  -H "Authorization: Bearer $OPENCLAW_INTERNAL_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "AgentSessionEvent.created",
    "agentSessionId": "as_dev_replay_001",
    "workspaceId": "ws_dev",
    "promptContext": {
      "task": "Summarize the issue and propose next steps.",
      "issue": {
        "identifier": "WS-37",
        "title": "Overnight Coding — Invocation + Execution boundaries",
        "url": "https://linear.app/example/issue/WS-37"
      },
      "comment": {
        "body": "Please implement the smallest missing piece toward E2E."
      },
      "guidance": {
        "text": "Disclose agent identity; avoid roleplay; propose a 3-step plan."
      }
    }
  }' | jq
```

Expected:
- HTTP 200
- JSON `{ ok: true, traceId, reserved.firstThoughtPrompt, ... }`
- `reserved.firstThoughtPrompt` contains:
  - explicit agent identity line
  - derived issue metadata (identifier/title/url)
  - task and guidance text (if provided)

## TraceId lookup

The response includes `traceId`.

You can correlate later pipeline steps (future increments) via storage trace mapping:
- traceId → `{ agentSessionId, workspaceId, eventType, createdAt }`

In v0, this mapping is stored via `storage.trace.set(traceId, ...)` and is visible in logs when running locally.

Local wrangler dev:
- Look for log lines around the request timestamp and `traceId=...`.

## Notes

- This replay endpoint is **secret-protected** and should be enabled only in dev environments.
- This endpoint does **not** execute Linear-native actions. It only validates invocation boundary + prompt derivation.
