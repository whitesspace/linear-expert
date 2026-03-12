import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function run() {
  const schema = readFileSync(new URL("../worker/src/storage/schema.sql", import.meta.url), "utf8");

  assert.match(schema, /webhook_id\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);

  console.log("storage.schema.test passed");
}

run();
