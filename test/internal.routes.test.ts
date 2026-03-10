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
    accessToken: "Bearer test-token",
    refreshToken: "refresh-token",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    scopes: ["read", "write"],
    actorMode: "app",
  });

  const originalFetch = globalThis.fetch;
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];

  type GraphQLRequest = {
    query?: string;
    variables?: {
      input?: {
        parentId?: string;
      };
      [k: string]: unknown;
    };
  };

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as GraphQLRequest;
    calls.push({
      query: body.query ?? "",
      variables: body.variables ?? {},
    });

    return new Response(JSON.stringify({
      data: {
        issueCreate: {
          success: true,
          issue: {
            id: "issue_created",
            identifier: "WS-44",
            title: "Sub issue",
            url: "https://linear.app/example/issue/WS-44",
          },
        },
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const createResponse = await worker.fetch(new Request("https://example.com/internal/linear/issues/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer internal_secret",
      },
      body: JSON.stringify({
        workspaceId: "ws_1",
        teamId: "team_1",
        title: "Sub issue",
        parentId: "parent_1",
      }),
    }), env, {} as ExecutionContext);

    assert.equal(createResponse.status, 200);
    const createJson = await createResponse.json() as { ok: boolean };
    assert.equal(createJson.ok, true);
    assert.ok(calls.length >= 1);
    // ensure parentId is preserved in outbound call (look for a variables.input payload)
    const lastInput = [...calls].reverse().find((call) => call.variables.input)?.variables.input;
    assert.equal(lastInput?.parentId, "parent_1");

    const storage = getStorage(env);
    const createdTask = await storage.tasks.create({
      source: "linear",
      eventType: "comment.created",
      webhookId: "wh_task_1",
      workspaceId: "ws_1",
      organizationId: null,
      issueId: "issue_parent",
      issueIdentifier: "WS-1",
      commentId: "comment_1",
      actorId: "user_1",
      actorName: "Tester",
      payloadJson: JSON.stringify({ hello: "world" }),
    });
    await storage.tasks.claim(createdTask.id, 300);

    const taskResultResponse = await worker.fetch(new Request(`https://example.com/internal/tasks/${createdTask.id}/result`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer internal_secret",
      },
      body: JSON.stringify({
        action: "create_issue",
        issue: {
          teamId: "team_1",
          title: "Nested issue",
          parentId: "parent_2",
        },
      }),
    }), env, {} as ExecutionContext);

    assert.equal(taskResultResponse.status, 200);
    const taskResultJson = await taskResultResponse.json() as { task: { resultAction: string } };
    assert.equal(taskResultJson.task.resultAction, "create_issue");
    assert.ok(calls.length >= 2);
    const lastInput2 = [...calls].reverse().find((call) => call.variables.input)?.variables.input;
    assert.equal(lastInput2?.parentId, "parent_2");
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("internal.routes.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
