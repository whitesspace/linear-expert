# WS-37 Runbook — Replay AgentSessionEvent.created (dev-only)

Goal: deterministically feed a simulated `AgentSessionEvent.created` through the **same invocation pipeline** as production (`/internal/invoke/agent-session`) without duplicating logic.

## Preconditions
- Local dev server running:
  ```bash
  cd ~/Documents/Github/linear-expert
  OPENCLAW_INTERNAL_SECRET=test-secret npm run dev -- --port 8787
  ```

## One curl command (replay)
```bash
curl -sS \
  -X POST http://127.0.0.1:8787/internal/invoke/replay/agent-session-created \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer test-secret' \
  -d '{
    "type": "AgentSessionEvent.created",
    "agentSessionId": "as_test_123",
    "workspaceId": "ws_test_456",
    "issue": {"identifier": "WS-37", "title": "Overnight Coding — Invocation boundary", "url": "https://linear.app/example/issue/WS-37"},
    "guidance": {"text": "Be fast and transparent."},
    "promptContext": {"task": "Write the first thought and plan.", "comment": {"body": "Please start."}}
  }'
```

Expected: HTTP 200 with JSON containing `traceId` and `reserved.firstThoughtPrompt`.

## TraceId lookup
- Copy the `traceId` from the response.
- Lookup: for now, the trace is returned inline in the response only (no persistent storage yet).
  - If you need durable trace lookup, implement it as a separate WS-37 increment (storage-backed trace log), **not** by embedding invocation logic into the execution layer.

## Notes
- This endpoint is **secret-protected**:
  - `Authorization: Bearer <DEV_REPLAY_SECRET>` if configured, otherwise falls back to `OPENCLAW_INTERNAL_SECRET`.
- This replay endpoint intentionally does **not** verify Linear webhook signature.
