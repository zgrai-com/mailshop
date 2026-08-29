import type { CollectionTaskBatchImage, CollectionTaskBatchItem, SearchTaskOptions } from "./types";

export type BatchImportRow = {
  line: number;
  item: CollectionTaskBatchItem | null;
  errors: string[];
  title: string;
  productUrl: string;
};

export function normalizeBatchProductUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) url.port = "";
    url.hash = "";
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, "");
    return url.toString();
  } catch {
    return null;
  }
}

export const batchImportCsvHeaders = [
  "client_id",
  "name",
  "product_title",
  "description",
  "sku",
  "source_site",
  "product_url",
  "source_image_url",
  "images",
];

export const batchImportCsvTemplate = [
  batchImportCsvHeaders.join(","),
  "sample-dress,Sample dress,Sample dress,Concise product description,SKU-001,example.com,https://example.com/products/sample-dress,https://images.example.com/sample.jpg,https://images.example.com/sample.jpg|https://images.example.com/sample-2.jpg",
].join("\n");

export const batchImportJsonTemplate = JSON.stringify({
  items: [{
    clientId: "sample-dress",
    name: "Sample dress",
    productTitle: "Sample dress",
    description: "Concise product description",
    sku: "SKU-001",
    sourceSite: "example.com",
    productUrl: "https://example.com/products/sample-dress",
    images: [
      { id: "image-1", url: "https://images.example.com/sample.jpg", alt: "Sample dress", source: "manual-import" },
      { id: "image-2", url: "https://images.example.com/sample-2.jpg", alt: "Sample dress", source: "manual-import" },
    ],
  }],
}, null, 2);

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return "";
}

function isImageUrl(value: string): boolean {
  if (/^data:image\/(?:avif|gif|jpeg|png|webp);base64,/iu.test(value)) return true;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isProductUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function boundedInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(20_000, Math.trunc(value)));
}

function imageObjects(value: unknown, sourceImageUrl: string): CollectionTaskBatchImage[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split("|").map((part) => part.trim()).filter(Boolean)
      : [];
  const seen = new Set<string>();
  const images: CollectionTaskBatchImage[] = [];
  for (const [index, candidate] of values.entries()) {
    const object = candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? candidate as Record<string, unknown>
      : {};
    const url = typeof candidate === "string" ? candidate.trim() : stringValue(object.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    images.push({
      id: (stringValue(object.id) || `image-${index + 1}`).slice(0, 160),
      url,
      width: boundedInteger(object.width),
      height: boundedInteger(object.height),
      alt: stringValue(object.alt ?? object.altText).slice(0, 500),
      title: stringValue(object.title).slice(0, 500),
      source: (stringValue(object.source) || "manual-import").slice(0, 80),
    });
  }
  if (!images.length && sourceImageUrl && !seen.has(sourceImageUrl)) {
    images.push({ id: "image-1", url: sourceImageUrl, width: 0, height: 0, alt: "", title: "", source: "manual-import" });
  }
  return images;
}

function normalizedOptions(value: unknown): Partial<SearchTaskOptions> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const options: Partial<SearchTaskOptions> = {};
  if (["_sale", "sale", "bid2", "_bid2"].includes(String(record.sort))) options.sort = record.sort as SearchTaskOptions["sort"];
  if (typeof record.limit === "number" && Number.isInteger(record.limit) && record.limit >= 10 && record.limit <= 50) options.limit = record.limit;
  if (typeof record.page === "number" && Number.isInteger(record.page) && record.page >= 1 && record.page <= 1_000) options.page = record.page;
  if (["yes", "no"].includes(String(record.cache))) options.cache = record.cache as SearchTaskOptions["cache"];
  if (["cn", "en", "ru"].includes(String(record.lang))) options.lang = record.lang as SearchTaskOptions["lang"];
  if (typeof record.version === "string" && record.version.length <= 64) options.version = record.version;
  return Object.keys(options).length ? options : undefined;
}

