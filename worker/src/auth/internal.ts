import type { Env } from "../env";

export function assertInternalSecret(request: Request, env: Env): Response | null {
  const header = request.headers.get("authorization");
  const expected = `Bearer ${env.OPENCLAW_INTERNAL_SECRET}`;
  if (!env.OPENCLAW_INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "internal secret not configured" }), { status: 500 });
  }
  if (header !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  return null;
}
