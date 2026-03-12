# linear-expert

`linear-expert` 是一个部署在 **Cloudflare Workers** 上的 Linear integration backend，负责接收 Linear webhook、管理 OAuth app token、存储待处理任务，并把这些任务安全地交给 **OpenClaw Expert** 进行分析和生成回复。

一句话：

> **Worker 是载体层，OpenClaw Expert 是大脑。**

这个项目的目标不是把 OpenClaw gateway 暴露到公网，而是让 Linear ↔ Worker ↔ OpenClaw 形成一条更安全、更清晰的集成链路，并让最终在 Linear 里的动作显示为 **app / integration 身份**，而不是污染 Clu 的个人身份。

---

## 1. 核心功能

### 当前已实现 / 已有骨架
- 接收 Linear webhook（`POST /webhooks/linear`）
- 内部任务拉取接口（`GET /internal/tasks`）
- 任务领取接口（`POST /internal/tasks/:id/claim`）
- 任务结果回传接口（`POST /internal/tasks/:id/result`）
- OAuth app 授权入口（`GET /oauth/start`）
- OAuth callback 骨架（`GET /oauth/callback`）
- OAuth token exchange / refresh 主干
- D1-first 数据模型（tasks / replies / oauth_tokens）
- D1 存储接口 + 内存 fallback
- readiness 页面：
  - `GET /` → `Expert is ready` / `Expert is not ready`
  - `GET /healthz` → JSON 详细状态
- 自动化测试与 typecheck

### 设计上要实现的最终能力
- Worker 接收 Linear 事件并落任务
- OpenClaw Expert 主动拉取未处理任务并生成回复
- Worker 以 Linear OAuth app（`actor=app`）身份 comment 回 Linear
- 不把 OpenClaw gateway 暴露到公网

---

## 2. 技术架构

### 组件分层

#### A. Cloudflare Worker（载体层）
负责：
- Linear webhook 入站
- OAuth callback / token refresh
- D1 持久化
- 去重 / 幂等
- 任务分发
- 最终回写 Linear

#### B. OpenClaw Expert（大脑）
负责：
- 拉取 pending tasks
- 根据 issue/comment 上下文判断是否回复
- 生成 `reply` / `noop` / `error`

#### C. D1（状态层）
负责：
- `tasks`
- `replies`
- `oauth_tokens`

### 架构原则
1. **Webhook-first**：Linear 先推到 Worker
2. **Pull to OpenClaw**：OpenClaw 主动拉，不公开 gateway
3. **Actor separation**：Linear 中显示 app，而不是 Clu 本人
4. **Idempotency**：同一 webhook 不重复回复
5. **Minimal v0**：先把 comment 流打通，不急着做大而全自动化

---

## 3. 项目结构

```text
linear-expert/
  docs/
    plans/
      2026-03-10-linear-expert-v0-design.md
  openclaw/
    prompts/
    examples/
  test/
    README.md
    run-tests.mjs
    schemas.test.ts
    signature.test.ts
    storage.memory.test.ts
  worker/
    src/
      auth/
      domain/
      lib/
      linear/
      routes/
      storage/
      env.ts
      index.ts
      types.ts
    .env.example
    package.json
    tsconfig.json
    wrangler.jsonc
  .env.example
  .gitignore
  README.md
  package.json
  tsconfig.json
```

---

## 4. 当前路由

### Public
- `GET /`
  - 返回纯文本：`Expert is ready` / `Expert is not ready`
- `GET /healthz`
  - 返回 JSON readiness 详情
- `GET /oauth/start`
  - 启动 Linear OAuth app 授权流程
  - 会签发短期 `state` 并写入 `HttpOnly + SameSite=Lax` cookie
- `GET /oauth/callback`
  - 接收 Linear OAuth callback
  - 只有 query `state` 与 cookie 中的 `state` 一致时才会继续换 token
  - 会把 installation identity（当前 app user / organization）一起缓存到 OAuth 记录，供 assign/delegate webhook 直接判定是否属于当前 agent
