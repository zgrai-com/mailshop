import { describe, expect, it } from "vitest";

import {
  crawlerOfferLinkSchema,
  imageSearchSchema,
  oneboundCandidateBatchSchema,
  oneboundSettingsSchema,
  googleSettingsSchema,
  aiCandidatesRequestSchema,
  aiSettingsSchema,
  shopifyPublishSchema,
  shopifyProductTranslationAiSchema,
  shopifyProductTranslationPublishSchema,
  shopifyProductTranslationsQuerySchema,
  shopifySettingsSchema,
  productInputSchema,
  productListQuerySchema,
  searchTaskSyncSchema,
  searchTaskListQuerySchema,
} from "./validation";

describe("productInputSchema", () => {
  it("normalizes a crawler Shopify product", () => {
    const product = productInputSchema.parse({
      sourcePlatform: "shopify",
      sourceStore: "demo.myshopify.com",
      externalId: "gid://shopify/Product/123",
      title: "Sample dress",
      currency: "usd",
      images: [{ url: "https://cdn.shopify.com/sample.jpg", position: 0 }],
      variants: [{ externalId: "456", sku: "SKU-RED-S", price: 29.9 }],
    });

    expect(product.currency).toBe("USD");
    expect(product.status).toBe("new");
    expect(product.images).toHaveLength(1);
    expect(product.variants[0]?.sku).toBe("SKU-RED-S");
  });

  it("accepts extended marketplace attributes and media", () => {
    const product = productInputSchema.parse({
      sourcePlatform: "other",
      sourceStore: "fehaute.com",
      externalId: "17080419",
      title: "Sample Fehaute dress",
      spu: "4AH17DR4H113D",
      inventoryQuantity: 99,
      attributes: { specifications: [{ name: "Material", value_name: "Satin" }] },
      categories: [{ id: 31, name: "Dresses" }],
      content: { tips: "Sample" },
      variants: [{
        externalId: "4863630",
        sku: "DR4H113D2EC4",
        grams: 870,
        remainingInventory: 4,
        options: [{ name: "Color", value_name: "Champagne" }],
      }],
      media: [{
        externalId: "2901",
        mediaType: "video",
        url: "https://fehaute.com/image/catalog/product/sample.mp4",
      }],
    });

    expect(product.spu).toBe("4AH17DR4H113D");
    expect(product.variants[0]?.grams).toBe(870);
    expect(product.media[0]?.mediaType).toBe("video");
  });

  it("rejects invalid currencies and negative prices", () => {
    expect(() => productInputSchema.parse({ title: "Bad", currency: "US", priceMin: -1 })).toThrow();
  });
});

describe("crawlerOfferLinkSchema", () => {
  it("accepts one product linked to a 1688 candidate", () => {
    const link = crawlerOfferLinkSchema.parse({
      productId: "0a95f67f-f8fb-4454-9ef4-7cb0debb28a0",
      matchStatus: "candidate",
      offer: {
        offerId: "1069450613745",
        title: "1688 candidate",
        priceMin: 18.5,
        currency: "CNY",
      },
    });

    expect(link.offer.offerId).toBe("1069450613745");
    expect(link.offer.images).toEqual([]);
  });
});

describe("productListQuerySchema", () => {
  it("coerces pagination values and applies defaults", () => {
    expect(productListQuerySchema.parse({ page: "2", pageSize: "50" })).toMatchObject({
      page: 2,
      pageSize: 50,
      status: "all",
      source: "all",
    });
  });
});

describe("searchTaskListQuerySchema", () => {
  it("normalizes task filters and pagination", () => {
    expect(searchTaskListQuerySchema.parse({ search: "  dress  ", status: "queried", page: "3", pageSize: "10" }))
      .toEqual({ search: "dress", status: "queried", page: 3, pageSize: 10 });
  });

  it("uses compact task-page defaults", () => {
    expect(searchTaskListQuerySchema.parse({})).toEqual({ search: "", status: "all", page: 1, pageSize: 5 });
  });
});

