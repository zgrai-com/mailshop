import { getProduct } from "./db";
import { ApiError } from "./http";
import { decryptSetting, encryptSetting } from "./settings-crypto";
import type { ShopifySettingsInput } from "./validation";

const SHOPIFY_API_VERSION = "2026-07";
const SHOPIFY_GRAPHQL_TIMEOUT_MS = 25_000;
const MAX_PRODUCT_IMAGES = 20;
const MAX_PRODUCT_IMAGE_BYTES = 25 * 1024 * 1024;
let shopifySchemaReady: Promise<void> | null = null;

type ShopifyStoreRow = {
  id: string;
  owner_user_id: string | null;
  shop_domain: string;
  display_name: string | null;
  status: "planned" | "installing" | "active" | "disabled" | "error";
  api_version: string | null;
  client_id_ciphertext: string | null;
  client_secret_ciphertext: string | null;
  last_verified_at: string | null;
  last_error: string | null;
  updated_at: string;
};

type ShopifyAccessToken = { access_token?: string; scope?: string; expires_in?: number; error?: string; error_description?: string };
type GraphqlError = { message?: string; extensions?: { code?: string } };
type GraphqlResponse<T> = { data?: T; errors?: GraphqlError[] };
type ShopifyProduct = {
  title: string;
  descriptionHtml?: string | null;
  vendor?: string | null;
  productType?: string | null;
  handle?: string | null;
  tags: string[];
  options: Array<{ name: string; values: string[] }>;
  priceMin?: number | null;
  variants: Array<{
    price?: number | null;
    compareAtPrice?: number | null;
    barcode?: string | null;
    sku?: string | null;
    option1?: string | null;
    option2?: string | null;
    option3?: string | null;
  }>;
  images: Array<{ r2Key?: string | null; url?: string | null; contentType?: string | null; altText?: string | null }>;
};

export type ShopifyProductListItem = {
  id: string;
  title: string;
  handle: string | null;
  status: string;
  vendor: string | null;
  productType: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
  totalInventory: number | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: string;
  featuredImage: { url: string; altText: string | null } | null;
  variantCount: number;
  tags: string[];
};

export type ShopifyProductDetail = ShopifyProductListItem & {
  descriptionHtml: string;
  templateSuffix: string | null;
  giftCard: boolean;
  seo: { title: string | null; description: string | null };
  options: Array<{ name: string; values: string[] }>;
  images: Array<{ id: string; url: string; altText: string | null; position: number }>;
  variants: Array<{
    id: string;
    title: string;
    sku: string | null;
    barcode: string | null;
    price: number | null;
    compareAtPrice: number | null;
    inventoryQuantity: number | null;
    selectedOptions: Array<{ name: string; value: string }>;
    imageUrl: string | null;
  }>;
};

export type ShopifyLocale = {
  locale: string;
  name: string;
  primary: boolean;
  published: boolean;
};

export type ShopifyMarket = {
  id: string;
  name: string;
};

export type ShopifyTranslatableContent = {
  resourceId: string;
  resourceType: string;
  resourceLabel: string;
  key: string;
  value: string;
  digest: string;
  locale: string;
};

export type ShopifyTranslation = {
  resourceId: string;
  resourceType: string;
  resourceLabel: string;
  key: string;
  value: string;
  locale: string;
  outdated: boolean;
  marketId: string | null;
  marketName: string | null;
};

export type ShopifyProductListQuery = {
  storeId: string;
  search: string;
  status: "all" | "ACTIVE" | "DRAFT" | "ARCHIVED" | "UNLISTED";
  productType: string;
  vendor: string;
  inventory: "all" | "in_stock" | "out_of_stock";
  sortKey: "TITLE" | "UPDATED_AT" | "CREATED_AT" | "INVENTORY_TOTAL" | "PRICE" | "PRODUCT_TYPE" | "VENDOR";
  reverse: boolean;
  first: number;
  after: string | null;
};

export type ShopifyProductUpdateInput = {
  storeId: string;
  productId: string;
  title: string;
  descriptionHtml: string;
  handle: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: "ACTIVE" | "DRAFT" | "ARCHIVED" | "UNLISTED";
  templateSuffix: string;
  seoTitle: string;
  seoDescription: string;
  mediaUrls: string[];
  variants: Array<{
    id: string;
    price: string;
    compareAtPrice: string;
    sku: string;
    barcode: string;
  }>;
};

const PRODUCT_FIELDS = `
  id title handle status vendor productType updatedAt publishedAt totalInventory tags
  descriptionHtml templateSuffix
  priceRangeV2 { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
  featuredImage { url altText }
  seo { title description }
  options { name optionValues { name } }
  images(first: 250) { nodes { id url altText } }
  variants(first: 250) {
    nodes {
      id title sku barcode price compareAtPrice inventoryQuantity
      selectedOptions { name value }
      image { url }
    }
  }
`;

type RawShopifyProduct = {
  id: string;
  title: string;
  handle?: string | null;
  status?: string | null;
  vendor?: string | null;
  productType?: string | null;
  updatedAt?: string | null;
  publishedAt?: string | null;
  totalInventory?: number | null;
  tags?: string[];
  descriptionHtml?: string | null;
  templateSuffix?: string | null;
  priceRangeV2?: { minVariantPrice?: { amount?: string; currencyCode?: string }; maxVariantPrice?: { amount?: string } };
  featuredImage?: { url?: string; altText?: string | null } | null;
  seo?: { title?: string | null; description?: string | null } | null;
  options?: Array<{ name?: string; optionValues?: Array<{ name?: string }> }>;
  images?: { nodes?: Array<{ id: string; url: string; altText?: string | null }> };
  variants?: { nodes?: Array<{ id: string; title: string; sku?: string | null; barcode?: string | null; price?: string | null; compareAtPrice?: string | null; inventoryQuantity?: number | null; selectedOptions?: Array<{ name: string; value: string }>; image?: { url?: string } | null }> };
};

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function mapShopifyProduct(raw: RawShopifyProduct): ShopifyProductDetail {
  const min = numberOrNull(raw.priceRangeV2?.minVariantPrice?.amount);
  const max = numberOrNull(raw.priceRangeV2?.maxVariantPrice?.amount);
  const variants = raw.variants?.nodes ?? [];
  return {
    id: raw.id,
    title: raw.title,
    handle: raw.handle ?? null,
    status: raw.status ?? "DRAFT",
    vendor: raw.vendor ?? null,
    productType: raw.productType ?? null,
    updatedAt: raw.updatedAt ?? null,
    publishedAt: raw.publishedAt ?? null,
    totalInventory: raw.totalInventory ?? null,
    priceMin: min,
    priceMax: max,
    currency: raw.priceRangeV2?.minVariantPrice?.currencyCode ?? "USD",
    featuredImage: raw.featuredImage?.url ? { url: raw.featuredImage.url, altText: raw.featuredImage.altText ?? null } : null,
    variantCount: variants.length,
    tags: raw.tags ?? [],
    descriptionHtml: raw.descriptionHtml ?? "",
    templateSuffix: raw.templateSuffix ?? null,
    // Shopify's current Product schema no longer exposes `giftCard`.
    // Keep the response shape backwards-compatible for existing clients.
    giftCard: false,
    seo: { title: raw.seo?.title ?? null, description: raw.seo?.description ?? null },
    options: (raw.options ?? []).map((option) => ({ name: option.name ?? "", values: (option.optionValues ?? []).map((value) => value.name ?? "").filter(Boolean) })).filter((option) => option.name),
    images: (raw.images?.nodes ?? []).map((image, index) => ({ id: image.id, url: image.url, altText: image.altText ?? null, position: index })),
    variants: variants.map((variant) => ({
      id: variant.id,
      title: variant.title,
      sku: variant.sku ?? null,
      barcode: variant.barcode ?? null,
      price: numberOrNull(variant.price),
      compareAtPrice: numberOrNull(variant.compareAtPrice),
      inventoryQuantity: variant.inventoryQuantity ?? null,
      selectedOptions: variant.selectedOptions ?? [],
      imageUrl: variant.image?.url ?? null,
    })),
  };
}