- `POST /webhooks/linear`
  - 接收 Linear webhook
  - 使用 `@linear/sdk/webhooks` 校验 `linear-signature` 与 `linear-timestamp`
  - `@agent` / `isArtificialAgentSessionRoot` 命中后，会先创建 session，再立即主动 invoke，不再被动等待官方 `AgentSessionEvent.created`
  - issue 被 assign / delegate 给当前 app user 时，也会主动创建 session 并立即 invoke
  - comment/issue fallback 创建出 session 后，会立即回写 `externalUrls`，指向公开的 session 状态页
  - 当内部 invocation/comment fallback 失败时返回非 200，允许 Linear 重试

### Internal（仅 OpenClaw / lec 使用）

#### Invocation (WS-37)
- `POST /internal/invoke/agent-session`
  - 接收 Linear AgentSessionEvent.*（例如 `AgentSessionEvent.created`）
  - 对 `AgentSessionEvent.created`：会先 best-effort 将 issue 推进到团队的第一个 `started` 状态，再写首个 `thought`
  - 首个 `thought` 是用户可读的 loading/progress 文案，用于在 OpenClaw 真实执行较慢时先保活；当前文案明确提示“通常需要 30-90 秒”
  - 同一个 `agentSessionId` 的第二次 `created` 会被视为重复事件，不会重复写 `thought` 或重复排队 run
  - 返回：`{ ok: true, traceId, reserved }`
    - `traceId`：本次 invocation 的相关性 ID（并写入 traceStore 供后续关联）
    - `reserved.firstThoughtPrompt`：根据 `promptContext/issue/guidance` 派生的 first-thought prompt（**不执行**任何 Linear actions）
    - `reserved.initialThoughtBody`：实际写回 Linear 的首个 loading/progress 文案
    - `reserved.externalStatusUrl`：当前 session 的公开状态页链接（同时会同步写入 Linear `externalUrls`）
    - `reserved.traceStore`：回显本次写入的 `agentSessionId/workspaceId`（若 payload 提供）
- `POST /internal/invoke/signal`（接收 stop/auth/select 等 signals；当前仅回显派生 prompt，不执行任何 Linear actions）

### Public

- `GET /agent-sessions/:agentSessionId`
  - 公开的 session 状态页
  - 供 Linear `externalUrls` 打开，展示当前 session 状态、最近活动时间、关联 issue 与摘要
  - 当 session 仍在 `active` 时会自动刷新

#### Dev-only replay (WS-37)
- `POST /internal/invoke/replay/agent-session-created`
  - 仅用于本地/开发重放；必须带 `Authorization: Bearer <DEV_REPLAY_SECRET 或 OPENCLAW_INTERNAL_SECRET>`
  - 走与 `/internal/invoke/agent-session` 相同的 prompt 派生逻辑（不含重复 pipeline）

#### Tasks
- `GET /internal/tasks?status=pending&limit=25`
- `POST /internal/tasks/:id/claim`
- `POST /internal/tasks/:id/result`

#### Issues
- `POST /internal/linear/comment`
- `POST /internal/linear/issues/create`
- `POST /internal/linear/issues/get`
- `POST /internal/linear/issues/update`
- `POST /internal/linear/issues/assign`
- `POST /internal/linear/issues/state`
- `POST /internal/linear/issues/project`（issue 加入 project）
- `POST /internal/linear/issues/attachment`
- `POST /internal/linear/issues/relation`

#### Projects
- `POST /internal/linear/resolve`（teamKey -> teamId/workspaceId）
- `POST /internal/linear/team/projects`（列出 team 下 projects）
- `POST /internal/linear/projects/list`
- `POST /internal/linear/projects/get`
- `POST /internal/linear/projects/create`
- `POST /internal/linear/projects/update`
- `POST /internal/linear/projects/delete`（archive 语义）

这些正式 execution APIs 会逐步替代临时 debug 路径。

这些 internal 路由必须通过 `OPENCLAW_INTERNAL_SECRET` 保护。
当前不支持用 session token 直接调用 `/internal/*`。

