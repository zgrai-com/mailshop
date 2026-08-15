const DEFAULT_API_BASE = "https://mailshop-product-admin.butcherblow.workers.dev";
const ALLOWED_HOSTS = new Set(["fehaute.com", "www.fehaute.com"]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalPositiveNumber(value) {
  const number = optionalNumber(value);
  return number !== null && number > 0 ? number : null;
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
}

function normalizeProductUrl(input) {
  const url = new URL(input);
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase()) || !url.pathname.startsWith("/products/")) {
    throw new Error(`Unsupported Fehaute product URL: ${input}`);
  }
  url.protocol = "https:";
  url.hash = "";
  url.search = "";
  return url;
}

function assetUrl(value) {
  if (!value) return null;
  if (/^https?:\/\//iu.test(value)) return value;
  const path = String(value).replace(/^\/+/, "");
  return `https://fehaute.com/${path.startsWith("image/") ? path : `image/${path}`}`;
}

function contentTypeFor(value) {
  const pathname = new URL(value).pathname.toLowerCase();
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".avif")) return "image/avif";
  if (pathname.endsWith(".mp4")) return "video/mp4";
  return "image/jpeg";
}

export function extractNextData(html) {
  const match = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/iu);
  if (!match?.[1]) throw new Error("Fehaute page does not contain __NEXT_DATA__");
  return JSON.parse(match[1]);
}

export function extractFehauteResources(nextData) {
  const fallback = nextData?.props?.pageProps?.fallback;
  if (!fallback || typeof fallback !== "object") throw new Error("Fehaute fallback data is missing");

  const productEntry = Object.entries(fallback).find(
    ([key]) => key.includes("/simple/product/:id") && key.includes("#with:"),
  );
  const contentEntry = Object.entries(fallback).find(([key]) => key.includes("/simple/product/:id/content"));
  if (!productEntry?.[1] || typeof productEntry[1] !== "object") {
    throw new Error("Fehaute product resource is missing");
  }
  return { product: productEntry[1], content: contentEntry?.[1] ?? {} };
}

function normalizedOptions(options) {
  const grouped = new Map();
  for (const option of asArray(options)) {
    const name = String(option?.name ?? option?.key ?? "").trim();
    const value = String(option?.value_name ?? option?.option_value ?? "").trim();
    if (!name || !value) continue;
    const values = grouped.get(name) ?? [];
    if (!values.includes(value)) values.push(value);
    grouped.set(name, values);
  }
  return [...grouped.entries()].map(([name, values]) => ({ name, values }));
}

function mapVariant(sku) {
  const optionValues = asArray(sku.options).map((option) =>
    String(option?.value_name ?? option?.option_value ?? "").trim(),
  );
  const price = optionalNumber(sku?.sale?.price?.value ?? sku?.price?.value ?? sku?.special_price_value);
  const compareAtPrice = optionalNumber(sku?.compare_at_price?.value ?? sku?.origin_price_value);
  const imageUrl = assetUrl(sku.image);
  const grams = optionalNumber(sku.grams);

  return {
    externalId: String(sku.id ?? sku.feed_id ?? sku.sku),
    sku: sku.sku ? String(sku.sku) : null,
    title: optionValues.filter(Boolean).join(" / ") || null,
    option1: optionValues[0] || null,
    option2: optionValues[1] || null,
    option3: optionValues[2] || null,
    price,
    compareAtPrice: compareAtPrice && compareAtPrice > 0 ? compareAtPrice : null,
    inventoryQuantity: optionalNumber(sku.inventory),
    weight: grams,
    weightUnit: grams === null ? null : "g",
    imageUrl,
    grams,
    remainingInventory: optionalNumber(sku.remaining_inventory),
    options: asArray(sku.options),
    raw: sku,
  };
}

function mapImage(image, productName, index) {
  const url = assetUrl(image?.image ?? image?.thumb ?? image);
  if (!url) return null;
  return {
    externalId: String(image?.id ?? `image-${index + 1}`),
    url,
    altText: productName,
    position: optionalNumber(image?.sort) ?? index,
    width: optionalPositiveNumber(image?.width),
    height: optionalPositiveNumber(image?.height),
    contentType: contentTypeFor(url),
  };
}

