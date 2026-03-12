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
}

export interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  requiredParams: string[];
  optionalParams?: string[];
  exampleBody?: string;
}

/**
 * 生成 Internal LEC API 文档
 */
export function buildInternalApiDocs(origin: string): string {
  const endpoints: ApiEndpoint[] = [
    {
      method: "POST",
      path: "/internal/linear/comment",
      description: "在 issue 上添加评论",
      requiredParams: ["workspaceId", "issueId", "body"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "issueId": "ISS-123",
  "body": "这是一条评论"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/issues/create",
      description: "创建新的 issue",
      requiredParams: ["workspaceId", "title"],
      optionalParams: ["description", "teamId", "assigneeId", "priority", "labelIds"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "teamId": "TEAM_ID",
  "title": "新 issue 标题",
  "description": "详细描述",
  "priority": 2,
  "assigneeId": "USER_ID"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/issues/update",
      description: "更新 issue 信息",
      requiredParams: ["workspaceId", "issueId"],
      optionalParams: ["title", "description", "projectId", "priority", "labelIds"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "issueId": "ISS-123",
  "title": "新标题",
  "description": "新描述"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/issues/assign",
      description: "分配 issue 给某人",
      requiredParams: ["workspaceId", "issueId", "assigneeId"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "issueId": "ISS-123",
  "assigneeId": "USER_ID"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/issues/state",
      description: "改变 issue 的状态",
      requiredParams: ["workspaceId", "issueId", "stateId"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "issueId": "ISS-123",
  "stateId": "STATE_ID"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/issues/project",
      description: "将 issue 添加到项目",
      requiredParams: ["workspaceId", "issueId", "projectId"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "issueId": "ISS-123",
  "projectId": "PROJ_ID"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/issues/get",
      description: "获取 issue 详情",
      requiredParams: ["workspaceId", "identifier"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "identifier": "ISS-123"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/issues/children",
      description: "获取子 issues",
      requiredParams: ["workspaceId", "issueId"],
      optionalParams: ["first"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "issueId": "ISS-123",
  "first": 50
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/issues/attachment",
      description: "添加附件",
      requiredParams: ["workspaceId", "issueId", "title", "url"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "issueId": "ISS-123",
  "title": "设计稿",
  "url": "https://example.com/design.png"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/issues/relation",
      description: "创建 issue 关系",
      requiredParams: ["workspaceId", "issueId", "relatedIssueId", "relationType"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "issueId": "ISS-123",
  "relatedIssueId": "ISS-456",
  "relationType": "blocks"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/issues/list",
      description: "根据编号列出 issues",
      requiredParams: ["workspaceId", "teamId", "numbers"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "teamId": "TEAM_ID",
  "numbers": [1, 2, 3]
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/team/states",
      description: "获取团队的状态列表",
      requiredParams: ["workspaceId", "teamId"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "teamId": "TEAM_ID"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/projects/list",
      description: "列出项目",
      requiredParams: ["workspaceId", "teamId"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "teamId": "TEAM_ID"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/projects/get",
      description: "获取项目详情",
      requiredParams: ["workspaceId", "projectId"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "projectId": "PROJ_ID"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/projects/create",
      description: "创建项目",
      requiredParams: ["workspaceId", "teamId", "name"],
      optionalParams: ["description"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "teamId": "TEAM_ID",
  "name": "新项目",
  "description": "项目描述"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/projects/update",
      description: "更新项目",
      requiredParams: ["workspaceId", "projectId"],
      optionalParams: ["name", "description"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "projectId": "PROJ_ID",
  "name": "新名称"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/projects/delete",
      description: "归档/删除项目",
      requiredParams: ["workspaceId", "projectId"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "projectId": "PROJ_ID"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/triage/list",
      description: "获取待处理问题列表",
      requiredParams: ["workspaceId", "teamId"],
      optionalParams: ["stateName", "excludeDone", "excludeCancelled", "limit"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "teamId": "TEAM_ID",
  "stateName": "In Progress",
  "excludeDone": true,
  "excludeCancelled": true,
  "limit": 50
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/initiatives/list",
      description: "列出 initiatives",
      requiredParams: ["workspaceId"],
      optionalParams: ["limit"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "limit": 25
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/initiatives/get",
      description: "获取 initiative 详情",
      requiredParams: ["workspaceId", "id"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "id": "INIT_ID"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/initiatives/create",
      description: "创建 initiative",
      requiredParams: ["workspaceId", "name"],
      optionalParams: ["description", "status"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "name": "新 Initiative",
  "description": "描述",
  "status": "started"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/initiatives/update",
      description: "更新 initiative",
      requiredParams: ["workspaceId", "id"],
      optionalParams: ["name", "description", "status"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "id": "INIT_ID",
  "name": "新名称"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/initiatives/archive",
      description: "归档 initiative",
      requiredParams: ["workspaceId", "id"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "id": "INIT_ID"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/cycles/list",
      description: "列出 cycles",
      requiredParams: ["workspaceId", "teamId"],
      optionalParams: ["limit"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "teamId": "TEAM_ID",
  "limit": 25
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/cycles/get",
      description: "获取 cycle 详情",
      requiredParams: ["workspaceId", "id"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "id": "CYCLE_ID"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/cycles/create",
      description: "创建 cycle",
      requiredParams: ["workspaceId", "teamId", "startsAt", "endsAt"],
      optionalParams: ["name"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "teamId": "TEAM_ID",
  "startsAt": "2024-01-01T00:00:00Z",
  "endsAt": "2024-01-31T23:59:59Z",
  "name": "Sprint 1"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/cycles/update",
      description: "更新 cycle",
      requiredParams: ["workspaceId", "id"],
      optionalParams: ["startsAt", "endsAt", "name"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "id": "CYCLE_ID",
  "name": "Sprint 2"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/cycles/archive",
      description: "归档 cycle",
      requiredParams: ["workspaceId", "id"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "id": "CYCLE_ID"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/labels/list",
      description: "列出标签",
      requiredParams: ["workspaceId"],
      optionalParams: ["limit"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "limit": 100
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/labels/get",
      description: "获取标签详情",
      requiredParams: ["workspaceId", "id"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "id": "LABEL_ID"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/labels/create",
      description: "创建标签",
      requiredParams: ["workspaceId", "name"],
      optionalParams: ["color", "description"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "name": "bug",
  "color": "#ff0000",
  "description": "Bug 报告"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/labels/update",
      description: "更新标签",
      requiredParams: ["workspaceId", "id"],
      optionalParams: ["name", "color", "description"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "id": "LABEL_ID",
  "name": "新名称"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/labels/retire",
      description: "停用标签",
      requiredParams: ["workspaceId", "id"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "id": "LABEL_ID"
}`,
    },
    {
      method: "POST",
      path: "/internal/linear/labels/restore",
      description: "恢复标签",
      requiredParams: ["workspaceId", "id"],
      exampleBody: `{
  "workspaceId": "ws_abc123",
  "id": "LABEL_ID"
}`,
    },
  ];

  const sections = [
    `## Linear Internal LEC API — 可用操作`,
    ``,
    `### 通用说明`,
    `**认证方式**: 所有请求必须在 Authorization header 中提供 Bearer token`,
    `**基础 URL**: ${origin}`,
    `**Content-Type**: application/json`,
    ``,
    `### Issue 管理`,
    ...endpoints
      .filter((e) => e.path.startsWith("/internal/linear/issue"))
      .map((e) => formatEndpoint(e)),
    ``,
    `### 项目管理`,
    ...endpoints
      .filter((e) => e.path.startsWith("/internal/linear/projects"))
      .map((e) => formatEndpoint(e)),
    ``,
    `### Initiative 管理`,
    ...endpoints
      .filter((e) => e.path.startsWith("/internal/linear/initiatives"))
      .map((e) => formatEndpoint(e)),
    ``,
    `### Cycle 管理`,
    ...endpoints
      .filter((e) => e.path.startsWith("/internal/linear/cycles"))
      .map((e) => formatEndpoint(e)),
    ``,
    `### 标签管理`,
    ...endpoints
      .filter((e) => e.path.startsWith("/internal/linear/labels"))
      .map((e) => formatEndpoint(e)),
    ``,
    `### 团队与查询`,
    ...endpoints
      .filter(
        (e) =>
          e.path.startsWith("/internal/linear/team") ||
          e.path.startsWith("/internal/linear/triage")
      )
      .map((e) => formatEndpoint(e)),
    ``,
    `### 常用参数说明`,
    `- workspaceId: Linear workspace ID`,
    `- teamId: 团队 ID`,
    `- issueId: issue 的 UUID`,
    `- identifier: issue 的编号 (如 "ENG-123")`,
    `- stateId: 状态 ID`,
    `- assigneeId: 分配给的用户 ID`,
    `- priority: 优先级 (0=无, 1=紧急, 2=高, 3=中, 4=低)`,
    ``,
    `### 工作流程提示`,
    `1. 使用 GET 请求获取信息，使用 POST 请求执行操作`,
    `2. 在创建/更新操作前，先获取 team/states 列表`,
    `3. 使用 comment 操作与用户沟通进度`,
    `4. 合理使用项目、initiative、cycle 来组织工作`,
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
