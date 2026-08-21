PRAGMA foreign_keys = ON;

ALTER TABLE search_tasks ADD COLUMN product_title TEXT;
ALTER TABLE search_tasks ADD COLUMN description TEXT;
ALTER TABLE search_tasks ADD COLUMN sku TEXT;
ALTER TABLE search_tasks ADD COLUMN source_site TEXT;
ALTER TABLE search_tasks ADD COLUMN product_url TEXT;
ALTER TABLE search_tasks ADD COLUMN images_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(images_json));
ALTER TABLE search_tasks ADD COLUMN selected_image_id TEXT;
ALTER TABLE search_tasks ADD COLUMN selected_image_url TEXT;

CREATE INDEX IF NOT EXISTS idx_search_tasks_user_product_title
  ON search_tasks(user_id, product_title);
