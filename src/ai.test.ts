import { describe, expect, it } from "vitest";

import { buildShopifyTranslationPrompt, preservesShopifyProtectedTokens, SHOPIFY_TRANSLATION_PROMPT_VERSION } from "./ai";

describe("Shopify translation prompt", () => {
  it("uses stable field ids and includes the localization quality rubric", () => {
    const prompt = buildShopifyTranslationPrompt({
      storeId: "5a8c0989-67a9-4a51-bf16-591a2d9d408d",
      productId: "gid://shopify/Product/1",
      locale: "fr",
      marketId: "gid://shopify/Market/2",
      style: "简洁高端",
      glossary: "AirFlex 保持英文",
      fields: [
        { resourceId: "gid://shopify/Product/1", resourceType: "Product", resourceLabel: "商品", key: "title", sourceValue: "AirFlex Dress" },
        { resourceId: "gid://shopify/ProductVariant/2", resourceType: "ProductVariant", resourceLabel: "Black / M", key: "title", sourceValue: "Black / M" },
      ],
    });

    expect(SHOPIFY_TRANSLATION_PROMPT_VERSION).toBe("shopify-product-translation-v2");
    expect(prompt).toContain("事实忠实度、母语自然度、电商表达清晰度");
    expect(prompt).toContain('"id":"0"');
    expect(prompt).toContain('"id":"1"');
    expect(prompt).toContain("AirFlex 保持英文");
  });

  it("rejects translations that alter protected commerce tokens", () => {
    const source = '<p data-sku="SKU-RED-01">Save 20% at https://example.com/{{ product.id }}</p>';
    expect(preservesShopifyProtectedTokens(source, '<p data-sku="SKU-RED-01">Économisez 20% sur https://example.com/{{ product.id }}</p>')).toBe(true);
    expect(preservesShopifyProtectedTokens(source, '<p data-sku="SKU-RED-02">Économisez 20%</p>')).toBe(false);
  });
});
