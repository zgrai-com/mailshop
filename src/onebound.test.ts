import { describe, expect, it } from "vitest";

import {
  fetchValidatedRemoteImage,
  importedVariantData,
  parseOneBoundItemPayload,
  responseImageId,
  responseItems,
  responseTotalResultCount,
} from "./onebound";

describe("OneBound response parsing", () => {
  it("reads an uploaded image id from the nested items.item payload", () => {
    expect(responseImageId({ items: { item: { imgid: "1737108815085208001" } } })).toBe("1737108815085208001");
  });

  it("reads image-search results from the nested items.item array", () => {
    const items = [{ num_iid: "1001" }, { num_iid: "1002" }];
    expect(responseItems({ items: { item: items } })).toEqual(items);
  });

  it("keeps compatibility with direct and data-wrapped response shapes", () => {
    expect(responseImageId({ data: { imgid: "direct-data-id" } })).toBe("direct-data-id");
    expect(responseItems({ data: { items: [{ id: "item-1" }] } })).toEqual([{ id: "item-1" }]);
  });

  it("prefers OneBound's documented real result count", () => {
    expect(responseTotalResultCount({
      items: { real_total_results: "237", total_results: "50" },
    })).toBe(237);
    expect(responseTotalResultCount({ data: { total_results: 18 } })).toBe(18);
  });

  it("validates every remote image redirect before fetching it", async () => {
    const fetcher = async () => new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/internal-image.jpg" },
    });

    await expect(fetchValidatedRemoteImage("https://cbu01.alicdn.com/source.jpg", fetcher))
      .rejects.toMatchObject({ code: "image_proxy_url_not_allowed" });
  });

  it("follows safe remote image redirects manually", async () => {
    const requested: string[] = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      requested.push(String(input));
      expect(init?.redirect).toBe("manual");
      if (requested.length === 1) {
        return new Response(null, { status: 302, headers: { location: "/final.jpg" } });
      }
      return new Response("image", { status: 200, headers: { "content-type": "image/jpeg" } });
    };

    const response = await fetchValidatedRemoteImage("https://cbu01.alicdn.com/source.jpg", fetcher);
    expect(response.ok).toBe(true);
    expect(requested).toEqual([
      "https://cbu01.alicdn.com/source.jpg",
      "https://cbu01.alicdn.com/final.jpg",
    ]);
  });

  it("maps 1688 SKU property names to Shopify product options", () => {
    const variants = [
      { externalId: "sku-red-s", sku: "RED-S", name: "Color:Red;Size:S", attributes: { propertiesName: "0:0:Color:Red;1:0:Size:S" }, price: 10, stock: 5, raw: {} },
      { externalId: "sku-blue-m", sku: "BLUE-M", name: "Color:Blue;Size:M", attributes: { propertiesName: "0:0:Color:Blue;1:0:Size:M" }, price: 12, stock: 3, raw: {} },
    ];

    expect(importedVariantData(variants)).toEqual({
      options: [
        { name: "Color", values: ["Red", "Blue"] },
        { name: "Size", values: ["S", "M"] },
      ],
      values: [["Red", "S"], ["Blue", "M"]],
    });
  });

  it("normalizes item_get details for dedicated 1688 tables", () => {
    const parsed = parseOneBoundItemPayload({
      error_code: "0000",
      request_id: "request-1",
      item: {
        num_iid: "1032031110243",
        title: "Sample 1688 dress",
        price: "69.00",
        orginal_price: "99.00",
        min_num: "2",
        unit: "件",
        num: "800",
        total_sold: "31",
        pic_url: "https://cbu01.alicdn.com/main.jpg",
        item_imgs: [{ url: "https://cbu01.alicdn.com/1.jpg" }],
        desc_img: ["https://cbu01.alicdn.com/detail.jpg"],
        props: [{ name: "面料", value: "缎面" }],
        prop_imgs: { prop_img: { properties: "0:1", url: "https://cbu01.alicdn.com/red.jpg" } },
        priceRange: [[2, "69.00"], [100, "59.00"]],
        skus: { sku: { sku_id: "sku-1", properties_name: "颜色:红色", price: "69.00", quantity: "20" } },
        seller_id: "seller-1",
        shop_id: "shop-1",
        seller_info: { nick: "seller", shop_name: "Sample supplier" },
        has_discount: "false",
      },
    }, "1032031110243");

    expect(parsed.preview).toMatchObject({
      offerId: "1032031110243",
      priceMin: 59,
      priceMax: 69,
      skuCount: 1,
      supplierName: "Sample supplier",
    });
    expect(parsed.linkInput.offer.images).toHaveLength(2);
    expect(parsed.linkInput.offer.variants[0]?.stock).toBe(20);
    expect(parsed.detail.priceTiers).toHaveLength(2);
    expect(parsed.detail.propertyImages).toHaveLength(1);
    expect(parsed.detail.descriptionImages).toHaveLength(1);
    expect(parsed.detail.main.hasDiscount).toBe(0);
    expect(parsed.detail.snapshot.response).toMatchObject({ request_id: "request-1" });
  });
});