---

## 5. 环境变量与 Secrets

### 本地开发 `.env`
项目提供：
- 根目录 `.env.example`
- `worker/.env.example`

你应该把真实值放进 `.env` / Cloudflare secrets，**不要提交到 GitHub**。

### 必需变量
- `LINEAR_CLIENT_ID`
- `LINEAR_CLIENT_SECRET`
- `LINEAR_WEBHOOK_SECRET`
- `LINEAR_REDIRECT_URI`
- `OPENCLAW_INTERNAL_SECRET`

### 当前 OAuth scopes
`/oauth/start` 当前会申请以下 scopes：
- `read`
- `write`
- `app:assignable`
- `app:mentionable`

这意味着重新授权后，Expert 应该可以开始出现在 Linear 的 assign / mention 相关入口里。

### OAuth state 校验
- `/oauth/start` 会下发一个 10 分钟有效的 `linear_oauth_state` cookie。
- `/oauth/callback` 必须携带与 cookie 一致的 `state`，否则会直接返回 `400 Invalid state`。
- 完成 callback 后会清理该 cookie。

### 当前项目锚点
- Worker URL: `https://linear-expert.placeapp.workers.dev`
- Webhook URL: `https://linear-expert.placeapp.workers.dev/webhooks/linear`
- OAuth callback: `https://linear-expert.placeapp.workers.dev/oauth/callback`
- D1 name: `linear-expert`
- D1 id: `86c77b94-afbb-4e1c-8b7d-df8961be5bee`

---

## 6. 本地开发

### 安装依赖
```bash
cd ~/Documents/Github/linear-expert
npm install
```

### Typecheck
```bash
npm run typecheck
```

### 运行测试
```bash
npm test
```

### 本地启动 Worker
```bash
cd worker
npm install
npm run dev
```

---

## 7. 部署到 Cloudflare Worker

### 你在部署前需要做的
1. 确保 Cloudflare 上已创建 Worker 项目
2. 绑定 D1 数据库：
   - name: `linear-expert`
   - id: `86c77b94-afbb-4e1c-8b7d-df8961be5bee`
3. 配置 secrets：
   - `LINEAR_CLIENT_ID`
   - `LINEAR_CLIENT_SECRET`
   - `LINEAR_WEBHOOK_SECRET`
   - `OPENCLAW_INTERNAL_SECRET`
4. 设置 `LINEAR_REDIRECT_URI` 为：
   `https://linear-expert.placeapp.workers.dev/oauth/callback`

### Worker 目录部署
```bash
cd ~/Documents/Github/linear-expert/worker
npm install
npx wrangler deploy
```

### 部署后你应该先验这几个点
1. 打开：
   - `https://linear-expert.placeapp.workers.dev/`
   - 应看到：`Expert is ready` 或 `Expert is not ready`
2. 打开：
   - `https://linear-expert.placeapp.workers.dev/healthz`
   - 看 missing secrets / storage / oauth 状态
3. 确认 Linear OAuth app callback / webhook 配置正确

---

## 8. 如何使用（运行时）

### 8.1 lec CLI（推荐：人/脚本调用 internal APIs）
`lec` 是仓库自带 CLI（路径：`./scripts/lec`），用于把常见操作封装为命令行，并统一走 worker 的 internal routes。

前置：
- 本机环境需要 `OPENCLAW_INTERNAL_SECRET`
  - 建议放到：`~/.openclaw/keys/.env`

快速开始：
```bash
cd ~/Documents/Github/linear-expert
set -a; source ~/.openclaw/keys/.env; set +a

./scripts/lec --help
./scripts/lec auth status --plain
./scripts/lec-smoke.sh
```

