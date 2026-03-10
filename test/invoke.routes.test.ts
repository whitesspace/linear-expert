import assert from "node:assert/strict";
import worker from "../worker/src/index";

type WorkerFetch = typeof worker.fetch;

type TestEnv = WorkerFetch extends (request: any, env: infer E, ctx: any) => any
  ? E
  : never;

function buildEnv(): TestEnv {
  return {
    LINEAR_WEBHOOK_SECRET: "whsec_test",
    LINEAR_CLIENT_ID: "client_id",
    LINEAR_CLIENT_SECRET: "client_secret",
    LINEAR_REDIRECT_URI: "https://example.com/oauth/callback",
    OPENCLAW_INTERNAL_SECRET: "internal_secret",
  };
}

async function run() {
  const env = buildEnv();

  // Unauthorized: missing internal secret
  {
    const res = await worker.fetch(
      new Request("https://example.com/internal/invoke/agent-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "agent_session.created" }),
      }),
      env,
      {} as ExecutionContext,
    );

    assert.equal(res.status, 401);
    const json = (await res.json()) as { error: string };
    assert.equal(json.error, "unauthorized");
  }

  type InvokeResponse = { ok: boolean; traceId: string; reserved?: unknown };

  // Happy path: stub accepts minimal payload and returns ok + traceId
  {
    const res = await worker.fetch(
      new Request("https://example.com/internal/invoke/agent-session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer internal_secret",
        },
        body: JSON.stringify({ type: "agent_session.created" }),
      }),
      env,
      {} as ExecutionContext,
    );

    assert.equal(res.status, 200);
    const json = (await res.json()) as InvokeResponse;
    assert.equal(json.ok, true);
    assert.ok(typeof json.traceId === "string" && json.traceId.length > 0);

    const reserved = (json.reserved ?? {}) as {
      firstThoughtPrompt?: unknown;
      traceStore?: unknown;
    };
    assert.ok(typeof reserved.firstThoughtPrompt === "string");

    const traceStore = (reserved.traceStore ?? {}) as {
      wrote?: unknown;
      agentSessionId?: unknown;
      workspaceId?: unknown;
    };
    assert.equal(traceStore.wrote, true);
    // Ensure key identifiers are echoed for later persistence/replay wiring.
    assert.ok(typeof traceStore.agentSessionId === "string" && traceStore.agentSessionId.length > 0);
    assert.ok(typeof traceStore.workspaceId === "string" && traceStore.workspaceId.length > 0);
  }

  // Dev replay endpoint: secret-protected and runs through same pipeline shape
  {
    const res = await worker.fetch(
      new Request("https://example.com/internal/invoke/replay/agent-session-created", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer internal_secret",
        },
        body: JSON.stringify({
          type: "AgentSessionEvent.created",
          agentSessionId: "as_test",
          workspaceId: "ws_test",
          issue: { identifier: "WS-37", title: "Overnight Coding", url: "https://linear.app/example/issue/WS-37" },
          guidance: { text: "Keep it tight." },
          promptContext: { comment: { body: "Please implement the replay endpoint." } },
        }),
      }),
      env,
      {} as ExecutionContext,
    );

    assert.equal(res.status, 200);
    const json = (await res.json()) as InvokeResponse;
    assert.equal(json.ok, true);
    assert.ok(typeof json.traceId === "string" && json.traceId.length > 0);

    const reserved = (json.reserved ?? {}) as {
      firstThoughtPrompt?: unknown;
      traceStore?: unknown;
    };
    assert.ok(typeof reserved.firstThoughtPrompt === "string");
    assert.match(reserved.firstThoughtPrompt, /AgentSessionEvent\.created/);
    assert.match(reserved.firstThoughtPrompt, /WS-37/);

    const traceStore = (reserved.traceStore ?? {}) as { wrote?: unknown };
    assert.equal(traceStore.wrote, true);
  }

  // Invalid payload
  {
    const res = await worker.fetch(
      new Request("https://example.com/internal/invoke/agent-session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer internal_secret",
        },
        body: JSON.stringify({}),
      }),
      env,
      {} as ExecutionContext,
    );

    assert.equal(res.status, 400);
    const json = (await res.json()) as { error: string };
    assert.equal(json.error, "invalid payload");
  }

  console.log("invoke.routes.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
