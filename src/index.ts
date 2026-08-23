import {
  assertIngestKey,
  authenticate,
  assertAdmin,
  clearSessionCookie,
  createSession,
  enforceLoginRateLimit,
  getLoginUser,
  hashPassword,
  insertUser,
  recordLoginAttempt,
  replacePassword,
  revokeSession,
  secretsEqual,
  verifyPassword,
  type SessionUser,
} from "./auth";
import {
  chargeAiRequest,
  chargeImageSearch,
  chargeProductDetail,
  getCreditBalance,
  listCreditTransactions,
  refundAiRequest,
  refundImageSearch,
  refundProductDetail,
} from "./credits";
import { finishGoogleLogin, getGoogleSettings, googleLoginConfigured, saveGoogleSettings, startGoogleLogin } from "./google-auth";
import {
  addUploadedImage,
  assertMediaAccess,
  assertOfferAccess,
  assertProductAccess,
  completeSearchTask,
  dashboardSummary,
  deleteProduct,
  deleteSearchTask,
  failSearchTask,
  getProduct,
  getSearchTask,
  getStoredOfferDetail,
  listProducts,
  listUsers,
  patchProduct,
  patchUser,
  recordAudit,
  recordSearchTaskImports,
  listSearchTasks,
  startSearchTask,
  upsertSearchTask,
  removeOfferLink,
  upsertOfferLink,
  upsertProduct,
} from "./db";
import {
  getOneBoundItem,
  getOneBoundSettings,
  importOneBoundProducts,
  saveOneBoundCandidates,
  saveOneBoundSettings,
  searchImageBytes,
  searchImageUrl,
  searchProductImage,
} from "./onebound";
import {
  ApiError,
  assertSameOrigin,
  clientIp,
  errorResponse,
  json,
  parseQuery,
  readJson,
  withSecurityHeaders,
} from "./http";
import { handleImageProxy } from "./image-proxy";
import { classifyImageCandidates, getAiSettings, saveAiSettings, translateShopifyContent } from "./ai";
import { allowedExtensionOrigins, extensionOriginFromRequest } from "./extension-origin";
import { deleteShopifyProduct, deleteShopifyStore, getShopifyProduct, getShopifyProductTranslations, getShopifySettings, listShopifyProducts, publishProductToShopify, registerShopifyTranslations, saveShopifySettings, testShopifyStore, updateShopifyProduct } from "./shopify";
import {
  bootstrapSchema,
  crawlerOfferLinkSchema,
  loginSchema,
  offerLinkSchema,
  passwordChangeSchema,
  productInputSchema,
  productListQuerySchema,
  searchTaskListQuerySchema,
  productPatchSchema,
  userCreateSchema,
  userPatchSchema,
  oneboundSettingsSchema,
  oneboundCandidateBatchSchema,
  oneboundRequestOptionsSchema,
  imageSearchSchema,
  googleSettingsSchema,
  searchTaskSyncSchema,
  searchTaskImportSchema,
  searchTaskRunSchema,
  aiSettingsSchema,
  aiCandidatesRequestSchema,
  shopifySettingsSchema,
  shopifyPublishSchema,
  shopifyProductListQuerySchema,
  shopifyProductUpdateSchema,
  shopifyProductTranslationsQuerySchema,
  shopifyProductTranslationAiSchema,
  shopifyProductTranslationPublishSchema,
} from "./validation";
import type { SearchTaskRunInput } from "./validation";

function methodNotAllowed(allowed: string[]): Response {
  return json(
    { ok: false, error: { code: "method_not_allowed", message: "请求方法不支持" } },
    405,
    { allow: allowed.join(", ") },
  );
}

const PUBLIC_IMAGE_SEARCH_PATH = "/api/public/onebound/image-search";
const PUBLIC_EXTENSION_ACCOUNT_PATH = "/api/public/extension/account";
const PUBLIC_EXTENSION_TASKS_PATH = "/api/public/extension/tasks";
const PUBLIC_EXTENSION_PRODUCTS_PATH = "/api/public/extension/products";
const PUBLIC_EXTENSION_STORES_PATH = "/api/public/extension/stores";
const PUBLIC_EXTENSION_CREDITS_PATH = "/api/public/extension/credits";
const PUBLIC_EXTENSION_AI_PATH = "/api/public/extension/ai-classify";
const PUBLIC_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function withPublicCors(request: Request, response: Response, env: Env): Response {
  const corsResponse = new Response(response.body, response);
  const origin = extensionOriginFromRequest(env, request);
  corsResponse.headers.set(
    "access-control-allow-origin",
    origin || allowedExtensionOrigins(env)[0] || "null",
  );
  corsResponse.headers.set(
    "access-control-allow-headers",
    "content-type, x-mailshop-client, x-mailshop-session, x-mailshop-extension-id",
  );
  corsResponse.headers.set("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  corsResponse.headers.set("access-control-allow-credentials", "true");
  corsResponse.headers.set("access-control-max-age", "86400");
  return corsResponse;
}

function stringFormValue(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" && value ? value : undefined;
}

async function handlePublicImageSearch(request: Request, env: Env): Promise<Response> {
  if (!extensionOriginFromRequest(env, request)) {
    throw new ApiError(403, "仅允许已配置的浏览器插件访问", "extension_origin_forbidden");
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.headers.get("x-mailshop-client") !== "extension") {
    throw new ApiError(403, "插件客户端标识无效", "extension_client_forbidden");
  }
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"]);
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
    throw new ApiError(415, "请使用 multipart/form-data 上传图片", "unsupported_media_type");
  }

  const maxBytes = Math.max(1_048_576, Number(env.MAX_IMAGE_BYTES) || 15_728_640);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes + 1_048_576) {
    throw new ApiError(413, "图片文件过大", "image_too_large", { maxBytes });
  }

  const user = await authenticate(request, env);
  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File)) throw new ApiError(422, "缺少 image 图片文件", "image_missing");
  if (!PUBLIC_IMAGE_TYPES.has(image.type.toLowerCase())) {
    throw new ApiError(415, "仅支持 JPG、PNG、WebP、GIF 或 AVIF 图片", "invalid_image_type");
  }
  if (!image.size || image.size > maxBytes) {
    throw new ApiError(image.size ? 413 : 422, image.size ? "图片文件过大" : "图片内容为空", image.size ? "image_too_large" : "image_empty", { maxBytes });
  }

  const options = imageSearchSchema.parse({
    sort: stringFormValue(form, "sort"),
    limit: stringFormValue(form, "limit"),
    cache: stringFormValue(form, "cache"),
    lang: stringFormValue(form, "lang"),
  });
  const charge = await chargeImageSearch(env, user.id, { source: "extension" });
  try {
    const result = await searchImageBytes(env, new Uint8Array(await image.arrayBuffer()), options);
    return json({
      ok: true,
      credits: { balance: charge.balance, charged: charge.cost },
      source: { name: image.name, contentType: image.type, size: image.size },
      ...result,
    });
  } catch (error) {
    await refundImageSearch(env, user.id, charge);
    throw error;
  }
}

