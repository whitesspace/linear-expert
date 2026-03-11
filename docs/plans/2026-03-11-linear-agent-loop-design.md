# Linear → OpenClaw → Linear 闭环修复设计

## 背景
当前 Linear webhook 已接收到 `AgentSessionEvent`，但无法形成稳定的 “Linear → OpenClaw → Linear” 交互闭环。根因是 webhook 解析与 Activity schema 偏离官方规范，且 `prompted` 事件的用户输入未进入对话链路。

参考文档：
- [Agent interaction](https://linear.app/developers/agent-interaction)
- [Agent best practices](https://linear.app/developers/agent-best-practices)

## 目标
- 10 秒内写回 `created` 的首个 activity（避免 unresponsive）。
- `prompted` 用户消息进入 OpenClaw 上下文，形成持续对话。
- 所有回写 activity 内容符合官方 schema。
- 评论 mention / isArtificialAgentSessionRoot 触发时，主动创建 agent session，避免缺失 sessionId。

## 非目标
- 不引入外部会话状态管理系统。
- 不扩展除现有 execution layer 以外的写操作能力。
- 不改动 OpenClaw 本体，只调整其输入与回写协议。

## 约束与规范
- `AgentSessionEvent.created` 后 10 秒内必须写回 activity。
- `prompted` 的用户输入在 `agentActivity.body`。
- `promptContext` 为格式化字符串，结构化信息应从 `agentSession.issue` / `previousComments` / `guidance` 取。
- Activity schema：
  - `thought` / `elicitation` / `response` / `error` 使用 `body`。
  - `action` 使用 `action` / `parameter` / `result`。
  - `prompt` 仅由用户创建，agent 不可创建。

## 方案（已选）
采用方案 A：标准化 AgentSessionEvent 解析 + 修正 Activity schema + prompted 回流 + 评论 fallback 主动创建 session。

## 数据流设计
### A. AgentSessionEvent.created
1. 解析 webhook：
   - `agentSessionId = agentSession.id`
   - `workspaceId = organizationId`
   - `issue = agentSession.issue`
   - `promptContext = promptContext (string)`
2. 10 秒内写回 `thought(body)`。
3. 调用 OpenClaw（sessionKey = agentSessionId）。
4. 解析 intent，执行 execution layer 动作。
5. 依次回写 `action` + `response` 或 `error`。

### B. AgentSessionEvent.prompted
1. 解析 `agentActivity.body` 作为最新用户输入。
2. 将其注入 OpenClaw 上下文（追加到 prompt 或 context）。
3. 执行 intent + 回写 `response/error`。

### C. Comment fallback
1. 命中 mention 或 `isArtificialAgentSessionRoot`。
2. 调用 `agentSessionCreateOnComment(commentId)` 创建 session。
3. 等待 Linear 的 `AgentSessionEvent.created` 进入主流程。

## 关键字段映射
- `agentSessionId`：`agentSession.id`
- `workspaceId`：`organizationId`
- `latestUserMessage`：`agentActivity.body`
- `promptContext`：`promptContext`（字符串）
- `issue`：`agentSession.issue`

## 代码变更点
- `/worker/src/routes/webhooks.ts`
  - 规范化解析 AgentSessionEvent payload（created/prompted）。
  - 评论 fallback 改为调用 `agentSessionCreateOnComment`。
- `/worker/src/routes/invoke.ts`
  - 支持 prompted 的用户输入进入 OpenClaw。
  - Activity 回写改为 schema 标准字段。
- `/worker/src/linear/agent.ts`
  - Activity 构造器：统一输出 `body` 或 `action/parameter/result`。
  - 新增 `agentSessionCreateOnComment` GraphQL mutation。

## 错误处理
- OpenClaw 调用失败：写 `error(body)`。
- Intent 解析失败：写 `error(body)` 并附诊断信息。
- Action 执行失败：写 `error(body)` 或 `action(result)`，不静默。

## 测试计划
- webhook 解析测试：created/prompted 都能正确提取 `agentSessionId` 和 `agentActivity.body`。
- Activity schema 测试：不同类型均符合官方字段要求。
- 评论 fallback 测试：确认调用 `agentSessionCreateOnComment`。

## 验证标准
- created 事件 10 秒内出现 thought。
- prompted 消息能触发新的 response。
- Linear 时间线活动类型与内容字段正确显示。