常用示例：
```bash
# issue
./scripts/lec issue create --team PCF --title "hello" --description "world" --json
./scripts/lec issue get --team PCF --issue PCF-123 --json
./scripts/lec issue update --team PCF --issue PCF-123 --title "new" --json
./scripts/lec comment create --team PCF --issue PCF-123 --body "comment" --json
./scripts/lec attachment add --team PCF --issue PCF-123 --url "https://example.com" --title "link" --json
./scripts/lec relation add --team PCF --issue PCF-123 --relation relates_to --target PCF-456 --json

# project
./scripts/lec project list --team PCF --plain
./scripts/lec project create --team PCF --title "[tmp] proj" --description "desc" --json
./scripts/lec project get --team PCF --project <projectId> --json
./scripts/lec project update --team PCF --project <projectId> --description "desc2" --json
./scripts/lec project delete --team PCF --project <projectId> --json
```

> `lec` 默认 base URL 为生产 worker：`https://linear-expert.placeapp.workers.dev`。
> 如需切换（本地 wrangler dev），设置：`LEC_BASE_URL=http://localhost:8787`

### 8.2 OAuth 授权流程（一次性）
1. 访问：
   `GET /oauth/start`
2. 完成 Linear OAuth app 授权
3. callback 返回后，Worker 将保存 workspace token（持久化到 D1）

### Webhook 流
1. Linear 事件触发 webhook
2. Worker 验签并落 task
3. OpenClaw Expert 拉取 pending tasks
4. Expert 生成：
   - `reply`
   - `noop`
   - `error`
5. Worker 回写 comment 到 Linear

### Ready 判定
- `Expert is ready`：基础配置齐全，D1 可用
- `Expert is not ready`：缺失 secrets、D1 未绑定或关键配置不完整

---

## 9. 自动化测试

当前测试放在：
```text
test/
```

### 已有测试
- `storage.memory.test.ts`
  - 测 task create / claim / complete
- `storage.schema.test.ts`
  - 测 D1 schema 的 webhook 幂等约束
- `schemas.test.ts`
  - 测 schema parse / invalid payload
- `signature.test.ts`
  - 测 webhook signature + timestamp verify
- `parser.test.ts`
  - 测 webhook 中 `workspaceId` 统一使用 organization id
- `webhooks.agent-session.test.ts`
  - 测 AgentSession/comment fallback 主路径，以及下游失败时的重试语义

### 执行
```bash
npm test
```

---

## 10. 当前已知限制

这是一个 **v0 skeleton + 部分主干实现**，不是最终成品。当前仍有这些限制：

1. OAuth callback 虽已接通主干，但仍需要真实安装验证
2. token persistence / refresh 需要用真实 D1 + OAuth app 走一遍
3. commentCreate 需要在真实 app actor 模式下验证 UI 上的 actor 显示
4. OpenClaw pull 这侧还需要接到真实 cron / heartbeat 流程

---

## 11. Roadmap（里程碑）

### Issues / Comments / Attachments / Triage（已接入）

#### Worker routes（internal）
- `POST /internal/linear/issues/create`
- `POST /internal/linear/issues/get`
- `POST /internal/linear/issues/update`
- `POST /internal/linear/issues/assign`
- `POST /internal/linear/issues/state`
- `POST /internal/linear/issues/project`
- `POST /internal/linear/issues/children`
- `POST /internal/linear/issues/archive`
- `POST /internal/linear/issues/delete`
- `POST /internal/linear/comment`
- `POST /internal/linear/comments/update`
- `POST /internal/linear/comments/delete`
- `POST /internal/linear/comments/resolve`
- `POST /internal/linear/comments/unresolve`
- `POST /internal/linear/issues/attachment`
- `POST /internal/linear/attachments/delete`
- `POST /internal/linear/triage/list`
- `POST /internal/linear/triage/move`

#### lec（thin wrapper）
- `./scripts/lec issue archive --issue <id|PCF-123> [--team PCF] [--json]`
- `./scripts/lec issue delete --issue <id|PCF-123> [--team PCF] [--json]`
- `./scripts/lec comment update --id <commentId> --body "<md>" [--team PCF] [--json]`
- `./scripts/lec comment delete --id <commentId> [--team PCF] [--json]`
- `./scripts/lec comment resolve --id <commentId> [--team PCF] [--json]`
- `./scripts/lec comment unresolve --id <commentId> [--team PCF] [--json]`
- `./scripts/lec attachment delete --id <attachmentId> [--team PCF] [--json]`
- `./scripts/lec triage move --issue <id|PCF-123> [--assignee <userId>] [--state <stateId>] [--project <projectId>] [--team PCF] [--json]`