function shopifyProductSearch(input: ShopifyProductListQuery): string | null {
  const parts: string[] = [];
  if (input.search.trim()) parts.push(input.search.trim());
  if (input.status !== "all") parts.push(`status:${input.status.toLowerCase()}`);
  if (input.productType.trim()) parts.push(`product_type:\"${input.productType.trim().replaceAll('"', '\\\"')}\"`);
  if (input.vendor.trim()) parts.push(`vendor:\"${input.vendor.trim().replaceAll('"', '\\\"')}\"`);
  if (input.inventory === "in_stock") parts.push("inventory_total:>0");
  if (input.inventory === "out_of_stock") parts.push("inventory_total:<=0");
  return parts.length ? parts.join(" ") : null;
}

export async function listShopifyProducts(env: Env, userId: string, input: ShopifyProductListQuery): Promise<{ products: ShopifyProductListItem[]; pageInfo: { hasNextPage: boolean; endCursor: string | null }; store: ShopifyStoreSummary }> {
  const store = await getStoreRow(env, input.storeId, userId);
  const credentials = await decryptCredentials(env, store);
  const token = await getAccessToken(store, credentials);
  if (!token.scopes.includes("read_products") && !token.scopes.includes("write_products")) {
    throw new ApiError(403, "Shopify 应用缺少 read_products 权限，请更新应用权限并重新安装", "shopify_scope_missing");
  }
  const graphqlSortKey = input.sortKey === "PRICE" ? "UPDATED_AT" : input.sortKey;
  const data = await graphql<{ products: { nodes: RawShopifyProduct[]; pageInfo: { hasNextPage: boolean; endCursor?: string | null } } }>(store, token.accessToken, `query Products($first: Int!, $after: String, $query: String, $sortKey: ProductSortKeys!, $reverse: Boolean!) {
    products(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) { nodes { ${PRODUCT_FIELDS} } pageInfo { hasNextPage endCursor } }
  }`, { first: input.first, after: input.after, query: shopifyProductSearch(input), sortKey: graphqlSortKey, reverse: input.reverse });
  await updateStoreHealth(env, store.id, "active", null);
  return {
    products: data.products.nodes.map((product) => mapShopifyProduct(product)),
    pageInfo: { hasNextPage: data.products.pageInfo.hasNextPage, endCursor: data.products.pageInfo.endCursor ?? null },
    store: toSummary(await getStoreRow(env, store.id, userId), credentials),
  };
}

export async function getShopifyProduct(env: Env, userId: string, storeId: string, productId: string): Promise<{ product: ShopifyProductDetail; store: ShopifyStoreSummary }> {
  const store = await getStoreRow(env, storeId, userId);
  const credentials = await decryptCredentials(env, store);
  const token = await getAccessToken(store, credentials);
  const data = await graphql<{ product: RawShopifyProduct | null }>(store, token.accessToken, `query Product($id: ID!) { product(id: $id) { ${PRODUCT_FIELDS} } }`, { id: productId });
  if (!data.product) throw new ApiError(404, "Shopify 商品不存在", "shopify_product_not_found");
  return { product: mapShopifyProduct(data.product), store: toSummary(store, credentials) };
}

type ShopifyTranslationResourceResponse = {
  resourceId: string;
  translatableContent: Array<{ key: string; value: string; digest: string; locale: string }>;
  translations: Array<{ key: string; value: string; locale: string; outdated?: boolean; market?: { id?: string | null; name?: string | null } | null }>;
};

type ShopifyTranslationResourcePage = ShopifyTranslationResourceResponse & {
  nestedTranslatableResources?: {
    nodes?: ShopifyTranslationResourceResponse[];
    pageInfo: { hasNextPage: boolean; endCursor?: string | null };
  };
};

function requiredTranslationScopes(scopes: string[]): string[] {
  return ["read_locales", "read_translations", "write_translations"].filter((scope) => !scopes.includes(scope));
}

async function getShopLocales(store: ShopifyStoreRow, accessToken: string): Promise<ShopifyLocale[]> {
  const data = await graphql<{ shopLocales: Array<{ locale: string; name: string; primary: boolean; published: boolean }> }>(store, accessToken, "query ShopLocales { shopLocales { locale name primary published } }", {});
  return data.shopLocales.map((locale) => ({ locale: locale.locale, name: locale.name, primary: Boolean(locale.primary), published: Boolean(locale.published) }));
}

async function getShopMarkets(store: ShopifyStoreRow, accessToken: string): Promise<ShopifyMarket[]> {
  let after: string | null = null;
  const markets: ShopifyMarket[] = [];
  do {
    const data: { markets: { nodes?: Array<{ id: string; name: string }>; pageInfo: { hasNextPage: boolean; endCursor?: string | null } } } = await graphql(
      store,
      accessToken,
      "query ShopMarkets($after: String) { markets(first: 250, after: $after) { nodes { id name } pageInfo { hasNextPage endCursor } } }",
      { after },
    );
    markets.push(...(data.markets.nodes ?? []).map((market) => ({ id: market.id, name: market.name })));
    after = data.markets.pageInfo.hasNextPage ? data.markets.pageInfo.endCursor ?? null : null;
  } while (after);
  return markets;
}

