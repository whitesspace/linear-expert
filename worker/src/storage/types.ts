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
  TaskStatus,
} from "../domain/task";

export interface TaskStore {
  create(task: NewTaskRecord): Promise<TaskRecord>;
  findByWebhookId(webhookId: string): Promise<TaskRecord | null>;
  listByStatus(filter: TaskFilter): Promise<TaskRecord[]>;
  claim(taskId: string, lockDurationSeconds: number): Promise<TaskRecord | null>;
  applyResult(taskId: string, patch: TaskResultPatch): Promise<TaskRecord | null>;
}

export interface AgentRunStore {
  create(run: NewAgentRunRecord): Promise<AgentRunRecord>;
  findById(runId: string): Promise<AgentRunRecord | null>;
  listByStatus(filter: AgentRunFilter): Promise<AgentRunRecord[]>;
  claim(runId: string, lockDurationSeconds: number): Promise<AgentRunRecord | null>;
  applyResult(runId: string, patch: AgentRunResultPatch): Promise<AgentRunRecord | null>;
}

export interface ReplyStore {
  create(draft: ReplyDraft, status: ReplyRecord["status"], error?: string | null): Promise<ReplyRecord>;
}

export interface OAuthStore {
  get(workspaceId: string): Promise<OAuthTokenRecord | null>;
  upsert(record: OAuthTokenRecord): Promise<void>;
}

export interface TraceStore {
  // Maps an invocation trace to an agentSessionId and captures minimal audit metadata.
  set(
    traceId: string,
    record: {
      agentSessionId?: string | null;
      workspaceId?: string | null;
      eventType: string;
      createdAt: string; // ISO timestamp
    },
  ): Promise<void>;

  get(traceId: string): Promise<
    | {
        traceId: string;
        agentSessionId?: string;
        workspaceId?: string;
        eventType: string;
        createdAt: string;
      }
    | null
  >;
}

export interface StorageAdapter {
  tasks: TaskStore;
  agentRuns: AgentRunStore;
  replies: ReplyStore;
  oauth: OAuthStore;
  trace: TraceStore;
}

export type StorageFactory = () => StorageAdapter;