function taskImage(task: Record<string, unknown>, imageId: string): { id: string; url: string } | null {
  const images = Array.isArray(task.images) ? task.images : [];
  const selected = images.find((item) => item && typeof item === "object" && !Array.isArray(item) && (item as Record<string, unknown>).id === imageId);
  if (!selected || typeof selected !== "object" || Array.isArray(selected)) return null;
  const url = (selected as Record<string, unknown>).url;
  return typeof url === "string" && url ? { id: imageId, url } : null;
}

function extensionSearchTask(task: Record<string, unknown>): Record<string, unknown> {
  const { legacyStatus, ...rest } = task;
  return { ...rest, status: typeof legacyStatus === "string" ? legacyStatus : task.status };
}

async function executeSearchTask(
  env: Env,
  userId: string,
  taskId: string,
  input: SearchTaskRunInput,
  source: "extension_task" | "server_task",
  imageBytes?: Uint8Array,
): Promise<{ task: Record<string, unknown> | null; credits: { balance: number; charged: number } }> {
  const task = await getSearchTask(env, userId, taskId);
  if (!task) throw new ApiError(404, "任务不存在", "search_task_not_found");
  const image = taskImage(task, input.imageId);
  if (!image) throw new ApiError(422, "所选图片不属于该任务", "search_task_image_not_found");
  const { imageId, ...options } = input;
  const runId = await startSearchTask(env, userId, taskId, imageId, image.url, options);
  if (!runId) throw new ApiError(409, "任务正在查询，请等待当前查询完成", "search_task_running");

  let charge: Awaited<ReturnType<typeof chargeImageSearch>> | null = null;
  try {
    charge = await chargeImageSearch(env, userId, { source, taskId, runId, imageId, page: options.page });
    const result = imageBytes
      ? await searchImageBytes(env, imageBytes, options)
      : await searchImageUrl(env, image.url, options);
    const storedResults = result.results.map((item) => ({
      offerId: item.offerId,
      title: item.title,
      imageUrl: item.imageUrl,
      detailUrl: item.detailUrl,
      price: item.price,
      promotionPrice: item.promotionPrice,
      sales: item.sales,
      supplierName: item.supplierName,
      location: item.location,
    }));
    const updatedTask = await completeSearchTask(env, userId, taskId, runId, {
      results: storedResults,
      resultCount: result.resultCount,
      totalResultCount: result.totalResultCount,
      uploadedImageId: result.uploadedImageId,
      chargedCredits: charge.cost,
    });
    return { task: updatedTask, credits: { balance: charge.balance, charged: charge.cost } };
  } catch (error) {
    if (charge) await refundImageSearch(env, userId, charge);
    await failSearchTask(env, userId, taskId, runId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function handlePublicExtensionAccount(request: Request, env: Env): Promise<Response> {
  if (!extensionOriginFromRequest(env, request)) {
    throw new ApiError(403, "仅允许已配置的浏览器插件访问", "extension_origin_forbidden");
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.headers.get("x-mailshop-client") !== "extension") {
    throw new ApiError(403, "插件客户端标识无效", "extension_client_forbidden");
  }
  if (request.method !== "GET") return methodNotAllowed(["GET", "OPTIONS"]);
  const user = await authenticate(request, env);
  return json({
    ok: true,
    user,
    credits: {
      balance: await getCreditBalance(env, user.id),
    },
  });
}

async function handlePublicExtensionTasks(request: Request, env: Env): Promise<Response> {
  if (!extensionOriginFromRequest(env, request)) {
    throw new ApiError(403, "仅允许已配置的浏览器插件访问", "extension_origin_forbidden");
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.headers.get("x-mailshop-client") !== "extension") {
    throw new ApiError(403, "插件客户端标识无效", "extension_client_forbidden");
  }
  const user = await authenticate(request, env);
  const url = new URL(request.url);
  if (url.pathname === PUBLIC_EXTENSION_TASKS_PATH) {
    if (request.method === "GET") {
      const query = searchTaskListQuerySchema.parse(parseQuery(url));
      const result = await listSearchTasks(env, user.id, query);
      return json({ ok: true, tasks: result.items.map(extensionSearchTask), page: result.page, pageSize: result.pageSize, total: result.total });
    }
    if (request.method === "POST") {
      const input = await readJson(request, searchTaskSyncSchema);
      return json({ ok: true, task: extensionSearchTask(await upsertSearchTask(env, user.id, input)) }, 201);
    }
    return methodNotAllowed(["GET", "POST", "OPTIONS"]);
  }

  const searchRoute = url.pathname.match(/^\/api\/public\/extension\/tasks\/([0-9a-f-]{36})\/search$/iu);
  if (searchRoute) {
    if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"]);
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
      throw new ApiError(415, "请使用 multipart/form-data 上传图片", "unsupported_media_type");
    }
    const maxBytes = Math.max(1_048_576, Number(env.MAX_IMAGE_BYTES) || 15_728_640);
    const form = await request.formData();
    const image = form.get("image");
    const imageId = stringFormValue(form, "imageId");
    if (!(image instanceof File)) throw new ApiError(422, "缺少 image 图片文件", "image_missing");
    if (!imageId) throw new ApiError(422, "缺少 imageId", "task_image_id_missing");
    if (!PUBLIC_IMAGE_TYPES.has(image.type.toLowerCase())) {
      throw new ApiError(415, "仅支持 JPG、PNG、WebP、GIF 或 AVIF 图片", "invalid_image_type");
    }
    if (!image.size || image.size > maxBytes) {
      throw new ApiError(image.size ? 413 : 422, image.size ? "图片文件过大" : "图片内容为空", image.size ? "image_too_large" : "image_empty", { maxBytes });
    }
    const input = searchTaskRunSchema.parse({
      imageId,
      sort: stringFormValue(form, "sort"),
      limit: stringFormValue(form, "limit"),
      page: stringFormValue(form, "page"),
      cache: stringFormValue(form, "cache"),
      lang: stringFormValue(form, "lang"),
      version: stringFormValue(form, "version"),
    });
    const result = await executeSearchTask(env, user.id, searchRoute[1], input, "extension_task", new Uint8Array(await image.arrayBuffer()));
    return json({ ok: true, ...result, task: result.task ? extensionSearchTask(result.task) : null });
  }

  const taskRoute = url.pathname.match(/^\/api\/public\/extension\/tasks\/([0-9a-f-]{36})$/iu);
  if (taskRoute) {
    if (request.method !== "DELETE") return methodNotAllowed(["DELETE", "OPTIONS"]);
    if (!(await deleteSearchTask(env, user.id, taskRoute[1]))) {
      throw new ApiError(404, "任务不存在", "search_task_not_found");
    }
    return json({ ok: true, deleted: true });
  }
  throw new ApiError(404, "接口不存在", "not_found");
}

async function handlePublicExtensionManagement(request: Request, env: Env): Promise<Response> {
  if (!extensionOriginFromRequest(env, request)) {
    throw new ApiError(403, "仅允许已配置的浏览器插件访问", "extension_origin_forbidden");
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.headers.get("x-mailshop-client") !== "extension") {
    throw new ApiError(403, "插件客户端标识无效", "extension_client_forbidden");
  }
  if (request.method !== "GET") return methodNotAllowed(["GET", "OPTIONS"]);
  const user = await authenticate(request, env);
  const url = new URL(request.url);
  if (url.pathname === PUBLIC_EXTENSION_PRODUCTS_PATH) {
    const query = productListQuerySchema.parse(parseQuery(url));
    return json({ ok: true, ...(await listProducts(env, query, user)) });
  }
  if (url.pathname === PUBLIC_EXTENSION_STORES_PATH) {
    const { stores } = await getShopifySettings(env, user.id);
    return json({
      ok: true,
      stores: stores.map(({ clientId: _clientId, clientSecret: _clientSecret, ...store }) => store),
    });
  }
  if (url.pathname === PUBLIC_EXTENSION_CREDITS_PATH) {
    return json({ ok: true, credits: { balance: await getCreditBalance(env, user.id), transactions: await listCreditTransactions(env, user.id) } });
  }
  throw new ApiError(404, "接口不存在", "not_found");
}

async function handlePublicExtensionAi(request: Request, env: Env): Promise<Response> {
  if (!extensionOriginFromRequest(env, request)) {
    throw new ApiError(403, "仅允许已配置的浏览器插件访问", "extension_origin_forbidden");
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.headers.get("x-mailshop-client") !== "extension") {
    throw new ApiError(403, "插件客户端标识无效", "extension_client_forbidden");
  }
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"]);
  const user = await authenticate(request, env);
  const input = await readJson(request, aiCandidatesRequestSchema);
  const serverAi = await getAiSettings(env);
  if (!serverAi.configured) throw new ApiError(503, "AI 模型尚未配置", "ai_not_configured");
  const charge = await chargeAiRequest(env, user.id, {
    source: "extension",
    stage: input.stage,
    candidateCount: input.candidates.length,
    regionCount: input.regionSnapshots.length,
  });
  try {
    const result = await classifyImageCandidates(env, input.candidates, input.pageSnapshot ?? null, input.stage, input.regionSnapshots);
    return json({ ok: true, credits: { balance: charge.balance, charged: charge.cost }, ...result });
  } catch (error) {
    await refundAiRequest(env, user.id, charge);
    throw error;
  }
}

async function handlePublicExtensionLogout(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!extensionOriginFromRequest(env, request)) {
    throw new ApiError(403, "仅允许已配置的浏览器插件访问", "extension_origin_forbidden");
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.headers.get("x-mailshop-client") !== "extension") {
    throw new ApiError(403, "插件客户端标识无效", "extension_client_forbidden");
  }
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"]);
  const user = await authenticate(request, env);
  await revokeSession(request, env);
  ctx.waitUntil(recordAudit(request, env, user.id, "auth.logout", "user", user.id));
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
}

function productRoute(pathname: string): { productId: string; suffix?: string; childId?: string } | null {
  const match = pathname.match(
    /^\/api\/products\/([0-9a-f-]{36})(?:\/(offers)(?:\/([0-9a-f-]{36}))?)?$/iu,
  );
  if (!match) return null;
  return { productId: match[1], suffix: match[2], childId: match[3] };
}

function productImageSearchRoute(pathname: string): { productId: string; imageId: string } | null {
  const match = pathname.match(/^\/api\/products\/([0-9a-f-]{36})\/images\/([0-9a-f-]{36})\/search$/iu);
  if (!match) return null;
  return { productId: match[1], imageId: match[2] };
}

function shopifyPublishRoute(pathname: string): { productId: string } | null {
  const match = pathname.match(/^\/api\/products\/([0-9a-f-]{36})\/shopify$/iu);
  return match ? { productId: match[1] } : null;
}

function shopifyStoreTestRoute(pathname: string): { storeId: string } | null {
  const match = pathname.match(/^\/api\/integrations\/shopify\/stores\/([0-9a-f-]{36})\/test$/iu);
  return match ? { storeId: match[1] } : null;
}

function shopifyStoreRoute(pathname: string): { storeId: string } | null {
  const match = pathname.match(/^\/api\/integrations\/shopify\/stores\/([0-9a-f-]{36})$/iu);
  return match ? { storeId: match[1] } : null;
}

function shopifyProductRoute(pathname: string): { storeId: string; productId?: string } | null {
  const match = pathname.match(/^\/api\/shopify\/stores\/([0-9a-f-]{36})\/products(?:\/([^/]+))?$/iu);
  if (!match) return null;
  return { storeId: match[1], productId: match[2] ? decodeURIComponent(match[2]) : undefined };
}

function shopifyProductTranslationRoute(pathname: string): { storeId: string; productId: string; action: "read" | "ai" | "publish" } | null {
  const match = pathname.match(/^\/api\/shopify\/stores\/([0-9a-f-]{36})\/products\/([^/]+)\/translations(?:\/(ai))?$/iu);
  if (!match) return null;
  return { storeId: match[1], productId: decodeURIComponent(match[2]), action: match[3] === "ai" ? "ai" : "read" };
}

function oneboundItemRoute(pathname: string): { offerId: string } | null {
  const match = pathname.match(/^\/api\/integrations\/onebound\/items\/([^/]+)$/u);
  if (!match) return null;
  try {
    return { offerId: decodeURIComponent(match[1]) };
  } catch {
    throw new ApiError(422, "1688 商品 ID 无效", "offer_id_invalid");
  }
}

function oneboundCandidateSaveRoute(pathname: string): { productId: string } | null {
  const match = pathname.match(/^\/api\/products\/([0-9a-f-]{36})\/offers\/onebound$/iu);
  return match ? { productId: match[1] } : null;
}

function storedOfferRoute(pathname: string): { offerId: string } | null {
  const match = pathname.match(/^\/api\/offers\/([^/]+)$/u);
  if (!match) return null;
  try {
    return { offerId: decodeURIComponent(match[1]) };
  } catch {
    throw new ApiError(422, "1688 商品 ID 无效", "offer_id_invalid");
  }
}

function userRoute(pathname: string): { userId: string; passwordRoute: boolean } | null {
  const match = pathname.match(/^\/api\/users\/([0-9a-f-]{36})(\/password)?$/iu);
  if (!match) return null;
  return { userId: match[1], passwordRoute: Boolean(match[2]) };
}

async function handleLogin(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const input = await readJson(request, loginSchema);
  await enforceLoginRateLimit(request, env, input.username);
  const user = await getLoginUser(env, input.username);
  const valid = Boolean(user && user.is_active === 1 && (await verifyPassword(input.password, user)));
  await recordLoginAttempt(request, env, input.username, valid);

  if (!user || !valid) {
    throw new ApiError(401, "账号或密码不正确", "invalid_credentials");
  }

  const session = await createSession(request, env, user.id);
  await env.DB.prepare(
    `UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
  )
    .bind(user.id)
    .run();
  ctx.waitUntil(
    env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(new Date().toISOString()),
      env.DB.prepare("DELETE FROM login_attempts WHERE created_at < ?").bind(
        new Date(Date.now() - 7 * 86_400_000).toISOString(),
      ),
    ]),
  );
  ctx.waitUntil(recordAudit(request, env, user.id, "auth.login", "user", user.id));

  return json(
    {
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        email: null,
        avatarUrl: null,
        credits: await getCreditBalance(env, user.id),
        role: user.role,
      },
      expiresAt: session.expiresAt,
    },
    200,
    { "set-cookie": session.cookie },
  );
}

async function handleBootstrap(request: Request, env: Env): Promise<Response> {
  const existing = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
  if ((existing?.count ?? 0) > 0) {
    throw new ApiError(409, "系统已经完成初始化", "already_bootstrapped");
  }

  const input = await readJson(request, bootstrapSchema);
  if (!(await secretsEqual(input.token, env.BOOTSTRAP_TOKEN))) {
    throw new ApiError(401, "初始化令牌无效", "invalid_bootstrap_token");
  }
  const userId = await insertUser(env, { ...input, role: "admin" });
  const session = await createSession(request, env, userId);
  await recordAudit(request, env, userId, "auth.bootstrap", "user", userId);
  return json(
    {
      ok: true,
      user: {
        id: userId,
        username: input.username,
        displayName: input.displayName,
        email: null,
        avatarUrl: null,
        credits: await getCreditBalance(env, userId),
        role: "admin",
      },
    },
    201,
    { "set-cookie": session.cookie },
  );
}

async function handleUpload(
  request: Request,
  env: Env,
  user: SessionUser,
  ctx: ExecutionContext,
): Promise<Response> {
  const maxBytes = Math.max(1_048_576, Number(env.MAX_IMAGE_BYTES) || 15_728_640);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (!contentLength) throw new ApiError(411, "上传请求必须包含 Content-Length", "length_required");
  if (contentLength > maxBytes + 1_048_576) {
    throw new ApiError(413, "图片文件过大", "image_too_large");
  }
  if (!(request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    throw new ApiError(415, "请使用 multipart/form-data 上传图片", "unsupported_media_type");
  }

  const form = await request.formData();
  const file = form.get("file");
  const productId = form.get("productId");
  if (!(file instanceof File) || typeof productId !== "string") {
    throw new ApiError(422, "缺少图片文件或商品 ID", "invalid_upload");
  }
  if (file.size > maxBytes) throw new ApiError(413, "图片文件过大", "image_too_large");

  await assertProductAccess(env, productId, user);

  const extensionByType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
  };
  const extension = extensionByType[file.type];
  if (!extension) throw new ApiError(415, "仅支持 JPG、PNG、WebP、GIF 或 AVIF", "invalid_image_type");

  const now = new Date();
  const key = `products/${productId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${extension}`;
  await env.PRODUCT_IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type, cacheControl: "private, max-age=3600" },
    customMetadata: { productId, originalName: file.name.slice(0, 500), uploadedBy: user.id },
  });

  try {
    const image = await addUploadedImage(env, {
      productId,
      r2Key: key,
      originalName: file.name.slice(0, 500),
      contentType: file.type,
    });
    ctx.waitUntil(recordAudit(request, env, user.id, "image.upload", "product", productId, { key }));
    return json({ ok: true, image }, 201);
  } catch (error) {
    await env.PRODUCT_IMAGES.delete(key);
    throw error;
  }
}

async function handleMedia(request: Request, env: Env, pathname: string): Promise<Response> {
  const user = await authenticate(request, env);
  let key: string;
  try {
    key = decodeURIComponent(pathname.slice("/media/".length));
  } catch {
    throw new ApiError(400, "图片地址无效", "invalid_media_key");
  }
  if (!key.startsWith("products/") || key.includes("..") || key.includes("\\")) {
    throw new ApiError(400, "图片地址无效", "invalid_media_key");
  }

  await assertMediaAccess(env, key, user);

  if (request.method === "HEAD") {
    const head = await env.PRODUCT_IMAGES.head(key);
    if (!head) throw new ApiError(404, "图片不存在", "media_not_found");
    const headers = new Headers();
    head.writeHttpMetadata(headers);
    headers.set("etag", head.httpEtag);
    headers.set("cache-control", "private, max-age=3600");
    return new Response(null, { headers });
  }
  if (request.method !== "GET") return methodNotAllowed(["GET", "HEAD"]);

  const object = await env.PRODUCT_IMAGES.get(key);
  if (!object) throw new ApiError(404, "图片不存在", "media_not_found");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=3600");
  headers.set("content-disposition", "inline");
  return new Response(object.body, { headers });
}

async function handleAuthenticatedApi(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
): Promise<Response> {
  const user = await authenticate(request, env);
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertSameOrigin(request);

  if (url.pathname === "/api/auth/me") {
    return request.method === "GET" ? json({ ok: true, user }) : methodNotAllowed(["GET"]);
  }
  if (url.pathname === "/api/credits") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return json({ ok: true, credits: { balance: await getCreditBalance(env, user.id), transactions: await listCreditTransactions(env, user.id) } });
  }
  if (url.pathname === "/api/auth/logout") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    await revokeSession(request, env);
    ctx.waitUntil(recordAudit(request, env, user.id, "auth.logout", "user", user.id));
    return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
  }
  if (url.pathname === "/api/dashboard") {
    return request.method === "GET"
      ? json({ ok: true, summary: await dashboardSummary(env, user) })
      : methodNotAllowed(["GET"]);
  }
  if (url.pathname === "/api/search-tasks") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    const query = searchTaskListQuerySchema.parse(parseQuery(url));
    const result = await listSearchTasks(env, user.id, query);
    return json({ ok: true, tasks: result.items, page: result.page, pageSize: result.pageSize, total: result.total });
  }
  const searchTaskRun = url.pathname.match(/^\/api\/search-tasks\/([0-9a-f-]{36})\/search$/iu);
  if (searchTaskRun) {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const input = await readJson(request, searchTaskRunSchema);
    const result = await executeSearchTask(env, user.id, searchTaskRun[1], input, "server_task");
    ctx.waitUntil(recordAudit(request, env, user.id, "search_task.query", "search_task", searchTaskRun[1], {
      imageId: input.imageId,
      page: input.page,
      limit: input.limit,
    }));
    return json({ ok: true, ...result });
  }
  const searchTaskImport = url.pathname.match(/^\/api\/search-tasks\/([0-9a-f-]{36})\/import$/iu);
  if (searchTaskImport) {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const input = await readJson(request, searchTaskImportSchema);
    const task = await getSearchTask(env, user.id, searchTaskImport[1]);
    if (!task) throw new ApiError(404, "Search task not found", "search_task_not_found");
    const runs = Array.isArray(task.runs) ? task.runs.filter((run): run is Record<string, unknown> => Boolean(run && typeof run === "object" && !Array.isArray(run))) : [];
    const selectedRuns = input.runId ? runs.filter((run) => run.id === input.runId) : runs;
    if (input.runId && selectedRuns.length === 0) throw new ApiError(422, "查询轮次不存在", "search_task_run_not_found");
    const results = selectedRuns.flatMap((run) => Array.isArray(run.results) ? run.results : []);
    const allowedOfferIds = new Set(
      results.flatMap((result) => {
        if (!result || typeof result !== "object" || Array.isArray(result)) return [];
        const offerId = (result as Record<string, unknown>).offerId;
        return typeof offerId === "string" && offerId.trim() ? [offerId.trim()] : [];
      }),
    );
    const offerIds = input.offerIds ?? [...allowedOfferIds];
    if (!offerIds.length) throw new ApiError(422, "查询任务中没有可导入的 1688 商品", "search_task_results_empty");
    const invalidOfferIds = offerIds.filter((offerId) => !allowedOfferIds.has(offerId));
    if (invalidOfferIds.length) {
      throw new ApiError(422, "只能导入当前查询任务的结果", "search_task_offer_not_found", { offerIds: invalidOfferIds });
    }
    const selectedRun = input.runId ? selectedRuns[0] : runs[0];
    const taskOptions = selectedRun?.options && typeof selectedRun.options === "object" && !Array.isArray(selectedRun.options)
      ? selectedRun.options as Record<string, unknown>
      : task.options && typeof task.options === "object" && !Array.isArray(task.options)
        ? task.options as Record<string, unknown>
      : {};
    const result = await importOneBoundProducts(
      env,
      offerIds,
      {
        cache: input.cache ?? (taskOptions.cache === "yes" ? "yes" : "no"),
        lang: input.lang ?? (taskOptions.lang === "en" ? "en" : taskOptions.lang === "ru" ? "ru" : "cn"),
      },
      user.id,
    );
    await recordSearchTaskImports(env, searchTaskImport[1], input.runId ?? null, result.imported);
    ctx.waitUntil(recordAudit(request, env, user.id, "search_task.products.import", "search_task", searchTaskImport[1], {
      offerIds,
      imported: result.imported.map((item) => item.offerId),
      failureCount: result.failures.length,
    }));
    return json({ ok: true, task: await getSearchTask(env, user.id, searchTaskImport[1]), ...result });
  }
  if (url.pathname === "/api/integrations/onebound") {
    if (request.method === "GET") return json({ ok: true, settings: await getOneBoundSettings(env) });
    if (request.method === "PUT") {
      assertAdmin(user);
      const input = await readJson(request, oneboundSettingsSchema);
      await saveOneBoundSettings(env, input, user.id);
      ctx.waitUntil(recordAudit(request, env, user.id, "integration.onebound.update", "settings", "onebound"));
      return json({ ok: true, settings: await getOneBoundSettings(env) });
    }
    return methodNotAllowed(["GET", "PUT"]);
  }
  if (url.pathname === "/api/integrations/google") {
    assertAdmin(user);
    if (request.method === "GET") return json({ ok: true, settings: await getGoogleSettings(env) });
    if (request.method === "PUT") {
      const input = await readJson(request, googleSettingsSchema);
      await saveGoogleSettings(env, input, user.id);
      ctx.waitUntil(recordAudit(request, env, user.id, "integration.google.update", "settings", "google"));
      return json({ ok: true, settings: await getGoogleSettings(env) });
    }
    return methodNotAllowed(["GET", "PUT"]);
  }
  if (url.pathname === "/api/integrations/ai") {
    assertAdmin(user);
    if (request.method === "GET") return json({ ok: true, settings: await getAiSettings(env) });
    if (request.method === "PUT") {
      const input = await readJson(request, aiSettingsSchema);
      await saveAiSettings(env, input, user.id);
      ctx.waitUntil(recordAudit(request, env, user.id, "integration.ai.update", "settings", "ai"));
      return json({ ok: true, settings: await getAiSettings(env) });
    }
    return methodNotAllowed(["GET", "PUT"]);
  }
  if (url.pathname === "/api/integrations/shopify") {
    if (request.method === "GET") return json({ ok: true, ...(await getShopifySettings(env, user.id)) });
    if (request.method === "PUT") {
      const input = await readJson(request, shopifySettingsSchema);
      const store = await saveShopifySettings(env, user.id, input);
      ctx.waitUntil(recordAudit(request, env, user.id, "integration.shopify.update", "shopify_store", store.id, { shopDomain: store.shopDomain }));
      return json({ ok: true, store });
    }
    return methodNotAllowed(["GET", "PUT"]);
  }
  const shopifyTranslationRoute = shopifyProductTranslationRoute(url.pathname);
  if (shopifyTranslationRoute) {
    if (request.method === "GET") {
      const query = shopifyProductTranslationsQuerySchema.parse(parseQuery(url));
      return json({ ok: true, ...(await getShopifyProductTranslations(env, user.id, shopifyTranslationRoute.storeId, shopifyTranslationRoute.productId, query.locale, query.marketId)) });
    }
    if (request.method === "POST" && shopifyTranslationRoute.action === "ai") {
      const parsed = await readJson(request, shopifyProductTranslationAiSchema);
      if (parsed.storeId !== shopifyTranslationRoute.storeId || parsed.productId !== shopifyTranslationRoute.productId) {
        throw new ApiError(422, "翻译请求的店铺或商品不匹配当前路由", "shopify_translation_resource_mismatch");
      }
      const current = await getShopifyProductTranslations(env, user.id, parsed.storeId, parsed.productId, parsed.locale, parsed.marketId);
      const translationIdentity = (resourceId: string, key: string) => `${resourceId}\u0000${key}`;
      const contentByKey = new Map(current.translatableContent.map((item) => [translationIdentity(item.resourceId, item.key), item] as const));
      const existingByKey = new Map(current.translations.map((item) => [translationIdentity(item.resourceId, item.key), item.value] as const));
      const fields = parsed.fields.map((field) => {
        const resourceId = field.resourceId || parsed.productId;
        const identity = translationIdentity(resourceId, field.key);
        const source = contentByKey.get(identity);
        if (!source) throw new ApiError(422, "Shopify 不允许翻译字段：" + field.key, "shopify_translation_key_invalid");
        return { ...field, resourceId: source.resourceId, resourceType: source.resourceType, resourceLabel: source.resourceLabel, sourceValue: source.value, existingValue: field.existingValue ?? existingByKey.get(identity), digest: source.digest };
      });
      const charge = await chargeAiRequest(env, user.id, { feature: "shopify_translation", storeId: parsed.storeId, productId: parsed.productId, locale: parsed.locale, fieldCount: fields.length });
      try {
        const result = await translateShopifyContent(env, { ...parsed, fields });
        return json({ ok: true, ...result, credits: { balance: charge.balance, charged: charge.cost } });
      } catch (error) {
        await refundAiRequest(env, user.id, charge).catch(() => undefined);
        throw error;
      }
    }
    if (request.method === "PUT") {
      const parsed = await readJson(request, shopifyProductTranslationPublishSchema);
      if (parsed.storeId !== shopifyTranslationRoute.storeId || parsed.productId !== shopifyTranslationRoute.productId) {
        throw new ApiError(422, "翻译发布请求的店铺或商品不匹配当前路由", "shopify_translation_resource_mismatch");
      }
      const result = await registerShopifyTranslations(env, user.id, parsed);
      ctx.waitUntil(recordAudit(request, env, user.id, "shopify_product.translation_publish", "shopify_product", parsed.productId, { storeId: parsed.storeId, locale: parsed.locale, fieldCount: parsed.translations.length }));
      return json({ ok: true, ...result });
    }
    return methodNotAllowed(["GET", "POST", "PUT"]);
  }
  const shopifyProduct = shopifyProductRoute(url.pathname);
  if (shopifyProduct) {
    if (!shopifyProduct.productId) {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      const query = shopifyProductListQuerySchema.parse({ ...parseQuery(url), storeId: shopifyProduct.storeId });
      return json({ ok: true, ...(await listShopifyProducts(env, user.id, query)) });
    }
    if (request.method === "GET") {
      return json({ ok: true, ...(await getShopifyProduct(env, user.id, shopifyProduct.storeId, shopifyProduct.productId)) });
    }
    if (request.method === "PATCH") {
      const input = await readJson(request, shopifyProductUpdateSchema);
      const result = await updateShopifyProduct(env, user.id, input);
      ctx.waitUntil(recordAudit(request, env, user.id, "shopify_product.update", "shopify_product", input.productId, { storeId: input.storeId }));
      return json({ ok: true, ...result });
    }
    if (request.method === "DELETE") {
      await deleteShopifyProduct(env, user.id, shopifyProduct.storeId, shopifyProduct.productId);
      ctx.waitUntil(recordAudit(request, env, user.id, "shopify_product.delete", "shopify_product", shopifyProduct.productId, { storeId: shopifyProduct.storeId }));
      return json({ ok: true, deleted: true });
    }
    return methodNotAllowed(["GET", "PATCH", "DELETE"]);
  }
  const shopifyStoreTest = shopifyStoreTestRoute(url.pathname);
  if (shopifyStoreTest) {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const store = await testShopifyStore(env, user.id, shopifyStoreTest.storeId);
    ctx.waitUntil(recordAudit(request, env, user.id, "integration.shopify.test", "shopify_store", store.id, { shopDomain: store.shopDomain }));
    return json({ ok: true, store });
  }
  const shopifyStore = shopifyStoreRoute(url.pathname);
  if (shopifyStore) {
    if (request.method !== "DELETE") return methodNotAllowed(["DELETE"]);
    await deleteShopifyStore(env, user.id, shopifyStore.storeId);
    ctx.waitUntil(recordAudit(request, env, user.id, "integration.shopify.delete", "shopify_store", shopifyStore.storeId));
    return json({ ok: true, deleted: true });
  }
  if (url.pathname === "/api/image-proxy") {
    return request.method === "GET"
      ? handleImageProxy(request, env)
      : methodNotAllowed(["GET"]);
  }
  const oneboundItem = oneboundItemRoute(url.pathname);
  if (oneboundItem) {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    const options = oneboundRequestOptionsSchema.parse(parseQuery(url));
    const forceRefresh = url.searchParams.get("fresh") === "1";
    const charge = await chargeProductDetail(env, user.id, {
      offerId: oneboundItem.offerId,
      cache: options.cache,
      lang: options.lang,
      forceRefresh,
    });
    try {
      const item = await getOneBoundItem(env, oneboundItem.offerId, options, forceRefresh);
      return json({ ok: true, credits: { balance: charge.balance, charged: charge.cost }, item });
    } catch (error) {
      await refundProductDetail(env, user.id, charge);
      throw error;
    }
  }
  if (url.pathname === "/api/uploads") {
    return request.method === "POST"
      ? handleUpload(request, env, user, ctx)
      : methodNotAllowed(["POST"]);
  }
  if (url.pathname === "/api/products") {
    if (request.method === "GET") {
      const query = productListQuerySchema.parse(parseQuery(url));
      return json({ ok: true, ...(await listProducts(env, query, user)) });
    }
    if (request.method === "POST") {
      const input = await readJson(request, productInputSchema);
      const productId = await upsertProduct(env, input, user.id, user);
      ctx.waitUntil(recordAudit(request, env, user.id, "product.create", "product", productId));
      return json({ ok: true, product: await getProduct(env, productId) }, 201);
    }
    return methodNotAllowed(["GET", "POST"]);
  }

  const storedOffer = storedOfferRoute(url.pathname);
  if (storedOffer) {
    await assertOfferAccess(env, storedOffer.offerId, user);
    return request.method === "GET"
      ? json({ ok: true, offer: await getStoredOfferDetail(env, storedOffer.offerId) })
      : methodNotAllowed(["GET"]);
  }

  const imageSearch = productImageSearchRoute(url.pathname);
  if (imageSearch) {
    await assertProductAccess(env, imageSearch.productId, user);
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const options = await readJson(request, imageSearchSchema);
    const charge = await chargeImageSearch(env, user.id, {
      source: "product",
      productId: imageSearch.productId,
      imageId: imageSearch.imageId,
    });
    let result: Awaited<ReturnType<typeof searchProductImage>>;
    try {
      result = await searchProductImage(env, imageSearch.productId, imageSearch.imageId, options);
    } catch (error) {
      await refundImageSearch(env, user.id, charge);
      throw error;
    }
    ctx.waitUntil(
      recordAudit(request, env, user.id, "product.image_search", "product", imageSearch.productId, {
        imageId: imageSearch.imageId,
        resultCount: result.resultCount,
      }),
    );
    return json({ ok: true, credits: { balance: charge.balance, charged: charge.cost }, ...result });
  }

  const shopifyPublish = shopifyPublishRoute(url.pathname);
  if (shopifyPublish) {
    await assertProductAccess(env, shopifyPublish.productId, user);
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const input = await readJson(request, shopifyPublishSchema);
    const publication = await publishProductToShopify(env, user.id, shopifyPublish.productId, input.storeId);
    ctx.waitUntil(recordAudit(request, env, user.id, "product.shopify.publish", "product", shopifyPublish.productId, {
      storeId: input.storeId,
      shopifyProductId: publication.productId,
      warnings: publication.warnings,
    }));
    return json({ ok: true, publication, product: await getProduct(env, shopifyPublish.productId) });
  }


  const candidateSave = oneboundCandidateSaveRoute(url.pathname);
  if (candidateSave) {
    await assertProductAccess(env, candidateSave.productId, user);
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const input = await readJson(request, oneboundCandidateBatchSchema);
    const result = await saveOneBoundCandidates(
      env,
      candidateSave.productId,
      input.offerIds,
      { cache: input.cache, lang: input.lang },
      user.id,
    );
    ctx.waitUntil(
      recordAudit(request, env, user.id, "onebound.candidates.save", "product", candidateSave.productId, {
        offerIds: input.offerIds,
        saved: result.saved.map((item) => item.offerId),
        failureCount: result.failures.length,
      }),
    );
    return json({ ok: true, ...result, product: await getProduct(env, candidateSave.productId) }, 201);
  }

  const product = productRoute(url.pathname);
  if (product && !product.suffix) {
    await assertProductAccess(env, product.productId, user);
    if (request.method === "GET") return json({ ok: true, product: await getProduct(env, product.productId) });
    if (request.method === "PATCH") {
      const patch = await readJson(request, productPatchSchema);
      await patchProduct(env, product.productId, patch);
      ctx.waitUntil(
        recordAudit(request, env, user.id, "product.update", "product", product.productId, {
          fields: Object.keys(patch),
        }),
      );
      return json({ ok: true, product: await getProduct(env, product.productId) });
    }
    if (request.method === "DELETE") {
      const r2Keys = await deleteProduct(env, product.productId);
      ctx.waitUntil(Promise.all(r2Keys.map((key) => env.PRODUCT_IMAGES.delete(key))));
      ctx.waitUntil(recordAudit(request, env, user.id, "product.delete", "product", product.productId));
      return json({ ok: true, deleted: true });
    }
    return methodNotAllowed(["GET", "PATCH", "DELETE"]);
  }
  if (product?.suffix === "offers" && !product.childId) {
    await assertProductAccess(env, product.productId, user);
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const input = await readJson(request, offerLinkSchema);
    const linkId = await upsertOfferLink(env, product.productId, input, user.id);
    ctx.waitUntil(
      recordAudit(request, env, user.id, "offer.link", "product", product.productId, {
        linkId,
        offerId: input.offer.offerId,
      }),
    );
    return json({ ok: true, linkId, product: await getProduct(env, product.productId) }, 201);
  }
  if (product?.suffix === "offers" && product.childId) {
    await assertProductAccess(env, product.productId, user);
    if (request.method !== "DELETE") return methodNotAllowed(["DELETE"]);
    await removeOfferLink(env, product.productId, product.childId);
    ctx.waitUntil(
      recordAudit(request, env, user.id, "offer.unlink", "product", product.productId, {
        linkId: product.childId,
      }),
    );
    return json({ ok: true, product: await getProduct(env, product.productId) });
  }

  if (url.pathname === "/api/users") {
    assertAdmin(user);
    if (request.method === "GET") return json({ ok: true, users: await listUsers(env) });
    if (request.method === "POST") {
      const input = await readJson(request, userCreateSchema);
      const userId = await insertUser(env, input);
      ctx.waitUntil(recordAudit(request, env, user.id, "user.create", "user", userId));
      return json({ ok: true, userId, users: await listUsers(env) }, 201);
    }
    return methodNotAllowed(["GET", "POST"]);
  }
  const targetUser = userRoute(url.pathname);
  if (targetUser?.passwordRoute) {
    assertAdmin(user);
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const input = await readJson(request, passwordChangeSchema);
    await replacePassword(env, targetUser.userId, input.password);
    ctx.waitUntil(recordAudit(request, env, user.id, "user.password_reset", "user", targetUser.userId));
    const headers = targetUser.userId === user.id ? { "set-cookie": clearSessionCookie() } : undefined;
    return json({ ok: true }, 200, headers);
  }
  if (targetUser) {
    assertAdmin(user);
    if (request.method !== "PATCH") return methodNotAllowed(["PATCH"]);
    const patch = await readJson(request, userPatchSchema);
    await patchUser(env, targetUser.userId, patch, user.id);
    ctx.waitUntil(recordAudit(request, env, user.id, "user.update", "user", targetUser.userId, patch));
    return json({ ok: true, users: await listUsers(env) });
  }

  throw new ApiError(404, "接口不存在", "not_found");
}

async function routeRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === PUBLIC_IMAGE_SEARCH_PATH) return handlePublicImageSearch(request, env);
  if (url.pathname === PUBLIC_EXTENSION_ACCOUNT_PATH) return handlePublicExtensionAccount(request, env);
  if (url.pathname === PUBLIC_EXTENSION_TASKS_PATH || url.pathname.startsWith(`${PUBLIC_EXTENSION_TASKS_PATH}/`)) return handlePublicExtensionTasks(request, env);
  if ([PUBLIC_EXTENSION_PRODUCTS_PATH, PUBLIC_EXTENSION_STORES_PATH, PUBLIC_EXTENSION_CREDITS_PATH].includes(url.pathname)) {
    return handlePublicExtensionManagement(request, env);
  }
  if (url.pathname === PUBLIC_EXTENSION_AI_PATH) return handlePublicExtensionAi(request, env);
  if (url.pathname === "/api/public/extension/logout") return handlePublicExtensionLogout(request, env, ctx);

  if (url.pathname === "/api/health") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return json({ ok: true, service: env.APP_NAME, time: new Date().toISOString() });
  }
  if (url.pathname === "/api/auth/config") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return json({ ok: true, googleEnabled: await googleLoginConfigured(env) });
  }
  if (url.pathname === "/api/auth/login") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    assertSameOrigin(request);
    return handleLogin(request, env, ctx);
  }
  if (url.pathname === "/api/auth/google") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return startGoogleLogin(request, env);
  }
  if (url.pathname === "/api/auth/google/callback") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return finishGoogleLogin(request, env);
  }
  if (url.pathname === "/api/auth/bootstrap") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    return handleBootstrap(request, env);
  }
  if (url.pathname === "/api/import/products") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    await assertIngestKey(request, env);
    const input = await readJson(request, productInputSchema);
    const productId = await upsertProduct(env, input, null);
    ctx.waitUntil(recordAudit(request, env, null, "crawler.product_upsert", "product", productId));
    return json({ ok: true, productId }, 201);
  }
  if (url.pathname === "/api/import/product-offers") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    await assertIngestKey(request, env);
    const input = await readJson(request, crawlerOfferLinkSchema);
    const linkId = await upsertOfferLink(env, input.productId, input, null);
    ctx.waitUntil(
      recordAudit(request, env, null, "crawler.offer_link", "product", input.productId, { linkId }),
    );
    return json({ ok: true, linkId }, 201);
  }
  if (url.pathname.startsWith("/media/")) return handleMedia(request, env, url.pathname);
  if (url.pathname.startsWith("/api/")) return handleAuthenticatedApi(request, env, ctx, url);

  const asset = await env.ASSETS.fetch(request);
  return asset.status === 404 && request.method === "GET"
    ? env.ASSETS.fetch(new Request(new URL("/", request.url), request))
    : asset;
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const startedAt = Date.now();
    const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
    try {
      const requestPath = new URL(request.url).pathname;
      const publicRequest = requestPath.startsWith("/api/public/extension/") || requestPath === PUBLIC_IMAGE_SEARCH_PATH;
      const routedResponse = await routeRequest(request, env, ctx);
      const response = publicRequest
        ? withPublicCors(request, withSecurityHeaders(routedResponse), env)
        : withSecurityHeaders(routedResponse);
      response.headers.set("x-request-id", requestId);
      console.log(
        JSON.stringify({
          level: "info",
          event: "request_complete",
          requestId,
          method: request.method,
          path: new URL(request.url).pathname,
          status: response.status,
          durationMs: Date.now() - startedAt,
          ip: clientIp(request),
        }),
      );
      return response;
    } catch (error) {
      const requestPath = new URL(request.url).pathname;
      const publicRequest = requestPath.startsWith("/api/public/extension/") || requestPath === PUBLIC_IMAGE_SEARCH_PATH;
      const errorResult = withSecurityHeaders(errorResponse(error));
      const response = publicRequest ? withPublicCors(request, errorResult, env) : errorResult;
      response.headers.set("x-request-id", requestId);
      return response;
    }
  },
} satisfies ExportedHandler<Env>;
