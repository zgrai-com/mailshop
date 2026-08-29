export type User = {
  id: string;
  username: string;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
  credits: number;
  authProvider?: "password" | "google";
  hasPassword?: boolean;
  role: "admin" | "user";
  isActive?: boolean;
  createdAt?: string;
  lastLoginAt?: string | null;
};

export type OneBoundSettings = {
  configured: boolean;
  key: string | null;
  secret: string | null;
  keyHint: string | null;
  updatedAt: string | null;
};

export type GoogleSettings = {
  configured: boolean;
  clientId: string | null;
  clientSecret: string | null;
  clientIdHint: string | null;
  allowedDomain: string;
  updatedAt: string | null;
};

export type AiSettings = {
  configured: boolean;
  conversation: AiServiceSettings;
  imageGeneration: AiServiceSettings;
  models: AiTaskModels;
  updatedAt: string | null;
};

export type AiServiceSettings = {
  configured: boolean;
  baseUrl: string;
  apiKey: string | null;
  apiKeyHint: string | null;
};

export type AiTaskModels = {
  imageFilterModelId: string | null;
  imageAnalysisModelId: string | null;
  chatModelId: string | null;
  translationModelId: string | null;
  imageGenerationModelId: string | null;
};

export type AiSettingsInput = {
  conversationBaseUrl: string;
  conversationApiKey: string;
  imageGenerationBaseUrl: string;
  imageGenerationApiKey: string;
  imageFilterModelId: string;
  imageAnalysisModelId: string;
  chatModelId: string;
  translationModelId: string;
  imageGenerationModelId: string;
};

export type AiRequestLog = {
  id: string;
  userId: string | null;
  userName?: string | null;
  operation: string;
  scope: string;
  status: "success" | "failed";
  httpStatus: number | null;
  durationMs: number;
  modelId: string | null;
  requestSummary: Record<string, unknown>;
  responseSummary: Record<string, unknown>;
  errorMessage: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
};

export type AuditLog = {
  id: string;
  userId: string | null;
  userName: string | null;
  username: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  detail: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
};

