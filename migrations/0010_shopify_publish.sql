ALTER TABLE shopify_stores ADD COLUMN client_id_ciphertext TEXT;
ALTER TABLE shopify_stores ADD COLUMN client_secret_ciphertext TEXT;
ALTER TABLE shopify_stores ADD COLUMN last_verified_at TEXT;
ALTER TABLE shopify_stores ADD COLUMN last_error TEXT;

CREATE TABLE shopify_product_publications (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  shopify_product_id TEXT,
  shopify_handle TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'synced', 'failed')),
  last_error TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (store_id, product_id)
);

CREATE INDEX idx_shopify_product_publications_product
  ON shopify_product_publications(product_id, updated_at DESC);
