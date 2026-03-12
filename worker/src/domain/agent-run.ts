export type AgentRunStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface NewAgentRunRecord {
  traceId: string;
  agentSessionId: string;
  workspaceId: string;
  eventType: string;
  payloadJson: string;
  sessionToken?: string; // 可选：会话令牌
}

export interface AgentRunRecord extends NewAgentRunRecord {
  id: string;
  status: AgentRunStatus;
  createdAt: string;
  updatedAt: string;
  lockExpiresAt: string | null;
  sessionToken?: string; // 会话令牌（非持久化）
}

export interface AgentRunFilter {
  status: AgentRunStatus;
  limit?: number;
}

export interface AgentRunResultPatch {
  status: Exclude<AgentRunStatus, "pending">;
}
