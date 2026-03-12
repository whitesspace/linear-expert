/**
 * 去重机制
 * 防止重复处理相同的 Linear webhook 事件
 * 参考 linear-agent-bridge 的 dedup window 设计
 */

interface InflightSession {
  sessionId: string;
  timestamp: number;
  eventType: string;
}

// 存储正在处理的会话
const inflightSessions = new Map<string, InflightSession>();

// 默认去重窗口：5 秒
const DEFAULT_DEDUP_WINDOW_MS = 5000;

// 存储已处理的 webhook ID
const processedWebhookIds = new Set<string>();

/**
 * 检查会话是否已在处理中
 */
export function isInflightSession(sessionId: string, eventType: string): boolean {
  const record = inflightSessions.get(sessionId);
  if (!record) {
    return false;
  }

  const elapsed = Date.now() - record.timestamp;

  // 对于 "prompted" 事件，如果不在去重窗口内，允许通过
  // 这是因为 Linear 可能同时发送 AgentSessionEvent 和 Comment webhook
  if (eventType === "prompted" || eventType.includes("prompted")) {
    return elapsed < DEFAULT_DEDUP_WINDOW_MS;
  }

  // 其他事件类型，如果在处理中就拒绝
  return true;
}

/**
 * 标记会话为正在处理
 */
export function markInflightSession(sessionId: string, eventType: string): void {
  inflightSessions.set(sessionId, {
    sessionId,
    timestamp: Date.now(),
    eventType,
  });

  // 设置定时清理（10 秒后）
  setTimeout(() => {
    const record = inflightSessions.get(sessionId);
    if (record && Date.now() - record.timestamp >= 10000) {
      inflightSessions.delete(sessionId);
    }
  }, 10000);
}

/**
 * 移除会话的 in-flight 标记
 */
export function clearInflightSession(sessionId: string): void {
  inflightSessions.delete(sessionId);
}

/**
 * 检查 webhook ID 是否已处理
 */
export function isWebhookProcessed(webhookId: string): boolean {
  return processedWebhookIds.has(webhookId);
}

/**
 * 标记 webhook ID 为已处理
 */
export function markWebhookProcessed(webhookId: string): void {
  processedWebhookIds.add(webhookId);

  // 30 分钟后清理
  setTimeout(() => {
    processedWebhookIds.delete(webhookId);
  }, 30 * 60 * 1000);
}

/**
 * 计算去重窗口时间
 * 根据事件类型返回不同的去重窗口
 */
export function getDedupWindow(eventType: string): number {
  // AgentSessionEvent.created: 5 秒窗口
  if (eventType === "AgentSessionEvent.created" || eventType.includes("created")) {
    return DEFAULT_DEDUP_WINDOW_MS;
  }

  // Comment 事件：10 秒窗口（防止同一评论的重复 webhook）
  if (eventType === "Comment") {
    return 10000;
  }

  // 其他事件：默认 5 秒
  return DEFAULT_DEDUP_WINDOW_MS;
}

/**
 * 清理所有 in-flight 会话和已处理的 webhook ID
 * 用于测试或定期清理
 */
export function cleanupAll(): void {
  inflightSessions.clear();
  processedWebhookIds.clear();
}

/**
 * 获取当前 in-flight 会话数量
 */
export function getInflightCount(): number {
  return inflightSessions.size;
}

/**
 * 获取已处理 webhook 数量
 */
export function getProcessedWebhookCount(): number {
  return processedWebhookIds.size;
}
