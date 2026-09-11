import { describe, expect, it } from "vitest";

import {
  buildShopifyDescriptionPrompt,
  buildShopifyTranslationPrompt,
  extractGeneratedImage,
  parseShopifyTranslationResults,
  resolveAiCredentials,
  SHOPIFY_DESCRIPTION_PROMPT_VERSION,
  SHOPIFY_TRANSLATION_PROMPT_VERSION,
  type UnifiedAiSettings,
} from "./ai";

const unifiedSettings: UnifiedAiSettings = {
  configured: true,
  conversation: { configured: true, baseUrl: "https://conversation.example/v1", apiKey: "conversation-key", apiKeyHint: "conv...-key" },
  imageGeneration: { configured: true, baseUrl: "https://images.example/v1", apiKey: "image-key", apiKeyHint: "imag...-key" },
  models: {
    imageFilterModelId: "image-filter-model",
    imageAnalysisModelId: "image-analysis-model",
    chatModelId: "chat-model",
    translationModelId: "translation-model",
    imageGenerationModelId: "image-generation-model",
  },
  updatedAt: null,
};

describe("unified AI task routing", () => {
  it.each([
    ["image_filter", "image-filter-model"],
    ["image_analysis", "image-analysis-model"],
    ["chat", "chat-model"],
    ["translation", "translation-model"],
  ] as const)("routes %s through the shared conversation service", (task, modelId) => {
    expect(resolveAiCredentials(unifiedSettings, task)).toEqual({
      baseUrl: "https://conversation.example/v1",
      apiKey: "conversation-key",
      modelId,
    });
  });

  it("routes image generation through its separate service", () => {
    expect(resolveAiCredentials(unifiedSettings, "image_generation")).toEqual({
      baseUrl: "https://images.example/v1",
      apiKey: "image-key",
      modelId: "image-generation-model",
    });
  });

  it("rejects a task whose selected service or model is incomplete", () => {
    expect(resolveAiCredentials({
      ...unifiedSettings,
      models: { ...unifiedSettings.models, translationModelId: null },
    }, "translation")).toBeNull();
    expect(resolveAiCredentials({
      ...unifiedSettings,
      imageGeneration: { ...unifiedSettings.imageGeneration, configured: false },
    }, "image_generation")).toBeNull();
  });
});

