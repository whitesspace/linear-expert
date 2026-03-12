import type { Env } from "../env";
import { listProjects } from "./projects";
import { listDocuments } from "./documents";
import { listCustomerNeeds, listCustomers } from "./customers";
import { listProjectUpdates } from "./project-updates";
import { triageList } from "./triage";
import { sdkRequest } from "./sdk";
import { withWorkspaceAccessToken } from "./client";

export type SearchScope =
  | "issues"
  | "documents"
  | "projects"
  | "customers"
  | "customer-needs"
  | "project-updates"
  | "triage"
  | "all";

export type SearchInput = {
  teamId?: string;
  scope: SearchScope;
  query?: string;
  project?: string;
  state?: string;
  assignee?: string;
  label?: string;
  customer?: string;
  limit?: number;
};

export type SearchResultItem = {
  entityType: string;
  id: string;
  title: string;
  subtitle?: string | null;
  url?: string | null;
  entity: Record<string, unknown>;
};

export type SearchResult = {
  success: boolean;
  scope: SearchScope;
  items: SearchResultItem[];
};

const SEARCH_SCOPE_FILTERS: Record<SearchScope, ReadonlySet<string>> = {
  issues: new Set(["query", "project", "state", "assignee", "label", "limit"]),
  documents: new Set(["query", "project", "limit"]),
  projects: new Set(["query", "limit"]),
  customers: new Set(["query", "limit"]),
  "customer-needs": new Set(["query", "project", "customer", "limit"]),
  "project-updates": new Set(["query", "project", "limit"]),
  triage: new Set(["query", "state", "assignee", "project", "limit"]),
  all: new Set(["query", "project", "state", "assignee", "label", "customer", "limit"]),
};

function clampLimit(limit?: number) {
  return Math.min(Math.max(limit ?? 25, 1), 100);
}

function includesIgnoreCase(value: string | null | undefined, query: string | undefined) {
  if (!query) return true;
  return (value ?? "").toLowerCase().includes(query.toLowerCase());
}

function validateFilters(scope: SearchScope, input: SearchInput) {
  const allowed = SEARCH_SCOPE_FILTERS[scope];
  const provided: Array<[string, unknown]> = [
    ["query", input.query],
    ["project", input.project],
    ["state", input.state],
    ["assignee", input.assignee],
    ["label", input.label],
    ["customer", input.customer],
    ["limit", input.limit],
  ];

  for (const [name, value] of provided) {
    if (value === undefined) continue;
    if (!allowed.has(name)) {
      throw new Error(`--${name} is not supported for search ${scope}`);
    }
  }
}

type IssueSearchNode = {
  id: string;
  identifier: string;
  title: string;
  url?: string | null;
  state?: { id: string; name: string; type?: string | null } | null;
  assignee?: { id: string; name: string } | null;
  project?: { id: string; name: string } | null;
  labels?: { nodes?: Array<{ id: string; name: string }> } | null;
};

async function searchIssues(env: Env, workspaceId: string, input: SearchInput): Promise<SearchResultItem[]> {
  if (!input.teamId) throw new Error("search issues requires teamId");
  const first = clampLimit(input.limit);
  const issues = await withWorkspaceAccessToken<IssueSearchNode[]>(env, workspaceId, async (accessToken) => {
    const { createLinearSdkClient } = await import("./sdk");
    const client = createLinearSdkClient(accessToken);
    const data = await sdkRequest<{ issues?: { nodes?: IssueSearchNode[] } }>(
      client,
      `query($teamId: ID!, $first: Int!) {
        issues(
          first: $first,
          filter: { team: { id: { eq: $teamId } } },
          orderBy: updatedAt
        ) {
          nodes {
            id
            identifier
            title
            url
            state { id name type }
            assignee { id name }
            project { id name }
            labels { nodes { id name } }
          }
        }
      }`,
      { teamId: input.teamId, first },
    );
    return data.issues?.nodes ?? [];
  });

  return issues
    .filter((issue) =>
      includesIgnoreCase(issue.title, input.query)
      || includesIgnoreCase(issue.identifier, input.query))
    .filter((issue) => !input.project || issue.project?.id === input.project)
    .filter((issue) => !input.state || issue.state?.name === input.state || issue.state?.id === input.state)
    .filter((issue) => !input.assignee || issue.assignee?.id === input.assignee)
    .filter((issue) => !input.label || (issue.labels?.nodes ?? []).some((label) => label.name === input.label || label.id === input.label))
    .map((issue) => ({
      entityType: "issue",
      id: issue.id,
      title: issue.title,
      subtitle: [issue.identifier, issue.state?.name].filter(Boolean).join(" · "),
      url: issue.url ?? null,
      entity: issue as unknown as Record<string, unknown>,
    }));
}

