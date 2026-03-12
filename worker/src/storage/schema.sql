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

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  agent_session_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  lock_expires_at TEXT
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

-- Agent Sessions (持久化会话元数据)
CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  issue_id TEXT,
  issue_identifier TEXT,
  issue_title TEXT,
  issue_url TEXT,
  first_activity_at TEXT,
  last_activity_at TEXT,
  activity_count INTEGER DEFAULT 0,
  status TEXT,
  context_summary TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Agent Session Contexts (会话上下文片段，用于恢复详细上下文)
CREATE TABLE IF NOT EXISTS agent_session_contexts (
  id TEXT PRIMARY KEY,
  agent_session_id TEXT NOT NULL,
  activity_type TEXT,
  activity_content TEXT,
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
);

-- Indexes for queries
CREATE INDEX IF NOT EXISTS idx_agent_sessions_workspace_id ON agent_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_issue_id ON agent_sessions(issue_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_last_activity_at ON agent_sessions(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_agent_session_contexts_session_id ON agent_session_contexts(agent_session_id);
CREATE INDEX IF NOT EXISTS idx_agent_session_contexts_timestamp ON agent_session_contexts(timestamp);
