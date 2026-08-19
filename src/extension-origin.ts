import { ApiError } from "./http";

export function allowedExtensionOrigins(env: Env): string[] {
  return env.EXTENSION_ORIGIN.split(",").map((value) => value.trim()).filter(Boolean);
}

export function isAllowedExtensionOrigin(env: Env, origin: string | null): origin is string {
  return Boolean(origin && allowedExtensionOrigins(env).includes(origin));
}

export function extensionOriginFromRequest(env: Env, request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin) return isAllowedExtensionOrigin(env, origin) ? origin : null;
  const extensionId = request.headers.get("x-mailshop-extension-id")?.trim() || "";
  if (!/^[a-p]{32}$/u.test(extensionId)) return null;
  const extensionOrigin = `chrome-extension://${extensionId}`;
  return isAllowedExtensionOrigin(env, extensionOrigin) ? extensionOrigin : null;
}

export function extensionOriginForId(env: Env, extensionId: string): string {
  if (!/^[a-p]{32}$/u.test(extensionId)) {
    throw new ApiError(403, "浏览器插件 ID 无效", "extension_id_forbidden");
  }
  const origin = `chrome-extension://${extensionId}`;
  if (!isAllowedExtensionOrigin(env, origin)) {
    throw new ApiError(403, "浏览器插件未获授权", "extension_origin_forbidden");
  }
  return origin;
}
