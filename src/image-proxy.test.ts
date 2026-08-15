import { describe, expect, it, vi } from "vitest";

import { handleImageProxy, validateImageProxyUrl } from "./image-proxy";

describe("image proxy", () => {
  it("accepts public HTTP image URLs", () => {
    expect(validateImageProxyUrl("https://cbu01.alicdn.com/example.jpg").hostname).toBe("cbu01.alicdn.com");
  });

  it.each([
    "file:///etc/passwd",
    "http://localhost/image.jpg",
    "http://127.0.0.1/image.jpg",
    "http://metadata.google.internal/image.jpg",
    "https://user:pass@example.com/image.jpg",
    "https://example.com:8443/image.jpg",
  ])("rejects unsafe URL %s", (url) => {
    expect(() => validateImageProxyUrl(url)).toThrowError(/图片地址/u);
  });

  it("returns a same-origin image response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "image/jpeg" },
    }));
    const response = await handleImageProxy(
      new Request("https://admin.example.com/api/image-proxy?url=https%3A%2F%2Fcbu01.alicdn.com%2Fimage.jpg"),
      { MAX_IMAGE_BYTES: "1024" },
      fetcher,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect((await response.arrayBuffer()).byteLength).toBe(3);
  });
});
