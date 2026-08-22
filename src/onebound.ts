import { getCachedOneBoundItem, getProductImage, putCachedOneBoundItem, upsertOfferLink, upsertProduct, type OneBoundOfferDetailData } from "./db";
import { ApiError } from "./http";
import { validateImageProxyUrl } from "./image-proxy";
import type { OfferLinkInput } from "./validation";

type OneBoundSettingsRow = {
  onebound_key_ciphertext: string | null;
  onebound_secret_ciphertext: string | null;
  updated_at: string | null;
};

type OneBoundItem = Record<string, unknown>;
type OneBoundRequestOptions = { cache: "yes" | "no"; lang: "cn" | "en" | "ru" };
export type ImageSearchOptions = OneBoundRequestOptions & {
  sort: "_sale" | "sale" | "bid2" | "_bid2";
  limit: number;
  page: number;
  version: string;
};

export type OneBoundImageSearchResponse = {
  uploadedImageId: string;
  resultCount: number;
  totalResultCount: number | null;
  results: OneBoundSearchResult[];
  request: {
    sort: string;
    cache: string;
    lang: string;
    limit: number;
    page: number;
    version: string;
  };
};

export type OneBoundSearchResult = {
  offerId: string;
  title: string;
  imageUrl: string | null;
  detailUrl: string | null;
  price: number | null;
  promotionPrice: number | null;
  sales: number | null;
  supplierName: string | null;
  location: string | null;
  raw: OneBoundItem;
};

export type OneBoundItemPreview = {
  offerId: string;
  title: string;
  detailUrl: string | null;
  imageUrl: string | null;
  images: string[];
  descriptionImages: string[];
  priceMin: number | null;
  priceMax: number | null;
  originalPrice: number | null;
  currency: "CNY";
  minOrderQuantity: number | null;
  unit: string | null;
  supplierName: string | null;
  supplierId: string | null;
  shopId: string | null;
  stockQuantity: number | null;
  soldQuantity: number | null;
  skuCount: number;
  brand: string | null;
  categoryId: string | null;
  location: string | null;
  shortDescription: string | null;
  descriptionHtml: string | null;
  itemWeight: string | null;
  itemSize: string | null;
  shippingTo: string | null;
  videoUrl: string | null;
  sellerNick: string | null;
  variants: Array<{
    externalId: string | null;
    sku: string | null;
    name: string | null;
    imageUrl: string | null;
    price: number | null;
    stock: number | null;
    attributes: Record<string, unknown>;
    raw: OneBoundItem;
  }>;
  propertyImages: Array<{ propertiesKey: string | null; url: string }>;
  videos: Array<{ url: string; posterUrl: string | null; title: string | null }>;
  rawResponse: Record<string, unknown>;
  cachedAt: string | null;
  fromCache: boolean;
  properties: Array<{ name: string; value: string }>;
  priceTiers: Array<{ minQuantity: number | null; price: number | null; originalPrice: number | null }>;
  raw: OneBoundItem;
};

type ParsedItemDetail = {
  preview: OneBoundItemPreview;
  linkInput: OfferLinkInput;
  detail: OneBoundOfferDetailData;
};

function variantOptionPairs(variant: { name?: string | null; attributes?: Record<string, unknown> }): Array<{ name: string; value: string }> {
  const text = asString(variant.attributes?.propertiesName) ?? variant.name ?? null;
  if (!text) return [];
  const seen = new Set<string>();
  return text.split(/[;；]/u).flatMap((segment) => {
    const parts = segment.split(":").map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return [];
    const name = parts.at(-2)!;
    const value = parts.at(-1)!;
    const key = name.toLowerCase();
    if (!name || !value || seen.has(key)) return [];
    seen.add(key);
    return [{ name: name.slice(0, 100), value: value.slice(0, 255) }];
  });
}

export function importedVariantData(variants: OfferLinkInput["offer"]["variants"]): {
  options: Array<{ name: string; values: string[] }>;
  values: string[][];
} {
  const pairs = variants.map(variantOptionPairs);
  const optionNames = [...new Set(pairs.flatMap((items) => items.map((item) => item.name)))].slice(0, 3);
  if (!optionNames.length && variants.length > 1) optionNames.push("规格");

  const values = variants.map((variant, index) => optionNames.map((name) => {
    const value = pairs[index]?.find((item) => item.name === name)?.value;
    if (value) return value;
    if (name === "规格") return (variant.name ?? variant.sku ?? variant.externalId ?? `规格 ${index + 1}`).slice(0, 255);
    return "默认";
  }));
  return {
    options: optionNames.map((name, optionIndex) => ({
      name,
      values: [...new Set(values.map((row) => row[optionIndex]).filter(Boolean))],
    })),
    values,
  };
}

