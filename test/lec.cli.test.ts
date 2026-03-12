import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const CLI_PATH = new URL("../scripts/lec", import.meta.url);

type CapturedRequest = {
  path: string;
  body: Record<string, unknown>;
};

async function withMockLinear<T>(run: (ctx: { baseUrl: string; requests: CapturedRequest[] }) => Promise<T>) {
  const requests: CapturedRequest[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const rawBody = Buffer.concat(chunks).toString("utf8");
    const body = rawBody ? JSON.parse(rawBody) as Record<string, unknown> : {};
    requests.push({
      path: req.url ?? "",
      body,
    });

    res.setHeader("content-type", "application/json");

    if (req.url === "/internal/linear/resolve") {
      res.end(JSON.stringify({
        ok: true,
        workspaceId: body.workspaceId ?? "ws_test",
        teamId: "team_test",
      }));
      return;
    }

    if (req.url === "/internal/linear/cycles/get") {
      res.end(JSON.stringify({
        ok: true,
        result: { cycle: { id: body.id ?? "cycle_1", name: "Cycle 1" } },
      }));
      return;
    }

    if (req.url === "/internal/linear/cycles/create") {
      res.end(JSON.stringify({
        ok: true,
        result: { cycleId: "cycle_created" },
      }));
      return;
    }

    if (req.url === "/internal/linear/cycles/update") {
      res.end(JSON.stringify({
        ok: true,
        result: { success: true },
      }));
      return;
    }

    if (req.url === "/internal/linear/cycles/archive") {
      res.end(JSON.stringify({
        ok: true,
        result: { success: true },
      }));
      return;
    }

    if (req.url === "/internal/linear/labels/create") {
      res.end(JSON.stringify({
        ok: true,
        result: { label: { id: "label_created" } },
      }));
      return;
    }

    if (req.url === "/internal/linear/documents/create") {
      res.end(JSON.stringify({
        ok: true,
        result: { documentId: "doc_created" },
      }));
      return;
    }

    if (req.url === "/internal/linear/customers/create") {
      res.end(JSON.stringify({
        ok: true,
        result: { customerId: "cust_created" },
      }));
      return;
    }

    if (req.url === "/internal/linear/customer-needs/create") {
      res.end(JSON.stringify({
        ok: true,
        result: { customerNeedId: "need_created" },
      }));
      return;
    }

    if (req.url === "/internal/linear/project-updates/create") {
      res.end(JSON.stringify({
        ok: true,
        result: { projectUpdateId: "pu_created" },
      }));
      return;
    }

    if (req.url === "/internal/linear/comments/update") {
      res.end(JSON.stringify({
        ok: true,
        result: { success: true },
      }));
      return;
    }

    if (req.url === "/internal/linear/attachments/delete") {
      res.end(JSON.stringify({
        ok: true,
        result: { success: true },
      }));
      return;
    }

    if (req.url === "/internal/linear/issues/archive") {
      res.end(JSON.stringify({
        ok: true,
        result: { success: true },
      }));
      return;
    }

    if (req.url === "/internal/linear/issues/delete") {
      res.end(JSON.stringify({
        ok: true,
        result: { success: true },
      }));
      return;
    }

    if (req.url === "/internal/linear/triage/move") {
      res.end(JSON.stringify({
        ok: true,
        result: { success: true },
      }));
      return;
    }

    if (req.url === "/internal/linear/workflow-states/create") {
      res.end(JSON.stringify({
        ok: true,
        result: { workflowStateId: "state_created" },
      }));
      return;
    }

    if (req.url === "/internal/linear/search") {
      res.end(JSON.stringify({
        ok: true,
        result: {
          success: true,
          scope: body.scope ?? "issues",
          items: [
            {
              entityType: String(body.scope ?? "issues").replace(/s$/, ""),
              id: "search_1",
              title: "Search Hit",
            },
          ],
        },
      }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false, error: "unexpected_path", path: req.url }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("failed to bind mock server");
  }

  try {
    return await run({
      baseUrl: `http://127.0.0.1:${address.port}`,
      requests,
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

async function runCli(args: string[], envOverrides: Record<string, string> = {}) {
  return await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn("node", [CLI_PATH.pathname, ...args], {
      env: {
        ...process.env,
        OPENCLAW_INTERNAL_SECRET: "internal_secret",
        ...envOverrides,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

async function run() {
  const help = await runCli(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /triage list --team PCF/);
  assert.match(help.stdout, /initiatives create --team PCF --title/);
  assert.match(help.stdout, /cycles get --team PCF --id <cycleId>/);
  assert.match(help.stdout, /cycles archive --team PCF --id <cycleId>/);
  assert.match(help.stdout, /labels create --team PCF --title <name> \[--description <md>\] \[--color <hex>\]/);
  assert.match(help.stdout, /documents create --team PCF --title <name> --body <md>/);
  assert.match(help.stdout, /customers create --team PCF --title <name>/);
  assert.match(help.stdout, /customer-needs create --team PCF --body <md> --customer <customerId>/);
  assert.match(help.stdout, /project-updates create --team PCF --project <projectId> --body <md>/);
  assert.match(help.stdout, /comment update --team PCF --id <commentId> --body <md>/);
  assert.match(help.stdout, /attachment delete --team PCF --id <attachmentId>/);
  assert.match(help.stdout, /issue archive --team PCF --issue <id\|PCF-123>/);
  assert.match(help.stdout, /triage move --team PCF --issue <id\|PCF-123>/);
  assert.match(help.stdout, /workflow-states create --team PCF --title <name>/);
  assert.match(help.stdout, /search issues --team PCF --query <text>/);
  assert.match(help.stdout, /search all --team PCF --query <text>/);

  await withMockLinear(async ({ baseUrl, requests }) => {
    const baseEnv = { LEC_BASE_URL: baseUrl };

    const getResult = await runCli(["cycles", "get", "--team", "WS", "--id", "cycle_123", "--json"], baseEnv);
    assert.equal(getResult.status, 0, getResult.stderr);
    const getBody = JSON.parse(getResult.stdout) as { ok: boolean };
    assert.equal(getBody.ok, true);

    const createResult = await runCli([
      "cycles",
      "create",
      "--team",
      "WS",
      "--title",
      "Cycle Alpha",
      "--starts-at",
      "2026-03-01",
      "--ends-at",
      "2026-03-14",
      "--json",
    ], baseEnv);
    assert.equal(createResult.status, 0, createResult.stderr);

    const updateResult = await runCli([
      "cycles",
      "update",
      "--team",
      "WS",
      "--id",
      "cycle_123",
      "--title",
      "Cycle Beta",
      "--starts-at",
      "2026-03-02",
      "--ends-at",
      "2026-03-15",
      "--json",
    ], baseEnv);
    assert.equal(updateResult.status, 0, updateResult.stderr);

    const archiveResult = await runCli(["cycles", "archive", "--team", "WS", "--id", "cycle_123", "--json"], baseEnv);
    assert.equal(archiveResult.status, 0, archiveResult.stderr);

    const labelResult = await runCli([
      "labels",
      "create",
      "--team",
      "WS",
      "--title",
      "Bug",
      "--color",
      "#ff0000",
      "--json",
    ], baseEnv);
    assert.equal(labelResult.status, 0, labelResult.stderr);

    const documentResult = await runCli([
      "documents",
      "create",
      "--team",
      "WS",
      "--title",
      "Spec",
      "--body",
      "# Body",
      "--project",
      "proj_1",
      "--json",
    ], baseEnv);
    assert.equal(documentResult.status, 0, documentResult.stderr);

    const customerResult = await runCli([
      "customers",
      "create",
      "--team",
      "WS",
      "--title",
      "Placify",
      "--json",
    ], baseEnv);
    assert.equal(customerResult.status, 0, customerResult.stderr);

    const customerNeedResult = await runCli([
      "customer-needs",
      "create",
      "--team",
      "WS",
      "--body",
      "Need bulk export",
      "--customer",
      "cust_1",
      "--json",
    ], baseEnv);
    assert.equal(customerNeedResult.status, 0, customerNeedResult.stderr);

    const projectUpdateResult = await runCli([
      "project-updates",
      "create",
      "--team",
      "WS",
      "--project",
      "proj_1",
      "--body",
      "Week update",
      "--status",
      "onTrack",
      "--json",
    ], baseEnv);
    assert.equal(projectUpdateResult.status, 0, projectUpdateResult.stderr);

    const commentUpdateResult = await runCli([
      "comment",
      "update",
      "--team",
      "WS",
      "--id",
      "comment_1",
      "--body",
      "Updated",
      "--json",
    ], baseEnv);
    assert.equal(commentUpdateResult.status, 0, commentUpdateResult.stderr);

    const attachmentDeleteResult = await runCli([
      "attachment",
      "delete",
      "--team",
      "WS",
      "--id",
      "attachment_1",
      "--json",
    ], baseEnv);
    assert.equal(attachmentDeleteResult.status, 0, attachmentDeleteResult.stderr);

    const issueArchiveResult = await runCli([
      "issue",
      "archive",
      "--team",
      "WS",
      "--issue",
      "issue_1",
      "--json",
    ], baseEnv);
    assert.equal(issueArchiveResult.status, 0, issueArchiveResult.stderr);

    const issueDeleteResult = await runCli([
      "issue",
      "delete",
      "--team",
      "WS",
      "--issue",
      "issue_1",
      "--json",
    ], baseEnv);
    assert.equal(issueDeleteResult.status, 0, issueDeleteResult.stderr);

    const triageMoveResult = await runCli([
      "triage",
      "move",
      "--team",
      "WS",
      "--issue",
      "issue_1",
      "--assignee",
      "00000000-0000-0000-0000-000000000123",
      "--state",
      "state_1",
      "--project",
      "proj_1",
      "--json",
    ], baseEnv);
    assert.equal(triageMoveResult.status, 0, triageMoveResult.stderr);

    const workflowStateCreateResult = await runCli([
      "workflow-states",
      "create",
      "--team",
      "WS",
      "--title",
      "Backlog",
      "--state",
      "unstarted",
      "--json",
    ], baseEnv);
    assert.equal(workflowStateCreateResult.status, 0, workflowStateCreateResult.stderr);

    const searchIssuesResult = await runCli([
      "search",
      "issues",
      "--query",
      "oauth timeout",
      "--state",
      "In Progress",
      "--assignee",
      "user_1",
      "--project",
      "proj_1",
      "--limit",
      "10",
      "--json",
    ], baseEnv);
    assert.equal(searchIssuesResult.status, 0, searchIssuesResult.stderr);

    const searchAllResult = await runCli([
      "search",
      "all",
      "--query",
      "release note",
      "--limit",
      "5",
      "--json",
    ], baseEnv);
    assert.equal(searchAllResult.status, 0, searchAllResult.stderr);

    const invalidSearchResult = await runCli([
      "search",
      "projects",
      "--query",
      "bridge",
      "--state",
      "planned",
    ], baseEnv);
    assert.equal(invalidSearchResult.status, 2);
    assert.match(invalidSearchResult.stderr, /--state is not supported for search projects/);

    const cycleGetRequest = requests.find((item) => item.path === "/internal/linear/cycles/get");
    assert.deepEqual(cycleGetRequest?.body, { workspaceId: "43f90090-729f-4d7f-98d9-6693104cb211", id: "cycle_123" });

    const cycleCreateRequest = requests.find((item) => item.path === "/internal/linear/cycles/create");
    assert.deepEqual(cycleCreateRequest?.body, {
      workspaceId: "43f90090-729f-4d7f-98d9-6693104cb211",
      teamId: "team_test",
      startsAt: "2026-03-01",
      endsAt: "2026-03-14",
      name: "Cycle Alpha",
    });

    const cycleUpdateRequest = requests.find((item) => item.path === "/internal/linear/cycles/update");
    assert.deepEqual(cycleUpdateRequest?.body, {
      workspaceId: "43f90090-729f-4d7f-98d9-6693104cb211",
      id: "cycle_123",
      startsAt: "2026-03-02",
      endsAt: "2026-03-15",
      name: "Cycle Beta",
    });

    const cycleArchiveRequest = requests.find((item) => item.path === "/internal/linear/cycles/archive");
    assert.deepEqual(cycleArchiveRequest?.body, {
      workspaceId: "43f90090-729f-4d7f-98d9-6693104cb211",
      id: "cycle_123",
    });

    const labelCreateRequest = requests.find((item) => item.path === "/internal/linear/labels/create");
    assert.deepEqual(labelCreateRequest?.body, {
      workspaceId: "43f90090-729f-4d7f-98d9-6693104cb211",
      name: "Bug",
      color: "#ff0000",
      description: null,
    });

    const documentCreateRequest = requests.find((item) => item.path === "/internal/linear/documents/create");
    assert.deepEqual(documentCreateRequest?.body, {
      workspaceId: "43f90090-729f-4d7f-98d9-6693104cb211",
      title: "Spec",
      content: "# Body",
      projectId: "proj_1",
    });

    const customerCreateRequest = requests.find((item) => item.path === "/internal/linear/customers/create");
    assert.deepEqual(customerCreateRequest?.body, {
      workspaceId: "43f90090-729f-4d7f-98d9-6693104cb211",
      name: "Placify",
    });

    const customerNeedCreateRequest = requests.find((item) => item.path === "/internal/linear/customer-needs/create");
    assert.deepEqual(customerNeedCreateRequest?.body, {
      workspaceId: "43f90090-729f-4d7f-98d9-6693104cb211",
      body: "Need bulk export",
      customerId: "cust_1",
    });

    const projectUpdateCreateRequest = requests.find((item) => item.path === "/internal/linear/project-updates/create");
    assert.deepEqual(projectUpdateCreateRequest?.body, {
      workspaceId: "43f90090-729f-4d7f-98d9-6693104cb211",
      projectId: "proj_1",
      body: "Week update",
      health: "onTrack",
    });

    const commentUpdateRequest = requests.find((item) => item.path === "/internal/linear/comments/update");
    assert.deepEqual(commentUpdateRequest?.body, {
      workspaceId: "43f90090-729f-4d7f-98d9-6693104cb211",
      id: "comment_1",
      body: "Updated",
    });

    const attachmentDeleteRequest = requests.find((item) => item.path === "/internal/linear/attachments/delete");
    assert.deepEqual(attachmentDeleteRequest?.body, {
      workspaceId: "43f90090-729f-4d7f-98d9-6693104cb211",
      id: "attachment_1",
    });

    const issueArchiveRequest = requests.find((item) => item.path === "/internal/linear/issues/archive");
    assert.deepEqual(issueArchiveRequest?.body, {
      workspaceId: "43f90090-729f-4d7f-98d9-6693104cb211",
      id: "issue_1",
    });

    const issueDeleteRequest = requests.find((item) => item.path === "/internal/linear/issues/delete");
    assert.deepEqual(issueDeleteRequest?.body, {
      workspaceId: "43f90090-729f-4d7f-98d9-6693104cb211",
      id: "issue_1",
    });

    const triageMoveRequest = requests.find((item) => item.path === "/internal/linear/triage/move");
    assert.deepEqual(triageMoveRequest?.body, {
      workspaceId: "43f90090-729f-4d7f-98d9-6693104cb211",
      issueId: "issue_1",
      assigneeId: "00000000-0000-0000-0000-000000000123",
      stateId: "state_1",
      projectId: "proj_1",
    });

    const workflowStateCreateRequest = requests.find((item) => item.path === "/internal/linear/workflow-states/create");
    assert.deepEqual(workflowStateCreateRequest?.body, {
      workspaceId: "43f90090-729f-4d7f-98d9-6693104cb211",
      teamId: "team_test",
      name: "Backlog",
      type: "unstarted",
    });

    const searchIssuesRequest = requests.find((item) => item.path === "/internal/linear/search" && item.body.scope === "issues");
    assert.deepEqual(searchIssuesRequest?.body, {
      workspaceId: "43f90090-729f-4d7f-98d9-6693104cb211",
      teamId: "team_test",
      scope: "issues",
      query: "oauth timeout",
      state: "In Progress",
      assignee: "user_1",
      project: "proj_1",
      limit: 10,
    });

    const searchAllRequest = requests.find((item) => item.path === "/internal/linear/search" && item.body.scope === "all");
    assert.deepEqual(searchAllRequest?.body, {
      workspaceId: "43f90090-729f-4d7f-98d9-6693104cb211",
      teamId: "team_test",
      scope: "all",
      query: "release note",
      limit: 5,
    });
  });

  console.log("lec.cli.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
