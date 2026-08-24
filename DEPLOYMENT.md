# Mailshop 生产迁移与部署手册

本文档用于将 Mailshop 的 D1 数据库迁移和 Worker 代码发布到生产环境。所有命令均在项目根目录执行，默认终端为 PowerShell。

## 生产资源

| 资源 | 值 |
| --- | --- |
| Cloudflare Account ID | `be09d1ff2a06874636d8d7b574225767` |
| Worker | `mailshop-product-admin` |
| 生产地址 | `https://mailshop-product-admin.butcherblow.workers.dev` |
| D1 binding | `DB` |
| D1 database | `mailshop-products` |
| D1 database ID | `dd7ca6b3-7eb8-460d-8beb-8f35a609d51d` |
| R2 binding | `PRODUCT_IMAGES` |
| R2 bucket | `mailshop-product-images` |

资源绑定以 `wrangler.jsonc` 为准。修改账户或资源后，先同步更新本表和 Wrangler 配置。

## 固定发布顺序

生产发布必须按以下顺序执行：

1. 检查代码和构建。
2. 确认 Cloudflare 身份及目标账户。
3. 查看生产 D1 待执行迁移。
4. 可选但建议：导出生产 D1 备份。
5. 应用生产 D1 迁移。
6. 再次确认没有待执行迁移。
7. 部署 Worker 和前端静态资源。
8. 验证生产健康接口和首页。

如果迁移失败，立即停止，不要继续部署 Worker。

## 1. 发布前检查

```powershell
git status --short
npm install
npm run typecheck
npm test
npm run build
npx wrangler deploy --dry-run
```

`git status --short` 用于确认本次发布范围，不要求工作区必须干净。不要撤销或覆盖不属于本次发布的本地改动。

## 2. 确认 Cloudflare 登录和账户

```powershell
npx wrangler whoami
```

本机可能同时存在 `CLOUDFLARE_API_TOKEN` 和 Wrangler OAuth 登录态。如果自定义 Token 在目标账户执行 D1 命令时返回 `7403`、`10000` 或无权限错误，可以仅在当前 PowerShell 进程中忽略该 Token，改用已有的 Wrangler OAuth 凭据：

```powershell
$env:CLOUDFLARE_API_TOKEN=$null
$env:CLOUDFLARE_ACCOUNT_ID='be09d1ff2a06874636d8d7b574225767'
npx wrangler whoami
```

预期结果应显示目标账户，并包含 D1 和 Workers 写权限。不要输出、记录或提交任何 Token 的值。

后续所有远端命令都应在同一个 PowerShell 会话中执行，以继续使用上述账户选择。

## 3. 查看待执行迁移

```powershell
npx wrangler d1 migrations list DB --remote
```

检查输出中的迁移文件名是否和本次代码变更一致。迁移文件位于 `migrations/`，按编号递增执行。

生产环境规则：

- 不要修改已经在生产执行过的 migration。
- 数据库变更必须新增更高编号的 SQL 文件。
- 先在本地执行 `npm run db:migrate:local` 并完成测试。
- 迁移应尽量保持向后兼容，使旧 Worker 在迁移和新 Worker 发布之间仍可运行。

## 4. 导出生产 D1 备份

涉及删表、改列、数据回填或唯一约束等高风险变更时，迁移前导出完整备份：

```powershell
$backupDir = Join-Path $HOME 'mailshop-backups'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
npx wrangler d1 export DB --remote --output "$backupDir/mailshop-products-$timestamp.sql"
```

默认示例将备份输出到仓库外。不要提交生产数据备份，也不要把备份放入公开或自动同步的位置。

## 5. 应用生产迁移

```powershell
npm run db:migrate:remote
```

该脚本实际执行：

```powershell
wrangler d1 migrations apply DB --remote
```

Wrangler 会读取 `migrations/`，通过 D1 的迁移记录跳过已应用文件，并依次执行尚未应用的 SQL。确认每个迁移的最终状态均为成功。

迁移完成后必须复查：

```powershell
npx wrangler d1 migrations list DB --remote
```

预期输出：

```text
No migrations to apply!
```

## 6. 部署 Worker

```powershell
npm run deploy
```

该脚本会先执行 Vite 生产构建，再运行 `wrangler deploy`。记录输出中的生产地址和 `Current Version ID`，以便验收或回滚。

注意：浏览器插件位于 `image-search-extension/`，它是本地解压扩展，不会随 Worker 自动部署。插件代码变更后，需要在 Chrome 或 Edge 的扩展管理页面重新加载。

## 7. 生产验收

检查健康接口：

```powershell
Invoke-RestMethod 'https://mailshop-product-admin.butcherblow.workers.dev/api/health'
```

预期关键字段：

```json
{
  "ok": true,
  "service": "Mailshop 采集与 Shopify"
}
```

检查首页：

```powershell
curl.exe -sS -o NUL -w "HTTP %{http_code}`nContent-Type: %{content_type}`n" `
  'https://mailshop-product-admin.butcherblow.workers.dev/'
```

预期为 HTTP `200`，Content-Type 为 `text/html`。随后至少人工验证登录、采集任务列表和 Shopify 商品页面。

## 故障与回滚

### 账户选择错误

出现 `More than one account available` 时，显式设置目标账户：

```powershell
$env:CLOUDFLARE_ACCOUNT_ID='be09d1ff2a06874636d8d7b574225767'
```

### 自定义 Token 无权访问 D1

如果 `whoami` 能看到目标账户，但远端 D1 返回 `7403` 或 `10000`，按本文第 2 节临时清除 `CLOUDFLARE_API_TOKEN`，使用本机 OAuth 登录态。若 OAuth 也没有写权限，则停止发布并更新 Cloudflare 授权。

### Worker 回滚

先查看历史部署：

```powershell
npx wrangler deployments list
```

再回滚到确认可用的版本：

```powershell
npx wrangler rollback <VERSION_ID> --message "rollback: <原因>" --yes
```

Worker 回滚不会撤销 D1 迁移。因此 migration 必须优先设计为向后兼容。

### 数据库迁移失败

不要直接编辑已经执行过的 migration，也不要假设 Worker 回滚会恢复数据库。根据实际状态选择：

1. 新增一个更高编号的修复 migration，向前修复。
2. 在确认影响范围后，从迁移前备份恢复数据。

任何恢复生产数据的操作都应先保留当前数据库快照。

## 快速命令清单

以下清单适合已经熟悉完整流程时使用：

```powershell
$env:CLOUDFLARE_API_TOKEN=$null
$env:CLOUDFLARE_ACCOUNT_ID='be09d1ff2a06874636d8d7b574225767'

npx wrangler whoami
npm run typecheck
npm test
npm run build
npx wrangler deploy --dry-run
npx wrangler d1 migrations list DB --remote
npm run db:migrate:remote
npx wrangler d1 migrations list DB --remote
npm run deploy
Invoke-RestMethod 'https://mailshop-product-admin.butcherblow.workers.dev/api/health'
curl.exe -sS -o NUL -w "HTTP %{http_code}`n" 'https://mailshop-product-admin.butcherblow.workers.dev/'
```
