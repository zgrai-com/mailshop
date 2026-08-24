import { describe, expect, it } from "vitest";

import {
  buildShopifyTranslationPrompt,
  extractGeneratedImage,
  parseShopifyTranslationResults,
  resolveAiCredentials,
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
      marketId: "gid://shopify/Market/2",
      prompt: "优先使用简洁、自然的法语电商表达。",
      style: "简洁高端",
      glossary: "AirFlex 保持英文",
      fields: [
        { resourceId: "gid://shopify/Product/1", resourceType: "Product", resourceLabel: "商品", sourceLocale: "en", key: "title", sourceValue: "AirFlex Dress" },
        { resourceId: "gid://shopify/ProductVariant/2", resourceType: "ProductVariant", resourceLabel: "Black / M", key: "title", sourceValue: "Black / M" },
      ],
    });

    expect(SHOPIFY_TRANSLATION_PROMPT_VERSION).toBe("shopify-product-translation-v6");
    expect(prompt).toContain('"resourceId":"gid://shopify/Product/1"');
    expect(prompt).toContain("body_html/descriptionHtml");
    expect(prompt).toContain("普通文本应翻译");
    expect(prompt).toContain('"translations"');
    expect(prompt).toContain('"title":"翻译后的 title"');
    expect(prompt).toContain("AirFlex 保持英文");
    expect(prompt).toContain("优先使用简洁、自然的法语电商表达。");
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

});
