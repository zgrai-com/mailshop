export type User = {
  id: string;
  username: string;
  displayName: string;
  isActive?: boolean;
  createdAt?: string;
  lastLoginAt?: string | null;
};

export type OneBoundSettings = {
  configured: boolean;
  keyHint: string | null;
  updatedAt: string | null;
};

export type OneBoundSearchResult = {
  offerId: string;
  title: string;
  imageUrl?: string | null;
  detailUrl?: string | null;
  price?: number | null;
  promotionPrice?: number | null;
  sales?: number | null;
  supplierName?: string | null;
  location?: string | null;
  raw: Record<string, unknown>;
};

export type OneBoundItemPreview = {
  offerId: string;
  title: string;
  detailUrl?: string | null;
  imageUrl?: string | null;
  images: string[];
  descriptionImages: string[];
  priceMin?: number | null;
  priceMax?: number | null;
  originalPrice?: number | null;
  currency: "CNY";
  minOrderQuantity?: number | null;
  unit?: string | null;
  supplierName?: string | null;
  supplierId?: string | null;
  shopId?: string | null;
  stockQuantity?: number | null;
  soldQuantity?: number | null;
  skuCount: number;
  brand?: string | null;
  categoryId?: string | null;
  location?: string | null;
  shortDescription?: string | null;
  properties: Array<{ name: string; value: string }>;
  priceTiers: Array<{ minQuantity?: number | null; price?: number | null; originalPrice?: number | null }>;
  raw: Record<string, unknown>;
};

export type ProductStatus = "new" | "image_searching" | "matched" | "reviewed" | "archived";

export type ProductSummary = {
  id: string;
  sourcePlatform: "shopify" | "manual" | "other";
  sourceStore: string;
  externalId: string;
  sourceUrl?: string | null;
  title: string;
  vendor?: string | null;
  productType?: string | null;
  spu?: string | null;
  inventoryQuantity?: number | null;
  currency: string;
  status: ProductStatus;
  syncState: string;
  priceMin?: number | null;
  priceMax?: number | null;
  updatedAt: string;
  assignedToName?: string | null;
  variantCount: number;
  imageCount: number;
  offerCount: number;
  thumbnailUrl?: string;
};

export type ProductVariant = {
  id: string;
  externalId: string;
  sku?: string | null;
  barcode?: string | null;
  title?: string | null;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  price?: number | null;
  compareAtPrice?: number | null;
  cost?: number | null;
  inventoryQuantity?: number | null;
  weight?: number | null;
  weightUnit?: string | null;
  imageUrl?: string | null;
  grams?: number | null;
  remainingInventory?: number | null;
  options?: unknown[];
};

export type ProductImage = {
  id: string;
  externalId: string;
  displayUrl?: string | null;
  url?: string | null;
  r2Key?: string | null;
  altText?: string | null;
  position: number;
};

export type ProductMedia = {
  id: string;
  externalId: string;
  mediaType: "video" | "image" | "document" | "other";
  url?: string | null;
  posterUrl?: string | null;
  title?: string | null;
  position: number;
  width?: number | null;
  height?: number | null;
  contentType?: string | null;
  metadata: Record<string, unknown>;
};

export type OfferLink = {
  linkId: string;
  matchStatus: "candidate" | "selected" | "rejected";
  matchScore?: number | null;
  notes?: string | null;
  variantMap: Record<string, unknown>;
  offerId: string;
  url?: string | null;
  title: string;
  supplierName?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  currency: string;
  minOrderQuantity?: number | null;
  unit?: string | null;
  province?: string | null;
  city?: string | null;
  thumbnailUrl?: string;
  variantCount: number;
};

