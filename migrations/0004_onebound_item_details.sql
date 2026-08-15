PRAGMA foreign_keys = ON;

ALTER TABLE offers_1688 ADD COLUMN short_description TEXT;
ALTER TABLE offers_1688 ADD COLUMN total_price REAL;
ALTER TABLE offers_1688 ADD COLUMN suggested_price REAL;
ALTER TABLE offers_1688 ADD COLUMN original_price REAL;
ALTER TABLE offers_1688 ADD COLUMN stock_quantity INTEGER;
ALTER TABLE offers_1688 ADD COLUMN sold_quantity INTEGER;
ALTER TABLE offers_1688 ADD COLUMN brand TEXT;
ALTER TABLE offers_1688 ADD COLUMN brand_id TEXT;
ALTER TABLE offers_1688 ADD COLUMN root_category_id TEXT;
ALTER TABLE offers_1688 ADD COLUMN category_id TEXT;
ALTER TABLE offers_1688 ADD COLUMN seller_nick TEXT;
ALTER TABLE offers_1688 ADD COLUMN location TEXT;
ALTER TABLE offers_1688 ADD COLUMN item_weight TEXT;
ALTER TABLE offers_1688 ADD COLUMN item_size TEXT;
ALTER TABLE offers_1688 ADD COLUMN shop_id TEXT;
ALTER TABLE offers_1688 ADD COLUMN description_html TEXT;
ALTER TABLE offers_1688 ADD COLUMN video_url TEXT;
ALTER TABLE offers_1688 ADD COLUMN sample_id TEXT;
ALTER TABLE offers_1688 ADD COLUMN shipping_to TEXT;
ALTER TABLE offers_1688 ADD COLUMN has_discount INTEGER;
ALTER TABLE offers_1688 ADD COLUMN is_promotion INTEGER;
ALTER TABLE offers_1688 ADD COLUMN fetched_at TEXT;

CREATE TABLE suppliers_1688 (
  id TEXT PRIMARY KEY,
  supplier_key TEXT NOT NULL UNIQUE,
  supplier_id TEXT,
  shop_id TEXT,
  nick TEXT,
  shop_name TEXT,
  sid TEXT,
  title TEXT,
  profile_url TEXT,
  location TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(raw_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_suppliers_1688_supplier_id ON suppliers_1688(supplier_id);
CREATE INDEX idx_suppliers_1688_shop_id ON suppliers_1688(shop_id);

CREATE TABLE offer_price_tiers (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES offers_1688(id) ON DELETE CASCADE,
  min_quantity REAL,
  price REAL,
  original_price REAL,
  position INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(raw_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (offer_id, position)
);

CREATE INDEX idx_offer_price_tiers_offer ON offer_price_tiers(offer_id, position);

CREATE TABLE offer_properties (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES offers_1688(id) ON DELETE CASCADE,
  property_id TEXT,
  value_id TEXT,
  name TEXT NOT NULL,
  value_text TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(raw_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (offer_id, position)
);

CREATE INDEX idx_offer_properties_offer ON offer_properties(offer_id, position);

CREATE TABLE offer_property_images (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES offers_1688(id) ON DELETE CASCADE,
  properties_key TEXT,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(raw_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (offer_id, position)
);

CREATE INDEX idx_offer_property_images_offer ON offer_property_images(offer_id, position);

CREATE TABLE offer_description_images (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES offers_1688(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(raw_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (offer_id, position)
);

CREATE INDEX idx_offer_description_images_offer ON offer_description_images(offer_id, position);

CREATE TABLE offer_videos (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES offers_1688(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  poster_url TEXT,
  title TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(raw_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (offer_id, position)
);

CREATE INDEX idx_offer_videos_offer ON offer_videos(offer_id, position);

CREATE TABLE offer_api_snapshots (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES offers_1688(id) ON DELETE CASCADE,
  api_name TEXT NOT NULL,
  request_num_iid TEXT NOT NULL,
  error_code TEXT,
  reason TEXT,
  upstream_request_id TEXT,
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_offer_api_snapshots_offer ON offer_api_snapshots(offer_id, fetched_at DESC);
