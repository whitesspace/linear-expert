import assert from "node:assert/strict";
import worker from "../worker/src/index";

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

function getCookieValue(setCookie: string, name: string): string | null {
  const pattern = new RegExp(`${name}=([^;]+)`);
  const matched = setCookie.match(pattern);
  return matched?.[1] ?? null;
}

async function run() {
  const env = buildEnv();
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (async () => {
      throw new Error("oauth callback should not exchange token when state is invalid");
    }) as typeof fetch;

    const invalidStateRes = await worker.fetch(
      new Request("https://example.com/oauth/callback?code=test-code&state=bad-state"),
      env,
      {} as ExecutionContext,
    );

    assert.equal(invalidStateRes.status, 400);
    const invalidStateJson = await invalidStateRes.json() as { error: string };
    assert.equal(invalidStateJson.error, "Invalid state");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const oauthStartRes = await worker.fetch(
    new Request("https://example.com/oauth/start"),
    env,
    {} as ExecutionContext,
  );

  assert.equal(oauthStartRes.status, 302);
  const location = oauthStartRes.headers.get("location") || "";
  const setCookie = oauthStartRes.headers.get("set-cookie") || "";
  assert.ok(setCookie.length > 0);

  const stateFromCookie = getCookieValue(setCookie, "linear_oauth_state");
  assert.ok(stateFromCookie);
  assert.match(location, new RegExp(`state=${stateFromCookie}`));

  const originalFetch2 = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url === "https://api.linear.app/oauth/token") {
      return new Response(JSON.stringify({
        access_token: "token_1",
        refresh_token: "refresh_1",
        expires_in: 3600,
        scope: "read write",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.includes("api.linear.app/graphql")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (String(body?.query ?? "").includes("InstallationIdentity")) {
        return new Response(JSON.stringify({
          data: {
            viewer: { id: "viewer_1", name: "Tester" },
            organization: { id: "ws_1", name: "Workspace", urlKey: "workspace" },
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
    }

    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const callbackRes = await worker.fetch(
      new Request(`https://example.com/oauth/callback?code=test-code&state=${stateFromCookie}`, {
        headers: {
          cookie: `linear_oauth_state=${stateFromCookie}`,
        },
      }),
      env,
      {} as ExecutionContext,
    );

    assert.equal(callbackRes.status, 200);
    const callbackJson = await callbackRes.json() as { ok: boolean; workspaceId: string };
    assert.equal(callbackJson.ok, true);
    assert.equal(callbackJson.workspaceId, "ws_1");
  } finally {
    globalThis.fetch = originalFetch2;
  }

  console.log("oauth.routes.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
