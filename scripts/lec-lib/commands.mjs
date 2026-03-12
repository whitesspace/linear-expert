import {
  fail,
  getBaseUrl,
  getSecret,
  httpJson,
  outJson,
  outPlain,
  printResult,
  requireWorkspace,
  resolveIssueId,
} from "./runtime.mjs";

export const HELP_LINES = [
  "lec - Linear Expert CLI",
  "",
  "USAGE:",
  "  lec [global flags] <command> <subcommand> [flags]",
  "",
  "GLOBAL FLAGS:",
  "  --json | --plain | --dry-run | -v/--verbose | -h/--help | --version",
  "  --team <KEY> (default PCF)",
  "  --workspace <ID> (optional override)",
  "",
  "COMMANDS:",
  "  auth status",
  "  bootstrap project-crud-issues --team PCF --project <linear project url>",
  "  search issues --team PCF --query <text> [--project <projectId>] [--state <StateName>] [--assignee <userId>] [--label <label>]",
  "  search all --team PCF --query <text> [--limit 20]",
  "",
  "  issue create --team PCF --title <t> [--description <md>] [--project <projectId>]",
  "  issue get --team PCF --issue <PCF-123>",
  "  issue update --team PCF --issue <id|PCF-123> [--title ...] [--description ...] [--project <projectId>]",
  "  issue assign --team PCF --issue <id|PCF-123> --assignee <userId>",
  "  issue state --team PCF --issue <id|PCF-123> --state <stateId|StateName>",
  "  issue add-to-project --team PCF --issue <id|PCF-123> --project <projectId>",
  "  issue archive --team PCF --issue <id|PCF-123>",
  "  issue delete --team PCF --issue <id|PCF-123>",
  "  issue children --team PCF --issue <id|PCF-123> [--limit 50]",
  "",
  "  comment create --team PCF --issue <id|PCF-123> --body <md>",
  "  comment update --team PCF --id <commentId> --body <md>",
  "  comment delete --team PCF --id <commentId>",
  "  comment resolve --team PCF --id <commentId>",
  "  comment unresolve --team PCF --id <commentId>",
  "",
  "  attachment add --team PCF --issue <id|PCF-123> --url <http...> [--title <t>]",
  "  attachment delete --team PCF --id <attachmentId>",
  "  relation add --team PCF --issue <id|PCF-123> --relation blocks|duplicates|relates_to --target <id|PCF-456>",
  "",
  "  project list --team PCF",
  "  project get --team PCF --project <projectId>",
  "  project create --team PCF --title <name> [--description <md>]",
  "  project update --team PCF --project <projectId> [--title <name>] [--description <md>]",
  "  project delete --team PCF --project <projectId>",
  "",
  "  triage list --team PCF [--state <StateName>] [--limit 25] [--exclude-done] [--exclude-cancelled]",
  "  triage move --team PCF --issue <id|PCF-123> [--assignee <userId>] [--state <stateId>] [--project <projectId>]",
  "",
  "  initiatives list --team PCF [--limit 25]",
  "  initiatives get --team PCF --id <initiativeId>",
  "  initiatives create --team PCF --title <name> [--description <md>] [--status <status>]",
  "  initiatives update --team PCF --id <initiativeId> [--title <name>] [--description <md>] [--status <status>]",
  "  initiatives archive --team PCF --id <initiativeId>",
  "",
  "  cycles list --team PCF [--limit 25]",
  "  cycles get --team PCF --id <cycleId>",
  "  cycles create --team PCF [--title <name>] --starts-at <yyyy-mm-dd> --ends-at <yyyy-mm-dd>",
  "  cycles update --team PCF --id <cycleId> [--title <name>] [--starts-at <yyyy-mm-dd>] [--ends-at <yyyy-mm-dd>]",
  "  cycles archive --team PCF --id <cycleId>",
  "",
  "  labels list --team PCF [--limit 25]",
  "  labels get --team PCF --id <labelId>",
  "  labels create --team PCF --title <name> [--description <md>] [--color <hex>]",
  "  labels update --team PCF --id <labelId> [--title <name>] [--description <md>] [--color <hex>]",
  "  labels retire --team PCF --id <labelId>",
  "  labels restore --team PCF --id <labelId>",
  "",
  "  documents list --team PCF [--limit 25]",
  "  documents get --team PCF --id <documentId>",
  "  documents create --team PCF --title <name> --body <md> [--project <projectId>] [--issue <issueId>] [--initiative <initiativeId>]",
  "  documents update --team PCF --id <documentId> [--title <name>] [--body <md>]",
  "  documents delete --team PCF --id <documentId>",
  "  documents unarchive --team PCF --id <documentId>",
  "",
  "  customers list --team PCF [--limit 25]",
  "  customers get --team PCF --id <customerId>",
  "  customers create --team PCF --title <name> [--domain <domain>] [--revenue <n>] [--size <n>]",
  "  customers update --team PCF --id <customerId> [--title <name>] [--domain <domain>] [--revenue <n>] [--size <n>]",
  "  customers delete --team PCF --id <customerId>",
  "",
  "  customer-needs list --team PCF [--limit 25]",
  "  customer-needs get --team PCF --id <needId>",
  "  customer-needs create --team PCF --body <md> --customer <customerId>",
  "  customer-needs update --team PCF --id <needId> [--body <md>] [--customer <customerId>] [--issue <issueId>] [--project <projectId>]",
  "  customer-needs delete --team PCF --id <needId>",
  "  customer-needs unarchive --team PCF --id <needId>",
  "",
  "  project-updates list --team PCF [--limit 25]",
  "  project-updates get --team PCF --id <updateId>",
  "  project-updates create --team PCF --project <projectId> --body <md> [--status <health>]",
  "  project-updates update --team PCF --id <updateId> [--body <md>] [--status <health>]",
  "  project-updates delete --team PCF --id <updateId>",
  "  project-updates unarchive --team PCF --id <updateId>",
  "",
  "  workflow-states list --team PCF [--limit 25]",
  "  workflow-states get --team PCF --id <stateId>",
  "  workflow-states create --team PCF --title <name> --state <type>",
  "  workflow-states update --team PCF --id <stateId> [--title <name>] [--state <type>]",
  "  workflow-states archive --team PCF --id <stateId>",
  "",
  "  team states --team PCF",
];

