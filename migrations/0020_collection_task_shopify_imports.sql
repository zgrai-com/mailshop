PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS collection_task_imports (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES search_tasks(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES search_task_runs(id) ON DELETE SET NULL,
  offer_id TEXT NOT NULL,
  shopify_store_id TEXT NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  shopify_product_id TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(task_id, offer_id, shopify_store_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_task_imports_task
  ON collection_task_imports(task_id, imported_at DESC);
