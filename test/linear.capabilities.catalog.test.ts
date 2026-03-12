import assert from "node:assert/strict";
import { buildInternalApiDocs } from "../worker/src/linear/prompt-builder";
import { getExecutionLayerPlan } from "../worker/src/linear/execution-plan";

async function run() {
  const docs = buildInternalApiDocs("https://example.com");
  assert.match(docs, /\/internal\/linear\/documents\/create/);
  assert.match(docs, /\/internal\/linear\/customers\/list/);
  assert.match(docs, /\/internal\/linear\/customer-needs\/create/);
  assert.match(docs, /\/internal\/linear\/project-updates\/update/);
  assert.match(docs, /\/internal\/linear\/comments\/resolve/);
  assert.match(docs, /\/internal\/linear\/attachments\/delete/);
  assert.match(docs, /\/internal\/linear\/issues\/archive/);
  assert.match(docs, /\/internal\/linear\/triage\/move/);
  assert.match(docs, /\/internal\/linear\/workflow-states\/archive/);
  assert.match(docs, /\/internal\/linear\/search/);

  const plan = getExecutionLayerPlan();
  const domains = [...plan.activeDomains, ...plan.plannedDomains].map((item) => item.domain);
  assert.ok(domains.includes("documents"));
  assert.ok(domains.includes("customers"));
  assert.ok(domains.includes("customer-needs"));
  assert.ok(domains.includes("project-updates"));
  assert.ok(domains.includes("comments"));
  assert.ok(domains.includes("attachments"));
  assert.ok(domains.includes("issues"));
  assert.ok(domains.includes("triage"));
  assert.ok(domains.includes("workflow-states"));
  assert.ok(domains.includes("search"));

  console.log("linear.capabilities.catalog.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
