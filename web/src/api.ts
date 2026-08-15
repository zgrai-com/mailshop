type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "request_error",
    public readonly details?: unknown,
    public readonly requestId?: string | null,
    public readonly path?: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(path, { ...init, headers, credentials: "include" });
  const contentType = response.headers.get("content-type") ?? "";
  const rawBody = await response.text();
  let payload: (T & ApiErrorPayload) | undefined;
  if (contentType.includes("application/json") && rawBody) {
    try {
      payload = JSON.parse(rawBody) as T & ApiErrorPayload;
    } catch {
      payload = undefined;
    }
  }

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiClientError(
      response.status,
      error?.message ?? `请求失败（${response.status}）`,
      error?.code,
      error?.details ?? (rawBody ? { rawResponse: rawBody.slice(0, 20_000) } : undefined),
      response.headers.get("x-request-id"),
      path,
    );
  }
  return payload as T;
}

export function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const value = search.toString();
  return value ? `?${value}` : "";
}
