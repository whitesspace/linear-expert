import assert from "node:assert/strict";
import { mkdtemp, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import {
  createBridgeState,
  createLinearExpertClient,
  normalizeConfig,
  pollOnce,
  processClaimedRun,
  registerBridgePlugin,
  requestStop,
  snapshotBridgeState,
} from "../openclaw/plugins/linear-expert-bridge/plugin-core.mjs";

function buildConfig() {
  return normalizeConfig({
    linearExpertBaseUrl: "https://linear-expert.example.com/",
    internalSecret: "secret",
    pollIntervalMs: 2500,
    timeoutMs: 120000,
    lockDurationSeconds: 900,
    maxRunsPerPoll: 3,
  });
}

async function run() {
  {
    const installRoot = await mkdtemp(path.join(tmpdir(), "linear-expert-bridge-plugin-"));
    const sourceDir = path.resolve(process.cwd(), "openclaw/plugins/linear-expert-bridge");
    const targetDir = path.join(installRoot, "linear-expert-bridge");
    await cp(sourceDir, targetDir, { recursive: true });
    const installedModule = await import(pathToFileURL(path.join(targetDir, "index.mjs")).href);
    assert.equal(installedModule.id, "linear-expert-bridge");
    assert.equal(typeof installedModule.default, "function");
  }

  {
    const config = buildConfig();
    assert.equal(config.linearExpertBaseUrl, "https://linear-expert.example.com");
    assert.equal(config.cliArgs, "agent --json --message");
    assert.equal(config.allowCliFallback, false);
    assert.equal(config.maxRunsPerPoll, 3);
    assert.equal(config.heartbeatIntervalMs, 10000);
  }

  {
    const state = createBridgeState();
    let listed = false;
    await assert.rejects(() => pollOnce(buildConfig(), state, {
      api: {
        logger: {
          warn() {},
        },
      },
      client: {
        listRuns: async () => {
          listed = true;
          return [];
        },
      },
    }), /gateway_runtime_unavailable/);
    assert.equal(listed, false);
  }

  {
    const requests = [];
    const gatewayCalls = [];
    const client = createLinearExpertClient(buildConfig(), async (url, init = {}) => {
      requests.push({ url: String(url), init });
      if (String(url).includes("/internal/agent-runs?")) {
        return new Response(JSON.stringify({ runs: [{ id: "run_1" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (String(url).includes("/claim")) {
        return new Response(JSON.stringify({
          run: {
            id: "run_1",
            agentSessionId: "as_1",
            payloadJson: JSON.stringify({ prompt: "hello" }),
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (String(url).includes("/result")) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (String(url).includes("/heartbeat")) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const state = createBridgeState();
    await pollOnce(buildConfig(), state, {
      client,
      gatewayCall: async (method, params, options = {}) => {
        gatewayCalls.push({ method, params, options });
        return {
          reply: "{\"actions\":[{\"kind\":\"noop\"}]}",
          runId: "gw_run_1",
        };
      },
    });
    assert.equal(state.processedRuns, 1);
    const agentCall = gatewayCalls.find((call) => call.method === "agent");
    assert.ok(agentCall);
    assert.equal(agentCall?.params.message, "hello");
    assert.equal(agentCall?.params.sessionId, "as_1");
    assert.equal(agentCall?.options.expectFinal, true);
    assert.ok(requests.some((item) => item.url.includes("/internal/agent-runs/run_1/result")));
    assert.ok(requests.some((item) => item.url.includes("/internal/agent-runs/run_1/heartbeat")));
  }

  {
    const submitted = [];
    const state = createBridgeState();
    await processClaimedRun({
      id: "run_cli_fallback",
      agentSessionId: "as_cli",
      payloadJson: JSON.stringify({ prompt: "hello" }),
    }, normalizeConfig({
      ...buildConfig(),
      allowCliFallback: true,
    }), state, {
      client: {
        heartbeatRun: async () => ({ ok: true }),
        submitResult: async (runId, payload) => {
          submitted.push({ runId, payload });
          return { ok: true };
        },
      },
      executeRun: Object.assign(
        async () => ({ ok: true, intent: { actions: [{ kind: "noop" }] } }),
        { executionMode: "cli_fallback" },
      ),
    });

    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].payload.ok, true);
  }

  {
    const submitted = [];
    const state = createBridgeState();
    const run = {
      id: "run_stop",
      agentSessionId: "as_stop",
      payloadJson: JSON.stringify({ prompt: "please stop" }),
    };

    const processing = processClaimedRun(run, buildConfig(), state, {
      client: {
        heartbeatRun: async () => ({ ok: true }),
        submitResult: async (runId, payload) => {
          submitted.push({ runId, payload });
          return { ok: true };
        },
      },
      executeRun: async ({ signal, onPhase, onHeartbeat }) => {
        onPhase?.("running");
        await delay(5);
        onHeartbeat?.("running");
        await new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
      },
    });

    await delay(20);
    assert.equal(requestStop(state, "run_stop"), true);
    await processing;
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].runId, "run_stop");
    assert.equal(submitted[0].payload.ok, false);
    assert.match(String(submitted[0].payload.error), /stopped|aborted/);
    assert.equal(state.activeRuns.size, 0);
  }

  {
    const apiCalls = {
      services: [],
      methods: [],
      clis: [],
    };
    const api = {
      pluginConfig: buildConfig(),
      logger: {
        warn() {},
        error() {},
      },
      registerService(service) {
        apiCalls.services.push(service);
      },
      registerGatewayMethod(name, handler) {
        apiCalls.methods.push({ name, handler });
      },
      registerCli(factory, meta) {
        apiCalls.clis.push({ factory, meta });
      },
    };

    const { config, state } = registerBridgePlugin(api, {
      deps: {
        client: {
          listRuns: async () => [],
          claimRun: async () => null,
          submitResult: async () => ({}),
        },
        executeRun: async () => ({ ok: true, intent: { actions: [{ kind: "noop" }] } }),
      },
    });

    assert.equal(config.linearExpertBaseUrl, "https://linear-expert.example.com");
    assert.equal(apiCalls.services.length, 1);
    assert.equal(apiCalls.methods.map((item) => item.name).sort().join(","), "linear-expert-bridge.runOnce,linear-expert-bridge.status,linear-expert-bridge.stop");
    assert.equal(apiCalls.clis.length, 1);

    const snapshot = snapshotBridgeState(state, config);
    assert.equal(snapshot.pluginId, "linear-expert-bridge");
    assert.equal(snapshot.config.allowCliFallback, false);
    assert.equal(snapshot.config.heartbeatIntervalMs, 10000);
  }

  {
    const logged = [];
    const apiCalls = {
      services: [],
    };
    const api = {
      pluginConfig: normalizeConfig({
        ...buildConfig(),
        allowCliFallback: true,
      }),
      logger: {
        warn() {},
        error(...args) {
          logged.push(args.map(String).join(" "));
        },
      },
      registerService(service) {
        apiCalls.services.push(service);
      },
      registerGatewayMethod() {},
      registerCli() {},
    };

    const { state } = registerBridgePlugin(api, {
      deps: {
        client: {
          listRuns: async () => {
            throw new Error("boom");
          },
          claimRun: async () => null,
          submitResult: async () => ({}),
        },
      },
    });

    assert.equal(apiCalls.services.length, 1);
    apiCalls.services[0].start();
    await delay(20);
    apiCalls.services[0].stop();
    assert.match(String(state.lastError), /boom/);
    assert.ok(logged.some((line) => line.includes("linear-expert-bridge poll failed")));
  }

  console.log("openclaw.linear-expert-bridge.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
