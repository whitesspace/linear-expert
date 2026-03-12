/**
 * Agent Session 相关类型定义
 */

/**
 * Agent Session 状态
 */
export type AgentSessionStatus = 'active' | 'completed' | 'failed' | 'cancelled';

/**
 * Agent Session 记录（持久化）
 */
export interface AgentSessionRecord {
  id: string;
  workspaceId: string;
  issueId?: string;
  issueIdentifier?: string;
  issueTitle?: string;
  issueUrl?: string;
  firstActivityAt: string;
  lastActivityAt: string;
  activityCount: number;
  status: AgentSessionStatus;
  contextSummary?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Agent Session Context 记录（用于恢复详细上下文）
 */
export interface AgentSessionContextRecord {
  id: string;
  agentSessionId: string;
  activityType: string;
  activityContent: string; // JSON 字符串
  timestamp: string;
  createdAt?: string;
}

/**
 * 创建 Agent Session 输入
 */
export interface CreateAgentSessionInput {
  id: string;
  workspaceId: string;
  issueId?: string;
  issueIdentifier?: string;
  issueTitle?: string;
  issueUrl?: string;
  firstActivityAt: string;
  lastActivityAt: string;
  activityCount?: number;
  status?: AgentSessionStatus;
  contextSummary?: string;
}

/**
 * 更新 Agent Session 输入
 */
export interface UpdateAgentSessionInput {
  lastActivityAt?: string;
  activityCount?: number;
  status?: AgentSessionStatus;
  contextSummary?: string;
}

/**
 * Agent Activity Context（从 Linear 拉取）
 */
export interface AgentActivityContext {
  id: string;
  type: string;
  createdAt: string;
  content: Record<string, unknown>;
}

/**
 * 恢复的会话上下文
 */
export interface RestoredSessionContext {
  exists: boolean;
  sessionRecord?: AgentSessionRecord;
  recentActivities?: AgentActivityContext[];
  summaryPrompt?: string; // 传递给 OpenClaw 的上下文摘要
  timeSinceLastActivity?: number; // 毫秒
}
