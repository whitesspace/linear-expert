# WS-37 — Dev Replay Runbook (Invocation Pipeline)

This runbook exists to deterministically verify the WS-37 **invocation-layer pipeline** locally or in a dev deployment.

## What this does

- Calls a **dev-only** replay endpoint that feeds a simulated `AgentSessionEvent.created` payload through the **same invocation pipeline** used by `/internal/invoke/agent-session`.
- Returns `200` quickly with a `traceId` and a derived `firstThoughtPrompt`.
- **Does not** execute Linear native actions (execution layer remains separate).

## Endpoint

`POST /internal/invoke/replay/agent-session-created`

Auth:
- `Authorization: Bearer <DEV_REPLAY_SECRET>`
- If `DEV_REPLAY_SECRET` is not configured, it falls back to `OPENCLAW_INTERNAL_SECRET`.

## One-command curl

```bash
curl -sS \
  -X POST "http://127.0.0.1:8787/internal/invoke/replay/agent-session-created" \
  -H "content-type: application/json" \
  -H "authorization: Bearer ${OPENCLAW_INTERNAL_SECRET}" \
  --data ' {
    "type": "AgentSessionEvent.created",
    "agentSessionId": "as_replay_001",
    "workspaceId": "ws_replay_001",
    "issue": {
      "identifier": "WS-37",
      "title": "Overnight Coding (replay)",
      "url": "https://linear.app/example/issue/WS-37"
    },
    "guidance": { "text": "Be explicit that you are an agent; include plan + confirmations." },
    "promptContext": {
      "comment": { "body": "Please show me the first thought and plan." }
    }
  }'
```

## Verify output

The response is JSON:

- `ok: true`
- `traceId: "trace_..."`
- `reserved.firstThoughtPrompt`: non-empty string

## Trace lookup

Search logs for the returned `traceId`.

- Local dev (wrangler):
  - run `npm run dev` and look at the console output
  - then grep for the trace id in your terminal scrollback

Notes:
- Today we return `traceId` in the response; additional log emission can be added in later increments.
