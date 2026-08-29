import { ApiError, clientIp } from "./http";

const COOKIE_NAME = "mailshop_session";
const PASSWORD_ITERATIONS = 100_000;

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  credits: number;
  role: "admin" | "user";
  authProvider?: "password" | "google";
  hasPassword?: boolean;
};

export function assertAdmin(user: SessionUser): void {
  if (user.role !== "admin") throw new ApiError(403, "需要管理员权限", "admin_required");
}

type UserCredentialRow = {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  is_active: number;
  role: "admin" | "user";
  auth_provider: "password" | "google";
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<{
  hash: string;
  salt: string;
  iterations: number;
}> {
  const salt = randomBytes(16);
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return { hash: bytesToBase64Url(hash), salt: bytesToBase64Url(salt), iterations: PASSWORD_ITERATIONS };
}

export async function verifyPassword(password: string, row: UserCredentialRow): Promise<boolean> {
  const expected = base64UrlToBytes(row.password_hash);
  const actual = await derivePassword(password, base64UrlToBytes(row.password_salt), row.password_iterations);
  return expected.byteLength === actual.byteLength && crypto.subtle.timingSafeEqual(expected, actual);
}

export async function secretsEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)]);
  return crypto.subtle.timingSafeEqual(
    new TextEncoder().encode(leftHash),
    new TextEncoder().encode(rightHash),
  );
}

function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    cookies.set(part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim()));
  }
  return cookies;
}

function sessionCookie(value: string, maxAge: number): string {
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;
}

export function clearSessionCookie(): string {
  return sessionCookie("", 0);
}

export async function authenticate(request: Request, env: Env): Promise<SessionUser> {
  const token = request.headers.get("x-mailshop-session") || parseCookies(request).get(COOKIE_NAME);
  if (!token) throw new ApiError(401, "请先登录", "unauthorized");

  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.email, u.avatar_url, u.role, u.auth_provider,
            u.google_sub, u.password_hash, w.balance
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN credit_wallets w ON w.user_id = u.id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1`,
  )
    .bind(tokenHash, new Date().toISOString())
    .first<{
      id: string;
      username: string;
      display_name: string;
      email: string | null;
      avatar_url: string | null;
      role: "admin" | "user";
      auth_provider: "password" | "google";
      google_sub: string | null;
      password_hash: string;
      balance: number;
    }>();

  if (!row) throw new ApiError(401, "登录状态已失效", "session_expired");
  if (row.role === "admin" && row.auth_provider === "google" && row.password_hash && row.google_sub && row.email) {
    const googleUserId = crypto.randomUUID();
    const googleUsername = `google-${row.google_sub}`;
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE users SET auth_provider = 'password', google_sub = NULL, email = NULL, avatar_url = NULL,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      ).bind(row.id),
      env.DB.prepare(
        `INSERT INTO users
          (id, username, display_name, password_hash, password_salt, password_iterations,
           auth_provider, role, google_sub, email, avatar_url, last_login_at)
         VALUES (?, ?, ?, '', '', 100000, 'google', 'user', ?, ?, ?,
           strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      ).bind(googleUserId, googleUsername, row.display_name, row.google_sub, row.email, row.avatar_url),
      env.DB.prepare("UPDATE sessions SET user_id = ? WHERE token_hash = ?").bind(googleUserId, tokenHash),
    ]);
    return {
      id: googleUserId,
      username: googleUsername,
      displayName: row.display_name,
      email: row.email,
      avatarUrl: row.avatar_url,
      credits: 10_000,
      role: "user",
      authProvider: "google",
      hasPassword: false,
    };
  }
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    avatarUrl: row.avatar_url,
    credits: row.balance,
    role: row.role,
    authProvider: row.auth_provider,
    hasPassword: Boolean(row.password_hash),
  };
}

export async function createSession(
  request: Request,
  env: Env,
  userId: string,
): Promise<{ cookie: string; expiresAt: string; token: string }> {
  const token = bytesToBase64Url(randomBytes(32));
  const tokenHash = await sha256(token);
  const ttlDays = Math.max(1, Math.min(30, Number(env.SESSION_TTL_DAYS) || 7));
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000).toISOString();
  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 500);

  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), userId, tokenHash, expiresAt, clientIp(request), userAgent)
    .run();

  return { cookie: sessionCookie(token, ttlDays * 86_400), expiresAt, token };
}

export async function revokeSession(request: Request, env: Env): Promise<void> {
  const token = request.headers.get("x-mailshop-session") || parseCookies(request).get(COOKIE_NAME);
  if (!token) return;
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export async function assertIngestKey(request: Request, env: Env): Promise<void> {
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!supplied || !(await secretsEqual(supplied, env.INGEST_API_KEY))) {
    throw new ApiError(401, "导入密钥无效", "invalid_ingest_key");
  }
}

export async function getLoginUser(env: Env, username: string): Promise<UserCredentialRow | null> {
  return env.DB.prepare(
    `SELECT id, username, display_name, email, avatar_url, password_hash, password_salt,
            password_iterations, is_active, role, auth_provider
       FROM users
      WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE
      LIMIT 1`,
  )
    .bind(username, username)
    .first<UserCredentialRow>();
}

export async function getUserCredential(env: Env, userId: string): Promise<UserCredentialRow | null> {
  return env.DB.prepare(
    `SELECT id, username, display_name, email, avatar_url, password_hash, password_salt,
            password_iterations, is_active, role, auth_provider
       FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first<UserCredentialRow>();
}

export async function enforceLoginRateLimit(
  request: Request,
  env: Env,
  username: string,
): Promise<void> {
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM login_attempts
      WHERE username = ? COLLATE NOCASE AND ip_address = ? AND succeeded = 0 AND created_at >= ?`,
  )
    .bind(username, clientIp(request), cutoff)
    .first<{ count: number }>();
  if ((row?.count ?? 0) >= 8) {
    throw new ApiError(429, "登录尝试过多，请 15 分钟后再试", "login_rate_limited");
  }
}

export async function recordLoginAttempt(
  request: Request,
  env: Env,
  username: string,
  succeeded: boolean,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO login_attempts (id, username, ip_address, succeeded) VALUES (?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), username, clientIp(request), succeeded ? 1 : 0)
    .run();
}

export async function insertUser(
  env: Env,
  input: { username: string; displayName: string; password: string; role?: "admin" | "user" },
): Promise<string> {
  const id = crypto.randomUUID();
  let password: Awaited<ReturnType<typeof hashPassword>>;
  try {
    password = await hashPassword(input.password);
  } catch (error) {
    const detail = error instanceof Error ? { name: error.name, message: error.message } : { value: String(error) };
    console.error(JSON.stringify({ level: "error", event: "password_hash_failed", error: detail }));
    throw new ApiError(500, "密码凭据创建失败", "password_hash_failed", detail);
  }
  try {
    await env.DB.prepare(
      `INSERT INTO users
        (id, username, display_name, password_hash, password_salt, password_iterations, role)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, input.username, input.displayName, password.hash, password.salt, password.iterations, input.role ?? "user")
      .run();
  } catch (error) {
    const detail = error instanceof Error ? { name: error.name, message: error.message } : { value: String(error) };
    console.error(JSON.stringify({ level: "error", event: "user_insert_failed", error: detail }));
    throw new ApiError(500, "账号记录创建失败", "user_insert_failed");
  }
  return id;
}

export async function replacePassword(env: Env, userId: string, password: string): Promise<void> {
  const record = await hashPassword(password);
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
    ).bind(record.hash, record.salt, record.iterations, userId),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
  ]);
}
