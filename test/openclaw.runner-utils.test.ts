import assert from "node:assert/strict";
import { extractFirstJson, splitArgs } from "../openclaw/runner/runner-utils.mjs";

function run() {
  const text = "log: start\\n{\"actions\":[{\"kind\":\"noop\"}]}\\nlog: end";
  const parsed = extractFirstJson(text) as { actions?: Array<{ kind: string }> };
  assert.ok(parsed);
  assert.equal(parsed.actions?.[0]?.kind, "noop");

  const withBraceInString = "log\\n{\"body\":\"x { y\"}\\n";
  const parsedWithBrace = extractFirstJson(withBraceInString) as { body?: string };
  assert.ok(parsedWithBrace);
  assert.equal(parsedWithBrace.body, "x { y");

  const args = splitArgs("agent --local --message \"hello world\"");
  assert.deepEqual(args, ["agent", "--local", "--message", "hello world"]);

  console.log("openclaw.runner-utils.test passed");
}

run();
