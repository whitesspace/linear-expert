import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import worker from "../worker/src/index";
import { getStorage } from "../worker/src/storage";

type TestEnv = Parameters<typeof worker.fetch>[1];

type FetchCall = {
  kind: "graphql";
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
    if (url.includes("api.linear.app/graphql")) {
      if (nextGraphqlError) {
        const message = nextGraphqlError;
        nextGraphqlError = null;
        throw new Error(message);
      }
      const body = JSON.parse(String(init?.body ?? "{}"));
      calls.push({ kind: "graphql", body, url });

      const query = String(body?.query ?? "");
      // Support multiple Linear GraphQL ops used by the worker.
      if (query.includes("agentSessionCreateOnComment")) {
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

      if (query.includes("agentSessionCreateOnIssue")) {
        return new Response(JSON.stringify({
          data: {
            agentSessionCreateOnIssue: {
              success: true,
              agentSession: { id: "as_issue" },
            },
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (query.includes("agentSessionUpdateExternalUrl")) {
        return new Response(JSON.stringify({
          data: {
            agentSessionUpdateExternalUrl: {
              success: true,
              agentSession: { id: body?.variables?.id ?? "as_unknown" },
            },
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (query.includes("viewer { id name }") && query.includes("organization { id name urlKey }")) {
        return new Response(JSON.stringify({
          data: {
            viewer: { id: "app_user_1", name: "Expert Agent" },
            organization: { id: "ws_1", name: "Example Org", urlKey: "example" },
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

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

      if (query.includes("query agentActivity") || query.includes("agentActivity(id:")) {
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

      if (query.includes("query($id: ID!)") && query.includes("issue(id: $id)")) {
        return new Response(JSON.stringify({
          data: {
            issue: {
              id: body?.variables?.id ?? "issue_1",
              team: { id: "team_1" },
              state: { id: "state_backlog", name: "Backlog", type: "unstarted" },
            },
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (query.includes("query($teamId: String!)") && query.includes("team(id: $teamId)")) {
        return new Response(JSON.stringify({
          data: {
            team: {
              states: {
                nodes: [
                  { id: "state_started", name: "In Progress", type: "started", position: 1 },
                ],
              },
            },
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (query.includes("mutation($id: String!, $input: IssueUpdateInput!)")) {
        return new Response(JSON.stringify({
          data: {
            issueUpdate: {
              success: true,
              issue: {
                id: body?.variables?.id ?? "issue_1",
                identifier: "WS-1",
                title: "Updated",
                url: "https://linear.app/example/issue/WS-1",
              },
            },
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      // Default: return empty data to avoid blowing up the SDK on unexpected shapes.
      return new Response(JSON.stringify({ data: {} }), {
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
    const createdTimestamp = String(Date.now());

    const createdRes = await worker.fetch(
      new Request("https://example.com/webhooks/linear", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "linear-signature": createdSignature,
          "linear-timestamp": createdTimestamp,
        },
        body: createdBody,
      }),
      env,
      {} as ExecutionContext,
    );

    assert.equal(createdRes.status, 200);
    const createdRuns = await getStorage(env).agentRuns.listByStatus({ status: "pending", limit: 10 });
    assert.ok(createdRuns.some((run) => run.agentSessionId === "as_1" && run.workspaceId === "ws_1"));

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
    const commentTimestamp = String(Date.now());

    const commentRes = await worker.fetch(
      new Request("https://example.com/webhooks/linear", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "linear-signature": commentSignature,
          "linear-timestamp": commentTimestamp,
          "linear-event": "Comment",
        },
        body: commentBody,
      }),
      env,
      {} as ExecutionContext,
    );

    assert.equal(commentRes.status, 200);
    const graphqlCall = calls.find((call) => String(call.body?.query ?? "").includes("agentSessionCreateOnComment"));
    assert.ok(graphqlCall);
    assert.match(String(graphqlCall?.body.query ?? ""), /agentSessionCreateOnComment/);
    const commentExternalUrlCall = calls.find((call) =>
      String(call.body?.query ?? "").includes("agentSessionUpdateExternalUrl")
      && call.body?.variables?.id === "as_comment"
    );
    assert.deepEqual(commentExternalUrlCall?.body.variables?.input?.externalUrls, [
      {
        label: "查看处理状态",
        url: "https://example.com/agent-sessions/as_comment",
      },
    ]);
    const commentRuns = await getStorage(env).agentRuns.listByStatus({ status: "pending", limit: 10 });
    assert.ok(commentRuns.some((run) => run.agentSessionId === "as_comment" && run.workspaceId === "ws_1"));

    nextGraphqlError = "Comment already has an agent session";
    const duplicateRes = await worker.fetch(
      new Request("https://example.com/webhooks/linear", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "linear-signature": commentSignature,
          "linear-timestamp": commentTimestamp,
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

    const assignPayload = {
      type: "Issue",
      action: "update",
      organizationId: "ws_1",
      updatedFrom: {
        delegateId: null,
      },
      data: {
        id: "issue_2",
        identifier: "WS-2",
        title: "Assigned to agent",
        url: "https://linear.app/example/issue/WS-2",
        delegateId: "app_user_1",
        teamId: "team_1",
      },
    };
    const assignBody = JSON.stringify(assignPayload);
    const assignSignature = sign(env.LINEAR_WEBHOOK_SECRET as string, assignBody);
    const assignTimestamp = String(Date.now());

    const assignRes = await worker.fetch(
      new Request("https://example.com/webhooks/linear", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "linear-signature": assignSignature,
          "linear-timestamp": assignTimestamp,
          "linear-event": "Issue",
        },
        body: assignBody,
      }),
      env,
      {} as ExecutionContext,
    );

    assert.equal(assignRes.status, 200);
    const issueSessionCall = calls.find((call) => String(call.body?.query ?? "").includes("agentSessionCreateOnIssue"));
    assert.ok(issueSessionCall);
    const issueExternalUrlCall = calls.filter((call) => String(call.body?.query ?? "").includes("agentSessionUpdateExternalUrl")).at(-1);
    assert.deepEqual(issueExternalUrlCall?.body.variables?.input?.externalUrls, [
      {
        label: "查看处理状态",
        url: "https://example.com/agent-sessions/as_issue",
      },
    ]);
    const assignRuns = await getStorage(env).agentRuns.listByStatus({ status: "pending", limit: 10 });
    assert.ok(assignRuns.some((run) => run.agentSessionId === "as_issue" && run.workspaceId === "ws_1"));

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("api.linear.app/graphql")) {
        throw new Error("graphql unavailable");
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    const failedCreatedPayload = {
      ...createdPayload,
      agentSession: {
        ...(createdPayload.agentSession),
        id: "as_fail",
      },
    };
    const failedCreatedBody = JSON.stringify(failedCreatedPayload);
    const failedCreatedSignature = sign(env.LINEAR_WEBHOOK_SECRET as string, failedCreatedBody);
    const failedInvokeRes = await worker.fetch(
      new Request("https://example.com/webhooks/linear", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "linear-signature": failedCreatedSignature,
          "linear-timestamp": String(Date.now()),
        },
        body: failedCreatedBody,
      }),
      env,
      {} as ExecutionContext,
    );

    assert.equal(failedInvokeRes.status, 502);
    const failedInvokeJson = await failedInvokeRes.json() as { error?: string };
    assert.equal(failedInvokeJson.error, "invoke_failed");
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("webhooks.agent-session.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