#### Smoke
- `./scripts/lec-smoke.sh`（issue create/get/update/comment lifecycle/attachment lifecycle/relation/project CRUD/archive+delete）
- `./scripts/lec-triage-smoke.sh`（当前做 list-only；`move` 依赖真实 workspace 状态配置，建议在真实值上人工验）

### Search（已接入）

#### Worker routes（internal）
- `POST /internal/linear/search`

#### lec（thin wrapper）
- `./scripts/lec search issues --query "<text>" [--project <projectId>] [--state <StateName>] [--assignee <userId>] [--label <label>] [--team PCF] [--json]`
- `./scripts/lec search documents --query "<text>" [--project <projectId>] [--team PCF] [--json]`
- `./scripts/lec search projects --query "<text>" [--team PCF] [--json]`
- `./scripts/lec search customers --query "<text>" [--team PCF] [--json]`
- `./scripts/lec search customer-needs --query "<text>" [--customer <customerId>] [--project <projectId>] [--team PCF] [--json]`
- `./scripts/lec search project-updates --query "<text>" [--project <projectId>] [--team PCF] [--json]`
- `./scripts/lec search triage [--query "<text>"] [--state <StateName>] [--assignee <userId>] [--project <projectId>] [--team PCF] [--json]`
- `./scripts/lec search all --query "<text>" [--limit 20] [--team PCF] [--json]`

#### 设计约束
- 统一返回 `items[]`，每项都包含 `entityType/id/title/subtitle/url/entity`
- 不支持的过滤组合直接报错，不做 silent ignore
- `search` 负责发现对象，后续精确读取和变更仍走各对象域 `get/update/...`

### Initiatives（已接入）

#### Worker routes（internal）
- `POST /internal/linear/initiatives/list`
- `POST /internal/linear/initiatives/get`
- `POST /internal/linear/initiatives/create`
- `POST /internal/linear/initiatives/update`
- `POST /internal/linear/initiatives/archive`

#### lec（thin wrapper）
- `./scripts/lec initiatives list [--team PCF] [--limit 25] [--json]`
- `./scripts/lec initiatives get --id <initiativeId> [--team PCF] [--json]`
- `./scripts/lec initiatives create --title "<name>" [--description "..."] [--status "..."] [--team PCF] [--json]`
- `./scripts/lec initiatives update --id <initiativeId> [--title "..."] [--description "..."] [--status "..."] [--team PCF] [--json]`
- `./scripts/lec initiatives archive --id <initiativeId> [--team PCF] [--json]`

#### Smoke
- `./scripts/lec-initiatives-smoke.sh`（create -> update -> archive）

### Cycles（已接入）

#### Worker routes（internal）
- `POST /internal/linear/cycles/list`
- `POST /internal/linear/cycles/get`
- `POST /internal/linear/cycles/create`
- `POST /internal/linear/cycles/update`
- `POST /internal/linear/cycles/archive`

#### lec（thin wrapper）
- `./scripts/lec cycles list [--team PCF] [--limit 25] [--json]`
- `./scripts/lec cycles get --id <cycleId> [--team PCF] [--json]`
- `./scripts/lec cycles create [--title "<name>"] --starts-at YYYY-MM-DD --ends-at YYYY-MM-DD [--team PCF] [--json]`
- `./scripts/lec cycles update --id <cycleId> [--title "<name>"] [--starts-at YYYY-MM-DD] [--ends-at YYYY-MM-DD] [--team PCF] [--json]`
- `./scripts/lec cycles archive --id <cycleId> [--team PCF] [--json]`

#### Smoke
- `./scripts/lec-cycles-smoke.sh`

