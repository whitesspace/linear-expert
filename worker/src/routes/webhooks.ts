import type { Env } from "../env";
import { json } from "../lib/http";
import { buildAgentSessionExternalUrls, createAgentSessionOnComment, createAgentSessionOnIssue, updateAgentSessionExternalUrls } from "../linear/agent";
import { getInstallationIdentityForWorkspace } from "../linear/client";
import { parseLinearWebhook } from "../linear/parser";
import { verifyLinearSignature } from "../linear/signature";
import type { StorageAdapter } from "../storage/types";
import { handleAgentSessionInvokePayload } from "./invoke";

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getChangedKeys(payload: unknown): string[] {
  const updatedFrom =
    (payload as Record<string, unknown> | null)?.updatedFrom ??
    ((payload as Record<string, unknown> | null)?.data as Record<string, unknown> | undefined)?.updatedFrom;
  if (!updatedFrom || typeof updatedFrom !== "object") return [];
  return Object.keys(updatedFrom);
}

function buildSyntheticCreatedPayload(input: {
  agentSessionId: string;
  workspaceId: string;
  issue?: unknown;
  promptContext?: unknown;
  latestUserMessage?: string;
  guidance?: unknown;
  previousComments?: unknown;
}) {
  return {
    type: "AgentSessionEvent.created",
    agentSessionId: input.agentSessionId,
    workspaceId: input.workspaceId,
    issue: input.issue,
    promptContext: input.promptContext,
    guidance: input.guidance,
    agentActivity: input.latestUserMessage ? { body: input.latestUserMessage } : undefined,
    previousComments: input.previousComments,
  };
}

async function invokeAgentSession(
  request: Request,
  env: Env,
  storage: StorageAdapter,
  payload: Record<string, unknown>,
): Promise<Response> {
  try {
    const resp = await handleAgentSessionInvokePayload(payload as any, env, storage, new URL(request.url).origin);
    if (!resp.ok) {
      const message = (await resp.text()).slice(0, 800);
      console.error("agent_session invoke failed", { status: resp.status, message });
      return json({ error: "invoke_failed", invokeStatus: resp.status }, { status: 502 });
    }
    return json({ status: "accepted", kind: "agentSession", invokeStatus: resp.status }, { status: 200 });
  } catch (error) {
    console.error("agent_session invoke transport error", error);
    return json({ error: "invoke_failed" }, { status: 502 });
  }
}

