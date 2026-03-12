# Linear Expert Bridge Plugin

这是 `linear-expert` 的 OpenClaw Gateway 内置桥接插件原型。

目标：
- 在 Gateway 进程内轮询 `linear-expert` 的 `agent-runs`
- 优先通过 Gateway 内部 agent runtime 执行 run，拿不到稳定入口时再退回 CLI
- 通过 Gateway RPC 暴露插件状态与手动触发
- 避免再依赖独立的外部 runner 守护进程

## 当前能力

- Background service: 轮询 `GET /internal/agent-runs`
- Claim + runtime state + submit:
  - `agent-runs/:id/claim`
  - `agent-runs/:id/heartbeat`
  - `agent-runs/:id/result`
- Gateway RPC:
  - `linear-expert-bridge.status`
  - `linear-expert-bridge.runOnce`
  - `linear-expert-bridge.stop`
- CLI:
  - `openclaw linear-expert-bridge status`
  - `openclaw linear-expert-bridge run-once`
  - `openclaw linear-expert-bridge stop <runId>`
- 生命周期状态：
  - active run 会暴露 `phase / lastHeartbeatAt / stopRequested / executionMode / gatewayRunId`
  - Worker 侧会同步保存 `progressPhase / progressMessage / progressPercent / lastHeartbeatAt / gatewayRunId`

## 安装（本地开发）

```bash
openclaw plugins install -l ./openclaw/plugins/linear-expert-bridge
```

插件目录现在自带 `package.json` 和 `openclaw.extensions` 声明，便于 `plugins install` 正常记录安装来源。

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
- heartbeat / progress 会以 best-effort 方式同步回 Worker，不会因为状态回传失败而中断实际 run
- 背景轮询失败只会记录到插件状态，不会再向宿主抛出未处理 rejection
- 当前版本不注册插件 HTTP route；状态查看统一走 RPC/CLI，避免触发 Gateway 的 route auth 校验错误
- 旧 `openclaw/runner` 仍保留，作为 CLI fallback