### Labels（已接入）

#### Worker routes（internal）
- `POST /internal/linear/labels/list`
- `POST /internal/linear/labels/get`
- `POST /internal/linear/labels/create`
- `POST /internal/linear/labels/update`
- `POST /internal/linear/labels/retire`
- `POST /internal/linear/labels/restore`

#### lec（thin wrapper）
- `./scripts/lec labels list [--team PCF] [--limit 25] [--json]`
- `./scripts/lec labels get --id <labelId> [--team PCF] [--json]`
- `./scripts/lec labels create --title "<name>" [--description "..."] [--color "..."] [--team PCF] [--json]`
- `./scripts/lec labels update --id <labelId> [--title "..."] [--description "..."] [--color "..."] [--team PCF] [--json]`
- `./scripts/lec labels retire --id <labelId> [--team PCF] [--json]`
- `./scripts/lec labels restore --id <labelId> [--team PCF] [--json]`

#### Smoke
- `./scripts/lec-labels-smoke.sh`（create -> update -> retire -> restore）

### Documents（已接入）

#### Worker routes（internal）
- `POST /internal/linear/documents/list`
- `POST /internal/linear/documents/get`
- `POST /internal/linear/documents/create`
- `POST /internal/linear/documents/update`
- `POST /internal/linear/documents/delete`
- `POST /internal/linear/documents/unarchive`

#### lec（thin wrapper）
- `./scripts/lec documents list [--team PCF] [--limit 25] [--json]`
- `./scripts/lec documents get --id <documentId> [--team PCF] [--json]`
- `./scripts/lec documents create --title "<name>" --body "<md>" [--project <projectId>] [--issue <issueId>] [--initiative <initiativeId>] [--team PCF] [--json]`
- `./scripts/lec documents update --id <documentId> [--title "<name>"] [--body "<md>"] [--team PCF] [--json]`
- `./scripts/lec documents delete --id <documentId> [--team PCF] [--json]`
- `./scripts/lec documents unarchive --id <documentId> [--team PCF] [--json]`

#### Smoke
- `./scripts/lec-documents-smoke.sh`（create -> update -> delete -> unarchive）

### Customers / Customer Needs（已接入）

#### Worker routes（internal）
- `POST /internal/linear/customers/list`
- `POST /internal/linear/customers/get`
- `POST /internal/linear/customers/create`
- `POST /internal/linear/customers/update`
- `POST /internal/linear/customers/delete`
- `POST /internal/linear/customer-needs/list`
- `POST /internal/linear/customer-needs/get`
- `POST /internal/linear/customer-needs/create`
- `POST /internal/linear/customer-needs/update`
- `POST /internal/linear/customer-needs/delete`
- `POST /internal/linear/customer-needs/unarchive`

#### lec（thin wrapper）
- `./scripts/lec customers list [--team PCF] [--limit 25] [--json]`
- `./scripts/lec customers get --id <customerId> [--team PCF] [--json]`
- `./scripts/lec customers create --title "<name>" [--domain "<domain>"] [--revenue <n>] [--size <n>] [--team PCF] [--json]`
- `./scripts/lec customers update --id <customerId> [--title "<name>"] [--domain "<domain>"] [--revenue <n>] [--size <n>] [--team PCF] [--json]`
- `./scripts/lec customers delete --id <customerId> [--team PCF] [--json]`
- `./scripts/lec customer-needs list [--team PCF] [--limit 25] [--json]`
- `./scripts/lec customer-needs get --id <needId> [--team PCF] [--json]`
- `./scripts/lec customer-needs create --body "<md>" --customer <customerId> [--issue <issueId>] [--project <projectId>] [--team PCF] [--json]`
- `./scripts/lec customer-needs update --id <needId> [--body "<md>"] [--customer <customerId>] [--issue <issueId>] [--project <projectId>] [--team PCF] [--json]`
- `./scripts/lec customer-needs delete --id <needId> [--team PCF] [--json]`
- `./scripts/lec customer-needs unarchive --id <needId> [--team PCF] [--json]`

