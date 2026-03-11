import type { Env } from "../env";
import { json } from "../lib/http";
import { parseLinearWebhook } from "../linear/parser";
import { verifyLinearSignature } from "../linear/signature";
import type { StorageAdapter } from "../storage/types";

export async function handleLinearWebhook(request: Request, env: Env, storage: StorageAdapter): Promise<Response> {
  if (!env.LINEAR_WEBHOOK_SECRET) {
    return json({ error: "webhook secret missing" }, { status: 500 });
  }
  const rawBody = await request.text();
  const signature =
    request.headers.get("linear-signature") ||
    request.headers.get("x-linear-signature") ||
    request.headers.get("x-webhook-signature");
  const valid = await verifyLinearSignature({
    secret: env.LINEAR_WEBHOOK_SECRET,
    payload: rawBody,
    headerSignature: signature,
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
    const invokePayload = {
      type: `AgentSessionEvent.${(parsed as any)?.action ?? "created"}`,
      createdAt: (parsed as any)?.createdAt ?? data?.createdAt,
      agentSessionId: data?.agentSessionId ?? data?.id ?? (parsed as any)?.agentSessionId,
      workspaceId: (parsed as any)?.organizationId ?? data?.organizationId ?? data?.workspaceId,
      promptContext: data?.promptContext ?? (parsed as any)?.promptContext,
      issue: data?.issue ?? (parsed as any)?.issue,
      guidance: data?.guidance ?? (parsed as any)?.guidance,
    };

    const url = new URL(request.url);
    const invokeUrl = `${url.origin}/internal/invoke/agent-session`;
    const resp = await fetch(invokeUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENCLAW_INTERNAL_SECRET}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(invokePayload),
    });

    return json({ status: "accepted", kind: "agentSession", invokeStatus: resp.status }, { status: 200 });
  }

  // WS-37: Comment fallback invocation (C):
  // - trigger if isArtificialAgentSessionRoot=true OR comment body contains @/mention-like token.
  if (linearEvent === "Comment") {
    const bodyText = String((parsed as any)?.data?.body ?? "");
    const isRoot = Boolean((parsed as any)?.data?.isArtificialAgentSessionRoot);
    const hasMention = bodyText.includes("@") || bodyText.includes("/expert") || bodyText.includes("/agent") || bodyText.includes("/invoke");

    if (isRoot || hasMention) {
      const data = (parsed as any)?.data ?? {};
      const invokePayload = {
        type: `AgentSessionEvent.created`,
        createdAt: (parsed as any)?.createdAt ?? data?.createdAt,
        agentSessionId: undefined,
        workspaceId: (parsed as any)?.organizationId ?? data?.organizationId,
        promptContext: {
          issue: data?.issue,
          comment: { body: data?.body, id: data?.id },
        },
        issue: data?.issue,
        guidance: undefined,
      };

      const url = new URL(request.url);
      const invokeUrl = `${url.origin}/internal/invoke/agent-session`;
      const resp = await fetch(invokeUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.OPENCLAW_INTERNAL_SECRET}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(invokePayload),
      });

      return json({ status: "accepted", kind: "comment_fallback", invokeStatus: resp.status }, { status: 200 });
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
