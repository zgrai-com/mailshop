import { ApiError } from "./http";

const MAX_REDIRECTS = 3;
const DEFAULT_MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const PRIVATE_HOST_SUFFIXES = [".internal", ".lan", ".local", ".localhost", ".home"];
type ImageProxyEnv = { MAX_IMAGE_BYTES: string };

function maxImageBytes(env: ImageProxyEnv): number {
  const configured = Number(env.MAX_IMAGE_BYTES);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_IMAGE_BYTES;
}

function isIpLiteral(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname) || hostname.includes(":") || hostname.startsWith("[");
}

export function validateImageProxyUrl(value: string | null): URL {
  if (!value || value.length > 4_096) {
    throw new ApiError(422, "图片地址无效", "image_proxy_url_invalid");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(422, "图片地址无效", "image_proxy_url_invalid");
  }

  const hostname = url.hostname.toLowerCase();
  const unsafeHost =
    !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname === "metadata.google.internal" ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) ||
    isIpLiteral(hostname);

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port)) ||
    unsafeHost
  ) {
    throw new ApiError(422, "图片地址不允许代理", "image_proxy_url_not_allowed", { hostname });
  }

  return url;
}

async function readImageBytes(response: Response, limit: number): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > limit) {
    await response.body?.cancel("image response too large");
    throw new ApiError(413, "远程图片过大", "image_proxy_too_large", { maxBytes: limit, contentLength });
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > limit) {
      await reader.cancel("image response too large");
      throw new ApiError(413, "远程图片过大", "image_proxy_too_large", { maxBytes: limit, receivedBytes: received });
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function normalizedImageType(value: string | null): string | null {
  const contentType = value?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
  if (!contentType || contentType === "image/svg+xml") return null;
  return ["image/avif", "image/bmp", "image/gif", "image/jpeg", "image/png", "image/webp"].includes(contentType)
    ? contentType
    : null;
}

export async function handleImageProxy(
  request: Request,
  env: ImageProxyEnv,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  let target = validateImageProxyUrl(new URL(request.url).searchParams.get("url"));

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetcher(target, {
      headers: {
        accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8",
        referer: `${target.origin}/`,
      },
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel("following image redirect");
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new ApiError(502, "远程图片重定向失败", "image_proxy_redirect_failed", {
          upstreamStatus: response.status,
          imageHost: target.hostname,
        });
      }
      target = validateImageProxyUrl(new URL(location, target).href);
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel("remote image request failed");
      throw new ApiError(502, "远程图片加载失败", "image_proxy_upstream_failed", {
        upstreamStatus: response.status,
        imageHost: target.hostname,
      });
    }

    const contentType = normalizedImageType(response.headers.get("content-type"));
    if (!contentType) {
      await response.body?.cancel("unexpected image content type");
      throw new ApiError(502, "远程地址返回的不是可显示图片", "image_proxy_invalid_content_type", {
        contentType: response.headers.get("content-type"),
        imageHost: target.hostname,
      });
    }

    const bytes = await readImageBytes(response, maxImageBytes(env));
    return new Response(bytes, {
      headers: {
        "cache-control": "private, max-age=86400",
        "content-disposition": "inline",
        "content-length": String(bytes.byteLength),
        "content-type": contentType,
        "vary": "Cookie",
      },
    });
  }

  throw new ApiError(502, "远程图片加载失败", "image_proxy_upstream_failed");
}
