import type { ZodType } from "zod";
import { ZodError } from "zod";

const JSON_LIMIT_BYTES = 4 * 1024 * 1024;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "request_error",
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return json(
      { ok: false, error: { code: error.code, message: error.message, details: error.details } },
      error.status,
    );
  }

  if (error instanceof ZodError) {
    return json(
      {
        ok: false,
        error: {
          code: "validation_error",
          message: "提交的数据格式不正确",
          details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        },
      },
      422,
    );
  }

  const detail =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { value: String(error) };
  console.error(JSON.stringify({ level: "error", event: "unhandled_request_error", error: detail }));
  return json(
    { ok: false, error: { code: "internal_error", message: "服务暂时不可用，请稍后重试" } },
    500,
  );
}

async function readBodyWithLimit(request: Request, limit = JSON_LIMIT_BYTES): Promise<Uint8Array> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > limit) {
    throw new ApiError(413, "请求体过大", "payload_too_large");
  }

  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > limit) {
      await reader.cancel("payload too large");
      throw new ApiError(413, "请求体过大", "payload_too_large");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ApiError(415, "请使用 application/json 请求体", "unsupported_media_type");
  }

  const bytes = await readBodyWithLimit(request);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, "JSON 请求体无法解析", "invalid_json");
  }
  return schema.parse(value);
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  if (origin !== new URL(request.url).origin) {
    throw new ApiError(403, "跨站请求已被拒绝", "origin_mismatch");
  }
}

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "local";
}

export function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  secured.headers.set(
    "content-security-policy",
    "default-src 'self'; img-src 'self' https: data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-src https://1688.com https://*.1688.com https://*.alibaba.com; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  secured.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  secured.headers.set("x-content-type-options", "nosniff");
  secured.headers.set("x-frame-options", "DENY");
  secured.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  return secured;
}

export function parseQuery(url: URL): Record<string, string> {
  return Object.fromEntries(url.searchParams.entries());
}
