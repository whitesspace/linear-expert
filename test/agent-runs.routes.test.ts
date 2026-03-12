import assert from "node:assert/strict";
import worker from "../worker/src/index";
import { getStorage } from "../worker/src/storage";

type TestEnv = Parameters<typeof worker.fetch>[1];

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
  await getStorage(env).oauth.upsert({
    workspaceId: "ws_1",
    accessToken: "test-token",
    refreshToken: "refresh-token",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    scopes: ["read", "write"],
    actorMode: "app",
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    // Let the worker call itself normally.
    if (url.startsWith("https://example.com/")) {
      return originalFetch(input, init);
    }

    // Only intercept Linear GraphQL.
    if (!url.includes("api.linear.app/graphql")) {
      return new Response("ok", { status: 200 });
    }

    const body = JSON.parse(String(init?.body ?? "{}"));
    const query = String(body?.query ?? "");

    // WS-37: write thought activities
    if (query.includes("agentActivityCreate")) {
      return new Response(JSON.stringify({
        data: {
          agentActivityCreate: {
            success: true,
            agentActivity: {
              id: "aa_1",
              archivedAt: null,
            },
          },
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (query.includes("query agentActivity") || query.includes(" agentActivity(id:")) {
      return new Response(JSON.stringify({
        data: {
          agentActivity: {
            id: "aa_1",
            archivedAt: null,
          },
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Default: return empty data for other operations.
    return new Response(JSON.stringify({ data: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const invokeRes = await worker.fetch(
      new Request("https://example.com/internal/invoke/agent-session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer internal_secret",
        },
        body: JSON.stringify({
          type: "AgentSessionEvent.created",
          agentSessionId: "as_1",
          workspaceId: "ws_1",
          promptContext: "Task: reply quickly.",
        }),
      }),
      env,
      {} as ExecutionContext,
    );

    assert.equal(invokeRes.status, 200);
    const invokeJson = await invokeRes.json() as { reserved?: { queuedRunId?: string } };
    assert.ok(invokeJson.reserved?.queuedRunId);

    const listRes = await worker.fetch(
      new Request("https://example.com/internal/agent-runs?status=pending&limit=5", {
        method: "GET",
        headers: { authorization: "Bearer internal_secret" },
      }),
      env,
      {} as ExecutionContext,
    );
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json() as { runs: Array<{ id: string }> };
    assert.ok(listJson.runs.length >= 1);
    const runId = listJson.runs[0].id;

    const claimRes = await worker.fetch(
      new Request(`https://example.com/internal/agent-runs/${runId}/claim`, {
        method: "POST",
        headers: { authorization: "Bearer internal_secret" },
      }),
      env,
      {} as ExecutionContext,
    );
    assert.equal(claimRes.status, 200);

    const resultRes = await worker.fetch(
      new Request(`https://example.com/internal/agent-runs/${runId}/result`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer internal_secret",
        },
        body: JSON.stringify({
          ok: true,
          intent: { actions: [{ kind: "noop" }] },
        }),
      }),
      env,
      {} as ExecutionContext,
    );
    assert.equal(resultRes.status, 200);
    const resultJson = await resultRes.json() as { run?: { status?: string } };
    assert.equal(resultJson.run?.status, "completed");
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("agent-runs.routes.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