export async function importOneBoundProducts(
  env: Env,
  offerIds: string[],
  options: OneBoundRequestOptions,
  createdBy: string,
): Promise<{
  imported: Array<{ offerId: string; productId: string; title: string }>;
  failures: Array<{ offerId: string; code: string; message: string; details?: unknown }>;
}> {
  const credentials = await readCredentials(env);
  const imported: Array<{ offerId: string; productId: string; title: string }> = [];
  const failures: Array<{ offerId: string; code: string; message: string; details?: unknown }> = [];

  for (const offerId of offerIds) {
    try {
      const parsed = await callItemGet(credentials, offerId, options);
      const { preview, linkInput, detail } = parsed;
      const variantData = importedVariantData(linkInput.offer.variants);
      const productId = await upsertProduct(env, {
        sourcePlatform: "1688",
        sourceStore: "1688",
        externalId: preview.offerId,
        sourceUrl: preview.detailUrl ?? undefined,
        title: preview.title,
        vendor: preview.supplierName ?? undefined,
        productType: preview.categoryId ?? undefined,
        descriptionHtml: detail.main.descriptionHtml ?? undefined,
        currency: "CNY",
        status: "new",
        syncState: "not_synced",
        priceMin: preview.priceMin,
        priceMax: preview.priceMax,
        inventoryQuantity: preview.stockQuantity,
        tags: [],
        options: variantData.options,
        attributes: {
          properties: preview.properties,
          priceTiers: preview.priceTiers,
          location: preview.location,
          raw: preview.raw,
        },
        categories: [preview.categoryId, detail.main.rootCategoryId].filter(Boolean),
        content: {
          shortDescription: detail.main.shortDescription,
          descriptionImages: preview.descriptionImages,
          videos: detail.videos,
        },
        raw: preview.raw,
        offerId1688: preview.offerId,
        supplierId1688: preview.supplierId,
        supplierName1688: preview.supplierName,
        minOrderQuantity1688: preview.minOrderQuantity,
        unit1688: preview.unit,
        province1688: linkInput.offer.province,
        city1688: linkInput.offer.city,
        shortDescription1688: detail.main.shortDescription,
        totalPrice1688: detail.main.totalPrice,
        suggestedPrice1688: detail.main.suggestedPrice,
        originalPrice1688: preview.originalPrice,
        stockQuantity1688: detail.main.stockQuantity,
        soldQuantity1688: detail.main.soldQuantity,
        brand1688: detail.main.brand,
        brandId1688: detail.main.brandId,
        rootCategoryId1688: detail.main.rootCategoryId,
        categoryId1688: detail.main.categoryId,
        sellerNick1688: detail.main.sellerNick,
        location1688: detail.main.location,
        itemWeight1688: detail.main.itemWeight,
        itemSize1688: detail.main.itemSize,
        shopId1688: detail.main.shopId,
        videoUrl1688: detail.main.videoUrl,
        sampleId1688: detail.main.sampleId,
        shippingTo1688: detail.main.shippingTo,
        hasDiscount1688: detail.main.hasDiscount,
        isPromotion1688: detail.main.isPromotion,
        fetchedAt1688: new Date().toISOString(),
        variants: linkInput.offer.variants.map((variant, index) => ({
          externalId: variant.externalId,
          sku: variant.sku,
          title: variant.name,
          option1: variantData.values[index]?.[0],
          option2: variantData.values[index]?.[1],
          option3: variantData.values[index]?.[2],
          price: variant.price,
          inventoryQuantity: variant.stock,
          options: variantData.values[index] ?? [],
          raw: variant.raw,
        })),
        images: linkInput.offer.images.map((image) => ({
          externalId: image.externalId,
          url: image.url,
          position: image.position,
        })),
        media: detail.videos.map((video, index) => ({
          externalId: `1688-video-${index + 1}`,
          mediaType: "video" as const,
          url: video.url,
          posterUrl: video.posterUrl ?? undefined,
          title: video.title ?? undefined,
          position: index,
          metadata: {},
        })),
      }, createdBy);
      imported.push({ offerId: preview.offerId, productId, title: preview.title });
    } catch (caught) {
      failures.push(itemFailure(offerId, caught));
    }
  }

  if (imported.length === 0 && failures.length > 0) {
    throw new ApiError(502, "1688 商品导入失败", "onebound_product_import_failed", { failures });
  }
  return { imported, failures };
}