async function getTranslationResources(store: ShopifyStoreRow, accessToken: string, productId: string, locale: string, marketId?: string): Promise<ShopifyTranslationResourceResponse[]> {
  let after: string | null = null;
  let root: ShopifyTranslationResourceResponse | null = null;
  const nested: ShopifyTranslationResourceResponse[] = [];
  do {
    const data: { translatableResource: ShopifyTranslationResourcePage | null } = await graphql<{ translatableResource: ShopifyTranslationResourcePage | null }>(store, accessToken, `query ProductTranslations($resourceId: ID!, $locale: String!, $marketId: ID, $after: String) {
      translatableResource(resourceId: $resourceId) {
        resourceId
        translatableContent(marketId: $marketId) { key value digest locale }
        translations(locale: $locale, marketId: $marketId) { key value locale outdated market { id name } }
        nestedTranslatableResources(first: 250, after: $after) {
          nodes {
            resourceId
            translatableContent(marketId: $marketId) { key value digest locale }
            translations(locale: $locale, marketId: $marketId) { key value locale outdated market { id name } }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }`, { resourceId: productId, locale, marketId: marketId || null, after });
    if (!data.translatableResource) throw new ApiError(404, "Shopify 商品没有可翻译内容", "shopify_translation_resource_not_found");
    root ??= data.translatableResource;
    nested.push(...(data.translatableResource.nestedTranslatableResources?.nodes ?? []));
    const pageInfo: { hasNextPage: boolean; endCursor?: string | null } | undefined = data.translatableResource.nestedTranslatableResources?.pageInfo;
    after = pageInfo?.hasNextPage ? pageInfo.endCursor ?? null : null;
  } while (after);
  if (!root) throw new ApiError(404, "Shopify 商品没有可翻译内容", "shopify_translation_resource_not_found");
  return [root, ...nested];
}

function translationResourceMetadata(resource: ShopifyTranslationResourceResponse, productId: string): { resourceType: string; resourceLabel: string } {
  const parts = resource.resourceId.split("/");
  const resourceType = parts.at(-2) || "Resource";
  if (resource.resourceId === productId) return { resourceType: "Product", resourceLabel: "商品" };
  const label = resource.translatableContent.find((item) => ["title", "name", "label"].includes(item.key) && item.value.trim())?.value.trim();
  return { resourceType, resourceLabel: label || `${resourceType} ${parts.at(-1) || ""}`.trim() };
}

export async function getShopifyProductTranslations(env: Env, userId: string, storeId: string, productId: string, locale?: string, marketId?: string): Promise<{
  locales: ShopifyLocale[];
  markets: ShopifyMarket[];
  marketId: string | null;
  missingScopes: string[];
  translatableContent: ShopifyTranslatableContent[];
  translations: ShopifyTranslation[];
  locale: string;
}> {
  const store = await getStoreRow(env, storeId, userId);
  const credentials = await decryptCredentials(env, store);
  const token = await getAccessToken(store, credentials);
  const missingScopes = requiredTranslationScopes(token.scopes);
  if (missingScopes.length) throw new ApiError(403, "Shopify 应用缺少多语言权限：" + missingScopes.join(", ") + "，请更新应用权限并重新授权", "shopify_translation_scope_missing", { missingScopes });
  const locales = await getShopLocales(store, token.accessToken);
  const selectedLocale = locale || locales.find((item) => !item.primary && item.published)?.locale || locales.find((item) => !item.primary)?.locale;
  if (!selectedLocale) throw new ApiError(422, "Shopify 店铺还没有可翻译的目标语言，请先在 Shopify 后台添加语言", "shopify_target_locale_empty");
  if (!locales.some((item) => item.locale === selectedLocale)) throw new ApiError(422, "目标语言不在 Shopify 店铺语言列表中", "shopify_locale_invalid");
  if (locales.find((item) => item.locale === selectedLocale)?.primary) throw new ApiError(422, "主语言是商品源内容，不能作为翻译目标语言", "shopify_locale_primary");
  const resources = await getTranslationResources(store, token.accessToken, productId, selectedLocale, marketId);
  const markets = token.scopes.includes("read_markets") ? await getShopMarkets(store, token.accessToken) : [];
  return {
    locale: selectedLocale,
    locales,
    markets,
    marketId: marketId || null,
    missingScopes: token.scopes.includes("read_markets") ? [] : ["read_markets"],
    translatableContent: resources.flatMap((resource) => {
      const metadata = translationResourceMetadata(resource, productId);
      return resource.translatableContent.map((item) => ({ resourceId: resource.resourceId, ...metadata, ...item }));
    }),
    translations: resources.flatMap((resource) => {
      const metadata = translationResourceMetadata(resource, productId);
      return resource.translations.map((item) => ({ resourceId: resource.resourceId, ...metadata, key: item.key, value: item.value, locale: item.locale, outdated: Boolean(item.outdated), marketId: item.market?.id ?? null, marketName: item.market?.name ?? null }));
    }),
  };
}

export type ShopifyTranslationPublishInput = {
  storeId: string;
  productId: string;
  locale: string;
  translations: Array<{ resourceId?: string; key: string; value: string; translatableContentDigest: string; marketId?: string }>;
};

export async function registerShopifyTranslations(env: Env, userId: string, input: ShopifyTranslationPublishInput): Promise<{ locale: string; translations: ShopifyTranslation[] }> {
  const store = await getStoreRow(env, input.storeId, userId);
  const credentials = await decryptCredentials(env, store);
  const token = await getAccessToken(store, credentials);
  const missingScopes = requiredTranslationScopes(token.scopes);
  if (missingScopes.length) throw new ApiError(403, "Shopify 应用缺少多语言权限：" + missingScopes.join(", ") + "，请更新应用权限并重新授权", "shopify_translation_scope_missing", { missingScopes });
  const locales = await getShopLocales(store, token.accessToken);
  if (!locales.some((item) => item.locale === input.locale)) throw new ApiError(422, "目标语言不在 Shopify 店铺语言列表中", "shopify_locale_invalid");
  if (locales.find((item) => item.locale === input.locale)?.primary) throw new ApiError(422, "主语言是商品源内容，不能作为翻译目标语言", "shopify_locale_primary");
  const marketIds = [...new Set(input.translations.flatMap((item) => item.marketId ? [item.marketId] : []))];
  if (marketIds.length > 1) throw new ApiError(422, "一次只能发布同一个 Shopify 市场的翻译", "shopify_translation_market_mixed");
  const resources = await getTranslationResources(store, token.accessToken, input.productId, input.locale, marketIds[0]);
  const resourceById = new Map(resources.map((resource) => [resource.resourceId, resource] as const));
  const normalized = input.translations.map((item) => ({ ...item, resourceId: item.resourceId || input.productId }));
  for (const item of normalized) {
    const resource = resourceById.get(item.resourceId);
    const current = resource?.translatableContent.find((content) => content.key === item.key);
    if (!current) throw new ApiError(422, "Shopify 不允许翻译字段：" + item.key, "shopify_translation_key_invalid", { resourceId: item.resourceId, key: item.key });
    if (item.value.trim() && current.digest !== item.translatableContentDigest) throw new ApiError(409, "字段 " + item.key + " 已在 Shopify 中更新，请重新读取后再发布", "shopify_translation_digest_stale", { resourceId: item.resourceId, key: item.key });
  }
  const published: ShopifyTranslation[] = [];
  const itemsByResource = new Map<string, typeof normalized>();
  for (const item of normalized) itemsByResource.set(item.resourceId, [...(itemsByResource.get(item.resourceId) ?? []), item]);
  for (const [resourceId, items] of itemsByResource) {
    const resource = resourceById.get(resourceId)!;
    const metadata = translationResourceMetadata(resource, input.productId);
    const translations = items.filter((item) => item.value.trim());
    if (translations.length) {
      const data = await graphql<{ translationsRegister: { translations?: Array<{ key: string; value: string; locale: string; outdated?: boolean; market?: { id?: string | null; name?: string | null } | null }>; userErrors?: unknown } }>(store, token.accessToken, "mutation RegisterTranslations($resourceId: ID!, $translations: [TranslationInput!]!) { translationsRegister(resourceId: $resourceId, translations: $translations) { translations { key value locale outdated market { id name } } userErrors { field message code } } }", {
        resourceId,
        translations: translations.map((item) => ({ locale: input.locale, key: item.key, value: item.value, translatableContentDigest: item.translatableContentDigest, ...(item.marketId ? { marketId: item.marketId } : {}) })),
      });
      const error = userErrors(data.translationsRegister.userErrors);
      if (error) throw new ApiError(502, error, "shopify_translation_publish_failed");
      published.push(...(data.translationsRegister.translations ?? []).map((item) => ({ resourceId, ...metadata, key: item.key, value: item.value, locale: item.locale, outdated: Boolean(item.outdated), marketId: item.market?.id ?? null, marketName: item.market?.name ?? null })));
    }
    const removals = items.filter((item) => !item.value.trim());
    if (removals.length) {
      const removalGroups = new Map<string, typeof removals>();
      for (const item of removals) removalGroups.set(item.marketId || "", [...(removalGroups.get(item.marketId || "") ?? []), item]);
      for (const [marketId, removalItems] of removalGroups) {
        const data = await graphql<{ translationsRemove: { userErrors?: unknown } }>(store, token.accessToken, "mutation RemoveTranslations($resourceId: ID!, $locales: [String!]!, $translationKeys: [String!]!, $marketIds: [ID!]) { translationsRemove(resourceId: $resourceId, locales: $locales, translationKeys: $translationKeys, marketIds: $marketIds) { userErrors { field message code } } }", {
          resourceId,
          locales: [input.locale],
          translationKeys: removalItems.map((item) => item.key),
          marketIds: marketId ? [marketId] : null,
        });
        const error = userErrors(data.translationsRemove.userErrors);
        if (error) throw new ApiError(502, error, "shopify_translation_remove_failed");
      }
    }
  }
  return {
    locale: input.locale,
    translations: published,
  };
}

