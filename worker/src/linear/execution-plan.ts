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
    summary: "评论创建、更新、删除与线程状态流转。",
    actions: ["create", "update", "delete", "resolve", "unresolve"],
    routes: [
      { action: "create", method: "POST", path: "/internal/linear/comment" },
      { action: "update", method: "POST", path: "/internal/linear/comments/update" },
      { action: "delete", method: "POST", path: "/internal/linear/comments/delete" },
      { action: "resolve", method: "POST", path: "/internal/linear/comments/resolve" },
      { action: "unresolve", method: "POST", path: "/internal/linear/comments/unresolve" },
    ],
  },
  {
    domain: "issues",
    status: "active",
    summary: "issue 创建、更新、指派、状态迁移、项目关联、查询、归档与删除。",
    actions: ["create", "update", "assign", "transition", "add_to_project", "get", "children", "archive", "delete", "list"],
    routes: [
      { action: "create", method: "POST", path: "/internal/linear/issues/create" },
      { action: "update", method: "POST", path: "/internal/linear/issues/update" },
      { action: "assign", method: "POST", path: "/internal/linear/issues/assign" },
      { action: "transition", method: "POST", path: "/internal/linear/issues/state" },
      { action: "add_to_project", method: "POST", path: "/internal/linear/issues/project" },
      { action: "archive", method: "POST", path: "/internal/linear/issues/archive" },
      { action: "delete", method: "POST", path: "/internal/linear/issues/delete" },
      { action: "get", method: "POST", path: "/internal/linear/issues/get" },
      { action: "children", method: "POST", path: "/internal/linear/issues/children" },
      { action: "list", method: "POST", path: "/internal/linear/issues/list" },
    ],
  },
  {
    domain: "attachments",
    status: "active",
    summary: "附件创建与删除。",
    actions: ["create", "delete"],
    routes: [
      { action: "create", method: "POST", path: "/internal/linear/issues/attachment" },
      { action: "delete", method: "POST", path: "/internal/linear/attachments/delete" },
    ],
  },
  {
    domain: "relations",
    status: "active",
    summary: "block、duplicate、related 等 issue 关系管理。",
    actions: ["create"],
    routes: [
      { action: "create", method: "POST", path: "/internal/linear/issues/relation" },
    ],
  },
  {
    domain: "projects",
    status: "active",
    summary: "Projects CRUD、team projects 与 resolve。",
    actions: ["list", "get", "create", "update", "delete", "team_projects", "resolve"],
    routes: [
      { action: "list", method: "POST", path: "/internal/linear/projects/list" },
      { action: "get", method: "POST", path: "/internal/linear/projects/get" },
      { action: "create", method: "POST", path: "/internal/linear/projects/create" },
      { action: "update", method: "POST", path: "/internal/linear/projects/update" },
      { action: "delete", method: "POST", path: "/internal/linear/projects/delete" },
      { action: "team_projects", method: "POST", path: "/internal/linear/team/projects" },
      { action: "resolve", method: "POST", path: "/internal/linear/resolve" },
    ],
  },
  {
    domain: "triage",
    status: "active",
    summary: "triage 队列查看与处理动作。",
    actions: ["list", "move"],
    routes: [
      { action: "list", method: "POST", path: "/internal/linear/triage/list" },
      { action: "move", method: "POST", path: "/internal/linear/triage/move" },
    ],
  },
  {
    domain: "initiatives",
    status: "active",
    summary: "initiative CRUD（归档语义）。",
    actions: ["list", "get", "create", "update", "archive"],
    routes: [
      { action: "list", method: "POST", path: "/internal/linear/initiatives/list" },
      { action: "get", method: "POST", path: "/internal/linear/initiatives/get" },
      { action: "create", method: "POST", path: "/internal/linear/initiatives/create" },
      { action: "update", method: "POST", path: "/internal/linear/initiatives/update" },
      { action: "archive", method: "POST", path: "/internal/linear/initiatives/archive" },
    ],
  },
  {
    domain: "cycles",
    status: "active",
    summary: "cycle list/get/create/update/archive。",
    actions: ["list", "get", "create", "update", "archive"],
    routes: [
      { action: "list", method: "POST", path: "/internal/linear/cycles/list" },
      { action: "get", method: "POST", path: "/internal/linear/cycles/get" },
      { action: "create", method: "POST", path: "/internal/linear/cycles/create" },
      { action: "update", method: "POST", path: "/internal/linear/cycles/update" },
      { action: "archive", method: "POST", path: "/internal/linear/cycles/archive" },
    ],
  },
  {
    domain: "labels",
    status: "active",
    summary: "issue labels list/get/create/update/retire/restore。",
    actions: ["list", "get", "create", "update", "retire", "restore"],
    routes: [
      { action: "list", method: "POST", path: "/internal/linear/labels/list" },
      { action: "get", method: "POST", path: "/internal/linear/labels/get" },
      { action: "create", method: "POST", path: "/internal/linear/labels/create" },
      { action: "update", method: "POST", path: "/internal/linear/labels/update" },
      { action: "retire", method: "POST", path: "/internal/linear/labels/retire" },
      { action: "restore", method: "POST", path: "/internal/linear/labels/restore" },
    ],
  },
  {
    domain: "documents",
    status: "active",
    summary: "documents list/get/create/update/delete/unarchive。",
    actions: ["list", "get", "create", "update", "delete", "unarchive"],
    routes: [
      { action: "list", method: "POST", path: "/internal/linear/documents/list" },
      { action: "get", method: "POST", path: "/internal/linear/documents/get" },
      { action: "create", method: "POST", path: "/internal/linear/documents/create" },
      { action: "update", method: "POST", path: "/internal/linear/documents/update" },
      { action: "delete", method: "POST", path: "/internal/linear/documents/delete" },
      { action: "unarchive", method: "POST", path: "/internal/linear/documents/unarchive" },
    ],
  },
  {
    domain: "customers",
    status: "active",
    summary: "customers list/get/create/update/delete。",
    actions: ["list", "get", "create", "update", "delete"],
    routes: [
      { action: "list", method: "POST", path: "/internal/linear/customers/list" },
      { action: "get", method: "POST", path: "/internal/linear/customers/get" },
      { action: "create", method: "POST", path: "/internal/linear/customers/create" },
      { action: "update", method: "POST", path: "/internal/linear/customers/update" },
      { action: "delete", method: "POST", path: "/internal/linear/customers/delete" },
    ],
  },
  {
    domain: "customer-needs",
    status: "active",
    summary: "customer needs list/get/create/update/delete/unarchive。",
    actions: ["list", "get", "create", "update", "delete", "unarchive"],
    routes: [
      { action: "list", method: "POST", path: "/internal/linear/customer-needs/list" },
      { action: "get", method: "POST", path: "/internal/linear/customer-needs/get" },
      { action: "create", method: "POST", path: "/internal/linear/customer-needs/create" },
      { action: "update", method: "POST", path: "/internal/linear/customer-needs/update" },
      { action: "delete", method: "POST", path: "/internal/linear/customer-needs/delete" },
      { action: "unarchive", method: "POST", path: "/internal/linear/customer-needs/unarchive" },
    ],
  },
  {
    domain: "project-updates",
    status: "active",
    summary: "project updates list/get/create/update/delete/unarchive。",
    actions: ["list", "get", "create", "update", "delete", "unarchive"],
    routes: [
      { action: "list", method: "POST", path: "/internal/linear/project-updates/list" },
      { action: "get", method: "POST", path: "/internal/linear/project-updates/get" },
      { action: "create", method: "POST", path: "/internal/linear/project-updates/create" },
      { action: "update", method: "POST", path: "/internal/linear/project-updates/update" },
      { action: "delete", method: "POST", path: "/internal/linear/project-updates/delete" },
      { action: "unarchive", method: "POST", path: "/internal/linear/project-updates/unarchive" },
    ],
  },
  {
    domain: "workflow-states",
    status: "active",
    summary: "workflow states list/get/create/update/archive。",
    actions: ["list", "get", "create", "update", "archive"],
    routes: [
      { action: "list", method: "POST", path: "/internal/linear/workflow-states/list" },
      { action: "get", method: "POST", path: "/internal/linear/workflow-states/get" },
      { action: "create", method: "POST", path: "/internal/linear/workflow-states/create" },
      { action: "update", method: "POST", path: "/internal/linear/workflow-states/update" },
      { action: "archive", method: "POST", path: "/internal/linear/workflow-states/archive" },
    ],
  },
  {
    domain: "search",
    status: "active",
    summary: "统一搜索 issues、documents、projects、customers、customer-needs、project-updates 与 triage。",
    actions: ["search"],
    routes: [
      { action: "search", method: "POST", path: "/internal/linear/search" },
    ],
  },
];

const NEXT_CONCRETE_IMPLEMENTATION_STEPS: string[] = [];

export function getExecutionLayerPlan() {
  return {
    activeDomains: ACTIVE_EXECUTION_DOMAINS,
    plannedDomains: [] as LinearExecutionDomainPlan[],
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
  return value
    .split(/[-_]/g)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join("");
}