const ONEBOUND_SETTINGS_ID = 1;
const ONEBOUND_API_BASE = "https://api-gw.onebound.cn/1688";
const DEFAULT_MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_UPSTREAM_JSON_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_REDIRECTS = 3;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function encryptionKey(env: Env): Promise<CryptoKey> {
  const seed = env.SETTINGS_ENCRYPTION_KEY || env.BOOTSTRAP_TOKEN;
  if (!seed) throw new ApiError(500, "设置加密密钥未配置", "settings_encryption_key_missing");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptValue(env: Env, value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(env),
    new TextEncoder().encode(value),
  );
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`;
}

async function decryptValue(env: Env, value: string): Promise<string> {
  const [ivText, encryptedText] = value.split(".");
  if (!ivText || !encryptedText) throw new ApiError(500, "OneBound 配置已损坏", "onebound_settings_invalid");
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlToBytes(ivText) },
      await encryptionKey(env),
      base64UrlToBytes(encryptedText),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new ApiError(500, "OneBound 配置无法解密", "onebound_settings_invalid");
  }
}

async function readSettingsRow(env: Env): Promise<OneBoundSettingsRow | null> {
  return env.DB.prepare(
    `SELECT onebound_key_ciphertext, onebound_secret_ciphertext, updated_at
       FROM integration_settings WHERE id = ?`,
  )
    .bind(ONEBOUND_SETTINGS_ID)
    .first<OneBoundSettingsRow>();
}

export async function getOneBoundSettings(env: Env): Promise<{
  configured: boolean;
  keyHint: string | null;
  updatedAt: string | null;
}> {
  const row = await readSettingsRow(env);
  const key = row?.onebound_key_ciphertext;
  return {
    configured: Boolean(key && row?.onebound_secret_ciphertext),
    keyHint: key ? "已保存（密钥已加密）" : null,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function saveOneBoundSettings(env: Env, input: { key: string; secret: string }, userId: string): Promise<void> {
  const encryptedKey = await encryptValue(env, input.key);
  const encryptedSecret = await encryptValue(env, input.secret);
  await env.DB.prepare(
    `INSERT INTO integration_settings
      (id, onebound_key_ciphertext, onebound_secret_ciphertext, updated_by, updated_at)
     VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(id) DO UPDATE SET
       onebound_key_ciphertext = excluded.onebound_key_ciphertext,
       onebound_secret_ciphertext = excluded.onebound_secret_ciphertext,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`,
  )
    .bind(ONEBOUND_SETTINGS_ID, encryptedKey, encryptedSecret, userId)
    .run();
}

async function readCredentials(env: Env): Promise<{ key: string; secret: string }> {
  const row = await readSettingsRow(env);
  if (!row?.onebound_key_ciphertext || !row.onebound_secret_ciphertext) {
    throw new ApiError(409, "请先在设置中保存 OneBound key 和 secret", "onebound_not_configured");
  }
  return {
    key: await decryptValue(env, row.onebound_key_ciphertext),
    secret: await decryptValue(env, row.onebound_secret_ciphertext),
  };
}

function asRecord(value: unknown): OneBoundItem | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as OneBoundItem : null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asInteger(value: unknown): number | null {
  const parsed = asNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function asString(value: unknown): string | null {
  if (!["string", "number", "boolean"].includes(typeof value)) return null;
  const text = String(value).trim();
  return text || null;
}

function valueText(value: unknown): string | null {
  const scalar = asString(value);
  if (scalar) return scalar;
  if (Array.isArray(value)) {
    const values = value.map(valueText).filter((item): item is string => Boolean(item));
    return values.length ? values.join(" / ") : null;
  }
  const record = asRecord(value);
  if (!record) return null;
  return asString(record.name ?? record.value_name ?? record.value ?? record.title) ?? JSON.stringify(record);
}

function recordArray(value: unknown, nestedKeys: string[] = []): OneBoundItem[] {
  if (Array.isArray(value)) return value.filter((item): item is OneBoundItem => Boolean(asRecord(item)));
  const record = asRecord(value);
  if (!record) return [];
  for (const key of nestedKeys) {
    if (Array.isArray(record[key])) return recordArray(record[key]);
    const nestedRecord = asRecord(record[key]);
    if (nestedRecord) return [nestedRecord];
  }
  return [record];
}

function asFlag(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["false", "0", "no"].includes(normalized)) return 0;
    if (["true", "1", "yes"].includes(normalized)) return 1;
  }
  return Number(Boolean(value));
}

function uniqueStrings(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function responseItems(payload: Record<string, unknown>): OneBoundItem[] {
  const data = asRecord(payload.data);
  const items = asRecord(payload.items);
  const nestedData = asRecord(data?.items);
  const candidates = [payload.items, payload.item, items?.item, data?.items, data?.item, nestedData?.item];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter((item): item is OneBoundItem => Boolean(asRecord(item)));
  }
  return [];
}

function responseItem(payload: Record<string, unknown>): OneBoundItem | null {
  const data = asRecord(payload.data);
  const items = asRecord(payload.items);
  return asRecord(payload.item) ?? asRecord(data?.item) ?? asRecord(items?.item);
}

export function responseImageId(payload: Record<string, unknown>): string | null {
  const items = asRecord(payload.items);
  const item = asRecord(items?.item);
  const data = asRecord(payload.data);
  const dataItem = asRecord(data?.item);
  return asString(payload.imgid ?? payload.name ?? item?.imgid ?? item?.name ?? data?.imgid ?? data?.name ?? dataItem?.imgid ?? dataItem?.name);
}

async function readResponseBytes(
  response: Response,
  limit: number,
  code: string,
  message: string,
): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > limit) {
    await response.body?.cancel("response too large");
    throw new ApiError(502, message, code, { maxBytes: limit, contentLength });
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > limit) {
      await reader.cancel("response too large");
      throw new ApiError(502, message, code, { maxBytes: limit, receivedBytes: received });
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readUpstreamJson(response: Response): Promise<Record<string, unknown>> {
  const bytes = await readResponseBytes(
    response,
    MAX_UPSTREAM_JSON_BYTES,
    "onebound_response_too_large",
    "OneBound 返回的数据过大",
  );
  const text = new TextDecoder().decode(bytes);
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : { value: parsed };
  } catch {
    return { raw: text.slice(0, 20_000) };
  }
}

function maxImageBytes(env: Env): number {
  const configured = Number(env.MAX_IMAGE_BYTES);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_IMAGE_BYTES;
}

async function uploadImageBytes(bytes: Uint8Array, credentials: { key: string; secret: string }): Promise<string> {
  const imgcode = bytesToBase64(bytes);
  const url = new URL(`${ONEBOUND_API_BASE}/upload_img/`);
  url.searchParams.set("key", credentials.key);
  url.searchParams.set("secret", credentials.secret);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ imgcode }),
  });
  const payload = await readUpstreamJson(response);
  const imageId = responseImageId(payload);
  if (!response.ok || !imageId || String(payload.error_code ?? "0000") !== "0000") {
    throw new ApiError(502, String(payload.reason ?? "OneBound 图片上传失败"), "onebound_upload_failed", {
      endpoint: "1688/upload_img",
      upstreamStatus: response.status,
      response: payload,
    });
  }
  return imageId;
}

async function searchUploadedImage(
  credentials: { key: string; secret: string },
  uploadedImageId: string,
  options: ImageSearchOptions,
): Promise<OneBoundImageSearchResponse> {
  const payload = await callImageSearch(credentials, uploadedImageId, options);
  const seen = new Set<string>();
  const results = responseItems(payload).flatMap((item) => {
    const result = normalizeSearchResult(item);
    if (!result || seen.has(result.offerId)) return [];
    seen.add(result.offerId);
    return [result];
  }).slice(0, options.limit);

  return {
    uploadedImageId,
    resultCount: results.length,
    totalResultCount: responseTotalResultCount(payload),
    results,
    request: {
      sort: options.sort,
      cache: options.cache,
      lang: options.lang,
      limit: options.limit,
      page: options.page,
      version: options.version,
    },
  };
}

export async function searchImageBytes(
  env: Env,
  bytes: Uint8Array,
  options: ImageSearchOptions,
): Promise<OneBoundImageSearchResponse> {
  if (bytes.byteLength === 0) throw new ApiError(422, "图片内容为空", "image_empty");
  if (bytes.byteLength > maxImageBytes(env)) {
    throw new ApiError(413, "图片超过允许大小", "image_too_large", { maxBytes: maxImageBytes(env) });
  }
  const credentials = await readCredentials(env);
  return searchUploadedImage(credentials, await uploadImageBytes(bytes, credentials), options);
}

function dataImageBytes(value: string): Uint8Array | null {
  const match = value.match(/^data:image\/(?:avif|gif|jpeg|png|webp);base64,([a-z0-9+/=\s]+)$/iu);
  if (!match) return null;
  try {
    const binary = atob(match[1].replace(/\s+/gu, ""));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new ApiError(422, "图片 data URL 无效", "image_data_url_invalid");
  }
}

export async function searchImageUrl(
  env: Env,
  imageUrl: string,
  options: ImageSearchOptions,
): Promise<OneBoundImageSearchResponse> {
  const inlineBytes = dataImageBytes(imageUrl);
  if (inlineBytes) return searchImageBytes(env, inlineBytes, options);
  const credentials = await readCredentials(env);
  return searchUploadedImage(credentials, await uploadRemoteImage(env, imageUrl, credentials), options);
}

async function uploadR2Image(env: Env, key: string, credentials: { key: string; secret: string }): Promise<string> {
  const object = await env.PRODUCT_IMAGES.get(key);
  if (!object) throw new ApiError(404, "图片文件不存在", "image_not_found");
  const limit = maxImageBytes(env);
  if (object.size > limit) {
    throw new ApiError(413, "图片超过允许大小", "image_too_large", { maxBytes: limit, contentLength: object.size });
  }
  return uploadImageBytes(new Uint8Array(await object.arrayBuffer()), credentials);
}

export async function fetchValidatedRemoteImage(
  imageUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  let target = validateImageProxyUrl(imageUrl);

  for (let redirectCount = 0; redirectCount <= MAX_IMAGE_REDIRECTS; redirectCount += 1) {
    const response = await fetcher(target, {
      headers: {
        accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8",
        referer: `${target.origin}/`,
      },
      redirect: "manual",
    });

    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get("location");
    await response.body?.cancel("following image redirect");
    if (!location || redirectCount === MAX_IMAGE_REDIRECTS) {
      throw new ApiError(502, "远程图片重定向失败", "remote_image_redirect_failed", {
        upstreamStatus: response.status,
        imageHost: target.hostname,
      });
    }
    target = validateImageProxyUrl(new URL(location, target).href);
  }

  throw new ApiError(502, "下载远程图片失败", "remote_image_fetch_failed");
}

async function uploadRemoteImage(env: Env, imageUrl: string, credentials: { key: string; secret: string }): Promise<string> {
  const validatedUrl = validateImageProxyUrl(imageUrl);

  const response = await fetchValidatedRemoteImage(validatedUrl.href);
  if (!response.ok) {
    await response.body?.cancel("remote image request failed");
    throw new ApiError(502, "下载远程图片失败", "remote_image_fetch_failed", {
      upstreamStatus: response.status,
      imageHost: validatedUrl.hostname,
    });
  }

  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (!contentType?.startsWith("image/")) {
    await response.body?.cancel("unexpected content type");
    throw new ApiError(502, "远程地址返回的不是图片", "remote_image_invalid_content_type", {
      contentType: contentType ?? null,
      imageHost: validatedUrl.hostname,
    });
  }

  const bytes = await readResponseBytes(response, maxImageBytes(env), "image_too_large", "图片超过允许大小");
  return uploadImageBytes(bytes, credentials);
}

function normalizeSearchResult(item: OneBoundItem): OneBoundSearchResult | null {
  const offerId = asString(item.num_iid ?? item.offer_id ?? item.id);
  if (!offerId) return null;
  return {
    offerId,
    title: asString(item.title ?? item.name) ?? `1688 商品 ${offerId}`,
    imageUrl: asString(item.pic_url ?? item.image ?? item.img),
    detailUrl: asString(item.detail_url ?? item.url),
    price: asNumber(item.price),
    promotionPrice: asNumber(item.promotion_price),
    sales: asNumber(item.sales ?? item.total_sold),
    supplierName: asString(item.seller_nick ?? item.shop_name ?? item.seller_name),
    location: asString(item.location),
    raw: item,
  };
}

export function responseTotalResultCount(payload: Record<string, unknown>): number | null {
  const items = asRecord(payload.items);
  const data = asRecord(payload.data);
  return asInteger(
    payload.real_total_results ?? payload.total_results ?? payload.total_result ?? payload.total ??
    items?.real_total_results ?? items?.total_results ?? items?.total_result ?? items?.total ??
    data?.real_total_results ?? data?.total_results ?? data?.total_result ?? data?.total,
  );
}

async function callImageSearch(
  credentials: { key: string; secret: string },
  imgid: string,
  options: ImageSearchOptions,
): Promise<Record<string, unknown>> {
  const url = new URL(`${ONEBOUND_API_BASE}/item_search_img/`);
  url.searchParams.set("key", credentials.key);
  url.searchParams.set("secret", credentials.secret);
  url.searchParams.set("imgid", imgid);
  url.searchParams.set("sort", options.sort);
  url.searchParams.set("page", String(options.page));
  url.searchParams.set("page_size", String(options.limit));
  url.searchParams.set("cache", options.cache);
  url.searchParams.set("lang", options.lang);
  if (options.version) url.searchParams.set("version", options.version);
  url.searchParams.set("result_type", "json");
  const response = await fetch(url);
  const payload = await readUpstreamJson(response);
  const errorCode = String(payload.error_code ?? "0000");
  if (!response.ok || !["0000", "2000"].includes(errorCode)) {
    throw new ApiError(502, String(payload.reason ?? "OneBound 以图搜商品失败"), "onebound_search_failed", {
      endpoint: "1688/item_search_img",
      request: {
        imgid,
        sort: options.sort,
        page: options.page,
        pageSize: options.limit,
        cache: options.cache,
        lang: options.lang,
        version: options.version,
        resultType: "json",
      },
      upstreamStatus: response.status,
      response: payload,
    });
  }
  return payload;
}

function itemLocation(item: OneBoundItem): { location: string | null; province: string | null; city: string | null } {
  const location = asRecord(item.location);
  const province = asString(location?.state ?? location?.province);
  const city = asString(location?.city);
  return {
    location: asString(item.location) ?? (uniqueStrings([province, city]).join(" ") || null),
    province,
    city,
  };
}

function parsePriceTiers(item: OneBoundItem): OneBoundOfferDetailData["priceTiers"] {
  const ranges = Array.isArray(item.priceRange) ? item.priceRange : [];
  const originals = Array.isArray(item.priceRangeOriginal) ? item.priceRangeOriginal : [];
  return ranges.map((raw, index) => {
    const row = Array.isArray(raw) ? raw : [];
    const record = asRecord(raw);
    const originalRaw = originals[index];
    const originalRow = Array.isArray(originalRaw) ? originalRaw : [];
    const originalRecord = asRecord(originalRaw);
    return {
      minQuantity: asNumber(row[0] ?? record?.start ?? record?.min_num ?? record?.amount),
      price: asNumber(row[1] ?? record?.price ?? record?.value),
      originalPrice: asNumber(originalRow[1] ?? originalRecord?.price ?? originalRecord?.value),
      raw,
    };
  });
}

export function parseOneBoundItemPayload(payload: Record<string, unknown>, requestedOfferId: string): ParsedItemDetail {
  const item = responseItem(payload);
  if (!item) {
    throw new ApiError(502, "OneBound 商品详情响应缺少 item", "onebound_item_invalid", {
      endpoint: "1688/item_get",
      request: { numIid: requestedOfferId },
      response: payload,
    });
  }

  const offerId = asString(item.num_iid ?? requestedOfferId) ?? requestedOfferId;
  const sellerInfo = asRecord(item.seller_info);
  const skuItems = recordArray(item.skus, ["sku"]);
  const itemImages = recordArray(item.item_imgs, ["item_img"]);
  const propertyImageContainer = asRecord(item.prop_imgs);
  const propertyImages = recordArray(propertyImageContainer?.prop_img ?? item.prop_imgs, ["prop_img"])
    .flatMap((raw) => {
      const url = asString(raw.url ?? raw.pic_url);
      return url ? [{ propertiesKey: asString(raw.properties ?? raw.property), url, raw }] : [];
    });
  const descriptionImageValues = Array.isArray(item.desc_img)
    ? item.desc_img
    : Array.isArray(item.description_images)
      ? item.description_images
      : [];
  const descriptionImages = descriptionImageValues.flatMap((raw) => {
    const url = asString(raw) ?? asString(asRecord(raw)?.url ?? asRecord(raw)?.pic_url);
    return url ? [{ url, raw }] : [];
  });
  const priceTiers = parsePriceTiers(item);
  const tierPrices = priceTiers.map((tier) => tier.price).filter((value): value is number => value !== null);
  const directPrice = asNumber(item.price);
  const directTotalPrice = asNumber(item.total_price);
  const prices = tierPrices.length ? tierPrices : [directPrice, directTotalPrice].filter((value): value is number => value !== null);
  const priceMin = prices.length ? Math.min(...prices) : null;
  const priceMax = prices.length ? Math.max(...prices) : null;
  const detailUrl = asString(item.detail_url) ?? `https://detail.1688.com/offer/${encodeURIComponent(offerId)}.html`;
  const primaryImage = asString(item.pic_url);
  const images = uniqueStrings([
    primaryImage,
    ...itemImages.map((image) => asString(image.url ?? image.pic_url)),
  ]);
  const properties = recordArray(item.props, ["prop"]).flatMap((raw) => {
    const name = asString(raw.name ?? raw.prop_name);
    const value = valueText(raw.value ?? raw.value_name ?? raw.values);
    return name && value ? [{
      propertyId: asString(raw.pid ?? raw.property_id),
      valueId: asString(raw.vid ?? raw.value_id),
      name,
      value,
      raw,
    }] : [];
  });
  const location = itemLocation(item);
  const supplierId = asString(item.seller_id ?? sellerInfo?.user_num_id);
  const shopId = asString(item.shop_id ?? sellerInfo?.sid);
  const sellerNick = asString(item.nick ?? sellerInfo?.nick);
  const supplierName = asString(sellerInfo?.shop_name ?? sellerInfo?.title ?? sellerNick);
  const supplierKey = supplierId ?? shopId ?? sellerNick ?? supplierName;
  const videoRecord = asRecord(item.video);
  const videos = recordArray(item.video, ["video"])
    .concat(videoRecord ? [videoRecord] : [])
    .flatMap((raw) => {
      const url = asString(raw.url ?? raw.video_url);
      return url ? [{
        url,
        posterUrl: asString(raw.poster_url ?? raw.pic_url),
        title: asString(raw.title),
        raw,
      }] : [];
    });
  const variantImage = (raw: OneBoundItem): string | null => {
    const direct = asString(raw.sku_img ?? raw.pic_url ?? raw.image ?? raw.img ?? raw.image_url);
    if (direct) return direct;
    const propertiesKey = asString(raw.properties ?? raw.property);
    if (!propertiesKey) return null;
    return propertyImages.find((image) => image.propertiesKey === propertiesKey)?.url
      ?? propertyImages.find((image) => image.propertiesKey && propertiesKey.split(';').some((part) => image.propertiesKey?.includes(part)))?.url
      ?? null;
  };
  const variants = skuItems.map((raw, index) => ({
    externalId: asString(raw.sku_id ?? raw.spec_id ?? raw.properties) ?? `sku-${index + 1}`,
    sku: asString(raw.sku_id),
    name: asString(raw.properties_name ?? raw.name),
    imageUrl: variantImage(raw),
    attributes: {
      properties: raw.properties ?? null,
      propertiesName: raw.properties_name ?? null,
      specId: raw.spec_id ?? null,
    },
    price: asNumber(raw.price ?? raw.total_price),
    stock: asInteger(raw.quantity ?? raw.stock),
    raw,
  }));
  const offerImages = images.map((url, index) => ({
    externalId: `${offerId}-image-${index + 1}`,
    url,
    position: index,
  }));
  const originalPrice = asNumber(item.orginal_price ?? item.original_price);
  const videoUrl = videos[0]?.url ?? null;
  const descriptionHtml = asString(
    item.desc
      ?? item.description
      ?? item.desc_html
      ?? item.description_html
      ?? item.detail_desc
      ?? item.detail_description,
  );

  const linkInput: OfferLinkInput = {
    offer: {
      offerId,
      url: detailUrl,
      title: asString(item.title) ?? `1688 商品 ${offerId}`,
      supplierId,
      supplierName,
      priceMin,
      priceMax,
      currency: "CNY",
      minOrderQuantity: asNumber(item.min_num),
      unit: asString(item.unit ?? item.sellUnit),
      province: location.province,
      city: location.city,
      sourceUrl: detailUrl,
      raw: item,
      variants,
      images: offerImages,
    },
    matchStatus: "candidate",
    variantMap: {},
  };

  const detail: OneBoundOfferDetailData = {
    main: {
      shortDescription: asString(item.desc_short),
      totalPrice: directTotalPrice,
      suggestedPrice: asNumber(item.suggestive_price),
      originalPrice,
      stockQuantity: asInteger(item.num),
      soldQuantity: asInteger(item.total_sold ?? item.sales),
      brand: asString(item.brand),
      brandId: asString(item.brandId),
      rootCategoryId: asString(item.rootCatId),
      categoryId: asString(item.cid),
      sellerNick,
      location: location.location,
      itemWeight: valueText(item.item_weight),
      itemSize: valueText(item.item_size),
      shopId,
       descriptionHtml,
      videoUrl,
      sampleId: asString(item.sample_id),
      shippingTo: valueText(item.shipping_to),
      hasDiscount: asFlag(item.has_discount),
      isPromotion: asFlag(item.is_promotion),
    },
    supplier: supplierKey ? {
      supplierKey,
      supplierId,
      shopId,
      nick: sellerNick,
      shopName: asString(sellerInfo?.shop_name),
      sid: asString(sellerInfo?.sid),
      title: asString(sellerInfo?.title),
      profileUrl: asString(sellerInfo?.zhuy),
      location: location.location,
      raw: sellerInfo ?? {},
    } : null,
    priceTiers,
    properties,
    propertyImages,
    descriptionImages,
    videos,
    snapshot: {
      apiName: "1688/item_get",
      requestNumIid: requestedOfferId,
      errorCode: asString(payload.error_code),
      reason: asString(payload.reason),
      upstreamRequestId: asString(payload.request_id),
      response: payload,
    },
  };

  return {
    linkInput,
    detail,
    preview: {
      offerId,
      title: linkInput.offer.title,
      detailUrl,
      imageUrl: primaryImage ?? images[0] ?? null,
      images,
      descriptionImages: descriptionImages.map((image) => image.url),
      priceMin,
      priceMax,
      originalPrice,
      currency: "CNY",
      minOrderQuantity: linkInput.offer.minOrderQuantity ?? null,
      unit: linkInput.offer.unit ?? null,
      supplierName,
      supplierId,
      shopId,
      stockQuantity: detail.main.stockQuantity,
      soldQuantity: detail.main.soldQuantity,
      skuCount: variants.length,
      brand: detail.main.brand,
      categoryId: detail.main.categoryId,
      location: detail.main.location,
      shortDescription: detail.main.shortDescription,
      descriptionHtml: detail.main.descriptionHtml,
      itemWeight: detail.main.itemWeight,
      itemSize: detail.main.itemSize,
      shippingTo: detail.main.shippingTo,
      videoUrl: detail.main.videoUrl,
      sellerNick: detail.main.sellerNick,
      variants: variants.map((variant) => ({
        externalId: variant.externalId,
        sku: variant.sku,
        name: variant.name,
        imageUrl: variant.imageUrl,
        price: variant.price,
        stock: variant.stock,
        attributes: variant.attributes,
        raw: variant.raw,
      })),
      propertyImages: propertyImages.map(({ propertiesKey, url }) => ({ propertiesKey, url })),
      videos: videos.map(({ url, posterUrl, title }) => ({ url, posterUrl, title })),
      rawResponse: payload,
      cachedAt: null,
      fromCache: false,
      properties: properties.map(({ name, value }) => ({ name, value })),
      priceTiers: priceTiers.map(({ minQuantity, price, originalPrice: tierOriginalPrice }) => ({
        minQuantity,
        price,
        originalPrice: tierOriginalPrice,
      })),
      raw: item,
    },
  };
}

