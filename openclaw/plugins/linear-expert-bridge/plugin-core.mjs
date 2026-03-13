import { parseCliJsonOutput, runOpenClaw } from "./runner-core.mjs";

export const PLUGIN_ID = "linear-expert-bridge";

const DEFAULTS = {
  cliBin: "openclaw",
  cliArgs: "agent --json --message",
  allowCliFallback: false,
  pollIntervalMs: 5000,
  timeoutMs: 300000,
  heartbeatIntervalMs: 10000,
  lockDurationSeconds: 600,
  maxRunsPerPoll: 5,
  runOnStartup: true,
};

function nowIso() {
  return new Date().toISOString();
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function errorMessage(error) {
  if (!error) return "unknown_error";
  return String(error?.message || error);
}

function errorStack(error) {
  return String(error?.stack || errorMessage(error));
}

function isAbortError(error, signal) {
  if (signal?.aborted) return true;
  const message = errorMessage(error).toLowerCase();
  return error?.name === "AbortError" || message.includes("abort") || message.includes("stopped");
}

function summarizeRaw(value) {
  if (value == null) return "";
  if (typeof value === "string") {
    return value.slice(0, 2000);
  }
  try {
    return JSON.stringify(value).slice(0, 2000);
  } catch {
    return String(value).slice(0, 2000);
  }
}

function toIntentCandidate(value) {
  if (!value) return null;
  if (typeof value === "string") {
    return parseCliJsonOutput(value) ?? null;
  }
  if (typeof value === "object" && Array.isArray(value.actions)) {
    return value;
  }
  return null;
}

function extractIntentFromGatewayResponse(response) {
  if (!response) return null;
  if (typeof response === "string") {
    return parseCliJsonOutput(response);
  }
  if (typeof response !== "object") {
    return null;
  }

  if (response.ok === true && response.intent && Array.isArray(response.intent.actions)) {
    return response.intent;
  }
  if (Array.isArray(response.actions)) {
    return response;
  }

  const candidates = [
    response.intent,
    response.reply,
    response.final,
    response.response,
    response.message,
    response.text,
    response.output,
    response.result,
    response.data,
  ];

  if (Array.isArray(response.payloads)) {
    candidates.push(...response.payloads);
  }

  for (const candidate of candidates) {
    const intent = toIntentCandidate(candidate);
    if (intent && Array.isArray(intent.actions)) {
      return intent;
    }
  }

  return null;
}

function extractGatewayRunId(response) {
  if (!response || typeof response !== "object") return null;
  return response.runId || response.id || response.run?.id || null;
}

function getGatewayCaller(api, deps = {}) {
  const candidates = [
    deps.gatewayCall,
    api?.callGatewayMethod,
    api?.invokeGatewayMethod,
    api?.runtime?.gateway?.call,
    api?.runtime?.rpc?.call,
    api?.runtime?.call,
  ];

  return candidates.find((candidate) => typeof candidate === "function") ?? null;
}

function updateActiveRun(state, runId, patch) {
  const current = state.activeRuns.get(runId);
  if (!current) return null;
  const next = { ...current, ...patch };
  state.activeRuns.set(runId, next);
  return next;
}

function touchActiveRun(state, runId, phase) {
  const patch = { lastHeartbeatAt: nowIso() };
  if (phase) {
    patch.phase = phase;
  }
  return updateActiveRun(state, runId, patch);
}

function createCliExecutor(config) {
  const execute = async ({ prompt, sessionId, signal, timeoutMs, onPhase }) => {
    await onPhase?.("running");
    return runOpenClaw(prompt, sessionId, {
      cliBin: config.cliBin,
      cliArgs: config.cliArgs,
      timeoutMs: timeoutMs ?? config.timeoutMs,
      signal,
    });
  };
  execute.executionMode = "cli_fallback";
  return execute;
}

function createGatewayRequiredExecutor() {
  const execute = async () => ({
    ok: false,
    error: "gateway_runtime_unavailable",
  });
  execute.executionMode = "gateway_runtime_required";
  return execute;
}

function isExecutionRuntimeAvailable(api, config, deps = {}) {
  if (typeof deps.executeRun === "function") {
    return true;
  }
  if (getGatewayCaller(api, deps)) {
    return true;
  }
  return config.allowCliFallback;
}

function createGatewayRuntimeExecutor(api, config, deps = {}) {
  const gatewayCall = getGatewayCaller(api, deps);
  if (!gatewayCall) {
    return null;
  }

  const execute = async ({ prompt, sessionId, signal, timeoutMs, onAccepted, onPhase, onHeartbeat }) => {
    await onPhase?.("dispatching");
    const heartbeatTimer = setInterval(() => {
      void onHeartbeat?.("running");
    }, config.heartbeatIntervalMs);

    try {
      const response = await gatewayCall("agent", {
        message: prompt,
        sessionId: sessionId || undefined,
        timeoutMs: timeoutMs ?? config.timeoutMs,
      }, {
        expectFinal: true,
        signal,
        timeoutMs: timeoutMs ?? config.timeoutMs,
      });
      const gatewayRunId = extractGatewayRunId(response);
      if (gatewayRunId) {
        await onAccepted?.({
          gatewayRunId,
          executionMode: "gateway_runtime",
        });
      }
      await onPhase?.("parsing");
      const intent = extractIntentFromGatewayResponse(response);
      if (intent) {
        return { ok: true, intent };
      }
      return {
        ok: false,
        error: "gateway_runtime_invalid_response",
        raw: summarizeRaw(response),
      };
    } catch (error) {
      if (isAbortError(error, signal)) {
        return { ok: false, error: "run_stopped" };
      }
      return {
        ok: false,
        error: `gateway_runtime_error ${errorMessage(error)}`.trim(),
        raw: summarizeRaw(error?.response || error),
      };
    } finally {
      clearInterval(heartbeatTimer);
    }
  };

  execute.executionMode = "gateway_runtime";
  return execute;
}

function createExecutionAdapter(api, config, deps = {}) {
  if (typeof deps.executeRun === "function") {
    const execute = async (context) => deps.executeRun(context);
    execute.executionMode = deps.executeRun.executionMode || "custom";
    return execute;
  }

  const gatewayExecutor = createGatewayRuntimeExecutor(api, config, deps);
  if (gatewayExecutor) {
    return gatewayExecutor;
  }
  if (config.allowCliFallback) {
    return createCliExecutor(config);
  }
  return createGatewayRequiredExecutor();
}

function normalizeRunResult(result, signal) {
  if (result && typeof result === "object" && typeof result.ok === "boolean") {
    return result;
  }
  if (signal?.aborted) {
    return { ok: false, error: "run_stopped" };
  }
  return { ok: false, error: "invalid_run_result" };
}

function readRunIdFromRequest(request) {
  if (!request || typeof request !== "object") return "";
  return String(
    request.runId
      || request.payload?.runId
      || request.params?.runId
      || request.input?.runId
      || request.args?.runId
      || request.args?.[0]
      || "",
  ).trim();
}

export function normalizeConfig(raw = {}) {
  return {
    linearExpertBaseUrl: trimTrailingSlash(raw.linearExpertBaseUrl),
    internalSecret: String(raw.internalSecret || "").trim(),
    cliBin: String(raw.cliBin || DEFAULTS.cliBin),
    cliArgs: String(raw.cliArgs || DEFAULTS.cliArgs),
    allowCliFallback: raw.allowCliFallback === true,
    pollIntervalMs: toPositiveNumber(raw.pollIntervalMs, DEFAULTS.pollIntervalMs),
    timeoutMs: toPositiveNumber(raw.timeoutMs, DEFAULTS.timeoutMs),
    heartbeatIntervalMs: toPositiveNumber(raw.heartbeatIntervalMs, DEFAULTS.heartbeatIntervalMs),
    lockDurationSeconds: toPositiveNumber(raw.lockDurationSeconds, DEFAULTS.lockDurationSeconds),
    maxRunsPerPoll: toPositiveNumber(raw.maxRunsPerPoll, DEFAULTS.maxRunsPerPoll),
    runOnStartup: raw.runOnStartup !== false,
  };
}

export function resolvePluginConfig(api) {
  const direct = api?.pluginConfig;
  if (direct && typeof direct === "object") {
    return direct;
  }

  const nested = api?.config?.plugins?.entries?.[PLUGIN_ID]?.config;
  if (nested && typeof nested === "object") {
    return nested;
  }

  return {};
}

export function createBridgeState() {
  return {
    running: false,
    startedAt: null,
    lastPollAt: null,
    lastSuccessAt: null,
    lastError: null,
    loopCount: 0,
    processedRuns: 0,
    activeRuns: new Map(),
    runControllers: new Map(),
    tickInFlight: null,
    timer: null,
  };
}

export function snapshotBridgeState(state, config) {
  return {
    pluginId: PLUGIN_ID,
    running: state.running,
    startedAt: state.startedAt,
    lastPollAt: state.lastPollAt,
    lastSuccessAt: state.lastSuccessAt,
    lastError: state.lastError,
    loopCount: state.loopCount,
    processedRuns: state.processedRuns,
    activeRuns: Array.from(state.activeRuns.values()),
    config: {
      linearExpertBaseUrl: config.linearExpertBaseUrl,
      cliBin: config.cliBin,
      cliArgs: config.cliArgs,
      allowCliFallback: config.allowCliFallback,
      pollIntervalMs: config.pollIntervalMs,
      timeoutMs: config.timeoutMs,
      heartbeatIntervalMs: config.heartbeatIntervalMs,
      lockDurationSeconds: config.lockDurationSeconds,
      maxRunsPerPoll: config.maxRunsPerPoll,
    },
  };
}

async function fetchJson(fetchImpl, url, init) {
  const response = await fetchImpl(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`http_${response.status}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : {};
}

export function createLinearExpertClient(config, fetchImpl = fetch) {
  const headers = {
    authorization: `Bearer ${config.internalSecret}`,
    "content-type": "application/json",
  };

  return {
    async listRuns() {
      const url = `${config.linearExpertBaseUrl}/internal/agent-runs?status=pending&limit=${config.maxRunsPerPoll}`;
      const result = await fetchJson(fetchImpl, url, { headers });
      return Array.isArray(result.runs) ? result.runs : [];
    },
    async claimRun(runId) {
      const url = `${config.linearExpertBaseUrl}/internal/agent-runs/${runId}/claim`;
      return fetchJson(fetchImpl, url, {
        method: "POST",
        headers,
        body: JSON.stringify({ lockDurationSeconds: config.lockDurationSeconds }),
      });
    },
    async heartbeatRun(runId, payload) {
      const url = `${config.linearExpertBaseUrl}/internal/agent-runs/${runId}/heartbeat`;
      return fetchJson(fetchImpl, url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
    },
    async submitResult(runId, payload) {
      const url = `${config.linearExpertBaseUrl}/internal/agent-runs/${runId}/result`;
      return fetchJson(fetchImpl, url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
    },
  };
}

export function requestStop(state, runId) {
  const current = state.activeRuns.get(runId);
  if (!current) return false;

  updateActiveRun(state, runId, {
    stopRequested: true,
    phase: "stopping",
    lastHeartbeatAt: nowIso(),
  });

  const controller = state.runControllers.get(runId);
  controller?.abortController?.abort(new Error("run_stopped"));
  controller?.stop?.();
  return true;
}

export async function processClaimedRun(run, config, state, deps = {}) {
  const client = deps.client ?? createLinearExpertClient(config, deps.fetchImpl);
  const execute = deps.executionAdapter ?? createExecutionAdapter(deps.api, config, deps);

  let payload;
  try {
    payload = JSON.parse(run.payloadJson || "{}");
  } catch {
    await client.submitResult(run.id, { ok: false, error: "invalid_payload_json" });
    return;
  }

  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  if (!prompt) {
    await client.submitResult(run.id, { ok: false, error: "missing_prompt" });
    return;
  }

  const startedAt = nowIso();
  const abortController = new AbortController();
  const activeRun = {
    runId: run.id,
    agentSessionId: run.agentSessionId,
    executionMode: execute.executionMode || "unknown",
    phase: "claimed",
    startedAt,
    lastHeartbeatAt: startedAt,
    stopRequested: false,
    gatewayRunId: null,
  };

  state.activeRuns.set(run.id, activeRun);
  state.runControllers.set(run.id, {
    abortController,
    stop() {
      abortController.abort(new Error("run_stopped"));
    },
  });

  const reportHeartbeat = async (patch = {}) => {
    if (typeof client.heartbeatRun !== "function") {
      return null;
    }
    try {
      return await client.heartbeatRun(run.id, patch);
    } catch (error) {
      deps.api?.logger?.warn?.("linear-expert-bridge heartbeat failed", error);
      return null;
    }
  };

  await reportHeartbeat({ phase: "claimed" });

  const heartbeatTimer = setInterval(() => {
    touchActiveRun(state, run.id);
    void reportHeartbeat({
      phase: state.activeRuns.get(run.id)?.phase ?? "processing",
    });
  }, config.heartbeatIntervalMs);

  try {
    const result = await execute({
      run,
      prompt,
      sessionId: run.agentSessionId || null,
      timeoutMs: config.timeoutMs,
      signal: abortController.signal,
      onAccepted: ({ gatewayRunId, executionMode }) => {
        updateActiveRun(state, run.id, {
          gatewayRunId: gatewayRunId || null,
          executionMode: executionMode || activeRun.executionMode,
          phase: "running",
          lastHeartbeatAt: nowIso(),
        });
        return reportHeartbeat({
          phase: "running",
          message: "Agent run accepted",
          gatewayRunId: gatewayRunId || undefined,
        });
      },
      onPhase: (phase) => {
        touchActiveRun(state, run.id, phase);
        return reportHeartbeat({ phase });
      },
      onHeartbeat: (phase) => {
        touchActiveRun(state, run.id, phase);
        return reportHeartbeat({ phase });
      },
    });

    const normalized = normalizeRunResult(result, abortController.signal);
    const finalResult = abortController.signal.aborted ? { ok: false, error: "run_stopped" } : normalized;
    updateActiveRun(state, run.id, {
      phase: finalResult.ok ? "submitting" : (state.activeRuns.get(run.id)?.stopRequested ? "stopped" : "failed"),
      lastHeartbeatAt: nowIso(),
    });
    await client.submitResult(run.id, finalResult);
    state.processedRuns += 1;
    state.lastSuccessAt = nowIso();
  } catch (error) {
    const finalResult = isAbortError(error, abortController.signal)
      ? { ok: false, error: "run_stopped" }
      : { ok: false, error: `bridge_run_failed ${errorMessage(error)}`.trim() };
    updateActiveRun(state, run.id, {
      phase: finalResult.error === "run_stopped" ? "stopped" : "failed",
      lastHeartbeatAt: nowIso(),
    });
    await client.submitResult(run.id, finalResult);
    state.processedRuns += 1;
    state.lastSuccessAt = nowIso();
  } finally {
    clearInterval(heartbeatTimer);
    state.runControllers.delete(run.id);
    state.activeRuns.delete(run.id);
  }
}

export async function pollOnce(config, state, deps = {}) {
  if (!isExecutionRuntimeAvailable(deps.api, config, deps)) {
    throw new Error("gateway_runtime_unavailable");
  }
  const client = deps.client ?? createLinearExpertClient(config, deps.fetchImpl);
  state.lastPollAt = nowIso();
  state.loopCount += 1;
  const runs = await client.listRuns();

  for (const run of runs) {
    const claimed = await client.claimRun(run.id).catch(() => null);
    if (!claimed?.run) continue;
    await processClaimedRun(claimed.run, config, state, {
      ...deps,
      client,
    });
  }
}

function registerGatewayMethod(api, name, handler) {
  if (typeof api.registerGatewayMethod === "function") {
    api.registerGatewayMethod(name, handler);
    return true;
  }
  return false;
}

export function registerBridgePlugin(api, options = {}) {
  const rawConfig = options.config ?? resolvePluginConfig(api);
  const config = normalizeConfig(rawConfig);
  const state = options.state ?? createBridgeState();
  const logger = api?.logger ?? console;

  const tick = async ({ surfaceErrors = false } = {}) => {
    if (state.tickInFlight) {
      return state.tickInFlight;
    }

    state.tickInFlight = (async () => {
      try {
        await pollOnce(config, state, {
          ...(options.deps ?? {}),
          api,
        });
        return { ok: true };
      } catch (error) {
        state.lastError = errorStack(error);
        logger.error?.("linear-expert-bridge poll failed", error);
        if (surfaceErrors) {
          throw error;
        }
        return { ok: false, error };
      } finally {
        state.tickInFlight = null;
      }
    })();

    try {
      return await state.tickInFlight;
    } finally {
    }
  };

  if (typeof api.registerService === "function") {
    api.registerService({
      id: PLUGIN_ID,
      start() {
        state.running = true;
        state.startedAt = nowIso();
        if (config.runOnStartup) {
          void tick({ surfaceErrors: false });
        }
        state.timer = setInterval(() => {
          void tick({ surfaceErrors: false });
        }, config.pollIntervalMs);
      },
      stop() {
        state.running = false;
        if (state.timer) {
          clearInterval(state.timer);
          state.timer = null;
        }
      },
    });
  } else {
    logger.warn?.("linear-expert-bridge: api.registerService unavailable");
  }

  registerGatewayMethod(api, `${PLUGIN_ID}.status`, ({ respond }) => {
    respond(true, snapshotBridgeState(state, config));
  });

  registerGatewayMethod(api, `${PLUGIN_ID}.runOnce`, async ({ respond }) => {
    try {
      await tick({ surfaceErrors: true });
      respond(true, snapshotBridgeState(state, config));
    } catch (error) {
      respond(false, { ok: false, error: errorMessage(error) });
    }
  });

  registerGatewayMethod(api, `${PLUGIN_ID}.stop`, (request = {}) => {
    const runId = readRunIdFromRequest(request);
    if (!runId) {
      request.respond?.(false, { ok: false, error: "missing_run_id" });
      return;
    }

    const stopped = requestStop(state, runId);
    request.respond?.(stopped, stopped
      ? { ok: true, runId, status: "stopping" }
      : { ok: false, error: "run_not_active", runId });
  });

  if (typeof api.registerCli === "function") {
    api.registerCli(({ program }) => {
      const cmd = program.command("linear-expert-bridge");
      cmd.command("status").action(() => {
        console.log(JSON.stringify(snapshotBridgeState(state, config), null, 2));
      });
      cmd.command("run-once").action(async () => {
        await tick({ surfaceErrors: true });
        console.log(JSON.stringify(snapshotBridgeState(state, config), null, 2));
      });
      cmd.command("stop").argument("<runId>").action((runId) => {
        const ok = requestStop(state, String(runId));
        console.log(JSON.stringify({
          ok,
          runId: String(runId),
          status: ok ? "stopping" : "run_not_active",
        }, null, 2));
      });
    }, { commands: ["linear-expert-bridge"] });
  }

  return { config, state, tick };
}
