import { ApiError, clientIp } from "./http";
import type {
  OfferLinkInput,
  ProductInput,
  ProductListQuery,
  ProductPatch,
  SearchTaskListQuery,
  SearchTaskRunInput,
  SearchTaskSyncInput,
} from "./validation";

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

let searchTasksSchemaReady: Promise<void> | null = null;

export async function ensureSearchTasksSchema(env: Env): Promise<void> {
  if (!searchTasksSchemaReady) {
    searchTasksSchemaReady = (async () => {
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS search_tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        source_image_url TEXT,
        source_page TEXT,
        options_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(options_json)),
        result_count INTEGER NOT NULL DEFAULT 0,
        results_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(results_json)),
        error TEXT,
        charged_credits INTEGER NOT NULL DEFAULT 0,
        product_title TEXT,
        description TEXT,
        sku TEXT,
        source_site TEXT,
        product_url TEXT,
        images_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(images_json)),
        selected_image_id TEXT,
        selected_image_url TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        completed_at TEXT,
        UNIQUE(user_id, client_id)
      )`,
      ).run();
      const columns = await env.DB.prepare("PRAGMA table_info(search_tasks)").all<{ name: string }>();
      const existing = new Set(columns.results.map((column) => column.name));
      const additions = [
        ["product_title", "ALTER TABLE search_tasks ADD COLUMN product_title TEXT"],
        ["description", "ALTER TABLE search_tasks ADD COLUMN description TEXT"],
        ["sku", "ALTER TABLE search_tasks ADD COLUMN sku TEXT"],
        ["source_site", "ALTER TABLE search_tasks ADD COLUMN source_site TEXT"],
        ["product_url", "ALTER TABLE search_tasks ADD COLUMN product_url TEXT"],
        ["images_json", "ALTER TABLE search_tasks ADD COLUMN images_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(images_json))"],
        ["selected_image_id", "ALTER TABLE search_tasks ADD COLUMN selected_image_id TEXT"],
        ["selected_image_url", "ALTER TABLE search_tasks ADD COLUMN selected_image_url TEXT"],
      ] as const;
      for (const [name, sql] of additions) if (!existing.has(name)) await env.DB.prepare(sql).run();
      await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_search_tasks_user_updated ON search_tasks(user_id, updated_at DESC)").run();
      await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_search_tasks_user_product_title ON search_tasks(user_id, product_title)").run();
      await env.DB.batch([
        env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS search_task_runs (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL REFERENCES search_tasks(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            image_id TEXT NOT NULL,
            image_url TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
            options_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(options_json)),
            page INTEGER NOT NULL DEFAULT 1,
            page_size INTEGER NOT NULL DEFAULT 30,
            uploaded_image_id TEXT,
            result_count INTEGER NOT NULL DEFAULT 0,
            total_result_count INTEGER,
            results_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(results_json)),
            error TEXT,
            charged_credits INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            completed_at TEXT
          )`,
        ),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_search_task_runs_task_created ON search_task_runs(task_id, created_at DESC)"),
        env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_search_task_runs_one_active ON search_task_runs(task_id) WHERE status = 'running'"),
        env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS search_task_imports (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL REFERENCES search_tasks(id) ON DELETE CASCADE,
            run_id TEXT REFERENCES search_task_runs(id) ON DELETE SET NULL,
            offer_id TEXT NOT NULL,
            product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            UNIQUE(task_id, offer_id)
          )`,
        ),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_search_task_imports_task ON search_task_imports(task_id, imported_at DESC)"),
      ]);
      await env.DB.prepare(
        `INSERT INTO search_task_runs
          (id, task_id, user_id, image_id, image_url, status, options_json, page, page_size,
           result_count, total_result_count, results_json, error, charged_credits, created_at, completed_at)
         SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) ||
                '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
                id, user_id, COALESCE(selected_image_id, 'legacy'), COALESCE(selected_image_url, source_image_url, ''),
                CASE WHEN status = 'failed' THEN 'failed' ELSE 'completed' END, options_json, 1,
                COALESCE(json_extract(options_json, '$.limit'), 30), result_count, result_count, results_json,
                error, charged_credits, created_at, COALESCE(completed_at, updated_at)
           FROM search_tasks
          WHERE status IN ('completed', 'failed')
            AND NOT EXISTS (SELECT 1 FROM search_task_runs WHERE search_task_runs.task_id = search_tasks.id)`,
      ).run();
    })();
  }
  await searchTasksSchemaReady;
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

export async function upsertProduct(
  env: Env,
  input: ProductInput,
  createdBy: string | null,
  viewer?: ProductViewer,
): Promise<string> {
  const is1688 = input.sourcePlatform === "1688";
  const dbSourcePlatform = is1688 ? "manual" : input.sourcePlatform;
  const sourceStore = input.sourceStore ?? (is1688 ? "1688" : "");
  const catalogSource = is1688 ? "1688" : "legacy";
  const externalId = nullable(input.externalId) ?? crypto.randomUUID();
  const existing = await env.DB.prepare(
    `SELECT id, created_by AS createdBy FROM products
      WHERE source_platform = ? AND source_store = ? AND external_id = ?`,
  )
    .bind(dbSourcePlatform, sourceStore, externalId)
    .first<{ id: string; createdBy: string | null }>();
  if (existing && viewer?.role === "user" && existing.createdBy !== viewer.id) {
    throw new ApiError(409, "该商品已存在于其他账号，无法覆盖", "product_owner_conflict");
  }
  const productId = existing?.id ?? crypto.randomUUID();
  const productColumns = await env.DB.prepare("PRAGMA table_info(products)").all<{ name: string }>();
  const hasCatalogColumns = productColumns.results.some((column) => column.name === "catalog_source");

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
      dbSourcePlatform,
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
    ...(hasCatalogColumns ? [env.DB.prepare(
      `UPDATE products SET
         catalog_source = ?, offer_id_1688 = ?, supplier_id_1688 = ?, supplier_name_1688 = ?,
         min_order_quantity_1688 = ?, unit_1688 = ?, province_1688 = ?, city_1688 = ?,
         short_description_1688 = ?, total_price_1688 = ?, suggested_price_1688 = ?,
         original_price_1688 = ?, stock_quantity_1688 = ?, sold_quantity_1688 = ?,
         brand_1688 = ?, brand_id_1688 = ?, root_category_id_1688 = ?, category_id_1688 = ?,
         seller_nick_1688 = ?, location_1688 = ?, item_weight_1688 = ?, item_size_1688 = ?,
         shop_id_1688 = ?, video_url_1688 = ?, sample_id_1688 = ?, shipping_to_1688 = ?,
         has_discount_1688 = ?, is_promotion_1688 = ?, fetched_at_1688 = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
    ).bind(
      catalogSource,
      nullable(input.offerId1688), nullable(input.supplierId1688), nullable(input.supplierName1688),
      nullable(input.minOrderQuantity1688), nullable(input.unit1688), nullable(input.province1688),
      nullable(input.city1688), nullable(input.shortDescription1688), nullable(input.totalPrice1688),
      nullable(input.suggestedPrice1688), nullable(input.originalPrice1688), nullable(input.stockQuantity1688),
      nullable(input.soldQuantity1688), nullable(input.brand1688), nullable(input.brandId1688),
      nullable(input.rootCategoryId1688), nullable(input.categoryId1688), nullable(input.sellerNick1688),
      nullable(input.location1688), nullable(input.itemWeight1688), nullable(input.itemSize1688),
      nullable(input.shopId1688), nullable(input.videoUrl1688), nullable(input.sampleId1688),
      nullable(input.shippingTo1688), nullable(input.hasDiscount1688), nullable(input.isPromotion1688),
      nullable(input.fetchedAt1688), productId,
    )] : []),
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
  offerId1688: { column: "offer_id_1688" },
  supplierId1688: { column: "supplier_id_1688" },
  supplierName1688: { column: "supplier_name_1688" },
  minOrderQuantity1688: { column: "min_order_quantity_1688" },
  unit1688: { column: "unit_1688" },
  province1688: { column: "province_1688" },
  city1688: { column: "city_1688" },
  shortDescription1688: { column: "short_description_1688" },
  totalPrice1688: { column: "total_price_1688" },
  suggestedPrice1688: { column: "suggested_price_1688" },
  originalPrice1688: { column: "original_price_1688" },
  stockQuantity1688: { column: "stock_quantity_1688" },
  soldQuantity1688: { column: "sold_quantity_1688" },
  brand1688: { column: "brand_1688" },
  brandId1688: { column: "brand_id_1688" },
  rootCategoryId1688: { column: "root_category_id_1688" },
  categoryId1688: { column: "category_id_1688" },
  sellerNick1688: { column: "seller_nick_1688" },
  location1688: { column: "location_1688" },
  itemWeight1688: { column: "item_weight_1688" },
  itemSize1688: { column: "item_size_1688" },
  shopId1688: { column: "shop_id_1688" },
  videoUrl1688: { column: "video_url_1688" },
  sampleId1688: { column: "sample_id_1688" },
  shippingTo1688: { column: "shipping_to_1688" },
  hasDiscount1688: { column: "has_discount_1688" },
  isPromotion1688: { column: "is_promotion_1688" },
  fetchedAt1688: { column: "fetched_at_1688" },
};

