import { describe, expect, it } from "vitest";

import { buildShopifyDescriptionSourceFromOneBoundPreview, toShopifyDescriptionSourceInput } from "./shopify-description";
import type { OneBoundItemPreview } from "./onebound";

describe("Shopify description source helpers", () => {
  it("merges and deduplicates preview images while preserving the normalized fields", () => {
    const preview = {
      offerId: "123",
      title: "Sample product",
      detailUrl: "https://detail.example/item",
      imageUrl: "https://img.example/main-1.jpg",
      images: ["https://img.example/main-1.jpg", "https://img.example/main-2.jpg"],
      descriptionImages: ["https://img.example/main-2.jpg", "https://img.example/detail-1.jpg"],
      priceMin: 12,
      priceMax: 18,
      originalPrice: 20,
      currency: "CNY",
      minOrderQuantity: 2,
      unit: "pcs",
      supplierName: "Supplier",
      supplierId: "sup-1",
      shopId: "shop-1",
      stockQuantity: 30,
      soldQuantity: 8,
      skuCount: 2,
      brand: "Brand",
      categoryId: "cat-1",
      location: "Shanghai",
      shortDescription: "Short intro",
      descriptionHtml: "<p>Detail</p>",
      itemWeight: "1kg",
      itemSize: "10x20x30",
      shippingTo: "US",
      videoUrl: null,
      sellerNick: "seller",
      variants: [],
      propertyImages: [{ propertiesKey: "Color:Red", url: "https://img.example/detail-1.jpg" }],
      videos: [],
      rawResponse: { item: { title: "Sample product" } },
      cachedAt: "2026-09-01T00:00:00Z",
      fromCache: true,
      properties: [{ name: "Color", value: "Red" }],
      priceTiers: [{ minQuantity: 1, price: 12, originalPrice: 20 }],
      raw: { item: { title: "Sample product" } },
    } as OneBoundItemPreview;

    const context = buildShopifyDescriptionSourceFromOneBoundPreview(preview);
    const source = toShopifyDescriptionSourceInput(context);

    expect(context.origin).toBe("collection_task");
    expect(context.rawResponse).toEqual({ item: { title: "Sample product" } });
    expect(context.images).toHaveLength(3);
    expect(context.images[0].group).toBe("main");
    expect(context.images[1].group).toBe("main");
    expect(context.images[2].group).toBe("detail");
    expect(source.offerId).toBe("123");
    expect(source.images).toHaveLength(3);
    expect(source.properties).toEqual([{ name: "Color", value: "Red" }]);
  });
});
