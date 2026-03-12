import assert from "node:assert/strict";
import worker from "../worker/src/index";
import { getStorage } from "../worker/src/storage";

type TestEnv = Parameters<typeof worker.fetch>[1];

type GraphQLCall = {
  query: string;
  variables: Record<string, unknown>;
};

type RouteCase = {
  name: string;
  path: string;
  body: Record<string, unknown>;
  expectedQuery: string;
};

function buildEnv(): TestEnv {
  return {
    LINEAR_WEBHOOK_SECRET: "whsec_test",
    LINEAR_CLIENT_ID: "client_id",
    LINEAR_CLIENT_SECRET: "client_secret",
    LINEAR_REDIRECT_URI: "https://example.com/oauth/callback",
    OPENCLAW_INTERNAL_SECRET: "internal_secret",
  };
}

function mockGraphQLResponse(query: string, variables: Record<string, unknown>) {
  if (query.includes("documents(")) {
    return {
      data: {
        documents: {
          nodes: [{ id: "doc_1", title: "Spec", content: "Body", url: "https://linear.app/doc/doc_1", icon: "📄", color: "#ffffff" }],
        },
      },
    };
  }

  if (query.includes("document(id: $id)")) {
    return {
      data: {
        document: { id: String(variables.id ?? "doc_1"), title: "Spec", content: "Body", url: "https://linear.app/doc/doc_1", icon: "📄", color: "#ffffff" },
      },
    };
  }

  if (query.includes("documentCreate(")) {
    return {
      data: {
        documentCreate: {
          success: true,
          document: { id: "doc_created", title: "Spec", content: "Body", url: "https://linear.app/doc/doc_created", icon: "📄", color: "#ffffff" },
        },
      },
    };
  }

  if (query.includes("documentUpdate(")) {
    return {
      data: {
        documentUpdate: {
          success: true,
          document: { id: String(variables.id ?? "doc_1"), title: "Spec Updated", content: "Updated", url: "https://linear.app/doc/doc_1", icon: "📄", color: "#ffffff" },
        },
      },
    };
  }

  if (query.includes("documentDelete(")) {
    return {
      data: {
        documentDelete: { success: true },
      },
    };
  }

  if (query.includes("documentUnarchive(")) {
    return {
      data: {
        documentUnarchive: { success: true, entity: { id: String(variables.id ?? "doc_1") } },
      },
    };
  }

  if (query.includes("customers(")) {
    return {
      data: {
        customers: {
          nodes: [{ id: "cust_1", name: "Placify", domains: ["placify.app"], revenue: 100, size: 10 }],
        },
      },
    };
  }

  if (query.includes("customer(id: $id)")) {
    return {
      data: {
        customer: { id: String(variables.id ?? "cust_1"), name: "Placify", domains: ["placify.app"], revenue: 100, size: 10 },
      },
    };
  }

  if (query.includes("customerCreate(")) {
    return {
      data: {
        customerCreate: { success: true, customer: { id: "cust_created", name: "Placify" } },
      },
    };
  }

  if (query.includes("customerUpdate(")) {
    return {
      data: {
        customerUpdate: { success: true, customer: { id: String(variables.id ?? "cust_1"), name: "Placify Updated" } },
      },
    };
  }

  if (query.includes("customerDelete(")) {
    return {
      data: {
        customerDelete: { success: true },
      },
    };
  }

  if (query.includes("customerNeeds(")) {
    return {
      data: {
        customerNeeds: {
          nodes: [{ id: "need_1", body: "Need bulk export", priority: 1, customer: { id: "cust_1", name: "Placify" }, issue: { id: "issue_1", identifier: "WS-1" } }],
        },
      },
    };
  }

  if (query.includes("customerNeed(id: $id)")) {
    return {
      data: {
        customerNeed: { id: String(variables.id ?? "need_1"), body: "Need bulk export", priority: 1, customer: { id: "cust_1", name: "Placify" }, issue: { id: "issue_1", identifier: "WS-1" } },
      },
    };
  }

  if (query.includes("customerNeedCreate(")) {
    return {
      data: {
        customerNeedCreate: { success: true, customerNeed: { id: "need_created", body: "Need bulk export" } },
      },
    };
  }

  if (query.includes("customerNeedUpdate(")) {
    return {
      data: {
        customerNeedUpdate: { success: true, customerNeed: { id: String(variables.id ?? "need_1"), body: "Need import hooks" } },
      },
    };
  }

  if (query.includes("customerNeedArchive(")) {
    return {
      data: {
        customerNeedArchive: { success: true, entity: { id: String(variables.id ?? "need_1") } },
      },
    };
  }

  if (query.includes("customerNeedUnarchive(")) {
    return {
      data: {
        customerNeedUnarchive: { success: true, entity: { id: String(variables.id ?? "need_1") } },
      },
    };
  }

  if (query.includes("projectUpdates(")) {
    return {
      data: {
        projectUpdates: {
          nodes: [{ id: "pu_1", body: "Week update", health: "onTrack", project: { id: "proj_1", name: "Growth" } }],
        },
      },
    };
  }

  if (query.includes("projectUpdate(id: $id)")) {
    return {
      data: {
        projectUpdate: { id: String(variables.id ?? "pu_1"), body: "Week update", health: "onTrack", project: { id: "proj_1", name: "Growth" } },
      },
    };
  }

  if (query.includes("projectUpdateCreate(")) {
    return {
      data: {
        projectUpdateCreate: { success: true, projectUpdate: { id: "pu_created", body: "Week update" } },
      },
    };
  }

  if (query.includes("projectUpdateUpdate(")) {
    return {
      data: {
        projectUpdateUpdate: { success: true, projectUpdate: { id: String(variables.id ?? "pu_1"), body: "Week update updated" } },
      },
    };
  }

  if (query.includes("projectUpdateArchive(")) {
    return {
      data: {
        projectUpdateArchive: { success: true, entity: { id: String(variables.id ?? "pu_1") } },
      },
    };
  }

  if (query.includes("projectUpdateUnarchive(")) {
    return {
      data: {
        projectUpdateUnarchive: { success: true, entity: { id: String(variables.id ?? "pu_1") } },
      },
    };
  }

  if (query.includes("commentUpdate(")) {
    return {
      data: {
        commentUpdate: { success: true, comment: { id: String(variables.id ?? "comment_1"), body: "Updated body" } },
      },
    };
  }

  if (query.includes("commentDelete(")) {
    return {
      data: {
        commentDelete: { success: true },
      },
    };
  }

  if (query.includes("commentResolve(")) {
    return {
      data: {
        commentResolve: { success: true, comment: { id: String(variables.id ?? "comment_1"), body: "Resolved" } },
      },
    };
  }

  if (query.includes("commentUnresolve(")) {
    return {
      data: {
        commentUnresolve: { success: true, comment: { id: String(variables.id ?? "comment_1"), body: "Unresolved" } },
      },
    };
  }

  if (query.includes("attachmentDelete(")) {
    return {
      data: {
        attachmentDelete: { success: true },
      },
    };
  }

  if (query.includes("issueArchive(")) {
    return {
      data: {
        issueArchive: { success: true, entity: { id: String(variables.id ?? "issue_1") } },
      },
    };
  }

  if (query.includes("issueDelete(")) {
    return {
      data: {
        issueDelete: { success: true },
      },
    };
  }

  if (query.includes("issueUpdate(")) {
    return {
      data: {
        issueUpdate: {
          success: true,
          issue: { id: "issue_1", identifier: "WS-1", title: "Triage moved", url: "https://linear.app/issue/WS-1" },
        },
      },
    };
  }

  if (query.includes("workflowStates(")) {
    return {
      data: {
        workflowStates: {
          nodes: [{ id: "state_1", name: "Backlog", type: "unstarted", position: 1 }],
        },
      },
    };
  }

  if (query.includes("workflowState(id: $id)")) {
    return {
      data: {
        workflowState: { id: String(variables.id ?? "state_1"), name: "Backlog", type: "unstarted", position: 1 },
      },
    };
  }

  if (query.includes("workflowStateCreate(")) {
    return {
      data: {
        workflowStateCreate: { success: true, workflowState: { id: "state_created", name: "Backlog" } },
      },
    };
  }

  if (query.includes("workflowStateUpdate(")) {
    return {
      data: {
        workflowStateUpdate: { success: true, workflowState: { id: String(variables.id ?? "state_1"), name: "Ready" } },
      },
    };
  }

  if (query.includes("workflowStateArchive(")) {
    return {
      data: {
        workflowStateArchive: { success: true, entity: { id: String(variables.id ?? "state_1") } },
      },
    };
  }

  throw new Error(`unexpected GraphQL query: ${query}`);
}

