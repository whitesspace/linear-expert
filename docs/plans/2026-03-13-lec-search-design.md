# LEC 统一搜索能力设计

## 背景

当前 `lec` 主要围绕对象动作组织：`list/get/create/update`。  
这对脚本可用，但对 agent 不够友好，因为“先发现对象，再执行动作”的查询主路径并未成为一等能力。

## 目标

引入统一顶层 `lec search`，让 agent 能用一致心智完成：

1. 搜索候选对象
2. 获取精确对象
3. 执行更新动作

第一批支持：

- `issues`
- `documents`
- `projects`
- `customers`
- `customer-needs`
- `project-updates`
- `triage`
- `all`

## CLI 形态

```bash
lec search <scope> --query <text> [filters]
```

统一过滤参数：

- `--query`
- `--team`
- `--project`
- `--state`
- `--assignee`
- `--label`
- `--customer`
- `--limit`

不支持的过滤组合直接报错，避免 silent ignore。

## Internal Route

新增：

- `POST /internal/linear/search`

请求体：

```json
{
  "workspaceId": "ws_1",
  "teamId": "team_1",
  "scope": "issues",
  "query": "oauth",
  "project": "proj_1",
  "state": "In Progress",
  "assignee": "user_1",
  "label": "bug",
  "customer": "cust_1",
  "limit": 10
}
```

## 返回结构

统一返回：

```json
{
  "success": true,
  "scope": "issues",
  "items": [
    {
      "entityType": "issue",
      "id": "issue_1",
      "title": "OAuth timeout on callback",
      "subtitle": "PCF-1 · In Progress",
      "url": "https://linear.app/issue/PCF-1",
      "entity": {}
    }
  ]
}
```

`entity` 保留原始摘要，`title/subtitle/url/entityType` 供 agent 稳定消费。

## 实现原则

- 查询能力独立于 CRUD 动作。
- 统一返回结构优先于对象域字段一致性。
- 先支持高价值过滤，不一次做满全部 GraphQL 组合。
- `all` 通过编排各对象搜索结果实现，而不是单独发明 DSL。

## 验证

- 先写失败测试：
  - `test/lec.cli.test.ts`
  - `test/linear.capabilities.routes.test.ts`
- 实现后运行：
  - `node --import tsx test/lec.cli.test.ts`
  - `node --import tsx test/linear.capabilities.routes.test.ts`
  - `node test/run-tests.mjs`
