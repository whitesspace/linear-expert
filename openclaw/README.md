# OpenClaw 集成指引

本目录为 OpenClaw/Expert 侧脚本与提示语的暂存空间，帮助脑子以 cron/heartbeat 方式与 Cloudflare Worker 交互。

## 调用流程
1. **拉取任务**：`GET /internal/tasks?status=pending&limit=10`
2. **领取任务**：`POST /internal/tasks/:id/claim`，body 可选 `{"lockDurationSeconds":300}`
3. **调用 Expert 推理**：按照 prompts/linear-task.md 生成回复。
4. **回传结果**：`POST /internal/tasks/:id/result`

所有 `/internal/*` 接口都需要 `Authorization: Bearer <OPENCLAW_INTERNAL_SECRET>` 头。
不支持用 session token 调用这些接口。

## JSON 示例
- `examples/pending-task.json`：`GET /internal/tasks` 可能返回的结构。
- `examples/result-reply.json`：`POST /internal/tasks/:id/result` 的 body 示例。

## TODO
- 添加自动 cron worker 样例脚本。
- 保存 Expert 提示词模板与 few-shot 示例。
