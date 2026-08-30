# Mailshop 采集任务扩展

这是一个 Chrome/Edge Manifest V3 浏览器扩展，用于把网页商品信息和图片保存为 Mailshop 采集任务。统一流程为：

`网页采集 -> 创建采集任务 -> 选择图片搜索 1688 -> 选择结果导入 Shopify`

创建采集任务不会调用 OneBound，也不会扣除搜图积分。只有用户在采集任务中明确选择图片并执行搜图时，才会检查并扣除 20 积分。

## 加载扩展

1. 在项目根目录启动 Worker：

   ```powershell
   cd D:\code\mailshop
   npm run dev
   ```

2. 打开 Chrome 的 `chrome://extensions` 或 Edge 的 `edge://extensions`。
3. 开启“开发者模式”，选择“加载已解压的扩展程序”。
4. 选择 `D:\code\mailshop\image-search-extension`。
5. 更新扩展文件后，在扩展管理页点击“重新加载”。

## 使用流程

1. 在插件中点击“登录”，进入 Mailshop 后台登录页面；后台登录成功后，插件会自动同步登录状态。
2. 打开商品网页，选择“手动选择图片”或“AI 分析图片”。
3. 选择同一商品的多张图片，创建一个采集任务。也可以拖入网页图片或本地 JPG、PNG、WebP、GIF、AVIF 文件。
4. 进入“采集任务”，从任务图片中选择一张，点击“使用此图搜索 1688”。
5. 打开搜图结果，选择已连接且验证通过的 Shopify 店铺。
6. 单条导入或将当前结果批量导入 Shopify。重复导入同一货源会更新该店铺中对应的 Shopify 草稿商品。

任务、图片、搜图轮次、结果和 Shopify 导入状态都以服务器数据库为准。插件本地存储只保存界面缓存、登录会话和用户自定义的 AI 配置。

## 服务接口

插件固定连接线上 Mailshop Worker，并使用以下统一采集任务接口：

```text
GET/POST /api/public/extension/collection-tasks
POST     /api/public/extension/collection-tasks/:taskId/search
POST     /api/public/extension/collection-tasks/:taskId/import
DELETE   /api/public/extension/collection-tasks/:taskId
```

旧版 `/api/public/extension/tasks` 路径仍作为兼容别名保留，新代码统一使用 `collection-tasks`。

## 当前限制

- 插件需要登录 Mailshop；创建任务免费，搜图需要至少 20 积分。
- 1688 搜图只接受采集任务中已保存的图片。
- Shopify 导入前，需要先在后台连接店铺并通过连接测试。
- 带登录态、防盗链或浏览器内部页面中的图片可能无法读取。
- 图片扫描会去重，默认隐藏小于 72px 的图片。

## 文件说明

- `manifest.json`：Manifest V3、权限和 Side Panel 配置。
- `service-worker.js`：同步采集任务、店铺和积分，执行搜图与 Shopify 导入。
- `panel.html`、`panel.js`、`panel.css`：新建任务、任务搜图、结果导入及管理界面。
- `tokens.css`：扩展面板的颜色、间距、字体和动效变量。
