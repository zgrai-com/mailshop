# Mailshop 采集任务与 Shopify 中台

Mailshop 是一套面向跨境电商选品的采集与 Shopify 管理工具。普通用户可通过 CSV/JSON 批量导入或浏览器插件创建采集任务，服务端保存任务图片和搜图轮次，用户确认 1688 结果后直接导入 Shopify 商品。

统一业务流程为：

`批量文件或浏览器插件创建采集任务 -> 任务内执行 1688 搜图 -> 选择结果导入 Shopify 商品`

项目采用 Cloudflare Workers 全栈部署：D1 保存任务、搜图、店铺和导入关系，R2 保存上传图片，React 管理界面通过 Worker Static Assets 托管。

## 核心功能

- 支持 Google 账号登录；新账号自动获得 10,000 积分，以图搜图每次消耗 20 积分，AI 请求和商品详情每次消耗 5 积分
- 普通用户使用仪表台、采集任务、Shopify 商品、Shopify 店铺和积分管理；系统配置与账号管理仅管理员可见
- 普通用户可在采集任务页导入 CSV/JSON 文件，逐行预览校验并批量创建或更新任务
- 浏览器插件采集网页商品信息与多张图片，并同步为服务器采集任务
- 采集任务保留每张源图的多轮 1688 搜图结果、参数、页码和积分消耗
- 选择目标 Shopify 店铺，单条或批量把 1688 结果直接创建或更新为 Shopify 草稿商品
- 管理 Shopify 商品、SKU、选项、价格、库存、图片和视频
- 上传商品图片到 Cloudflare R2，通过受保护的媒体接口访问
- 提供管理员初始化、员工账号、会话、登录限流和密码重置
- 记录关键管理操作的审计日志
- 提供 Bearer Token 保护的商品与货源导入接口
- 支持从 Fehaute 商品页解析并导入完整商品数据

旧的本地商品导入接口和数据表继续保留给爬虫及历史数据兼容，但不再作为普通用户的采集工作流入口。后台统一使用 `/api/collection-tasks`，旧 `/api/search-tasks` 仅作为兼容别名。

### 普通用户批量导入

采集任务页支持 CSV 和 JSON。CSV 表头为：

```text
client_id,name,product_title,description,sku,source_site,product_url,source_image_url,images
```

`images` 使用 `|` 分隔多个图片 URL。每行至少需要商品标题、HTTP(S) 商品 URL 和一张图片；同一用户的商品 URL 只能创建一个采集任务，重复 URL 会逐行返回失败提示。页面也提供 CSV/JSON 模板下载。

已登录用户也可以调用 `POST /api/collection-tasks/batch`：

```json
{
  "items": [
    {
      "clientId": "source-product-123",
      "productTitle": "Sample dress",
      "productUrl": "https://example.com/products/sample-dress",
      "images": ["https://cdn.example.com/sample-dress.jpg"]
    }
  ]
}
```

接口最多接收 100 条记录，逐行返回 `created` 或 `failed`，不会因为单条校验失败或重复 URL 而丢弃其他有效记录。

## 技术栈

- 前端：React、TypeScript、Vite、Lucide React
- 后端：Cloudflare Workers、TypeScript、Zod
- 数据库：Cloudflare D1
- 对象存储：Cloudflare R2
- 测试：Vitest
- 部署：Wrangler

## 项目结构

```text
.
├── migrations/         # D1 数据库迁移
├── src/                # Worker API、认证、数据库和集成逻辑
├── tools/              # 数据导入工具
├── web/                # React 管理界面
├── wrangler.jsonc      # Cloudflare Workers 配置
└── package.json        # 开发、测试与部署命令
```

## 运行前提

- Node.js 20 或更高版本
- npm
- Cloudflare 账号，以及可用的 D1 数据库和 R2 存储桶
- 已登录的 Wrangler CLI：`npx wrangler login`

## Cloudflare 资源

- Worker：`mailshop-product-admin`
- D1：`mailshop-products`
- R2：`mailshop-product-images`
- D1 binding：`DB`
- R2 binding：`PRODUCT_IMAGES`

密钥只通过 Wrangler secrets 保存，不要写入 `wrangler.jsonc`、源码或提交记录：

