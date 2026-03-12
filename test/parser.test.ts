import assert from "node:assert/strict";
import { parseLinearWebhook } from "../worker/src/linear/parser";

function run() {
  const body = JSON.stringify({
    id: "wh_1",
    type: "Issue",
    action: "create",
    teamId: "team_1",
    organizationId: "org_1",
    data: {
      id: "issue_1",
      identifier: "WS-1",
    },
  });

  const parsed = parseLinearWebhook(JSON.parse(body), body);
  assert.ok(parsed);
  assert.equal(parsed?.workspaceId, "org_1");

  console.log("parser.test passed");
}

run();