async function issueIdBody(flags) {
  if (!flags.issue) fail("--issue required", 2);
  const { workspaceId } = await requireWorkspace(flags);
  return {
    workspaceId,
    id: await resolveIssueId({ issue: flags.issue, workspaceId, verbose: flags.verbose }),
  };
}

async function printPost(flags, path, body, plainLines) {
  const result = await httpJson({ path, body, verbose: flags.verbose });
  printResult(flags, result, plainLines);
}

const SEARCH_SCOPE_FILTERS = {
  issues: new Set(["query", "project", "state", "assignee", "label", "limit"]),
  documents: new Set(["query", "project", "limit"]),
  projects: new Set(["query", "limit"]),
  customers: new Set(["query", "limit"]),
  "customer-needs": new Set(["query", "project", "customer", "limit"]),
  "project-updates": new Set(["query", "project", "limit"]),
  triage: new Set(["query", "state", "assignee", "project", "limit"]),
  all: new Set(["query", "project", "state", "assignee", "label", "customer", "limit"]),
};

function validateSearchFlags(scope, flags) {
  const allowed = SEARCH_SCOPE_FILTERS[scope];
  if (!allowed) fail(`Unknown search scope: ${scope}`, 2);

  const provided = [
    ["query", flags.query],
    ["project", flags.project],
    ["state", flags.state],
    ["assignee", flags.assignee],
    ["label", flags.label],
    ["customer", flags.customer],
    ["limit", flags.limit],
  ];

  for (const [name, value] of provided) {
    if (value === undefined) continue;
    if (!allowed.has(name)) fail(`--${name} is not supported for search ${scope}`, 2);
  }

  const hasFilter = provided.some(([name, value]) => name !== "limit" && value !== undefined);
  if (!hasFilter) fail("search requires at least one filter", 2);
}

