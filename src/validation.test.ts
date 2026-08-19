import { describe, expect, it } from "vitest";

import {
  crawlerOfferLinkSchema,
  imageSearchSchema,
  oneboundCandidateBatchSchema,
  oneboundSettingsSchema,
  googleSettingsSchema,
  aiCandidatesRequestSchema,
  aiSettingsSchema,
  productInputSchema,
  productListQuerySchema,
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

  it("caps AI candidate batches and preserves DOM context", () => {
    const candidates = aiCandidatesRequestSchema.parse({ candidates: [{
      id: "image-1",
      url: "https://cdn.example.com/product.jpg",
      width: 600,
      height: 600,
      alt: "Blue shirt",
      context: "SKU: SHIRT-BLUE 商品价格 ¥39",
      domScore: 0.84,
    }] });
    expect(candidates.candidates[0]?.domScore).toBe(0.84);
    expect(() => aiCandidatesRequestSchema.parse({ candidates: Array.from({ length: 25 }, (_, index) => ({ id: String(index), url: `https://example.com/${index}.jpg` })) })).toThrow();
  });
});

describe("OneBound workflow schemas", () => {
  it("applies image-search defaults", () => {
    expect(imageSearchSchema.parse({})).toEqual({ sort: "_sale", limit: 50, cache: "no", lang: "cn" });
  });

  it("coerces image-search form values", () => {
    expect(imageSearchSchema.parse({ limit: "20", sort: "price" })).toMatchObject({ limit: 20, sort: "price" });
  });

  it("deduplicates selected candidate ids and caps batch size", () => {
    expect(oneboundCandidateBatchSchema.parse({ offerIds: ["1001", "1001", "1002"] }).offerIds).toEqual(["1001", "1002"]);
    expect(() => oneboundCandidateBatchSchema.parse({ offerIds: [] })).toThrow();
  });
});