export async function updateShopifyProduct(env: Env, userId: string, input: ShopifyProductUpdateInput): Promise<{ product: ShopifyProductDetail }> {
  const store = await getStoreRow(env, input.storeId, userId);
  const credentials = await decryptCredentials(env, store);
  const token = await getAccessToken(store, credentials);
  const productInput: Record<string, unknown> = {
    id: input.productId,
    title: input.title,
    descriptionHtml: input.descriptionHtml,
    handle: input.handle || null,
    vendor: input.vendor,
    productType: input.productType,
    tags: input.tags,
    status: input.status,
    templateSuffix: input.templateSuffix || null,
    seo: { title: input.seoTitle || null, description: input.seoDescription || null },
  };
  const data = await graphql<{ productUpdate: { product: RawShopifyProduct | null; userErrors?: unknown } }>(store, token.accessToken, `mutation ProductUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) { product { ${PRODUCT_FIELDS} } userErrors { field message code } }
  }`, { product: productInput });
  const updateError = userErrors(data.productUpdate.userErrors);
  if (updateError || !data.productUpdate.product) throw new ApiError(502, updateError || "Shopify 商品更新失败", "shopify_product_update_failed");
  const variantUpdates = input.variants.filter((variant) => variant.id).map((variant) => ({
    id: variant.id,
    price: variant.price || null,
    compareAtPrice: variant.compareAtPrice || null,
    sku: variant.sku || null,
    barcode: variant.barcode || null,
  }));
  if (variantUpdates.length) {
    const variantResult = await graphql<{ productVariantsBulkUpdate: { userErrors?: unknown } }>(store, token.accessToken, `mutation ProductVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message code } }
    }`, { productId: input.productId, variants: variantUpdates });
    const variantError = userErrors(variantResult.productVariantsBulkUpdate.userErrors);
    if (variantError) throw new ApiError(502, variantError, "shopify_variant_update_failed");
  }
  if (input.mediaUrls.length) {
    const mediaResult = await graphql<{ productCreateMedia: { userErrors?: unknown } }>(store, token.accessToken, `mutation ProductCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) { userErrors { field message code } }
    }`, { productId: input.productId, media: input.mediaUrls.map((originalSource) => ({ originalSource, mediaContentType: "IMAGE" })) });
    const mediaError = userErrors(mediaResult.productCreateMedia.userErrors);
    if (mediaError) throw new ApiError(502, mediaError, "shopify_media_create_failed");
  }
  await updateStoreHealth(env, store.id, "active", null);
  return getShopifyProduct(env, userId, input.storeId, input.productId);
}

export async function deleteShopifyProduct(env: Env, userId: string, storeId: string, productId: string): Promise<void> {
  const store = await getStoreRow(env, storeId, userId);
  const credentials = await decryptCredentials(env, store);
  const token = await getAccessToken(store, credentials);
  const data = await graphql<{ productDelete: { deletedProductId?: string | null; userErrors?: unknown } }>(store, token.accessToken, `mutation ProductDelete($input: ProductDeleteInput!) { productDelete(input: $input) { deletedProductId userErrors { field message code } } }`, { input: { id: productId } });
  const error = userErrors(data.productDelete.userErrors);
  if (error) throw new ApiError(502, error, "shopify_product_delete_failed");
}

function asShopifyProduct(product: Awaited<ReturnType<typeof getProduct>>): ShopifyProduct {
  const value = product as Record<string, unknown>;
  const variants = Array.isArray(value.variants) ? value.variants : [];
  const images = Array.isArray(value.images) ? value.images : [];
  const options = Array.isArray(value.options) ? value.options : [];
  return {
    title: typeof value.title === "string" ? value.title : "Untitled product",
    descriptionHtml: typeof value.descriptionHtml === "string" ? value.descriptionHtml : null,
    vendor: typeof value.vendor === "string" ? value.vendor : null,
    productType: typeof value.productType === "string" ? value.productType : null,
    handle: typeof value.handle === "string" ? value.handle : null,
    tags: Array.isArray(value.tags) ? value.tags.filter((item): item is string => typeof item === "string") : [],
    options: options.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as { name?: unknown; values?: unknown };
      const name = typeof record.name === "string" ? record.name : "";
      const values = Array.isArray(record.values) ? record.values.filter((entry): entry is string => typeof entry === "string") : [];
      return name && values.length ? [{ name, values }] : [];
    }),
    priceMin: typeof value.priceMin === "number" ? value.priceMin : null,
    variants: variants.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      return [{
        price: typeof record.price === "number" ? record.price : null,
        compareAtPrice: typeof record.compareAtPrice === "number" ? record.compareAtPrice : null,
        barcode: typeof record.barcode === "string" ? record.barcode : null,
        sku: typeof record.sku === "string" ? record.sku : null,
        option1: typeof record.option1 === "string" ? record.option1 : null,
        option2: typeof record.option2 === "string" ? record.option2 : null,
        option3: typeof record.option3 === "string" ? record.option3 : null,
      }];
    }),
    images: images.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      return [{
        r2Key: typeof record.r2Key === "string" ? record.r2Key : null,
        url: typeof record.url === "string" ? record.url : null,
        contentType: typeof record.contentType === "string" ? record.contentType : null,
        altText: typeof record.altText === "string" ? record.altText : null,
      }];
    }),
  };
}

