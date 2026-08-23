import { z } from "zod";

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const nullableMoney = z.number().finite().min(0).nullable().optional();
const nullableInteger = z.number().int().nullable().optional();
const optionalUrl = z.string().trim().url().max(2_048).nullable().optional();

export const productStatuses = [
  "new",
  "image_searching",
  "matched",
  "reviewed",
  "archived",
] as const;

export const loginSchema = z.object({
  username: z.string().trim().min(2).max(64),
  password: z.string().min(8).max(256),
});

export const bootstrapSchema = loginSchema.extend({
  token: z.string().min(24).max(512),
  displayName: z.string().trim().min(1).max(80),
});

export const userCreateSchema = z.object({
  username: z.string().trim().min(2).max(64),
  displayName: z.string().trim().min(1).max(80),
  password: z.string().min(12).max(256),
});

export const userPatchSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
});

export const oneboundSettingsSchema = z.object({
  key: z.string().trim().min(1).max(512),
  secret: z.string().trim().min(1).max(512),
});

export const googleSettingsSchema = z.object({
  clientId: z.string().trim().min(1).max(512),
  clientSecret: z.string().trim().min(1).max(512),
  allowedDomain: z.string().trim().max(255),
});

export const aiSettingsSchema = z.object({
  baseUrl: z.string().trim().url().max(2_048),
  apiKey: z.string().trim().min(1).max(2_048),
  modelId: z.string().trim().min(1).max(255),
});

export const shopifySettingsSchema = z.object({
  shopDomain: z.string().trim().min(1).max(255),
  displayName: z.string().trim().max(255).default(""),
  clientId: z.string().trim().min(1).max(1_024),
  clientSecret: z.string().trim().min(1).max(2_048),
});

export const shopifyPublishSchema = z.object({
  storeId: z.string().uuid(),
});

export const shopifyProductListQuerySchema = z.object({
  storeId: z.string().uuid(),
  search: z.string().trim().max(200).default(""),
  status: z.enum(["all", "ACTIVE", "DRAFT", "ARCHIVED", "UNLISTED"]).default("all"),
  productType: z.string().trim().max(255).default(""),
  vendor: z.string().trim().max(255).default(""),
  inventory: z.enum(["all", "in_stock", "out_of_stock"]).default("all"),
  sortKey: z.enum(["TITLE", "UPDATED_AT", "CREATED_AT", "INVENTORY_TOTAL", "PRICE", "PRODUCT_TYPE", "VENDOR"]).default("UPDATED_AT"),
  reverse: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  first: z.coerce.number().int().min(10).max(100).default(25),
  after: z.string().trim().max(500).nullable().optional().transform((value) => value || null),
});

const shopifyVariantUpdateSchema = z.object({
  id: z.string().min(1).max(255),
  price: z.string().trim().max(32).default(""),
  compareAtPrice: z.string().trim().max(32).default(""),
  sku: z.string().trim().max(255).default(""),
  barcode: z.string().trim().max(255).default(""),
});

export const shopifyProductUpdateSchema = z.object({
  storeId: z.string().uuid(),
  productId: z.string().min(1).max(255),
  title: z.string().trim().min(1).max(255),
  descriptionHtml: z.string().max(500_000).default(""),
  handle: z.string().trim().max(255).default(""),
  vendor: z.string().trim().max(255).default(""),
  productType: z.string().trim().max(255).default(""),
  tags: z.array(z.string().trim().min(1).max(100)).max(250).default([]),
  status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED", "UNLISTED"]).default("DRAFT"),
  templateSuffix: z.string().trim().max(255).default(""),
  seoTitle: z.string().trim().max(70).default(""),
  seoDescription: z.string().trim().max(320).default(""),
  mediaUrls: z.array(z.string().trim().url().max(2_048)).max(50).default([]),
  variants: z.array(shopifyVariantUpdateSchema).max(250).default([]),
});

const shopifyTranslationFieldSchema = z.object({
  resourceId: z.string().trim().min(1).max(255).optional(),
  resourceType: z.string().trim().max(100).optional(),
  resourceLabel: z.string().trim().max(255).optional(),
  sourceLocale: z.string().trim().max(35).optional(),
  key: z.string().trim().min(1).max(255),
  sourceValue: z.string().max(500_000),
  existingValue: z.string().max(500_000).optional(),
  digest: z.string().trim().max(255).optional(),
});