async function searchDocuments(env: Env, workspaceId: string, input: SearchInput): Promise<SearchResultItem[]> {
  const result = await listDocuments(env, workspaceId, { limit: clampLimit(input.limit), projectId: input.project });
  return result.documents
    .filter((document) => includesIgnoreCase(document.title, input.query) || includesIgnoreCase(document.content, input.query))
    .map((document) => ({
      entityType: "document",
      id: document.id,
      title: document.title,
      subtitle: document.content ? document.content.slice(0, 120) : null,
      url: document.url ?? null,
      entity: document as unknown as Record<string, unknown>,
    }));
}

async function searchProjects(env: Env, workspaceId: string, input: SearchInput): Promise<SearchResultItem[]> {
  const result = await listProjects(env, workspaceId, input.teamId);
  return result.projects
    .filter((project) => includesIgnoreCase(project.name, input.query) || includesIgnoreCase(project.description, input.query))
    .map((project) => ({
      entityType: "project",
      id: project.id,
      title: project.name,
      subtitle: [project.state, project.description].filter(Boolean).join(" · "),
      url: null,
      entity: project as unknown as Record<string, unknown>,
    }));
}

async function searchCustomers(env: Env, workspaceId: string, input: SearchInput): Promise<SearchResultItem[]> {
  const result = await listCustomers(env, workspaceId, clampLimit(input.limit));
  return result.customers
    .filter((customer) => includesIgnoreCase(customer.name, input.query) || (customer.domains ?? []).some((domain) => includesIgnoreCase(domain, input.query)))
    .map((customer) => ({
      entityType: "customer",
      id: customer.id,
      title: customer.name,
      subtitle: (customer.domains ?? []).join(", ") || null,
      url: null,
      entity: customer as unknown as Record<string, unknown>,
    }));
}

async function searchCustomerNeeds(env: Env, workspaceId: string, input: SearchInput): Promise<SearchResultItem[]> {
  const result = await listCustomerNeeds(env, workspaceId, clampLimit(input.limit));
  return result.customerNeeds
    .filter((need) => includesIgnoreCase(need.body, input.query))
    .filter((need) => !input.project || need.project?.id === input.project)
    .filter((need) => !input.customer || need.customer?.id === input.customer)
    .map((need) => ({
      entityType: "customer-need",
      id: need.id,
      title: need.body.slice(0, 80),
      subtitle: [need.customer?.name, need.issue?.identifier].filter(Boolean).join(" · "),
      url: null,
      entity: need as unknown as Record<string, unknown>,
    }));
}

async function searchProjectUpdates(env: Env, workspaceId: string, input: SearchInput): Promise<SearchResultItem[]> {
  const result = await listProjectUpdates(env, workspaceId, clampLimit(input.limit));
  return result.projectUpdates
    .filter((update) => includesIgnoreCase(update.body, input.query))
    .filter((update) => !input.project || update.project?.id === input.project)
    .map((update) => ({
      entityType: "project-update",
      id: update.id,
      title: update.body.slice(0, 80),
      subtitle: [update.project?.name, update.health].filter(Boolean).join(" · "),
      url: null,
      entity: update as unknown as Record<string, unknown>,
    }));
}

async function searchTriage(env: Env, workspaceId: string, input: SearchInput): Promise<SearchResultItem[]> {
  if (!input.teamId) throw new Error("search triage requires teamId");
  const result = await triageList(env, workspaceId, input.teamId, { stateName: input.state, limit: clampLimit(input.limit) });
  return result.issues
    .filter((issue) => includesIgnoreCase(issue.title, input.query) || includesIgnoreCase(issue.identifier, input.query))
    .filter((issue) => !input.project || issue.project?.id === input.project)
    .filter((issue) => !input.assignee || issue.assignee?.id === input.assignee)
    .map((issue) => ({
      entityType: "triage-issue",
      id: issue.id,
      title: issue.title,
      subtitle: [issue.identifier, issue.state.name].filter(Boolean).join(" · "),
      url: issue.url ?? null,
      entity: issue as unknown as Record<string, unknown>,
    }));
}

const SCOPE_SEARCHERS: Record<Exclude<SearchScope, "all">, (env: Env, workspaceId: string, input: SearchInput) => Promise<SearchResultItem[]>> = {
  issues: searchIssues,
  documents: searchDocuments,
  projects: searchProjects,
  customers: searchCustomers,
  "customer-needs": searchCustomerNeeds,
  "project-updates": searchProjectUpdates,
  triage: searchTriage,
};

export async function searchLinear(env: Env, workspaceId: string, input: SearchInput): Promise<SearchResult> {
  validateFilters(input.scope, input);

  if (input.scope === "all") {
    const scopes: Array<Exclude<SearchScope, "all">> = [
      "issues",
      "documents",
      "projects",
      "customers",
      "customer-needs",
      "project-updates",
    ];
    const items = (await Promise.all(scopes.map((scope) => SCOPE_SEARCHERS[scope](env, workspaceId, { ...input, scope }))))
      .flat()
      .slice(0, clampLimit(input.limit));
    return { success: true, scope: input.scope, items };
  }

  const items = await SCOPE_SEARCHERS[input.scope](env, workspaceId, input);
  return { success: true, scope: input.scope, items };
}
