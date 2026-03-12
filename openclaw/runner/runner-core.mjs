import { spawn as nodeSpawn } from "node:child_process";
import { extractFirstJson, splitArgs } from "./runner-utils.mjs";

export const DEFAULT_CLI_ARGS = "agent --json --message";

function ensureFlag(args, flag) {
  return args.includes(flag) ? args : [...args, flag];
}

function ensureOption(args, flag, value) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return [...args, flag, value];
  }
  if (index === args.length - 1) {
    return [...args, value];
  }
  const next = [...args];
  next[index + 1] = value;
  return next;
}

export function buildCommandArgs(prompt, sessionId, cliArgs = DEFAULT_CLI_ARGS, timeoutMs = 300000) {
  let args = splitArgs(cliArgs);

  const messageIndex = args.indexOf("--message");
  if (messageIndex === -1) {
    args = [...args, "--message", prompt];
  } else if (messageIndex === args.length - 1) {
    args = [...args, prompt];
  } else {
    const next = [...args];
    next[messageIndex + 1] = prompt;
    args = next;
  }

  args = ensureFlag(args, "--json");
  args = ensureOption(args, "--timeout", `${Math.ceil(timeoutMs / 1000)}s`);

  if (sessionId) {
    args = ensureOption(args, "--session-id", sessionId);
  }

  return args;
}

function tryParseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractIntentCandidate(value) {
  if (!value) return null;
  if (typeof value === "string") {
    return tryParseJson(value.trim()) ?? extractFirstJson(value);
  }
  if (typeof value === "object") {
    return value;
  }
  return null;
}

export function parseCliJsonOutput(stdout) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) return null;

  const parsed = tryParseJson(trimmed) ?? extractFirstJson(trimmed);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  if (Array.isArray(parsed.actions)) {
    return parsed;
  }

  const candidates = [
    parsed.intent,
    parsed.response,
    parsed.message,
    parsed.text,
    parsed.output,
    parsed.result,
    parsed.final,
    parsed.assistant,
    parsed.data,
  ];

  for (const candidate of candidates) {
    const intent = extractIntentCandidate(candidate);
    if (intent && typeof intent === "object" && Array.isArray(intent.actions)) {
      return intent;
    }
  }

  return null;
}

export async function runOpenClaw(prompt, sessionId, options = {}) {
  const {
    cliBin = "openclaw",
    cliArgs = DEFAULT_CLI_ARGS,
    timeoutMs = 300000,
    spawnImpl = nodeSpawn,
    signal = null,
  } = options;
  const args = buildCommandArgs(prompt, sessionId, cliArgs, timeoutMs);

  return new Promise((resolve) => {
    let settled = false;
    let child = null;
    let timer = null;
    let abortHandler = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
      resolve(result);
    };

    try {
      child = spawnImpl(cliBin, args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      finish({
        ok: false,
        error: `openclaw_spawn_error ${error?.code ?? ""}`.trim(),
        raw: "",
      });
      return;
    }
    let stdout = "";
    let stderr = "";
    timer = setTimeout(() => {
      child.kill?.("SIGKILL");
      finish({ ok: false, error: "openclaw_timeout" });
    }, timeoutMs);

    abortHandler = () => {
      child.kill?.("SIGKILL");
      finish({ ok: false, error: "run_stopped" });
    };
    if (signal) {
      if (signal.aborted) {
        abortHandler();
        return;
      }
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      finish({
        ok: false,
        error: `openclaw_spawn_error ${error?.code ?? ""}`.trim(),
        raw: stderr.slice(0, 2000),
      });
    });
    child.on("close", (code) => {
      const intent = parseCliJsonOutput(stdout);
      if (intent) {
        finish({ ok: true, intent });
        return;
      }
      finish({
        ok: false,
        error: `openclaw_invalid_json exit=${code ?? "unknown"} stderr=${stderr.slice(0, 500)}`,
        raw: stdout.slice(0, 2000),
      });
    });
  });
}
