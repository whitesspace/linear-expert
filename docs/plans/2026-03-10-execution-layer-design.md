# Linear-expert Execution Layer 设计

## 背景
`linear-expert` 当前已经验证了 Cloudflare Worker + OAuth `actor=app` 这条链路可行：
- Expert 可以作为 app actor 在 Linear 中真实发表评论
- OAuth token 可以按 workspace 持久化到 D1
- Worker 已具备 webhook / internal task / oauth callback 基础结构

当前缺口不再是“能不能发一条 comment”，而是：
**如何把这套能力收口为稳定的 Execution Layer，让 Expert 对 Linear 的所有写操作都通过自己的身份完成，而不是走本地 CLI 或个人凭据。**

## 本阶段目标
1. 把 Linear 写操作统一收口到 Worker 执行层
2. 以 OAuth app actor 作为唯一的写入身份
3. 用结构化 internal APIs 替代临时 debug endpoints
4. 让 webhook → task → result 能驱动真正的 Linear 写回
5. 为下一阶段的 Agent Native Invocation 预留干净边界

## 非目标
- 现在就实现 `@Expert` 原生唤起
- 现在就把所有 read path 从 CLI 迁走
- 现在就把 execution layer 和 invocation layer 混在一起

## 设计原则
- **写入统一**：凡是会修改 Linear 数据的动作，都必须走 Worker execution layer
- **读取分阶段**：读取能力可以暂时保留 CLI / 本地工具混合态
- **身份单一**：所有写入都必须体现为 Expert app identity
- **接口稳定**：先做窄而稳的 internal API，不做大而全 SDK
- **面向未来 agent**：Execution Layer 是未来 agent-native invocation 的执行内核，不是一次性脚手架

## 推荐 API 分层

### 1. Internal execution endpoints
统一放在 `/internal/linear/*` 下：
- `POST /internal/linear/comment`
- `POST /internal/linear/issues/create`
- `POST /internal/linear/issues/update`
- `POST /internal/linear/issues/assign`
- `POST /internal/linear/issues/state`

这些接口都必须：
- 校验 internal secret
- 接受结构化 payload
- 从 D1 取 workspace 对应的 OAuth token
- 统一返回结构化成功/失败结果

### 2. Linear client methods
`worker/src/linear/client.ts` 负责最小 mutation 能力，不上来引入全量抽象。
第一批方法：
- `postComment`
- `createIssue`
- `updateIssue`
- `assignIssue`
- `transitionIssueState`

### 3. Task action mapping
`routes/internal.ts` 当前只有 result -> `reply` 的薄映射。
应扩展成：
- `reply`
- `create_issue`
- `update_issue`
- `assign_issue`
- `transition_issue`
- `noop`
- `error`

## 数据流

### 写入直调路径
Caller -> `/internal/linear/*` -> auth -> storage.oauth -> linear client mutation -> Linear

### 任务驱动路径
Linear webhook -> task 入库 -> OpenClaw claim -> reasoning -> submit result -> action mapping -> linear client mutation -> Linear

两条路最终都应该共用同一套 linear client methods，不要分叉实现。

## 任务拆解映射
- `WS-31`：定义 internal API surface、payload schema、返回契约
- `WS-32`：token refresh / expiry / identity invariants
- `WS-33`：补齐 mutation coverage
- `WS-34`：debug route 替换为正式 route
- `WS-35`：task action mapping 和 result 执行编排
- `WS-36`：日志、trace、错误规范化
- `WS-37`：写清 execution / invocation 边界，留待 agent-native 阶段

## 关于 Agent Native Invocation
长期方向已经明确：未来要往 Linear `agents` / `agent-interaction` 靠拢。
但这不意味着要推翻当前架构。
更合理的关系是：
- **Execution Layer**：负责“怎么写、怎么执行、如何保证身份正确”
- **Invocation Layer**：负责“怎么被唤起、怎么进入 session、怎么表现得像 agent”

也就是说：
**未来就算 Linear 里能原生 @Expert，最后真正执行 comment / update / create 的底层，仍然应该是现在这层 Execution Layer。**

## 关于 assignable / mentionable scopes
为了让 Expert 尽快出现在 Linear 的 assignment menu 和 mention invocation 入口中，OAuth 授权需要补齐：
- `app:assignable`
- `app:mentionable`

这一步优先级高于完整 agent-native invocation，因为它能先解锁“可分配 / 可提及”的入口能力。
重新授权后应优先验证 assign / mention 是否生效。

## 关于“agent score / 头像占位”
这件事值得做，但不能瞎做。
目标不是伪造功能，而是：
- 尽量让 Linear 中的 `Expert` 外观更像一个正在工作的 agent
- 不要求立即触发任何真实 agent session

下一步需要查清：
1. Linear `agents` 文档里是否存在 agent profile / metadata / avatar / score 之类的配置位
2. 如果没有官方 agent profile 入口，是否能通过 OAuth app / integration directory 的展示信息先占位
3. 这件事属于 Invocation Layer 外观准备，不应阻塞 Execution Layer 主线

## 第一阶段验收标准
- 能通过 `/internal/linear/comment` 以 Expert app identity 发评论
- 能通过 `/internal/linear/issues/create` 创建 issue
- 能通过 `/internal/linear/issues/update` 更新 issue 标题/描述/项目
- 能通过 `/internal/linear/issues/assign` 修改 assignee
- 能通过 `/internal/linear/issues/state` 改变 issue 状态
- 临时 `/internal/debug/comment` 可以移除或标记废弃
- 任务结果提交不再只支持 reply，而是支持结构化动作执行