- `INGEST_API_KEY`：爬虫接口的 Bearer Token
- `BOOTSTRAP_TOKEN`：首次创建管理员时使用，初始化成功后接口会拒绝再次执行
- `SETTINGS_ENCRYPTION_KEY`：独立加密 OneBound 等集成凭据，轮换初始化令牌时不会破坏已保存配置
- `SERVER_AI_CONVERSATION_BASE_URL`、`SERVER_AI_CONVERSATION_API_KEY`：可选的对话接口兜底，图片识别、图片分析、对话和翻译共用这一套凭据
- `SERVER_AI_IMAGE_FILTER_MODEL_ID`、`SERVER_AI_IMAGE_ANALYSIS_MODEL_ID`、`SERVER_AI_CHAT_MODEL_ID`、`SERVER_AI_TRANSLATION_MODEL_ID`：上述各对话任务的模型 ID
- `SERVER_AI_IMAGE_GENERATION_BASE_URL`、`SERVER_AI_IMAGE_GENERATION_API_KEY`、`SERVER_AI_IMAGE_GENERATION_MODEL_ID`：可选的图片生成接口及其模型兜底
- 旧版 `SERVER_AI_BASE_URL`、`SERVER_AI_CHAT_BASE_URL` 和 `SERVER_AI_TRANSLATION_BASE_URL` 变量仍会作为兼容回退读取

## 本地开发

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

默认地址为 `http://127.0.0.1:8787`。如果端口被占用，可运行 `npx wrangler dev --port 8788`。

首次运行前，请为 `.dev.vars` 中的三个配置生成彼此独立的随机值。不要把真实密钥提交到 Git。

## 验证与部署

生产数据库迁移、Cloudflare 多账户选择、部署验收与回滚的完整流程见 [`DEPLOYMENT.md`](./DEPLOYMENT.md)。生产发布请按该文档执行，不要跳过迁移前后检查。

```powershell
npm run typecheck
npm test
npm run build
npx wrangler deploy --dry-run
npm run db:migrate:remote
npm run deploy
npx wrangler secret put INGEST_API_KEY
npx wrangler secret put BOOTSTRAP_TOKEN
npx wrangler secret put SETTINGS_ENCRYPTION_KEY
npx wrangler secret put SERVER_AI_CONVERSATION_BASE_URL
npx wrangler secret put SERVER_AI_CONVERSATION_API_KEY
npx wrangler secret put SERVER_AI_IMAGE_FILTER_MODEL_ID
npx wrangler secret put SERVER_AI_IMAGE_ANALYSIS_MODEL_ID
npx wrangler secret put SERVER_AI_CHAT_MODEL_ID
npx wrangler secret put SERVER_AI_TRANSLATION_MODEL_ID
npx wrangler secret put SERVER_AI_IMAGE_GENERATION_BASE_URL
npx wrangler secret put SERVER_AI_IMAGE_GENERATION_API_KEY
npx wrangler secret put SERVER_AI_IMAGE_GENERATION_MODEL_ID
```

Google OAuth、积分规则、回调地址和扩展 Origin 配置见 [`GOOGLE_AUTH.md`](./GOOGLE_AUTH.md)。Google 凭据在后台“系统设置”中保存。

首次部署后创建管理员：

```powershell
$body = @{
  username = "admin"
  displayName = "Administrator"
  password = "<ADMIN_PASSWORD>"
  token = "<BOOTSTRAP_TOKEN>"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "https://<WORKER_HOST>/api/auth/bootstrap" -ContentType "application/json" -Body $body
```

## 爬虫接口

两个导入接口都使用相同的请求头：

```http
Authorization: Bearer <INGEST_API_KEY>
Content-Type: application/json
```

### 导入或更新 Shopify 商品

`POST /api/import/products`

同一 `sourcePlatform + sourceStore + externalId` 会执行更新；没有外部 ID 时由系统生成内部 ID。建议爬虫始终传入稳定的 Shopify Product ID。

```json
{
  "sourcePlatform": "shopify",
  "sourceStore": "example.myshopify.com",
  "externalId": "gid://shopify/Product/1234567890",
  "sourceUrl": "https://example.com/products/sample-dress",
  "shopDomain": "example.myshopify.com",
  "handle": "sample-dress",
  "title": "Sample dress",
  "vendor": "Example Brand",
  "productType": "Dresses",
  "descriptionHtml": "<p>Product description</p>",
  "currency": "USD",
  "status": "image_searching",
  "priceMin": 29.9,
  "priceMax": 39.9,
  "compareAtPrice": 49.9,
  "tags": ["dress", "summer"],
  "options": [
    { "name": "Color", "values": ["Black", "Blue"] },
    { "name": "Size", "values": ["S", "M", "L"] }
  ],
  "variants": [
    {
      "externalId": "gid://shopify/ProductVariant/9876543210",
      "sku": "DRESS-BLK-S",
      "barcode": "1234567890123",
      "title": "Black / S",
      "option1": "Black",
      "option2": "S",
      "price": 29.9,
      "compareAtPrice": 49.9,
      "inventoryQuantity": 12,
      "weight": 0.35,
      "weightUnit": "kg",
      "raw": { "source": "shopify-crawler" }
    }
  ],
  "images": [
    {
      "externalId": "gid://shopify/ProductImage/112233",
      "url": "https://cdn.shopify.com/example.jpg",
      "altText": "Black dress",
      "position": 0,
      "width": 1600,
      "height": 2000,
      "contentType": "image/jpeg"
    }
  ],
  "raw": { "shopifyPayload": "可保存原始字段，便于以后回溯" }
}
```

