# Mailshop 商品采集与 1688 搜款扩展

这是一个 Chrome/Edge Manifest V3 浏览器扩展。它扫描并清洗当前商品页，通过 AI 提取标题、简介和 SKU，把多张已选图片保存为同一个服务器商品任务。创建任务不调用 1688，也不扣积分；用户需要在任务管理中手动选择一张源图，才会执行 OneBound 1688 图片搜索。

## 加载扩展

1. 启动 `cloudflare` Worker：

   ```powershell
   cd D:\code\mailshop\cloudflare
   npm run dev
   ```

2. 打开 Chrome 的 `chrome://extensions` 或 Edge 的 `edge://extensions`。
3. 开启“开发者模式”，选择“加载已解压的扩展程序”。
4. 选择目录 `D:\code\mailshop\image-search-extension`。
5. 打开普通商品网页，点击工具栏扩展图标，在右侧面板点击“手动选择图片”或“AI 分析图片”。

6. 在图片选择器中选择当前商品的多张图片，点击“创建 1 个商品任务”；也可以直接把单张图片拖到侧边栏创建任务。

7. 打开“任务管理”，从任务保存的图片中选择一张，再点击“使用此图搜索 1688”。只有这一步会检查并扣除 20 积分。

也可以直接把网页中的图片拖到侧边栏的拖放区域。本地 JPG、PNG、WebP、GIF 和 AVIF 文件也可以拖入，或点击拖放区域选择文件。拖入后需要点击“创建任务”，不会自动消耗查询配额。

任务、商品信息、图片列表、所选搜索图和查询结果都以服务器数据库为准，本地存储只承担界面缓存。插件还提供商品管理、任务管理、店铺管理、积分管理和 AI 设置页面。

## 服务地址

插件固定使用线上服务器：

```text
https://mailshop-product-admin.butcherblow.workers.dev/api/public/onebound/image-search
```

面板不再提供接口地址设置，避免本地地址或旧任务配置影响登录和重试。

## 登录与更新

面板里的“登录”会在 Chrome 的授权窗口中完成 Google 登录，完成后会自动把会话写入插件并刷新账号和积分。更新插件文件后，请到 `chrome://extensions` 点击该扩展的“重新加载”，再重新打开侧边栏；如果同时看到两个 Mailshop 实例，保留任意一个即可，两个已登记的扩展 ID 都支持登录回调。

## 当前限制

- 插件管理页需要登录 Mailshop，创建任务不要求有可用积分。
- 1688 搜索接口只接受任务中已保存图片对应的 multipart 图片上传。
- 带登录态、防盗链或浏览器内部页面中的图片可能无法读取。
- 图片扫描会去除重复地址，面板默认隐藏小于 72px 的图片。
- 扩展只查询和展示结果，不会自动将结果写入 D1 商品库。

## 文件说明

- `manifest.json`：Manifest V3、权限和 Side Panel 配置。
- `service-worker.js`：同步服务器任务与管理数据，并在用户明确选图后调用搜索接口。
- `panel.html`、`panel.js`、`panel.css`：商品采集、任务选图搜索和管理页面。
- `tokens.css`：扩展面板的颜色、间距、字体和动效变量。
