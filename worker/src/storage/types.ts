import type {
  NewTaskRecord,
  OAuthTokenRecord,
  ReplyDraft,
  ReplyRecord,
  TaskFilter,
  TaskRecord,
  TaskResultPatch,
  TaskStatus,
} from "../domain/task";

export interface TaskStore {
  create(task: NewTaskRecord): Promise<TaskRecord>;
  findByWebhookId(webhookId: string): Promise<TaskRecord | null>;
  listByStatus(filter: TaskFilter): Promise<TaskRecord[]>;
  claim(taskId: string, lockDurationSeconds: number): Promise<TaskRecord | null>;
  applyResult(taskId: string, patch: TaskResultPatch): Promise<TaskRecord | null>;
}

export interface ReplyStore {
  create(draft: ReplyDraft, status: ReplyRecord["status"], error?: string | null): Promise<ReplyRecord>;
}

export interface OAuthStore {
  get(workspaceId: string): Promise<OAuthTokenRecord | null>;
  upsert(record: OAuthTokenRecord): Promise<void>;
}

export interface StorageAdapter {
  tasks: TaskStore;
  replies: ReplyStore;
  oauth: OAuthStore;
}

export type StorageFactory = () => StorageAdapter;
