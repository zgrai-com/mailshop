import type { ShopifyDescriptionImageInput, ShopifyDescriptionSourceInput } from "./ai";
import type { OneBoundItemPreview } from "./onebound";

export type ShopifyDescriptionSourceOrigin = "collection_task" | "catalog";

export type ShopifyDescriptionSourceContext = ShopifyDescriptionSourceInput & {
  origin: ShopifyDescriptionSourceOrigin;
  rawResponse: Record<string, unknown>;
  sourceUrl: string | null;
  cachedAt: string | null;
  fetchedAt: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.flatMap((item) => asRecord(item) ? [asRecord(item)!] : [])
    : [];
}

function uniqueImages(images: ShopifyDescriptionImageInput[]): ShopifyDescriptionImageInput[] {
  const seen = new Set<string>();
  return images.flatMap((image, index) => {
    const url = image.url.trim();
    if (!url) return [];
    const key = image.r2Key || url;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      ...image,
      id: image.id.slice(0, 255),
      url,
      position: image.position ?? index + 1,
    }];
  });
}

function mainImage(url: string, index: number, title: string): ShopifyDescriptionImageInput {
  return { id: `main-${index + 1}`, url, altText: `${title} main image ${index + 1}`, position: index + 1, group: "main" };
}

function detailImage(url: string, index: number, title: string): ShopifyDescriptionImageInput {
  return { id: `detail-${index + 1}`, url, altText: `${title} detail image ${index + 1}`, position: index + 1, group: "detail" };
}

function propertyImage(url: string, index: number, title: string): ShopifyDescriptionImageInput {
  return { id: `property-${index + 1}`, url, altText: `${title} property image ${index + 1}`, position: index + 1, group: "detail" };
}

export function buildShopifyDescriptionSourceFromOneBoundPreview(preview: OneBoundItemPreview): ShopifyDescriptionSourceContext {
  const rawResponse = asRecord(preview.rawResponse) ?? asRecord(preview.raw) ?? {};
  const images = uniqueImages([
    ...preview.images.map((url, index) => mainImage(url, index, preview.title)),
    ...preview.descriptionImages.map((url, index) => detailImage(url, index, preview.title)),
    ...(preview.propertyImages ?? []).map((image, index) => propertyImage(image.url, index, preview.title)),
  ]);

  return {
    origin: "collection_task",
    offerId: preview.offerId,
    title: preview.title,
    raw: rawResponse,
    rawResponse,
    descriptionHtml: preview.descriptionHtml ?? null,
    shortDescription: preview.shortDescription ?? null,
    properties: preview.properties ?? [],
    variants: preview.variants.map((variant) => ({
      externalId: variant.externalId ?? null,
      sku: variant.sku ?? null,
      name: variant.name ?? null,
      imageUrl: variant.imageUrl ?? null,
      price: variant.price ?? null,
      stock: variant.stock ?? null,
      attributes: variant.attributes ?? {},
      raw: variant.raw ?? {},
    })),
    priceTiers: preview.priceTiers.map((tier) => ({
      minQuantity: tier.minQuantity ?? null,
      price: tier.price ?? null,
      originalPrice: tier.originalPrice ?? null,
    })),
    supplierName: preview.supplierName ?? null,
    brand: preview.brand ?? null,
    category: preview.categoryId ?? null,
    images,
    sourceUrl: preview.detailUrl ?? null,
    cachedAt: preview.cachedAt ?? null,
    fetchedAt: preview.cachedAt ?? null,
  };
}

export function buildShopifyDescriptionSourceFromStoredOfferDetail(detail: Record<string, unknown>): ShopifyDescriptionSourceContext {
  const title = asString(detail.title) ?? `1688 offer ${asString(detail.offerId) ?? ""}`.trim();
  const latestSnapshot = asRecord(detail.latestSnapshot);
  const rawResponse = asRecord(latestSnapshot?.responseJson) ?? asRecord(detail.raw) ?? {};
  const mainImages = recordArray(detail.images).map((image, index) => ({
    id: `main-${index + 1}`,
    url: asString(image.displayUrl) ?? asString(image.url) ?? "",
    altText: asString(image.altText) ?? `${title} main image ${index + 1}`,
    position: asNumber(image.position) ?? index + 1,
    r2Key: asString(image.r2Key),
    contentType: asString(image.contentType),
    group: "main" as const,
  }));
  const detailImages = recordArray(detail.descriptionImages).map((image, index) => ({
    id: `detail-${index + 1}`,
    url: asString(image.url) ?? "",
    altText: `${title} detail image ${index + 1}`,
    position: asNumber(image.position) ?? index + 1,
    group: "detail" as const,
  }));
  const propertyImages = recordArray(detail.propertyImages).map((image, index) => ({
    id: `property-${index + 1}`,
    url: asString(image.url) ?? "",
    altText: `${title} property image ${index + 1}`,
    position: asNumber(image.position) ?? index + 1,
    group: "detail" as const,
  }));

  return {
    origin: "catalog",
    offerId: asString(detail.offerId) ?? "",
    title,
    raw: rawResponse,
    rawResponse,
    descriptionHtml: asString(detail.descriptionHtml),
    shortDescription: asString(detail.shortDescription),
    properties: recordArray(detail.properties).flatMap((property) => {
      const name = asString(property.name);
      const value = asString(property.value);
      return name && value ? [{ name, value }] : [];
    }),
    variants: recordArray(detail.variants),
    priceTiers: recordArray(detail.priceTiers),
    supplierName: asString(detail.supplierName),
    brand: asString(detail.brand),
    category: asString(detail.categoryId) ?? asString(detail.rootCategoryId),
    images: uniqueImages([...mainImages, ...detailImages, ...propertyImages]),
    sourceUrl: asString(detail.url),
    cachedAt: asString(detail.fetchedAt) ?? asString(latestSnapshot?.fetchedAt),
    fetchedAt: asString(detail.fetchedAt) ?? asString(latestSnapshot?.fetchedAt),
  };
}

export function toShopifyDescriptionSourceInput(context: ShopifyDescriptionSourceContext): ShopifyDescriptionSourceInput {
  return {
    offerId: context.offerId,
    title: context.title,
    raw: context.raw,
    descriptionHtml: context.descriptionHtml,
    shortDescription: context.shortDescription,
    properties: context.properties,
    variants: context.variants,
    priceTiers: context.priceTiers,
    supplierName: context.supplierName,
    brand: context.brand,
    category: context.category,
    images: context.images,
  };
}
