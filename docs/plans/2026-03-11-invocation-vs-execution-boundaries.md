# WS-37 — Invocation vs Execution Boundaries (v0)

Date: 2026-03-11  
Issue: WS-37 — 为 Agent Native Invocation 做边界预留

## Goal
Reserve clear boundaries and integration points for future **Agent Native Invocation** (per Linear Agent Interaction Guidelines / Developing the Agent Interaction / Signals / Best Practices).

This stage is **interfaces + stubs + docs only**. No real AgentSession/AgentActivity writes beyond a minimal noop stub.

## Layering

### Execution Layer (existing)
**Purpose:** perform Linear-native actions only.

- Input: structured execution intent (`TaskResultSchema` / route payloads)
- Actions: Linear CRUD / transitions / assignee/delegate / comments / relations / attachments
- Output: structured results + audit metadata (traceId, route, entity ids)

**Strictly forbidden in execution layer**
- agent session orchestration
- prompt construction or tool-call interpretation
- conversation state management

### Invocation Layer (new / future)
**Purpose:** own AgentSession lifecycle & interaction.

- Receive: `AgentSessionEvent` (created / prompted)
- Maintain context: prefer **Agent Activities** (immutable snapshots) over editable comments
- Send: AgentActivity types: `thought` / `action` / `elicitation` / `response` / `error`
- Handle Signals: `stop`, `auth`, `select`
- Optionally maintain: session-level Plan (checklist)

## AIG → System design mapping (hard requirements)

1) **Disclose agent identity**
- All actions must be performed as app/agent actor.
- Visible outputs (comment / AgentActivity.response) must avoid human roleplay; be explicit: “agent”.

2) **Natively inhabit the platform**
- Use Linear primitives: Issue states, assignee/delegate, comments, attachments, relations.
- Represent “agent invocation” via AgentSession + AgentActivities (not stuffed into random comments).

3) **Fast feedback (<10s thought)**
- After `AgentSessionEvent.created`, produce first `thought` within 10 seconds (or update `externalUrls`).
- Session can run up to 30 minutes without becoming stale; new activity can revive.

4) **Transparent internal state**
- Track AgentSession status (`pending|active|awaitingInput|error|complete`).
- Use AgentActivity types for user readability.
- Use `elicitation` for confirmations.

5) **Respect disengage / stop**
- On `stop` signal: immediately cease actions; emit final response/error acknowledging stop.

6) **Delegation clarity**
- Keep delegation model explicit: agent may execute; final responsibility remains human.
- Avoid irreversible operations without explicit user confirmation (use `elicitation`).

## Integration points to reserve

### 1) Webhook subscription
- Subscribe to `AgentSessionEvent` webhooks category.
- Webhook receiver must return **200 within 5 seconds**.

### 2) Prompt construction
- Prefer webhook payload `promptContext` (issue/threads/guidance formatted context).
- Structured sources: `agentSession.issue`, `agentSession.comment`, `previousComments`, `guidance`.

### 3) Progress and actions back to Linear
- Start → `thought` (<10s)
- Tool/execution → `action` (can be optimistic, update with results later)
- Need user confirmation → `elicitation` (may pair with `select` signal)
- Done → `response`
- Failure → `error` (include actionable info / links)

### 4) Session external entry points
- Use `agentSessionUpdate.externalUrls` to provide “Open dashboard/trace” links.

### 5) Delegation and status best practices
- When agent starts work:
  - If issue not in started/completed/canceled: transition to the first started state (lowest position).
  - If agent is implementing work and `Issue.delegate` unset: set delegate to agent.

## Data flow (v0)
```text
Linear Webhook (AgentSessionEvent)
  -> Invocation receiver (/internal/invoke/agent-session)
     -> (immediate thought + traceId + optional externalUrls)
     -> (later) translate to structured intent
        -> Execution layer routes (/internal/* existing)
           -> Linear API CRUD
     -> (update activities + session status)
```

## Non-goals (this stage)
- No real write path for AgentSession/AgentActivity (beyond stub/noop)
- No queue system semantics
- No invocation logic embedded inside execution layer

## Acceptance criteria
- `created` webhook → thought activity within 10 seconds (or externalUrls update)
- `stop` signal → no further actions + final activity confirming stop
- Context reads prefer Agent Activities, not editable comments
- Execution layer stays free of prompt/session logic
