import assert from "node:assert/strict";
import { D1Storage } from "../worker/src/storage/d1";

function createFakeDb(options?: { existingColumns?: string[] }) {
  let columns = new Set(options?.existingColumns ?? []);
  let tableExists = columns.size > 0;
  const executed: string[] = [];

  return {
    executed,
    db: {
      prepare(sql: string) {
        executed.push(sql);
        return {
          bind(..._args: unknown[]) {
            return this;
          },
          async run() {
            if (sql.startsWith("CREATE TABLE IF NOT EXISTS agent_runs")) {
              tableExists = true;
              columns = new Set([
                "id",
                "agent_session_id",
                "workspace_id",
                "event_type",
                "trace_id",
                "payload_json",
                "status",
                "created_at",
                "updated_at",
                "lock_expires_at",
                ...columns,
              ]);
            }

            const alterMatch = sql.match(/ALTER TABLE agent_runs ADD COLUMN ([a-z_]+)/i);
            if (alterMatch) {
              columns.add(alterMatch[1]);
            }
            return { success: true };
          },
          async all() {
            if (sql === "PRAGMA table_info(agent_runs)") {
              return {
                results: Array.from(columns).map((name) => ({ name })),
              };
            }
            if (sql.includes("SELECT * FROM agent_runs WHERE status = ?")) {
              assert.equal(tableExists, true);
              return { results: [] };
            }
            if (sql.includes("UPDATE agent_runs SET")) {
              assert.equal(tableExists, true);
              return { results: [] };
            }
            return { results: [] };
          },
          async first() {
            return null;
          },
        };
      },
    } as unknown as D1Database,
  };
}

async function run() {
  {
    const fake = createFakeDb();
    const storage = new D1Storage(fake.db);
    const runs = await storage.agentRuns.listByStatus({ status: "pending", limit: 5 });
    assert.deepEqual(runs, []);
    assert.ok(fake.executed.some((sql) => sql.startsWith("CREATE TABLE IF NOT EXISTS agent_runs")));
    assert.ok(fake.executed.some((sql) => sql.includes("ADD COLUMN last_heartbeat_at")));
    assert.ok(fake.executed.some((sql) => sql.includes("ADD COLUMN progress_phase")));
    assert.ok(fake.executed.some((sql) => sql.includes("ADD COLUMN progress_message")));
    assert.ok(fake.executed.some((sql) => sql.includes("ADD COLUMN progress_percent")));
    assert.ok(fake.executed.some((sql) => sql.includes("ADD COLUMN gateway_run_id")));
  }

  {
    const fake = createFakeDb({
      existingColumns: [
        "id",
        "agent_session_id",
        "workspace_id",
        "event_type",
        "trace_id",
        "payload_json",
        "status",
        "created_at",
        "updated_at",
        "lock_expires_at",
      ],
    });
    const storage = new D1Storage(fake.db);
    const updated = await storage.agentRuns.updateHeartbeat("run_1", {
      phase: "running",
      message: "Dispatching",
      percent: 20,
    });
    assert.equal(updated, null);
    assert.ok(fake.executed.some((sql) => sql.includes("ADD COLUMN last_heartbeat_at")));
    assert.ok(fake.executed.some((sql) => sql.includes("ADD COLUMN progress_phase")));
  }

  console.log("d1.agent-runs.bootstrap.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
