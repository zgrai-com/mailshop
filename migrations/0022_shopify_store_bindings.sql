CREATE TABLE IF NOT EXISTS shopify_store_bindings (
  store_id TEXT NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id_ciphertext TEXT,
  client_secret_ciphertext TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (store_id, user_id)
);

INSERT OR IGNORE INTO shopify_store_bindings
  (store_id, user_id, client_id_ciphertext, client_secret_ciphertext)
SELECT id, owner_user_id, client_id_ciphertext, client_secret_ciphertext
  FROM shopify_stores
 WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shopify_store_bindings_user
  ON shopify_store_bindings(user_id, updated_at DESC);
