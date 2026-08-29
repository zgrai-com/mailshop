import { describe, expect, it } from "vitest";

import { normalizeTaskUrl } from "./task-url";

describe("normalizeTaskUrl", () => {
  it("normalizes host, default ports, fragments and trailing slashes", () => {
    expect(normalizeTaskUrl(" HTTPS://Example.COM:443/products/dress///#details "))
      .toBe("https://example.com/products/dress");
  });

  it("rejects empty and non-http URLs", () => {
    expect(normalizeTaskUrl("")).toBeNull();
    expect(normalizeTaskUrl("ftp://example.com/item")).toBeNull();
  });
});
