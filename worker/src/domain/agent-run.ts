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
}

export interface AgentRunRecord extends NewAgentRunRecord {
  id: string;
  status: AgentRunStatus;
  createdAt: string;
  updatedAt: string;
  lockExpiresAt: string | null;
}

export interface AgentRunFilter {
  status: AgentRunStatus;
  limit?: number;
}

export interface AgentRunResultPatch {
  status: Exclude<AgentRunStatus, "pending">;
}
