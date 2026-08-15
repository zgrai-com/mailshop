import { ApiError, clientIp } from "./http";
import type { OfferLinkInput, ProductInput, ProductListQuery, ProductPatch } from "./validation";

type JsonRow = Record<string, unknown>;

export type OneBoundOfferDetailData = {
  main: {
    shortDescription: string | null;
    totalPrice: number | null;
    suggestedPrice: number | null;
    originalPrice: number | null;
    stockQuantity: number | null;
    soldQuantity: number | null;
    brand: string | null;
    brandId: string | null;
    rootCategoryId: string | null;
    categoryId: string | null;
    sellerNick: string | null;
    location: string | null;
    itemWeight: string | null;
    itemSize: string | null;
    shopId: string | null;
    descriptionHtml: string | null;
    videoUrl: string | null;
    sampleId: string | null;
    shippingTo: string | null;
    hasDiscount: number | null;
    isPromotion: number | null;
  };
  supplier: {
    supplierKey: string;
    supplierId: string | null;
    shopId: string | null;
    nick: string | null;
    shopName: string | null;
    sid: string | null;
    title: string | null;
    profileUrl: string | null;
    location: string | null;
    raw: unknown;
  } | null;
  priceTiers: Array<{
    minQuantity: number | null;
    price: number | null;
    originalPrice: number | null;
    raw: unknown;
  }>;
  properties: Array<{
    propertyId: string | null;
    valueId: string | null;
    name: string;
    value: string;
    raw: unknown;
  }>;
  propertyImages: Array<{ propertiesKey: string | null; url: string; raw: unknown }>;
  descriptionImages: Array<{ url: string; raw: unknown }>;
  videos: Array<{ url: string; posterUrl: string | null; title: string | null; raw: unknown }>;
  snapshot: {
    apiName: string;
    requestNumIid: string;
    errorCode: string | null;
    reason: string | null;
    upstreamRequestId: string | null;
    response: unknown;
  };
};

function nullable(value: unknown): unknown {
  return value === undefined || value === "" ? null : value;
}

function jsonText(value: unknown, fallback: unknown): string {
  return JSON.stringify(value === undefined ? fallback : value);
}

function parseJsonValue(value: unknown, fallback: unknown): unknown {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

function hydrateJson(row: JsonRow, fields: Array<[string, unknown]>): JsonRow {
  const hydrated = { ...row };
  for (const [field, fallback] of fields) {
    hydrated[field] = parseJsonValue(hydrated[field], fallback);
  }
  return hydrated;
}

export async function recordAudit(
  request: Request,
  env: Env,
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  detail: unknown = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, detail_json, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      userId,
      action,
      entityType,
      entityId,
      jsonText(detail, {}),
      clientIp(request),
    )
    .run();
}

function productVariantStatements(env: Env, productId: string, input: ProductInput): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [
    env.DB.prepare("DELETE FROM product_variants WHERE product_id = ?").bind(productId),
  ];

  input.variants.forEach((variant, index) => {
    statements.push(
      env.DB.prepare(
        `INSERT INTO product_variants
          (id, product_id, external_id, sku, barcode, title, option1, option2, option3,
           price, compare_at_price, cost, inventory_quantity, weight, weight_unit, image_url,
           grams, remaining_inventory, options_json, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        productId,
        nullable(variant.externalId) ?? `variant-${index + 1}`,
        nullable(variant.sku),
        nullable(variant.barcode),
        nullable(variant.title),
        nullable(variant.option1),
        nullable(variant.option2),
        nullable(variant.option3),
        nullable(variant.price),
        nullable(variant.compareAtPrice),
        nullable(variant.cost),
        nullable(variant.inventoryQuantity),
        nullable(variant.weight),
        nullable(variant.weightUnit),
        nullable(variant.imageUrl),
        nullable(variant.grams),
        nullable(variant.remainingInventory),
        jsonText(variant.options, []),
        jsonText(variant.raw, {}),
      ),
    );
  });
  return statements;
}

function productMediaStatements(env: Env, productId: string, input: ProductInput): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [
    env.DB.prepare("DELETE FROM product_media WHERE product_id = ?").bind(productId),
  ];

  input.media.forEach((media, index) => {
    statements.push(
      env.DB.prepare(
        `INSERT INTO product_media
          (id, product_id, external_id, media_type, url, poster_url, title, position,
           width, height, content_type, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        productId,
        nullable(media.externalId) ?? `media-${index + 1}`,
        media.mediaType,
        nullable(media.url),
        nullable(media.posterUrl),
        nullable(media.title),
        media.position ?? index,
        nullable(media.width),
        nullable(media.height),
        nullable(media.contentType),
        jsonText(media.metadata, {}),
      ),
    );
  });
  return statements;
}