export function mapBatchImportRecord(raw: unknown, line: number): BatchImportRow {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { line, item: null, errors: ["这一行不是商品对象"], title: "", productUrl: "" };
  }
  const record = raw as Record<string, unknown>;
  const productTitle = firstString(record, ["productTitle", "product_title", "title", "name"]);
  const name = firstString(record, ["name", "productTitle", "product_title", "title"]) || productTitle;
  const productUrl = firstString(record, ["productUrl", "product_url", "sourcePage", "source_page"]);
  const sourceImageUrl = firstString(record, ["sourceImageUrl", "source_image_url"]);
  const images = imageObjects(record.images ?? record.imageUrls ?? record.image_urls, sourceImageUrl);
  const clientId = firstString(record, ["clientId", "client_id"]);
  const description = firstString(record, ["description"]);
  const sku = firstString(record, ["sku"]);
  const explicitSourceSite = firstString(record, ["sourceSite", "source_site"]);
  const errors: string[] = [];

  if (!productTitle) errors.push("缺少商品标题");
  else if (productTitle.length > 1_000) errors.push("商品标题不能超过 1000 个字符");
  if (name.length > 120) errors.push("任务名称不能超过 120 个字符");
  if (clientId.length > 160) errors.push("client_id 不能超过 160 个字符");
  if (description.length > 20_000) errors.push("商品描述不能超过 20000 个字符");
  if (sku.length > 500) errors.push("SKU 不能超过 500 个字符");
  if (explicitSourceSite.length > 255) errors.push("来源网站不能超过 255 个字符");
  if (!productUrl) errors.push("缺少商品 URL");
  else if (!isProductUrl(productUrl)) errors.push("商品 URL 必须是 HTTP(S) 地址");
  else if (productUrl.length > 2_048) errors.push("商品 URL 不能超过 2048 个字符");
  if (sourceImageUrl && (!isImageUrl(sourceImageUrl) || sourceImageUrl.length > 2_000_000)) {
    errors.push(`主图地址无效：${sourceImageUrl.slice(0, 160)}`);
  }
  if (!images.length) errors.push("至少需要一张商品图片");
  if (images.length > 200) errors.push("每个商品最多导入 200 张图片");
  const invalidImage = images.find((image) => !isImageUrl(image.url) || image.url.length > 2_000_000);
  if (invalidImage) errors.push(`图片地址无效：${invalidImage.url.slice(0, 160)}`);

  const sourceSite = explicitSourceSite || (isProductUrl(productUrl) ? new URL(productUrl).hostname : "");
  const item: CollectionTaskBatchItem = {
    clientId: clientId || undefined,
    name: name || undefined,
    productTitle: productTitle || undefined,
    description: description || null,
    sku: sku || null,
    sourceSite: sourceSite || null,
    productUrl,
    sourceImageUrl: sourceImageUrl || null,
    images,
    options: normalizedOptions(record.options),
  };
  return { line, item: errors.length ? null : item, errors, title: productTitle, productUrl };
}

export function parseBatchImportCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/u, "");
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("CSV 文件中存在未闭合的双引号");
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  const headers = (rows.shift() ?? []).map((header) => header.trim().toLowerCase().replace(/[\s-]+/gu, "_"));
  if (!headers.length || headers.every((header) => !header)) throw new Error("CSV 文件缺少表头");
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

export function parseBatchImportText(text: string, format: "csv" | "json"): BatchImportRow[] {
  const rows = format === "json"
    ? (() => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text.replace(/^\uFEFF/u, ""));
        } catch {
          throw new Error("JSON 文件格式无效");
        }
        const records = Array.isArray(parsed)
          ? parsed
          : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).items)
            ? (parsed as Record<string, unknown>).items as unknown[]
            : null;
        if (!records) throw new Error("JSON 文件需要是数组，或包含 items 数组");
        return records.map((record, index) => mapBatchImportRecord(record, index + 1));
      })()
    : parseBatchImportCsv(text).map((record, index) => mapBatchImportRecord(record, index + 2));
  const firstLineByUrl = new Map<string, number>();
  return rows.map((row) => {
    if (!row.item) return row;
    const key = normalizeBatchProductUrl(row.productUrl);
    if (!key) return row;
    const firstLine = firstLineByUrl.get(key);
    if (firstLine !== undefined) {
      return {
        ...row,
        item: null,
        errors: [...row.errors, `商品 URL 与第 ${firstLine} 行重复`],
      };
    }
    firstLineByUrl.set(key, row.line);
    return row;
  });
}

export async function parseBatchImportFile(file: Pick<File, "name" | "type" | "text">): Promise<BatchImportRow[]> {
  const format = file.name.toLowerCase().endsWith(".json") || file.type.toLowerCase().includes("json") ? "json" : "csv";
  return parseBatchImportText(await file.text(), format);
}
