import { describe, expect, it } from "vitest";

import { extractFehauteResources, extractNextData, mapFehauteProduct } from "./import-fehaute.mjs";

describe("Fehaute importer", () => {
  it("extracts the product resources from Next data", () => {
    const nextData = extractNextData(
      '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"fallback":{"product /simple/product/:id #with:":{"id":1},"/simple/product/:id/content":{"content":{"description":"Hi"}}}}}}</script>',
    );
    expect(extractFehauteResources(nextData)).toMatchObject({
      product: { id: 1 },
      content: { content: { description: "Hi" } },
    });
  });

  it("maps normalized and raw product fields", () => {
    const product = mapFehauteProduct(
      "https://fehaute.com/products/sample-1",
      {
        id: 1,
        name: "Sample dress",
        spu: "SPU-1",
        price: { value: "179", code: "USD" },
        categories: [{ name: "Dresses" }],
        options: [{ name: "Color", value_name: "Blue" }, { name: "Size", value_name: "US4" }],
        specification: [{ name: "Material", value_name: "Satin" }],
        custom_field: [{ field: "Fabric", value: "Polyester100%" }],
        skus: [{ id: 10, sku: "SKU-10", grams: 700, inventory: 9, price: { value: "179" }, options: [{ value_name: "Blue" }, { value_name: "US4" }] }],
        images: [{ id: 20, image: "catalog/sample.jpg", width: 0, height: 0 }],
      },
      { content: { description: "<p>Sample</p>" } },
    );

    expect(product).toMatchObject({
      externalId: "1",
      spu: "SPU-1",
      productType: "Dresses",
      priceMin: 179,
      descriptionHtml: "<p>Sample</p>",
    });
    expect(product.variants[0]).toMatchObject({ sku: "SKU-10", grams: 700, option1: "Blue" });
    expect(product.images[0]?.url).toBe("https://fehaute.com/image/catalog/sample.jpg");
    expect(product.images[0]).toMatchObject({ width: null, height: null });
    expect(product.attributes.specifications).toHaveLength(1);
  });
});
