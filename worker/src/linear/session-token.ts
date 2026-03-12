/**
 * 会话令牌管理系统
 * 为每个 AgentRun 生成唯一的短期 bearer token
 * 参考 linear-agent-bridge 的设计
 */

export interface SessionContext {
  traceId: string;
  agentSessionId: string;
  workspaceId: string;
  issueId?: string;
  issueIdentifier?: string;
  issueTitle?: string;
  issueUrl?: string;
  teamId?: string;
  // 其他上下文信息...
}

export interface SessionTokenData {
  token: string;
  context: SessionContext;
  createdAt: string;
  expiresAt: string;
}

// 令牌存储（内存或 KV）
const tokenStore = new Map<string, SessionTokenData>();

// 默认令牌有效期：1 小时
const DEFAULT_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * 生成新的会话令牌
 */
export function createSessionToken(context: SessionContext): string {
  const token = generateSecureToken();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + DEFAULT_TOKEN_TTL_MS).toISOString();

  const tokenData: SessionTokenData = {
    token,
    context,
    createdAt: now,
    expiresAt,
  };

  tokenStore.set(token, tokenData);

  return token;
}

/**
 * 验证令牌并返回上下文
 */
export function verifySessionToken(token: string): SessionContext | null {
  const tokenData = tokenStore.get(token);

  if (!tokenData) {
    return null;
  }

  // 检查是否过期
  if (new Date(tokenData.expiresAt) < new Date()) {
    tokenStore.delete(token);
    return null;
  }

  return tokenData.context;
}

/**
 * 撤销令牌
 */
export function revokeSessionToken(token: string): boolean {
  return tokenStore.delete(token);
}

/**
 * 获取令牌信息
 */
export function getSessionTokenInfo(token: string): SessionTokenData | null {
  return tokenStore.get(token) ?? null;
}

/**
 * 清理过期令牌
 */
export function cleanupExpiredTokens(): number {
  const now = new Date();
  let cleaned = 0;

  for (const [token, data] of tokenStore.entries()) {
    if (new Date(data.expiresAt) < now) {
      tokenStore.delete(token);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * 生成安全的随机令牌
 */
function generateSecureToken(): string {
  // 生成 32 字节的随机值，转换为 hex 字符串
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * 从上下文生成令牌（确定性，用于测试）
 */
export async function deriveTokenFromContext(context: SessionContext): Promise<string> {
  // 简单的确定性生成，仅用于测试
  const input = `${context.agentSessionId}:${context.workspaceId}:${context.traceId}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
