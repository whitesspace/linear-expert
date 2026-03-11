import { spawn } from "node:child_process";
import { extractFirstJson, splitArgs } from "./runner-utils.mjs";

const BASE_URL = process.env.LINEAR_EXPERT_BASE_URL;
const SECRET = process.env.OPENCLAW_INTERNAL_SECRET;
const CLI_BIN = process.env.OPENCLAW_CLI_BIN || "openclaw";
const CLI_ARGS = process.env.OPENCLAW_CLI_ARGS || "agent --local --message";
const POLL_INTERVAL_MS = Number(process.env.RUNNER_POLL_INTERVAL_MS || "5000");
const TIMEOUT_MS = Number(process.env.OPENCLAW_CLI_TIMEOUT_MS || "300000");
const RUN_ONCE = process.env.RUNNER_ONCE === "true";

if (!BASE_URL || !SECRET) {
  console.error("Missing LINEAR_EXPERT_BASE_URL or OPENCLAW_INTERNAL_SECRET");
  process.exit(1);
}

const headers = {
  authorization: `Bearer ${SECRET}`,
  "content-type": "application/json",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCommandArgs(prompt) {
  const args = splitArgs(CLI_ARGS);
  const messageIndex = args.indexOf("--message");
  if (messageIndex === -1) {
    return [...args, "--message", prompt];
  }
  const withPrompt = [...args];
  if (messageIndex === args.length - 1) {
    withPrompt.push(prompt);
  } else {
    withPrompt.splice(messageIndex + 1, 1, prompt);
  }
  return withPrompt;
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`http_${res.status}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : {};
}

async function listRuns() {
  const url = `${BASE_URL}/internal/agent-runs?status=pending&limit=5`;
  const res = await fetchJson(url, { headers });
  return Array.isArray(res.runs) ? res.runs : [];
}

async function claimRun(runId) {
  const url = `${BASE_URL}/internal/agent-runs/${runId}/claim`;
  return fetchJson(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ lockDurationSeconds: 600 }),
  });
}

async function submitResult(runId, payload) {
  const url = `${BASE_URL}/internal/agent-runs/${runId}/result`;
  return fetchJson(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

async function runOpenClaw(prompt) {
  const args = buildCommandArgs(prompt);
  return new Promise((resolve) => {
    const child = spawn(CLI_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ ok: false, error: "openclaw_timeout" });
    }, TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const intent = extractFirstJson(stdout);
      if (intent) {
        resolve({ ok: true, intent });
        return;
      }
      resolve({
        ok: false,
        error: `openclaw_invalid_json exit=${code ?? "unknown"} stderr=${stderr.slice(0, 500)}`,
        raw: stdout.slice(0, 2000),
      });
    });
  });
}

async function handleRun(run) {
  let payload;
  try {
    payload = JSON.parse(run.payloadJson || "{}");
  } catch {
    await submitResult(run.id, { ok: false, error: "invalid_payload_json" });
    return;
  }
  const prompt = payload.prompt || "";
  if (!prompt) {
    await submitResult(run.id, { ok: false, error: "missing_prompt" });
    return;
  }
  const result = await runOpenClaw(prompt);
  await submitResult(run.id, result);
}

async function loop() {
  while (true) {
    try {
      const runs = await listRuns();
      if (!runs.length) {
        if (RUN_ONCE) return;
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      for (const run of runs) {
        const claimed = await claimRun(run.id).catch(() => null);
        if (!claimed?.run) continue;
        await handleRun(claimed.run);
      }
    } catch (error) {
      console.error("runner_loop_error", error);
      if (RUN_ONCE) return;
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

loop().catch((error) => {
  console.error("runner_fatal", error);
  process.exit(1);
});