const shopifyLocaleSchema = z.string().trim().min(2).max(35).regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/u, "locale 格式无效");

const shopifyTranslationPublishItemSchema = z.object({
  resourceId: z.string().trim().min(1).max(255).optional(),
  key: z.string().trim().min(1).max(255),
  value: z.string().max(500_000),
  translatableContentDigest: z.string().trim().min(1).max(255),
  marketId: z.string().trim().max(255).optional(),
});

export const shopifyProductTranslationsQuerySchema = z.object({
  locale: shopifyLocaleSchema.optional(),
  marketId: z.string().trim().max(255).optional(),
});

export const shopifyProductTranslationAiSchema = z.object({
  storeId: z.string().uuid(),
  productId: z.string().min(1).max(255),
  locale: shopifyLocaleSchema,
  marketId: z.string().trim().max(255).optional(),
  fields: z.array(shopifyTranslationFieldSchema).min(1).max(32),
  style: z.string().trim().max(500).default("自然、清晰、符合目标市场电商习惯"),
  glossary: z.string().trim().max(4_000).default(""),
});

export const shopifyProductTranslationPublishSchema = z.object({
  storeId: z.string().uuid(),
  productId: z.string().min(1).max(255),
  locale: shopifyLocaleSchema,
  translations: z.array(shopifyTranslationPublishItemSchema).min(1).max(250),
});

const aiCandidateSchema = z.object({
  id: z.string().trim().min(1).max(160),
  url: z.string().trim().url().max(2_048),
  width: z.number().int().min(0).max(20_000).default(0),
  height: z.number().int().min(0).max(20_000).default(0),
  alt: z.string().max(500).default(""),
  title: z.string().max(500).default(""),
  source: z.string().max(80).default("image"),
  sourcePage: optionalUrl,
  context: z.string().max(2_000).default(""),
  sku: nullableText(160),
  domScore: z.number().min(0).max(1).default(0),
});

const aiPageRegionSchema = z.object({
  rootId: z.string().trim().min(1).max(160),
  titleIds: z.array(z.string().trim().min(1).max(160)).max(24).default([]),
  skuIds: z.array(z.string().trim().min(1).max(160)).max(24).default([]),
  imageIds: z.array(z.string().trim().min(1).max(160)).max(96).default([]),
  html: z.string().max(80_000).default(""),
});

const aiPageSnapshotSchema = z.object({
  url: optionalUrl,
  title: z.string().max(500).default(""),
  html: z.string().max(200_000).default(""),
  regions: z.array(aiPageRegionSchema).max(48).default([]),
});

export const aiCandidatesRequestSchema = z.object({
  stage: z.enum(["regions", "fields"]).default("regions"),
  candidates: z.array(aiCandidateSchema).max(120).default([]),
  pageSnapshot: aiPageSnapshotSchema.nullable().optional(),
  regionSnapshots: z.array(aiPageRegionSchema).max(24).default([]),
});

export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;
export type ShopifySettingsInput = z.infer<typeof shopifySettingsSchema>;
export type ShopifyProductTranslationAiInput = z.infer<typeof shopifyProductTranslationAiSchema>;
export type ShopifyProductTranslationPublishInput = z.infer<typeof shopifyProductTranslationPublishSchema>;
export type AiCandidate = z.infer<typeof aiCandidateSchema>;
export type AiPageSnapshot = z.infer<typeof aiPageSnapshotSchema>;
export type AiPageRegion = z.infer<typeof aiPageRegionSchema>;

export const oneboundRequestOptionsSchema = z.object({
  cache: z.enum(["yes", "no"]).default("no"),
  lang: z.enum(["cn", "en", "ru"]).default("cn"),
});

export const imageSearchSchema = oneboundRequestOptionsSchema.extend({
  sort: z.enum(["_sale", "sale", "bid2", "_bid2"]).default("_sale"),
  limit: z.coerce.number().int().min(10).max(50).default(50),
  page: z.coerce.number().int().min(1).max(1_000).default(1),
  version: z.string().trim().max(64).default(""),
});

