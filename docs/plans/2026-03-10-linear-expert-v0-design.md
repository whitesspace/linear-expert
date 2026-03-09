# 2026-03-10 - linear-expert v0 设计

## 目标
构建一个部署在 Cloudflare Workers 的 Linear Expert integration：
- 接收 Linear webhook
- 以 OAuth app / actor=app 身份在 Linear 中留下动作
- 不把 OpenClaw gateway 暴露到公网
- 通过 Worker 存任务、OpenClaw 主动拉取的方式，把 OpenClaw/Expert 作为“脑子”接进来

## 设计原则
1. **Webhook-first**：Linear 事件先进 Worker，而不是让外部系统直接打 OpenClaw。
2. **Pull, not push to OpenClaw**：OpenClaw 通过 cron/heartbeat 主动拉取待处理任务。
3. **Actor separation**：Linear 中的动作最终显示为 app/integration，而不是 Clu 本人。
4. **最小可行 v0**：先只做“收事件 → 生成回复 → comment 回 Linear”。
5. **幂等优先**：同一 webhook 事件不能重复触发多次回复。

## v0 范围
### 入站
- 接收 Linear webhook
- 验签
- 只处理最小事件集：
  - issue created
  - comment created
  - issue assigned（可选）
  - issue status changed（可选）
- 将事件写入任务队列 / 持久化存储

### OpenClaw 拉取
- OpenClaw 定时拉取未处理任务
- 将任务转换为 Expert 可理解的上下文
- Expert 输出：
  - `reply`: 要发回 Linear 的 comment
  - `noop`: 不回复
  - `error`: 暂时失败，可重试

### 出站
- Worker 使用 OAuth access token（actor=app）向 Linear GraphQL API 回写 comment
- 记录回复状态，避免重复发送

## 非目标（v0 不做）
- 自动改状态
- 自动 assign
- 多 workspace 支持
- 自定义路由规则 UI
- 人工审批系统
- 长链路同步到其他平台

## 架构
### 1. Cloudflare Worker
职责：
- 接收 webhook
- 验签
- 解析并过滤事件
- 生成内部 task
- 持久化 task
- 刷新 OAuth token
- 调用 Linear GraphQL 回写 comment

### 2. Cloudflare 存储
建议：
- **D1**：存 tasks / replies / oauth tokens / processing logs
- **KV**：可选，用于短期幂等键缓存
- **Queue**：可选；v0 可以先不强依赖，直接 D1 轮询即可

### 3. OpenClaw / Expert
职责：
- cron/heartbeat 拉取 `/tasks?status=pending`
- 对每个 task 调用 Expert 生成回复
- 将结果 POST 回 Worker

## 数据模型
### Task
- `id`
- `source` = linear
- `event_type`
- `webhook_id` / signature hash
- `workspace_id`
- `organization_id`
- `issue_id`
- `issue_identifier` (e.g. PCF-2151)
- `comment_id` (nullable)
- `actor_id`
- `actor_name`
- `payload_json`
- `status` = pending | processing | completed | ignored | failed
- `created_at`
- `updated_at`
- `lock_expires_at`

### Reply
- `id`
- `task_id`
- `issue_id`
- `comment_id` (Linear returned)
- `body`
- `status` = sent | failed
- `sent_at`
- `error`

### OAuthToken
- `workspace_id`
- `access_token`
- `refresh_token`
- `expires_at`
- `scopes`
- `actor_mode` = app

## API Contract（Worker 内部）
### 1. `POST /webhooks/linear`
- Linear webhook 入站
- 验签后写 task
- 返回 200

### 2. `GET /internal/tasks?status=pending&limit=...`
- 仅供 OpenClaw 拉取
- 需要内部 bearer secret
- 返回最小 task 列表

### 3. `POST /internal/tasks/:id/claim`
- OpenClaw 领取任务
- 设置 processing lock

### 4. `POST /internal/tasks/:id/result`
- OpenClaw 回传处理结果
- body 结构：
  - `action`: reply | noop | error
  - `replyBody`: string (optional)
  - `reason`: string (optional)

### 5. `POST /internal/tasks/:id/reply`
- Worker 执行回写到 Linear
- 通常可由 `/result` 内部直接触发，不一定暴露独立 endpoint

## 安全边界
1. **不暴露 OpenClaw gateway**
2. Worker 与 OpenClaw 之间只走超窄 internal secret API
3. webhook 必须验签
4. internal endpoints 必须 bearer secret
5. OpenClaw 只看到经过过滤后的最小任务 payload
6. OAuth token 仅存 Worker secrets / D1，不进聊天上下文

## 幂等策略
- 以 webhook event id / payload hash 做去重
- 同一 task 只能有一个成功 reply
- 若任务已 sent，再次收到重复 webhook 时标记 ignored

## OpenClaw 侧运行方式
### 推荐
- 用 cron job 每 1~3 分钟拉取 pending tasks
- 由 Expert session 专门处理 Linear tasks

### 为什么不用公网推送
- 避免暴露 OpenClaw gateway/control surface
- 降低 token 泄漏和 prompt injection 风险

## OAuth App 模式
- 使用 Linear OAuth2
- 授权 URL 使用 `actor=app`
- access token 动态刷新
- Worker 负责 refresh token 逻辑
- 写回 Linear 时，actor 应显示为 app/integration

## v0 验收标准
1. Worker 能接收并存储一条 Linear webhook
2. OpenClaw 能拉到 pending task
3. Expert 能返回 reply/noop
4. Worker 能以 app 身份成功 comment 回 Linear
5. 同一事件不会重复发两次 comment

## 推荐技术栈
- Cloudflare Workers
- TypeScript
- D1
- zod（schema validation）
- Linear GraphQL via fetch

## 目录建议
```text
linear-expert/
  worker/
    src/
      index.ts
      routes/
      linear/
      storage/
      auth/
    wrangler.jsonc
  docs/plans/
  openclaw/
    prompts/
    examples/
```

## 需要的密钥 / 配置（后续再向 Clu 一次性索取）
- LINEAR_CLIENT_ID
- LINEAR_CLIENT_SECRET
- LINEAR_WEBHOOK_SECRET
- LINEAR_REDIRECT_URI
- OPENCLAW_INTERNAL_SECRET
- OPENCLAW_TASK_AGENT_LABEL / routing target
- Cloudflare account / D1 / KV / Worker env
