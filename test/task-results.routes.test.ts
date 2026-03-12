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

  let targetTaskId = "";
  for (let index = 0; index < 1001; index += 1) {
    const created = await storage.tasks.create({
      source: "linear",
      eventType: "comment.created",
      webhookId: `wh_${index}`,
      workspaceId: "ws_1",
      organizationId: "ws_1",
      issueId: `issue_${index}`,
      issueIdentifier: `WS-${index}`,
      commentId: `comment_${index}`,
      actorId: "user_1",
      actorName: "Tester",
      payloadJson: JSON.stringify({ index }),
    });
    await storage.tasks.claim(created.id, 300);
    targetTaskId = created.id;
  }

  const response = await worker.fetch(
    new Request(`https://example.com/internal/tasks/${targetTaskId}/result`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer internal_secret",
      },
      body: JSON.stringify({
        action: "noop",
      }),
    }),
    env,
    {} as ExecutionContext,
  );

  assert.equal(response.status, 200);
  const body = await response.json() as { task: { id: string; status: string } };
  assert.equal(body.task.id, targetTaskId);
  assert.equal(body.task.status, "ignored");

  console.log("task-results.routes.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