async function callItemGet(
  credentials: { key: string; secret: string },
  offerId: string,
  options: OneBoundRequestOptions,
): Promise<ParsedItemDetail> {
  const url = new URL(`${ONEBOUND_API_BASE}/item_get/`);
  url.searchParams.set("key", credentials.key);
  url.searchParams.set("secret", credentials.secret);
  url.searchParams.set("num_iid", offerId);
  url.searchParams.set("cache", options.cache);
  url.searchParams.set("lang", options.lang);
  url.searchParams.set("result_type", "json");
  const response = await fetch(url);
  const payload = await readUpstreamJson(response);
  const errorCode = String(payload.error_code ?? "0000");
  if (!response.ok || errorCode !== "0000" || !responseItem(payload)) {
    throw new ApiError(502, String(payload.reason ?? "OneBound 获取商品详情失败"), "onebound_item_get_failed", {
      endpoint: "1688/item_get",
      request: { numIid: offerId, cache: options.cache, lang: options.lang, resultType: "json" },
      upstreamStatus: response.status,
      response: payload,
    });
  }
  return parseOneBoundItemPayload(payload, offerId);
}

export async function searchProductImage(
  env: Env,
  productId: string,
  imageId: string,
  options: ImageSearchOptions,
): Promise<{
  imageId: string;
} & OneBoundImageSearchResponse> {
  const image = await getProductImage(env, productId, imageId);
  if (!image) throw new ApiError(404, "商品图片不存在", "image_not_found");
  const credentials = await readCredentials(env);
  const uploadedImageId = image.r2Key
    ? await uploadR2Image(env, image.r2Key, credentials)
    : image.url
      ? await uploadRemoteImage(env, image.url, credentials)
      : null;
  if (!uploadedImageId) throw new ApiError(422, "图片没有可搜索的地址", "image_url_missing");

  return { imageId, ...(await searchUploadedImage(credentials, uploadedImageId, options)) };
}

