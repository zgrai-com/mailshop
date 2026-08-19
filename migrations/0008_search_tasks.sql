PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS search_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  source_image_url TEXT,
  source_page TEXT,
  options_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(options_json)),
  result_count INTEGER NOT NULL DEFAULT 0,
  results_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(results_json)),
  error TEXT,
  charged_credits INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT,
  UNIQUE(user_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_search_tasks_user_updated
  ON search_tasks(user_id, updated_at DESC);
