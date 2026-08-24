import { createSession, type SessionUser } from "./auth";
import { ApiError } from "./http";
import { extensionOriginForId } from "./extension-origin";
import { decryptSetting, encryptSetting } from "./settings-crypto";

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const STATE_TTL_MS = 10 * 60_000;

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  hd?: string;
};

type GoogleSettingsRow = {
  google_client_id_ciphertext: string | null;
  google_client_secret_ciphertext: string | null;
  google_allowed_domain_ciphertext: string | null;
  updated_at: string | null;
};

type GoogleCredentials = { clientId: string; clientSecret: string; allowedDomain: string };

async function readSettingsRow(env: Env): Promise<GoogleSettingsRow | null> {
  return env.DB.prepare(
    `SELECT google_client_id_ciphertext, google_client_secret_ciphertext,
            google_allowed_domain_ciphertext, updated_at
       FROM integration_settings WHERE id = 1`,
  ).first<GoogleSettingsRow>();
}

export async function getGoogleSettings(env: Env): Promise<{
  configured: boolean;
  clientId: string | null;
  clientSecret: string | null;
  clientIdHint: string | null;
  allowedDomain: string;
  updatedAt: string | null;
}> {
  const row = await readSettingsRow(env);
  const configured = Boolean(row?.google_client_id_ciphertext && row.google_client_secret_ciphertext);
  let clientId: string | null = null;
  let clientSecret: string | null = null;
  let allowedDomain = "";
  if (configured && row?.google_client_id_ciphertext && row.google_client_secret_ciphertext) {
    [clientId, clientSecret] = await Promise.all([
      decryptSetting(env, row.google_client_id_ciphertext, "google_settings_invalid"),
      decryptSetting(env, row.google_client_secret_ciphertext, "google_settings_invalid"),
    ]);
  }
  if (row?.google_allowed_domain_ciphertext) {
    allowedDomain = await decryptSetting(env, row.google_allowed_domain_ciphertext, "google_settings_invalid");
  }
  const clientIdHint = clientId
    ? clientId.length > 18 ? `${clientId.slice(0, 12)}...${clientId.slice(-6)}` : "已加密保存"
    : null;
  return { configured, clientId, clientSecret, clientIdHint, allowedDomain, updatedAt: row?.updated_at ?? null };
}

