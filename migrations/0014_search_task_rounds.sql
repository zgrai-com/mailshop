PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS search_task_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES search_tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  options_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(options_json)),
  page INTEGER NOT NULL DEFAULT 1,
  page_size INTEGER NOT NULL DEFAULT 30,
  uploaded_image_id TEXT,
  result_count INTEGER NOT NULL DEFAULT 0,
  total_result_count INTEGER,
  results_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(results_json)),
  error TEXT,
  charged_credits INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_search_task_runs_task_created
  ON search_task_runs(task_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_search_task_runs_one_active
  ON search_task_runs(task_id) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS search_task_imports (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES search_tasks(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES search_task_runs(id) ON DELETE SET NULL,
  offer_id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(task_id, offer_id)
);

CREATE INDEX IF NOT EXISTS idx_search_task_imports_task
  ON search_task_imports(task_id, imported_at DESC);

INSERT INTO search_task_runs (
  id, task_id, user_id, image_id, image_url, status, options_json, page, page_size,
  result_count, total_result_count, results_json, error, charged_credits, created_at, completed_at
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) ||
  '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
  id,
  user_id,
  COALESCE(selected_image_id, 'legacy'),
  COALESCE(selected_image_url, source_image_url, ''),
  CASE WHEN status = 'failed' THEN 'failed' ELSE 'completed' END,
  options_json,
  1,
  COALESCE(json_extract(options_json, '$.limit'), 30),
  result_count,
  result_count,
  results_json,
  error,
  charged_credits,
  created_at,
  COALESCE(completed_at, updated_at)
FROM search_tasks
WHERE status IN ('completed', 'failed')
  AND NOT EXISTS (SELECT 1 FROM search_task_runs WHERE search_task_runs.task_id = search_tasks.id);
