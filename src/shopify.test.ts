import { describe, expect, it } from "vitest";

import { buildProductInput, normalizeShopDomain } from "./shopify";

describe("Shopify product publishing", () => {
  it("normalizes a canonical myshopify domain", () => {
    expect(normalizeShopDomain("https://Demo-Store.myshopify.com/")).toBe("demo-store.myshopify.com");
    expect(() => normalizeShopDomain("shop.example.com")).toThrow("xxx.myshopify.com");
  });

  it("builds a draft product with options and merchandising fields", () => {
    expect(buildProductInput({
      title: "Satin evening dress",
      descriptionHtml: "<p>Silk touch fabric</p>",
      vendor: "Mailshop",
      productType: "Dresses",
      handle: "satin-evening-dress",
      tags: ["dress", "evening"],
      options: [{ name: "Color", values: ["Red", "Black"] }],
      priceMin: 79,
      variants: [],
      images: [],
    })).toEqual({
      title: "Satin evening dress",
      status: "DRAFT",
      descriptionHtml: "<p>Silk touch fabric</p>",
      vendor: "Mailshop",
      productType: "Dresses",
      handle: "satin-evening-dress",
      tags: ["dress", "evening"],
      productOptions: [{ name: "Color", values: [{ name: "Red" }, { name: "Black" }] }],
    });
  });
});