export type ShopifyStore = {
  id: string;
  shopDomain: string;
  displayName: string | null;
  status: "planned" | "installing" | "active" | "disabled" | "error";
  apiVersion: string;
  configured: boolean;
  clientId: string | null;
  clientSecret: string | null;
  clientIdHint: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

export type ShopifyRemoteProduct = {
  id: string;
  title: string;
  handle: string | null;
  status: string;
  vendor: string | null;
  productType: string | null;
  createdAt?: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
  totalInventory: number | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: string;
  featuredImage: { url: string; altText: string | null } | null;
  variantCount: number;
  tags: string[];
  descriptionHtml?: string;
  templateSuffix?: string | null;
  giftCard?: boolean;
  seo?: { title: string | null; description: string | null };
  options?: Array<{ name: string; values: string[] }>;
  images?: Array<{ id: string; url: string; altText: string | null; position: number }>;
  variants?: Array<{
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
  storeId?: string;
  storeName?: string;
  storeDomain?: string;
  translatedLocales?: Array<{ locale: string; name: string }>;
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
  marketId?: string | null;
  marketName?: string | null;
};

export type ShopifyProductTranslations = {
  locales: ShopifyLocale[];
  markets: ShopifyMarket[];
  marketId: string | null;
  missingScopes: string[];
  translatableContent: ShopifyTranslatableContent[];
  translations: ShopifyTranslation[];
  locale: string;
  sourceLocale: string;
};

export type ShopifyTranslationDraft = {
  resourceId: string;
  resourceType: string;
  resourceLabel: string;
  key: string;
  sourceValue: string;
  value: string;
  originalValue: string;
  digest: string;
  changed: boolean;
  outdated?: boolean;
  marketId?: string | null;
};

export type ShopifyTranslationAiResult = {
  locale: string;
  translations: ShopifyTranslationDraft[];
  promptVersion: string;
  credits: { balance: number; charged: number };
};

export type CreditTransaction = {
  id: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
};

export type SearchTaskOptions = {
  sort: "_sale" | "sale" | "bid2" | "_bid2";
  limit: number;
  page: number;
  cache: "yes" | "no";
  lang: "cn" | "en" | "ru";
  version: string;
};

export type SearchTaskResult = {
  offerId?: string;
  title?: string;
  imageUrl?: string | null;
  detailUrl?: string | null;
  price?: number | null;
  promotionPrice?: number | null;
  sales?: number | null;
  supplierName?: string | null;
  location?: string | null;
  imported?: boolean;
  importedAt?: string | null;
  productId?: string | null;
  shopifyImports?: Array<{
    storeId: string;
    productId: string;
    importedAt: string;
  }>;
};

export type SearchTaskRun = {
  id: string;
  imageId: string;
  imageUrl: string;
  status: "running" | "completed" | "failed";
  options: SearchTaskOptions;
  page: number;
  pageSize: number;
  uploadedImageId?: string | null;
  resultCount: number;
  totalResultCount?: number | null;
  results: SearchTaskResult[];
  error?: string | null;
  chargedCredits: number;
  createdAt: string;
  completedAt?: string | null;
};

export type SearchTask = {
  id: string;
  clientId: string;
  name: string;
  status: "unqueried" | "queried" | "imported";
  querying: boolean;
  sourceImageUrl?: string | null;
  sourcePage?: string | null;
  productTitle?: string | null;
  description?: string | null;
  sku?: string | null;
  sourceSite?: string | null;
  productUrl?: string | null;
  images: Array<{ id: string; url: string; width?: number; height?: number; alt?: string; title?: string; source?: string }>;
  selectedImageId?: string | null;
  selectedImageUrl?: string | null;
  options: SearchTaskOptions;
  resultCount: number;
  results: SearchTaskResult[];
  runs: SearchTaskRun[];
  importedCount: number;
  error?: string | null;
  chargedCredits: number;
  archivedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
};

export type SearchTaskLifecycle = "active" | "archived" | "deleted" | "all";

export type CollectionTaskBatchImage = {
  id: string;
  url: string;
  width?: number;
  height?: number;
  alt?: string;
  title?: string;
  source?: string;
};

export type CollectionTaskBatchItem = {
  clientId?: string;
  name?: string;
  productTitle?: string | null;
  description?: string | null;
  sku?: string | null;
  sourceSite?: string | null;
  productUrl: string;
  sourceImageUrl?: string | null;
  images: CollectionTaskBatchImage[];
  options?: Partial<SearchTaskOptions>;
};

export type CollectionTaskBatchResultItem = {
  index: number;
  clientId?: string;
  status: "created" | "updated" | "failed";
  taskId?: string;
  error?: { code: string; message: string; details?: unknown };
};

export type CollectionTaskBatchResponse = {
  created: number;
  updated: number;
  failed: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  results: CollectionTaskBatchResultItem[];
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
  descriptionHtml?: string | null;
  itemWeight?: string | null;
  itemSize?: string | null;
  shippingTo?: string | null;
  videoUrl?: string | null;
  sellerNick?: string | null;
  variants: Array<{
    externalId?: string | null;
    sku?: string | null;
    name?: string | null;
    imageUrl?: string | null;
    price?: number | null;
    stock?: number | null;
    attributes?: Record<string, unknown>;
    raw?: Record<string, unknown>;
  }>;
  propertyImages?: Array<{ propertiesKey?: string | null; url: string }>;
  videos?: Array<{ url: string; posterUrl?: string | null; title?: string | null }>;
  rawResponse?: Record<string, unknown>;
  cachedAt?: string | null;
  fromCache?: boolean;
  properties: Array<{ name: string; value: string }>;
  priceTiers: Array<{ minQuantity?: number | null; price?: number | null; originalPrice?: number | null }>;
  raw: Record<string, unknown>;
};

export type DashboardSummary = {
  collectionTaskCount: number;
  unqueriedTaskCount: number;
  queriedTaskCount: number;
  importedTaskCount: number;
  shopifyProductCount: number;
  shopifyStoreCount: number;
  activeShopifyStoreCount: number;
  activeUsers: number;
  recentCollectionTasks: Array<{
    id: string;
    name: string;
    status: SearchTask["status"];
    resultCount: number;
    importedCount: number;
    updatedAt: string;
    thumbnailUrl?: string;
  }>;
};
