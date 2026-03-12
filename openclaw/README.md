# OpenClaw 集成指引

本目录为 OpenClaw/Expert 侧脚本与提示语的暂存空间，帮助脑子以 cron/heartbeat 方式与 Cloudflare Worker 交互。

## 调用流程
1. **拉取 agent run**：`GET /internal/agent-runs?status=pending&limit=5`
2. **领取 agent run**：`POST /internal/agent-runs/:id/claim`，body 固定 `{"lockDurationSeconds":600}`
3. **调用 OpenClaw CLI**：默认使用 `openclaw agent --json --message ...`
4. **回传 intent 结果**：`POST /internal/agent-runs/:id/result`

所有 `/internal/*` 接口都需要 `Authorization: Bearer <OPENCLAW_INTERNAL_SECRET>` 头。
不支持用 session token 调用这些接口。

## JSON 示例
- `examples/pending-task.json`：旧 `tasks` 路径遗留示例，当前 runner 不再使用。
- `examples/result-reply.json`：旧 `tasks` 结果体遗留示例，当前 runner 不再使用。

## TODO
- 添加 `agent-runs` 对应的新示例 JSON。
- 保存 Expert 提示词模板与 few-shot 示例。
