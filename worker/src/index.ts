import type { Env } from "./env";
import { json } from "./lib/http";
import { handleInternalRequest } from "./routes/internal";
import { startOauth, oauthCallback } from "./routes/oauth";
import { handleLinearWebhook } from "./routes/webhooks";
import { handleDebugComment } from "./routes/debug";
import { getStorage } from "./storage";
import { APP_CONFIG, missingSecrets } from "./env";

function readiness(env: Env) {
  const missing = missingSecrets(env as unknown as Record<string, unknown>);
  const hasDb = Boolean(env.DB);
  const ready = missing.length === 0 && hasDb;
  return {
    ready,
    missingSecrets: missing,
    storage: hasDb ? 'd1' : 'memory',
    oauth: env.LINEAR_CLIENT_ID && env.LINEAR_CLIENT_SECRET ? 'configured' : 'missing'
  };
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const storage = getStorage(env);
    const url = new URL(request.url);

    if (url.pathname === "/webhooks/linear" && request.method === "POST") {
      return handleLinearWebhook(request, env, storage);
    }

    if (url.pathname === "/oauth/start" && request.method === "GET") {
      return startOauth(request, env);
    }

    if (url.pathname === "/oauth/callback" && request.method === "GET") {
      return oauthCallback(request, env);
    }

    if (url.pathname === "/internal/debug/comment" && request.method === "POST") {
      return handleDebugComment(request, env);
    }

    const internalResponse = await handleInternalRequest(request, env, storage);
    if (internalResponse) {
      return internalResponse;
    }

    const state = readiness(env);

    if (url.pathname === "/healthz" && request.method === "GET") {
      return json({
        service: "linear-expert",
        status: state.ready ? 'ok' : 'partial',
        message: state.ready ? 'Expert is ready' : 'Expert is not ready',
        config: {
          workerUrl: APP_CONFIG.workerUrl,
          webhookUrl: `${APP_CONFIG.workerUrl}${APP_CONFIG.webhookPath}`,
          redirectUri: `${APP_CONFIG.workerUrl}${APP_CONFIG.oauthCallbackPath}`,
          d1DatabaseName: APP_CONFIG.d1DatabaseName,
          d1DatabaseId: APP_CONFIG.d1DatabaseId
        },
        notes: state,
        routes: {
          oauthStart: "GET /oauth/start",
          oauthCallback: "GET /oauth/callback",
          linearWebhook: "POST /webhooks/linear",
          internalList: "GET /internal/tasks?status=pending&limit=25",
          internalClaim: "POST /internal/tasks/:id/claim",
          internalResult: "POST /internal/tasks/:id/result",
          debugComment: "POST /internal/debug/comment"
        }
      }, { status: state.ready ? 200 : 503 });
    }

    if (url.pathname === "/" && request.method === "GET") {
      return new Response(
        state.ready ? 'Expert is ready' : 'Expert is not ready',
        {
          status: state.ready ? 200 : 503,
          headers: { 'content-type': 'text/plain; charset=utf-8' }
        }
      );
    }

    return json({ error: "not found" }, { status: 404 });
  }
};