export async function patchProduct(env: Env, productId: string, patch: ProductPatch): Promise<void> {
  const assignments: string[] = [];
  const values: unknown[] = [];

  if (patch.sourcePlatform !== undefined) {
    assignments.push("source_platform = ?", "catalog_source = ?");
    values.push(patch.sourcePlatform === "1688" ? "manual" : patch.sourcePlatform, patch.sourcePlatform === "1688" ? "1688" : "legacy");
  }

  for (const [key, descriptor] of Object.entries(productPatchColumns)) {
    if (key === "sourcePlatform") continue;
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

export async function deleteProduct(env: Env, productId: string): Promise<string[]> {
  const images = await env.DB.prepare(
    "SELECT r2_key AS r2Key FROM product_images WHERE product_id = ? AND r2_key IS NOT NULL",
  )
    .bind(productId)
    .all<{ r2Key: string }>();

  const result = await env.DB.prepare("DELETE FROM products WHERE id = ?").bind(productId).run();
  if (!result.meta.changes) throw new ApiError(404, "Product not found", "product_not_found");
  return images.results.map((image) => image.r2Key).filter(Boolean);
}

export type ProductViewer = { id: string; role: "admin" | "user" };

export async function listProducts(env: Env, query: ProductListQuery, viewer?: ProductViewer): Promise<{
  items: JsonRow[];
  page: number;
  pageSize: number;
  total: number;
}> {
  // The catalog migration is deployed separately from the Worker. Keep the
  // list endpoint usable while an older D1 instance is catching up.
  const productColumns = await env.DB.prepare("PRAGMA table_info(products)").all<{ name: string }>();
  const hasProductColumn = (name: string) => productColumns.results.some((column) => column.name === name);
  const hasCatalogSource = hasProductColumn("catalog_source");
  const hasOfferId1688 = hasProductColumn("offer_id_1688");
  const hasSupplierName1688 = hasProductColumn("supplier_name_1688");
  const where: string[] = ["1 = 1"];
  const bindings: unknown[] = [];
  if (viewer?.role !== "admin") {
    where.push("p.created_by = ?");
    bindings.push(viewer?.id ?? "");
  }
  if (query.status !== "all") {
    where.push("p.status = ?");
    bindings.push(query.status);
  }
  if (query.source !== "all") {
    if (query.source === "1688") {
      where.push(hasCatalogSource ? "p.catalog_source = '1688'" : "0 = 1");
    } else {
      where.push(
        hasCatalogSource
          ? "p.source_platform = ? AND COALESCE(p.catalog_source, 'legacy') != '1688'"
          : "p.source_platform = ?",
      );
      bindings.push(query.source);
    }
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
    `SELECT p.id, ${hasCatalogSource ? "CASE WHEN p.catalog_source = '1688' THEN '1688' ELSE p.source_platform END" : "p.source_platform"} AS sourcePlatform, p.source_store AS sourceStore,
            p.external_id AS externalId, p.source_url AS sourceUrl, p.title, p.vendor,
            p.product_type AS productType, p.spu, p.inventory_quantity AS inventoryQuantity,
            ${hasOfferId1688 ? "p.offer_id_1688" : "NULL"} AS offerId1688,
            ${hasSupplierName1688 ? "p.supplier_name_1688" : "NULL"} AS supplierName1688,
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

export async function assertProductAccess(env: Env, productId: string, viewer: ProductViewer): Promise<void> {
  if (viewer.role === "admin") return;
  const row = await env.DB.prepare("SELECT created_by AS createdBy FROM products WHERE id = ?")
    .bind(productId).first<{ createdBy: string | null }>();
  if (!row || row.createdBy !== viewer.id) {
    throw new ApiError(404, "Product not found", "product_not_found");
  }
}

export async function assertOfferAccess(env: Env, offerId: string, viewer: ProductViewer): Promise<void> {
  if (viewer.role === "admin") return;
  const row = await env.DB.prepare(
    `SELECT 1 AS allowed FROM offers_1688 o
       JOIN product_offer_links pol ON pol.offer_id = o.id
       JOIN products p ON p.id = pol.product_id
      WHERE o.offer_id = ? AND p.created_by = ? LIMIT 1`,
  ).bind(offerId, viewer.id).first<{ allowed: number }>();
  if (!row) throw new ApiError(404, "1688 商品不存在或无权访问", "offer_not_found");
}

export async function assertMediaAccess(env: Env, r2Key: string, viewer: ProductViewer): Promise<void> {
  if (viewer.role === "admin") return;
  const row = await env.DB.prepare(
    `SELECT 1 AS allowed FROM product_images pi
       JOIN products p ON p.id = pi.product_id
      WHERE pi.r2_key = ? AND p.created_by = ?
      UNION
     SELECT 1 AS allowed FROM offer_images oi
       JOIN product_offer_links pol ON pol.offer_id = oi.offer_id
       JOIN products p ON p.id = pol.product_id
      WHERE oi.r2_key = ? AND p.created_by = ?
      LIMIT 1`,
  ).bind(r2Key, viewer.id, r2Key, viewer.id).first<{ allowed: number }>();
  if (!row) throw new ApiError(404, "图片不存在或无权访问", "media_not_found");
}

export async function getProduct(env: Env, productId: string): Promise<JsonRow> {
  const productColumns = await env.DB.prepare("PRAGMA table_info(products)").all<{ name: string }>();
  const hasProductColumn = (name: string) => productColumns.results.some((column) => column.name === name);
  const productColumn = (name: string) => hasProductColumn(name) ? `p.${name}` : "NULL";
  const hasCatalogSource = hasProductColumn("catalog_source");
  const product = await env.DB.prepare(
    `SELECT p.id, ${hasCatalogSource ? "CASE WHEN p.catalog_source = '1688' THEN '1688' ELSE p.source_platform END" : "p.source_platform"} AS sourcePlatform, p.source_store AS sourceStore,
            p.external_id AS externalId, p.source_url AS sourceUrl, p.shop_domain AS shopDomain,
            p.handle, p.title, p.vendor, p.product_type AS productType,
            p.description_html AS descriptionHtml, p.spu, p.published_at AS publishedAt,
            p.inventory_quantity AS inventoryQuantity, p.currency, p.status, p.sync_state AS syncState,
            p.price_min AS priceMin, p.price_max AS priceMax, p.compare_at_price AS compareAtPrice,
            p.cost_min AS costMin, p.cost_max AS costMax, p.tags_json AS tags,
            p.options_json AS options, p.attributes_json AS attributes,
            p.categories_json AS categories, p.content_json AS content, p.raw_json AS raw,
            ${productColumn("catalog_source")} AS catalogSource, ${productColumn("offer_id_1688")} AS offerId1688,
            ${productColumn("supplier_id_1688")} AS supplierId1688, ${productColumn("supplier_name_1688")} AS supplierName1688,
            ${productColumn("min_order_quantity_1688")} AS minOrderQuantity1688, ${productColumn("unit_1688")} AS unit1688,
            ${productColumn("province_1688")} AS province1688, ${productColumn("city_1688")} AS city1688,
            ${productColumn("short_description_1688")} AS shortDescription1688, ${productColumn("total_price_1688")} AS totalPrice1688,
            ${productColumn("suggested_price_1688")} AS suggestedPrice1688, ${productColumn("original_price_1688")} AS originalPrice1688,
            ${productColumn("stock_quantity_1688")} AS stockQuantity1688, ${productColumn("sold_quantity_1688")} AS soldQuantity1688,
            ${productColumn("brand_1688")} AS brand1688, ${productColumn("brand_id_1688")} AS brandId1688,
            ${productColumn("root_category_id_1688")} AS rootCategoryId1688, ${productColumn("category_id_1688")} AS categoryId1688,
            ${productColumn("seller_nick_1688")} AS sellerNick1688, ${productColumn("location_1688")} AS location1688,
            ${productColumn("item_weight_1688")} AS itemWeight1688, ${productColumn("item_size_1688")} AS itemSize1688,
            ${productColumn("shop_id_1688")} AS shopId1688, ${productColumn("video_url_1688")} AS videoUrl1688,
            ${productColumn("sample_id_1688")} AS sampleId1688, ${productColumn("shipping_to_1688")} AS shippingTo1688,
            ${productColumn("has_discount_1688")} AS hasDiscount1688, ${productColumn("is_promotion_1688")} AS isPromotion1688,
            ${productColumn("fetched_at_1688")} AS fetchedAt1688,
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

export async function getCachedOneBoundItem(env: Env, offerId: string): Promise<{ payload: JsonRow; fetchedAt: string } | null> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS onebound_item_cache (
      offer_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
      fetched_at TEXT NOT NULL
    )`,
  ).run();
  const row = await env.DB.prepare(
    `SELECT payload_json AS payloadJson, fetched_at AS fetchedAt FROM onebound_item_cache WHERE offer_id = ?`,
  ).bind(offerId).first<JsonRow>();
  if (!row || typeof row.fetchedAt !== "string") return null;
  const payload = parseJsonValue(row.payloadJson, null);
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? { payload: payload as JsonRow, fetchedAt: row.fetchedAt }
    : null;
}

export async function putCachedOneBoundItem(env: Env, offerId: string, payload: JsonRow): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS onebound_item_cache (
      offer_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
      fetched_at TEXT NOT NULL
    )`,
  ).run();
  await env.DB.prepare(
    `INSERT INTO onebound_item_cache (offer_id, payload_json, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(offer_id) DO UPDATE SET payload_json = excluded.payload_json, fetched_at = excluded.fetched_at`,
  ).bind(offerId, jsonText(payload, {}), String(payload.cachedAt ?? new Date().toISOString())).run();
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

export async function dashboardSummary(env: Env, viewer?: ProductViewer): Promise<JsonRow> {
  const productScope = viewer?.role === "admin" ? "" : " AND created_by = ?";
  const productBindings = viewer?.role === "admin" ? [] : [viewer?.id ?? ""];
  const productCounts = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS newCount,
            SUM(CASE WHEN status = 'image_searching' THEN 1 ELSE 0 END) AS searchingCount,
            SUM(CASE WHEN status = 'matched' THEN 1 ELSE 0 END) AS matchedCount,
            SUM(CASE WHEN status = 'reviewed' THEN 1 ELSE 0 END) AS reviewedCount
       FROM products WHERE status != 'archived'${productScope}`,
  ).bind(...productBindings).first<JsonRow>();
  let offerCount: { count?: number } | null = null;
  try {
    offerCount = viewer?.role === "admin"
      ? await env.DB.prepare("SELECT COUNT(*) AS count FROM products WHERE catalog_source = '1688' AND status != 'archived'").first<JsonRow>()
      : await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM products WHERE catalog_source = '1688' AND status != 'archived' AND created_by = ?",
      ).bind(viewer?.id ?? "").first<JsonRow>();
  } catch (error) {
    // Keep older remote databases usable until the catalog migration is applied.
    console.warn(JSON.stringify({ level: "warn", event: "dashboard_catalog_source_fallback", error: error instanceof Error ? error.message : String(error) }));
    offerCount = viewer?.role === "admin"
      ? await env.DB.prepare("SELECT COUNT(*) AS count FROM products WHERE source_platform = '1688' AND status != 'archived'").first<JsonRow>()
      : await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM products WHERE source_platform = '1688' AND status != 'archived' AND created_by = ?",
      ).bind(viewer?.id ?? "").first<JsonRow>();
  }
  const [userCount, recentResult] = await env.DB.batch<JsonRow>([
    viewer?.role === "admin"
      ? env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE is_active = 1")
      : env.DB.prepare("SELECT 1 AS count"),
    env.DB.prepare(
      `SELECT p.id, p.title, p.status, p.updated_at AS updatedAt,
              COALESCE((SELECT CASE WHEN pi.r2_key IS NOT NULL THEN '/media/' || pi.r2_key ELSE pi.url END
                FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position LIMIT 1), '') AS thumbnailUrl
         FROM products p WHERE p.status != 'archived'${viewer?.role === "admin" ? "" : " AND p.created_by = ?"}
         ORDER BY p.updated_at DESC LIMIT 6`,
    ).bind(...productBindings),
  ]);
  return {
    ...(productCounts ?? {}),
    offerCount: offerCount?.count ?? 0,
    activeUsers: userCount.results[0]?.count ?? 0,
    recentProducts: recentResult.results,
  };
}

const searchTaskSelect = `SELECT id, client_id AS clientId, name, status, source_image_url AS sourceImageUrl,
        source_page AS sourcePage, options_json AS options, result_count AS resultCount,
        results_json AS results, error, charged_credits AS chargedCredits,
        product_title AS productTitle, description, sku, source_site AS sourceSite,
        product_url AS productUrl, images_json AS images, selected_image_id AS selectedImageId,
        selected_image_url AS selectedImageUrl,
        created_at AS createdAt, updated_at AS updatedAt, completed_at AS completedAt
   FROM search_tasks`;

function offerIdFromResult(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const offerId = (value as Record<string, unknown>).offerId;
  return typeof offerId === "string" && offerId.trim() ? offerId.trim() : null;
}

async function hydrateSearchTasks(env: Env, rows: JsonRow[]): Promise<JsonRow[]> {
  if (!rows.length) return [];
  const taskIds = rows.map((row) => String(row.id));
  const placeholders = taskIds.map(() => "?").join(", ");
  const [runResult, importResult] = await env.DB.batch<JsonRow>([
    env.DB.prepare(
      `SELECT id, task_id AS taskId, image_id AS imageId, image_url AS imageUrl, status,
              options_json AS options, page, page_size AS pageSize, uploaded_image_id AS uploadedImageId,
              result_count AS resultCount, total_result_count AS totalResultCount, results_json AS results,
              error, charged_credits AS chargedCredits, created_at AS createdAt, completed_at AS completedAt
         FROM search_task_runs WHERE task_id IN (${placeholders}) ORDER BY created_at DESC`,
    ).bind(...taskIds),
    env.DB.prepare(
      `SELECT task_id AS taskId, run_id AS runId, offer_id AS offerId, product_id AS productId,
              imported_at AS importedAt
         FROM search_task_imports WHERE task_id IN (${placeholders}) ORDER BY imported_at DESC`,
    ).bind(...taskIds),
  ]);
  const runsByTask = new Map<string, JsonRow[]>();
  for (const row of runResult.results) {
    const taskId = String(row.taskId);
    const values = runsByTask.get(taskId) ?? [];
    values.push(hydrateJson(row, [["options", {}], ["results", []]]));
    runsByTask.set(taskId, values);
  }
  const importsByTask = new Map<string, JsonRow[]>();
  for (const row of importResult.results) {
    const taskId = String(row.taskId);
    const values = importsByTask.get(taskId) ?? [];
    values.push(row);
    importsByTask.set(taskId, values);
  }

  return rows.map((rawRow) => {
    const task = hydrateJson(rawRow, [["options", {}], ["results", []], ["images", []]]);
    const taskId = String(task.id);
    const imports = importsByTask.get(taskId) ?? [];
    const importedByOffer = new Map(imports.map((item) => [String(item.offerId), item]));
    const runs: JsonRow[] = (runsByTask.get(taskId) ?? []).map((run): JsonRow => {
      const results = Array.isArray(run.results) ? run.results.map((result) => {
        const offerId = offerIdFromResult(result);
        const imported = offerId ? importedByOffer.get(offerId) : undefined;
        return result && typeof result === "object" && !Array.isArray(result)
          ? { ...result as Record<string, unknown>, imported: Boolean(imported), importedAt: imported?.importedAt ?? null, productId: imported?.productId ?? null }
          : result;
      }) : [];
      return { ...run, results };
    });
    const latestRun = runs[0];
    const latestCompletedRun = runs.find((run) => run.status === "completed");
    return {
      ...task,
      status: imports.length > 0 ? "imported" : latestCompletedRun ? "queried" : "unqueried",
      legacyStatus: latestRun?.status === "running" ? "running" : latestRun?.status === "failed" ? "failed" : latestCompletedRun ? "completed" : "queued",
      querying: runs.some((run) => run.status === "running"),
      runs,
      results: latestCompletedRun?.results ?? [],
      resultCount: runs.reduce((sum, run) => sum + Number(run.resultCount ?? 0), 0),
      chargedCredits: runs.reduce((sum, run) => sum + Number(run.chargedCredits ?? 0), 0),
      importedCount: imports.length,
      selectedImageId: latestRun?.imageId ?? task.selectedImageId,
      selectedImageUrl: latestRun?.imageUrl ?? task.selectedImageUrl,
      options: latestRun?.options ?? task.options,
      error: latestRun?.status === "failed" ? latestRun.error ?? null : null,
      completedAt: latestCompletedRun?.completedAt ?? task.completedAt,
    };
  });
}

export async function upsertSearchTask(env: Env, userId: string, input: SearchTaskSyncInput): Promise<JsonRow> {
  await ensureSearchTasksSchema(env);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const firstImageUrl = input.images[0]?.url ?? null;
  await env.DB.prepare(
    `INSERT INTO search_tasks
      (id, user_id, client_id, name, status, source_image_url, source_page, options_json,
       result_count, results_json, error, charged_credits, product_title, description, sku,
       source_site, product_url, images_json, created_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, 0, '[]', NULL, 0, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(user_id, client_id) DO UPDATE SET
       name = excluded.name,
       source_image_url = COALESCE(search_tasks.selected_image_url, excluded.source_image_url),
       source_page = excluded.source_page,
       options_json = excluded.options_json,
       product_title = excluded.product_title,
       description = excluded.description,
       sku = excluded.sku,
       source_site = excluded.source_site,
       product_url = excluded.product_url,
       images_json = excluded.images_json,
       updated_at = excluded.updated_at`,
  ).bind(
    id, userId, input.clientId, input.name, firstImageUrl, input.productUrl ?? null,
    jsonText(input.options, {}), input.productTitle ?? null, input.description ?? null, input.sku ?? null,
    input.sourceSite ?? null, input.productUrl ?? null, jsonText(input.images, []), now, now,
  ).run();
  const row = await env.DB.prepare(`${searchTaskSelect} WHERE user_id = ? AND client_id = ?`)
    .bind(userId, input.clientId).first<JsonRow>();
  return (await hydrateSearchTasks(env, row ? [row] : []))[0] ?? {};
}

export async function listSearchTasks(env: Env, userId: string, query: SearchTaskListQuery): Promise<{
  items: JsonRow[];
  page: number;
  pageSize: number;
  total: number;
}> {
  await ensureSearchTasksSchema(env);
  const where = ["user_id = ?"];
  const bindings: unknown[] = [userId];
  if (query.status === "unqueried") where.push("NOT EXISTS (SELECT 1 FROM search_task_runs WHERE task_id = search_tasks.id AND status = 'completed') AND NOT EXISTS (SELECT 1 FROM search_task_imports WHERE task_id = search_tasks.id)");
  if (query.status === "queried") where.push("EXISTS (SELECT 1 FROM search_task_runs WHERE task_id = search_tasks.id AND status = 'completed') AND NOT EXISTS (SELECT 1 FROM search_task_imports WHERE task_id = search_tasks.id)");
  if (query.status === "imported") where.push("EXISTS (SELECT 1 FROM search_task_imports WHERE task_id = search_tasks.id)");
  if (query.search) {
    where.push(
      `(instr(lower(name), lower(?)) > 0
        OR instr(lower(COALESCE(product_title, '')), lower(?)) > 0
        OR instr(lower(COALESCE(sku, '')), lower(?)) > 0
        OR instr(lower(client_id), lower(?)) > 0
        OR instr(lower(COALESCE(product_url, source_page, '')), lower(?)) > 0
        OR instr(lower(results_json), lower(?)) > 0
        OR EXISTS (SELECT 1 FROM search_task_runs WHERE task_id = search_tasks.id AND instr(lower(results_json), lower(?)) > 0))`,
    );
    bindings.push(query.search, query.search, query.search, query.search, query.search, query.search, query.search);
  }

  const whereSql = where.join(" AND ");
  const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM search_tasks WHERE ${whereSql}`)
    .bind(...bindings)
    .first<{ count: number }>();
  const offset = (query.page - 1) * query.pageSize;
  const result = await env.DB.prepare(`${searchTaskSelect} WHERE ${whereSql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .bind(...bindings, query.pageSize, offset).all<JsonRow>();
  return {
    items: await hydrateSearchTasks(env, result.results),
    page: query.page,
    pageSize: query.pageSize,
    total: count?.count ?? 0,
  };
}

export async function getSearchTask(env: Env, userId: string, taskId: string): Promise<JsonRow | null> {
  await ensureSearchTasksSchema(env);
  const row = await env.DB.prepare(`${searchTaskSelect} WHERE id = ? AND user_id = ?`)
    .bind(taskId, userId).first<JsonRow>();
  return row ? (await hydrateSearchTasks(env, [row]))[0] ?? null : null;
}

export async function startSearchTask(
  env: Env,
  userId: string,
  taskId: string,
  imageId: string,
  imageUrl: string,
  options: Omit<SearchTaskRunInput, "imageId">,
): Promise<string | null> {
  await ensureSearchTasksSchema(env);
  const active = await env.DB.prepare("SELECT id FROM search_task_runs WHERE task_id = ? AND status = 'running'")
    .bind(taskId).first<{ id: string }>();
  if (active) return null;
  const runId = crypto.randomUUID();
  try {
    await env.DB.prepare(
      `INSERT INTO search_task_runs
        (id, task_id, user_id, image_id, image_url, status, options_json, page, page_size)
       VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?)`,
    ).bind(runId, taskId, userId, imageId, imageUrl, jsonText(options, {}), options.page, options.limit).run();
  } catch {
    return null;
  }
  await env.DB.prepare(
    `UPDATE search_tasks
        SET status = 'running', selected_image_id = ?, selected_image_url = ?, source_image_url = ?,
            options_json = ?, error = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND user_id = ?`,
  ).bind(imageId, imageUrl, imageUrl, jsonText(options, {}), taskId, userId).run();
  return runId;
}

export async function completeSearchTask(
  env: Env,
  userId: string,
  taskId: string,
  runId: string,
  values: {
    results: unknown[];
    resultCount: number;
    totalResultCount: number | null;
    uploadedImageId: string;
    chargedCredits: number;
  },
): Promise<JsonRow | null> {
  await ensureSearchTasksSchema(env);
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE search_task_runs
          SET status = 'completed', uploaded_image_id = ?, results_json = ?, result_count = ?,
              total_result_count = ?, charged_credits = ?, error = NULL,
              completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ? AND task_id = ? AND user_id = ?`,
    ).bind(values.uploadedImageId, jsonText(values.results, []), values.resultCount, values.totalResultCount, values.chargedCredits, runId, taskId, userId),
    env.DB.prepare(
      `UPDATE search_tasks
        SET status = 'completed', results_json = ?, result_count = ?, charged_credits = charged_credits + ?,
            error = NULL, completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND user_id = ?`,
    ).bind(jsonText(values.results, []), values.resultCount, values.chargedCredits, taskId, userId),
  ]);
  return getSearchTask(env, userId, taskId);
}

