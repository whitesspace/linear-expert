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

export class InMemoryStorage implements StorageAdapter {
  readonly tasks: TaskStore;
  readonly replies: ReplyStore;
  readonly oauth: OAuthStore;

  constructor() {
    this.tasks = new InMemoryTaskStore();
    this.replies = new InMemoryReplyStore();
    this.oauth = new InMemoryOAuthStore();
  }
}
