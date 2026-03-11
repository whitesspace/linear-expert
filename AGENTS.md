# Repository Guidelines

## Project Structure & Module Organization
`linear-expert` 是部署在 Cloudflare Workers 上的 Linear 集成后端，核心代码与测试都在仓库内。

- `worker/src/`: 生产 TypeScript 代码入口与业务实现。
- `worker/src/routes/`: 路由处理（`webhooks`/`oauth`/`internal`/`debug`）。
- `worker/src/linear/`: Linear 域模型与客户端封装（issues/projects/initiatives/cycles/triage）。
- `worker/src/storage/`: 存储适配（`d1`/`memory`）与 `schema.sql`。
- `test/`: 集成与契约测试，统一由 `run-tests.mjs` 触发。
- `scripts/`: 本地 CLI 与 smoke 脚本（`lec-*`）。
- `docs/plans/`: 设计与执行层规划文档。
- `openclaw/`: OpenClaw 相关 prompts/examples。

## Build, Test, and Development Commands
- `npm install`: 安装根目录依赖。
- `npm run dev`: 启动本地 Worker（`wrangler dev worker/src/index.ts`）。
- `npm run typecheck`: TypeScript 严格类型检查（`tsc --noEmit`）。
- `npm test`: 运行全部测试（`node test/run-tests.mjs`）。
- `cd worker && npm run dev`: 使用子包配置启动 Worker。
- `npm run deploy`: Wrangler 部署（需 Cloudflare 认证）。

## Coding Style & Naming Conventions
- 语言：TypeScript（ESM），开启严格模式。
- 缩进：2 空格；函数保持小而单一职责。
- 命名：变量/函数 `camelCase`，类型/Schema `PascalCase`，脚本文件名用 `kebab-case`。
- 入口校验统一使用 `zod`，无效请求返回明确 JSON 错误。
- 路由层只做参数解析与调度，业务逻辑放在 `worker/src/linear/*`。

## Testing Guidelines
- 测试为可执行的 `.test.ts`，基于 Node + `tsx` 与 `node:assert/strict`。
- 每次新增/修改路由或契约必须补测试（状态码、校验、返回结构、副作用）。
- 命名建议：`feature.behavior.test.ts`，示例 `internal.routes.test.ts`。
- 提交前至少跑 `npm test` 与 `npm run typecheck`。

## Commit & Pull Request Guidelines
- 提交风格遵循历史记录：简洁范围 + 工单（例如 `WS-68: add initiatives list route` + `Refs WS-68`）。
- 保持提交原子性，避免把重构与行为变更混在一起。
- PR 需要包含：
1. 清晰摘要与动机。
2. 关联 issue/ticket。
3. API 或 schema 变更说明。
4. 测试证据（`npm test`/`npm run typecheck`）。
5. 路由变更时给出示例请求/响应。

## Security & Configuration Tips
- 禁止提交真实密钥，使用 `.env.example` 与 `worker/.env.example` 作为模板。
- 必需变量：`LINEAR_CLIENT_SECRET`、`LINEAR_WEBHOOK_SECRET`、`OPENCLAW_INTERNAL_SECRET`。
- 内部路由必须保持 `OPENCLAW_INTERNAL_SECRET` 校验。
