# OpenClaw 集成指引

本目录为 OpenClaw/Expert 侧脚本与提示语的暂存空间，帮助脑子以 cron/heartbeat 方式与 Cloudflare Worker 交互。

## 调用流程
1. **拉取 agent run**：`GET /internal/agent-runs?status=pending&limit=5`
2. **领取 agent run**：`POST /internal/agent-runs/:id/claim`，body 固定 `{"lockDurationSeconds":600}`
3. **执行 agent run**：
   - 优先由 `plugins/linear-expert-bridge` 走 Gateway runtime-first 适配执行
   - 当前若 Gateway 没暴露稳定 runtime 调用入口，会退回 `openclaw agent --json --message ...`
4. **同步运行态**：`POST /internal/agent-runs/:id/heartbeat`
   - 可回传 `phase / message / percent / gatewayRunId`
5. **回传 intent 结果**：`POST /internal/agent-runs/:id/result`

所有 `/internal/*` 接口都需要 `Authorization: Bearer <OPENCLAW_INTERNAL_SECRET>` 头。
不支持用 session token 调用这些接口。

## JSON 示例
- `examples/pending-task.json`：旧 `tasks` 路径遗留示例，当前 runner 不再使用。
- `examples/result-reply.json`：旧 `tasks` 结果体遗留示例，当前 runner 不再使用。

## TODO
- 添加 `agent-runs` 对应的新示例 JSON。
- 保存 Expert 提示词模板与 few-shot 示例。

## Plugin Prototype

- `plugins/linear-expert-bridge/`
  - OpenClaw Gateway 插件原型
  - 用 background service + Gateway RPC 方式替代外部 runner 守护进程
  - 当前为 runtime-first + CLI fallback 过渡版
  - 已支持 `status / runOnce / stop`
  - 已支持把 active run 的 heartbeat/progress 同步回 Worker
  - 当前不注册插件 HTTP route，避免触发 Gateway route auth 校验错误

## 安装与启用

在仓库根目录执行本地安装：

```bash
openclaw plugins install -l ./openclaw/plugins/linear-expert-bridge
```

安装后需要在 OpenClaw 配置里显式启用插件，并把 `linear-expert-bridge` 加入 `plugins.allow`，避免被当作未信任的本地代码自动加载：

```json
{
  "plugins": {
    "allow": ["linear-expert-bridge"],
    "entries": {
      "linear-expert-bridge": {
        "enabled": true,
        "config": {
          "linearExpertBaseUrl": "https://linear-expert.placeapp.workers.dev",
          "internalSecret": "OPENCLAW_INTERNAL_SECRET",
          "cliBin": "openclaw",
          "cliArgs": "agent --json --message",
          "pollIntervalMs": 5000,
          "timeoutMs": 300000,
          "heartbeatIntervalMs": 10000,
          "lockDurationSeconds": 600,
          "maxRunsPerPoll": 5
        }
      }
    }
  }
}
```

修改配置后重启 Gateway，再用下面的命令确认插件已经加载：

```bash
openclaw linear-expert-bridge status
openclaw doctor --non-interactive
```

更详细的安装和排障说明见 [`plugins/linear-expert-bridge/README.md`](./plugins/linear-expert-bridge/README.md)。