const extensionTaskImageUrlSchema = z.string().trim().min(1).max(2_000_000).refine((value) => {
  if (/^data:image\/(?:avif|gif|jpeg|png|webp);base64,/iu.test(value)) return true;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, "图片地址必须是 HTTP(S) URL 或受支持的 data URL");

export const extensionTaskImageSchema = z.object({
  id: z.string().trim().min(1).max(160),
  url: extensionTaskImageUrlSchema,
  width: z.coerce.number().int().min(0).max(20_000).default(0),
  height: z.coerce.number().int().min(0).max(20_000).default(0),
  alt: z.string().trim().max(500).default(""),
  title: z.string().trim().max(500).default(""),
  source: z.string().trim().max(80).default("page"),
});

export const searchTaskSyncSchema = z.object({
  clientId: z.string().trim().min(1).max(160),
  name: z.string().trim().min(1).max(120),
  productTitle: nullableText(1_000),
  description: nullableText(20_000),
  sku: nullableText(500),
  sourceSite: nullableText(255),
  productUrl: optionalUrl,
  images: z.array(extensionTaskImageSchema).min(1).max(200),
  options: imageSearchSchema.default(() => ({
    sort: "_sale" as const,
    limit: 50,
    page: 1,
    version: "",
    cache: "no" as const,
    lang: "cn" as const,
  })),
});

export type SearchTaskSyncInput = z.infer<typeof searchTaskSyncSchema>;

export const oneboundCandidateBatchSchema = oneboundRequestOptionsSchema.extend({
  offerIds: z.array(z.string().trim().min(1).max(160)).min(1).max(20)
    .transform((values) => [...new Set(values)]),
});

export const passwordChangeSchema = z.object({
  password: z.string().min(12).max(256),
});

export const productVariantSchema = z.object({
  externalId: nullableText(160),
  sku: nullableText(160),
  barcode: nullableText(160),
  title: nullableText(500),
  option1: nullableText(255),
  option2: nullableText(255),
  option3: nullableText(255),
  price: nullableMoney,
  compareAtPrice: nullableMoney,
  cost: nullableMoney,
  inventoryQuantity: nullableInteger,
  weight: nullableMoney,
  weightUnit: nullableText(32),
  imageUrl: optionalUrl,
  grams: nullableMoney,
  remainingInventory: nullableInteger,
  options: z.array(z.unknown()).max(20).default([]),
  raw: z.unknown().optional(),
});

export const productImageSchema = z.object({
  externalId: nullableText(160),
  url: optionalUrl,
  r2Key: nullableText(1_024),
  altText: nullableText(500),
  position: z.number().int().min(0).max(10_000).optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  contentType: nullableText(120),
});

export const productMediaSchema = z.object({
  externalId: nullableText(160),
  mediaType: z.enum(["video", "image", "document", "other"]),
  url: optionalUrl,
  posterUrl: optionalUrl,
  title: nullableText(500),
  position: z.number().int().min(0).max(10_000).optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  contentType: nullableText(120),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const productInputSchema = z.object({
  sourcePlatform: z.enum(["1688", "shopify", "manual", "other"]).default("1688"),
  sourceStore: z.string().trim().max(255).default(""),
  externalId: nullableText(160),
  sourceUrl: optionalUrl,
  shopDomain: nullableText(255),
  handle: nullableText(255),
  title: z.string().trim().min(1).max(1_000),
  vendor: nullableText(255),
  productType: nullableText(255),
  descriptionHtml: nullableText(500_000),
  spu: nullableText(160),
  publishedAt: nullableText(64),
  inventoryQuantity: nullableInteger,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("USD"),
  status: z.enum(productStatuses).default("new"),
  syncState: z.enum(["not_synced", "pending", "synced", "failed"]).default("not_synced"),
  priceMin: nullableMoney,
  priceMax: nullableMoney,
  compareAtPrice: nullableMoney,
  costMin: nullableMoney,
  costMax: nullableMoney,
  tags: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  options: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        values: z.array(z.string().trim().max(255)).max(100),
      }),
    )
    .max(20)
    .default([]),
  attributes: z.record(z.string(), z.unknown()).default({}),
  categories: z.array(z.unknown()).max(200).default([]),
  content: z.record(z.string(), z.unknown()).default({}),
  raw: z.unknown().optional(),
  notes: nullableText(20_000),
  assignedTo: nullableText(64),
  offerId1688: nullableText(160),
  supplierId1688: nullableText(160),
  supplierName1688: nullableText(500),
  minOrderQuantity1688: nullableMoney,
  unit1688: nullableText(64),
  province1688: nullableText(100),
  city1688: nullableText(100),
  shortDescription1688: nullableText(500_000),
  totalPrice1688: nullableMoney,
  suggestedPrice1688: nullableMoney,
  originalPrice1688: nullableMoney,
  stockQuantity1688: nullableInteger,
  soldQuantity1688: nullableInteger,
  brand1688: nullableText(255),
  brandId1688: nullableText(160),
  rootCategoryId1688: nullableText(160),
  categoryId1688: nullableText(160),
  sellerNick1688: nullableText(255),
  location1688: nullableText(255),
  itemWeight1688: nullableText(255),
  itemSize1688: nullableText(255),
  shopId1688: nullableText(160),
  videoUrl1688: optionalUrl,
  sampleId1688: nullableText(160),
  shippingTo1688: nullableText(255),
  hasDiscount1688: nullableInteger,
  isPromotion1688: nullableInteger,
  fetchedAt1688: nullableText(64),
  variants: z.array(productVariantSchema).max(500).default([]),
  images: z.array(productImageSchema).max(200).default([]),
  media: z.array(productMediaSchema).max(100).default([]),
});

