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
  // Linear webhook payload includes promptContext and often issue + guidance.
  // Keep flexible but structured enough to derive a real first-thought prompt.
  promptContext: z.unknown().optional(),
  issue: z.unknown().optional(),
  guidance: z.unknown().optional(),
});

type FirstThoughtInput = {
  eventType: string;
  agentSessionId?: string;
  workspaceId?: string;
  traceId?: string;
  promptContext?: unknown;
  issue?: unknown;
  guidance?: unknown;
};

function pickString(obj: unknown, path: string[]): string | undefined {
  let cur: any = obj;
  for (const key of path) {
    if (cur && typeof cur === "object" && key in cur) cur = (cur as any)[key];
    else return undefined;
  }
  if (typeof cur === "string") return cur.trim() || undefined;
  return undefined;
}

function buildFirstThoughtPrompt(input: FirstThoughtInput): string {
  const issueTitle =
    pickString(input.issue, ["title"]) ||
    pickString(input.promptContext, ["issue", "title"]) ||
    pickString(input.promptContext, ["issue", "name"]);

  const issueIdentifier =
    pickString(input.issue, ["identifier"]) ||
    pickString(input.promptContext, ["issue", "identifier"]);

  const issueUrl =
    pickString(input.issue, ["url"]) ||
    pickString(input.promptContext, ["issue", "url"]) ||
    pickString(input.promptContext, ["issue", "externalUrl"]);

  const guidanceText =
    pickString(input.guidance, ["text"]) ||
    pickString(input.promptContext, ["guidance"]) ||
    pickString(input.promptContext, ["guidance", "text"]);

  const recentComment =
    pickString(input.promptContext, ["comment", "body"]) ||
    pickString(input.promptContext, ["comment", "text"]) ||
    pickString(input.promptContext, ["comment"]) ||
    pickString(input.promptContext, ["latestComment", "body"]);

  const workspaceHint = input.workspaceId ? `workspace=${input.workspaceId}` : undefined;
  const sessionHint = input.agentSessionId ? `agentSessionId=` : undefined;
  const traceHint = input.traceId ? `traceId=` : undefined;

  const headerParts = [
    issueIdentifier && issueTitle ? `${issueIdentifier} — ${issueTitle}` : issueTitle || issueIdentifier,
    issueUrl,
    workspaceHint,    sessionHint,
    traceHint,
  ].filter(Boolean);

  // Derive a concrete task statement from available context.
  const task =
    pickString(input.promptContext, ["task"]) ||
    pickString(input.promptContext, ["intent"]) ||
    pickString(input.promptContext, ["userRequest"]) ||
    (recentComment ? `Respond to the latest comment and take appropriate Linear-native actions.` : undefined) ||
    `Handle AgentSessionEvent type=${input.eventType}.`;

  const sourceHints: string[] = [];
  if (guidanceText) sourceHints.push("guidance");
  if (recentComment) sourceHints.push("comment");
  if (issueTitle || issueIdentifier) sourceHints.push("issue");
  if (sourceHints.length === 0) sourceHints.push("event");

  const lines = [
    "You are the Linear Expert agent invoked by a Linear AgentSessionEvent.",
    headerParts.length ? `Context: ${headerParts.join(" | ")}` : "Context: (no issue metadata provided)",
    `Sources present: ${sourceHints.join(", ")}.`,
    "",
    "Objective (first 10s): emit a concise thought activity that reflects the real issue context.",
    "Do NOT execute actions yet in this step; only outline intent + immediate next check.",
    "",
    `Task: ${task}`,
  ];

  if (guidanceText) {
    lines.push("", "Guidance:", guidanceText);
  }

  if (recentComment) {
    lines.push("", "Latest user comment:", recentComment);
  }

  return lines.join("\n").trim();
}

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
  const authError = assertInternalSecret(request, env);
  if (authError) return authError;

  if (url.pathname === "/internal/invoke/agent-session" && request.method === "POST") {
    const payload = AgentSessionEventSchema.safeParse(await parseJson(request));
    if (!payload.success) {
      return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
    }

    const traceId = makeTraceId();

    // WS-37 increment: produce a *real* first-thought prompt content derived from promptContext/issue.
    // We still avoid execution actions here (strict boundary).
    const firstThoughtPrompt = buildFirstThoughtPrompt({
      eventType: payload.data.type,
      agentSessionId: payload.data.agentSessionId,
      workspaceId: payload.data.workspaceId,
      traceId,
      promptContext: payload.data.promptContext,
      issue: payload.data.issue,
      guidance: payload.data.guidance,
    });

    // Reserved: write to storage for audit and fan out to orchestrator.
    // NOTE: storage adapter might persist trace/session mapping in future.
    void storage;

    const body = InvokeResponseSchema.parse({
      ok: true,
      traceId,
      reserved: {
        note: "WS-37: invocation boundary reserved; first-thought prompt derived (no execution)",
        receivedType: payload.data.type,
        firstThoughtPrompt,
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
    // Signals are invocation-only; execution layer must not interpret them.
    // For now we acknowledge and expose a derived prompt for stop/select/auth handling.
    const signalType = payload.data.type;
    const firstThoughtPrompt = buildFirstThoughtPrompt({
      eventType: `signal:`,
      agentSessionId: payload.data.agentSessionId,
      workspaceId: payload.data.workspaceId,
      traceId,
      promptContext: payload.data.data,
    });

    return json(
      {
        ok: true,
        traceId,
        reserved: {
          note: "WS-37: signal boundary reserved; prompt derived (no execution)",
          receivedType: signalType,
          firstThoughtPrompt,
        },
      },
      { status: 200 },
    );
  }

  return json({ error: "not found" }, { status: 404 });
}
