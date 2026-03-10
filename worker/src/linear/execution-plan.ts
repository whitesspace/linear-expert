export type LinearExecutionDomainStatus = "active" | "planned";

export interface LinearExecutionRoute {
  action: string;
  method: "POST";
  path: string;
}

export interface LinearExecutionDomainPlan {
  domain: string;
  status: LinearExecutionDomainStatus;
  summary: string;
  actions: string[];
  routes: LinearExecutionRoute[];
}

const ACTIVE_EXECUTION_DOMAINS: LinearExecutionDomainPlan[] = [
  {
    domain: "comments",
    status: "active",
    summary: "负责以 Expert app 身份回写评论。",
    actions: ["create"],
    routes: [
      { action: "create", method: "POST", path: "/internal/linear/comment" },
    ],
  },
  {
    domain: "issues",
    status: "active",
    summary: "负责 issue 创建、更新、指派与状态迁移。",
    actions: ["create", "update", "assign", "transition"],
    routes: [
      { action: "create", method: "POST", path: "/internal/linear/issues/create" },
      { action: "update", method: "POST", path: "/internal/linear/issues/update" },
      { action: "assign", method: "POST", path: "/internal/linear/issues/assign" },
      { action: "transition", method: "POST", path: "/internal/linear/issues/state" },
    ],
  },
];

const PLANNED_EXECUTION_DOMAINS: LinearExecutionDomainPlan[] = [
  {
    domain: "projects",
    status: "planned",
    summary: "让 Expert 能稳定地挂接项目、推进项目状态与负责人。",
    actions: ["attach_issue", "update_status", "assign_lead"],
    routes: [],
  },
  {
    domain: "attachments",
    status: "planned",
    summary: "把外部分析结果、文档与 artefact 链接回写到 Linear。",
    actions: ["create", "upsert_link"],
    routes: [],
  },
  {
    domain: "relations",
    status: "planned",
    summary: "建立 block、duplicate、related 等 issue 关系，补齐执行闭环。",
    actions: ["block", "duplicate", "related"],
    routes: [],
  },
];

const NEXT_CONCRETE_IMPLEMENTATION_STEPS = [
  "定义 project execution contract，先支持 issue ↔ project 关联。",
  "补一层名称/标识符到 Linear id 的解析，避免调用方直接耦合底层 id。",
  "新增 attachment 写入口，用于回填 OpenClaw 产出的文档与链接。",
  "为 relations 建立最小 mutation 集，覆盖 block / duplicate / related。",
];

export function getExecutionLayerPlan() {
  return {
    activeDomains: ACTIVE_EXECUTION_DOMAINS,
    plannedDomains: PLANNED_EXECUTION_DOMAINS,
    nextSteps: NEXT_CONCRETE_IMPLEMENTATION_STEPS,
  };
}

export function getExecutionLayerRouteMap() {
  return Object.fromEntries(
    ACTIVE_EXECUTION_DOMAINS.flatMap((domainPlan) =>
      domainPlan.routes.map((route) => [
        `internalLinear${capitalize(domainPlan.domain)}${capitalize(route.action)}`,
        `${route.method} ${route.path}`,
      ]),
    ),
  );
}

function capitalize(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
