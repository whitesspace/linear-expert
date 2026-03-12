import { INTERNAL_LINEAR_API_ENDPOINTS, type ApiEndpoint } from "./internal-api-catalog";

/**
 * Prompt 构建器 - 为 OpenClaw Agent 生成 enriched prompts
 * 包含所有 internal LEC API 的文档和上下文信息
 */

export interface PromptContext {
  issue?: {
    id: string;
    identifier: string;
    title: string;
    url: string;
    description?: string;
    team?: { key: string; name: string };
    project?: { key: string; name: string };
  };
  guidance?: string;
  promptContext?: string | unknown;
  latestUserMessage?: string;
  recentComment?: string;
  eventType?: string;
  workspaceId?: string;
  agentSessionId?: string;
  traceId?: string;
  // 🆕 恢复的历史会话上下文
  restoredContext?: string;
}

/**
 * 生成 Internal LEC API 文档
 */
export function buildInternalApiDocs(origin: string): string {
  const endpoints = INTERNAL_LINEAR_API_ENDPOINTS;
  const categories: Array<{ title: string; items: string[] }> = [
    { title: "Issue 管理", items: ["issues", "attachments", "comments", "relations"] },
    { title: "项目与路线图", items: ["projects", "initiatives", "cycles", "project-updates"] },
    { title: "客户与文档", items: ["customers", "customer-needs", "documents"] },
    { title: "团队与流程", items: ["team", "triage", "workflow-states", "labels"] },
  ];
  const sections = [
    `## Linear Internal LEC API — 可用操作`,
    ``,
    `### 通用说明`,
    `**认证方式**: 所有请求必须在 Authorization header 中提供 Bearer token`,
    `**基础 URL**: ${origin}`,
    `**Content-Type**: application/json`,
    ``,
    ...categories.flatMap((category) => [
      `### ${category.title}`,
      ...endpoints.filter((endpoint) => category.items.includes(endpoint.category)).map((endpoint) => formatEndpoint(endpoint)),
      ``,
    ]),
    `### 常用参数说明`,
    `- workspaceId: Linear workspace ID`,
    `- teamId: 团队 ID`,
    `- issueId: issue 的 UUID`,
    `- identifier: issue 的编号 (如 "ENG-123")`,
    `- stateId: 状态 ID`,
    `- assigneeId: 分配给的用户 ID`,
    `- priority: 优先级 (0=无, 1=重要)`,
    ``,
    `### 工作流程提示`,
    `1. 所有 internal 接口统一使用 POST`,
    `2. 在创建/更新操作前，先获取 team/states 列表`,
    `3. 使用 comment 操作与用户沟通进度`,
    `4. 合理使用项目、initiative、cycle、project update 来组织工作`,
  ];

  return sections.join("\n");
}

function formatEndpoint(endpoint: ApiEndpoint): string {
  const lines = [
    `**${endpoint.method} ${endpoint.path}**`,
    `描述: ${endpoint.description}`,
    `必需参数: ${endpoint.requiredParams.join(", ")}`,
  ];
  if (endpoint.optionalParams && endpoint.optionalParams.length > 0) {
    lines.push(`可选参数: ${endpoint.optionalParams.join(", ")}`);
  }
  if (endpoint.exampleBody) {
    lines.push(`示例:\n\`\`\`json\n${endpoint.exampleBody}\n\`\`\``);
  }
  return lines.join("\n");
}

/**
 * 构建 enriched prompt，包含 API 文档
 */
export function buildEnrichedPrompt(context: PromptContext, origin: string): string {
  const basePrompt = buildBasePrompt(context);
  const apiDocs = buildInternalApiDocs(origin);

  return [basePrompt, "", "", apiDocs].join("\n");
}

/**
 * 构建基础 prompt（不含 API 文档）
 */
function buildBasePrompt(context: PromptContext): string {
  const { issue, guidance, promptContext, latestUserMessage, recentComment, eventType, workspaceId, agentSessionId, traceId } = context;

  const headerParts = [
    issue?.identifier && issue?.title ? `${issue.identifier} — ${issue.title}` : issue?.title || issue?.identifier,
    issue?.url,
    workspaceId ? `workspace=${workspaceId}` : undefined,
    agentSessionId ? `agentSessionId=${agentSessionId}` : undefined,
    traceId ? `traceId=${traceId}` : undefined,
  ].filter(Boolean);

  // 推导任务描述
  const task =
    (typeof promptContext === "object" && (promptContext as any)?.task) ||
    (typeof promptContext === "object" && (promptContext as any)?.intent) ||
    (typeof promptContext === "object" && (promptContext as any)?.userRequest) ||
    (latestUserMessage ? "在这个 agent session 中回应用户的最新消息。" : undefined) ||
    (recentComment ? "回应该条最新评论，并执行适当的 Linear 原生操作。" : undefined) ||
    `处理 AgentSessionEvent 类型: ${eventType || "unknown"}`;

  const sourceHints: string[] = [];
  if (guidance) sourceHints.push("guidance");
  if (promptContext) sourceHints.push("promptContext");
  if (latestUserMessage) sourceHints.push("userMessage");
  if (recentComment) sourceHints.push("comment");
  if (issue?.title || issue?.identifier) sourceHints.push("issue");
  if (sourceHints.length === 0) sourceHints.push("event");

  const lines = [
    "我是 Linear Expert（agent/app），以下内容由 agent 自动生成。",
    headerParts.length ? `上下文: ${headerParts.join(" | ")}` : "上下文: (缺少 issue 元数据)",
    `可用信息源: ${sourceHints.join(", ")}。`,
    "",
    "我会按以下节奏推进：",
    "1) 读取 promptContext/issue/guidance 与最近评论，确认用户意图与约束",
    "2) 根据需要调用 Internal LEC API 执行操作",
    "3) 通过 AgentActivities 向用户反馈进度和结果",
    "",
    `当前任务: ${task}`,
  ];

  if (guidance) {
    lines.push("", "Guidance:", guidance);
  }

  if (typeof promptContext === "string" && promptContext.trim()) {
    lines.push("", "PromptContext:", promptContext);
  } else if (typeof promptContext === "object" && promptContext) {
    const text = extractTextFromObject(promptContext);
    if (text) {
      lines.push("", "PromptContext:", text);
    }
  }

  if (latestUserMessage) {
    lines.push("", "Latest user message:", latestUserMessage);
  }

  if (recentComment) {
    lines.push("", "Latest user comment:", recentComment);
  }

  return lines.join("\n").trim();
}

function extractTextFromObject(obj: unknown): string | null {
  if (typeof obj === "string") return obj.trim() || null;
  if (!obj || typeof obj !== "object") return null;

  const value = (obj as Record<string, unknown>);
  if (value.text && typeof value.text === "string") return value.text.trim();
  if (value.comment) {
    const comment = typeof value.comment === "object" ? value.comment : { body: value.comment };
    if ((comment as any).body && typeof (comment as any).body === "string") {
      return (comment as any).body.trim();
    }
  }
  return null;
}