async function run() {
  const env = buildEnv();
  await getStorage(env).oauth.upsert({
    workspaceId: "ws_1",
    accessToken: "Bearer test-token",
    refreshToken: "refresh-token",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    scopes: ["read", "write"],
    actorMode: "app",
  });

  const originalFetch = globalThis.fetch;
  const calls: GraphQLCall[] = [];

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as GraphQLCall;
    calls.push(body);
    return new Response(JSON.stringify(mockGraphQLResponse(body.query, body.variables ?? {})), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const cases: RouteCase[] = [
    { name: "documents list", path: "/internal/linear/documents/list", body: { workspaceId: "ws_1", limit: 10 }, expectedQuery: "documents(" },
    { name: "documents get", path: "/internal/linear/documents/get", body: { workspaceId: "ws_1", id: "doc_1" }, expectedQuery: "document(id: $id)" },
    { name: "documents create", path: "/internal/linear/documents/create", body: { workspaceId: "ws_1", title: "Spec", content: "Body", projectId: "proj_1" }, expectedQuery: "documentCreate(" },
    { name: "documents update", path: "/internal/linear/documents/update", body: { workspaceId: "ws_1", id: "doc_1", title: "Spec Updated" }, expectedQuery: "documentUpdate(" },
    { name: "documents delete", path: "/internal/linear/documents/delete", body: { workspaceId: "ws_1", id: "doc_1" }, expectedQuery: "documentDelete(" },
    { name: "documents unarchive", path: "/internal/linear/documents/unarchive", body: { workspaceId: "ws_1", id: "doc_1" }, expectedQuery: "documentUnarchive(" },
    { name: "customers list", path: "/internal/linear/customers/list", body: { workspaceId: "ws_1", limit: 10 }, expectedQuery: "customers(" },
    { name: "customers get", path: "/internal/linear/customers/get", body: { workspaceId: "ws_1", id: "cust_1" }, expectedQuery: "customer(id: $id)" },
    { name: "customers create", path: "/internal/linear/customers/create", body: { workspaceId: "ws_1", name: "Placify", domains: ["placify.app"] }, expectedQuery: "customerCreate(" },
    { name: "customers update", path: "/internal/linear/customers/update", body: { workspaceId: "ws_1", id: "cust_1", name: "Placify Updated" }, expectedQuery: "customerUpdate(" },
    { name: "customers delete", path: "/internal/linear/customers/delete", body: { workspaceId: "ws_1", id: "cust_1" }, expectedQuery: "customerDelete(" },
    { name: "customer needs list", path: "/internal/linear/customer-needs/list", body: { workspaceId: "ws_1", limit: 10 }, expectedQuery: "customerNeeds(" },
    { name: "customer needs get", path: "/internal/linear/customer-needs/get", body: { workspaceId: "ws_1", id: "need_1" }, expectedQuery: "customerNeed(id: $id)" },
    { name: "customer needs create", path: "/internal/linear/customer-needs/create", body: { workspaceId: "ws_1", body: "Need bulk export", customerId: "cust_1", priority: 1 }, expectedQuery: "customerNeedCreate(" },
    { name: "customer needs update", path: "/internal/linear/customer-needs/update", body: { workspaceId: "ws_1", id: "need_1", body: "Need import hooks" }, expectedQuery: "customerNeedUpdate(" },
    { name: "customer needs delete", path: "/internal/linear/customer-needs/delete", body: { workspaceId: "ws_1", id: "need_1" }, expectedQuery: "customerNeedArchive(" },
    { name: "customer needs unarchive", path: "/internal/linear/customer-needs/unarchive", body: { workspaceId: "ws_1", id: "need_1" }, expectedQuery: "customerNeedUnarchive(" },
    { name: "project updates list", path: "/internal/linear/project-updates/list", body: { workspaceId: "ws_1", limit: 10 }, expectedQuery: "projectUpdates(" },
    { name: "project updates get", path: "/internal/linear/project-updates/get", body: { workspaceId: "ws_1", id: "pu_1" }, expectedQuery: "projectUpdate(id: $id)" },
    { name: "project updates create", path: "/internal/linear/project-updates/create", body: { workspaceId: "ws_1", projectId: "proj_1", body: "Week update", health: "onTrack" }, expectedQuery: "projectUpdateCreate(" },
    { name: "project updates update", path: "/internal/linear/project-updates/update", body: { workspaceId: "ws_1", id: "pu_1", body: "Week update updated" }, expectedQuery: "projectUpdateUpdate(" },
    { name: "project updates delete", path: "/internal/linear/project-updates/delete", body: { workspaceId: "ws_1", id: "pu_1" }, expectedQuery: "projectUpdateArchive(" },
    { name: "project updates unarchive", path: "/internal/linear/project-updates/unarchive", body: { workspaceId: "ws_1", id: "pu_1" }, expectedQuery: "projectUpdateUnarchive(" },
    { name: "comments update", path: "/internal/linear/comments/update", body: { workspaceId: "ws_1", id: "comment_1", body: "Updated body" }, expectedQuery: "commentUpdate(" },
    { name: "comments delete", path: "/internal/linear/comments/delete", body: { workspaceId: "ws_1", id: "comment_1" }, expectedQuery: "commentDelete(" },
    { name: "comments resolve", path: "/internal/linear/comments/resolve", body: { workspaceId: "ws_1", id: "comment_1" }, expectedQuery: "commentResolve(" },
    { name: "comments unresolve", path: "/internal/linear/comments/unresolve", body: { workspaceId: "ws_1", id: "comment_1" }, expectedQuery: "commentUnresolve(" },
    { name: "attachments delete", path: "/internal/linear/attachments/delete", body: { workspaceId: "ws_1", id: "attachment_1" }, expectedQuery: "attachmentDelete(" },
    { name: "issues archive", path: "/internal/linear/issues/archive", body: { workspaceId: "ws_1", id: "issue_1" }, expectedQuery: "issueArchive(" },
    { name: "issues delete", path: "/internal/linear/issues/delete", body: { workspaceId: "ws_1", id: "issue_1" }, expectedQuery: "issueDelete(" },
    { name: "triage move", path: "/internal/linear/triage/move", body: { workspaceId: "ws_1", issueId: "issue_1", assigneeId: "00000000-0000-0000-0000-000000000123", stateId: "state_1", projectId: "proj_1" }, expectedQuery: "issueUpdate(" },
    { name: "workflow states list", path: "/internal/linear/workflow-states/list", body: { workspaceId: "ws_1", teamId: "team_1", limit: 10 }, expectedQuery: "workflowStates(" },
    { name: "workflow states get", path: "/internal/linear/workflow-states/get", body: { workspaceId: "ws_1", id: "state_1" }, expectedQuery: "workflowState(id: $id)" },
    { name: "workflow states create", path: "/internal/linear/workflow-states/create", body: { workspaceId: "ws_1", teamId: "team_1", name: "Backlog", type: "unstarted" }, expectedQuery: "workflowStateCreate(" },
    { name: "workflow states update", path: "/internal/linear/workflow-states/update", body: { workspaceId: "ws_1", id: "state_1", name: "Ready" }, expectedQuery: "workflowStateUpdate(" },
    { name: "workflow states archive", path: "/internal/linear/workflow-states/archive", body: { workspaceId: "ws_1", id: "state_1" }, expectedQuery: "workflowStateArchive(" },
  ];

  try {
    for (const testCase of cases) {
      const response = await worker.fetch(new Request(`https://example.com${testCase.path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer internal_secret",
        },
        body: JSON.stringify(testCase.body),
      }), env, {} as ExecutionContext);

      assert.equal(response.status, 200, testCase.name);
      const payload = await response.json() as { ok?: boolean };
      assert.equal(payload.ok, true, testCase.name);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  for (const testCase of cases) {
    const matched = calls.find((call) => call.query.includes(testCase.expectedQuery));
    assert.ok(matched, `missing GraphQL call for ${testCase.name}`);
  }

  console.log("linear.capabilities.routes.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