export async function failSearchTask(env: Env, userId: string, taskId: string, runId: string, error: string): Promise<void> {
  await ensureSearchTasksSchema(env);
  const message = error.slice(0, 2_000);
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE search_task_runs SET status = 'failed', error = ?, completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ? AND task_id = ? AND user_id = ?`,
    ).bind(message, runId, taskId, userId),
    env.DB.prepare(
      `UPDATE search_tasks SET status = 'failed', error = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ? AND user_id = ?`,
    ).bind(message, taskId, userId),
  ]);
}

export async function recordSearchTaskImports(
  env: Env,
  taskId: string,
  runId: string | null,
  imported: Array<{ offerId: string; productId: string }>,
): Promise<void> {
  if (!imported.length) return;
  await ensureSearchTasksSchema(env);
  await env.DB.batch(imported.map((item) => env.DB.prepare(
    `INSERT INTO search_task_imports (id, task_id, run_id, offer_id, product_id)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(task_id, offer_id) DO UPDATE SET
       run_id = COALESCE(excluded.run_id, search_task_imports.run_id),
       product_id = excluded.product_id,
       imported_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).bind(crypto.randomUUID(), taskId, runId, item.offerId, item.productId)));
}

export async function deleteSearchTask(env: Env, userId: string, taskId: string): Promise<boolean> {
  await ensureSearchTasksSchema(env);
  const result = await env.DB.prepare("DELETE FROM search_tasks WHERE id = ? AND user_id = ?")
    .bind(taskId, userId).run();
  return result.meta.changes === 1;
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
    `SELECT u.id, u.username, u.display_name AS displayName, u.email, u.avatar_url AS avatarUrl,
            u.auth_provider AS authProvider, u.role, w.balance AS credits, u.is_active AS isActive,
            created_at AS createdAt, updated_at AS updatedAt, last_login_at AS lastLoginAt
       FROM users u JOIN credit_wallets w ON w.user_id = u.id
       ORDER BY u.is_active DESC, u.created_at`,
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
