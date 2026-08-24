CREATE TABLE IF NOT EXISTS shopify_image_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  image_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('translate', 'edit')),
  locale TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('queued', 'waiting', 'failed')),
  prompt TEXT,
  result_url TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_shopify_image_jobs_product
  ON shopify_image_jobs(user_id, store_id, product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shopify_image_jobs_status
  ON shopify_image_jobs(user_id, status, updated_at DESC);
