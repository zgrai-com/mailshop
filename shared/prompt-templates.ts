export type PromptTemplateValue = string | number | boolean | null | undefined | Record<string, unknown> | unknown[];

export type PromptVariableContext = "description" | "translation" | "image";

export type PromptVariableDefinition = {
  token: string;
  label: string;
  description: string;
  contexts: PromptVariableContext[];
};

export const PROMPT_VARIABLE_GROUPS: Array<{
  id: PromptVariableContext;
  title: string;
  description: string;
  variables: PromptVariableDefinition[];
}> = [
  {
    id: "description",
    title: "商品描述",
    description: "用于生成 Shopify 商品描述 HTML 的提示词。",
    variables: [
      { token: "Target Language", label: "Target Language", description: "当前描述输出语言。", contexts: ["description"] },
      { token: "Product Title", label: "Product Title", description: "当前 Shopify 商品标题。", contexts: ["description"] },
      { token: "Product Vendor", label: "Product Vendor", description: "当前 Shopify 商品供应商。", contexts: ["description"] },
      { token: "Product Type", label: "Product Type", description: "当前 Shopify 商品类型。", contexts: ["description"] },
      { token: "Product Tags", label: "Product Tags", description: "当前 Shopify 商品标签。", contexts: ["description"] },
      { token: "Product Description HTML", label: "Product Description HTML", description: "当前 Shopify 商品描述 HTML。", contexts: ["description"] },
      { token: "Source Offer Id", label: "Source Offer Id", description: "1688 商品 offerId。", contexts: ["description"] },
      { token: "Source Title", label: "Source Title", description: "1688 商品标题。", contexts: ["description"] },
      { token: "Source Supplier Name", label: "Source Supplier Name", description: "1688 商品供应商名称。", contexts: ["description"] },
      { token: "Source Brand", label: "Source Brand", description: "1688 商品品牌。", contexts: ["description"] },
      { token: "Source Category", label: "Source Category", description: "1688 商品类目。", contexts: ["description"] },
      { token: "Source Short Description", label: "Source Short Description", description: "1688 商品短描述。", contexts: ["description"] },
      { token: "1688json", label: "1688json", description: "用于生成描述的 1688 结构化 JSON。", contexts: ["description"] },
      { token: "1688 Properties JSON", label: "1688 Properties JSON", description: "1688 属性列表 JSON。", contexts: ["description"] },
      { token: "1688 Variants JSON", label: "1688 Variants JSON", description: "1688 SKU / 规格 JSON。", contexts: ["description"] },
      { token: "1688 Price Tiers JSON", label: "1688 Price Tiers JSON", description: "1688 价格阶梯 JSON。", contexts: ["description"] },
      { token: "Selected Image Count", label: "Selected Image Count", description: "当前选中的商品图片数量。", contexts: ["description"] },
      { token: "Selected Images JSON", label: "Selected Images JSON", description: "当前选中的商品图片 JSON。", contexts: ["description"] },
    ],
  },
  {
    id: "translation",
    title: "多语言翻译",
    description: "用于生成 Shopify 多语言翻译草稿的提示词。",
    variables: [
      { token: "Target Language", label: "Target Language", description: "当前翻译输出语言。", contexts: ["translation"] },
      { token: "Target Locale", label: "Target Locale", description: "Shopify 目标语言代码。", contexts: ["translation"] },
      { token: "Source Locale", label: "Source Locale", description: "Shopify 源语言代码。", contexts: ["translation"] },
      { token: "Market Id", label: "Market Id", description: "当前 Shopify Market ID。", contexts: ["translation"] },
      { token: "Market Name", label: "Market Name", description: "当前 Shopify Market 名称。", contexts: ["translation"] },
      { token: "Product Title", label: "Product Title", description: "当前 Shopify 商品标题。", contexts: ["translation"] },
      { token: "Product Vendor", label: "Product Vendor", description: "当前 Shopify 商品供应商。", contexts: ["translation"] },
      { token: "Product Type", label: "Product Type", description: "当前 Shopify 商品类型。", contexts: ["translation"] },
      { token: "Product Tags", label: "Product Tags", description: "当前 Shopify 商品标签。", contexts: ["translation"] },
      { token: "Product Description HTML", label: "Product Description HTML", description: "当前 Shopify 商品描述 HTML。", contexts: ["translation"] },
      { token: "Field Count", label: "Field Count", description: "本次要翻译的字段数量。", contexts: ["translation"] },
      { token: "Fields JSON", label: "Fields JSON", description: "本次翻译字段的 JSON 列表。", contexts: ["translation"] },
      { token: "Translation Style", label: "Translation Style", description: "当前翻译风格。", contexts: ["translation"] },
      { token: "Glossary", label: "Glossary", description: "当前术语表内容。", contexts: ["translation"] },
    ],
  },
  {
    id: "image",
    title: "图片处理",
    description: "用于 AI 处理商品图片的提示词。",
    variables: [
      { token: "Target Language", label: "Target Language", description: "当前图片任务输出语言。", contexts: ["image"] },
      { token: "Target Locale", label: "Target Locale", description: "当前图片任务语言代码。", contexts: ["image"] },
      { token: "Product Title", label: "Product Title", description: "当前 Shopify 商品标题。", contexts: ["image"] },
      { token: "Product Vendor", label: "Product Vendor", description: "当前 Shopify 商品供应商。", contexts: ["image"] },
      { token: "Product Type", label: "Product Type", description: "当前 Shopify 商品类型。", contexts: ["image"] },
      { token: "Operation", label: "Operation", description: "当前图片任务类型。", contexts: ["image"] },
      { token: "Image Analysis", label: "Image Analysis", description: "AI 生成的图片风格分析。", contexts: ["image"] },
      { token: "Selected Image Count", label: "Selected Image Count", description: "当前选中的图片数量。", contexts: ["image"] },
      { token: "Selected Image IDs", label: "Selected Image IDs", description: "当前选中的图片 ID 列表。", contexts: ["image"] },
      { token: "Selected Images JSON", label: "Selected Images JSON", description: "当前选中的图片 JSON。", contexts: ["image"] },
    ],
  },
];

function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/[^a-z0-9]/giu, "");
}

function formatValue(value: PromptTemplateValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

export function applyPromptTemplate(template: string, values: Record<string, PromptTemplateValue>): string {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(values)) {
    normalized.set(normalizeToken(key), formatValue(value));
  }
  return template.replace(/\{([^{}]+)\}/gu, (match, token) => normalized.get(normalizeToken(token)) ?? match);
}
