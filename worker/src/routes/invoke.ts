import { z } from "zod";
import type { Env } from "../env";
import { json } from "../lib/http";
import { assertInternalSecret } from "../auth/internal";
import type { StorageAdapter } from "../storage/types";
import { createAgentActivity } from "../linear/agent";
import { clearStop, requestStop } from "../storage/stop";

/**
 * WS-37 (stub): Invocation layer reserved routes.
 *
 * This module implements the invocation boundary and v0 end-to-end webhook handling.
 * It provides stable integration points and strict boundaries:
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
  agentActivity: z.unknown().optional(),
  previousComments: z.unknown().optional(),
});

type FirstThoughtInput = {
  eventType: string;
  agentSessionId?: string;
  workspaceId?: string;
  traceId?: string;
  promptContext?: unknown;
  issue?: unknown;
  guidance?: unknown;
  latestUserMessage?: string;
};

function pickString(obj: unknown, path: string[]): string | undefined {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur && typeof cur === "object" && key in cur) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  if (typeof cur === "string") return cur.trim() || undefined;
  return undefined;
}

function extractPromptContextText(promptContext: unknown): string | undefined {
  if (typeof promptContext === "string") {
    return promptContext.trim() || undefined;
  }
  if (promptContext && typeof promptContext === "object") {
    const maybeText =
      pickString(promptContext, ["text"]) ||
      pickString(promptContext, ["comment", "body"]) ||
      pickString(promptContext, ["comment", "text"]);
    return maybeText;
  }
  return undefined;
}

function extractAgentActivityBody(agentActivity: unknown): string | undefined {
  return pickString(agentActivity, ["body"]);
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

  const promptContextText = extractPromptContextText(input.promptContext);

  const workspaceHint = input.workspaceId ? `workspace=${input.workspaceId}` : undefined;
  const sessionHint = input.agentSessionId ? `agentSessionId=${input.agentSessionId}` : undefined;
  const traceHint = input.traceId ? `traceId=${input.traceId}` : undefined;

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
    (input.latestUserMessage ? "Respond to the latest user message in this agent session." : undefined) ||
    (recentComment ? `Respond to the latest comment and take appropriate Linear-native actions.` : undefined) ||
    `Handle AgentSessionEvent type=${input.eventType}.`;

  const sourceHints: string[] = [];
  if (guidanceText) sourceHints.push("guidance");
  if (promptContextText) sourceHints.push("promptContext");
  if (input.latestUserMessage) sourceHints.push("userMessage");
  if (recentComment) sourceHints.push("comment");
  if (issueTitle || issueIdentifier) sourceHints.push("issue");
  if (sourceHints.length === 0) sourceHints.push("event");

  const lines = [
    "我是 Linear Expert（agent/app），以下内容由 agent 自动生成。",
    headerParts.length ? `上下文: ${headerParts.join(" | ")}` : "上下文: (缺少 issue 元数据)",
    `可用信息源: ${sourceHints.join(", ")}.`,
    "",
    "我会按以下节奏推进：",
    "1) 读取 promptContext/issue/guidance 与最近评论，确认用户意图与约束",
    "2) 生成结构化执行意图（仅限 execution layer 允许的动作集合）",
    "3) 执行 Linear 原生动作并回写 AgentActivities（action/response/error）",
    "",
    `当前任务: ${task}`,
  ];

  if (guidanceText) {
    lines.push("", "Guidance:", guidanceText);
  }

  if (promptContextText) {
    lines.push("", "PromptContext:", promptContextText);
  }

  if (input.latestUserMessage) {
    lines.push("", "Latest user message:", input.latestUserMessage);
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

function getReplaySecret(env: Env): string | null {
  // Dev-only safety: prefer an explicit secret so replay is never accidentally exposed.
  // Fallback to OPENCLAW_INTERNAL_SECRET so local/dev can use the same auth mechanism.
  // If both are missing, replay is disabled.
  const v = env.DEV_REPLAY_SECRET || env.OPENCLAW_INTERNAL_SECRET;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function assertReplaySecret(request: Request, env: Env): Response | null {
  const secret = getReplaySecret(env);
  if (!secret) {
    return json({ error: "replay disabled" }, { status: 404 });
  }
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token || token !== secret) {
    return json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

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

    const latestUserMessage = extractAgentActivityBody(payload.data.agentActivity);

    const firstThoughtPrompt = buildFirstThoughtPrompt({
      eventType: payload.data.type,
      agentSessionId: payload.data.agentSessionId,
      workspaceId: payload.data.workspaceId,
      traceId,
      promptContext: payload.data.promptContext,
      issue: payload.data.issue,
      guidance: payload.data.guidance,
      latestUserMessage,
    });

    // WS-37: write trace -> agentSessionId/workspaceId map for later correlation.
    await storage.trace.set(traceId, {
      agentSessionId: payload.data.agentSessionId,
      workspaceId: payload.data.workspaceId,
      eventType: payload.data.type,
      createdAt: new Date().toISOString(),
    });

    const hasSession = Boolean(payload.data.workspaceId && payload.data.agentSessionId);
    const isCreatedEvent = payload.data.type.includes("created");

    // v0: write the first AgentActivity(thought) back to Linear within the 10s budget.
    if (hasSession && isCreatedEvent) {
      await createAgentActivity(env, payload.data.workspaceId, {
        agentSessionId: payload.data.agentSessionId,
        type: "thought",
        content: {
          body: firstThoughtPrompt,
        },
      });

      clearStop(env, payload.data.agentSessionId);
    }

    let queuedRunId: string | null = null;
    if (hasSession) {
      const runPayload = {
        prompt: firstThoughtPrompt,
        context: {
          eventType: payload.data.type,
          workspaceId: payload.data.workspaceId,
          agentSessionId: payload.data.agentSessionId,
          promptContext: payload.data.promptContext,
          promptContextText: extractPromptContextText(payload.data.promptContext),
          latestUserMessage,
          issue: payload.data.issue,
          guidance: payload.data.guidance,
          previousComments: payload.data.previousComments,
        },
      };
      const run = await storage.agentRuns.create({
        traceId,
        agentSessionId: payload.data.agentSessionId,
        workspaceId: payload.data.workspaceId,
        eventType: payload.data.type,
        payloadJson: JSON.stringify(runPayload),
      });
      queuedRunId = run.id;
    }

    const body = InvokeResponseSchema.parse({
      ok: true,
      traceId,
      reserved: {
        receivedType: payload.data.type,
        firstThoughtPrompt,
        wroteThought: !!(payload.data.workspaceId && payload.data.agentSessionId),
        queuedRunId,
        traceStore: {
          wrote: true,
          agentSessionId: payload.data.agentSessionId,
          workspaceId: payload.data.workspaceId,
        },
      },
    });

    return json(body, { status: 200 });
  }

  // Dev-only: replay a simulated Linear AgentSessionEvent.created through the SAME pipeline.
  // This route is secret-protected and intentionally does not require Linear signature.
  if (url.pathname === "/internal/invoke/replay/agent-session-created" && request.method === "POST") {
    const authError = assertReplaySecret(request, env);
    if (authError) return authError;

    const traceId = makeTraceId();

    // Minimal deterministic payload; caller can override fields for richer context.
    const payload = AgentSessionEventSchema.safeParse(await parseJson(request));
    if (!payload.success) {
      return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
    }

    const latestUserMessage = extractAgentActivityBody(payload.data.agentActivity);

    const firstThoughtPrompt = buildFirstThoughtPrompt({
      eventType: payload.data.type || "AgentSessionEvent.created",
      agentSessionId: payload.data.agentSessionId,
      workspaceId: payload.data.workspaceId,
      traceId,
      promptContext: payload.data.promptContext,
      issue: payload.data.issue,
      guidance: payload.data.guidance,
      latestUserMessage,
    });

    // WS-37: keep replay endpoint consistent with production invocation by writing trace correlation too.
    await storage.trace.set(traceId, {
      agentSessionId: payload.data.agentSessionId,
      workspaceId: payload.data.workspaceId,
      eventType: payload.data.type,
      createdAt: new Date().toISOString(),
    });

    // Replay does not write to Linear; it only verifies prompt derivation + trace correlation.
    const body = InvokeResponseSchema.parse({
      ok: true,
      traceId,
      reserved: {
        receivedType: payload.data.type,
        firstThoughtPrompt,
        traceStore: {
          wrote: true,
          agentSessionId: payload.data.agentSessionId,
          workspaceId: payload.data.workspaceId,
        },
      },
    });

    return json(body, { status: 200 });
  }

  if (url.pathname === "/internal/invoke/signal" && request.method === "POST") {
    const payload = InvokeSignalSchema.safeParse(await parseJson(request));
    if (!payload.success) {
      return json({ error: "invalid payload", details: payload.error.flatten() }, { status: 400 });
    }

    const traceId = makeTraceId();
    const signalType = payload.data.type;

    if (signalType === "stop" && payload.data.agentSessionId && payload.data.workspaceId) {
      requestStop(env, payload.data.agentSessionId);
      await createAgentActivity(env, payload.data.workspaceId, {
        agentSessionId: payload.data.agentSessionId,
        type: "response",
        content: {
          body: "已收到 stop signal，将立即停止后续动作。",
        },
      });

      return json({ ok: true, traceId, reserved: { receivedType: signalType, stopped: true } }, { status: 200 });
    }

    // For other signals, just acknowledge with a derived prompt.
    const firstThoughtPrompt = buildFirstThoughtPrompt({
      eventType: `signal:${signalType}`,
      agentSessionId: payload.data.agentSessionId,
      workspaceId: payload.data.workspaceId,
      traceId,
      promptContext: payload.data.data,
    });

    return json({ ok: true, traceId, reserved: { receivedType: signalType, firstThoughtPrompt } }, { status: 200 });
  }

  return json({ error: "not found" }, { status: 404 });
}
