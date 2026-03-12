import type {
  AgentRunFilter,
  AgentRunRecord,
  AgentRunResultPatch,
  NewAgentRunRecord,
} from "../domain/agent-run";
import type {
  NewTaskRecord,
  OAuthTokenRecord,
  ReplyDraft,
  ReplyRecord,
  TaskFilter,
  TaskRecord,
  TaskResultPatch,
} from "../domain/task";
import type { AgentRunStore, OAuthStore, ReplyStore, StorageAdapter, TaskStore, TraceStore } from "./types";

const ISO = () => new Date().toISOString();

class InMemoryTaskStore implements TaskStore {
  private tasks = new Map<string, TaskRecord>();

  async create(task: NewTaskRecord): Promise<TaskRecord> {
    const now = ISO();
    const record: TaskRecord = {
      ...task,
      id: crypto.randomUUID(),
      status: "pending",
      createdAt: now,
      updatedAt: now,
      lockExpiresAt: null,
    };
    this.tasks.set(record.id, record);
    return record;
  }

  async findByWebhookId(webhookId: string): Promise<TaskRecord | null> {
    for (const task of this.tasks.values()) {
      if (task.webhookId === webhookId) {
        return task;
      }
    }
    return null;
  }

  async listByStatus(filter: TaskFilter): Promise<TaskRecord[]> {
    const { status, limit = 25 } = filter;
    const now = Date.now();
    const results: TaskRecord[] = [];
    for (const task of this.tasks.values()) {
      if (results.length >= limit) {
        break;
      }
      if (task.status !== status) {
        continue;
      }
      if (task.lockExpiresAt && new Date(task.lockExpiresAt).getTime() > now && status === "pending") {
        continue;
      }
      results.push(task);
    }
    return results.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async claim(taskId: string, lockDurationSeconds: number): Promise<TaskRecord | null> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }
    const now = Date.now();
    if (
      task.lockExpiresAt &&
      new Date(task.lockExpiresAt).getTime() > now &&
      task.status === "processing"
    ) {
      return null;
    }
    const updated: TaskRecord = {
      ...task,
      status: "processing",
      lockExpiresAt: new Date(now + lockDurationSeconds * 1000).toISOString(),
      updatedAt: ISO(),
    };
    this.tasks.set(taskId, updated);
    return updated;
  }

  async applyResult(taskId: string, patch: TaskResultPatch): Promise<TaskRecord | null> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }
    const updated: TaskRecord = {
      ...task,
      status: patch.status,
      resultAction: patch.resultAction,
      resultReason: patch.resultReason ?? null,
      replyBody: patch.replyBody ?? null,
      lockExpiresAt: null,
      updatedAt: ISO(),
    };
    this.tasks.set(taskId, updated);
    return updated;
  }
}

class InMemoryAgentRunStore implements AgentRunStore {
  private runs = new Map<string, AgentRunRecord>();

  async create(run: NewAgentRunRecord): Promise<AgentRunRecord> {
    const now = ISO();
    const record: AgentRunRecord = {
      ...run,
      id: crypto.randomUUID(),
      status: "pending",
      createdAt: now,
      updatedAt: now,
      lockExpiresAt: null,
    };
    this.runs.set(record.id, record);
    return record;
  }

  async findById(runId: string): Promise<AgentRunRecord | null> {
    return this.runs.get(runId) ?? null;
  }

  async listByStatus(filter: AgentRunFilter): Promise<AgentRunRecord[]> {
    const { status, limit = 25 } = filter;
    const now = Date.now();
    const results: AgentRunRecord[] = [];
    for (const run of this.runs.values()) {
      if (results.length >= limit) {
        break;
      }
      if (run.status !== status) {
        continue;
      }
      if (run.lockExpiresAt && new Date(run.lockExpiresAt).getTime() > now && status === "pending") {
        continue;
      }
      results.push(run);
    }
    return results.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async claim(runId: string, lockDurationSeconds: number): Promise<AgentRunRecord | null> {
    const run = this.runs.get(runId);
    if (!run) {
      return null;
    }
    const now = Date.now();
    if (
      run.lockExpiresAt &&
      new Date(run.lockExpiresAt).getTime() > now &&
      run.status === "processing"
    ) {
      return null;
    }
    const updated: AgentRunRecord = {
      ...run,
      status: "processing",
      lockExpiresAt: new Date(now + lockDurationSeconds * 1000).toISOString(),
      updatedAt: ISO(),
    };
    this.runs.set(runId, updated);
    return updated;
  }

  async applyResult(runId: string, patch: AgentRunResultPatch): Promise<AgentRunRecord | null> {
    const run = this.runs.get(runId);
    if (!run) {
      return null;
    }
    const updated: AgentRunRecord = {
      ...run,
      status: patch.status,
      lockExpiresAt: null,
      updatedAt: ISO(),
    };
    this.runs.set(runId, updated);
    return updated;
  }
}

class InMemoryReplyStore implements ReplyStore {
  private replies = new Map<string, ReplyRecord>();

  async create(draft: ReplyDraft, status: ReplyRecord["status"], error?: string | null): Promise<ReplyRecord> {
    const record: ReplyRecord = {
      id: crypto.randomUUID(),
      taskId: draft.taskId,
      issueId: draft.issueId,
      commentId: null,
      body: draft.body,
      status,
      sentAt: status === "sent" ? ISO() : null,
      error: error ?? null,
    };
    this.replies.set(record.id, record);
    return record;
  }
}

class InMemoryOAuthStore implements OAuthStore {
  private tokens = new Map<string, OAuthTokenRecord>();

  async get(workspaceId: string): Promise<OAuthTokenRecord | null> {
    return this.tokens.get(workspaceId) ?? null;
  }

  async upsert(record: OAuthTokenRecord): Promise<void> {
    this.tokens.set(record.workspaceId, record);
  }
}

class InMemoryTraceStore implements TraceStore {
  private traces = new Map<
    string,
    {
      traceId: string;
      agentSessionId?: string;
      workspaceId?: string;
      eventType: string;
      createdAt: string;
    }
  >();

  async set(
    traceId: string,
    record: { agentSessionId?: string | null; workspaceId?: string | null; eventType: string; createdAt: string },
  ): Promise<void> {
    this.traces.set(traceId, {
      traceId,
      agentSessionId: record.agentSessionId ?? undefined,
      workspaceId: record.workspaceId ?? undefined,
      eventType: record.eventType,
      createdAt: record.createdAt,
    });
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
    return this.traces.get(traceId) ?? null;
  }
}

export class InMemoryStorage implements StorageAdapter {
  readonly tasks: TaskStore;
  readonly agentRuns: AgentRunStore;
  readonly replies: ReplyStore;
  readonly oauth: OAuthStore;
  readonly trace: TraceStore;

  constructor() {
    this.tasks = new InMemoryTaskStore();
    this.agentRuns = new InMemoryAgentRunStore();
    this.replies = new InMemoryReplyStore();
    this.oauth = new InMemoryOAuthStore();
    this.trace = new InMemoryTraceStore();
  }
}
