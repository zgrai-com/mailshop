PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ai_request_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  operation TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  http_status INTEGER,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  model_id TEXT,
  request_summary_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(request_summary_json)),
  response_summary_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(response_summary_json)),
  error_message TEXT,
  entity_type TEXT,
  entity_id TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_request_logs_user_created ON ai_request_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_request_logs_created ON ai_request_logs(created_at DESC);
