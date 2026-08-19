# Mailshop 项目总结

## 项目定位

Mailshop 是一个面向跨境电商选品与货源管理的轻量级商品中台。它集中管理 Shopify 或其他来源的商品、SKU、图片、视频和库存，并支持将商品与 1688 候选货源关联，形成商品导入、图片找货、人工确认和货源维护的完整工作流。

项目采用 Cloudflare 全栈部署，适合小团队内部使用：

- React 管理台提供商品、货源、账号和系统设置界面。
- Cloudflare Worker 提供认证、业务 API、图片代理和静态资源托管。
- Cloudflare D1 保存商品、货源、用户、关联关系和审计日志。
- Cloudflare R2 保存员工上传的商品图片。
- OneBound 用于 1688 图片搜索、商品搜索和详情获取。

## 技术栈

- 前端：React 19、TypeScript、Vite、Lucide React
- 后端：Cloudflare Workers、TypeScript、Zod
- 数据库：Cloudflare D1（SQLite）
- 对象存储：Cloudflare R2
- 测试：Vitest
- 部署与本地开发：Wrangler
- 许可证：MIT
- 运行环境：Node.js 20 或更高版本

## 系统架构

```text
浏览器
  |
  +-- React/Vite 管理台（web/）
  |     +-- 请求 /api/* 和 /media/*
  |
  +-- Cloudflare Worker（src/index.ts）
        +-- 认证与会话（src/auth.ts）
        +-- HTTP、安全头和错误处理（src/http.ts）
        +-- D1 数据访问（src/db.ts）
        +-- OneBound 集成（src/onebound.ts）
        +-- R2 图片上传与媒体访问
        +-- 外部图片安全代理（src/image-proxy.ts）
        +-- Worker Static Assets 托管前端 dist/
```

生产环境中，`wrangler.jsonc` 将 Worker、D1、R2 和前端静态资源绑定在一起。非 API 请求由静态资源服务处理，404 的 GET 请求会回退到前端入口，适配单页应用。

## 核心功能

### 商品工作台

- 分页列出商品，支持按标题、供应商、商品 ID 或 SKU 搜索。
- 按商品状态和来源筛选。
- 查看商品详情、SKU、图片、视频、标签、库存和扩展元数据。
- 新建、编辑和归档商品。
- 上传商品图片到 R2，通过需要登录的 `/media/*` 地址访问。
- 对商品图片发起 OneBound 图片搜索。

商品状态包括 `new`、`image_searching`、`matched`、`reviewed` 和 `archived`。

### 1688 货源管理

- 为一个商品关联多个 1688 Offer。
- 保存候选货源、匹配分数、备注和 SKU 映射。
- 查看供应商、价格、起批量、库存、属性、阶梯价、图片、描述图片、视频和最新接口快照。
- 支持 `candidate`、`selected` 和 `rejected` 三种匹配状态。
- 可移除商品与货源的关联。

### OneBound 集成

- 在系统设置中保存 OneBound Key 和 Secret。
- 凭据写入 D1 前会加密，界面只返回配置状态和脱敏提示。
- 支持图片搜索、候选批量保存和 1688 商品详情获取。
- 详情数据拆分保存到货源、SKU、属性、价格阶梯、图片、视频、供应商和 API 快照表。

### 账号与审计

- 首次通过一次性 Bootstrap Token 创建管理员。
- 用户名和密码登录，使用 HttpOnly 会话 Cookie。
- 支持账号创建、启停、显示名修改和密码重置。
- 登录失败限流，并记录登录尝试。
- 登录、商品变更、图片上传、货源关联、设置变更和爬虫导入等操作写入审计日志。

### 数据导入

- `POST /api/import/products`：使用 Bearer Token 导入或更新商品。
- `POST /api/import/product-offers`：导入或更新 1688 货源关联。
- `tools/import-fehaute.mjs`：解析 Fehaute 商品页的 `__NEXT_DATA__`，导入 SPU、分类、规格、SKU、图片、视频和原始 JSON。

## 目录说明

```text
D:/code/mailshop/
+-- PROJECT_SUMMARY.md       # 本项目总结
+-- cloudflare/
    +-- src/
    |   +-- index.ts         # Worker 入口与路由
    |   +-- auth.ts          # 密码、会话、登录限流和认证
    |   +-- db.ts            # D1 查询、写入和数据组装
    |   +-- http.ts          # 请求解析、错误、安全头和来源校验
    |   +-- onebound.ts      # OneBound API、解析和货源落库
    |   +-- image-proxy.ts   # 外部图片代理与 SSRF 防护
    |   +-- validation.ts    # Zod 请求校验
    |   +-- *.test.ts        # Worker 单元测试
    +-- web/
    |   +-- src/App.tsx      # 管理台主界面和页面状态
    |   +-- src/api.ts       # 前端 API 客户端
    |   +-- src/types.ts     # 前端领域类型
    |   +-- src/components/  # 登录、商品、货源、账号和设置组件
    |   +-- src/styles.css   # 管理台样式
    |   +-- index.html       # Vite HTML 入口
    +-- migrations/          # D1 数据库迁移 0001-0004
    +-- tools/               # Fehaute 导入脚本及测试
    +-- wrangler.jsonc       # Worker、D1、R2 和 Assets 配置
    +-- vite.config.ts       # Vite 构建和本地代理
    +-- vitest.config.ts     # Vitest 配置
    +-- package.json         # 开发、测试、迁移和部署命令
    +-- .dev.vars.example    # 本地密钥变量模板
```

## 数据模型

### 商品域

