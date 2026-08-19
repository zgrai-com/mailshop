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
import { chargeImageSearch, getCreditBalance, listCreditTransactions, refundImageSearch } from "./credits";
import { finishGoogleLogin, getGoogleSettings, googleLoginConfigured, saveGoogleSettings, startGoogleLogin } from "./google-auth";
import {
  addUploadedImage,
  assertMediaAccess,
  assertOfferAccess,
  assertProductAccess,
  dashboardSummary,
  getProduct,
  getStoredOfferDetail,
  listProducts,
  listUsers,
  patchProduct,
  patchUser,
  recordAudit,
  listSearchTasks,
  upsertSearchTask,
  removeOfferLink,
  upsertOfferLink,
  upsertProduct,
} from "./db";
import {
  getOneBoundItem,
  getOneBoundSettings,
  saveOneBoundCandidates,
  saveOneBoundSettings,
  searchImageBytes,
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
import { classifyImageCandidates, getAiSettings, saveAiSettings } from "./ai";
import { allowedExtensionOrigins, extensionOriginFromRequest } from "./extension-origin";
import {
  bootstrapSchema,
  crawlerOfferLinkSchema,
  loginSchema,
  offerLinkSchema,
  passwordChangeSchema,
  productInputSchema,
  productListQuerySchema,
  productPatchSchema,
  userCreateSchema,
  userPatchSchema,
  oneboundSettingsSchema,
  oneboundCandidateBatchSchema,
  oneboundRequestOptionsSchema,
  imageSearchSchema,
  googleSettingsSchema,
  searchTaskSyncSchema,
  aiSettingsSchema,
  aiCandidatesRequestSchema,
} from "./validation";

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
  corsResponse.headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
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
      transactions: await listCreditTransactions(env, user.id),
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
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"]);
  const user = await authenticate(request, env);
  const input = await readJson(request, searchTaskSyncSchema);
  return json({ ok: true, task: await upsertSearchTask(env, user.id, input) });
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
  await authenticate(request, env);
  const input = await readJson(request, aiCandidatesRequestSchema);
  const result = await classifyImageCandidates(env, input.candidates);
  return json({ ok: true, ...result });
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
    return request.method === "GET"
      ? json({ ok: true, tasks: await listSearchTasks(env, user.id) })
      : methodNotAllowed(["GET"]);
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
  if (url.pathname === "/api/image-proxy") {
    return request.method === "GET"
      ? handleImageProxy(request, env)
      : methodNotAllowed(["GET"]);
  }
  const oneboundItem = oneboundItemRoute(url.pathname);
  if (oneboundItem) {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    const options = oneboundRequestOptionsSchema.parse(parseQuery(url));
    return json({ ok: true, item: await getOneBoundItem(env, oneboundItem.offerId, options) });
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
      await patchProduct(env, product.productId, { status: "archived" });
      ctx.waitUntil(recordAudit(request, env, user.id, "product.archive", "product", product.productId));
      return json({ ok: true });
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
  if (url.pathname === PUBLIC_EXTENSION_TASKS_PATH) return handlePublicExtensionTasks(request, env);
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
      const publicRequest = [PUBLIC_IMAGE_SEARCH_PATH, PUBLIC_EXTENSION_ACCOUNT_PATH, PUBLIC_EXTENSION_TASKS_PATH, PUBLIC_EXTENSION_AI_PATH, "/api/public/extension/logout"].includes(
        new URL(request.url).pathname,
      );
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
      const publicRequest = [PUBLIC_IMAGE_SEARCH_PATH, PUBLIC_EXTENSION_ACCOUNT_PATH, PUBLIC_EXTENSION_TASKS_PATH, PUBLIC_EXTENSION_AI_PATH, "/api/public/extension/logout"].includes(
        new URL(request.url).pathname,
      );
      const errorResult = withSecurityHeaders(errorResponse(error));
      const response = publicRequest ? withPublicCors(request, errorResult, env) : errorResult;
      response.headers.set("x-request-id", requestId);
      return response;
    }
  },
} satisfies ExportedHandler<Env>;
