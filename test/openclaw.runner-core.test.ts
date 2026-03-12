import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { buildCommandArgs, parseCliJsonOutput, runOpenClaw } from "../openclaw/runner/runner-core.mjs";

class FakeStream extends EventEmitter {}

class FakeChildProcess extends EventEmitter {
  constructor() {
    super();
    this.stdout = new FakeStream();
    this.stderr = new FakeStream();
    this.killedWith = null;
  }

  kill(signal) {
    this.killedWith = signal;
  }
}

async function run() {
  {
    const args = buildCommandArgs("hello world", "session_1", "agent --message", 120000);
    assert.equal(args[0], "agent");
    assert.ok(args.includes("--json"));
    assert.equal(args[args.indexOf("--message") + 1], "hello world");
    assert.equal(args[args.indexOf("--timeout") + 1], "120s");
    assert.equal(args[args.indexOf("--session-id") + 1], "session_1");
  }

  {
    const payload = parseCliJsonOutput(JSON.stringify({
      response: "{\"actions\":[{\"kind\":\"noop\"}]}",
      metadata: { model: "test" },
    })) as { actions?: Array<{ kind: string }> };
    assert.ok(payload);
    assert.equal(payload.actions?.[0]?.kind, "noop");
  }

  {
    const spawnError = new Error("not found");
    // @ts-expect-error test-only field
    spawnError.code = "ENOENT";
    const result = await runOpenClaw("hello", "session_2", {
      cliBin: "missing-openclaw",
      cliArgs: "agent --json --message",
      timeoutMs: 1000,
      spawnImpl() {
        const child = new FakeChildProcess();
        queueMicrotask(() => {
          child.emit("error", spawnError);
        });
        return child;
      },
    });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /openclaw_spawn_error ENOENT/);
  }

  {
    const result = await runOpenClaw("hello", "session_3", {
      cliBin: "openclaw",
      cliArgs: "agent --json --message",
      timeoutMs: 1000,
      spawnImpl() {
        const child = new FakeChildProcess();
        queueMicrotask(() => {
          child.stdout.emit("data", Buffer.from(JSON.stringify({
            response: "{\"actions\":[{\"kind\":\"comment\",\"body\":\"ok\"}]}",
          })));
          child.emit("close", 0);
        });
        return child;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.intent?.actions?.[0]?.kind, "comment");
  }

  {
    const controller = new AbortController();
    let childRef = null;
    const resultPromise = runOpenClaw("hello", "session_4", {
      cliBin: "openclaw",
      cliArgs: "agent --json --message",
      timeoutMs: 1000,
      signal: controller.signal,
      spawnImpl() {
        childRef = new FakeChildProcess();
        return childRef;
      },
    });
    controller.abort();
    const result = await resultPromise;
    assert.equal(result.ok, false);
    assert.equal(result.error, "run_stopped");
    assert.equal(childRef?.killedWith, "SIGKILL");
  }

  console.log("openclaw.runner-core.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
