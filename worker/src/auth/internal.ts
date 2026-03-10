import type { Env } from "../env";

function timingSafeEqual(a: string, b: string): boolean {
  // Best-effort constant-time compare for same-length strings.
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function assertInternalSecret(request: Request, env: Env): Response | null {
  const header = (request.headers.get("authorization") || "").trim();
  const expected = `Bearer ${env.OPENCLAW_INTERNAL_SECRET || ""}`.trim();

  if (!env.OPENCLAW_INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "internal secret not configured" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  if (!timingSafeEqual(header, expected)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  return null;
}