export type ShopifyStoreSummary = {
  id: string;
  shopDomain: string;
  displayName: string | null;
  status: ShopifyStoreRow["status"];
  apiVersion: string;
  configured: boolean;
  clientId: string | null;
  clientSecret: string | null;
  clientIdHint: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

async function ensureShopifySchema(env: Env): Promise<void> {
  if (!shopifySchemaReady) {
    shopifySchemaReady = (async () => {
      const columns = await env.DB.prepare("PRAGMA table_info(shopify_stores)").all<{ name: string }>();
      const existing = new Set(columns.results.map((column) => column.name));
      const additions = [
        ["client_id_ciphertext", "ALTER TABLE shopify_stores ADD COLUMN client_id_ciphertext TEXT"],
        ["client_secret_ciphertext", "ALTER TABLE shopify_stores ADD COLUMN client_secret_ciphertext TEXT"],
        ["last_verified_at", "ALTER TABLE shopify_stores ADD COLUMN last_verified_at TEXT"],
        ["last_error", "ALTER TABLE shopify_stores ADD COLUMN last_error TEXT"],
        ["owner_user_id", "ALTER TABLE shopify_stores ADD COLUMN owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE"],
      ] as const;
      for (const [column, sql] of additions) {
        if (existing.has(column)) continue;
        try {
          await env.DB.prepare(sql).run();
        } catch (error) {
          if (!(error instanceof Error) || !/duplicate column name/iu.test(error.message)) throw error;
        }
      }
      await env.DB.prepare(
        `UPDATE shopify_stores
            SET owner_user_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1)
          WHERE owner_user_id IS NULL`,
      ).run();
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS shopify_product_publications (
          id TEXT PRIMARY KEY,
          store_id TEXT NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          shopify_product_id TEXT,
          shopify_handle TEXT,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'synced', 'failed')),
          last_error TEXT,
          published_at TEXT,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          UNIQUE (store_id, product_id)
        )`,
      ).run();
      await env.DB.prepare(
        "CREATE INDEX IF NOT EXISTS idx_shopify_product_publications_product ON shopify_product_publications(product_id, updated_at DESC)",
      ).run();
      await env.DB.prepare(
        "CREATE INDEX IF NOT EXISTS idx_shopify_stores_owner ON shopify_stores(owner_user_id, updated_at DESC)",
      ).run();
    })().catch((error) => {
      shopifySchemaReady = null;
      throw error;
    });
  }
  await shopifySchemaReady;
}

function normalizeShopDomain(input: string): string {
  const text = input.trim().toLowerCase().replace(/^https?:\/\//u, "").replace(/\/+$/u, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/u.test(text)) {
    throw new ApiError(422, "店铺域名必须是 xxx.myshopify.com", "shopify_domain_invalid");
  }
  return text;
}

function credentialHint(value: string): string {
  return value.length > 10 ? `${value.slice(0, 4)}...${value.slice(-4)}` : "已加密保存";
}

function toSummary(store: ShopifyStoreRow, credentials: { clientId: string; clientSecret: string } | null): ShopifyStoreSummary {
  return {
    id: store.id,
    shopDomain: store.shop_domain,
    displayName: store.display_name,
    status: store.status,
    apiVersion: store.api_version || SHOPIFY_API_VERSION,
    configured: Boolean(store.client_id_ciphertext && store.client_secret_ciphertext),
    clientId: credentials?.clientId ?? null,
    clientSecret: credentials?.clientSecret ?? null,
    clientIdHint: credentials?.clientId ? credentialHint(credentials.clientId) : null,
    lastVerifiedAt: store.last_verified_at,
    lastError: store.last_error,
    updatedAt: store.updated_at,
  };
}

async function getStoreRow(env: Env, storeId: string, userId: string): Promise<ShopifyStoreRow> {
  await ensureShopifySchema(env);
  const store = await env.DB.prepare(
    `SELECT id, owner_user_id, shop_domain, display_name, status, api_version,
            client_id_ciphertext, client_secret_ciphertext, last_verified_at, last_error, updated_at
       FROM shopify_stores WHERE id = ? AND owner_user_id = ?`,
  ).bind(storeId, userId).first<ShopifyStoreRow>();
  if (!store) throw new ApiError(404, "Shopify 店铺不存在或不属于当前用户", "shopify_store_not_found");
  return store;
}

async function decryptCredentials(env: Env, store: ShopifyStoreRow): Promise<{ clientId: string; clientSecret: string }> {
  if (!store.client_id_ciphertext || !store.client_secret_ciphertext) {
    throw new ApiError(503, "Shopify 店铺尚未配置应用凭据", "shopify_not_configured");
  }
  const [clientId, clientSecret] = await Promise.all([
    decryptSetting(env, store.client_id_ciphertext, "shopify_settings_invalid"),
    decryptSetting(env, store.client_secret_ciphertext, "shopify_settings_invalid"),
  ]);
  return { clientId, clientSecret };
}

async function updateStoreHealth(env: Env, storeId: string, status: ShopifyStoreRow["status"], error: string | null, verified = false): Promise<void> {
  await env.DB.prepare(
    `UPDATE shopify_stores
        SET status = ?, last_error = ?,
            last_verified_at = CASE WHEN ? THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE last_verified_at END,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?`,
  ).bind(status, error, verified ? 1 : 0, storeId).run();
}

async function adoptCanonicalShopDomain(env: Env, userId: string, store: ShopifyStoreRow, canonicalDomain: string): Promise<void> {
  if (canonicalDomain === store.shop_domain) return;
  const conflict = await env.DB.prepare("SELECT id FROM shopify_stores WHERE shop_domain = ? AND id <> ?")
    .bind(canonicalDomain, store.id)
    .first<{ id: string }>();
  if (conflict) {
    throw new ApiError(409, `Shopify 返回的规范域名 ${canonicalDomain} 已被其他店铺配置使用`, "shopify_canonical_domain_conflict");
  }
  const result = await env.DB.prepare(
    `UPDATE shopify_stores
        SET shop_domain = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND owner_user_id = ?`,
  ).bind(canonicalDomain, store.id, userId).run();
  if (!result.meta.changes) {
    throw new ApiError(404, "Shopify 店铺不存在或不属于当前用户", "shopify_store_not_found");
  }
  store.shop_domain = canonicalDomain;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const signal = AbortSignal.timeout(SHOPIFY_GRAPHQL_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ApiError(504, "Shopify 请求超时，请稍后重试", "shopify_request_timeout");
    }
    throw error;
  }
}

async function getAccessToken(store: ShopifyStoreRow, credentials: { clientId: string; clientSecret: string }): Promise<{ accessToken: string; scopes: string[] }> {
  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    grant_type: "client_credentials",
  });
  const response = await fetchWithTimeout(`https://${store.shop_domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
  });
  const payload = await response.json().catch(() => ({})) as ShopifyAccessToken;
  if (!response.ok || !payload.access_token) {
    throw new ApiError(502, payload.error_description || payload.error || "Shopify 应用授权失败", "shopify_auth_failed");
  }
  return { accessToken: payload.access_token, scopes: (payload.scope || "").split(",").map((scope) => scope.trim()).filter(Boolean) };
}

