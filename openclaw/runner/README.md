# OpenClaw Pull Runner

这是一个出站轮询进程，用于从 linear-expert 拉取 agent run，执行 OpenClaw CLI，并回传 intent 结果。

## 环境变量
- `LINEAR_EXPERT_BASE_URL`：linear-expert 地址（必填）
- `OPENCLAW_INTERNAL_SECRET`：internal 接口鉴权（必填）
- `OPENCLAW_CLI_BIN`：OpenClaw CLI 可执行文件（默认 `openclaw`）
- `OPENCLAW_CLI_ARGS`：CLI 参数（默认 `agent --json --message`）
- `RUNNER_POLL_INTERVAL_MS`：轮询间隔（默认 5000）
- `OPENCLAW_CLI_TIMEOUT_MS`：单次执行超时（默认 300000）
- `RUNNER_ONCE`：设为 `true` 时只执行一轮

## 运行
```bash
export LINEAR_EXPERT_BASE_URL="https://linear-expert.example.com"
export OPENCLAW_INTERNAL_SECRET="secret"
node openclaw/runner/runner.mjs
```

## 输出约定
- 按 OpenClaw `agent send` 文档，runner 现在默认强制使用 `--json`
- runner 会优先解析整段结构化 JSON；如果 reply/message 字段里包含 intent JSON，也会继续抽取
- 期望最终 intent 结构示例：
  `{ "actions": [ { "kind": "comment", "issueId": "...", "body": "..." } ] }`
