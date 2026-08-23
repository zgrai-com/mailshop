import type { ShopifyRemoteProduct } from "../types";

export type ShopifyProductDraft = {
  title: string;
  descriptionHtml: string;
  handle: string;
  vendor: string;
  productType: string;
  tags: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED" | "UNLISTED";
  templateSuffix: string;
  seoTitle: string;
  seoDescription: string;
  variants: Array<{ id: string; title: string; price: string; compareAtPrice: string; sku: string; barcode: string; inventoryQuantity: number | null }>;
};

export const statusLabels: Record<string, string> = { ACTIVE: "在售", DRAFT: "草稿", ARCHIVED: "已归档", UNLISTED: "未上架" };

export function money(product: ShopifyRemoteProduct): string {
  if (product.priceMin == null && product.priceMax == null) return "未定价";
  const format = (value: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: product.currency, maximumFractionDigits: 2 }).format(value);
  return product.priceMax == null || product.priceMin === product.priceMax ? format(product.priceMin ?? product.priceMax ?? 0) : format(product.priceMin ?? 0) + " - " + format(product.priceMax);
}

export function draftFrom(product: ShopifyRemoteProduct): ShopifyProductDraft {
  return {
    title: product.title,
    descriptionHtml: product.descriptionHtml ?? "",
    handle: product.handle ?? "",
    vendor: product.vendor ?? "",
    productType: product.productType ?? "",
    tags: product.tags.join(", "),
    status: (product.status in statusLabels ? product.status : "DRAFT") as ShopifyProductDraft["status"],
    templateSuffix: product.templateSuffix ?? "",
    seoTitle: product.seo?.title ?? "",
    seoDescription: product.seo?.description ?? "",
    variants: (product.variants ?? []).map((variant) => ({
      id: variant.id,
      title: variant.title,
      price: variant.price == null ? "" : String(variant.price),
      compareAtPrice: variant.compareAtPrice == null ? "" : String(variant.compareAtPrice),
      sku: variant.sku ?? "",
      barcode: variant.barcode ?? "",
      inventoryQuantity: variant.inventoryQuantity,
    })),
  };
}

export function draftPayload(draft: ShopifyProductDraft): Record<string, unknown> {
  return {
    title: draft.title,
    descriptionHtml: draft.descriptionHtml,
    handle: draft.handle,
    vendor: draft.vendor,
    productType: draft.productType,
    tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    status: draft.status,
    templateSuffix: draft.templateSuffix,
    seoTitle: draft.seoTitle,
    seoDescription: draft.seoDescription,
    variants: draft.variants.map((variant) => ({ id: variant.id, price: variant.price, compareAtPrice: variant.compareAtPrice, sku: variant.sku, barcode: variant.barcode })),
  };
}