describe("Shopify translation prompt", () => {
  it("combines the user prompt with the fixed field mapping and HTML rules", () => {
    const prompt = buildShopifyTranslationPrompt({
      storeId: "5a8c0989-67a9-4a51-bf16-591a2d9d408d",
      productId: "gid://shopify/Product/1",
      locale: "fr",
      targetLanguage: "French",
      marketId: "gid://shopify/Market/2",
      prompt: "优先使用简洁、自然的法语电商表达。",
      style: "简洁高端",
      glossary: "AirFlex 保持英文",
      fields: [
        { resourceId: "gid://shopify/Product/1", resourceType: "Product", resourceLabel: "商品", sourceLocale: "en", key: "title", sourceValue: "AirFlex Dress" },
        { resourceId: "gid://shopify/ProductVariant/2", resourceType: "ProductVariant", resourceLabel: "Black / M", key: "title", sourceValue: "Black / M" },
      ],
    });

    expect(SHOPIFY_TRANSLATION_PROMPT_VERSION).toBe("shopify-product-translation-v7");
    expect(prompt).toContain('"resourceId":"gid://shopify/Product/1"');
    expect(prompt).toContain("body_html/descriptionHtml");
    expect(prompt).toContain("普通文本应翻译");
    expect(prompt).toContain("target language: French");
    expect(prompt).toContain('"translations"');
    expect(prompt).toContain('"title":"翻译后的 title"');
    expect(prompt).toContain("AirFlex 保持英文");
    expect(prompt).toContain("优先使用简洁、自然的法语电商表达。");
  });

  it("translates option names and option values", () => {
    const prompt = buildShopifyTranslationPrompt({
      storeId: "5a8c0989-67a9-4a51-bf16-591a2d9d408d",
      productId: "gid://shopify/Product/1",
      locale: "fr",
      fields: [
        { resourceId: "gid://shopify/ProductOption/1", resourceType: "ProductOption", resourceLabel: "Color", key: "name", sourceValue: "Color" },
        { resourceId: "gid://shopify/ProductOptionValue/2", resourceType: "ProductOptionValue", resourceLabel: "Red", key: "name", sourceValue: "Red" },
      ],
      prompt: "",
      style: "自然、清晰、符合目标市场电商习惯",
      glossary: "",
    });

    expect(prompt).toContain("ProductOption 资源翻译属性名称");
    expect(prompt).toContain("ProductOptionValue 资源只翻译属性值");
  });

  it("allows primary-language rewrites for option names and values", () => {
    const prompt = buildShopifyTranslationPrompt({
      storeId: "5a8c0989-67a9-4a51-bf16-591a2d9d408d",
      productId: "gid://shopify/Product/1",
      locale: "en",
      sourceLocale: "en",
      rewritePrimary: true,
      fields: [
        { resourceId: "gid://shopify/ProductOption/2", resourceType: "ProductOption", resourceLabel: "颜色", key: "name", sourceValue: "颜色" },
        { resourceId: "gid://shopify/ProductOptionValue/3", resourceType: "ProductOptionValue", resourceLabel: "金色", key: "name", sourceValue: "金色" },
      ],
      prompt: "",
      style: "自然、清晰、符合目标市场电商习惯",
      glossary: "",
    });

    expect(prompt).toContain("primary-language rewrite");
    expect(prompt).toContain("rewrite the option name");
    expect(prompt).toContain("金色 to Gold");
  });

  it("accepts direct field keys, numeric ids, and legacy key-based AI output", () => {
    expect(parseShopifyTranslationResults({ translations: [{
      resourceId: "gid://shopify/Product/1",
      title: "Titre traduit",
      handle: "robe-airflex",
      body_html: "<p>Texte traduit</p>",
    }]})).toEqual([
      { resourceId: "gid://shopify/Product/1", key: "title", value: "Titre traduit" },
      { resourceId: "gid://shopify/Product/1", key: "handle", value: "robe-airflex" },
      { resourceId: "gid://shopify/Product/1", key: "body_html", value: "<p>Texte traduit</p>" },
    ]);
    expect(parseShopifyTranslationResults([{ id: 0, value: "Titre traduit" }])).toEqual([{ id: "0", value: "Titre traduit" }]);
    expect(parseShopifyTranslationResults([{ key: "title", value: "Titre traduit" }])).toEqual([{ key: "title", value: "Titre traduit" }]);
  });

  it("extracts image URLs wrapped in AIRouter markdown", () => {
    expect(extractGeneratedImage({ output_text: "![image_1](<https://img.example/result.png>)" })).toBe("https://img.example/result.png");
  });

  it("skips an echoed source image URL when extracting the generated result", () => {
    expect(extractGeneratedImage({ output_text: "source https://img.example/source.jpg result ![image](<https://img.example/result.png>)" }, ["https://img.example/source.jpg"])).toBe("https://img.example/result.png");
  });

  it("extracts standard images API data responses", () => {
    expect(extractGeneratedImage({ data: [{ b64_json: "aGVsbG8=" }] })).toBe("data:image/png;base64,aGVsbG8=");
    expect(extractGeneratedImage({ data: [{ url: "https://img.example/result.png" }] })).toBe("https://img.example/result.png");
  });

});

describe("Shopify description prompt", () => {
  it("does not append source JSON automatically", () => {
    const prompt = buildShopifyDescriptionPrompt({
      offerId: "123",
      title: "Sample product",
      supplierName: "Supplier",
      brand: "Brand",
      category: "Category",
      shortDescription: "Short intro",
      descriptionHtml: "<p>Detail</p>",
      properties: [{ name: "Color", value: "Red" }],
      variants: [{ sku: "SKU-1" }],
      priceTiers: [{ minQuantity: 1, price: 12 }],
      raw: { item: { title: "Sample product" } },
      images: [{ id: "main-1", url: "https://img.example/main.jpg", group: "main" }],
    }, "Please write a clean US-English Shopify description.", "Japanese");

    expect(SHOPIFY_DESCRIPTION_PROMPT_VERSION).toBe("shopify-product-description-v1");
    expect(prompt).toContain("Please write a clean US-English Shopify description.");
    expect(prompt).toContain("Write all visible product-description text in Japanese.");
    expect(prompt).not.toContain("1688 结构化商品 JSON");
    expect(prompt).not.toContain('"title":"Sample product"');
  });
});
