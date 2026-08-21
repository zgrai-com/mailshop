ALTER TABLE shopify_stores ADD COLUMN owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

UPDATE shopify_stores
   SET owner_user_id = (
     SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1
   )
 WHERE owner_user_id IS NULL;

CREATE INDEX idx_shopify_stores_owner
  ON shopify_stores(owner_user_id, updated_at DESC);