export function mapFehauteProduct(sourceUrl, product, contentResource = {}) {
  const skus = asArray(product.skus);
  const variants = skus.map(mapVariant);
  const prices = variants.map((variant) => variant.price).filter((value) => value !== null);
  const productPrice = optionalNumber(product?.price?.value);
  const description = contentResource?.content?.description ?? "";
  const categories = [...asArray(product.categories), ...asArray(product.categories_company)];
  const categoryNames = asArray(product.categories).map((category) => category?.name).filter(Boolean);
  const video = product.videos;
  const videoUrl = assetUrl(video?.path);

  return {
    sourcePlatform: "other",
    sourceStore: "fehaute.com",
    externalId: String(product.id ?? product.feed_id),
    sourceUrl: normalizeProductUrl(sourceUrl).toString(),
    shopDomain: "fehaute.com",
    handle: product.handle ? String(product.handle) : null,
    title: String(product.name ?? "Untitled Fehaute product"),
    vendor: product.vendor ? String(product.vendor) : "Fehaute",
    productType: categoryNames.at(-1) ?? product.product_basic_category ?? null,
    descriptionHtml: description || null,
    spu: product.spu ? String(product.spu) : null,
    publishedAt: product.released_at ?? product.first_online_time ?? product.first_released_at ?? null,
    inventoryQuantity: optionalNumber(product.inventory),
    currency: String(product?.price?.code ?? "USD").toUpperCase(),
    status: "image_searching",
    syncState: "not_synced",
    priceMin: prices.length ? Math.min(...prices) : productPrice,
    priceMax: prices.length ? Math.max(...prices) : productPrice,
    compareAtPrice: optionalNumber(product?.compare_at_price?.value) || null,
    tags: unique(asArray(product.tags).map((tag) => (typeof tag === "string" ? tag : tag?.name))),
    options: normalizedOptions(product.options),
    attributes: {
      specifications: asArray(product.specification),
      customFields: asArray(product.custom_field),
      sizeChart: asArray(product.size_chart),
      customSizeChart: asArray(product.custom_size_chart),
      bodySizeChart: asArray(product.body_size_chart),
      bodyFieldCountrySize: product.body_field_country_size ?? {},
      customFieldCountrySize: product.custom_field_country_size ?? {},
      customFieldCountrySizeEs: product.custom_field_country_size_es ?? {},
      customFieldToSize: asArray(product.custom_field_to_size),
      customFieldsToSizeInch: asArray(product.customfieldtosize_inch),
      productSpecificationSetting: product.product_specification_setting ?? {},
    },
    categories,
    content: {
      ...contentResource,
      tips: product.tips ?? null,
      sellingPointImages: asArray(product.selling_point_images),
      aPlus: asArray(product.a_plus),
      relation: asArray(product.relation),
      relateItems: product.relate_items ?? {},
      titleAdv: product.title_adv ?? {},
      promotions: {
        sale: product.sale ?? {},
        automaticDiscount: asArray(product.automatic_discount),
        activityModule: asArray(product.activity_module),
      },
    },
    raw: {
      source: "fehaute-next-data",
      fetchedAt: new Date().toISOString(),
      product,
      content: contentResource,
    },
    variants,
    images: asArray(product.images)
      .map((image, index) => mapImage(image, String(product.name ?? "Fehaute product"), index))
      .filter(Boolean),
    media: videoUrl
      ? [{
          externalId: String(video.video_id ?? "product-video"),
          mediaType: "video",
          url: videoUrl,
          posterUrl: assetUrl(video.image),
          title: video.title ?? product.name ?? null,
          position: 0,
          width: optionalPositiveNumber(video.width),
          height: optionalPositiveNumber(video.height),
          contentType: "video/mp4",
          metadata: video,
        }]
      : [],
  };
}

export async function fetchFehauteProduct(inputUrl) {
  const url = normalizeProductUrl(inputUrl);
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; MailshopImporter/1.0)" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Fehaute request failed (${response.status}) for ${url}`);
  const nextData = extractNextData(await response.text());
  const { product, content } = extractFehauteResources(nextData);
  return mapFehauteProduct(url, product, content);
}

async function importProduct(apiBase, apiKey, product) {
  const response = await fetch(`${apiBase.replace(/\/$/u, "")}/api/import/products`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(product),
  });
  const payload = await response.json();
  if (!response.ok) {
    const details = Array.isArray(payload?.error?.details)
      ? payload.error.details.map((detail) => `${detail.path}: ${detail.message}`).join("; ")
      : "";
    const message = payload?.error?.message ?? `Mailshop import failed (${response.status})`;
    throw new Error(details ? `${message}: ${details}` : message);
  }
  return payload;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRunIndex = args.indexOf("--dry-run");
  const dryRun = dryRunIndex >= 0;
  if (dryRun) args.splice(dryRunIndex, 1);
  const urls = args;
  if (!urls.length) {
    throw new Error("Usage: npm run import:fehaute -- [--dry-run] <product-url> [...]");
  }

  const apiBase = process.env.MAILSHOP_API_BASE ?? DEFAULT_API_BASE;
  const apiKey = process.env.INGEST_API_KEY;
  if (!dryRun && !apiKey) throw new Error("INGEST_API_KEY is required for imports");

  for (const url of urls) {
    const product = await fetchFehauteProduct(url);
    const summary = {
      externalId: product.externalId,
      spu: product.spu,
      title: product.title,
      variants: product.variants.length,
      images: product.images.length,
      attributes: product.attributes.specifications.length + product.attributes.customFields.length,
      media: product.media.length,
      payloadBytes: Buffer.byteLength(JSON.stringify(product)),
    };
    if (dryRun) {
      console.log(JSON.stringify({ dryRun: true, ...summary }));
      continue;
    }
    const result = await importProduct(apiBase, apiKey, product);
    console.log(JSON.stringify({ imported: true, productId: result.productId, ...summary }));
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/tools/import-fehaute.mjs")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
