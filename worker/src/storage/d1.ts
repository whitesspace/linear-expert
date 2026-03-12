import type {
  AgentRunFilter,
  AgentRunRecord,
  AgentRunResultPatch,
  NewAgentRunRecord,
} from "../domain/agent-run";
import type {
  CreateAgentSessionInput,
  AgentSessionRecord,
  AgentSessionContextRecord,
} from "../domain/agent-session";
import type {
  NewTaskRecord,
  OAuthTokenRecord,
  ReplyDraft,
  ReplyRecord,
  TaskFilter,
  TaskRecord,
  TaskResultPatch,
} from "../domain/task";
import type { AgentRunStore, OAuthStore, ReplyStore, StorageAdapter, TaskStore, TraceStore, SessionStore, SessionContextStore } from "./types";

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

function mapAgentRunRow(row: Record<string, unknown>): AgentRunRecord {
  return {
    id: row.id as string,
    agentSessionId: row.agent_session_id as string,
    workspaceId: row.workspace_id as string,
    eventType: row.event_type as string,
    traceId: row.trace_id as string,
    payloadJson: row.payload_json as string,
    status: row.status as AgentRunRecord["status"],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    lockExpiresAt: (row.lock_expires_at as string) ?? null,
  };
}

function mapSessionRow(row: Record<string, unknown>): AgentSessionRecord {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    issueId: (row.issue_id as string) ?? undefined,
    issueIdentifier: (row.issue_identifier as string) ?? undefined,
    issueTitle: (row.issue_title as string) ?? undefined,
    issueUrl: (row.issue_url as string) ?? undefined,
    firstActivityAt: row.first_activity_at as string,
    lastActivityAt: row.last_activity_at as string,
    activityCount: (row.activity_count as number) ?? 0,
    status: row.status as AgentSessionRecord['status'],
    contextSummary: (row.context_summary as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapSessionContextRow(row: Record<string, unknown>): AgentSessionContextRecord {
  return {
    id: row.id as string,
    agentSessionId: row.agent_session_id as string,
    activityType: row.activity_type as string,
    activityContent: row.activity_content as string,
    timestamp: row.timestamp as string,
    createdAt: (row.created_at as string) ?? undefined,
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

class D1AgentRunStore implements AgentRunStore {
  constructor(private readonly db: D1Database) {}

  async create(run: NewAgentRunRecord): Promise<AgentRunRecord> {
    const now = ISO();
    const id = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO agent_runs (
          id, agent_session_id, workspace_id, event_type, trace_id,
          payload_json, status, created_at, updated_at, lock_expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL)`
      )
      .bind(
        id,
        run.agentSessionId,
        run.workspaceId,
        run.eventType,
        run.traceId,
        run.payloadJson,
        now,
        now,
      )
      .run();
    return {
      ...run,
      id,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      lockExpiresAt: null,
    };
  }

  async findById(runId: string): Promise<AgentRunRecord | null> {
    const result = await this.db
      .prepare(`SELECT * FROM agent_runs WHERE id = ? LIMIT 1`)
      .bind(runId)
      .first();
    return result ? mapAgentRunRow(result) : null;
  }

  async listByStatus(filter: AgentRunFilter): Promise<AgentRunRecord[]> {
    const limit = filter.limit ?? 25;
    const results = await this.db
      .prepare(
        `SELECT * FROM agent_runs WHERE status = ?
         ORDER BY created_at ASC LIMIT ?`
      )
      .bind(filter.status, limit)
      .all();
    return (results.results ?? []).map(mapAgentRunRow);
  }

  async claim(runId: string, lockDurationSeconds: number): Promise<AgentRunRecord | null> {
    const nowIso = ISO();
    const lockExpiresAt = new Date(Date.now() + lockDurationSeconds * 1000).toISOString();
    const rows = await this.db
      .prepare(
        `UPDATE agent_runs
         SET status = 'processing', lock_expires_at = ?, updated_at = ?
         WHERE id = ? AND (status IN ('pending', 'processing') AND (lock_expires_at IS NULL OR lock_expires_at <= ?))
         RETURNING *`
      )
      .bind(lockExpiresAt, nowIso, runId, nowIso)
      .all();
    if (!rows.results?.length) {
      return null;
    }
    return mapAgentRunRow(rows.results[0]);
  }

  async applyResult(runId: string, patch: AgentRunResultPatch): Promise<AgentRunRecord | null> {
    const now = ISO();
    const rows = await this.db
      .prepare(
        `UPDATE agent_runs SET
          status = ?,
          lock_expires_at = NULL,
          updated_at = ?
        WHERE id = ?
        RETURNING *`
      )
      .bind(
        patch.status,
        now,
        runId,
      )
      .all();
    if (!rows.results?.length) {
      return null;
    }
    return mapAgentRunRow(rows.results[0]);
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

class D1TraceStore implements TraceStore {
  constructor(private db: D1Database) {}

  async set(
    traceId: string,
    record: { agentSessionId?: string | null; workspaceId?: string | null; eventType: string; createdAt: string },
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO invocation_traces (
          trace_id,
          agent_session_id,
          workspace_id,
          event_type,
          created_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(trace_id) DO UPDATE SET
          agent_session_id = excluded.agent_session_id,
          workspace_id = excluded.workspace_id,
          event_type = excluded.event_type,
          created_at = excluded.created_at`,
      )
      .bind(traceId, record.agentSessionId ?? null, record.workspaceId ?? null, record.eventType, record.createdAt)
      .run();
  }

  async get(traceId: string): Promise<
    | {
        traceId: string;
        agentSessionId?: string;
        workspaceId?: string;
        eventType: string;
        createdAt: string;
      }
    | null
  > {
    const row = await this.db
      .prepare(
        `SELECT trace_id, agent_session_id, workspace_id, event_type, created_at
         FROM invocation_traces
         WHERE trace_id = ?
         LIMIT 1`,
      )
      .bind(traceId)
      .first();

    if (!row) return null;

    return {
      traceId: row.trace_id as string,
      agentSessionId: (row.agent_session_id as string | null) ?? undefined,
      workspaceId: (row.workspace_id as string | null) ?? undefined,
      eventType: row.event_type as string,
      createdAt: row.created_at as string,
    };
  }
}

class D1SessionStore implements SessionStore {
  constructor(private readonly db: D1Database) {}

  async create(input: CreateAgentSessionInput): Promise<AgentSessionRecord> {
    const now = ISO();
    await this.db
      .prepare(
        `INSERT INTO agent_sessions (
          id, workspace_id, issue_id, issue_identifier, issue_title, issue_url,
          first_activity_at, last_activity_at, activity_count, status, context_summary,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        input.workspaceId,
        input.issueId ?? null,
        input.issueIdentifier ?? null,
        input.issueTitle ?? null,
        input.issueUrl ?? null,
        input.firstActivityAt,
        input.lastActivityAt,
        input.activityCount ?? 0,
        input.status ?? 'active',
        input.contextSummary ?? null,
        now,
        now,
      )
      .run();

    return {
      id: input.id,
      workspaceId: input.workspaceId,
      issueId: input.issueId,
      issueIdentifier: input.issueIdentifier,
      issueTitle: input.issueTitle,
      issueUrl: input.issueUrl,
      firstActivityAt: input.firstActivityAt,
      lastActivityAt: input.lastActivityAt,
      activityCount: input.activityCount ?? 0,
      status: input.status ?? 'active',
      contextSummary: input.contextSummary,
      createdAt: now,
      updatedAt: now,
    };
  }

  async findById(id: string): Promise<AgentSessionRecord | null> {
    const result = await this.db
      .prepare(`SELECT * FROM agent_sessions WHERE id = ? LIMIT 1`)
      .bind(id)
      .first();
    return result ? mapSessionRow(result) : null;
  }

  async findByAgentSessionId(agentSessionId: string): Promise<AgentSessionRecord | null> {
    const result = await this.db
      .prepare(`SELECT * FROM agent_sessions WHERE id = ? LIMIT 1`)
      .bind(agentSessionId)
      .first();
    return result ? mapSessionRow(result) : null;
  }

  async updateLastActivity(id: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE agent_sessions
         SET last_activity_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(ISO(), ISO(), id)
      .run();
  }

  async updateStatus(id: string, status: AgentSessionRecord['status']): Promise<void> {
    await this.db
      .prepare(
        `UPDATE agent_sessions
         SET status = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(status, ISO(), id)
      .run();
  }

  async updateContextSummary(id: string, summary: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE agent_sessions
         SET context_summary = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(summary, ISO(), id)
      .run();
  }

  async incrementActivityCount(id: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE agent_sessions
         SET activity_count = activity_count + 1, updated_at = ?
         WHERE id = ?`
      )
      .bind(ISO(), id)
      .run();
  }

  async listByIssue(issueId: string, limit = 10): Promise<AgentSessionRecord[]> {
    const results = await this.db
      .prepare(
        `SELECT * FROM agent_sessions
         WHERE issue_id = ?
         ORDER BY last_activity_at DESC
         LIMIT ?`
      )
      .bind(issueId, limit)
      .all();
    return (results.results ?? []).map(mapSessionRow);
  }

  async listByWorkspace(workspaceId: string, limit = 25): Promise<AgentSessionRecord[]> {
    const results = await this.db
      .prepare(
        `SELECT * FROM agent_sessions
         WHERE workspace_id = ?
         ORDER BY last_activity_at DESC
         LIMIT ?`
      )
      .bind(workspaceId, limit)
      .all();
    return (results.results ?? []).map(mapSessionRow);
  }

  async listByStatus(status: AgentSessionRecord['status'], limit = 25): Promise<AgentSessionRecord[]> {
    const results = await this.db
      .prepare(
        `SELECT * FROM agent_sessions
         WHERE status = ?
         ORDER BY last_activity_at DESC
         LIMIT ?`
      )
      .bind(status, limit)
      .all();
    return (results.results ?? []).map(mapSessionRow);
  }
}

class D1SessionContextStore implements SessionContextStore {
  constructor(private readonly db: D1Database) {}

  async create(ctx: Omit<AgentSessionContextRecord, 'createdAt'>): Promise<AgentSessionContextRecord> {
    const now = ISO();
    const id = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO agent_session_contexts (
          id, agent_session_id, activity_type, activity_content, timestamp, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        ctx.agentSessionId,
        ctx.activityType,
        ctx.activityContent,
        ctx.timestamp,
        now,
      )
      .run();

    return {
      id,
      agentSessionId: ctx.agentSessionId,
      activityType: ctx.activityType,
      activityContent: ctx.activityContent,
      timestamp: ctx.timestamp,
      createdAt: now,
    };
  }

  async listBySession(sessionId: string, limit = 50): Promise<AgentSessionContextRecord[]> {
    const results = await this.db
      .prepare(
        `SELECT * FROM agent_session_contexts
         WHERE agent_session_id = ?
         ORDER BY timestamp DESC
         LIMIT ?`
      )
      .bind(sessionId, limit)
      .all();
    return (results.results ?? []).map(mapSessionContextRow);
  }

  async deleteBySession(sessionId: string): Promise<void> {
    await this.db
      .prepare(`DELETE FROM agent_session_contexts WHERE agent_session_id = ?`)
      .bind(sessionId)
      .run();
  }

  async deleteBefore(sessionId: string, beforeTime: string): Promise<void> {
    await this.db
      .prepare(
        `DELETE FROM agent_session_contexts
         WHERE agent_session_id = ? AND timestamp < ?`
      )
      .bind(sessionId, beforeTime)
      .run();
  }
}

export class D1Storage implements StorageAdapter {
  readonly tasks: TaskStore;
  readonly agentRuns: AgentRunStore;
  readonly replies: ReplyStore;
  readonly oauth: OAuthStore;
  readonly trace: TraceStore;
  readonly sessions: SessionStore;
  readonly sessionContexts: SessionContextStore;

  constructor(db: D1Database) {
    this.tasks = new D1TaskStore(db);
    this.agentRuns = new D1AgentRunStore(db);
    this.replies = new D1ReplyStore(db);
    this.oauth = new D1OAuthStore(db);
    this.trace = new D1TraceStore(db);
    this.sessions = new D1SessionStore(db);
    this.sessionContexts = new D1SessionContextStore(db);
  }
}