function productImageStatements(env: Env, productId: string, input: ProductInput): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [
    env.DB.prepare("DELETE FROM product_images WHERE product_id = ?").bind(productId),
  ];

  input.images.forEach((image, index) => {
    statements.push(
      env.DB.prepare(
        `INSERT INTO product_images
          (id, product_id, external_id, url, r2_key, alt_text, position, width, height, content_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        productId,
        nullable(image.externalId) ?? `image-${index + 1}`,
        nullable(image.url),
        nullable(image.r2Key),
        nullable(image.altText),
        image.position ?? index,
        nullable(image.width),
        nullable(image.height),
        nullable(image.contentType),
      ),
    );
  });
  return statements;
}

export async function upsertProduct(env: Env, input: ProductInput, createdBy: string | null): Promise<string> {
  const sourceStore = input.sourceStore ?? "";
  const externalId = nullable(input.externalId) ?? crypto.randomUUID();
  const existing = await env.DB.prepare(
    `SELECT id FROM products
      WHERE source_platform = ? AND source_store = ? AND external_id = ?`,
  )
    .bind(input.sourcePlatform, sourceStore, externalId)
    .first<{ id: string }>();
  const productId = existing?.id ?? crypto.randomUUID();

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO products
        (id, source_platform, source_store, external_id, source_url, shop_domain, handle, title,
         vendor, product_type, description_html, spu, published_at, inventory_quantity, currency,
         status, sync_state, price_min, price_max, compare_at_price, cost_min, cost_max, tags_json,
         options_json, attributes_json, categories_json, content_json, raw_json, notes, assigned_to,
         created_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?,
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(source_platform, source_store, external_id) DO UPDATE SET
         source_url = excluded.source_url,
         shop_domain = excluded.shop_domain,
         handle = excluded.handle,
         title = excluded.title,
         vendor = excluded.vendor,
         product_type = excluded.product_type,
         description_html = excluded.description_html,
         spu = excluded.spu,
         published_at = excluded.published_at,
         inventory_quantity = excluded.inventory_quantity,
         currency = excluded.currency,
         status = excluded.status,
         sync_state = excluded.sync_state,
         price_min = excluded.price_min,
         price_max = excluded.price_max,
         compare_at_price = excluded.compare_at_price,
         cost_min = excluded.cost_min,
         cost_max = excluded.cost_max,
         tags_json = excluded.tags_json,
         options_json = excluded.options_json,
         attributes_json = excluded.attributes_json,
         categories_json = excluded.categories_json,
         content_json = excluded.content_json,
         raw_json = excluded.raw_json,
         notes = excluded.notes,
         assigned_to = excluded.assigned_to,
         updated_at = excluded.updated_at`,
    ).bind(
      productId,
      input.sourcePlatform,
      sourceStore,
      externalId,
      nullable(input.sourceUrl),
      nullable(input.shopDomain),
      nullable(input.handle),
      input.title,
      nullable(input.vendor),
      nullable(input.productType),
      nullable(input.descriptionHtml),
      nullable(input.spu),
      nullable(input.publishedAt),
      nullable(input.inventoryQuantity),
      input.currency,
      input.status,
      input.syncState,
      nullable(input.priceMin),
      nullable(input.priceMax),
      nullable(input.compareAtPrice),
      nullable(input.costMin),
      nullable(input.costMax),
      jsonText(input.tags, []),
      jsonText(input.options, []),
      jsonText(input.attributes, {}),
      jsonText(input.categories, []),
      jsonText(input.content, {}),
      jsonText(input.raw, {}),
      nullable(input.notes),
      nullable(input.assignedTo),
      createdBy,
    ),
    ...productVariantStatements(env, productId, input),
    ...productImageStatements(env, productId, input),
    ...productMediaStatements(env, productId, input),
  ];

  await env.DB.batch(statements);
  return productId;
}

const productPatchColumns: Record<string, { column: string; serialize?: (value: unknown) => unknown }> = {
  sourcePlatform: { column: "source_platform" },
  sourceStore: { column: "source_store" },
  externalId: { column: "external_id" },
  sourceUrl: { column: "source_url" },
  shopDomain: { column: "shop_domain" },
  handle: { column: "handle" },
  title: { column: "title" },
  vendor: { column: "vendor" },
  productType: { column: "product_type" },
  descriptionHtml: { column: "description_html" },
  spu: { column: "spu" },
  publishedAt: { column: "published_at" },
  inventoryQuantity: { column: "inventory_quantity" },
  currency: { column: "currency" },
  status: { column: "status" },
  syncState: { column: "sync_state" },
  priceMin: { column: "price_min" },
  priceMax: { column: "price_max" },
  compareAtPrice: { column: "compare_at_price" },
  costMin: { column: "cost_min" },
  costMax: { column: "cost_max" },
  tags: { column: "tags_json", serialize: (value) => jsonText(value, []) },
  options: { column: "options_json", serialize: (value) => jsonText(value, []) },
  attributes: { column: "attributes_json", serialize: (value) => jsonText(value, {}) },
  categories: { column: "categories_json", serialize: (value) => jsonText(value, []) },
  content: { column: "content_json", serialize: (value) => jsonText(value, {}) },
  raw: { column: "raw_json", serialize: (value) => jsonText(value, {}) },
  notes: { column: "notes" },
  assignedTo: { column: "assigned_to" },
};

export async function patchProduct(env: Env, productId: string, patch: ProductPatch): Promise<void> {
  const assignments: string[] = [];
  const values: unknown[] = [];

  for (const [key, descriptor] of Object.entries(productPatchColumns)) {
    const value = patch[key as keyof ProductPatch];
    if (value === undefined) continue;
    assignments.push(`${descriptor.column} = ?`);
    values.push(descriptor.serialize ? descriptor.serialize(value) : nullable(value));
  }

  const replaceVariants = patch.variants !== undefined;
  const replaceImages = patch.images !== undefined;
  const replaceMedia = patch.media !== undefined;
  const statements: D1PreparedStatement[] = [];

  if (assignments.length > 0) {
    assignments.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    statements.push(
      env.DB.prepare(`UPDATE products SET ${assignments.join(", ")} WHERE id = ?`).bind(...values, productId),
    );
  }

  if (replaceVariants || replaceImages || replaceMedia) {
    const current = await env.DB.prepare(
      `SELECT source_platform AS sourcePlatform, source_store AS sourceStore, external_id AS externalId,
              title, currency, status, sync_state AS syncState
         FROM products WHERE id = ?`,
    )
      .bind(productId)
      .first<Pick<ProductInput, "sourcePlatform" | "sourceStore" | "externalId" | "title" | "currency" | "status" | "syncState">>();
    if (!current) throw new ApiError(404, "商品不存在", "product_not_found");
    const replacement = {
      ...current,
      variants: patch.variants ?? [],
      images: patch.images ?? [],
      media: patch.media ?? [],
      tags: [],
      options: [],
      attributes: {},
      categories: [],
      content: {},
    } as ProductInput;
    if (replaceVariants) statements.push(...productVariantStatements(env, productId, replacement));
    if (replaceImages) statements.push(...productImageStatements(env, productId, replacement));
    if (replaceMedia) statements.push(...productMediaStatements(env, productId, replacement));
  }

  if (statements.length === 0) return;
  await env.DB.batch(statements);
}

export async function listProducts(env: Env, query: ProductListQuery): Promise<{
  items: JsonRow[];
  page: number;
  pageSize: number;
  total: number;
}> {
  const where: string[] = ["1 = 1"];
  const bindings: unknown[] = [];
  if (query.status !== "all") {
    where.push("p.status = ?");
    bindings.push(query.status);
  }
  if (query.source !== "all") {
    where.push("p.source_platform = ?");
    bindings.push(query.source);
  }
  if (query.search) {
    const term = `%${query.search}%`;
    where.push(
      `(p.title LIKE ? COLLATE NOCASE OR p.vendor LIKE ? COLLATE NOCASE OR p.external_id LIKE ? COLLATE NOCASE
        OR EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.sku LIKE ? COLLATE NOCASE))`,
    );
    bindings.push(term, term, term, term);
  }

  const whereSql = where.join(" AND ");
  const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM products p WHERE ${whereSql}`)
    .bind(...bindings)
    .first<{ count: number }>();
  const offset = (query.page - 1) * query.pageSize;
  const result = await env.DB.prepare(
    `SELECT p.id, p.source_platform AS sourcePlatform, p.source_store AS sourceStore,
            p.external_id AS externalId, p.source_url AS sourceUrl, p.title, p.vendor,
            p.product_type AS productType, p.spu, p.inventory_quantity AS inventoryQuantity,
            p.currency, p.status, p.sync_state AS syncState,
            p.price_min AS priceMin, p.price_max AS priceMax, p.updated_at AS updatedAt,
            u.display_name AS assignedToName,
            (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.id) AS variantCount,
            (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id = p.id) AS imageCount,
            (SELECT COUNT(*) FROM product_offer_links pol
              WHERE pol.product_id = p.id AND pol.match_status != 'rejected') AS offerCount,
            COALESCE(
              (SELECT CASE WHEN pi.r2_key IS NOT NULL THEN '/media/' || pi.r2_key ELSE pi.url END
                 FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position LIMIT 1),
              ''
            ) AS thumbnailUrl
       FROM products p
       LEFT JOIN users u ON u.id = p.assigned_to
      WHERE ${whereSql}
      ORDER BY CASE p.status
        WHEN 'new' THEN 1 WHEN 'image_searching' THEN 2 WHEN 'matched' THEN 3
        WHEN 'reviewed' THEN 4 ELSE 5 END, p.updated_at DESC
      LIMIT ? OFFSET ?`,
  )
    .bind(...bindings, query.pageSize, offset)
    .all<JsonRow>();

  return { items: result.results, page: query.page, pageSize: query.pageSize, total: count?.count ?? 0 };
}

export async function getProduct(env: Env, productId: string): Promise<JsonRow> {
  const product = await env.DB.prepare(
    `SELECT p.id, p.source_platform AS sourcePlatform, p.source_store AS sourceStore,
            p.external_id AS externalId, p.source_url AS sourceUrl, p.shop_domain AS shopDomain,
            p.handle, p.title, p.vendor, p.product_type AS productType,
            p.description_html AS descriptionHtml, p.spu, p.published_at AS publishedAt,
            p.inventory_quantity AS inventoryQuantity, p.currency, p.status, p.sync_state AS syncState,
            p.price_min AS priceMin, p.price_max AS priceMax, p.compare_at_price AS compareAtPrice,
            p.cost_min AS costMin, p.cost_max AS costMax, p.tags_json AS tags,
            p.options_json AS options, p.attributes_json AS attributes,
            p.categories_json AS categories, p.content_json AS content, p.raw_json AS raw,
            p.notes, p.assigned_to AS assignedTo,
            u.display_name AS assignedToName, p.created_at AS createdAt, p.updated_at AS updatedAt
       FROM products p LEFT JOIN users u ON u.id = p.assigned_to WHERE p.id = ?`,
  )
    .bind(productId)
    .first<JsonRow>();
  if (!product) throw new ApiError(404, "商品不存在", "product_not_found");

  const [variants, images, media, offers] = await env.DB.batch<JsonRow>([
    env.DB.prepare(
      `SELECT id, external_id AS externalId, sku, barcode, title, option1, option2, option3,
              price, compare_at_price AS compareAtPrice, cost, inventory_quantity AS inventoryQuantity,
              weight, weight_unit AS weightUnit, image_url AS imageUrl, grams,
              remaining_inventory AS remainingInventory, options_json AS options, raw_json AS raw
         FROM product_variants WHERE product_id = ? ORDER BY created_at`,
    ).bind(productId),
    env.DB.prepare(
      `SELECT id, external_id AS externalId, url, r2_key AS r2Key,
              CASE WHEN r2_key IS NOT NULL THEN '/media/' || r2_key ELSE url END AS displayUrl,
              alt_text AS altText, position, width, height, content_type AS contentType
         FROM product_images WHERE product_id = ? ORDER BY position`,
    ).bind(productId),
    env.DB.prepare(
      `SELECT id, external_id AS externalId, media_type AS mediaType, url,
              poster_url AS posterUrl, title, position, width, height,
              content_type AS contentType, metadata_json AS metadata
         FROM product_media WHERE product_id = ? ORDER BY position`,
    ).bind(productId),
    env.DB.prepare(
      `SELECT pol.id AS linkId, pol.match_status AS matchStatus, pol.match_score AS matchScore,
              pol.notes, pol.variant_map_json AS variantMap, pol.created_at AS linkedAt,
              o.id, o.offer_id AS offerId, o.url, o.title, o.supplier_id AS supplierId,
              o.supplier_name AS supplierName, o.price_min AS priceMin, o.price_max AS priceMax,
              o.currency, o.min_order_quantity AS minOrderQuantity, o.unit, o.province, o.city,
              o.raw_json AS raw,
              COALESCE((SELECT CASE WHEN oi.r2_key IS NOT NULL THEN '/media/' || oi.r2_key ELSE oi.url END
                FROM offer_images oi WHERE oi.offer_id = o.id ORDER BY oi.position LIMIT 1), '') AS thumbnailUrl,
              (SELECT COUNT(*) FROM offer_variants ov WHERE ov.offer_id = o.id) AS variantCount
         FROM product_offer_links pol
         JOIN offers_1688 o ON o.id = pol.offer_id
        WHERE pol.product_id = ?
        ORDER BY CASE pol.match_status WHEN 'selected' THEN 1 WHEN 'candidate' THEN 2 ELSE 3 END,
                 pol.updated_at DESC`,
    ).bind(productId),
  ]);

  return {
    ...hydrateJson(product, [
      ["tags", []],
      ["options", []],
      ["attributes", {}],
      ["categories", []],
      ["content", {}],
      ["raw", {}],
    ]),
    variants: variants.results.map((row) => hydrateJson(row, [["options", []], ["raw", {}]])),
    images: images.results,
    media: media.results.map((row) => hydrateJson(row, [["metadata", {}]])),
    offers: offers.results.map((row) => hydrateJson(row, [["variantMap", {}], ["raw", {}]])),
  };
}

export async function getStoredOfferDetail(env: Env, offerId: string): Promise<JsonRow> {
  const offer = await env.DB.prepare(
    `SELECT id, offer_id AS offerId, url, title, supplier_id AS supplierId,
            supplier_name AS supplierName, price_min AS priceMin, price_max AS priceMax,
            currency, min_order_quantity AS minOrderQuantity, unit, province, city,
            short_description AS shortDescription, total_price AS totalPrice,
            suggested_price AS suggestedPrice, original_price AS originalPrice,
            stock_quantity AS stockQuantity, sold_quantity AS soldQuantity,
            brand, brand_id AS brandId, root_category_id AS rootCategoryId,
            category_id AS categoryId, seller_nick AS sellerNick, location,
            item_weight AS itemWeight, item_size AS itemSize, shop_id AS shopId,
            description_html AS descriptionHtml, video_url AS videoUrl,
            sample_id AS sampleId, shipping_to AS shippingTo,
            has_discount AS hasDiscount, is_promotion AS isPromotion,
            fetched_at AS fetchedAt, created_at AS createdAt, updated_at AS updatedAt
       FROM offers_1688 WHERE offer_id = ?`,
  )
    .bind(offerId)
    .first<JsonRow>();
  if (!offer) throw new ApiError(404, "1688 商品不存在", "offer_not_found");

  const internalId = String(offer.id);
  const [variants, images, priceTiers, properties, propertyImages, descriptionImages, videos, snapshots] =
    await env.DB.batch<JsonRow>([
      env.DB.prepare(
        `SELECT id, external_id AS externalId, sku, name, attributes_json AS attributes,
                price, stock
           FROM offer_variants WHERE offer_id = ? ORDER BY created_at`,
      ).bind(internalId),
      env.DB.prepare(
        `SELECT id, external_id AS externalId, url, r2_key AS r2Key,
                CASE WHEN r2_key IS NOT NULL THEN '/media/' || r2_key ELSE url END AS displayUrl,
                alt_text AS altText, position, width, height, content_type AS contentType
           FROM offer_images WHERE offer_id = ? ORDER BY position`,
      ).bind(internalId),
      env.DB.prepare(
        `SELECT id, min_quantity AS minQuantity, price, original_price AS originalPrice, position
           FROM offer_price_tiers WHERE offer_id = ? ORDER BY position`,
      ).bind(internalId),
      env.DB.prepare(
        `SELECT id, property_id AS propertyId, value_id AS valueId, name,
                value_text AS value, position
           FROM offer_properties WHERE offer_id = ? ORDER BY position`,
      ).bind(internalId),
      env.DB.prepare(
        `SELECT id, properties_key AS propertiesKey, url, position
           FROM offer_property_images WHERE offer_id = ? ORDER BY position`,
      ).bind(internalId),
      env.DB.prepare(
        `SELECT id, url, position
           FROM offer_description_images WHERE offer_id = ? ORDER BY position`,
      ).bind(internalId),
      env.DB.prepare(
        `SELECT id, url, poster_url AS posterUrl, title, position
           FROM offer_videos WHERE offer_id = ? ORDER BY position`,
      ).bind(internalId),
      env.DB.prepare(
        `SELECT api_name AS apiName, request_num_iid AS requestNumIid,
                error_code AS errorCode, reason, upstream_request_id AS upstreamRequestId,
                fetched_at AS fetchedAt
           FROM offer_api_snapshots WHERE offer_id = ? ORDER BY fetched_at DESC LIMIT 1`,
      ).bind(internalId),
    ]);

  return {
    ...offer,
    variants: variants.results.map((row) => hydrateJson(row, [["attributes", {}]])),
    images: images.results,
    priceTiers: priceTiers.results,
    properties: properties.results,
    propertyImages: propertyImages.results,
    descriptionImages: descriptionImages.results,
    videos: videos.results,
    latestSnapshot: snapshots.results[0] ?? null,
  };
}

export async function getProductImage(
  env: Env,
  productId: string,
  imageId: string,
): Promise<{ id: string; url: string | null; r2Key: string | null; contentType: string | null } | null> {
  return env.DB.prepare(
    `SELECT id, url, r2_key AS r2Key, content_type AS contentType
       FROM product_images WHERE id = ? AND product_id = ?`,
  )
    .bind(imageId, productId)
    .first<{ id: string; url: string | null; r2Key: string | null; contentType: string | null }>();
}

export async function dashboardSummary(env: Env): Promise<JsonRow> {
  const productCounts = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS newCount,
            SUM(CASE WHEN status = 'image_searching' THEN 1 ELSE 0 END) AS searchingCount,
            SUM(CASE WHEN status = 'matched' THEN 1 ELSE 0 END) AS matchedCount,
            SUM(CASE WHEN status = 'reviewed' THEN 1 ELSE 0 END) AS reviewedCount
       FROM products WHERE status != 'archived'`,
  ).first<JsonRow>();
  const [offerCount, userCount, recentResult] = await env.DB.batch<JsonRow>([
    env.DB.prepare("SELECT COUNT(*) AS count FROM offers_1688"),
    env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE is_active = 1"),
    env.DB.prepare(
      `SELECT p.id, p.title, p.status, p.updated_at AS updatedAt,
              COALESCE((SELECT CASE WHEN pi.r2_key IS NOT NULL THEN '/media/' || pi.r2_key ELSE pi.url END
                FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position LIMIT 1), '') AS thumbnailUrl
         FROM products p WHERE p.status != 'archived' ORDER BY p.updated_at DESC LIMIT 6`,
    ),
  ]);
  return {
    ...(productCounts ?? {}),
    offerCount: offerCount.results[0]?.count ?? 0,
    activeUsers: userCount.results[0]?.count ?? 0,
    recentProducts: recentResult.results,
  };
}

