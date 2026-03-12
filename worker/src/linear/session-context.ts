/**
 * 会话上下文恢复
 *
 * 从 Linear 和 D1 恢复历史会话的上下文，支持几天/几周后的会话继续
 */

import type { Env } from '../env';
import type { StorageAdapter } from '../storage/types';
import { withWorkspaceAccessToken } from './client';
import type { AgentSessionRecord } from '../domain/agent-session';
import type { AgentActivityContext, RestoredSessionContext } from '../domain/agent-session';

/**
 * 从 Linear 获取最近的 AgentActivities
 */
async function getRecentAgentActivities(
  env: Env,
  workspaceId: string,
  agentSessionId: string,
  limit = 10,
): Promise<AgentActivityContext[]> {
  const { sdkRequest } = await import('./sdk');
  const { createLinearSdkClient } = await import('./sdk');
  
  return withWorkspaceAccessToken<AgentActivityContext[]>(env, workspaceId, async (accessToken: string) => {
    const client = createLinearSdkClient(accessToken);
    
    const query = `
      query($sessionId: String!, $first: Int!) {
        agentSession(id: $sessionId) {
          activities(first: $first, orderBy: createdAt_DESC) {
            nodes {
              id
              type
              createdAt
              content
            }
          }
        }
      }
    `;
    
    try {
      const result = await sdkRequest<any>(client, query, {
        sessionId: agentSessionId,
        first: limit,
      });
      
      return result?.agentSession?.activities?.nodes || [];
    } catch (error) {
      console.error(`Failed to fetch recent activities for session ${agentSessionId}:`, error);
      return [];
    }
  });
}

/**
 * 格式化时间差（多久前）
 */
function formatTimeAgo(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (months > 0) return `${months} 个月前`;
  if (weeks > 0) return `${weeks} 周前`;
  if (days > 0) return `${days} 天前`;
  if (hours > 0) return `${hours} 小时前`;
  if (minutes > 0) return `${minutes} 分钟前`;
  return `${seconds} 秒前`;
}

/**
 * 构建上下文摘要 prompt（传递给 OpenClaw）
 */
function buildContextSummaryPrompt(input: {
  sessionRecord: AgentSessionRecord;
  recentActivities: AgentActivityContext[];
  timeSinceLastActivity: number;
}): string {
  const { sessionRecord, recentActivities, timeSinceLastActivity } = input;
  
  const timeAgo = formatTimeAgo(timeSinceLastActivity);
  
  let prompt = `\n## 🔙 恢复的历史会话上下文\n\n`;
  prompt += `**会话 ID**: \`${sessionRecord.id.slice(0, 8)}...\`\n`;
  if (sessionRecord.issueIdentifier) {
    prompt += `**Issue**: ${sessionRecord.issueIdentifier} — ${sessionRecord.issueTitle}\n`;
  }
  prompt += `**上次活动**: ${timeAgo}（${new Date(sessionRecord.lastActivityAt).toLocaleString('zh-CN')}）\n`;
  prompt += `**历史活动数**: ${sessionRecord.activityCount}\n`;
  prompt += `**会话状态**: ${sessionRecord.status}\n`;
  
  if (sessionRecord.contextSummary) {
    prompt += `**历史摘要**: ${sessionRecord.contextSummary}\n`;
  }
  
  if (recentActivities.length > 0) {
    prompt += `\n### 最近的 Agent Activities\n\n`;
    recentActivities.forEach((activity, index) => {
      const activityTimeAgo = formatTimeAgo(
        Date.now() - new Date(activity.createdAt).getTime()
      );
      prompt += `${index + 1}. **${activity.type}** (${activityTimeAgo})\n`;
      
      const content = JSON.stringify(activity.content);
      if (content.length > 250) {
        prompt += `   ${content.slice(0, 250)}...\n\n`;
      } else {
        prompt += `   ${content}\n\n`;
      }
    });
  } else {
    prompt += `\n（无可用的历史活动）\n`;
  }
  
  prompt += `\n> **提示**: 这是一个 ${timeAgo} 之前的会话。请根据以上历史上下文继续处理用户的最新请求。\n`;
  
  return prompt;
}

