import assert from "node:assert/strict";
import worker from "../worker/src/index";

async function run() {
  const response = await worker.fetch(
    new Request("https://example.com/healthz"),
    {
      OPENCLAW_INTERNAL_SECRET: "internal_secret",
    },
    {} as ExecutionContext,
  );

  assert.equal(response.status, 503);
  const body = await response.json() as {
    executionLayer: {
      activeDomains: Array<{ domain: string }>;
      plannedDomains: Array<{ domain: string }>;
      nextSteps: string[];
    };
    routes: Record<string, string>;
  };

  assert.deepEqual(
    body.executionLayer.activeDomains.map((item) => item.domain),
    [
      "comments",
      "issues",
      "attachments",
      "relations",
      "projects",
      "triage",
      "initiatives",
      "cycles",
      "labels",
      "documents",
      "customers",
      "customer-needs",
      "project-updates",
      "workflow-states",
    ],
  );
  assert.deepEqual(body.executionLayer.plannedDomains.map((item) => item.domain), []);
  assert.equal(body.executionLayer.nextSteps.length, 0);
  assert.equal(body.routes.internalLinearIssuesCreate, "POST /internal/linear/issues/create");
  assert.equal(body.routes.internalLinearCommentsCreate, "POST /internal/linear/comment");
  assert.equal(body.routes.internalLinearDocumentsCreate, "POST /internal/linear/documents/create");
  assert.equal(body.routes.internalLinearProjectUpdatesCreate, "POST /internal/linear/project-updates/create");

  console.log("healthz.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
