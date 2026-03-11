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

  // WS-37: If this is an AgentSessionEvent.created webhook, route into invocation pipeline.
  // Webhook must ACK quickly; invocation route will handle the rest.
  // We keep this branch before task-queue parsing to avoid losing agent session context.
  const t = (parsed as any)?.type;
  if (t === "AgentSessionEvent" || String(t || "").includes("AgentSession")) {
    // Best-effort map fields from Linear webhook payload into invoke schema.
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

    // Call invocation handler internally (same Worker) to perform thought write etc.
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

    // Always ACK webhook quickly.
    return json({ status: "accepted", invokeStatus: resp.status }, { status: 200 });
  }

  const newTask = parseLinearWebhook(parsed, rawBody);
  if (!newTask) {
    return json({ status: "ignored" }, { status: 200 });
  }

  const duplicated = await storage.tasks.findByWebhookId(newTask.webhookId);
  if (duplicated) {
    return json({ status: "duplicate", taskId: duplicated.id }, { status: 200 });
  }

  const created = await storage.tasks.create(newTask);
  return json({ status: "accepted", taskId: created.id }, { status: 202 });
}
