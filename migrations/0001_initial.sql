PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 210000,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_login_at TEXT
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE login_attempts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE,
  ip_address TEXT NOT NULL,
  succeeded INTEGER NOT NULL CHECK (succeeded IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_login_attempts_lookup
  ON login_attempts(username, ip_address, created_at);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  source_platform TEXT NOT NULL DEFAULT 'shopify'
    CHECK (source_platform IN ('shopify', 'manual', 'other')),
  source_store TEXT NOT NULL DEFAULT '',
  external_id TEXT NOT NULL,
  source_url TEXT,
  shop_domain TEXT,
  handle TEXT,
  title TEXT NOT NULL,
  vendor TEXT,
  product_type TEXT,
  description_html TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'image_searching', 'matched', 'reviewed', 'archived')),
  sync_state TEXT NOT NULL DEFAULT 'not_synced'
    CHECK (sync_state IN ('not_synced', 'pending', 'synced', 'failed')),
  price_min REAL,
  price_max REAL,
  compare_at_price REAL,
  cost_min REAL,
  cost_max REAL,
  tags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json)),
  options_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(options_json)),
  raw_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(raw_json)),
  notes TEXT,
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (source_platform, source_store, external_id)
);

CREATE INDEX idx_products_status_updated ON products(status, updated_at DESC);
CREATE INDEX idx_products_source ON products(source_platform, source_store);
CREATE INDEX idx_products_title ON products(title COLLATE NOCASE);
CREATE INDEX idx_products_assigned_to ON products(assigned_to);

CREATE TABLE product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  title TEXT,
  option1 TEXT,
  option2 TEXT,
  option3 TEXT,
  price REAL,
  compare_at_price REAL,
  cost REAL,
  inventory_quantity INTEGER,
  weight REAL,
  weight_unit TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(raw_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (product_id, external_id)
);

CREATE INDEX idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX idx_product_variants_sku ON product_variants(sku COLLATE NOCASE);

CREATE TABLE product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  url TEXT,
  r2_key TEXT,
  alt_text TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  content_type TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (product_id, external_id)
);

CREATE INDEX idx_product_images_product_id ON product_images(product_id, position);
CREATE INDEX idx_product_images_r2_key ON product_images(r2_key);

CREATE TABLE offers_1688 (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL UNIQUE,
  url TEXT,
  title TEXT NOT NULL,
  supplier_id TEXT,
  supplier_name TEXT,
  price_min REAL,
  price_max REAL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  min_order_quantity REAL,
  unit TEXT,
  province TEXT,
  city TEXT,
  source_url TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(raw_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_offers_1688_supplier ON offers_1688(supplier_name COLLATE NOCASE);
CREATE INDEX idx_offers_1688_title ON offers_1688(title COLLATE NOCASE);

CREATE TABLE offer_variants (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES offers_1688(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  sku TEXT,
  name TEXT,
  attributes_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attributes_json)),
  price REAL,
  stock INTEGER,
  raw_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(raw_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (offer_id, external_id)
);

CREATE INDEX idx_offer_variants_offer_id ON offer_variants(offer_id);

CREATE TABLE offer_images (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES offers_1688(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  url TEXT,
  r2_key TEXT,
  alt_text TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  content_type TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (offer_id, external_id)
);

CREATE INDEX idx_offer_images_offer_id ON offer_images(offer_id, position);

CREATE TABLE product_offer_links (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL REFERENCES offers_1688(id) ON DELETE CASCADE,
  match_status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (match_status IN ('candidate', 'selected', 'rejected')),
  match_score REAL CHECK (match_score IS NULL OR (match_score >= 0 AND match_score <= 1)),
  notes TEXT,
  variant_map_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(variant_map_json)),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (product_id, offer_id)
);

CREATE INDEX idx_product_offer_links_product ON product_offer_links(product_id, match_status);
CREATE INDEX idx_product_offer_links_offer ON product_offer_links(offer_id);

CREATE TABLE shopify_stores (
  id TEXT PRIMARY KEY,
  shop_domain TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'installing', 'active', 'disabled', 'error')),
  api_version TEXT,
  scopes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(scopes_json)),
  installed_at TEXT,
  last_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(detail_json)),
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
