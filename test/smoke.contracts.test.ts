import assert from "node:assert/strict";

const WORKER_URL = process.env.LINEAR_EXPERT_WORKER_URL ?? "https://linear-expert.placeapp.workers.dev";
// Back-compat: older docs used LINEAR_EXPERT_INTERNAL_SECRET.
// Canonical: OPENCLAW_INTERNAL_SECRET (the worker's internal auth secret).
const INTERNAL_SECRET = process.env.OPENCLAW_INTERNAL_SECRET || process.env.LINEAR_EXPERT_INTERNAL_SECRET;

function requireEnv(value: string | undefined, name: string) {
  if (!value) {
    console.log(`(skip) smoke.contracts.test missing env: ${name}`);
    return null;
  }
  return value;
}

type PostJsonResult = {
  res: Response;
  text: string;
  json: unknown;
};

async function postJson(path: string, body: unknown): Promise<PostJsonResult> {
  const secret = requireEnv(INTERNAL_SECRET, "OPENCLAW_INTERNAL_SECRET");
  if (!secret) {
    return { res: new Response(null, { status: 204 }), text: "", json: null as unknown };
  }

  const res = await fetch(`${WORKER_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    // ignore
  }

  return { res, text, json };
}

async function run() {
  // NOTE: These tests validate response shape/contracts only.
  // They intentionally avoid creating/updating real Linear data.

  // Use a known workspace id (default fallback) so tests can run after a single OAuth install.
  const workspaceId = process.env.LINEAR_EXPERT_WORKSPACE_ID ?? "default-workspace";
  const teamId = process.env.LINEAR_EXPERT_TEAM_ID ?? "";

  const hasSecret = Boolean(INTERNAL_SECRET);
  if (!hasSecret) {
    console.log("(skip) smoke.contracts.test (missing OPENCLAW_INTERNAL_SECRET)");
    return;
  }

  // Resolve workspace/team via internal resolver (requires OAuth token installed for workspaceId).
  // This keeps the smoke test deterministic without hardcoding secrets into repo.
  {
    const { res, json, text } = await postJson("/internal/linear/resolve", {
      workspaceId,
      teamKey: process.env.LINEAR_EXPERT_TEAM_KEY ?? "",
    });
    assert.equal(res.status, 200, text);
    assert.equal(json.ok, true);
    assert.ok(typeof json.teamId === "string");
  }

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

  console.log("smoke.contracts.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