成功响应会返回内部商品 UUID，关联 1688 商品时使用这个 `productId`：

```json
{
  "ok": true,
  "productId": "0a95f67f-f8fb-4454-9ef4-7cb0debb28a0"
}
```

### 关联 1688 候选货源

`POST /api/import/product-offers`

同一 Shopify 商品可关联多个 1688 Offer；同一 `productId + offerId` 会更新已有关系。

```json
{
  "productId": "0a95f67f-f8fb-4454-9ef4-7cb0debb28a0",
  "matchStatus": "candidate",
  "matchScore": 0.92,
  "notes": "员工以图搜图找到，待确认面料",
  "variantMap": {
    "DRESS-BLK-S": "1688-BLACK-S"
  },
  "offer": {
    "offerId": "1069450613745",
    "url": "https://detail.1688.com/offer/1069450613745.html",
    "title": "女装连衣裙源头工厂批发",
    "supplierId": "supplier-10001",
    "supplierName": "示例服饰工厂",
    "priceMin": 18.5,
    "priceMax": 24.8,
    "currency": "CNY",
    "minOrderQuantity": 2,
    "unit": "件",
    "province": "广东",
    "city": "广州",
    "variants": [
      {
        "externalId": "1688-BLACK-S",
        "sku": "1688-BLACK-S",
        "name": "黑色 / S",
        "attributes": { "颜色": "黑色", "尺码": "S" },
        "price": 18.5,
        "stock": 200
      }
    ],
    "images": [
      {
        "externalId": "offer-image-1",
        "url": "https://cbu01.alicdn.com/example.jpg",
        "position": 0
      }
    ],
    "raw": { "source": "1688-crawler" }
  }
}
```

`matchStatus` 可取 `candidate`、`selected`、`rejected`。图片 URL 会保留为远程来源；员工在后台上传的本地图片会存入 R2，并通过需要登录的 `/media/*` 地址读取。

## Fehaute 商品导入

`tools/import-fehaute.mjs` 会读取商品页中的 `__NEXT_DATA__`，保存 SPU、库存、发布时间、分类、规格、尺码表、图片、视频、完整 SKU 和页面原始对象。

先检查解析结果，不写数据库：

```powershell
npm run import:fehaute -- --dry-run "https://fehaute.com/products/example"
```

写入线上数据库：

```powershell
$env:INGEST_API_KEY = "<INGEST_API_KEY>"
npm run import:fehaute -- "https://fehaute.com/products/example"
Remove-Item Env:INGEST_API_KEY
```

未单独建列的来源字段仍会完整保存在商品和 SKU 的 `raw_json` 中，避免上游页面增加字段时发生数据丢失。

## 主要数据表

- `products`、`product_variants`、`product_images`
- `product_media`：商品视频和其他非图片媒体
- `offers_1688`、`offer_variants`、`offer_images`
- `product_offer_links`：Shopify 商品与 1688 Offer 的一对多关系
- `users`、`sessions`、`login_attempts`、`oauth_states`
- `credit_wallets`、`credit_transactions`：积分余额与完整流水
- `shopify_stores`、`shopify_store_bindings`、`shopify_product_publications`：Shopify 店铺、用户绑定、凭据、连接状态和商品发布记录
- `audit_logs`

## 发布商品到 Shopify

系统设置新增了 Shopify Admin API 配置。配置并测试连接后，可在商品详情中把标题、描述、供应商、类型、标签、规格、SKU、价格和最多 20 张图片上传到 Shopify。首次上传会创建商品，后续点击会更新同一条 Shopify 商品记录；商品始终保存为 Shopify 草稿，库存暂不自动写入。

准备步骤：

1. 准备一个目标 Shopify 商店。开发测试可使用 Shopify Dev Dashboard 中的开发商店，正式销售则使用正式商店。
2. 在 Shopify Dev Dashboard 创建应用，为应用版本申请 `write_products` 权限，并把应用安装到目标商店。
3. 在 Mailshop 的“系统设置 / Shopify 商品发布”中填写商店的 `xxx.myshopify.com` 域名、Client ID 和 Client Secret。
4. 点击“测试连接”。通过后，进入商品详情并点击“上传到 Shopify 草稿”。

Shopify Client Secret 使用 `SETTINGS_ENCRYPTION_KEY` 加密后存入 D1，不会返回浏览器。部署前需要执行数据库迁移：

```bash
npm run db:migrate:remote
```

数据库变更通过 `migrations/` 管理。生产环境不要直接修改已执行的 migration；新增编号更高的迁移文件。

## 开源许可

本项目使用 [MIT License](./LICENSE) 开源。