async function graphql<T>(store: ShopifyStoreRow, accessToken: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const version = store.api_version || SHOPIFY_API_VERSION;
  const response = await fetchWithTimeout(`https://${store.shop_domain}/admin/api/${version}/graphql.json`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-shopify-access-token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json().catch(() => ({})) as GraphqlResponse<T>;
  if (!response.ok || payload.errors?.length) {
    throw new ApiError(502, payload.errors?.map((item) => item.message).filter(Boolean).join("；") || "Shopify API 请求失败", "shopify_graphql_failed", payload.errors);
  }
  if (!payload.data) throw new ApiError(502, "Shopify API 未返回数据", "shopify_graphql_empty");
  return payload.data;
}

function userErrors(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const messages = value.flatMap((item) => item && typeof item === "object" && typeof (item as { message?: unknown }).message === "string" ? [(item as { message: string }).message] : []);
  return messages.length ? messages.join("；") : null;
}

function productOptions(product: ShopifyProduct): Array<{ name: string; values: Array<{ name: string }> }> {
  const options = Array.isArray(product.options) ? product.options : [];
  const normalized = options.flatMap((option) => {
    if (!option || typeof option !== "object") return [];
    const value = option as { name?: unknown; values?: unknown };
    const name = typeof value.name === "string" ? value.name.trim() : "";
    const values = Array.isArray(value.values)
      ? [...new Set(value.values.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).map((entry) => entry.trim()))]
      : [];
    return name && values.length ? [{ name, values: values.map((entry) => ({ name: entry })) }] : [];
  });
  if (normalized.length || !product.variants.length) return normalized;

  const names = ["Option 1", "Option 2", "Option 3"];
  const inferred = names.flatMap((name, index) => {
    const field = index === 0 ? "option1" : index === 1 ? "option2" : "option3";
    const values = [...new Set(product.variants.flatMap((variant) => {
      const value = variant[field as "option1" | "option2" | "option3"];
      return typeof value === "string" && value.trim() ? [value.trim()] : [];
    }))];
    return values.length ? [{ name, values: values.map((entry) => ({ name: entry })) }] : [];
  });
  return inferred.length ? inferred : [{ name: "Title", values: [{ name: "Default Title" }] }];
}

function buildProductInput(product: ShopifyProduct): Record<string, unknown> {
  const input: Record<string, unknown> = {
    title: product.title,
    status: "DRAFT",
  };
  if (typeof product.descriptionHtml === "string" && product.descriptionHtml.trim()) input.descriptionHtml = product.descriptionHtml;
  if (typeof product.vendor === "string" && product.vendor.trim()) input.vendor = product.vendor;
  if (typeof product.productType === "string" && product.productType.trim()) input.productType = product.productType;
  if (typeof product.handle === "string" && product.handle.trim()) input.handle = product.handle;
  if (Array.isArray(product.tags) && product.tags.length) input.tags = product.tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim()));
  const options = productOptions(product);
  if (options.length) input.productOptions = options;
  return input;
}

function buildVariantInput(product: ShopifyProduct, index: number): Record<string, unknown> {
  const variant = product.variants[index]!;
  const input: Record<string, unknown> = {};
  if (typeof variant.price === "number") input.price = variant.price.toFixed(2);
  else if (typeof product.priceMin === "number") input.price = product.priceMin.toFixed(2);
  if (typeof variant.compareAtPrice === "number") input.compareAtPrice = variant.compareAtPrice.toFixed(2);
  if (typeof variant.barcode === "string" && variant.barcode.trim()) input.barcode = variant.barcode.trim();
  if (typeof variant.sku === "string" && variant.sku.trim()) input.sku = variant.sku.trim();

  const options = productOptions(product);
  const values = options[0]?.name === "Title"
    ? ["Default Title"]
    : [variant.option1, variant.option2, variant.option3];
  const optionValues = options.flatMap((option, optionIndex) => {
    const value = values[optionIndex];
    return typeof value === "string" && value.trim() ? [{ optionName: option.name, name: value.trim() }] : [];
  });
  if (optionValues.length) input.optionValues = optionValues;
  return input;
}

function optionSignature(values: Array<{ optionName?: string; name?: string }>): string {
  return values
    .filter((value) => value.optionName && value.name)
    .map((value) => `${value.optionName!.trim().toLowerCase()}\u0000${value.name!.trim().toLowerCase()}`)
    .sort()
    .join("\u0001");
}

async function buildVariantInputs(store: ShopifyStoreRow, accessToken: string, product: ShopifyProduct, existingProductId: string | null): Promise<Record<string, unknown>[]> {
  const inputs = product.variants.map((_, index) => buildVariantInput(product, index));
  if (!existingProductId || !inputs.length) return inputs;

  const existing: Array<{ id: string; sku?: string | null; selectedOptions: Array<{ name: string; value: string }> }> = [];
  let cursor: string | null = null;
  do {
    const data: {
      product?: {
        variants: {
          nodes: Array<{ id: string; sku?: string | null; selectedOptions: Array<{ name: string; value: string }> }>;
          pageInfo: { hasNextPage: boolean; endCursor?: string | null };
        };
      } | null;
    } = await graphql(store, accessToken, `query ExistingProductVariants($id: ID!, $after: String) {
      product(id: $id) {
        variants(first: 250, after: $after) {
          nodes { id sku selectedOptions { name value } }
          pageInfo { hasNextPage endCursor }
        }
      }
    }`, { id: existingProductId, after: cursor });
    const variants = data.product?.variants;
    if (!variants) return inputs;
    existing.push(...variants.nodes);
    cursor = variants.pageInfo.hasNextPage ? variants.pageInfo.endCursor ?? null : null;
  } while (cursor);

  const bySku = new Map(existing.flatMap((variant) => variant.sku?.trim() ? [[variant.sku.trim().toLowerCase(), variant.id] as const] : []));
  const byOptions = new Map(existing.map((variant) => [
    optionSignature(variant.selectedOptions.map((option) => ({ optionName: option.name, name: option.value }))),
    variant.id,
  ]));
  return inputs.map((input) => {
    const sku = typeof input.sku === "string" ? input.sku.trim().toLowerCase() : "";
    const values = Array.isArray(input.optionValues) ? input.optionValues as Array<{ optionName?: string; name?: string }> : [];
    const existingId = (sku && bySku.get(sku)) || byOptions.get(optionSignature(values));
    return existingId ? { id: existingId, ...input } : input;
  });
}

