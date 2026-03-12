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

在仓库根目录执行：

```bash
openclaw plugins install -l ./openclaw/plugins/linear-expert-bridge
```

插件目录现在自带 `package.json` 和 `openclaw.extensions` 声明，便于 `plugins install` 正常记录安装来源。

安装后，在 OpenClaw 配置里显式信任并启用插件，然后再重启 Gateway：

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

推荐的验证顺序：

```bash
openclaw gateway.restart
openclaw linear-expert-bridge status
openclaw doctor --non-interactive
```

如果 `plugins.allow` 留空，Gateway 可能会把本地目录下的插件当作“自动发现的未信任插件”加载，并持续输出 provenance 警告。

## 安装排障

- 如果安装时报“没有 `package.json`”，确认你安装的是当前目录 `./openclaw/plugins/linear-expert-bridge`，而不是旧的拷贝目录。
- 如果日志出现 `loaded without install/load-path provenance`，通常说明插件是手工复制进 `~/.openclaw/extensions` 的，而不是通过 `openclaw plugins install` 安装。
- 如果日志出现 `plugins.allow is empty`，说明配置里没有显式信任 `linear-expert-bridge`。
- 如果日志出现 `http route registration missing or invalid auth`，说明你运行的是旧版本插件；当前版本已经不再注册插件 HTTP route。
- 如果日志持续出现 `http_500`，说明远端 `linear-expert` Worker 的 `/internal/agent-runs` 在报错，这属于 Worker 侧问题，不是安装步骤本身的问题。

## 当前限制

- 这一版已经支持 runtime-first 的执行适配，但真正启用仍取决于当前 Gateway 是否暴露可调用的 agent RPC 入口
- stop 目前是 best-effort：若当前运行时不支持取消信号，会退回到本地中断与结果回传
- heartbeat / progress 会以 best-effort 方式同步回 Worker，不会因为状态回传失败而中断实际 run
- 背景轮询失败只会记录到插件状态，不会再向宿主抛出未处理 rejection
- 当前版本不注册插件 HTTP route；状态查看统一走 RPC/CLI，避免触发 Gateway 的 route auth 校验错误
- 旧 `openclaw/runner` 仍保留，作为 CLI fallback