- `products`：商品主表，保存来源、标题、状态、价格、库存、标签和原始数据。
- `product_variants`：商品 SKU、价格、库存、重量和选项。
- `product_images`：商品图片及 R2 Key。
- `product_media`：视频、图片、文档等扩展媒体。

### 货源域

- `offers_1688`：1688 货源主表。
- `offer_variants`、`offer_images`：货源 SKU 和图片。
- `product_offer_links`：商品与货源的关联、匹配状态、分数和 SKU 映射。
- `suppliers_1688`：供应商信息。
- `offer_price_tiers`、`offer_properties`：阶梯价和商品属性。
- `offer_property_images`、`offer_description_images`、`offer_videos`：详情媒体。
- `offer_api_snapshots`：OneBound 原始接口响应快照。

### 平台与安全域

- `users`、`sessions`、`login_attempts`：用户、会话和登录安全。
- `integration_settings`：加密后的 OneBound 配置。
- `shopify_stores`：为后续 Shopify App 安装和同步预留。
- `audit_logs`：关键操作审计。

## 主要 API

### 公共或初始化接口

- `GET /api/health`：健康检查。
- `POST /api/auth/bootstrap`：系统无用户时创建首个管理员。
- `POST /api/auth/login`：登录并建立会话。
- `POST /api/import/products`：Bearer Token 商品导入。
- `POST /api/import/product-offers`：Bearer Token 货源导入。

### 登录后接口

- `GET /api/auth/me`、`POST /api/auth/logout`
- `GET /api/dashboard`
- `GET/POST /api/products`
- `GET/PATCH/DELETE /api/products/:productId`
- `POST /api/products/:productId/offers`
- `DELETE /api/products/:productId/offers/:linkId`
- `POST /api/products/:productId/offers/onebound`
- `POST /api/products/:productId/images/:imageId/search`
- `GET /api/offers/:offerId`
- `POST /api/uploads`
- `GET /media/:r2Key`（需要登录）
- `GET/PUT /api/integrations/onebound`
- `GET/POST /api/users`
- `PATCH /api/users/:userId`
- `POST /api/users/:userId/password`
- `GET /api/image-proxy?url=...`

所有业务写接口都经过 Zod 校验；登录后的跨站写请求需要通过同源校验。

## 本地开发

在 `cloudflare/` 目录执行：

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
# 为 .dev.vars 中的三个变量设置独立随机值
npm run db:migrate:local
npm run dev
```

常用地址：

- Worker 整合开发入口：`http://127.0.0.1:8787`
- 独立 Vite 前端：`http://localhost:5173`
- Vite 将 `/api` 和 `/media` 代理到 `http://localhost:8787`。

## 验证、迁移与部署

```powershell
npm run typecheck
npm test
npm run build
npx wrangler deploy --dry-run
npm run db:migrate:remote
npm run deploy
```

首次生产部署前配置 Wrangler Secrets：

```powershell
npx wrangler secret put INGEST_API_KEY
npx wrangler secret put BOOTSTRAP_TOKEN
npx wrangler secret put SETTINGS_ENCRYPTION_KEY
```

当前 Cloudflare 资源绑定：

- Worker：`mailshop-product-admin`
- D1：`mailshop-products`，binding 为 `DB`
- R2：`mailshop-product-images`，binding 为 `PRODUCT_IMAGES`
- 静态资源 binding：`ASSETS`

迁移采用递增 SQL 文件管理。生产环境应新增更高编号的迁移，不要修改已经执行过的迁移。

## 测试覆盖

当前测试主要覆盖：

- 图片代理 URL 校验、响应大小和内容类型。
- OneBound 多种响应结构的兼容解析和商品详情标准化。
- 商品、货源、分页、OneBound 设置和候选批量保存的 Zod 校验。
- Fehaute `__NEXT_DATA__` 提取和商品字段映射。

测试位于 `cloudflare/src/*.test.ts` 和 `cloudflare/tools/import-fehaute.test.mjs`，执行 `npm test`。

## 安全与运维注意事项

- 不要提交真实的 `INGEST_API_KEY`、`BOOTSTRAP_TOKEN`、`SETTINGS_ENCRYPTION_KEY` 或 `.dev.vars`。
- Bootstrap Token 只用于首次初始化；系统已有用户后会拒绝再次初始化。
- 会话使用服务端 Token Hash 和 HttpOnly Cookie，不在前端保存密码或会话令牌。
- R2 媒体接口要求登录，并限制 Key 必须位于 `products/` 路径。
- 外部图片代理限制协议、端口、凭据和内网地址，以降低 SSRF 风险。
- OneBound 凭据依赖 `SETTINGS_ENCRYPTION_KEY`；更换密钥前应处理已保存配置的解密兼容性。
- `account_id`、D1 database ID 和 R2 bucket 名已写入 `wrangler.jsonc`，迁移 Cloudflare 账号时需要替换。
- 当前 `cloudflare/README.md` 显示明显字符编码乱码，后续建议统一转换为 UTF-8 并校正文档。

## 当前成熟度与后续方向

项目已经具备可运行的内部商品中台骨架，商品和货源的核心闭环、认证、存储、导入和测试基础均已建立。`shopify_stores` 表和同步字段为后续 Shopify App 安装、Webhook 和双向同步预留。

后续可优先考虑：

1. 补充端到端 API 测试，覆盖 D1 交互、认证边界和完整导入流程。
2. 完善商品状态、货源匹配和导入失败的操作反馈。
3. 实现 Shopify OAuth、Webhook 和同步任务。
4. 增加批量操作和更细粒度的权限模型。
5. 修复 README 编码，并补充生产监控、告警和备份恢复说明。
