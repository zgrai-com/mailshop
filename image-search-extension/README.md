# Mailshop 1688 以图搜款扩展

这是一个 Chrome/Edge Manifest V3 浏览器扩展。它扫描当前网页中的普通图片、`srcset` 图片和部分 CSS 背景图，用户选择图片后创建独立搜款任务，将图片上传到 Mailshop Worker 的公开接口，并显示 OneBound 返回的 1688 同款结果。

## 加载扩展

1. 启动 `cloudflare` Worker：

   ```powershell
   cd D:\code\mailshop\cloudflare
   npm run dev
   ```

2. 打开 Chrome 的 `chrome://extensions` 或 Edge 的 `edge://extensions`。
3. 开启“开发者模式”，选择“加载已解压的扩展程序”。
4. 选择目录 `D:\code\mailshop\image-search-extension`。
5. 打开普通商品网页，点击工具栏扩展图标，在右侧面板点击“加载图片”。

6. 在弹出的图片选择器中选择当前页面的一张图片；或者直接把图片拖到侧边栏的拖放区域。

7. 在任务草稿中填写名称并点击“创建任务”。任务创建后会立即进入队列，可以继续加载下一张图片创建其他任务。

也可以直接把网页中的图片拖到侧边栏的拖放区域。本地 JPG、PNG、WebP、GIF 和 AVIF 文件也可以拖入，或点击拖放区域选择文件。拖入后需要点击“创建任务”，不会自动消耗查询配额。

任务队列会独立保存每个任务的状态。查询完成后可以展开 1688 结果；失败任务可以重试；完成或失败的任务可以批量清理。关闭侧边栏后重新打开，任务仍会保留。

## 服务地址

插件固定使用线上服务器：

```text
https://mailshop-product-admin.butcherblow.workers.dev/api/public/onebound/image-search
```

面板不再提供接口地址设置，避免本地地址或旧任务配置影响登录和重试。

## 登录与更新

面板里的“登录”会在 Chrome 的授权窗口中完成 Google 登录，完成后会自动把会话写入插件并刷新账号和积分。更新插件文件后，请到 `chrome://extensions` 点击该扩展的“重新加载”，再重新打开侧边栏；如果同时看到两个 Mailshop 实例，保留任意一个即可，两个已登记的扩展 ID 都支持登录回调。

## 当前限制

- 本版本按要求不增加鉴权；接口公开后，任何访问者都可能消耗 OneBound 配额。
- 接口只接受 multipart 图片上传，不接受任意远程 URL。
- 带登录态、防盗链或浏览器内部页面中的图片可能无法读取。
- 图片扫描会去除重复地址，面板默认隐藏小于 72px 的图片。
- 扩展只查询和展示结果，不会自动将结果写入 D1 商品库。

## 文件说明

- `manifest.json`：Manifest V3、权限和 Side Panel 配置。
- `service-worker.js`：下载所选图片、调用 Worker 接口和处理响应。
- `panel.html`、`panel.js`、`panel.css`：选图、设置接口和结果展示面板。
- `tokens.css`：扩展面板的颜色、间距、字体和动效变量。