export async function getOneBoundItem(
  env: Env,
  offerId: string,
  options: OneBoundRequestOptions,
  forceRefresh = false,
): Promise<OneBoundItemPreview> {
  const cached = forceRefresh ? null : await getCachedOneBoundItem(env, offerId);
  if (cached) {
    return { ...(cached.payload as OneBoundItemPreview), cachedAt: cached.fetchedAt, fromCache: true };
  }
  const parsed = await callItemGet(await readCredentials(env), offerId, forceRefresh ? { ...options, cache: "no" } : options);
  const fetchedAt = new Date().toISOString();
  const preview = { ...parsed.preview, cachedAt: fetchedAt, fromCache: false };
  await putCachedOneBoundItem(env, offerId, preview);
  return preview;
}

function itemFailure(offerId: string, caught: unknown): {
  offerId: string;
  code: string;
  message: string;
  details?: unknown;
} {
  if (caught instanceof ApiError) {
    return { offerId, code: caught.code, message: caught.message, details: caught.details };
  }
  return {
    offerId,
    code: "item_save_failed",
    message: caught instanceof Error ? caught.message : "保存商品详情失败",
  };
}

export async function saveOneBoundCandidates(
  env: Env,
  productId: string,
  offerIds: string[],
  options: OneBoundRequestOptions,
  createdBy: string,
): Promise<{
  saved: Array<{ offerId: string; title: string; linkId: string }>;
  failures: Array<{ offerId: string; code: string; message: string; details?: unknown }>;
}> {
  const credentials = await readCredentials(env);
  const saved: Array<{ offerId: string; title: string; linkId: string }> = [];
  const failures: Array<{ offerId: string; code: string; message: string; details?: unknown }> = [];

  for (const offerId of offerIds) {
    try {
      const parsed = await callItemGet(credentials, offerId, options);
      const linkId = await upsertOfferLink(env, productId, parsed.linkInput, createdBy, parsed.detail);
      saved.push({ offerId: parsed.preview.offerId, title: parsed.preview.title, linkId });
    } catch (caught) {
      failures.push(itemFailure(offerId, caught));
    }
  }

  if (saved.length === 0 && failures.length > 0) {
    throw new ApiError(502, "所选商品详情均未能保存", "onebound_candidate_save_failed", { failures });
  }
  return { saved, failures };
}