export const productPatchSchema = productInputSchema.partial().extend({
  title: z.string().trim().min(1).max(1_000).optional(),
});

export const offerVariantSchema = z.object({
  externalId: nullableText(160),
  sku: nullableText(160),
  name: nullableText(500),
  attributes: z.record(z.string(), z.unknown()).default({}),
  price: nullableMoney,
  stock: nullableInteger,
  raw: z.unknown().optional(),
});

export const offerImageSchema = productImageSchema.omit({ r2Key: true }).extend({
  r2Key: nullableText(1_024),
});

export const offerSchema = z.object({
  offerId: z.string().trim().min(1).max(160),
  url: optionalUrl,
  title: z.string().trim().min(1).max(1_000),
  supplierId: nullableText(160),
  supplierName: nullableText(500),
  priceMin: nullableMoney,
  priceMax: nullableMoney,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("CNY"),
  minOrderQuantity: nullableMoney,
  unit: nullableText(64),
  province: nullableText(100),
  city: nullableText(100),
  sourceUrl: optionalUrl,
  raw: z.unknown().optional(),
  variants: z.array(offerVariantSchema).max(1_000).default([]),
  images: z.array(offerImageSchema).max(200).default([]),
});

export const offerLinkSchema = z.object({
  offer: offerSchema,
  matchStatus: z.enum(["candidate", "selected", "rejected"]).default("candidate"),
  matchScore: z.number().min(0).max(1).nullable().optional(),
  notes: nullableText(20_000),
  variantMap: z.record(z.string(), z.unknown()).default({}),
});

export const crawlerOfferLinkSchema = offerLinkSchema.extend({
  productId: z.string().uuid(),
});

export const productListQuerySchema = z.object({
  search: z.string().trim().max(200).default(""),
  status: z.enum(["all", ...productStatuses]).default("all"),
  source: z.enum(["all", "1688", "shopify", "manual", "other"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
});

export const searchTaskListQuerySchema = z.object({
  search: z.string().trim().max(200).default(""),
  status: z.enum(["all", "unqueried", "queried", "imported"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(50).default(5),
});

export const searchTaskImportSchema = oneboundRequestOptionsSchema.extend({
  runId: z.string().uuid().optional(),
  offerIds: z.array(z.string().trim().min(1).max(160)).max(100)
    .transform((values) => [...new Set(values)]).optional(),
});

export const searchTaskRunSchema = imageSearchSchema.extend({
  imageId: z.string().trim().min(1).max(160),
});

export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductPatch = z.infer<typeof productPatchSchema>;
export type OfferLinkInput = z.infer<typeof offerLinkSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type SearchTaskListQuery = z.infer<typeof searchTaskListQuerySchema>;
export type SearchTaskImportInput = z.infer<typeof searchTaskImportSchema>;
export type SearchTaskRunInput = z.infer<typeof searchTaskRunSchema>;
