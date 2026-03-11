-- D1 bootstrap schema for linear-expert (v0)

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  webhook_id TEXT,
  workspace_id TEXT,
  organization_id TEXT,
  issue_id TEXT,
  issue_identifier TEXT,
  comment_id TEXT,
  actor_id TEXT,
  actor_name TEXT,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  lock_expires_at TEXT
);

CREATE TABLE IF NOT EXISTS replies (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  issue_id TEXT,
  comment_id TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  workspace_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT,
  scopes TEXT,
  actor_mode TEXT NOT NULL DEFAULT 'app',
  raw_json TEXT
);

-- WS-37: trace correlation for invocation pipeline
CREATE TABLE IF NOT EXISTS invocation_traces (
  trace_id TEXT PRIMARY KEY,
  agent_session_id TEXT,
  workspace_id TEXT,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
