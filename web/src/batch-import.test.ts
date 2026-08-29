import { describe, expect, it } from "vitest";

import {
  batchImportCsvTemplate,
  batchImportJsonTemplate,
  mapBatchImportRecord,
  parseBatchImportFile,
  parseBatchImportText,
} from "./batch-import";

describe("batch import parsing", () => {
  it("parses quoted CSV values, snake_case headers, and deduplicates images", () => {
    const csv = [
      `\uFEFFclient_id,name,product_title,description,sku,source_site,product_url,source_image_url,images`,
      `dress-1,"Dress, special","Elegant gown","line one`,
      `line two",SKU-1,example.com,https://example.com/products/dress,,https://img.example.com/1.jpg|https://img.example.com/1.jpg|https://img.example.com/2.jpg`,
    ].join("\n");

    const [row] = parseBatchImportText(csv, "csv");

    expect(row.line).toBe(2);
    expect(row.errors).toEqual([]);
    expect(row.item).toMatchObject({
      clientId: "dress-1",
      name: "Dress, special",
      productTitle: "Elegant gown",
      description: "line one\nline two",
      sourceSite: "example.com",
      productUrl: "https://example.com/products/dress",
    });
    expect(row.item?.images.map((image) => image.url)).toEqual([
      "https://img.example.com/1.jpg",
      "https://img.example.com/2.jpg",
    ]);
  });

  it("accepts JSON arrays and an items envelope with camelCase or aliases", () => {
    const rows = parseBatchImportText(JSON.stringify({ items: [{
      title: "Alias title",
      source_page: "https://shop.example/products/alias",
      source_image_url: "https://img.example/alias.jpg",
    }] }), "json");

    expect(rows).toHaveLength(1);
    expect(rows[0].line).toBe(1);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].item).toMatchObject({
      productTitle: "Alias title",
      name: "Alias title",
      sourceSite: "shop.example",
      productUrl: "https://shop.example/products/alias",
    });
    expect(rows[0].item?.images[0]).toMatchObject({
      id: "image-1",
      url: "https://img.example/alias.jpg",
    });
  });

  it("reports row-level validation failures without throwing", () => {
    const row = mapBatchImportRecord({
      product_title: "",
      product_url: "ftp://example.com/product",
      images: ["not-a-url"],
      source_image_url: "also-not-a-url",
    }, 7);

    expect(row.line).toBe(7);
    expect(row.item).toBeNull();
    expect(row.errors).toEqual(expect.arrayContaining([
      "缺少商品标题",
      "商品 URL 必须是 HTTP(S) 地址",
      "主图地址无效：also-not-a-url",
      "图片地址无效：not-a-url",
    ]));
  });

  it("enforces field and image limits before submission", () => {
    const row = mapBatchImportRecord({
      productTitle: "x".repeat(1_001),
      name: "n".repeat(121),
      clientId: "c".repeat(161),
      description: "d".repeat(20_001),
      sku: "s".repeat(501),
      sourceSite: "h".repeat(256),
      productUrl: "https://example.com/product",
      images: Array.from({ length: 201 }, (_, index) => `https://img.example/${index}.jpg`),
    }, 3);

    expect(row.item).toBeNull();
    expect(row.errors).toEqual(expect.arrayContaining([
      "商品标题不能超过 1000 个字符",
      "任务名称不能超过 120 个字符",
      "client_id 不能超过 160 个字符",
      "商品描述不能超过 20000 个字符",
      "SKU 不能超过 500 个字符",
      "来源网站不能超过 255 个字符",
      "每个商品最多导入 200 张图片",
    ]));
  });

  it("rejects malformed files and selects JSON by filename or MIME type", async () => {
    expect(() => parseBatchImportText("", "csv")).toThrow("CSV 文件缺少表头");
    expect(() => parseBatchImportText('client_id,"unterminated', "csv")).toThrow("未闭合");
    expect(() => parseBatchImportText("{oops", "json")).toThrow("JSON 文件格式无效");

    const rows = await parseBatchImportFile({
      name: "products.data",
      type: "application/json",
      text: async () => batchImportJsonTemplate,
    });
    expect(rows).toHaveLength(1);

    const csvRows = await parseBatchImportFile({
      name: "products.csv",
      type: "text/csv",
      text: async () => batchImportCsvTemplate,
    });
    expect(csvRows[0].errors).toEqual([]);
  });

  it("flags duplicate product URLs using canonical URL matching", () => {
    const rows = parseBatchImportText(JSON.stringify({ items: [
      { title: "First", productUrl: "https://EXAMPLE.com/products/dress/#details", images: ["https://img.example/1.jpg"] },
      { title: "Second", productUrl: "https://example.com/products/dress", images: ["https://img.example/2.jpg"] },
    ] }), "json");

    expect(rows[0].errors).toEqual([]);
    expect(rows[1].item).toBeNull();
    expect(rows[1].errors).toContain("商品 URL 与第 1 行重复");
  });
});
