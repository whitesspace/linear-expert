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