function fileName(image: { r2Key?: unknown; contentType?: unknown }, index: number): string {
  const key = typeof image.r2Key === "string" ? image.r2Key : "";
  const tail = key.split("/").at(-1);
  if (tail && /^[a-zA-Z0-9._-]{1,200}$/u.test(tail)) return tail;
  const contentType = typeof image.contentType === "string" ? image.contentType : "image/jpeg";
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : contentType === "image/gif" ? "gif" : contentType === "image/avif" ? "avif" : "jpg";
  return `product-image-${index + 1}.${extension}`;
}

async function stagedImageSource(env: Env, store: ShopifyStoreRow, accessToken: string, image: { r2Key?: unknown; contentType?: unknown }, index: number): Promise<string> {
  if (typeof image.r2Key !== "string" || !image.r2Key.startsWith("products/")) throw new ApiError(422, "商品图片存储路径无效", "shopify_image_invalid");
  const object = await env.PRODUCT_IMAGES.get(image.r2Key);
  if (!object) throw new ApiError(404, "商品图片文件不存在", "shopify_image_not_found");
  const contentType = typeof image.contentType === "string" && image.contentType.startsWith("image/") ? image.contentType : "image/jpeg";
  const size = object.size;
  const data = await graphql<{
    stagedUploadsCreate: { stagedTargets?: Array<{ url?: string; resourceUrl?: string; parameters?: Array<{ name?: string; value?: string }> }>; userErrors?: unknown };
  }>(store, accessToken, `mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { field message } }
  }`, {
    input: [{ resource: "PRODUCT_IMAGE", filename: fileName(image, index), mimeType: contentType, httpMethod: "POST", fileSize: String(size) }],
  });
  const error = userErrors(data.stagedUploadsCreate.userErrors);
  const target = data.stagedUploadsCreate.stagedTargets?.[0];
  if (error || !target?.url || !target.resourceUrl || !target.parameters) {
    throw new ApiError(502, error || "Shopify 未返回图片上传地址", "shopify_staged_upload_failed");
  }
  const form = new FormData();
  for (const parameter of target.parameters) {
    if (parameter.name && parameter.value !== undefined) form.append(parameter.name, parameter.value);
  }
  form.append("file", new Blob([await object.arrayBuffer()], { type: contentType }), fileName(image, index));
  const response = await fetchWithTimeout(target.url, { method: "POST", body: form });
  if (!response.ok) throw new ApiError(502, "Shopify 商品图片上传失败", "shopify_image_upload_failed");
  return target.resourceUrl;
}

async function stagedRemoteImageSource(store: ShopifyStoreRow, accessToken: string, imageUrl: string, index: number): Promise<string> {
  const response = await fetchWithTimeout(imageUrl, {
    method: "GET",
    headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8" },
    redirect: "follow",
  });
  if (!response.ok) {
    await response.body?.cancel("remote image request failed");
    throw new ApiError(502, "Failed to download the 1688 product image", "shopify_remote_image_failed", { upstreamStatus: response.status });
  }
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PRODUCT_IMAGE_BYTES) {
    await response.body?.cancel("remote image too large");
    throw new ApiError(413, "Product image exceeds the Shopify upload limit", "shopify_image_too_large");
  }
  const remoteContentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const contentType = remoteContentType?.startsWith("image/") ? remoteContentType : "image/jpeg";
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_PRODUCT_IMAGE_BYTES) {
    throw new ApiError(413, "Product image exceeds the Shopify upload limit", "shopify_image_too_large");
  }
  const filename = fileName({ contentType }, index);
  const data = await graphql<{
    stagedUploadsCreate: { stagedTargets?: Array<{ url?: string; resourceUrl?: string; parameters?: Array<{ name?: string; value?: string }> }>; userErrors?: unknown };
  }>(store, accessToken, `mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { field message } }
  }`, {
    input: [{ resource: "PRODUCT_IMAGE", filename, mimeType: contentType, httpMethod: "POST", fileSize: String(bytes.byteLength) }],
  });
  const error = userErrors(data.stagedUploadsCreate.userErrors);
  const target = data.stagedUploadsCreate.stagedTargets?.[0];
  if (error || !target?.url || !target.resourceUrl || !target.parameters) {
    throw new ApiError(502, error || "Shopify did not return an image upload target", "shopify_staged_upload_failed");
  }
  const form = new FormData();
  for (const parameter of target.parameters) {
    if (parameter.name && parameter.value !== undefined) form.append(parameter.name, parameter.value);
  }
  form.append("file", new Blob([bytes], { type: contentType }), filename);
  const upload = await fetchWithTimeout(target.url, { method: "POST", body: form });
  if (!upload.ok) throw new ApiError(502, "Shopify product image upload failed", "shopify_image_upload_failed");
  return target.resourceUrl;
}

async function buildFileInputs(env: Env, store: ShopifyStoreRow, accessToken: string, product: ShopifyProduct): Promise<{
  files: Array<{ originalSource: string; filename: string; alt?: string; contentType: "IMAGE" }>;
  warnings: string[];
}> {
  const files: Array<{ originalSource: string; filename: string; alt?: string; contentType: "IMAGE" }> = [];
  const warnings: string[] = [];
  for (const [index, image] of product.images.slice(0, MAX_PRODUCT_IMAGES).entries()) {
    try {
      const source = image.r2Key
        ? await stagedImageSource(env, store, accessToken, image, index)
        : typeof image.url === "string" && /^https?:\/\//iu.test(image.url)
          ? await stagedRemoteImageSource(store, accessToken, image.url, index)
          : null;
      if (source) files.push({ originalSource: source, filename: fileName(image, index), contentType: "IMAGE", ...(image.altText ? { alt: image.altText } : {}) });
      else warnings.push(`第 ${index + 1} 张图片缺少可用地址`);
    } catch (error) {
      warnings.push(`第 ${index + 1} 张图片未上传：${error instanceof Error ? error.message : "未知错误"}`);
    }
  }
  return { files, warnings };
}

async function getPublishedShopifyProductId(env: Env, productId: string, storeId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT shopify_product_id AS shopifyProductId FROM shopify_product_publications WHERE product_id = ? AND store_id = ?",
  ).bind(productId, storeId).first<{ shopifyProductId: string | null }>();
  return row?.shopifyProductId ?? null;
}

async function recordPublication(env: Env, productId: string, storeId: string, values: { productId?: string; handle?: string | null; status: "pending" | "synced" | "failed"; error?: string | null }): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO shopify_product_publications
       (id, store_id, product_id, shopify_product_id, shopify_handle, status, last_error, published_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'synced' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE NULL END, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(store_id, product_id) DO UPDATE SET
       shopify_product_id = COALESCE(excluded.shopify_product_id, shopify_product_publications.shopify_product_id),
       shopify_handle = COALESCE(excluded.shopify_handle, shopify_product_publications.shopify_handle),
       status = excluded.status,
       last_error = excluded.last_error,
       published_at = CASE WHEN excluded.status = 'synced' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE shopify_product_publications.published_at END,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).bind(crypto.randomUUID(), storeId, productId, values.productId ?? null, values.handle ?? null, values.status, values.error ?? null, values.status).run();
  await env.DB.prepare("UPDATE products SET sync_state = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
    .bind(values.status === "synced" ? "synced" : values.status === "failed" ? "failed" : "pending", productId).run();
}

