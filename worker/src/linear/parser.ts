import { LinearWebhookEnvelopeSchema, type LinearEventKind } from "../domain/linear";
import type { NewTaskRecord } from "../domain/task";

const EVENT_MAP: Record<string, LinearEventKind> = {
  "Issue:create": "issue.created",
  "Comment:create": "comment.created",
  "Issue:update:workflowStateId": "issue.statusChanged",
  "Issue:update:assigneeId": "issue.assigned",
};

function resolveEventKey(payload: { type: string; action: string; updatedFrom?: Record<string, unknown> | null }) {
  if (payload.action === "update" && payload.updatedFrom && typeof payload.updatedFrom === "object") {
    const updatedKeys = Object.keys(payload.updatedFrom);
    if (updatedKeys.length === 1) {
      return `${payload.type}:${payload.action}:${updatedKeys[0]}`;
    }
  }
  return `${payload.type}:${payload.action}`;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function pickIssueIdentifier(data: Record<string, unknown>): string | null {
  return (
    asString(data.identifier) ??
    asString(data.issueIdentifier) ??
    (typeof data.number === "number" ? `ISSUE-${data.number}` : null)
  );
}

function pickWorkspaceId(payload: Record<string, unknown>): string {
  return (
    asString(payload.organizationId) ??
    "unknown-workspace"
  );
}

function pickActorName(data: Record<string, unknown>, fallback: string | null): string | null {
  return (
    asString((data.actor as Record<string, unknown>)?.name) ??
    asString((data.user as Record<string, unknown>)?.name) ??
    asString((data.author as Record<string, unknown>)?.name) ??
    fallback
  );
}

export function parseLinearWebhook(raw: unknown, rawBody: string): NewTaskRecord | null {
  const payload = LinearWebhookEnvelopeSchema.safeParse(raw);
  if (!payload.success) {
    console.warn("invalid Linear payload", payload.error.flatten());
    return null;
  }

  const envelope = payload.data;
  const key = resolveEventKey({
    type: envelope.type,
    action: envelope.action,
    updatedFrom: (envelope as Record<string, unknown>).updatedFrom as Record<string, unknown> | undefined,
  });
  const eventType = EVENT_MAP[key];
  if (!eventType) {
    return null;
  }

  const data = envelope.data as Record<string, unknown>;
  const issueId = ((): string | null => {
    if (envelope.type === "Issue") {
      return asString(data.id);
    }
    if (envelope.type === "Comment") {
      return asString(data.issueId);
    }
    return asString(data.issueId ?? data.id) ?? null;
  })();

  if (!issueId) {
    return null;
  }

  const newTask: NewTaskRecord = {
    source: "linear",
    eventType,
    webhookId: envelope.id ?? (envelope as any).webhookId,
    workspaceId: pickWorkspaceId(envelope as Record<string, unknown>),
    organizationId: asString(envelope.organizationId) ?? null,
    issueId,
    issueIdentifier: pickIssueIdentifier(data),
    commentId: envelope.type === "Comment" ? asString(data.id) : null,
    actorId: asString(envelope.userId) ?? asString(data.userId),
    actorName: pickActorName(data, asString(envelope.userId)),
    payloadJson: rawBody,
  };

  if (eventType === "issue.assigned" || eventType === "issue.statusChanged") {
    // v0 暂不处理这些事件，仍返回 null 以便跳过。
    return null;
  }

  return newTask;
}