export async function saveGoogleSettings(
  env: Env,
  input: { clientId: string; clientSecret: string; allowedDomain: string },
  userId: string,
): Promise<void> {
  const [clientId, clientSecret, allowedDomain] = await Promise.all([
    encryptSetting(env, input.clientId),
    encryptSetting(env, input.clientSecret),
    encryptSetting(env, input.allowedDomain),
  ]);
  await env.DB.prepare(
    `INSERT INTO integration_settings
      (id, google_client_id_ciphertext, google_client_secret_ciphertext,
       google_allowed_domain_ciphertext, updated_by, updated_at)
     VALUES (1, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(id) DO UPDATE SET
       google_client_id_ciphertext = excluded.google_client_id_ciphertext,
       google_client_secret_ciphertext = excluded.google_client_secret_ciphertext,
       google_allowed_domain_ciphertext = excluded.google_allowed_domain_ciphertext,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  ).bind(clientId, clientSecret, allowedDomain, userId).run();
}

async function readGoogleCredentials(env: Env): Promise<GoogleCredentials> {
  const row = await readSettingsRow(env);
  if (!row?.google_client_id_ciphertext || !row.google_client_secret_ciphertext) {
    throw new ApiError(503, "Google 登录尚未配置", "google_auth_not_configured");
  }
  return {
    clientId: await decryptSetting(env, row.google_client_id_ciphertext, "google_settings_invalid"),
    clientSecret: await decryptSetting(env, row.google_client_secret_ciphertext, "google_settings_invalid"),
    allowedDomain: row.google_allowed_domain_ciphertext
      ? await decryptSetting(env, row.google_allowed_domain_ciphertext, "google_settings_invalid")
      : "",
  };
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function randomToken(bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

function oauthRedirectUri(request: Request): string {
  return new URL("/api/auth/google/callback", new URL(request.url).origin).toString();
}

export async function startGoogleLogin(request: Request, env: Env): Promise<Response> {
  const credentials = await readGoogleCredentials(env);
  const requestUrl = new URL(request.url);
  const extensionLogin = requestUrl.searchParams.get("client") === "extension";
  const extensionId = requestUrl.searchParams.get("extension_id") || "";
  if (extensionLogin) extensionOriginForId(env, extensionId);
  const state = extensionLogin ? `ext.${extensionId}.${randomToken()}` : randomToken();
  const verifier = randomToken(48);
  const redirectUri = oauthRedirectUri(request);
  await env.DB.prepare(
    "INSERT INTO oauth_states (state_hash, code_verifier, redirect_uri, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(await sha256(state), verifier, redirectUri, new Date(Date.now() + STATE_TTL_MS).toISOString())
    .run();

  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: await sha256(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return Response.redirect(url.toString(), 302);
}

export async function googleLoginConfigured(env: Env): Promise<boolean> {
  const row = await readSettingsRow(env);
  return Boolean(row?.google_client_id_ciphertext && row.google_client_secret_ciphertext);
}

async function consumeState(env: Env, state: string): Promise<{ codeVerifier: string; redirectUri: string }> {
  const stateHash = await sha256(state);
  const row = await env.DB.prepare(
    "DELETE FROM oauth_states WHERE state_hash = ? AND expires_at > ? RETURNING code_verifier, redirect_uri",
  )
    .bind(stateHash, new Date().toISOString())
    .first<{ code_verifier: string; redirect_uri: string }>();
  if (!row) throw new ApiError(400, "Google 登录请求已失效，请重新登录", "invalid_oauth_state");
  return { codeVerifier: row.code_verifier, redirectUri: row.redirect_uri };
}

async function fetchGoogleUser(env: Env, code: string, state: string): Promise<GoogleUserInfo> {
  const saved = await consumeState(env, state);
  const credentials = await readGoogleCredentials(env);
  const tokenResponse = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: saved.redirectUri,
      grant_type: "authorization_code",
      code_verifier: saved.codeVerifier,
    }),
  });
  const token = await tokenResponse.json<{ access_token?: string; error?: string }>();
  if (!tokenResponse.ok || !token.access_token) {
    throw new ApiError(401, "Google 授权失败，请重试", "google_token_exchange_failed", { error: token.error });
  }
  const userResponse = await fetch(USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  const user = await userResponse.json<GoogleUserInfo>();
  if (!userResponse.ok || !user.sub || !user.email || user.email_verified !== true) {
    throw new ApiError(401, "无法验证 Google 账号邮箱", "google_user_invalid");
  }
  const allowedDomain = credentials.allowedDomain.trim().toLowerCase();
  if (allowedDomain && user.hd?.toLowerCase() !== allowedDomain) {
    throw new ApiError(403, `仅允许 ${allowedDomain} 账号登录`, "google_domain_not_allowed");
  }
  return user;
}

async function upsertGoogleUser(env: Env, google: Required<Pick<GoogleUserInfo, "sub" | "email">> & GoogleUserInfo): Promise<string> {
  let existing = await env.DB.prepare(
    "SELECT id, role, password_hash AS passwordHash FROM users WHERE google_sub = ?",
  ).bind(google.sub).first<{ id: string; role: "admin" | "user"; passwordHash: string }>();
  if (existing?.role === "admin" && existing.passwordHash) {
    await env.DB.prepare(
      "UPDATE users SET auth_provider = 'password', google_sub = NULL, email = NULL, avatar_url = NULL WHERE id = ?",
    ).bind(existing.id).run();
    existing = null;
  }
  if (!existing) {
    const emailMatch = await env.DB.prepare(
      "SELECT id, role, password_hash AS passwordHash FROM users WHERE email = ? COLLATE NOCASE OR username = ? COLLATE NOCASE",
    ).bind(google.email, google.email).first<{ id: string; role: "admin" | "user"; passwordHash: string }>();
    if (emailMatch && (emailMatch.role === "user" || !emailMatch.passwordHash)) existing = emailMatch;
    else if (emailMatch?.role === "admin" && emailMatch.passwordHash) {
      await env.DB.prepare("UPDATE users SET email = NULL WHERE id = ?").bind(emailMatch.id).run();
    }
  }
  const userId = existing?.id ?? crypto.randomUUID();
  const displayName = (google.name || google.email.split("@")[0]).slice(0, 120);
  if (existing) {
    await env.DB.prepare(
      `UPDATE users SET google_sub = ?, email = ?, display_name = ?, avatar_url = ?,
        auth_provider = 'google', is_active = 1, last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
    ).bind(google.sub, google.email, displayName, google.picture ?? null, userId).run();
    await env.DB.prepare("INSERT INTO credit_wallets (user_id, balance) VALUES (?, 10000) ON CONFLICT(user_id) DO NOTHING")
      .bind(userId)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO users
        (id, username, display_name, password_hash, password_salt, password_iterations, auth_provider, role, google_sub, email, avatar_url, last_login_at)
       VALUES (?, ?, ?, '', '', 100000, 'google', 'user', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    ).bind(userId, `google-${google.sub}`, displayName, google.sub, google.email, google.picture ?? null).run();
  }
  return userId;
}

export async function finishGoogleLogin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || url.searchParams.has("error")) {
    throw new ApiError(400, "Google 登录已取消或参数不完整", "google_login_cancelled");
  }
  const google = await fetchGoogleUser(env, code, state);
  const userId = await upsertGoogleUser(env, google as Required<Pick<GoogleUserInfo, "sub" | "email">> & GoogleUserInfo);
  const session = await createSession(request, env, userId);
  if (state.startsWith("ext.")) {
    const extensionId = state.split(".", 3)[1] || "";
    extensionOriginForId(env, extensionId);
    const callback = new URL(`https://${extensionId}.chromiumapp.org/mailshop`);
    callback.hash = new URLSearchParams({ session: session.token, expiresAt: session.expiresAt }).toString();
    return new Response(null, {
      status: 302,
      headers: { location: callback.toString(), "set-cookie": session.cookie },
    });
  }
  return new Response(null, { status: 302, headers: { location: "/", "set-cookie": session.cookie } });
}