export async function getShopifySettings(env: Env, userId: string): Promise<{ stores: ShopifyStoreSummary[] }> {
  await ensureShopifySchema(env);
  const stores = await env.DB.prepare(
    `SELECT id, owner_user_id, shop_domain, display_name, status, api_version,
            client_id_ciphertext, client_secret_ciphertext, last_verified_at, last_error, updated_at
       FROM shopify_stores WHERE owner_user_id = ? ORDER BY updated_at DESC`,
  ).bind(userId).all<ShopifyStoreRow>();
  const results = await Promise.all(stores.results.map(async (store) => {
    const credentials = store.client_id_ciphertext && store.client_secret_ciphertext
      ? {
          clientId: await decryptSetting(env, store.client_id_ciphertext, "shopify_settings_invalid"),
          clientSecret: await decryptSetting(env, store.client_secret_ciphertext, "shopify_settings_invalid"),
        }
      : null;
    return toSummary(store, credentials);
  }));
  return { stores: results };
}

export async function saveShopifySettings(env: Env, userId: string, input: ShopifySettingsInput): Promise<ShopifyStoreSummary> {
  await ensureShopifySchema(env);
  const shopDomain = normalizeShopDomain(input.shopDomain);
  const [clientId, clientSecret] = await Promise.all([encryptSetting(env, input.clientId), encryptSetting(env, input.clientSecret)]);
  const existing = await env.DB.prepare("SELECT id, owner_user_id FROM shopify_stores WHERE shop_domain = ?").bind(shopDomain).first<{ id: string; owner_user_id: string | null }>();
  if (existing && existing.owner_user_id !== userId) {
    throw new ApiError(409, "这个 Shopify 店铺已被其他用户配置", "shopify_store_owned_by_other_user");
  }
  const id = existing?.id || crypto.randomUUID();
  if (existing) {
    await env.DB.prepare(
      `UPDATE shopify_stores
          SET display_name = ?, status = 'planned', api_version = ?, scopes_json = ?,
              client_id_ciphertext = ?, client_secret_ciphertext = ?, last_error = NULL,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ? AND owner_user_id = ?`,
    ).bind(input.displayName || null, SHOPIFY_API_VERSION, JSON.stringify(["read_products", "write_products", "read_locales", "read_translations", "write_translations", "read_markets"]), clientId, clientSecret, id, userId).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO shopify_stores
         (id, owner_user_id, shop_domain, display_name, status, api_version, scopes_json, client_id_ciphertext, client_secret_ciphertext, last_error, updated_at)
       VALUES (?, ?, ?, ?, 'planned', ?, ?, ?, ?, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    ).bind(id, userId, shopDomain, input.displayName || null, SHOPIFY_API_VERSION, JSON.stringify(["read_products", "write_products", "read_locales", "read_translations", "write_translations", "read_markets"]), clientId, clientSecret).run();
  }
  return toSummary(await getStoreRow(env, id, userId), { clientId: input.clientId, clientSecret: input.clientSecret });
}

export async function deleteShopifyStore(env: Env, userId: string, storeId: string): Promise<void> {
  await ensureShopifySchema(env);
  const result = await env.DB.prepare("DELETE FROM shopify_stores WHERE id = ? AND owner_user_id = ?")
    .bind(storeId, userId)
    .run();
  if (!result.meta.changes) {
    throw new ApiError(404, "Shopify 店铺不存在或不属于当前用户", "shopify_store_not_found");
  }
}

export async function testShopifyStore(env: Env, userId: string, storeId: string): Promise<ShopifyStoreSummary> {
  const store = await getStoreRow(env, storeId, userId);
  try {
    const credentials = await decryptCredentials(env, store);
    const token = await getAccessToken(store, credentials);
    if (!token.scopes.includes("write_products")) {
      throw new ApiError(403, "Shopify 应用缺少 write_products 权限，请更新应用版本并重新安装", "shopify_scope_missing");
    }
    const data = await graphql<{ shop: { name: string; myshopifyDomain: string } }>(store, token.accessToken, "query ShopHealth { shop { name myshopifyDomain } }", {});
    const canonicalDomain = normalizeShopDomain(data.shop.myshopifyDomain);
    await adoptCanonicalShopDomain(env, userId, store, canonicalDomain);
    await updateStoreHealth(env, store.id, "active", null, true);
    return toSummary(await getStoreRow(env, store.id, userId), credentials);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2_000) : "未知错误";
    await updateStoreHealth(env, store.id, "error", message);
    throw error;
  }
}

export async function publishProductToShopify(env: Env, userId: string, productId: string, storeId: string): Promise<{ productId: string; handle: string | null; warnings: string[] }> {
  const store = await getStoreRow(env, storeId, userId);
  const product = asShopifyProduct(await getProduct(env, productId));
  await recordPublication(env, productId, storeId, { status: "pending" });
  try {
    const credentials = await decryptCredentials(env, store);
    const token = await getAccessToken(store, credentials);
    if (!token.scopes.includes("write_products")) {
      throw new ApiError(403, "Shopify 应用缺少 write_products 权限，请更新应用版本并重新安装", "shopify_scope_missing");
    }
    const accessToken = token.accessToken;
    const [existingProductId, imageInput] = await Promise.all([
      getPublishedShopifyProductId(env, productId, storeId),
      buildFileInputs(env, store, accessToken, product),
    ]);
    const input = buildProductInput(product);
    if (product.variants.length) input.variants = await buildVariantInputs(store, accessToken, product, existingProductId);
    if (imageInput.files.length) input.files = imageInput.files;
    const result = await graphql<{
      productSet: { product?: { id: string; handle?: string | null }; userErrors?: unknown };
    }>(store, accessToken, `mutation ProductSet($identifier: ProductSetIdentifiers, $input: ProductSetInput!, $synchronous: Boolean!) {
      productSet(identifier: $identifier, input: $input, synchronous: $synchronous) {
        product { id handle }
        userErrors { field message code }
      }
    }`, {
      identifier: existingProductId ? { id: existingProductId } : null,
      input,
      synchronous: true,
    });
    const publishError = userErrors(result.productSet.userErrors);
    const shopifyProduct = result.productSet.product;
    if (publishError || !shopifyProduct) throw new ApiError(502, publishError || "Shopify 未保存商品", "shopify_product_set_failed");

    const warnings = imageInput.warnings;
    await recordPublication(env, productId, storeId, { productId: shopifyProduct.id, handle: shopifyProduct.handle ?? null, status: "synced" });
    await updateStoreHealth(env, store.id, "active", null);
    return { productId: shopifyProduct.id, handle: shopifyProduct.handle ?? null, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2_000) : "未知错误";
    await recordPublication(env, productId, storeId, { status: "failed", error: message });
    if (error instanceof ApiError && ["shopify_auth_failed", "shopify_graphql_failed", "shopify_request_timeout", "shopify_scope_missing"].includes(error.code)) {
      await updateStoreHealth(env, store.id, "error", message);
    }
    throw error;
  }
}

export { buildProductInput, normalizeShopDomain };