export async function handleLinearWebhook(request: Request, env: Env, storage: StorageAdapter): Promise<Response> {
  if (!env.LINEAR_WEBHOOK_SECRET) {
    return json({ error: "webhook secret missing" }, { status: 500 });
  }
  const rawBody = await request.text();
  const timestamp = request.headers.get("linear-timestamp");
  const signature =
    request.headers.get("linear-signature") ||
    request.headers.get("x-linear-signature") ||
    request.headers.get("x-webhook-signature");
  const valid = await verifyLinearSignature({
    secret: env.LINEAR_WEBHOOK_SECRET,
    payload: rawBody,
    headerSignature: signature,
    headerTimestamp: timestamp,
  });
  if (!valid) {
    return json({ error: "invalid signature" }, { status: 401 });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch (error) {
    console.warn("failed to parse linear webhook", error);
    return json({ error: "invalid JSON" }, { status: 400 });
  }


  const linearEvent = request.headers.get("linear-event") || "";
  const payloadKeys = parsed && typeof parsed === "object" ? Object.keys(parsed as any).slice(0, 30) : [];
  const dataKeys = (parsed as any)?.data && typeof (parsed as any).data === "object" ? Object.keys((parsed as any).data).slice(0, 30) : [];

  // Always accept all Linear webhook event types (compat), but only execute behavior for supported types.
  console.info("linear_webhook", {
    linearEvent,
    payloadKeys,
    dataKeys,
  });

  // WS-37: If this is an AgentSessionEvent-like webhook, route into invocation pipeline.
  const eventType = (parsed as any)?.type;
  if (eventType === "AgentSessionEvent" || String(eventType || "").includes("AgentSession") || linearEvent.includes("AgentSession")) {
    const data = (parsed as any)?.data ?? {};
    const agentSession = (parsed as any)?.agentSession ?? data?.agentSession;
    const agentActivity = (parsed as any)?.agentActivity ?? data?.agentActivity;
    const invokePayload = {
      type: `AgentSessionEvent.${(parsed as any)?.action ?? "created"}`,
      createdAt: (parsed as any)?.createdAt ?? data?.createdAt,
      agentSessionId: agentSession?.id ?? data?.agentSessionId ?? data?.id ?? (parsed as any)?.agentSessionId,
      workspaceId: (parsed as any)?.organizationId ?? agentSession?.organizationId ?? data?.organizationId ?? data?.workspaceId,
      promptContext: data?.promptContext ?? (parsed as any)?.promptContext,
      issue: agentSession?.issue ?? data?.issue ?? (parsed as any)?.issue,
      guidance: data?.guidance ?? (parsed as any)?.guidance,
      agentActivity,
      previousComments: (parsed as any)?.previousComments ?? data?.previousComments,
    };
    return invokeAgentSession(request, env, storage, invokePayload);
  }

  // WS-37: Comment fallback invocation (C):
  // - trigger if isArtificialAgentSessionRoot=true OR comment body contains @/mention-like token.
  if (linearEvent === "Comment") {
    const bodyText = String((parsed as any)?.data?.body ?? "");
    const isRoot = Boolean((parsed as any)?.data?.isArtificialAgentSessionRoot);
    const hasMention = bodyText.includes("@") || bodyText.includes("/expert") || bodyText.includes("/agent") || bodyText.includes("/invoke");

    if (isRoot || hasMention) {
      const data = (parsed as any)?.data ?? {};
      const workspaceId = (parsed as any)?.organizationId ?? data?.organizationId;
      if (!workspaceId || !data?.id) {
        return json({ status: "skipped", kind: "comment_fallback", reason: "missing workspaceId/commentId" }, { status: 200 });
      }

      try {
        const session = await createAgentSessionOnComment(env, workspaceId, data.id);
        if (!session.agentSessionId) {
          return json({ error: "comment_fallback_failed", kind: "comment_fallback", message: "missing agentSessionId" }, { status: 502 });
        }
        await updateAgentSessionExternalUrls(
          env,
          workspaceId,
          session.agentSessionId,
          buildAgentSessionExternalUrls(new URL(request.url).origin, session.agentSessionId),
        );

        const invokeResponse = await invokeAgentSession(request, env, storage, buildSyntheticCreatedPayload({
          agentSessionId: session.agentSessionId,
          workspaceId,
          issue: data.issue,
          promptContext: bodyText,
          latestUserMessage: bodyText,
          previousComments: [],
        }));
        if (!invokeResponse.ok) {
          return invokeResponse;
        }

        return json({ status: "accepted", kind: "comment_fallback", session, invoked: true }, { status: 200 });
      } catch (error) {
        const message = String(error ?? "");
        if (message.toLowerCase().includes("already has an agent session")) {
          return json({ status: "accepted", kind: "comment_fallback", reason: "already_has_session" }, { status: 200 });
        }
        console.error("comment_fallback create session error", error);
        return json({ error: "comment_fallback_failed", kind: "comment_fallback", message }, { status: 502 });
      }
    }
  }

  if (eventType === "Issue" && String((parsed as any)?.action ?? "").includes("update")) {
    const data = (parsed as any)?.data ?? {};
    const workspaceId = (parsed as any)?.organizationId ?? data?.organizationId;
    const changedKeys = getChangedKeys(parsed);
    const assignmentChanged = changedKeys.includes("delegateId") || changedKeys.includes("assigneeId");
    const candidateUserId = readString(data?.delegateId) ?? readString(data?.assigneeId);

    if (workspaceId && data?.id && assignmentChanged && candidateUserId) {
      try {
        const identity = await getInstallationIdentityForWorkspace(env, workspaceId);
        if (identity?.viewerId && candidateUserId === identity.viewerId) {
          const session = await createAgentSessionOnIssue(env, workspaceId, data.id);
          if (!session.agentSessionId) {
            return json({ error: "issue_assignment_session_failed", kind: "issue_assignment", message: "missing agentSessionId" }, { status: 502 });
          }
          await updateAgentSessionExternalUrls(
            env,
            workspaceId,
            session.agentSessionId,
            buildAgentSessionExternalUrls(new URL(request.url).origin, session.agentSessionId),
          );

          const invokeResponse = await invokeAgentSession(request, env, storage, buildSyntheticCreatedPayload({
            agentSessionId: session.agentSessionId,
            workspaceId,
            issue: data,
            promptContext: `Issue was assigned to the agent. Review the issue and respond in this session.`,
            previousComments: [],
          }));
          if (!invokeResponse.ok) {
            return invokeResponse;
          }

          return json({ status: "accepted", kind: "issue_assignment", session, invoked: true }, { status: 200 });
        }
      } catch (error) {
        const message = String(error ?? "");
        if (message.toLowerCase().includes("already has an agent session")) {
          return json({ status: "accepted", kind: "issue_assignment", reason: "already_has_session" }, { status: 200 });
        }
        console.error("issue_assignment create session error", error);
        return json({ error: "issue_assignment_failed", kind: "issue_assignment", message }, { status: 502 });
      }
    }
  }

  // For all other events, try the existing task-queue parser; if unsupported, ignore quietly.
  const newTask = parseLinearWebhook(parsed, rawBody);
  if (!newTask) {
    return json({ status: "ignored", kind: linearEvent || "unknown" }, { status: 200 });
  }

  const duplicated = await storage.tasks.findByWebhookId(newTask.webhookId);
  if (duplicated) {
    return json({ status: "duplicate", taskId: duplicated.id }, { status: 200 });
  }

  const created = await storage.tasks.create(newTask);
  return json({ status: "accepted", taskId: created.id }, { status: 202 });
}
