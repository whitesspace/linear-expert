import { z } from "zod";
import type { Env } from "../env";
import { json } from "../lib/http";
import { assertInternalSecret } from "../auth/internal";
import type { StorageAdapter } from "../storage/types";
import { createAgentActivity } from "../linear/agent";
import { getIssueWorkflowState, listTeamStates, transitionIssueState } from "../linear/client";
import { clearStop, requestStop } from "../storage/stop";
import { buildEnrichedPrompt, type PromptContext } from "../linear/prompt-builder";
import {
  isInflightSession,
  markInflightSession,
  clearInflightSession,
  isWebhookProcessed,
  markWebhookProcessed,
  getDedupWindow,
} from "../linear/dedup";
import { createOrRestoreSession, updateSessionActivity, completeSession, failSession } from "../linear/session-lifecycle";
import { restoreSessionContext } from "../linear/session-context";

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

function normalizeStateType(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

function isTerminalOrStartedState(stateType: string | undefined): boolean {
  return stateType === "started" || stateType === "completed" || stateType === "canceled" || stateType === "cancelled";
}

async function moveIssueToStartedStateIfNeeded(
  env: Env,
  workspaceId: string,
  issue: unknown,
): Promise<void> {
  const issueId = pickString(issue, ["id"]);
  if (!issueId) return;

  let teamId = pickString(issue, ["team", "id"]);
  let stateType = normalizeStateType(pickString(issue, ["state", "type"]));

  if (!teamId || !stateType) {
    const workflow = await getIssueWorkflowState(env, workspaceId, issueId);
    teamId = teamId ?? workflow.issue?.team?.id ?? undefined;
    stateType = stateType ?? normalizeStateType(workflow.issue?.state?.type ?? undefined);
  }

  if (isTerminalOrStartedState(stateType) || !teamId) {
    return;
  }

  const states = await listTeamStates(env, workspaceId, teamId);
  const firstStartedState = [...states.states]
    .filter((state) => normalizeStateType(state.type ?? undefined) === "started")
    .sort((left, right) => (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER))[0];

  if (!firstStartedState?.id) {
    return;
  }

  await transitionIssueState(env, workspaceId, {
    issueId,
    stateId: firstStartedState.id,
  });
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

    const eventType = payload.data.type;
    const agentSessionId = payload.data.agentSessionId;

    // 去重：检查会话是否已在处理中
    if (agentSessionId && isInflightSession(agentSessionId, eventType)) {
      console.info(`dedup: skipping duplicate agent session ${agentSessionId.slice(0, 8)}... (event=${eventType})`);
      return json({ status: "duplicate", reason: "session_inflight" }, { status: 200 });
    }

    const traceId = makeTraceId();

    // 标记会话为 in-flight
    if (agentSessionId) {
      markInflightSession(agentSessionId, eventType);
    }

    const latestUserMessage = extractAgentActivityBody(payload.data.agentActivity);

    const origin = new URL(request.url).origin;

    // 🆕 检查是否存在持久化会话（即使几天/几周前）
    let restoredContext = null;
    if (agentSessionId && payload.data.workspaceId) {
      restoredContext = await restoreSessionContext(env, payload.data.workspaceId, agentSessionId, storage);
    }

    const promptContext: PromptContext = {
      issue: payload.data.issue as any,
      guidance: typeof payload.data.guidance === "string" ? payload.data.guidance : undefined,
      promptContext: payload.data.promptContext,
      latestUserMessage,
      eventType: payload.data.type,
      workspaceId: payload.data.workspaceId ?? undefined,
      agentSessionId: payload.data.agentSessionId ?? undefined,
      traceId,
    };

    // 如果存在历史会话，添加上下文摘要
    if (restoredContext?.exists && restoredContext.summaryPrompt) {
      promptContext.restoredContext = restoredContext.summaryPrompt;

      // 更新会话的最后活动时间
      if (restoredContext.sessionRecord) {
        await storage.sessions.updateLastActivity(restoredContext.sessionRecord.id);
      }
    }

    const firstThoughtPrompt = buildEnrichedPrompt(promptContext, origin);

    // WS-37: write trace -> agentSessionId/workspaceId map for later correlation.
    await storage.trace.set(traceId, {
      agentSessionId: payload.data.agentSessionId ?? undefined,
      workspaceId: payload.data.workspaceId ?? undefined,
      eventType: payload.data.type,
      createdAt: new Date().toISOString(),
    });

    const hasSession = Boolean(payload.data.workspaceId && payload.data.agentSessionId);
    const isCreatedEvent = payload.data.type.includes("created");

    // 🆕 创建或恢复会话（持久化）
    if (hasSession) {
      const wsId = payload.data.workspaceId!;
      const sessionId = payload.data.agentSessionId!;

      await createOrRestoreSession(
        storage,
        sessionId,
        wsId,
        (payload.data.issue as any)?.id,
        (payload.data.issue as any)?.identifier,
        (payload.data.issue as any)?.title,
        (payload.data.issue as any)?.url,
      );

      // v0: write the first AgentActivity(thought) back to Linear within the 10s budget.
      if (isCreatedEvent) {
        // Agent 开始处理后，按 Linear 推荐尽快推进到首个 started 状态。
        try {
          await moveIssueToStartedStateIfNeeded(env, wsId, payload.data.issue);
        } catch (error) {
          console.warn("invoke.created failed to move issue to started state", error);
        }

        await createAgentActivity(env, wsId, {
          agentSessionId: sessionId,
          type: "thought",
          content: {
            body: firstThoughtPrompt,
          },
        });
        clearStop(env, sessionId);
      }
    } else {
      // 如果没有 session，清除 in-flight 标记
      if (agentSessionId) {
        clearInflightSession(agentSessionId);
      }
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
          // 🆕 添加恢复的上下文信息
          restoredContext: restoredContext?.exists ? {
            timeSinceLastActivity: restoredContext.timeSinceLastActivity,
            activityCount: restoredContext.sessionRecord?.activityCount,
            lastActivityAt: restoredContext.sessionRecord?.lastActivityAt,
          } : undefined,
        },
        api: {
          baseUrl: origin,
        },
      };
      const run = await storage.agentRuns.create({
        traceId,
        agentSessionId: payload.data.agentSessionId!,
        workspaceId: payload.data.workspaceId!,
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
        wroteThought: hasSession && isCreatedEvent,
        queuedRunId,
        restored: restoredContext?.exists ? true : undefined,
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

    const agentSessionId = payload.data.agentSessionId;
    const workspaceId = payload.data.workspaceId;

    const latestUserMessage = extractAgentActivityBody(payload.data.agentActivity);

    const origin = new URL(request.url).origin;

    const promptContext: PromptContext = {
      issue: payload.data.issue as any,
      guidance: typeof payload.data.guidance === "string" ? payload.data.guidance : undefined,
      promptContext: payload.data.promptContext,
      latestUserMessage,
      eventType: payload.data.type || "AgentSessionEvent.created",
      workspaceId: workspaceId ?? undefined,
      agentSessionId: agentSessionId ?? undefined,
      traceId,
    };

    const firstThoughtPrompt = buildEnrichedPrompt(promptContext, origin);

    // WS-37: keep replay endpoint consistent with production invocation by writing trace correlation too.
    await storage.trace.set(traceId, {
      agentSessionId: agentSessionId ?? undefined,
      workspaceId: workspaceId ?? undefined,
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
          agentSessionId: agentSessionId,
          workspaceId: workspaceId,
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
      const wsId = payload.data.workspaceId!;
      const sessionId = payload.data.agentSessionId!;
      requestStop(env, sessionId);
      await createAgentActivity(env, wsId, {
        agentSessionId: sessionId,
        type: "response",
        content: {
          body: "已收到 stop signal，将立即停止后续动作。",
        },
      });

      return json({ ok: true, traceId, reserved: { receivedType: signalType, stopped: true } }, { status: 200 });
    }

    // For other signals, just acknowledge with a derived prompt.
    const origin = new URL(request.url).origin;

    const promptContext: PromptContext = {
      issue: undefined,
      guidance: undefined,
      promptContext: payload.data.data,
      latestUserMessage: undefined,
      eventType: `signal:${signalType}`,
      workspaceId: payload.data.workspaceId ?? undefined,
      agentSessionId: payload.data.agentSessionId ?? undefined,
      traceId,
    };

    const firstThoughtPrompt = buildEnrichedPrompt(promptContext, origin);

    return json({ ok: true, traceId, reserved: { receivedType: signalType, firstThoughtPrompt } }, { status: 200 });
  }

  return json({ error: "not found" }, { status: 404 });
}
