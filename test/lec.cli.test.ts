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
  assert.match(help.stdout, /triage list --team WS/);
  assert.match(help.stdout, /initiatives create --team WS --title/);
  assert.match(help.stdout, /cycles get --team WS --id <cycleId>/);
  assert.match(help.stdout, /cycles archive --team WS --id <cycleId>/);
  assert.match(help.stdout, /labels create --team WS --title <name> \[--description <md>\] \[--color <hex>\]/);

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
  });

  console.log("lec.cli.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