export async function dispatchCommand(args, flags) {
  const [cmd, sub] = args;
  if (cmd === "auth" && sub === "status") {
    const ok = !!process.env.OPENCLAW_INTERNAL_SECRET;
    const info = { ok, baseUrl: getBaseUrl(), secret: ok ? "present" : "missing" };
    if (flags.json) outJson(info);
    else outPlain([`secret=${info.secret}`, `baseUrl=${info.baseUrl}`]);
    process.exit(ok ? 0 : 3);
  }

  if (cmd === "bootstrap" && sub === "project-crud-issues") {
    if (!flags.project) fail("--project required", 2);
    const { workspaceId, teamId } = await requireWorkspace(flags);
    const plan = {
      parent: { title: "[P2] Projects: CRUD", description: "Parent issue for Projects CRUD execution API expansion. Details in sub-issues." },
      children: [
        { title: "projects.list" },
        { title: "projects.get" },
        { title: "projects.create" },
        { title: "projects.update" },
        { title: "projects.delete" },
        { title: "projects.contracts-tests-docs" },
      ],
    };
    if (flags.dryRun) {
      printResult(flags, { dryRun: true, plan }, ["[dry-run] would create issues"]);
      return;
    }
    const parentRes = await httpJson({
      path: "/internal/linear/issues/create",
      body: { workspaceId, teamId, title: plan.parent.title, description: plan.parent.description },
      verbose: flags.verbose,
    });
    const parentId = parentRes?.result?.issue?.id;
    if (!parentId) throw new Error("Failed to extract parent issue id");
    const children = [];
    for (const child of plan.children) {
      const result = await httpJson({
        path: "/internal/linear/issues/create",
        body: { workspaceId, teamId, parentId, title: child.title, description: `Implement ${child.title} in execution layer.` },
        verbose: flags.verbose,
      });
      children.push({ title: child.title, result: result?.result?.issue ?? null });
    }
    printResult(flags, { ok: true, parent: parentRes?.result?.issue ?? null, children }, ["created parent + sub-issues"]);
    return;
  }

  if (cmd === "search") {
    if (!sub) fail("search scope required", 2);
    validateSearchFlags(sub, flags);
    const { workspaceId, teamId } = await requireWorkspace(flags);
    await printPost(flags, "/internal/linear/search", {
      workspaceId,
      teamId,
      scope: sub,
      query: flags.query,
      state: flags.state,
      assignee: flags.assignee,
      project: flags.project,
      label: flags.label,
      customer: flags.customer,
      limit: flags.limit,
    });
    return;
  }

  if (cmd === "issue" && sub === "create") {
    if (!flags.title) fail("--title required", 2);
    const { workspaceId, teamId } = await requireWorkspace(flags);
    const body = { workspaceId, teamId, title: flags.title, description: flags.description, projectId: flags.project };
    await printPost(flags, "/internal/linear/issues/create", body, ["created"]);
    return;
  }

  if (cmd === "issue" && sub === "get") {
    if (!flags.issue) fail("--issue required", 2);
    const { workspaceId } = await requireWorkspace(flags);
    await printPost(flags, "/internal/linear/issues/get", { workspaceId, identifier: flags.issue });
    return;
  }

  if (cmd === "issue" && sub === "update") {
    const body = await issueIdBody(flags);
    await printPost(flags, "/internal/linear/issues/update", { ...body, title: flags.title, description: flags.description, projectId: flags.project });
    return;
  }

  if (cmd === "issue" && sub === "assign") {
    if (!flags.assignee) fail("--assignee required", 2);
    const body = await issueIdBody(flags);
    await printPost(flags, "/internal/linear/issues/assign", { workspaceId: body.workspaceId, issueId: body.id, assigneeId: flags.assignee });
    return;
  }

  if (cmd === "issue" && sub === "state") {
    if (!flags.state) fail("--state required", 2);
    const body = await issueIdBody(flags);
    await printPost(flags, "/internal/linear/issues/state", { workspaceId: body.workspaceId, issueId: body.id, stateId: flags.state });
    return;
  }

  if (cmd === "issue" && sub === "add-to-project") {
    if (!flags.project) fail("--project required", 2);
    const body = await issueIdBody(flags);
    await printPost(flags, "/internal/linear/issues/project", { workspaceId: body.workspaceId, issueId: body.id, projectId: flags.project });
    return;
  }

  if (cmd === "issue" && sub === "archive") {
    await printPost(flags, "/internal/linear/issues/archive", await issueIdBody(flags));
    return;
  }

  if (cmd === "issue" && sub === "delete") {
    await printPost(flags, "/internal/linear/issues/delete", await issueIdBody(flags));
    return;
  }

  if (cmd === "issue" && sub === "children") {
    const body = await issueIdBody(flags);
    await printPost(flags, "/internal/linear/issues/children", { workspaceId: body.workspaceId, issueId: body.id, first: Number.isFinite(flags.limit) ? flags.limit : 50 });
    return;
  }

  if (cmd === "comment" && sub === "create") {
    if (!flags.body) fail("--body required", 2);
    const body = await issueIdBody(flags);
    await printPost(flags, "/internal/linear/comment", { workspaceId: body.workspaceId, issueId: body.id, body: flags.body });
    return;
  }

  if (cmd === "comment" && sub === "update") {
    if (!flags.id || !flags.body) fail("--id and --body required", 2);
    const { workspaceId } = await requireWorkspace(flags);
    await printPost(flags, "/internal/linear/comments/update", { workspaceId, id: flags.id, body: flags.body });
    return;
  }

  if (cmd === "comment" && ["delete", "resolve", "unresolve"].includes(sub)) {
    if (!flags.id) fail("--id required", 2);
    const { workspaceId } = await requireWorkspace(flags);
    await printPost(flags, `/internal/linear/comments/${sub}`, { workspaceId, id: flags.id });
    return;
  }

  if (cmd === "attachment" && sub === "add") {
    if (!flags.url || !flags.issue) fail("--issue and --url required", 2);
    const body = await issueIdBody(flags);
    await printPost(flags, "/internal/linear/issues/attachment", { workspaceId: body.workspaceId, issueId: body.id, title: flags.title || flags.url, url: flags.url });
    return;
  }

  if (cmd === "attachment" && sub === "delete") {
    if (!flags.id) fail("--id required", 2);
    const { workspaceId } = await requireWorkspace(flags);
    await printPost(flags, "/internal/linear/attachments/delete", { workspaceId, id: flags.id });
    return;
  }

  if (cmd === "relation" && sub === "add") {
    if (!flags.issue || !flags.target || !flags.relation) fail("--issue --target --relation required", 2);
    const { workspaceId } = await requireWorkspace(flags);
    const issueId = await resolveIssueId({ issue: flags.issue, workspaceId, verbose: flags.verbose });
    const relatedIssueId = await resolveIssueId({ issue: flags.target, workspaceId, verbose: flags.verbose });
    await printPost(flags, "/internal/linear/issues/relation", { workspaceId, issueId, relatedIssueId, relationType: flags.relation });
    return;
  }

  if (cmd === "project" && sub === "list") {
    const { workspaceId, teamId } = await requireWorkspace(flags);
    await printPost(flags, "/internal/linear/projects/list", { workspaceId, teamId });
    return;
  }

  if (cmd === "project" && sub === "get") {
    if (!flags.project) fail("--project required", 2);
    const { workspaceId } = await requireWorkspace(flags);
    await printPost(flags, "/internal/linear/projects/get", { workspaceId, projectId: flags.project });
    return;
  }

  if (cmd === "project" && sub === "create") {
    if (!flags.title) fail("--title required", 2);
    const { workspaceId, teamId } = await requireWorkspace(flags);
    await printPost(flags, "/internal/linear/projects/create", { workspaceId, teamId, name: flags.title, description: flags.description });
    return;
  }

  if (cmd === "project" && sub === "update") {
    if (!flags.project) fail("--project required", 2);
    const { workspaceId } = await requireWorkspace(flags);
    await printPost(flags, "/internal/linear/projects/update", { workspaceId, projectId: flags.project, name: flags.title, description: flags.description });
    return;
  }

  if (cmd === "project" && sub === "delete") {
    if (!flags.project) fail("--project required", 2);
    const { workspaceId } = await requireWorkspace(flags);
    await printPost(flags, "/internal/linear/projects/delete", { workspaceId, projectId: flags.project });
    return;
  }

  if (cmd === "triage" && sub === "list") {
    const { workspaceId, teamId } = await requireWorkspace(flags);
    await printPost(flags, "/internal/linear/triage/list", {
      workspaceId,
      teamId,
      stateName: flags.stateName || flags.state,
      excludeDone: flags.excludeDone,
      excludeCancelled: flags.excludeCancelled,
      limit: Number.isFinite(flags.limit) ? flags.limit : undefined,
    });
    return;
  }

  if (cmd === "triage" && sub === "move") {
    const body = await issueIdBody(flags);
    await printPost(flags, "/internal/linear/triage/move", {
      workspaceId: body.workspaceId,
      issueId: body.id,
      assigneeId: flags.assignee,
      stateId: flags.state,
      projectId: flags.project,
    });
    return;
  }

  const simpleDomains = {
    initiatives: {
      list: ["id", "/internal/linear/initiatives/list", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, limit: flags.limit })],
      get: ["id", "/internal/linear/initiatives/get", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id })],
      create: ["title", "/internal/linear/initiatives/create", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, name: flags.title, description: flags.description, status: flags.status })],
      update: ["id", "/internal/linear/initiatives/update", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id, name: flags.title, description: flags.description, status: flags.status })],
      archive: ["id", "/internal/linear/initiatives/archive", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id })],
    },
    cycles: {
      list: ["team", "/internal/linear/cycles/list", async (flags) => { const { workspaceId, teamId } = await requireWorkspace(flags); return { workspaceId, teamId, limit: flags.limit }; }],
      get: ["id", "/internal/linear/cycles/get", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id })],
      create: ["startsAt", "/internal/linear/cycles/create", async (flags) => { const { workspaceId, teamId } = await requireWorkspace(flags); return { workspaceId, teamId, startsAt: flags.startsAt, endsAt: flags.endsAt, name: flags.title }; }],
      update: ["id", "/internal/linear/cycles/update", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id, startsAt: flags.startsAt, endsAt: flags.endsAt, name: flags.title })],
      archive: ["id", "/internal/linear/cycles/archive", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id })],
    },
    labels: {
      list: ["team", "/internal/linear/labels/list", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, limit: flags.limit })],
      get: ["id", "/internal/linear/labels/get", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id })],
      create: ["title", "/internal/linear/labels/create", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, name: flags.title, color: flags.color ?? null, description: flags.description ?? null })],
      update: ["id", "/internal/linear/labels/update", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id, name: flags.title, color: flags.color, description: flags.description })],
      retire: ["id", "/internal/linear/labels/retire", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id })],
      restore: ["id", "/internal/linear/labels/restore", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id })],
    },
    documents: {
      list: ["team", "/internal/linear/documents/list", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, limit: flags.limit })],
      get: ["id", "/internal/linear/documents/get", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id })],
      create: ["title", "/internal/linear/documents/create", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, title: flags.title, content: flags.body, projectId: flags.project, issueId: flags.issue, initiativeId: flags.initiative })],
      update: ["id", "/internal/linear/documents/update", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id, title: flags.title, content: flags.body })],
      delete: ["id", "/internal/linear/documents/delete", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id })],
      unarchive: ["id", "/internal/linear/documents/unarchive", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id })],
    },
    customers: {
      list: ["team", "/internal/linear/customers/list", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, limit: flags.limit })],
      get: ["id", "/internal/linear/customers/get", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id })],
      create: ["title", "/internal/linear/customers/create", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, name: flags.title, domains: flags.domains, revenue: flags.revenue, size: flags.size })],
      update: ["id", "/internal/linear/customers/update", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id, name: flags.title, domains: flags.domains, revenue: flags.revenue, size: flags.size })],
      delete: ["id", "/internal/linear/customers/delete", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id })],
    },
    "customer-needs": {
      list: ["team", "/internal/linear/customer-needs/list", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, limit: flags.limit })],
      get: ["id", "/internal/linear/customer-needs/get", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id })],
      create: ["body", "/internal/linear/customer-needs/create", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, body: flags.body, customerId: flags.customer, issueId: flags.issue, projectId: flags.project })],
      update: ["id", "/internal/linear/customer-needs/update", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id, body: flags.body, customerId: flags.customer, issueId: flags.issue, projectId: flags.project })],
      delete: ["id", "/internal/linear/customer-needs/delete", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id })],
      unarchive: ["id", "/internal/linear/customer-needs/unarchive", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id })],
    },
    "project-updates": {
      list: ["team", "/internal/linear/project-updates/list", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, limit: flags.limit })],
      get: ["id", "/internal/linear/project-updates/get", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id })],
      create: ["project", "/internal/linear/project-updates/create", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, projectId: flags.project, body: flags.body, health: flags.status })],
      update: ["id", "/internal/linear/project-updates/update", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id, body: flags.body, health: flags.status })],
      delete: ["id", "/internal/linear/project-updates/delete", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id })],
      unarchive: ["id", "/internal/linear/project-updates/unarchive", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id })],
    },
    "workflow-states": {
      list: ["team", "/internal/linear/workflow-states/list", async (flags) => { const { workspaceId, teamId } = await requireWorkspace(flags); return { workspaceId, teamId, limit: flags.limit }; }],
      get: ["id", "/internal/linear/workflow-states/get", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id })],
      create: ["title", "/internal/linear/workflow-states/create", async (flags) => { const { workspaceId, teamId } = await requireWorkspace(flags); return { workspaceId, teamId, name: flags.title, type: flags.state, position: flags.position }; }],
      update: ["id", "/internal/linear/workflow-states/update", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id, name: flags.title, type: flags.state, position: flags.position })],
      archive: ["id", "/internal/linear/workflow-states/archive", async (flags) => ({ workspaceId: (await requireWorkspace(flags)).workspaceId, id: flags.id })],
    },
  };

  if (cmd === "team" && sub === "states") {
    const { workspaceId, teamId } = await requireWorkspace(flags);
    await printPost(flags, "/internal/linear/team/states", { workspaceId, teamId });
    return;
  }

  const domain = simpleDomains[cmd];
  if (domain?.[sub]) {
    const [requiredFlag, path, builder] = domain[sub];
    if (requiredFlag === "title" && !flags.title) fail("--title required", 2);
    if (requiredFlag === "id" && !flags.id) fail("--id required", 2);
    if (requiredFlag === "body" && !flags.body) fail("--body required", 2);
    if (requiredFlag === "project" && !flags.project) fail("--project required", 2);
    if (requiredFlag === "startsAt" && (!flags.startsAt || !flags.endsAt)) fail("--starts-at and --ends-at required", 2);
    const body = await builder(flags);
    await printPost(flags, path, body);
    return;
  }

  fail(`Unknown command: ${args.join(" ") || "(empty)"}`, 2);
}
