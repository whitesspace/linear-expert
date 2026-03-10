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
    summary: "负责 issue 创建、更新、指派、状态迁移、项目关联与查询。",
    actions: ["create", "update", "assign", "transition", "add_to_project", "get"],
    routes: [
      { action: "create", method: "POST", path: "/internal/linear/issues/create" },
      { action: "update", method: "POST", path: "/internal/linear/issues/update" },
      { action: "assign", method: "POST", path: "/internal/linear/issues/assign" },
      { action: "transition", method: "POST", path: "/internal/linear/issues/state" },
      { action: "add_to_project", method: "POST", path: "/internal/linear/issues/project" },
      { action: "get", method: "POST", path: "/internal/linear/issues/get" },
    ],
  },
];

const PLANNED_EXECUTION_DOMAINS: LinearExecutionDomainPlan[] = [
  {
    domain: "attachments",
    status: "active",
    summary: "把外部分析结果、文档与 artefact 链接回写到 Linear。",
    actions: ["create"],
    routes: [
      { action: "create", method: "POST", path: "/internal/linear/issues/attachment" },
    ],
  },
  {
    domain: "relations",
    status: "active",
    summary: "建立 block、duplicate、related 等 issue 关系，补齐执行闭环。",
    actions: ["blocks", "duplicates", "relates_to"],
    routes: [
      { action: "create", method: "POST", path: "/internal/linear/issues/relation" },
    ],
  },
  {
    domain: "projects",
    status: "active",
    summary: "Projects CRUD + project list/resolve（供 lec / internal 调用）。",
    actions: ["list", "get", "create", "update", "delete", "team_projects", "resolve"],
    routes: [
      { action: "list", method: "POST", path: "/internal/linear/projects/list" },
      { action: "get", method: "POST", path: "/internal/linear/projects/get" },
      { action: "create", method: "POST", path: "/internal/linear/projects/create" },
      { action: "update", method: "POST", path: "/internal/linear/projects/update" },
      { action: "delete", method: "POST", path: "/internal/linear/projects/delete" },
      { action: "team_projects", method: "POST", path: "/internal/linear/team/projects" },
      { action: "resolve", method: "POST", path: "/internal/linear/resolve" }
    ],
  },
  {
    domain: "triage",
    status: "planned",
    summary: "Triage list（state=Triage）与处理动作闭环（assign/state/project 复用 issues 域）。",
    actions: ["list"],
    routes: [
      { action: "list", method: "POST", path: "/internal/linear/triage/list" }
    ],
  }
];

const NEXT_CONCRETE_IMPLEMENTATION_STEPS: string[] = [];

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
