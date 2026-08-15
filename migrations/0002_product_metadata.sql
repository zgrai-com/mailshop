ALTER TABLE products ADD COLUMN spu TEXT;
ALTER TABLE products ADD COLUMN published_at TEXT;
ALTER TABLE products ADD COLUMN inventory_quantity INTEGER;
ALTER TABLE products ADD COLUMN attributes_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attributes_json));
ALTER TABLE products ADD COLUMN categories_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(categories_json));
ALTER TABLE products ADD COLUMN content_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(content_json));

CREATE INDEX idx_products_spu ON products(spu COLLATE NOCASE);

ALTER TABLE product_variants ADD COLUMN image_url TEXT;
ALTER TABLE product_variants ADD COLUMN grams REAL;
ALTER TABLE product_variants ADD COLUMN remaining_inventory INTEGER;
ALTER TABLE product_variants ADD COLUMN options_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(options_json));

CREATE TABLE product_media (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('video', 'image', 'document', 'other')),
  url TEXT,
  poster_url TEXT,
  title TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  content_type TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (product_id, external_id)
);

CREATE INDEX idx_product_media_product ON product_media(product_id, position);
