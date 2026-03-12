# 2026-03-13 - linear-expert bridge plugin 设计

## 目标

把 `linear-expert` 与 OpenClaw 的桥接层从“外部 runner 守护进程”推进到“Gateway 内部插件”。

当前阶段的目标不是一步删掉旧 runner，而是先落一个可安装、可观测、可扩展的插件骨架：

- 在 OpenClaw Gateway 内注册 background service
- 轮询 `linear-expert` 的 `agent-runs`
- 通过 Gateway RPC 暴露 bridge 状态与 stop 控制
- 用 runtime-first 适配层优先尝试 Gateway agent 执行，再保留 CLI fallback

## 背景问题

旧设计的问题不在于“能不能跑”，而在于桥接协议散落在多层：

- Worker 内部 `agent-runs` contract
- 外部 runner 的 shell / timeout / stdout JSON 抽取
- OpenClaw CLI 的输出格式

这会带来两个结构性问题：

1. 桥接层不可观测
2. shell 级边界太脆，错误恢复和健康状态都不成体系

## 方案

### A. Worker 继续负责

- Linear webhook 入站
- OAuth / installation identity
- `agent-runs` 存储与 claim/result 接口
- session 状态页 / externalUrls

### B. OpenClaw 插件负责

- background service 轮询 `GET /internal/agent-runs`
- claim / execute / submit result
- Gateway RPC:
  - `linear-expert-bridge.status`
  - `linear-expert-bridge.runOnce`
  - `linear-expert-bridge.stop`
- 可选 HTTP 状态接口：
  - `/plugins/linear-expert-bridge/status`
- active run 生命周期：
  - `phase`
  - `lastHeartbeatAt`
  - `stopRequested`
  - `executionMode`
  - `gatewayRunId`

### C. 当前阶段执行层

当前原型采用 runtime-first 适配：

- 若插件 API 暴露可调用的 Gateway agent 入口，就优先走内部 runtime
- 若当前 Gateway 版本没有稳定入口，则回退到 `openclaw agent --json --message`

这样做的目的是先把“桥接层位置”放对，同时避免过早绑定未文档化私有 API。

## 插件边界

### 现在做

- 插件 manifest
- config schema
- service lifecycle
- Gateway RPC / CLI status / stop
- polling client
- runtime-first 执行适配
- active run heartbeat / stop 状态
- 复用 runner-core 作为 CLI fallback

### 暂不做

- 真实 Gateway API 版本矩阵验证
- 细粒度 progress 上报到 Worker
- 停止信号到所有 Gateway 版本的一致 cancel 语义
- 替换旧 runner 的生产 cutover

## 配置

- `linearExpertBaseUrl`
- `internalSecret`
- `cliBin`
- `cliArgs`
- `pollIntervalMs`
- `timeoutMs`
- `heartbeatIntervalMs`
- `lockDurationSeconds`
- `maxRunsPerPoll`

## 验证策略

### 单元/契约

- config normalize
- pollOnce → runtime-first list / claim / submit 主路径
- processClaimedRun → stop / heartbeat 生命周期
- plugin register → service / RPC / CLI / HTTP 注册

### 现有回归

- runner-core
- runner-utils

## 后续演进

1. 用真实、文档化的 Gateway agent 调用入口替换当前 feature-detect runtime 适配
2. 把 progress / heartbeat 同步回 Worker，形成跨系统可见状态
3. 增加 plugin health metrics
4. 当 plugin 在真实环境稳定后，删除外部 runner 守护进程

## 原则

桥接层应当是运行时基础设施，而不是一段“碰巧能跑”的外部脚本。
