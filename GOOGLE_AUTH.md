# Google 登录与积分系统配置

## 已实现规则

- Google OpenID Connect 登录，使用 Authorization Code + PKCE。
- Google 新用户第一次登录时自动创建账号并获得 10,000 积分。
- 站内搜图和浏览器扩展搜图每次扣除 10 积分。
- OneBound 搜图失败时自动退还当次积分。
- D1 保存当前余额和完整积分流水；余额不足时返回 HTTP 402。
- 原有管理员密码登录继续可用。
- Google 登录创建的是普通用户；普通用户不能访问账号管理、Google 配置或 OneBound 配置。

## Google Cloud Console

1. 在 Google Cloud Console 创建 OAuth 2.0 Client，应用类型选择 `Web application`。
2. 添加生产回调地址：

   `https://<你的 Worker 域名>/api/auth/google/callback`

3. 本地开发时再添加：

   `http://localhost:8787/api/auth/google/callback`

4. 登录 Mailshop 管理后台，打开“系统设置”，在 Google OAuth 区域保存 Client ID、Client Secret 和允许域名。
5. 这些配置会使用 `SETTINGS_ENCRYPTION_KEY` 加密后写入 D1，Client Secret 不会返回浏览器。

## 浏览器扩展

1. 在 `chrome://extensions` 查看扩展 ID。
2. 将 [wrangler.jsonc](./wrangler.jsonc) 的 `EXTENSION_ORIGIN` 改为：

   `chrome-extension://<扩展 ID>`

3. 用户先在 Mailshop 网页中完成 Google 登录，再使用扩展搜图。扩展请求会携带同一个 HttpOnly 会话并扣除该用户积分。

## 部署

```powershell
npm run typecheck
npm test
npm run build
npm run db:migrate:remote
npm run deploy
```

不要把真实 Client Secret 提交到 Git。
