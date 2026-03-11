import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import worker from "../worker/src/index";
import { getStorage } from "../worker/src/storage";

type TestEnv = Parameters<typeof worker.fetch>[1];

type FetchCall = {
  kind: "invoke" | "graphql";
  body: any;
  url: string;
};

function buildEnv(): TestEnv {
  return {
    LINEAR_WEBHOOK_SECRET: "whsec_test",
    LINEAR_CLIENT_ID: "client_id",
    LINEAR_CLIENT_SECRET: "client_secret",
    LINEAR_REDIRECT_URI: "https://example.com/oauth/callback",
    OPENCLAW_INTERNAL_SECRET: "internal_secret",
  };
}

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
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
  const calls: FetchCall[] = [];
  let nextGraphqlError: string | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/internal/invoke/agent-session")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      calls.push({ kind: "invoke", body, url });
      return new Response(JSON.stringify({ ok: true, traceId: "trace_test" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.includes("api.linear.app/graphql")) {
      if (nextGraphqlError) {
        const message = nextGraphqlError;
        nextGraphqlError = null;
        throw new Error(message);
      }
      const body = JSON.parse(String(init?.body ?? "{}"));
      calls.push({ kind: "graphql", body, url });
      return new Response(JSON.stringify({
        data: {
          agentSessionCreateOnComment: {
            success: true,
            agentSession: { id: "as_comment" },
          },
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  try {
    const createdPayload = {
      type: "AgentSessionEvent",
      action: "created",
      organizationId: "ws_1",
      agentSession: {
        id: "as_1",
        issue: {
          id: "issue_1",
          identifier: "WS-1",
          title: "Test Issue",
          url: "https://linear.app/example/issue/WS-1",
        },
      },
      promptContext: "Task: reply to the user",
      guidance: { text: "Keep it short." },
      agentActivity: { body: "Hello there" },
      previousComments: [],
    };
    const createdBody = JSON.stringify(createdPayload);
    const createdSignature = sign(env.LINEAR_WEBHOOK_SECRET as string, createdBody);

    const createdRes = await worker.fetch(
      new Request("https://example.com/webhooks/linear", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "linear-signature": createdSignature,
        },
        body: createdBody,
      }),
      env,
      {} as ExecutionContext,
    );

    assert.equal(createdRes.status, 200);
    const invokeCall = calls.find((call) => call.kind === "invoke");
    assert.ok(invokeCall);
    assert.equal(invokeCall?.body.agentSessionId, "as_1");
    assert.equal(invokeCall?.body.workspaceId, "ws_1");
    assert.equal(invokeCall?.body.agentActivity?.body, "Hello there");

    const commentPayload = {
      type: "Comment",
      data: {
        id: "comment_1",
        body: "@agent please help",
        isArtificialAgentSessionRoot: false,
        issue: { id: "issue_1" },
        organizationId: "ws_1",
      },
    };
    const commentBody = JSON.stringify(commentPayload);
    const commentSignature = sign(env.LINEAR_WEBHOOK_SECRET as string, commentBody);

    const commentRes = await worker.fetch(
      new Request("https://example.com/webhooks/linear", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "linear-signature": commentSignature,
          "linear-event": "Comment",
        },
        body: commentBody,
      }),
      env,
      {} as ExecutionContext,
    );

    assert.equal(commentRes.status, 200);
    const graphqlCall = calls.find((call) => call.kind === "graphql");
    assert.ok(graphqlCall);
    assert.match(String(graphqlCall?.body.query ?? ""), /agentSessionCreateOnComment/);

    nextGraphqlError = "Comment already has an agent session";
    const duplicateRes = await worker.fetch(
      new Request("https://example.com/webhooks/linear", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "linear-signature": commentSignature,
          "linear-event": "Comment",
        },
        body: commentBody,
      }),
      env,
      {} as ExecutionContext,
    );

    assert.equal(duplicateRes.status, 200);
    const duplicateJson = await duplicateRes.json() as { status?: string; reason?: string };
    assert.equal(duplicateJson.status, "accepted");
    assert.equal(duplicateJson.reason, "already_has_session");
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("webhooks.agent-session.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
