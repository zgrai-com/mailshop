import { ApiError } from "./http";
import { decryptSetting, encryptSetting } from "./settings-crypto";
import type { AiCandidate, AiSettingsInput } from "./validation";

type AiSettingsRow = {
  base_url_ciphertext: string | null;
  api_key_ciphertext: string | null;
  model_id_ciphertext: string | null;
  updated_at: string | null;
};

export type AiClassification = {
  id: string;
  keep: boolean;
  score: number;
  type: "product_main" | "product_detail" | "variant" | "non_product" | "unknown";
  productTitle: string | null;
  sku: string | null;
  reason: string | null;
};

let schemaReady: Promise<void> | null = null;

async function ensureSchema(env: Env): Promise<void> {
  if (!schemaReady) {
    schemaReady = env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS ai_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        base_url_ciphertext TEXT,
        api_key_ciphertext TEXT,
        model_id_ciphertext TEXT,
        updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )`,
    ).run().then(() => undefined);
  }
  await schemaReady;
}

async function readSettingsRow(env: Env): Promise<AiSettingsRow | null> {
  await ensureSchema(env);
  return env.DB.prepare(
    `SELECT base_url_ciphertext, api_key_ciphertext, model_id_ciphertext, updated_at
       FROM ai_settings WHERE id = 1`,
  ).first<AiSettingsRow>();
}

export async function getAiSettings(env: Env): Promise<{
  configured: boolean;
  baseUrl: string;
  apiKeyHint: string | null;
  modelId: string | null;
  updatedAt: string | null;
}> {
  const row = await readSettingsRow(env);
  const configured = Boolean(row?.base_url_ciphertext && row.api_key_ciphertext && row.model_id_ciphertext);
  if (!configured) return { configured: false, baseUrl: "", apiKeyHint: null, modelId: null, updatedAt: row?.updated_at ?? null };
  const [baseUrl, modelId, apiKey] = await Promise.all([
    decryptSetting(env, row!.base_url_ciphertext!, "ai_settings_invalid"),
    decryptSetting(env, row!.model_id_ciphertext!, "ai_settings_invalid"),
    decryptSetting(env, row!.api_key_ciphertext!, "ai_settings_invalid"),
  ]);
  return {
    configured: true,
    baseUrl,
    apiKeyHint: apiKey.length > 10 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : "已加密保存",
    modelId,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function saveAiSettings(env: Env, input: AiSettingsInput, userId: string): Promise<void> {
  await ensureSchema(env);
  const [baseUrl, apiKey, modelId] = await Promise.all([
    encryptSetting(env, input.baseUrl),
    encryptSetting(env, input.apiKey),
    encryptSetting(env, input.modelId),
  ]);
  await env.DB.prepare(
    `INSERT INTO ai_settings (id, base_url_ciphertext, api_key_ciphertext, model_id_ciphertext, updated_by, updated_at)
     VALUES (1, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(id) DO UPDATE SET
       base_url_ciphertext = excluded.base_url_ciphertext,
       api_key_ciphertext = excluded.api_key_ciphertext,
       model_id_ciphertext = excluded.model_id_ciphertext,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`,
  ).bind(baseUrl, apiKey, modelId, userId).run();
}

async function readCredentials(env: Env): Promise<AiSettingsInput> {
  const row = await readSettingsRow(env);
  if (!row?.base_url_ciphertext || !row.api_key_ciphertext || !row.model_id_ciphertext) {
    throw new ApiError(503, "AI 模型尚未配置", "ai_not_configured");
  }
  const [baseUrl, apiKey, modelId] = await Promise.all([
    decryptSetting(env, row.base_url_ciphertext, "ai_settings_invalid"),
    decryptSetting(env, row.api_key_ciphertext, "ai_settings_invalid"),
    decryptSetting(env, row.model_id_ciphertext, "ai_settings_invalid"),
  ]);
  return { baseUrl, apiKey, modelId };
}

function completionUrl(baseUrl: string): string {
  const value = baseUrl.replace(/\/+$/u, "");
  return /\/chat\/completions$/iu.test(value) ? value : `${value}/chat/completions`;
}

function fallbackClassification(candidate: AiCandidate): AiClassification {
  const ratio = candidate.width && candidate.height ? candidate.width * candidate.height : 0;
  const score = Math.max(0, Math.min(1, candidate.domScore + (ratio > 30_000 ? 0.08 : 0)));
  return {
    id: candidate.id,
    keep: score >= 0.35,
    score,
    type: score >= 0.65 ? "product_main" : score >= 0.35 ? "unknown" : "non_product",
    productTitle: candidate.title || candidate.alt || null,
    sku: null,
    reason: "页面结构预筛选",
  };
}

function parseModelJson(value: unknown): unknown {
  const text = typeof value === "string" ? value : Array.isArray(value) ? value.map((part) => typeof part === "string" ? part : (part as { text?: string })?.text || "").join("") : "";
  const cleaned = text.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  try { return JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
    }
    return null;
  }
}

export async function classifyImageCandidates(env: Env, candidates: AiCandidate[]): Promise<{
  configured: boolean;
  degraded: boolean;
  results: AiClassification[];
}> {
  let credentials: AiSettingsInput;
  try { credentials = await readCredentials(env); } catch (error) {
    if (error instanceof ApiError && error.code === "ai_not_configured") {
      return { configured: false, degraded: true, results: candidates.map(fallbackClassification) };
    }
    throw error;
  }

  const fallback = candidates.map(fallbackClassification);
  const prompt = [
    "你是电商页面图片筛选器。根据候选图片 URL、DOM 上下文和尺寸，返回严格 JSON 数组。",
    "只保留真实商品图片，排除 logo、头像、图标、广告、按钮和纯装饰图。",
    "type 只能是 product_main、product_detail、variant、non_product、unknown。",
    "sku 只有在上下文明确出现时填写，否则必须为 null，禁止猜测。",
    JSON.stringify(candidates.map(({ id, url, width, height, alt, title, source, context, domScore }) => ({ id, url, width, height, alt, title, source, context, domScore }))),
    '输出格式：[{"id","keep","score","type","productTitle","sku","reason"}]',
  ].join("\n");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    const response = await fetch(completionUrl(credentials.baseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${credentials.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: credentials.modelId,
        temperature: 0,
        max_tokens: 4_000,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...candidates.map((candidate) => ({ type: "image_url", image_url: { url: candidate.url, detail: "low" } }))] }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return { configured: true, degraded: true, results: fallback };
    const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const parsed = parseModelJson(payload.choices?.[0]?.message?.content);
    if (!Array.isArray(parsed)) return { configured: true, degraded: true, results: fallback };
    const byId = new Map(fallback.map((item) => [item.id, item]));
    for (const value of parsed) {
      if (!value || typeof value !== "object") continue;
      const item = value as Record<string, unknown>;
      const base = byId.get(String(item.id));
      if (!base) continue;
      base.keep = Boolean(item.keep);
      base.score = Math.max(0, Math.min(1, Number(item.score) || 0));
      base.type = ["product_main", "product_detail", "variant", "non_product", "unknown"].includes(String(item.type)) ? item.type as AiClassification["type"] : "unknown";
      base.productTitle = typeof item.productTitle === "string" ? item.productTitle.slice(0, 500) : null;
      base.sku = typeof item.sku === "string" ? item.sku.slice(0, 160) : null;
      base.reason = typeof item.reason === "string" ? item.reason.slice(0, 500) : null;
    }
    return { configured: true, degraded: false, results: [...byId.values()] };
  } catch {
    return { configured: true, degraded: true, results: fallback };
  }
}