describe("oneboundSettingsSchema", () => {
  it("requires both OneBound credentials", () => {
    expect(oneboundSettingsSchema.parse({ key: "key-1", secret: "secret-1" })).toEqual({ key: "key-1", secret: "secret-1" });
    expect(() => oneboundSettingsSchema.parse({ key: "key-1", secret: "" })).toThrow();
  });
});

describe("googleSettingsSchema", () => {
  it("accepts OAuth credentials and an optional Workspace domain", () => {
    expect(googleSettingsSchema.parse({
      clientId: "client.apps.googleusercontent.com",
      clientSecret: "secret-value",
      allowedDomain: "example.com",
    })).toEqual({
      clientId: "client.apps.googleusercontent.com",
      clientSecret: "secret-value",
      allowedDomain: "example.com",
    });
    expect(googleSettingsSchema.parse({
      clientId: "client.apps.googleusercontent.com",
      clientSecret: "secret-value",
      allowedDomain: "",
    }).allowedDomain).toBe("");
  });

  it("rejects missing OAuth credentials", () => {
    expect(() => googleSettingsSchema.parse({ clientId: "", clientSecret: "secret", allowedDomain: "" })).toThrow();
    expect(() => googleSettingsSchema.parse({ clientId: "client", clientSecret: "", allowedDomain: "" })).toThrow();
  });
});

describe("AI schemas", () => {
  it("accepts encrypted-server configuration inputs without exposing them to clients", () => {
    expect(aiSettingsSchema.parse({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-example",
      modelId: "gpt-4o-mini",
    }).modelId).toBe("gpt-4o-mini");
  });

  it("caps AI candidate batches and accepts bounded page HTML snapshots", () => {
    const candidates = aiCandidatesRequestSchema.parse({ candidates: [{
      id: "image-1",
      url: "https://cdn.example.com/product.jpg",
      width: 600,
      height: 600,
      alt: "Blue shirt",
      context: "SKU: SHIRT-BLUE 商品价格 ¥39",
      sku: "SHIRT-BLUE",
      domScore: 0.84,
    }], pageSnapshot: {
      url: "https://shop.example.com/products/blue-shirt",
      title: "Blue shirt",
      html: '<html data-node-id="f123-n1"><body data-node-id="f123-n2"><article data-node-id="f123-n10"><img data-node-id="f123-n11" data-image-ids="image-1"><h2 data-node-id="f123-n12">Blue shirt</h2><span data-node-id="f123-n13">SKU: SHIRT-BLUE</span></article></body></html>',
    } });
    expect(candidates.candidates[0]?.domScore).toBe(0.84);
    expect(candidates.candidates[0]?.sku).toBe("SHIRT-BLUE");
    expect(candidates.pageSnapshot?.html).toContain('data-image-ids="image-1"');
    expect(() => aiCandidatesRequestSchema.parse({ candidates: Array.from({ length: 121 }, (_, index) => ({ id: String(index), url: `https://example.com/${index}.jpg` })) })).toThrow();
    expect(aiCandidatesRequestSchema.parse({ stage: "fields", regionSnapshots: [{ rootId: "f1-n10", html: "<div>Title</div>" }] }).stage).toBe("fields");
    expect(() => aiCandidatesRequestSchema.parse({ stage: "fields", regionSnapshots: [{ rootId: "f1-n10", html: "x".repeat(80_001) }] })).toThrow();
    expect(() => aiCandidatesRequestSchema.parse({ candidates: [{ id: "image-1", url: "https://cdn.example.com/product.jpg" }], pageSnapshot: { regions: Array.from({ length: 49 }, (_, index) => ({ id: String(index), html: "<div />" })) } })).toThrow();
    expect(() => aiCandidatesRequestSchema.parse({ candidates: [{ id: "image-1", url: "https://cdn.example.com/product.jpg" }], pageSnapshot: { html: "x".repeat(200_001) } })).toThrow();
  });
});

