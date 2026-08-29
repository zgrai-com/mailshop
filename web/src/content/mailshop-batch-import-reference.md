# Mailshop Import Format

## CSV

Required header:

```text
client_id,name,product_title,description,sku,source_site,product_url,source_image_url,images
```

Example:

```csv
fehaute-17080419,Champagne gown,Champagne 3D Floral Gown,One shoulder satin floor-length gown,4AH17DR4H113D,fehaute.com,https://fehaute.com/products/champagne-3d-floral-ruched-satin-one-shoulder-sleeveless-sheath-floor-length-gown-dress-17080419,https://fehaute.com/image/catalog/product/example.jpg,https://fehaute.com/image/catalog/product/example.jpg|https://fehaute.com/image/catalog/product/example-2.jpg
```

Quote CSV values containing commas, line breaks, or double quotes. Escape a double quote as `""`.

## JSON

```json
{
  "items": [
    {
      "clientId": "fehaute-17080419",
      "name": "Champagne gown",
      "productTitle": "Champagne 3D Floral Gown",
      "description": "One shoulder satin floor-length gown",
      "sku": "4AH17DR4H113D",
      "sourceSite": "fehaute.com",
      "productUrl": "https://fehaute.com/products/example",
      "images": [
        { "id": "image-1", "url": "https://cdn.example.com/gown.jpg", "alt": "Champagne gown", "source": "manual-import" }
      ]
    }
  ]
}
```

The batch endpoint also accepts snake_case aliases (`client_id`, `product_title`, `source_site`, `product_url`, `source_image_url`) and a pipe-separated `images` string. `source_image_url` is used as a fallback when `images` is empty.

For JSON, `options` is optional and can contain `sort`, `limit`, `page`, `cache`, `lang`, and `version`. These fields configure the later image-search run; they are not product catalog attributes.

## Field Boundary

The nine CSV columns plus optional JSON `options` are the complete collection-task import contract. They cover the data required to create and search a task, not every field a source site may publish. A Fehaute page can additionally expose product IDs and handles, SPU, price/currency, inventory, SKU variants, color and size options, specifications, custom fields, size charts, tags, categories, release timestamps, video, promotions, SEO metadata, and raw content. Use the Fehaute full-product importer when those catalog fields must be retained; do not add undocumented columns to the task CSV and assume they will be stored.

## Validation

- `product_url` must be an absolute HTTP(S) URL.
- Each image must be an absolute HTTP(S) URL or a supported `data:image/...` URL.
- A row needs a title in `product_title`, `title`, or `name`.
- A row needs at least one image in `images` or `source_image_url`.
- Keep at most 100 rows per batch file and at most 200 images per item.
- Duplicate `client_id` values in one file are rejected after the first occurrence; duplicate submissions across files update the existing task.

## Response

`POST /api/collection-tasks/batch` returns `created`, `updated`, and `failed` counts plus `results` entries containing the zero-based `index`, status, optional `taskId`, and an error object for failed rows. A successful row is visible in the authenticated user's **采集任务** list with status **未搜图** until a search is run.
