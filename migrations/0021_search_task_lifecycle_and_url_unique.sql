PRAGMA foreign_keys = ON;

ALTER TABLE search_tasks ADD COLUMN product_url_key TEXT;
ALTER TABLE search_tasks ADD COLUMN archived_at TEXT;
ALTER TABLE search_tasks ADD COLUMN deleted_at TEXT;

UPDATE search_tasks
   SET product_url_key = lower(trim(product_url))
 WHERE product_url IS NOT NULL AND trim(product_url) <> '';

-- Keep the newest legacy task indexed when old client_id-based imports contain
-- the same URL more than once. Older rows stay in the database but their keys
-- are cleared so the unique index can be created safely.
UPDATE search_tasks AS duplicate
   SET product_url_key = NULL
 WHERE duplicate.product_url_key IS NOT NULL
   AND EXISTS (
     SELECT 1
       FROM search_tasks AS keeper
      WHERE keeper.user_id = duplicate.user_id
        AND keeper.product_url_key = duplicate.product_url_key
        AND (
          keeper.updated_at > duplicate.updated_at
          OR (keeper.updated_at = duplicate.updated_at AND keeper.created_at > duplicate.created_at)
          OR (keeper.updated_at = duplicate.updated_at AND keeper.created_at = duplicate.created_at AND keeper.id > duplicate.id)
        )
   );

CREATE UNIQUE INDEX IF NOT EXISTS idx_search_tasks_user_product_url_key
  ON search_tasks(user_id, product_url_key)
 WHERE product_url_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_search_tasks_user_lifecycle
  ON search_tasks(user_id, deleted_at, archived_at, updated_at DESC);