export async function upsertOfferLink(
  env: Env,
  productId: string,
  input: OfferLinkInput,
  createdBy: string | null,
  oneboundDetail?: OneBoundOfferDetailData,
): Promise<string> {
  const product = await env.DB.prepare("SELECT id FROM products WHERE id = ?")
    .bind(productId)
    .first<{ id: string }>();
  if (!product) throw new ApiError(404, "商品不存在", "product_not_found");

  const existing = await env.DB.prepare("SELECT id FROM offers_1688 WHERE offer_id = ?")
    .bind(input.offer.offerId)
    .first<{ id: string }>();
  const offerInternalId = existing?.id ?? crypto.randomUUID();
  const existingLink = await env.DB.prepare(
    "SELECT id FROM product_offer_links WHERE product_id = ? AND offer_id = ?",
  )
    .bind(productId, offerInternalId)
    .first<{ id: string }>();
  const linkId = existingLink?.id ?? crypto.randomUUID();

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO offers_1688
        (id, offer_id, url, title, supplier_id, supplier_name, price_min, price_max, currency,
         min_order_quantity, unit, province, city, source_url, raw_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(offer_id) DO UPDATE SET
         url = excluded.url, title = excluded.title, supplier_id = excluded.supplier_id,
         supplier_name = excluded.supplier_name, price_min = excluded.price_min,
         price_max = excluded.price_max, currency = excluded.currency,
         min_order_quantity = excluded.min_order_quantity, unit = excluded.unit,
         province = excluded.province, city = excluded.city, source_url = excluded.source_url,
         raw_json = excluded.raw_json, updated_at = excluded.updated_at`,
    ).bind(
      offerInternalId,
      input.offer.offerId,
      nullable(input.offer.url),
      input.offer.title,
      nullable(input.offer.supplierId),
      nullable(input.offer.supplierName),
      nullable(input.offer.priceMin),
      nullable(input.offer.priceMax),
      input.offer.currency,
      nullable(input.offer.minOrderQuantity),
      nullable(input.offer.unit),
      nullable(input.offer.province),
      nullable(input.offer.city),
      nullable(input.offer.sourceUrl),
      jsonText(input.offer.raw, {}),
    ),
    env.DB.prepare("DELETE FROM offer_variants WHERE offer_id = ?").bind(offerInternalId),
    env.DB.prepare("DELETE FROM offer_images WHERE offer_id = ?").bind(offerInternalId),
  ];

  input.offer.variants.forEach((variant, index) => {
    statements.push(
      env.DB.prepare(
        `INSERT INTO offer_variants
          (id, offer_id, external_id, sku, name, attributes_json, price, stock, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        offerInternalId,
        nullable(variant.externalId) ?? `variant-${index + 1}`,
        nullable(variant.sku),
        nullable(variant.name),
        jsonText(variant.attributes, {}),
        nullable(variant.price),
        nullable(variant.stock),
        jsonText(variant.raw, {}),
      ),
    );
  });

  input.offer.images.forEach((image, index) => {
    statements.push(
      env.DB.prepare(
        `INSERT INTO offer_images
          (id, offer_id, external_id, url, r2_key, alt_text, position, width, height, content_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        offerInternalId,
        nullable(image.externalId) ?? `image-${index + 1}`,
        nullable(image.url),
        nullable(image.r2Key),
        nullable(image.altText),
        image.position ?? index,
        nullable(image.width),
        nullable(image.height),
        nullable(image.contentType),
      ),
    );
  });

  if (oneboundDetail) {
    const detail = oneboundDetail;
    statements.push(
      env.DB.prepare(
        `UPDATE offers_1688 SET
          short_description = ?, total_price = ?, suggested_price = ?, original_price = ?,
          stock_quantity = ?, sold_quantity = ?, brand = ?, brand_id = ?, root_category_id = ?,
          category_id = ?, seller_nick = ?, location = ?, item_weight = ?, item_size = ?,
          shop_id = ?, description_html = ?, video_url = ?, sample_id = ?, shipping_to = ?,
          has_discount = ?, is_promotion = ?, fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`,
      ).bind(
        nullable(detail.main.shortDescription),
        nullable(detail.main.totalPrice),
        nullable(detail.main.suggestedPrice),
        nullable(detail.main.originalPrice),
        nullable(detail.main.stockQuantity),
        nullable(detail.main.soldQuantity),
        nullable(detail.main.brand),
        nullable(detail.main.brandId),
        nullable(detail.main.rootCategoryId),
        nullable(detail.main.categoryId),
        nullable(detail.main.sellerNick),
        nullable(detail.main.location),
        nullable(detail.main.itemWeight),
        nullable(detail.main.itemSize),
        nullable(detail.main.shopId),
        nullable(detail.main.descriptionHtml),
        nullable(detail.main.videoUrl),
        nullable(detail.main.sampleId),
        nullable(detail.main.shippingTo),
        nullable(detail.main.hasDiscount),
        nullable(detail.main.isPromotion),
        offerInternalId,
      ),
      env.DB.prepare("DELETE FROM offer_price_tiers WHERE offer_id = ?").bind(offerInternalId),
      env.DB.prepare("DELETE FROM offer_properties WHERE offer_id = ?").bind(offerInternalId),
      env.DB.prepare("DELETE FROM offer_property_images WHERE offer_id = ?").bind(offerInternalId),
      env.DB.prepare("DELETE FROM offer_description_images WHERE offer_id = ?").bind(offerInternalId),
      env.DB.prepare("DELETE FROM offer_videos WHERE offer_id = ?").bind(offerInternalId),
    );

    detail.priceTiers.forEach((tier, index) => {
      statements.push(
        env.DB.prepare(
          `INSERT INTO offer_price_tiers
            (id, offer_id, min_quantity, price, original_price, position, raw_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          offerInternalId,
          nullable(tier.minQuantity),
          nullable(tier.price),
          nullable(tier.originalPrice),
          index,
          jsonText(tier.raw, {}),
        ),
      );
    });

    detail.properties.forEach((property, index) => {
      statements.push(
        env.DB.prepare(
          `INSERT INTO offer_properties
            (id, offer_id, property_id, value_id, name, value_text, position, raw_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          offerInternalId,
          nullable(property.propertyId),
          nullable(property.valueId),
          property.name,
          property.value,
          index,
          jsonText(property.raw, {}),
        ),
      );
    });

    detail.propertyImages.forEach((image, index) => {
      statements.push(
        env.DB.prepare(
          `INSERT INTO offer_property_images
            (id, offer_id, properties_key, url, position, raw_json)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          offerInternalId,
          nullable(image.propertiesKey),
          image.url,
          index,
          jsonText(image.raw, {}),
        ),
      );
    });

    detail.descriptionImages.forEach((image, index) => {
      statements.push(
        env.DB.prepare(
          `INSERT INTO offer_description_images
            (id, offer_id, url, position, raw_json)
           VALUES (?, ?, ?, ?, ?)`,
        ).bind(crypto.randomUUID(), offerInternalId, image.url, index, jsonText(image.raw, {})),
      );
    });

    detail.videos.forEach((video, index) => {
      statements.push(
        env.DB.prepare(
          `INSERT INTO offer_videos
            (id, offer_id, url, poster_url, title, position, raw_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          offerInternalId,
          video.url,
          nullable(video.posterUrl),
          nullable(video.title),
          index,
          jsonText(video.raw, {}),
        ),
      );
    });

    if (detail.supplier) {
      const supplier = detail.supplier;
      const supplierInternalId = crypto.randomUUID();
      statements.push(
        env.DB.prepare(
          `INSERT INTO suppliers_1688
            (id, supplier_key, supplier_id, shop_id, nick, shop_name, sid, title, profile_url, location, raw_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           ON CONFLICT(supplier_key) DO UPDATE SET
             supplier_id = excluded.supplier_id, shop_id = excluded.shop_id, nick = excluded.nick,
             shop_name = excluded.shop_name, sid = excluded.sid, title = excluded.title,
             profile_url = excluded.profile_url, location = excluded.location,
             raw_json = excluded.raw_json, updated_at = excluded.updated_at`,
        ).bind(
          supplierInternalId,
          supplier.supplierKey,
          nullable(supplier.supplierId),
          nullable(supplier.shopId),
          nullable(supplier.nick),
          nullable(supplier.shopName),
          nullable(supplier.sid),
          nullable(supplier.title),
          nullable(supplier.profileUrl),
          nullable(supplier.location),
          jsonText(supplier.raw, {}),
        ),
      );
    }

    statements.push(
      env.DB.prepare(
        `INSERT INTO offer_api_snapshots
          (id, offer_id, api_name, request_num_iid, error_code, reason, upstream_request_id, response_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        offerInternalId,
        detail.snapshot.apiName,
        detail.snapshot.requestNumIid,
        nullable(detail.snapshot.errorCode),
        nullable(detail.snapshot.reason),
        nullable(detail.snapshot.upstreamRequestId),
        jsonText(detail.snapshot.response, {}),
      ),
    );
  }

  statements.push(
    env.DB.prepare(
      `INSERT INTO product_offer_links
        (id, product_id, offer_id, match_status, match_score, notes, variant_map_json, created_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(product_id, offer_id) DO UPDATE SET
         match_status = excluded.match_status, match_score = excluded.match_score,
         notes = excluded.notes, variant_map_json = excluded.variant_map_json,
         updated_at = excluded.updated_at`,
    ).bind(
      linkId,
      productId,
      offerInternalId,
      input.matchStatus,
      nullable(input.matchScore),
      nullable(input.notes),
      jsonText(input.variantMap, {}),
      createdBy,
    ),
  );

  if (input.matchStatus !== "rejected") {
    statements.push(
      env.DB.prepare(
        `UPDATE products SET status = CASE WHEN status IN ('new', 'image_searching') THEN 'matched' ELSE status END,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      ).bind(productId),
    );
  }
  await env.DB.batch(statements);
  return linkId;
}

export async function removeOfferLink(env: Env, productId: string, linkId: string): Promise<void> {
  const result = await env.DB.prepare(
    "DELETE FROM product_offer_links WHERE id = ? AND product_id = ?",
  )
    .bind(linkId, productId)
    .run();
  if (result.meta.changes === 0) throw new ApiError(404, "关联记录不存在", "link_not_found");

  const remaining = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM product_offer_links
      WHERE product_id = ? AND match_status != 'rejected'`,
  )
    .bind(productId)
    .first<{ count: number }>();
  if ((remaining?.count ?? 0) === 0) {
    await env.DB.prepare(
      `UPDATE products SET status = CASE WHEN status = 'matched' THEN 'image_searching' ELSE status END,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
    )
      .bind(productId)
      .run();
  }
}

export async function addUploadedImage(
  env: Env,
  input: {
    productId: string;
    r2Key: string;
    originalName: string;
    contentType: string;
  },
): Promise<JsonRow> {
  const product = await env.DB.prepare("SELECT id FROM products WHERE id = ?")
    .bind(input.productId)
    .first<{ id: string }>();
  if (!product) throw new ApiError(404, "商品不存在", "product_not_found");
  const position = await env.DB.prepare(
    "SELECT COALESCE(MAX(position), -1) + 1 AS position FROM product_images WHERE product_id = ?",
  )
    .bind(input.productId)
    .first<{ position: number }>();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO product_images
      (id, product_id, external_id, r2_key, alt_text, position, content_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.productId,
      `upload-${id}`,
      input.r2Key,
      input.originalName,
      position?.position ?? 0,
      input.contentType,
    )
    .run();
  return { id, r2Key: input.r2Key, displayUrl: `/media/${input.r2Key}`, altText: input.originalName };
}

export async function listUsers(env: Env): Promise<JsonRow[]> {
  const result = await env.DB.prepare(
    `SELECT id, username, display_name AS displayName, is_active AS isActive,
            created_at AS createdAt, updated_at AS updatedAt, last_login_at AS lastLoginAt
       FROM users ORDER BY is_active DESC, created_at`,
  ).all<JsonRow>();
  return result.results.map((row) => ({ ...row, isActive: row.isActive === 1 }));
}

export async function patchUser(
  env: Env,
  userId: string,
  patch: { displayName?: string; isActive?: boolean },
  currentUserId: string,
): Promise<void> {
  if (userId === currentUserId && patch.isActive === false) {
    throw new ApiError(400, "不能停用当前登录账号", "cannot_disable_self");
  }
  const assignments: string[] = [];
  const values: unknown[] = [];
  if (patch.displayName !== undefined) {
    assignments.push("display_name = ?");
    values.push(patch.displayName);
  }
  if (patch.isActive !== undefined) {
    assignments.push("is_active = ?");
    values.push(patch.isActive ? 1 : 0);
  }
  if (assignments.length === 0) return;
  assignments.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
  const result = await env.DB.prepare(`UPDATE users SET ${assignments.join(", ")} WHERE id = ?`)
    .bind(...values, userId)
    .run();
  if (result.meta.changes === 0) throw new ApiError(404, "账号不存在", "user_not_found");
  if (patch.isActive === false) {
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
  }
}
