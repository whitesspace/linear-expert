/**
 * 会话生命周期管理
 * 跟踪和管理 Linear Agent Session 的完整生命周期
 * 参考 linear-agent-bridge 的 session lifecycle 设计
 */

export interface SessionInfo {
  agentSessionId: string;
  workspaceId: string;
  createdAt: string;
  lastActivityAt: string;
  status: SessionStatus;
  activityCount: number;
}

export type SessionStatus =
  | "created"
  | "active"
  | "idle"
  | "stopped"
  | "completed"
  | "failed";

export interface SessionMetrics {
  totalSessions: number;
  activeSessions: number;
  idleSessions: number;
  stoppedSessions: number;
  completedSessions: number;
  failedSessions: number;
  avgSessionDuration: number; // seconds
}

// 内存中的会话存储
const sessions = new Map<string, SessionInfo>();

// 会话状态更新回调
type SessionUpdateCallback = (sessionId: string, session: SessionInfo) => void;
const updateCallbacks: SessionUpdateCallback[] = [];

// 默认空闲阈值：10 分钟无活动
const DEFAULT_IDLE_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * 创建新会话
 */
export function createAgentSession(
  agentSessionId: string,
  workspaceId: string,
): SessionInfo {
  const now = new Date().toISOString();
  const session: SessionInfo = {
    agentSessionId,
    workspaceId,
    createdAt: now,
    lastActivityAt: now,
    status: "created",
    activityCount: 0,
  };

  sessions.set(agentSessionId, session);
  notifyUpdate(agentSessionId, session);
  return session;
}

/**
 * 更新会话活动
 */
export function updateSessionActivity(agentSessionId: string): void {
  const session = sessions.get(agentSessionId);
  if (!session) return;

  session.lastActivityAt = new Date().toISOString();
  session.activityCount += 1;

  // 如果状态是 created 或 idle，改为 active
  if (session.status === "created" || session.status === "idle") {
    session.status = "active";
  }

  sessions.set(agentSessionId, session);
  notifyUpdate(agentSessionId, session);
}

/**
 * 停止会话（收到 stop signal）
 */
export function stopSession(agentSessionId: string): void {
  const session = sessions.get(agentSessionId);
  if (!session) return;

  session.status = "stopped";
  session.lastActivityAt = new Date().toISOString();

  sessions.set(agentSessionId, session);
  notifyUpdate(agentSessionId, session);
}

/**
 * 标记会话完成
 */
export function completeSession(agentSessionId: string): void {
  const session = sessions.get(agentSessionId);
  if (!session) return;

  session.status = "completed";
  session.lastActivityAt = new Date().toISOString();

  sessions.set(agentSessionId, session);
  notifyUpdate(agentSessionId, session);
}

/**
 * 标记会话失败
 */
export function failSession(agentSessionId: string): void {
  const session = sessions.get(agentSessionId);
  if (!session) return;

  session.status = "failed";
  session.lastActivityAt = new Date().toISOString();

  sessions.set(agentSessionId, session);
  notifyUpdate(agentSessionId, session);
}

/**
 * 获取会话信息
 */
export function getSession(agentSessionId: string): SessionInfo | undefined {
  return sessions.get(agentSessionId);
}

/**
 * 获取工作区的所有会话
 */
export function getSessionsByWorkspace(workspaceId: string): SessionInfo[] {
  const all = Array.from(sessions.values());
  return all.filter(s => s.workspaceId === workspaceId);
}

/**
 * 更新空闲会话状态
 * 超过阈值无活动的会话标记为 idle
 */
export function updateIdleSessions(thresholdMs?: number): number {
  const threshold = thresholdMs ?? DEFAULT_IDLE_THRESHOLD_MS;
  const now = Date.now();
  let idleCount = 0;

  for (const [sessionId, session] of sessions.entries()) {
    const lastActivity = new Date(session.lastActivityAt).getTime();
    const elapsed = now - lastActivity;

    // 只对 active 状态的会话检查是否空闲
    if (session.status === "active" && elapsed > threshold) {
      session.status = "idle";
      session.lastActivityAt = new Date().toISOString();
      sessions.set(sessionId, session);
      notifyUpdate(sessionId, session);
      idleCount++;
    }
  }

  return idleCount;
}

/**
 * 获取会话指标
 */
export function getSessionMetrics(): SessionMetrics {
  const all = Array.from(sessions.values());
  const now = Date.now();

  const metrics: SessionMetrics = {
    totalSessions: all.length,
    activeSessions: 0,
    idleSessions: 0,
    stoppedSessions: 0,
    completedSessions: 0,
    failedSessions: 0,
    avgSessionDuration: 0,
  };

  let totalDuration = 0;
  let completedCount = 0;

  for (const session of all) {
    // 统计各状态数量
    switch (session.status) {
      case "active":
        metrics.activeSessions++;
        break;
      case "idle":
        metrics.idleSessions++;
        break;
      case "stopped":
        metrics.stoppedSessions++;
        break;
      case "completed":
        metrics.completedSessions++;
        completedCount++;
        break;
      case "failed":
        metrics.failedSessions++;
        break;
    }

    // 计算已完成会话的持续时间
    if (session.status === "completed" || session.status === "failed" || session.status === "stopped") {
      const duration = new Date(session.lastActivityAt).getTime() - new Date(session.createdAt).getTime();
      totalDuration += duration;
      completedCount++;
    }
  }

  // 计算平均持续时间（毫秒转秒）
  if (completedCount > 0) {
    metrics.avgSessionDuration = totalDuration / completedCount / 1000;
  }

  return metrics;
}

/**
 * 清理旧会话
 * 清理超过指定时长的会话（默认 24 小时）
 */
export function cleanupOldSessions(maxAgeMs?: number): number {
  const maxAge = maxAgeMs ?? 24 * 60 * 60 * 1000;
  const now = Date.now();
  let cleaned = 0;

  for (const [sessionId, session] of sessions.entries()) {
    const age = now - new Date(session.createdAt).getTime();

    // 清理已完成/停止/失败的旧会话
    if (
      (session.status === "completed" || session.status === "stopped" || session.status === "failed") &&
      age > maxAge
    ) {
      sessions.delete(sessionId);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * 注册会话更新回调
 */
export function onSessionUpdate(callback: SessionUpdateCallback): void {
  updateCallbacks.push(callback);
}

/**
 * 取消注册会话更新回调
 */
export function offSessionUpdate(callback: SessionUpdateCallback): void {
  const index = updateCallbacks.indexOf(callback);
  if (index > -1) {
    updateCallbacks.splice(index, 1);
  }
}

/**
 * 通知所有回调
 */
function notifyUpdate(sessionId: string, session: SessionInfo): void {
  for (const callback of updateCallbacks) {
    try {
      callback(sessionId, session);
    } catch (error) {
      console.error(`Session update callback error for ${sessionId}:`, error);
    }
  }
}

/**
 * 重置所有会话（用于测试）
 */
export function resetAllSessions(): void {
  sessions.clear();
  updateCallbacks.length = 0;
}