#### Smoke
- `./scripts/lec-customers-smoke.sh`（create -> update -> delete）
- `./scripts/lec-customer-needs-smoke.sh`（create customer -> create need -> update -> delete -> unarchive -> cleanup customer）

### Project Updates（已接入）

#### Worker routes（internal）
- `POST /internal/linear/project-updates/list`
- `POST /internal/linear/project-updates/get`
- `POST /internal/linear/project-updates/create`
- `POST /internal/linear/project-updates/update`
- `POST /internal/linear/project-updates/delete`
- `POST /internal/linear/project-updates/unarchive`

#### lec（thin wrapper）
- `./scripts/lec project-updates list [--team PCF] [--limit 25] [--json]`
- `./scripts/lec project-updates get --id <updateId> [--team PCF] [--json]`
- `./scripts/lec project-updates create --project <projectId> --body "<md>" [--status <health>] [--team PCF] [--json]`
- `./scripts/lec project-updates update --id <updateId> [--body "<md>"] [--status <health>] [--team PCF] [--json]`
- `./scripts/lec project-updates delete --id <updateId> [--team PCF] [--json]`
- `./scripts/lec project-updates unarchive --id <updateId> [--team PCF] [--json]`

#### Smoke
- `./scripts/lec-project-updates-smoke.sh`（create project -> create update -> update -> delete -> unarchive -> cleanup project）

### Workflow States（已接入）

#### Worker routes（internal）
- `POST /internal/linear/workflow-states/list`
- `POST /internal/linear/workflow-states/get`
- `POST /internal/linear/workflow-states/create`
- `POST /internal/linear/workflow-states/update`
- `POST /internal/linear/workflow-states/archive`

#### lec（thin wrapper）
- `./scripts/lec workflow-states list [--team PCF] [--limit 25] [--json]`
- `./scripts/lec workflow-states get --id <stateId> [--team PCF] [--json]`
- `./scripts/lec workflow-states create --title "<name>" --state <type> [--team PCF] [--json]`
- `./scripts/lec workflow-states update --id <stateId> [--title "<name>"] [--state <type>] [--team PCF] [--json]`
- `./scripts/lec workflow-states archive --id <stateId> [--team PCF] [--json]`

#### Smoke
- `./scripts/lec-workflow-states-smoke.sh`（create -> update -> archive）


### 已完成
- OAuth app 授权 + D1 存储骨架
- Internal execution APIs：Issues / Comments / Attachments / Relations / Projects / Triage / Search / Initiatives / Cycles / Labels / Documents / Customers / Customer Needs / Project Updates / Workflow States / Resolve
- `lec` CLI 能力面与 worker internal routes 对齐
- 分域 smoke 脚本：`lec-smoke.sh`、`lec-initiatives-smoke.sh`、`lec-cycles-smoke.sh`、`lec-labels-smoke.sh`、`lec-triage-smoke.sh`、`lec-documents-smoke.sh`、`lec-customers-smoke.sh`、`lec-customer-needs-smoke.sh`、`lec-project-updates-smoke.sh`、`lec-workflow-states-smoke.sh`

### 进行中
- Contracts/错误码/返回结构进一步收敛（减少调用方猜字段）
- 稳健性：幂等 key、重试、超时与更好的错误日志
- CI：对 `main` 分层跑 core smoke / domain smoke + worker typecheck/tests
- OpenClaw pull 侧与 webhook/task 的真实闭环跑通（生产实测）

### 后续
- 更完整的 webhook event coverage（更多事件类型与边界情况）
- 自动状态更新 / 自动 assign / routing
- Multi-workspace 支持
- Templates / 其它低优先级对象域（按需求逐个接入）

---

## 12. 当前项目状态一句话

> `linear-expert` 现在已经是一个**可测试、可部署准备、可继续接真集成**的 Worker v0 项目；下一步重点不是再搭骨架，而是把真实 Linear OAuth / webhook / app actor 流程跑通。
