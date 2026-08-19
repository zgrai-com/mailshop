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

const aiCandidateSchema = z.object({
  id: z.string().trim().min(1).max(160),
  url: z.string().trim().url().max(2_048),
  width: z.number().int().min(0).max(20_000).default(0),
  height: z.number().int().min(0).max(20_000).default(0),
  alt: z.string().max(500).default(""),
  title: z.string().max(500).default(""),
  source: z.string().max(80).default("image"),
  context: z.string().max(2_000).default(""),
  domScore: z.number().min(0).max(1).default(0),
});

export const aiCandidatesRequestSchema = z.object({
  candidates: z.array(aiCandidateSchema).min(1).max(24),
});

export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;
export type AiCandidate = z.infer<typeof aiCandidateSchema>;

export const oneboundRequestOptionsSchema = z.object({
  cache: z.enum(["yes", "no"]).default("no"),
  lang: z.enum(["cn", "en", "ru"]).default("cn"),
});

export const imageSearchSchema = oneboundRequestOptionsSchema.extend({
  sort: z.enum(["_sale", "sale", "price", "_price"]).default("_sale"),
  limit: z.coerce.number().int().min(10).max(50).default(50),
});

export const searchTaskSyncSchema = z.object({
  clientId: z.string().trim().min(1).max(160),
  name: z.string().trim().min(1).max(120),
  status: z.enum(["queued", "running", "completed", "failed"]),
  sourceImageUrl: optionalUrl,
  sourcePage: optionalUrl,
  options: imageSearchSchema.default(() => ({ sort: "_sale" as const, limit: 50, cache: "no" as const, lang: "cn" as const })),
  resultCount: z.coerce.number().int().min(0).max(500).default(0),
  results: z.array(z.unknown()).max(500).default([]),
  error: nullableText(2_000),
  chargedCredits: z.coerce.number().int().min(0).max(100_000).default(0),
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
  sourcePlatform: z.enum(["shopify", "manual", "other"]).default("shopify"),
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
  source: z.enum(["all", "shopify", "manual", "other"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
});

export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductPatch = z.infer<typeof productPatchSchema>;
export type OfferLinkInput = z.infer<typeof offerLinkSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
