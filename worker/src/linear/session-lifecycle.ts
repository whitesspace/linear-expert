/**
 * 会话生命周期管理
 *
 * 提供会话创建、活动更新、完成/失败等生命周期管理
 * 使用持久化存储支持几天/几周后的会话恢复
 */

import type { StorageAdapter } from '../storage/types';
import type { AgentSessionRecord } from '../domain/agent-session';
import { saveSessionContext } from './session-context';

/**
 * 创建或恢复会话
 *
 * 如果会话已存在（几天/几周前），则恢复会话；
 * 否则创建新会话。
 */
export async function createOrRestoreSession(
  storage: StorageAdapter,
  agentSessionId: string,
  workspaceId: string,
  issueId?: string,
  issueIdentifier?: string,
  issueTitle?: string,
  issueUrl?: string,
): Promise<AgentSessionRecord> {
  // 检查是否已存在持久化会话
  const existing = await storage.sessions.findByAgentSessionId(agentSessionId);
  
  const now = new Date().toISOString();
  
  if (existing) {
    // 恢复会话（不覆盖历史数据）
    await storage.sessions.updateLastActivity(existing.id);
    await storage.sessions.updateStatus(existing.id, 'active');
    console.log(`Restored existing session ${agentSessionId.slice(0, 8)}...`);
    return existing;
  }
  
  // 创建新会话
  const session = await storage.sessions.create({
    id: agentSessionId,
    workspaceId,
    issueId,
    issueIdentifier,
    issueTitle,
    issueUrl,
    firstActivityAt: now,
    lastActivityAt: now,
    activityCount: 0,
    status: 'active',
  });
  
  console.log(`Created new session ${agentSessionId.slice(0, 8)}...`);
  return session;
}

/**
 * 更新会话活动
 */
export async function updateSessionActivity(
  storage: StorageAdapter,
  agentSessionId: string,
  activityType?: string,
  activityContent?: Record<string, unknown>,
): Promise<void> {
  const session = await storage.sessions.findByAgentSessionId(agentSessionId);
  if (!session) return;
  
  // 更新最后活动时间和活动计数
  await storage.sessions.updateLastActivity(session.id);
  await storage.sessions.incrementActivityCount(session.id);
  
  // 可选：保存重要活动到 session contexts
  if (activityType && activityContent) {
    await saveSessionContext(
      storage as any, // Type assertion for accessing sessionContexts
      agentSessionId,
      activityType,
      activityContent,
    );
  }
}

/**
 * 完成会话
 */
export async function completeSession(
  storage: StorageAdapter,
  agentSessionId: string,
): Promise<void> {
  const session = await storage.sessions.findByAgentSessionId(agentSessionId);
  if (!session) return;
  
  await storage.sessions.updateStatus(session.id, 'completed');
  // 🆕 不删除会话记录，保留用于未来的上下文恢复
  console.log(`Completed session ${agentSessionId.slice(0, 8)}...`);
}

/**
 * 会话失败
 */
export async function failSession(
  storage: StorageAdapter,
  agentSessionId: string,
): Promise<void> {
  const session = await storage.sessions.findByAgentSessionId(agentSessionId);
  if (!session) return;
  
  await storage.sessions.updateStatus(session.id, 'failed');
  console.log(`Failed session ${agentSessionId.slice(0, 8)}...`);
}

/**
 * 取消会话
 */
export async function cancelSession(
  storage: StorageAdapter,
  agentSessionId: string,
): Promise<void> {
  const session = await storage.sessions.findByAgentSessionId(agentSessionId);
  if (!session) return;
  
  await storage.sessions.updateStatus(session.id, 'cancelled');
  console.log(`Cancelled session ${agentSessionId.slice(0, 8)}...`);
}