describe("Shopify schemas", () => {
  it("accepts encrypted server credentials and a publication target", () => {
    expect(shopifySettingsSchema.parse({
      shopDomain: "demo.myshopify.com",
      clientId: "client-id",
      clientSecret: "client-secret",
    })).toMatchObject({ shopDomain: "demo.myshopify.com", displayName: "" });
    expect(shopifyPublishSchema.parse({ storeId: "0a95f67f-f8fb-4454-9ef4-7cb0debb28a0" }).storeId).toContain("0a95");
  });

  it("accepts Shopify locale tags with script and numeric region subtags", () => {
    const storeId = "0a95f67f-f8fb-4454-9ef4-7cb0debb28a0";
    expect(shopifyProductTranslationsQuerySchema.parse({ locale: "es-419" }).locale).toBe("es-419");
    expect(shopifyProductTranslationAiSchema.parse({ storeId, productId: "gid://shopify/Product/1", locale: "zh-Hant", fields: [{ key: "title", sourceValue: "示例" }] }).locale).toBe("zh-Hant");
    expect(shopifyProductTranslationPublishSchema.parse({ storeId, productId: "gid://shopify/Product/1", locale: "pt-BR", translations: [{ key: "title", value: "Exemplo", translatableContentDigest: "digest" }] }).locale).toBe("pt-BR");
    expect(() => shopifyProductTranslationsQuerySchema.parse({ locale: "bad_locale" })).toThrow();
  });
});

describe("OneBound workflow schemas", () => {
  it("applies image-search defaults", () => {
    expect(imageSearchSchema.parse({})).toEqual({ sort: "_sale", limit: 50, page: 1, cache: "no", lang: "cn", version: "" });
  });

  it("coerces image-search form values", () => {
    expect(imageSearchSchema.parse({ limit: "20", sort: "bid2", page: "3", version: "2025-09" })).toMatchObject({ limit: 20, sort: "bid2", page: 3, version: "2025-09" });
  });

  it("deduplicates selected candidate ids and caps batch size", () => {
    expect(oneboundCandidateBatchSchema.parse({ offerIds: ["1001", "1001", "1002"] }).offerIds).toEqual(["1001", "1002"]);
    expect(() => oneboundCandidateBatchSchema.parse({ offerIds: [] })).toThrow();
  });
});

describe("searchTaskSyncSchema", () => {
  it("accepts one product task with multiple source images", () => {
    const task = searchTaskSyncSchema.parse({
      clientId: "extension-task-1",
      name: "Summer dress",
      productTitle: "Summer dress",
      description: "Lightweight product description",
      sku: "SKU-1001",
      sourceSite: "example.com",
      productUrl: "https://example.com/products/1001",
      images: [
        { id: "image-1", url: "https://example.com/image.jpg", width: 800, height: 800 },
        { id: "image-2", url: "https://example.com/image-2.jpg" },
      ],
    });

    expect(task.images).toHaveLength(2);
    expect(task.options).toEqual({ sort: "_sale", limit: 50, page: 1, cache: "no", lang: "cn", version: "" });
  });

  it("rejects a task without source images", () => {
    expect(() => searchTaskSyncSchema.parse({ clientId: "task-2", name: "No image", images: [] })).toThrow();
  });

  it("accepts up to 200 source images", () => {
    const images = Array.from({ length: 200 }, (_, index) => ({
      id: `image-${index}`,
      url: `https://example.com/${index}.jpg`,
    }));

    expect(searchTaskSyncSchema.parse({ clientId: "task-3", name: "Bulk images", images }).images).toHaveLength(200);
    expect(() => searchTaskSyncSchema.parse({ clientId: "task-4", name: "Too many images", images: [...images, { id: "image-200", url: "https://example.com/200.jpg" }] })).toThrow();
  });
});
