import { describe, expect, it } from "vitest";

import { assertAdmin, type SessionUser } from "./auth";

function user(role: SessionUser["role"]): SessionUser {
  return {
    id: "user-1",
    username: "user@example.com",
    displayName: "User",
    email: "user@example.com",
    avatarUrl: null,
    credits: 10_000,
    role,
  };
}

describe("assertAdmin", () => {
  it("allows administrators", () => {
    expect(() => assertAdmin(user("admin"))).not.toThrow();
  });

  it("rejects ordinary users", () => {
    expect(() => assertAdmin(user("user"))).toThrowError("需要管理员权限");
  });
});
