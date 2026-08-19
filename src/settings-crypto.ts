import { ApiError } from "./http";

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function encryptionKey(env: Env): Promise<CryptoKey> {
  const seed = env.SETTINGS_ENCRYPTION_KEY || env.BOOTSTRAP_TOKEN;
  if (!seed) throw new ApiError(500, "设置加密密钥未配置", "settings_encryption_key_missing");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSetting(env: Env, value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(env), new TextEncoder().encode(value));
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`;
}

export async function decryptSetting(env: Env, value: string, errorCode = "settings_invalid"): Promise<string> {
  const [ivText, encryptedText] = value.split(".");
  if (!ivText || !encryptedText) throw new ApiError(500, "设置配置已损坏", errorCode);
  try {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlToBytes(ivText) }, await encryptionKey(env), base64UrlToBytes(encryptedText));
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new ApiError(500, "设置配置无法解密", errorCode);
  }
}
