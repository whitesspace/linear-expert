import { z } from "zod";
import type { Env } from "../env";
import { json } from "../lib/http";
import { assertInternalSecret } from "../auth/internal";
import type { StorageAdapter } from "../storage/types";

/**
 * WS-37 (stub): Invocation layer reserved routes.
 *
 * This module intentionally does NOT implement real Linear AgentSession/AgentActivity writes yet.
 * It only provides stable integration points and strict boundaries:
 * - invocation layer: receives agent session events/signals, orchestrates session lifecycle
 * - execution layer: existing /internal/* routes that only perform Linear-native actions
 */

const AgentSessionEventSchema = z.object({
  type: z.string().min(1),
  createdAt: z.string().min(1).optional(),
  agentSessionId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  // NOTE: real payload contains richer structures like promptContext, issue, comment, guidance, etc.
  // We keep this loose for now to avoid coupling during the reservation stage.
  promptContext: z.unknown().optional(),
});

const InvokeSignalSchema = z.object({
  // Reserved signal types for future orchestration.
  // Keep strict enough to avoid accidental coupling to random payloads.
  type: z.enum(["stop", "select", "auth"]).or(z.string().min(1)),
  agentSessionId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  // Optional opaque signal data (e.g. user selection, auth grants)
  data: z.unknown().optional(),
});

const InvokeResponseSchema = z.object({
  ok: z.literal(true),
  traceId: z.string().min(1),
  // reserved fields for future: externalUrls, sessionStatus, firstActivity, etc.
  reserved: z.record(z.unknown()).optional(),
});

function makeTraceId(): string {
  // simple trace id; later: propagate from webhook headers or explicit field
  return `trace_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("invalid JSON");
  }
}

export async function handleInvokeRequest(
  request: Request,
  env: Env,
  storage: StorageAdapter,
): Promise<Response | null> {
  const url = new URL(request.url);

  // Reserve a stable namespace for invocation layer.
  if (!url.pathname.startsWith("/internal/invoke")) return null;

  // Internal-only; same auth as execution layer.
  try {
    assertInternalSecret(request, env);
  } catch (error) {
    return json({ error: "unauthorized" }, { status: 401 });
  }

  if (url.pathname === "/internal/invoke/agent-session" && request.method === "POST") {
    const payload = AgentSessionEventSchema.safeParse(await parseJson(request));
    if (!payload.success) {
      return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
    }

    // WS-37: Stub behavior.
    // Required by AIG: respond quickly (<5s). In future we will emit a thought activity within 10s.
    const traceId = makeTraceId();

    // Future reserved: write to storage for audit and fan out to real invocation orchestrator.
    void storage; // reserved

    const body = InvokeResponseSchema.parse({
      ok: true,
      traceId,
      reserved: {
        note: "WS-37 stub: invocation boundary reserved; no session writes yet",
        receivedType: payload.data.type,
      },
    });

    return json(body, { status: 200 });
  }

  if (url.pathname === "/internal/invoke/signal" && request.method === "POST") {
    // Reserved for stop/auth/select signals.
    const payload = InvokeSignalSchema.safeParse(await parseJson(request));
    if (!payload.success) {
      return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
    }

    const traceId = makeTraceId();
    return json(
      {
        ok: true,
        traceId,
        reserved: {
          note: "WS-37 stub: signal handling reserved",
          receivedType: payload.data.type,
        },
      },
      { status: 200 },
    );
  }

  return json({ error: "not found" }, { status: 404 });
}
