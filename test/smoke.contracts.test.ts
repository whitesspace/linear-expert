import assert from "node:assert/strict";

const WORKER_URL = process.env.LINEAR_EXPERT_WORKER_URL ?? "https://linear-expert.placeapp.workers.dev";
const INTERNAL_SECRET = process.env.LINEAR_EXPERT_INTERNAL_SECRET;

function requireEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

async function postJson(path: string, body: unknown) {
  const secret = requireEnv(INTERNAL_SECRET, "LINEAR_EXPERT_INTERNAL_SECRET");
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }

  return { res, text, json };
}

async function run() {
  // NOTE: These tests validate response shape/contracts only.
  // They intentionally avoid creating/updating real Linear data.

  const workspaceId = process.env.LINEAR_EXPERT_WORKSPACE_ID ?? "";
  const teamId = process.env.LINEAR_EXPERT_TEAM_ID ?? "";

  // /internal/linear/team/states (read-only)
  {
    const { res, json, text } = await postJson("/internal/linear/team/states", {
      workspaceId,
      teamId,
    });
    assert.equal(res.status, 200, text);
    assert.equal(json.ok, true);
    assert.equal(json.action, "list_team_states");
    assert.equal(json.result.success, true);
    assert.ok(Array.isArray(json.result.states));
  }

  // /internal/linear/issues/list (read-only)
  {
    const { res, json, text } = await postJson("/internal/linear/issues/list", {
      workspaceId,
      teamId,
      numbers: [31],
    });
    assert.equal(res.status, 200, text);
    assert.equal(json.ok, true);
    assert.equal(json.action, "list_issues_by_numbers");
    assert.equal(json.result.success, true);
    assert.ok(Array.isArray(json.result.issues));
  }

  console.log("smoke.contracts.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
