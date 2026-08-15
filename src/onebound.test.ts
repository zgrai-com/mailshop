import { describe, expect, it } from "vitest";

import { parseOneBoundItemPayload, responseImageId, responseItems } from "./onebound";

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
