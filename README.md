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
- `GET /oauth/callback`
  - 接收 Linear OAuth callback
- `POST /webhooks/linear`
  - 接收 Linear webhook

### Internal（仅 OpenClaw / lec 使用）

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

### 授权流程
1. 访问：
   `GET /oauth/start`
2. 完成 Linear OAuth app 授权
3. callback 返回后，Worker 将保存 workspace token（目前已接主干，后续继续验证 D1 持久化）

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
- `schemas.test.ts`
  - 测 schema parse / invalid payload
- `signature.test.ts`
  - 测 webhook HMAC signature verify

### 执行
```bash
npm test
```

---

## 10. 当前已知限制

这是一个 **v0 skeleton + 部分主干实现**，不是最终成品。当前仍有这些限制：

1. Linear webhook 的签名 header 格式仍需要真实 webhook 实测确认
2. OAuth callback 虽已接通主干，但仍需要真实安装验证
3. token persistence / refresh 需要用真实 D1 + OAuth app 走一遍
4. commentCreate 需要在真实 app actor 模式下验证 UI 上的 actor 显示
5. OpenClaw pull 这侧还需要接到真实 cron / heartbeat 流程

---

## 11. Roadmap（里程碑）

### 已完成
- OAuth app 授权 + D1 存储骨架
- Internal execution APIs：Issues / Comments / Attachments / Relations / Projects CRUD / Resolve
- `lec` CLI + `lec-smoke.sh` 端到端验收脚本

### 进行中
- Contracts/错误码/返回结构进一步收敛（减少调用方猜字段）
- 稳健性：幂等 key、重试、超时与更好的错误日志
- CI：对 `main` 强制跑 `./scripts/lec-smoke.sh` + worker typecheck/tests
- OpenClaw pull 侧与 webhook/task 的真实闭环跑通（生产实测）

### 后续
- 更完整的 webhook event coverage（更多事件类型与边界情况）
- 自动状态更新 / 自动 assign / routing
- Multi-workspace 支持
- 扩对象域：Initiatives / Cycles / Labels / Triage / Templates 等（按需求优先级逐个接入）

---

## 12. 当前项目状态一句话

> `linear-expert` 现在已经是一个**可测试、可部署准备、可继续接真集成**的 Worker v0 项目；下一步重点不是再搭骨架，而是把真实 Linear OAuth / webhook / app actor 流程跑通。
