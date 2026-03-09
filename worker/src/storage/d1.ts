import type {
  NewTaskRecord,
  OAuthTokenRecord,
  ReplyDraft,
  ReplyRecord,
  TaskFilter,
  TaskRecord,
  TaskResultPatch,
} from "../domain/task";
import type { OAuthStore, ReplyStore, StorageAdapter, TaskStore } from "./types";

const ISO = () => new Date().toISOString();

function mapTaskRow(row: Record<string, unknown>): TaskRecord {
  return {
    id: row.id as string,
    source: row.source as "linear",
    eventType: row.event_type as string,
    webhookId: row.webhook_id as string,
    workspaceId: row.workspace_id as string,
    organizationId: (row.organization_id as string) ?? null,
    issueId: row.issue_id as string,
    issueIdentifier: (row.issue_identifier as string) ?? null,
    commentId: (row.comment_id as string) ?? null,
    actorId: (row.actor_id as string) ?? null,
    actorName: (row.actor_name as string) ?? null,
    payloadJson: row.payload_json as string,
    status: row.status as TaskRecord["status"],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    lockExpiresAt: (row.lock_expires_at as string) ?? null,
    resultAction: (row.result_action as TaskRecord["resultAction"]) ?? undefined,
    resultReason: (row.result_reason as string) ?? null,
    replyBody: (row.reply_body as string) ?? null,
  };
}

class D1TaskStore implements TaskStore {
  constructor(private readonly db: D1Database) {}

  async create(task: NewTaskRecord): Promise<TaskRecord> {
    const now = ISO();
    const id = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO tasks (
          id, source, event_type, webhook_id, workspace_id, organization_id,
          issue_id, issue_identifier, comment_id, actor_id, actor_name,
          payload_json, status, created_at, updated_at, lock_expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL)`
      )
      .bind(
        id,
        task.source,
        task.eventType,
        task.webhookId,
        task.workspaceId,
        task.organizationId,
        task.issueId,
        task.issueIdentifier,
        task.commentId,
        task.actorId,
        task.actorName,
        task.payloadJson,
        now,
        now,
      )
      .run();
    return {
      ...task,
      id,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      lockExpiresAt: null,
    };
  }

  async findByWebhookId(webhookId: string): Promise<TaskRecord | null> {
    const result = await this.db
      .prepare(`SELECT * FROM tasks WHERE webhook_id = ? LIMIT 1`)
      .bind(webhookId)
      .first();
    return result ? mapTaskRow(result) : null;
  }

  async listByStatus(filter: TaskFilter): Promise<TaskRecord[]> {
    const limit = filter.limit ?? 25;
    const results = await this.db
      .prepare(
        `SELECT * FROM tasks WHERE status = ?
         ORDER BY created_at ASC LIMIT ?`
      )
      .bind(filter.status, limit)
      .all();
    return (results.results ?? []).map(mapTaskRow);
  }

  async claim(taskId: string, lockDurationSeconds: number): Promise<TaskRecord | null> {
    const nowIso = ISO();
    const lockExpiresAt = new Date(Date.now() + lockDurationSeconds * 1000).toISOString();
    const rows = await this.db
      .prepare(
        `UPDATE tasks
         SET status = 'processing', lock_expires_at = ?, updated_at = ?
         WHERE id = ? AND (status IN ('pending', 'processing') AND (lock_expires_at IS NULL OR lock_expires_at <= ?))
         RETURNING *`
      )
      .bind(lockExpiresAt, nowIso, taskId, nowIso)
      .all();
    if (!rows.results?.length) {
      return null;
    }
    return mapTaskRow(rows.results[0]);
  }

  async applyResult(taskId: string, patch: TaskResultPatch): Promise<TaskRecord | null> {
    const now = ISO();
    const rows = await this.db
      .prepare(
        `UPDATE tasks SET
          status = ?,
          result_action = ?,
          result_reason = ?,
          reply_body = ?,
          lock_expires_at = NULL,
          updated_at = ?
        WHERE id = ?
        RETURNING *`
      )
      .bind(
        patch.status,
        patch.resultAction,
        patch.resultReason ?? null,
        patch.replyBody ?? null,
        now,
        taskId,
      )
      .all();
    if (!rows.results?.length) {
      return null;
    }
    return mapTaskRow(rows.results[0]);
  }
}

class D1ReplyStore implements ReplyStore {
  constructor(private readonly db: D1Database) {}

  async create(draft: ReplyDraft, status: ReplyRecord["status"], error?: string | null): Promise<ReplyRecord> {
    const id = crypto.randomUUID();
    const sentAt = status === "sent" ? ISO() : null;
    await this.db
      .prepare(
        `INSERT INTO replies (
          id, task_id, issue_id, comment_id, body, status, sent_at, error
        ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`
      )
      .bind(id, draft.taskId, draft.issueId, draft.body, status, sentAt, error ?? null)
      .run();
    return {
      id,
      taskId: draft.taskId,
      issueId: draft.issueId,
      commentId: null,
      body: draft.body,
      status,
      sentAt,
      error: error ?? null,
    };
  }
}

class D1OAuthStore implements OAuthStore {
  constructor(private readonly db: D1Database) {}

  async get(workspaceId: string): Promise<OAuthTokenRecord | null> {
    const row = await this.db
      .prepare(`SELECT * FROM oauth_tokens WHERE workspace_id = ? LIMIT 1`)
      .bind(workspaceId)
      .first();
    if (!row) {
      return null;
    }
    return {
      workspaceId: row.workspace_id as string,
      accessToken: row.access_token as string,
      refreshToken: row.refresh_token as string,
      expiresAt: row.expires_at as string,
      scopes: (row.scopes as string)?.split(",") ?? [],
      actorMode: "app",
    };
  }

  async upsert(record: OAuthTokenRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO oauth_tokens (
          workspace_id, access_token, refresh_token, expires_at, scopes, actor_mode
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id) DO UPDATE SET
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          expires_at = excluded.expires_at,
          scopes = excluded.scopes,
          actor_mode = excluded.actor_mode`
      )
      .bind(
        record.workspaceId,
        record.accessToken,
        record.refreshToken,
        record.expiresAt,
        record.scopes.join(","),
        record.actorMode,
      )
      .run();
  }
}

export class D1Storage implements StorageAdapter {
  readonly tasks: TaskStore;
  readonly replies: ReplyStore;
  readonly oauth: OAuthStore;

  constructor(db: D1Database) {
    this.tasks = new D1TaskStore(db);
    this.replies = new D1ReplyStore(db);
    this.oauth = new D1OAuthStore(db);
  }
}
