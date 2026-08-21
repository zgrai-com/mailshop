ALTER TABLE products ADD COLUMN catalog_source TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE products ADD COLUMN offer_id_1688 TEXT;
ALTER TABLE products ADD COLUMN supplier_id_1688 TEXT;
ALTER TABLE products ADD COLUMN supplier_name_1688 TEXT;
ALTER TABLE products ADD COLUMN min_order_quantity_1688 REAL;
ALTER TABLE products ADD COLUMN unit_1688 TEXT;
ALTER TABLE products ADD COLUMN province_1688 TEXT;
ALTER TABLE products ADD COLUMN city_1688 TEXT;
ALTER TABLE products ADD COLUMN short_description_1688 TEXT;
ALTER TABLE products ADD COLUMN total_price_1688 REAL;
ALTER TABLE products ADD COLUMN suggested_price_1688 REAL;
ALTER TABLE products ADD COLUMN original_price_1688 REAL;
ALTER TABLE products ADD COLUMN stock_quantity_1688 INTEGER;
ALTER TABLE products ADD COLUMN sold_quantity_1688 INTEGER;
ALTER TABLE products ADD COLUMN brand_1688 TEXT;
ALTER TABLE products ADD COLUMN brand_id_1688 TEXT;
ALTER TABLE products ADD COLUMN root_category_id_1688 TEXT;
ALTER TABLE products ADD COLUMN category_id_1688 TEXT;
ALTER TABLE products ADD COLUMN seller_nick_1688 TEXT;
ALTER TABLE products ADD COLUMN location_1688 TEXT;
ALTER TABLE products ADD COLUMN item_weight_1688 TEXT;
ALTER TABLE products ADD COLUMN item_size_1688 TEXT;
ALTER TABLE products ADD COLUMN shop_id_1688 TEXT;
ALTER TABLE products ADD COLUMN video_url_1688 TEXT;
ALTER TABLE products ADD COLUMN sample_id_1688 TEXT;
ALTER TABLE products ADD COLUMN shipping_to_1688 TEXT;
ALTER TABLE products ADD COLUMN has_discount_1688 INTEGER;
ALTER TABLE products ADD COLUMN is_promotion_1688 INTEGER;
ALTER TABLE products ADD COLUMN fetched_at_1688 TEXT;

CREATE UNIQUE INDEX idx_products_offer_id_1688
  ON products(offer_id_1688)
  WHERE offer_id_1688 IS NOT NULL;

CREATE INDEX idx_products_catalog_source_updated
  ON products(catalog_source, updated_at DESC);
