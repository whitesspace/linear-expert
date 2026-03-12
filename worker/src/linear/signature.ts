import { LinearWebhookClient, LINEAR_WEBHOOK_TS_FIELD } from "@linear/sdk/webhooks";

function readPayloadTimestamp(payload: string): number | undefined {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const value = parsed[LINEAR_WEBHOOK_TS_FIELD];
    return typeof value === "number" ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function verifyLinearSignature(options: {
  secret: string;
  payload: string;
  headerSignature: string | null;
  headerTimestamp?: string | null;
}): Promise<boolean> {
  const { secret, payload, headerSignature, headerTimestamp } = options;
  if (!headerSignature) {
    return false;
  }

  try {
    const client = new LinearWebhookClient(secret);
    const timestamp = headerTimestamp ?? readPayloadTimestamp(payload);
    const rawBody = payload as unknown as Parameters<LinearWebhookClient["verify"]>[0];
    client.verify(rawBody, headerSignature.trim(), timestamp);
    return true;
  } catch (error) {
    console.warn("linear signature verification error", error);
    return false;
  }
}