export type StoredOfferDetail = {
  id: string;
  offerId: string;
  url?: string | null;
  title: string;
  supplierId?: string | null;
  supplierName?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  currency: string;
  minOrderQuantity?: number | null;
  unit?: string | null;
  province?: string | null;
  city?: string | null;
  shortDescription?: string | null;
  totalPrice?: number | null;
  suggestedPrice?: number | null;
  originalPrice?: number | null;
  stockQuantity?: number | null;
  soldQuantity?: number | null;
  brand?: string | null;
  brandId?: string | null;
  rootCategoryId?: string | null;
  categoryId?: string | null;
  sellerNick?: string | null;
  location?: string | null;
  itemWeight?: string | null;
  itemSize?: string | null;
  shopId?: string | null;
  descriptionHtml?: string | null;
  videoUrl?: string | null;
  sampleId?: string | null;
  shippingTo?: string | null;
  hasDiscount?: number | null;
  isPromotion?: number | null;
  fetchedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  variants: Array<{
    id: string;
    externalId: string;
    sku?: string | null;
    name?: string | null;
    attributes: Record<string, unknown>;
    price?: number | null;
    stock?: number | null;
  }>;
  images: Array<{
    id: string;
    externalId: string;
    url?: string | null;
    r2Key?: string | null;
    displayUrl?: string | null;
    altText?: string | null;
    position: number;
  }>;
  priceTiers: Array<{
    id: string;
    minQuantity?: number | null;
    price?: number | null;
    originalPrice?: number | null;
    position: number;
  }>;
  properties: Array<{
    id: string;
    propertyId?: string | null;
    valueId?: string | null;
    name: string;
    value: string;
    position: number;
  }>;
  propertyImages: Array<{ id: string; propertiesKey?: string | null; url: string; position: number }>;
  descriptionImages: Array<{ id: string; url: string; position: number }>;
  videos: Array<{ id: string; url: string; posterUrl?: string | null; title?: string | null; position: number }>;
  latestSnapshot?: {
    apiName: string;
    requestNumIid: string;
    errorCode?: string | null;
    reason?: string | null;
    upstreamRequestId?: string | null;
    fetchedAt: string;
  } | null;
};

export type ProductDetail = ProductSummary & {
  shopDomain?: string | null;
  handle?: string | null;
  descriptionHtml?: string | null;
  publishedAt?: string | null;
  compareAtPrice?: number | null;
  costMin?: number | null;
  costMax?: number | null;
  tags: string[];
  options: Array<{ name: string; values: string[] }>;
  attributes: Record<string, unknown>;
  categories: unknown[];
  content: Record<string, unknown>;
  notes?: string | null;
  assignedTo?: string | null;
  createdAt: string;
  variants: ProductVariant[];
  images: ProductImage[];
  media: ProductMedia[];
  offers: OfferLink[];
};

export type DashboardSummary = {
  total: number;
  newCount: number;
  searchingCount: number;
  matchedCount: number;
  reviewedCount: number;
  offerCount: number;
  activeUsers: number;
  recentProducts: Array<{
    id: string;
    title: string;
    status: ProductStatus;
    updatedAt: string;
    thumbnailUrl?: string;
  }>;
};

export type ProductInput = {
  sourcePlatform: "shopify" | "manual" | "other";
  sourceStore: string;
  externalId?: string;
  sourceUrl?: string;
  shopDomain?: string;
  title: string;
  vendor?: string;
  productType?: string;
  spu?: string;
  publishedAt?: string;
  inventoryQuantity?: number | null;
  currency: string;
  status: ProductStatus;
  priceMin?: number | null;
  priceMax?: number | null;
  tags: string[];
  attributes?: Record<string, unknown>;
  categories?: unknown[];
  content?: Record<string, unknown>;
  media?: Array<{
    externalId?: string;
    mediaType: "video" | "image" | "document" | "other";
    url?: string;
    posterUrl?: string;
    title?: string;
    position?: number;
  }>;
  notes?: string;
  images: Array<{ url: string; position: number }>;
  variants: Array<{
    externalId?: string;
    sku?: string;
    title?: string;
    price?: number | null;
    inventoryQuantity?: number | null;
  }>;
};
