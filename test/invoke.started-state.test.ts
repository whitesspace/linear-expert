import assert from "node:assert/strict";
import worker from "../worker/src/index";
import { getStorage } from "../worker/src/storage";
import { cleanupAll } from "../worker/src/linear/dedup";

type TestEnv = Parameters<typeof worker.fetch>[1];

type GraphqlCall = {
  query: string;
  variables: Record<string, unknown>;
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

async function invokeCreatedEvent(env: TestEnv, agentSessionId: string, issue: Record<string, unknown>) {
  return worker.fetch(
    new Request("https://example.com/internal/invoke/agent-session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer internal_secret",
      },
      body: JSON.stringify({
        type: "AgentSessionEvent.created",
        agentSessionId,
        workspaceId: "ws_1",
        issue,
        promptContext: "Task: investigate and respond.",
      }),
    }),
    env,
    {} as ExecutionContext,
  );
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

  try {
    cleanupAll();
    {
      const calls: GraphqlCall[] = [];
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (!url.includes("api.linear.app/graphql")) {
          return new Response("ok", { status: 200 });
        }

        const body = JSON.parse(String(init?.body ?? "{}")) as GraphqlCall;
        calls.push(body);
        const query = String(body.query);

        if (query.includes("issue(id: $id)")) {
          return new Response(JSON.stringify({
            data: {
              issue: {
                id: "issue_1",
                team: { id: "team_1" },
                state: { id: "state_triage", name: "Triage", type: "unstarted" },
              },
            },
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (query.includes("states { nodes { id name type position } }")) {
          return new Response(JSON.stringify({
            data: {
              team: {
                states: {
                  nodes: [
                    { id: "state_done", name: "Done", type: "completed", position: 5 },
                    { id: "state_in_progress", name: "In Progress", type: "started", position: 2 },
                    { id: "state_todo", name: "Todo", type: "unstarted", position: 1 },
                  ],
                },
              },
            },
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (query.includes("issueUpdate(id: $id, input: $input)")) {
          const nextStateId = (body.variables.input as Record<string, unknown>)?.stateId;
          return new Response(JSON.stringify({
            data: {
              issueUpdate: {
                success: true,
                issue: {
                  id: "issue_1",
                  identifier: "WS-1",
                  title: "Test Issue",
                  url: "https://linear.app/example/issue/WS-1",
                  stateId: nextStateId,
                },
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
                agentSession: { id: body.variables.id },
              },
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
                agentActivity: { id: "aa_1", archivedAt: null },
              },
            },
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (query.includes("agentActivity(id: $id)")) {
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

        return new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch;

      const response = await invokeCreatedEvent(env, "as_started_needed", { id: "issue_1" });
      assert.equal(response.status, 200);
      const json = await response.json() as { reserved?: { initialThoughtBody?: string; externalStatusUrl?: string } };
      assert.match(json.reserved?.initialThoughtBody ?? "", /30-90 秒/);
      assert.equal(json.reserved?.externalStatusUrl, "https://example.com/agent-sessions/as_started_needed");

      const updateCall = calls.find((call) => call.query.includes("issueUpdate(id: $id, input: $input)"));
      assert.ok(updateCall, "expected invoke.created to move issue into the first started state");
      assert.equal((updateCall?.variables.input as Record<string, unknown>)?.stateId, "state_in_progress");
      const externalUrlCall = calls.find((call) => call.query.includes("agentSessionUpdateExternalUrl"));
      assert.ok(externalUrlCall, "expected invoke.created to publish external status url");
      assert.equal(externalUrlCall?.variables.id, "as_started_needed");
      assert.deepEqual(externalUrlCall?.variables.input?.externalUrls, [
        {
          label: "查看处理状态",
          url: "https://example.com/agent-sessions/as_started_needed",
        },
      ]);
    }

    {
      const calls: GraphqlCall[] = [];
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (!url.includes("api.linear.app/graphql")) {
          return new Response("ok", { status: 200 });
        }

        const body = JSON.parse(String(init?.body ?? "{}")) as GraphqlCall;
        calls.push(body);
        const query = String(body.query);

        if (query.includes("issue(id: $id)")) {
          return new Response(JSON.stringify({
            data: {
              issue: {
                id: "issue_2",
                team: { id: "team_1" },
                state: { id: "state_in_progress", name: "In Progress", type: "started" },
              },
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
                agentActivity: { id: "aa_2", archivedAt: null },
              },
            },
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (query.includes("agentActivity(id: $id)")) {
          return new Response(JSON.stringify({
            data: {
              agentActivity: {
                id: "aa_2",
                archivedAt: null,
              },
            },
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch;

      const response = await invokeCreatedEvent(env, "as_already_started", { id: "issue_2" });
      assert.equal(response.status, 200);

      const updateCall = calls.find((call) => call.query.includes("issueUpdate(id: $id, input: $input)"));
      assert.equal(updateCall, undefined, "started issue should not be transitioned again");

      const statesCall = calls.find((call) => call.query.includes("states { nodes { id name type position } }"));
      assert.equal(statesCall, undefined, "started issue should not trigger team states lookup");
    }

    cleanupAll();
    {
      let agentActivityCreateCount = 0;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (!url.includes("api.linear.app/graphql")) {
          return new Response("ok", { status: 200 });
        }

        const body = JSON.parse(String(init?.body ?? "{}")) as GraphqlCall;
        const query = String(body.query);

        if (query.includes("issue(id: $id)")) {
          return new Response(JSON.stringify({
            data: {
              issue: {
                id: "issue_3",
                team: { id: "team_1" },
                state: { id: "state_todo", name: "Todo", type: "unstarted" },
              },
            },
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (query.includes("states { nodes { id name type position } }")) {
          return new Response(JSON.stringify({
            data: {
              team: {
                states: {
                  nodes: [{ id: "state_started", name: "In Progress", type: "started", position: 1 }],
                },
              },
            },
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (query.includes("issueUpdate(id: $id, input: $input)")) {
          return new Response(JSON.stringify({
            data: {
              issueUpdate: {
                success: true,
                issue: {
                  id: "issue_3",
                  identifier: "WS-3",
                  title: "Duplicate created",
                  url: "https://linear.app/example/issue/WS-3",
                },
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
                agentSession: { id: body.variables.id },
              },
            },
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (query.includes("agentActivityCreate")) {
          agentActivityCreateCount += 1;
          return new Response(JSON.stringify({
            data: {
              agentActivityCreate: {
                success: true,
                agentActivity: { id: `aa_dup_${agentActivityCreateCount}`, archivedAt: null },
              },
            },
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (query.includes("agentActivity(id: $id)")) {
          return new Response(JSON.stringify({
            data: {
              agentActivity: {
                id: "aa_dup",
                archivedAt: null,
              },
            },
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch;

      const firstResponse = await invokeCreatedEvent(env, "as_duplicate_created", { id: "issue_3" });
      assert.equal(firstResponse.status, 200);
      cleanupAll();

      const secondResponse = await invokeCreatedEvent(env, "as_duplicate_created", { id: "issue_3" });
      assert.equal(secondResponse.status, 200);
      const secondJson = await secondResponse.json() as { reserved?: { duplicateCreated?: boolean; wroteThought?: boolean; queuedRunId?: string | null } };
      assert.equal(secondJson.reserved?.duplicateCreated, true);
      assert.equal(secondJson.reserved?.wroteThought, false);
      assert.equal(secondJson.reserved?.queuedRunId ?? null, null);
      assert.equal(agentActivityCreateCount, 1, "duplicate created should not write a second thought");
    }
  } finally {
    globalThis.fetch = originalFetch;
    cleanupAll();
  }

  console.log("invoke.started-state.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
