import assert from "node:assert/strict";
import worker from "../worker/src/index";
import { createSessionToken } from "../worker/src/linear/session-token";

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
  const sessionToken = createSessionToken({
    traceId: "trace_1",
    agentSessionId: "session_1",
    workspaceId: "ws_1",
  });

  const response = await worker.fetch(
    new Request("https://example.com/internal/agent-runs?status=pending&limit=5", {
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
    }),
    env,
    {} as ExecutionContext,
  );

  assert.equal(response.status, 401);
  const body = await response.json() as { error: string };
  assert.equal(body.error, "unauthorized");

  console.log("internal.auth.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
