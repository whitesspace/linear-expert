# Linear Expert Bridge Plugin

这是 `linear-expert` 的 OpenClaw Gateway 内置桥接插件原型。

目标：
- 在 Gateway 进程内轮询 `linear-expert` 的 `agent-runs`
- 优先通过 Gateway 内部 agent runtime 执行 run，拿不到稳定入口时再退回 CLI
- 通过 Gateway RPC 暴露插件状态与手动触发
- 避免再依赖独立的外部 runner 守护进程

## 当前能力

- Background service: 轮询 `GET /internal/agent-runs`
- Claim + submit: 复用现有 `agent-runs/:id/claim` 与 `agent-runs/:id/result`
- Gateway RPC:
  - `linear-expert-bridge.status`
  - `linear-expert-bridge.runOnce`
  - `linear-expert-bridge.stop`
- CLI:
  - `openclaw linear-expert-bridge status`
  - `openclaw linear-expert-bridge run-once`
  - `openclaw linear-expert-bridge stop <runId>`
- HTTP handler:
  - 优先使用文档化的 `registerHttpRoute`
  - 若运行时仍是旧 API，会回退到 `registerGatewayHttpHandler` / `registerHttpHandler`
- 生命周期状态：
  - active run 会暴露 `phase / lastHeartbeatAt / stopRequested / executionMode / gatewayRunId`

## 安装（本地开发）

```bash
openclaw plugins install -l ./openclaw/plugins/linear-expert-bridge
```

重启 Gateway 后，在 OpenClaw 配置里启用：

```json
{
  "plugins": {
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

## 当前限制

- 这一版已经支持 runtime-first 的执行适配，但真正启用仍取决于当前 Gateway 是否暴露可调用的 agent RPC 入口
- stop 目前是 best-effort：若当前运行时不支持取消信号，会退回到本地中断与结果回传
- 旧 `openclaw/runner` 仍保留，作为 CLI fallback