/**
 * 恢复会话上下文
 *
 * 从 D1 和 Linear 恢复会话的历史信息，构建上下文摘要
 */
export async function restoreSessionContext(
  env: Env,
  workspaceId: string,
  agentSessionId: string,
  storage?: StorageAdapter,
): Promise<RestoredSessionContext> {
  try {
    // 1. 从 storage 获取持久化的会话记录（如果提供了 storage）
    // @ts-expect-error - env has storage property at runtime
    const storageToUse = storage || (env as any).storage;
    if (!storageToUse) {
      return { exists: false };
    }
    const sessionRecord = await storageToUse.sessions.findByAgentSessionId(agentSessionId);
    
    if (!sessionRecord) {
      return { exists: false };
    }
    
    // 2. 从 Linear 获取最近的 AgentActivities
    const recentActivities = await getRecentAgentActivities(
      env,
      workspaceId,
      agentSessionId,
      10, // 最近 10 个活动
    );
    
    // 3. 计算时间差
    const timeSinceLastActivity = Date.now() - new Date(sessionRecord.lastActivityAt).getTime();
    
    // 4. 生成上下文摘要 prompt
    const summaryPrompt = buildContextSummaryPrompt({
      sessionRecord,
      recentActivities,
      timeSinceLastActivity,
    });
    
    return {
      exists: true,
      sessionRecord,
      recentActivities,
      summaryPrompt,
      timeSinceLastActivity,
    };
  } catch (error) {
    console.error(`Failed to restore session context for ${agentSessionId}:`, error);
    return { exists: false };
  }
}

/**
 * 保存会话上下文片段（用于持久化重要活动）
 */
export async function saveSessionContext(
  storage: StorageAdapter,
  agentSessionId: string,
  activityType: string,
  activityContent: Record<string, unknown>,
  timestamp?: string,
): Promise<void> {
  try {
    const activityTimestamp = timestamp || new Date().toISOString();

    // 只持久化重要的活动类型
    const importantTypes = ['response', 'action', 'elicitation'];
    if (!importantTypes.includes(activityType)) {
      return;
    }

    await storage.sessionContexts.create({
      id: crypto.randomUUID(),
      agentSessionId,
      activityType,
      activityContent: JSON.stringify(activityContent),
      timestamp: activityTimestamp,
    });
  } catch (error) {
    console.error(`Failed to save session context for ${agentSessionId}:`, error);
  }
}

/**
 * 清理过期的会话上下文
 */
export async function cleanupOldSessionContexts(
  storage: StorageAdapter,
  olderThanDays = 30,
): Promise<void> {
  try {
    const beforeTime = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

    // 获取所有活跃会话
    const activeSessions = await storage.sessions.listByStatus('active', 1000);

    for (const session of activeSessions) {
      await storage.sessionContexts.deleteBefore(session.id, beforeTime);
    }

    console.log(`Cleaned up session contexts older than ${olderThanDays} days`);
  } catch (error) {
    console.error('Failed to cleanup old session contexts:', error);
  }
}

/**
 * 生成会话摘要（可选，使用 LLM）
 */
export async function generateSessionSummary(
  env: Env,
  sessionRecord: AgentSessionRecord,
  recentActivities: AgentActivityContext[],
): Promise<string | null> {
  // 简单实现：基于活动计数和状态生成摘要
  const importantActivities = recentActivities.filter(a =>
    ['response', 'action', 'elicitation'].includes(a.type)
  );
  
  if (importantActivities.length === 0) {
    return null;
  }
  
  const lastImportantActivity = importantActivities[0];
  const summary = `包含 ${sessionRecord.activityCount} 个活动，最后活动类型为 ${lastImportantActivity.type}`;
  
  // 可选：调用 LLM 生成更智能的摘要
  // 这里可以集成 OpenClaw 或其他 LLM 服务
  
  return summary;
}
