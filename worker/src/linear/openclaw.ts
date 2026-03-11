import type { Env } from "../env";

export type OpenClawRunRequest = {
  traceId: string;
  sessionKey: string;
  prompt: string;
  context?: Record<string, unknown>;
};

export type OpenClawRunResponse = {
  ok: boolean;
  intent?: unknown;
  error?: string;
};

function openclawUrl(env: Env): string {
  // Default to local gateway; allow override.
  return (env.OPENCLAW_WEBHOOK_URL || "http://127.0.0.1:18789/internal/invoke/openclaw/run").toString();
}

export async function callOpenClaw(env: Env, req: OpenClawRunRequest): Promise<OpenClawRunResponse> {
  const url = openclawUrl(env);
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENCLAW_INTERNAL_SECRET}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(req),
  });

  const text = await resp.text();
  if (!resp.ok) {
    return { ok: false, error: `openclaw_http_${resp.status}: ${text.slice(0, 500)}` };
  }

  try {
    const json = JSON.parse(text);
    return json as OpenClawRunResponse;
  } catch {
    return { ok: false, error: `openclaw_invalid_json: ${text.slice(0, 500)}` };
  }
}
