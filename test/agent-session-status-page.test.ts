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
  const storage = getStorage(env);

  await storage.sessions.create({
    id: "as_status_page",
    workspaceId: "ws_1",
    issueId: "issue_1",
    issueIdentifier: "WS-10",
    issueTitle: "Long running analysis",
    issueUrl: "https://linear.app/example/issue/WS-10",
    firstActivityAt: new Date(Date.now() - 60_000).toISOString(),
    lastActivityAt: new Date().toISOString(),
    activityCount: 2,
    status: "active",
    contextSummary: "正在拉取上下文",
  });

  const res = await worker.fetch(
    new Request("https://example.com/agent-sessions/as_status_page", {
      method: "GET",
    }),
    env,
    {} as ExecutionContext,
  );

  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /WS-10/);
  assert.match(html, /Long running analysis/);
  assert.match(html, /active/);
  assert.match(html, /处理中/);

  console.log("agent-session-status-page.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
