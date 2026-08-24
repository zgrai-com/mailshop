import { ImagePlus, KeyRound, Languages, LoaderCircle, MessageCircle, Plus, RefreshCw, Save, ShieldCheck, Store } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import type { AiSettings, GoogleSettings, OneBoundSettings, ShopifyStore } from "../types";

type Props = {
  onebound: OneBoundSettings | null;
  google: GoogleSettings | null;
  ai: AiSettings | null;
  shopifyStores: ShopifyStore[];
  loading: boolean;
  saving: boolean;
  onSaveOneBound: (key: string, secret: string) => Promise<void>;
  onSaveGoogle: (clientId: string, clientSecret: string, allowedDomain: string) => Promise<void>;
  onSaveAi: (scope: "image_filter" | "chat" | "translation" | "image_generation", baseUrl: string, apiKey: string, modelId: string) => Promise<void>;
  onSaveShopify: (shopDomain: string, displayName: string, clientId: string, clientSecret: string) => Promise<void>;
  onTestShopify: (storeId: string) => Promise<void>;
};

export function SettingsPage({ onebound, google, ai, shopifyStores, loading, saving, onSaveOneBound, onSaveGoogle, onSaveAi, onSaveShopify, onTestShopify }: Props) {
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [allowedDomain, setAllowedDomain] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModelId, setAiModelId] = useState("");
  const [chatBaseUrl, setChatBaseUrl] = useState("");
  const [chatApiKey, setChatApiKey] = useState("");
  const [chatModelId, setChatModelId] = useState("");
  const [translationBaseUrl, setTranslationBaseUrl] = useState("");
  const [translationApiKey, setTranslationApiKey] = useState("");
  const [translationModelId, setTranslationModelId] = useState("");
  const [imageGenerationBaseUrl, setImageGenerationBaseUrl] = useState("");
  const [imageGenerationApiKey, setImageGenerationApiKey] = useState("");
  const [imageGenerationModelId, setImageGenerationModelId] = useState("");
  const [shopDomain, setShopDomain] = useState("");
  const [shopDisplayName, setShopDisplayName] = useState("");
  const [shopClientId, setShopClientId] = useState("");
  const [shopClientSecret, setShopClientSecret] = useState("");
  const [selectedShopifyStoreId, setSelectedShopifyStoreId] = useState<string | null>(null);
  const [newStoreMode, setNewStoreMode] = useState(false);
  const shopify = newStoreMode ? null : shopifyStores.find((store) => store.id === selectedShopifyStoreId) ?? null;
  const imageFilter = ai?.imageFilter ?? ai;
  useEffect(() => { setKey(""); setSecret(""); }, [onebound?.updatedAt]);
  useEffect(() => {
    setClientId("");
    setClientSecret("");
    setAllowedDomain(google?.allowedDomain ?? "");
  }, [google?.updatedAt, google?.allowedDomain]);
  useEffect(() => {
    const imageFilter = ai?.imageFilter ?? ai;
    setAiBaseUrl(imageFilter?.baseUrl ?? "");
    setAiApiKey("");
    setAiModelId(imageFilter?.modelId ?? "");
  }, [ai?.updatedAt, ai?.baseUrl, ai?.modelId, ai?.imageFilter?.baseUrl, ai?.imageFilter?.modelId]);
  useEffect(() => {
    setChatBaseUrl(ai?.chat?.baseUrl ?? "");
    setChatApiKey("");
    setChatModelId(ai?.chat?.modelId ?? "");
  }, [ai?.updatedAt, ai?.chat?.baseUrl, ai?.chat?.modelId]);
  useEffect(() => {
    setTranslationBaseUrl(ai?.translation?.baseUrl ?? "");
    setTranslationApiKey("");
    setTranslationModelId(ai?.translation?.modelId ?? "");
  }, [ai?.updatedAt, ai?.translation?.baseUrl, ai?.translation?.modelId]);
  useEffect(() => {
    setImageGenerationBaseUrl(ai?.imageGeneration?.baseUrl ?? "");
    setImageGenerationApiKey("");
    setImageGenerationModelId(ai?.imageGeneration?.modelId ?? "");
  }, [ai?.updatedAt, ai?.imageGeneration?.baseUrl, ai?.imageGeneration?.modelId]);
  useEffect(() => {
    const firstStore = shopifyStores[0] ?? null;
    if (!newStoreMode && (!selectedShopifyStoreId || !shopifyStores.some((store) => store.id === selectedShopifyStoreId))) {
      setSelectedShopifyStoreId(firstStore?.id ?? null);
    }
  }, [newStoreMode, selectedShopifyStoreId, shopifyStores]);
  useEffect(() => {
    setShopDomain(shopify?.shopDomain ?? "");
    setShopDisplayName(shopify?.displayName ?? "");
    setShopClientId("");
    setShopClientSecret("");
  }, [shopify?.id, shopify?.updatedAt, shopify?.shopDomain, shopify?.displayName]);
  async function submitOneBound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSaveOneBound(key, secret);
    setKey("");
    setSecret("");
  }

  async function submitGoogle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSaveGoogle(clientId, clientSecret, allowedDomain);
    setClientId("");
    setClientSecret("");
  }

  async function submitAi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSaveAi("image_filter", aiBaseUrl, aiApiKey, aiModelId);
    setAiApiKey("");
  }

  async function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSaveAi("chat", chatBaseUrl, chatApiKey, chatModelId);
    setChatApiKey("");
  }

  async function submitTranslation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSaveAi("translation", translationBaseUrl, translationApiKey, translationModelId);
    setTranslationApiKey("");
  }

  async function submitImageGeneration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSaveAi("image_generation", imageGenerationBaseUrl, imageGenerationApiKey, imageGenerationModelId);
    setImageGenerationApiKey("");
  }

  async function submitShopify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSaveShopify(shopDomain, shopDisplayName, shopClientId, shopClientSecret);
    setNewStoreMode(false);
    setShopClientId("");
    setShopClientSecret("");
  }

  function selectStore(store: ShopifyStore) {
    setNewStoreMode(false);
    setSelectedShopifyStoreId(store.id);
    setShopDomain(store.shopDomain);
    setShopDisplayName(store.displayName ?? "");
    setShopClientId("");
    setShopClientSecret("");
  }

  return (
    <section className="settings-view">
      <header className="page-heading"><div><span>INTEGRATIONS</span><h1>系统设置</h1><p>管理登录认证与外部商品搜索服务</p></div></header>
      {loading ? <div className="page-loading settings-loading"><LoaderCircle className="spin" size={21} />加载设置</div> : (
        <div className="settings-stack">
          <section className="settings-panel">
            <div className="settings-panel-header">
              <div className="settings-title"><span className="settings-icon"><Store size={19} /></span><div><span>SHOPIFY ADMIN API</span><h2>Shopify 商品发布</h2></div></div>
              <span className="integration-status"><i />{shopifyStores.length} 个店铺</span>
            </div>
            <form className="settings-form" onSubmit={submitShopify}>
              <p className="settings-help">每个用户可以管理多个 Shopify 店铺。凭据使用 Shopify Dev Dashboard 应用的 Client ID 和 Client Secret，商品以草稿状态写入目标店铺。</p>
              {shopifyStores.length > 0 && <div className="shopify-store-list">{shopifyStores.map((store) => <button className={`shopify-store-row ${store.id === shopify?.id ? "selected" : ""}`} key={store.id} type="button" onClick={() => selectStore(store)}><span className={`integration-status ${store.status === "active" ? "configured" : "not-configured"}`}><i /></span><span><strong>{store.displayName || store.shopDomain}</strong><small>{store.shopDomain}</small></span><em>{store.status === "active" ? "连接正常" : store.configured ? "待测试" : "未配置"}</em></button>)}</div>}
              <div className="form-grid two-columns">
                <label><span>店铺域名</span><input value={shopDomain} onChange={(event) => setShopDomain(event.target.value)} placeholder="example.myshopify.com" autoComplete="off" required /></label>
                <label><span>店铺名称</span><input value={shopDisplayName} onChange={(event) => setShopDisplayName(event.target.value)} placeholder="选填" autoComplete="off" /></label>
                <label><span>Client ID</span><input value={shopClientId} onChange={(event) => setShopClientId(event.target.value)} placeholder={shopify?.configured ? "已配置，输入新值可替换" : "Shopify App Client ID"} autoComplete="off" required /></label>
                <label><span>Client Secret</span><input type="password" value={shopClientSecret} onChange={(event) => setShopClientSecret(event.target.value)} placeholder={shopify?.configured ? "已配置，输入新值可替换" : "Shopify App Client Secret"} autoComplete="new-password" required /></label>
              </div>
              {shopify?.lastError && <p className="settings-error">{shopify.lastError}</p>}
              <div className="settings-footer">
                <span className="settings-meta"><ShieldCheck size={15} />{shopify?.configured ? `${shopify.clientIdHint ?? "已保存"}${shopify.lastVerifiedAt ? ` · 验证于 ${new Date(shopify.lastVerifiedAt).toLocaleString("zh-CN")}` : ""}` : "尚未保存 Shopify 应用凭据"}</span>
                <div className="settings-actions">
                  {shopify?.configured && <button className="button quiet" type="button" onClick={() => onTestShopify(shopify.id)} disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}测试连接</button>}
                  <button className="button quiet" type="button" onClick={() => { setNewStoreMode(true); setSelectedShopifyStoreId(null); setShopDomain(""); setShopDisplayName(""); setShopClientId(""); setShopClientSecret(""); }}><Plus size={16} />新增店铺</button>
                  <button className="button primary" type="submit" disabled={saving || !shopDomain.trim() || !shopClientId.trim() || !shopClientSecret.trim()}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? "保存中" : "保存 Shopify 配置"}</button>
                </div>
              </div>
            </form>
          </section>

          <section className="settings-panel">
            <div className="settings-panel-header">
              <div className="settings-title"><span className="settings-icon"><Languages size={19} /></span><div><span>AI TRANSLATION</span><h2>商品多语言翻译</h2></div></div>
              <span className={`integration-status ${ai?.translation?.configured ? "configured" : "not-configured"}`}><i />{ai?.translation?.configured ? "已配置" : "未配置"}</span>
            </div>
            <form className="settings-form" onSubmit={submitTranslation}>
              <p className="settings-help">为 Shopify 商品多语言翻译单独配置 AI 服务。支持兼容 OpenAI Chat Completions 或 Responses 的接口，不影响图片识别和 AI 对话配置。</p>
              <div className="form-grid two-columns">
                <label className="field-span-2"><span>模型服务 URL</span><input value={translationBaseUrl} onChange={(event) => setTranslationBaseUrl(event.target.value)} placeholder="例如 https://api.openai.com/v1" autoComplete="off" required /></label>
                <label><span>API Key</span><input type="password" value={translationApiKey} onChange={(event) => setTranslationApiKey(event.target.value)} placeholder={ai?.translation?.configured ? "已配置，输入新 Key 可替换" : "输入翻译模型 API Key"} autoComplete="new-password" required /></label>
                <label><span>模型 ID</span><input value={translationModelId} onChange={(event) => setTranslationModelId(event.target.value)} placeholder="例如 gpt-4o-mini" autoComplete="off" required /></label>
              </div>
              <div className="settings-footer"><span className="settings-meta"><ShieldCheck size={15} />{ai?.translation?.configured ? `${ai.translation.apiKeyHint ?? "已加密保存"}${ai.translation.updatedAt ? ` · 更新于 ${new Date(ai.translation.updatedAt).toLocaleString("zh-CN")}` : ""}` : "尚未保存 AI 翻译配置"}</span><button className="button primary" type="submit" disabled={saving || !translationBaseUrl.trim() || !translationApiKey.trim() || !translationModelId.trim()}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? "保存中" : "保存 AI 翻译配置"}</button></div>
            </form>
          </section>

          <section className="settings-panel">
            <div className="settings-panel-header">
              <div className="settings-title"><span className="settings-icon"><MessageCircle size={19} /></span><div><span>AI CHAT</span><h2>AI 对话</h2></div></div>
              <span className={`integration-status ${ai?.chat?.configured ? "configured" : "not-configured"}`}><i />{ai?.chat?.configured ? "已配置" : "未配置"}</span>
            </div>
            <form className="settings-form" onSubmit={submitChat}>
              <p className="settings-help">配置用于商品运营助手、内容问答等对话能力。请填写兼容 OpenAI Chat Completions 或 Responses 的服务地址、密钥和模型。</p>
              <div className="form-grid two-columns">
                <label className="field-span-2"><span>模型服务 URL</span><input value={chatBaseUrl} onChange={(event) => setChatBaseUrl(event.target.value)} placeholder="例如 https://api.openai.com/v1" autoComplete="off" required /></label>
                <label><span>API Key</span><input type="password" value={chatApiKey} onChange={(event) => setChatApiKey(event.target.value)} placeholder={ai?.chat?.configured ? "已配置，输入新 Key 可替换" : "输入对话模型 API Key"} autoComplete="new-password" required /></label>
                <label><span>模型 ID</span><input value={chatModelId} onChange={(event) => setChatModelId(event.target.value)} placeholder="例如 gpt-4o-mini" autoComplete="off" required /></label>
              </div>
              <div className="settings-footer">
                <span className="settings-meta"><ShieldCheck size={15} />{ai?.chat?.configured ? `${ai.chat.apiKeyHint ?? "已加密保存"}${ai.chat.updatedAt ? ` · 更新于 ${new Date(ai.chat.updatedAt).toLocaleString("zh-CN")}` : ""}` : "尚未保存 AI 对话配置"}</span>
                <button className="button primary" type="submit" disabled={saving || !chatBaseUrl.trim() || !chatApiKey.trim() || !chatModelId.trim()}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? "保存中" : "保存 AI 对话配置"}</button>
              </div>
            </form>
          </section>

          <section className="settings-panel">
            <div className="settings-panel-header">
              <div className="settings-title"><span className="settings-icon"><ImagePlus size={19} /></span><div><span>AI IMAGE GENERATION</span><h2>AI 生成图片</h2></div></div>
              <span className={`integration-status ${ai?.imageGeneration?.configured ? "configured" : "not-configured"}`}><i />{ai?.imageGeneration?.configured ? "已配置" : "未配置"}</span>
            </div>
            <form className="settings-form" onSubmit={submitImageGeneration}>
              <p className="settings-help">配置用于商品主图、营销素材等图片生成能力。可以使用独立的图片模型服务和 API Key。</p>
              <div className="form-grid two-columns">
                <label className="field-span-2"><span>模型服务 URL</span><input value={imageGenerationBaseUrl} onChange={(event) => setImageGenerationBaseUrl(event.target.value)} placeholder="例如 https://api.openai.com/v1" autoComplete="off" required /></label>
                <label><span>API Key</span><input type="password" value={imageGenerationApiKey} onChange={(event) => setImageGenerationApiKey(event.target.value)} placeholder={ai?.imageGeneration?.configured ? "已配置，输入新 Key 可替换" : "输入图片生成 API Key"} autoComplete="new-password" required /></label>
                <label><span>模型 ID</span><input value={imageGenerationModelId} onChange={(event) => setImageGenerationModelId(event.target.value)} placeholder="例如 gpt-image-1" autoComplete="off" required /></label>
              </div>
              <div className="settings-footer">
                <span className="settings-meta"><ShieldCheck size={15} />{ai?.imageGeneration?.configured ? `${ai.imageGeneration.apiKeyHint ?? "已加密保存"}${ai.imageGeneration.updatedAt ? ` · 更新于 ${new Date(ai.imageGeneration.updatedAt).toLocaleString("zh-CN")}` : ""}` : "尚未保存 AI 图片生成配置"}</span>
                <button className="button primary" type="submit" disabled={saving || !imageGenerationBaseUrl.trim() || !imageGenerationApiKey.trim() || !imageGenerationModelId.trim()}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? "保存中" : "保存 AI 图片生成配置"}</button>
              </div>
            </form>
          </section>

          <section className="settings-panel">
            <div className="settings-panel-header">
              <div className="settings-title"><span className="settings-icon"><KeyRound size={19} /></span><div><span>GOOGLE OAUTH</span><h2>Google 账号登录</h2></div></div>
              <span className={`integration-status ${google?.configured ? "configured" : "not-configured"}`}><i />{google?.configured ? "已配置" : "未配置"}</span>
            </div>
            <form className="settings-form" onSubmit={submitGoogle}>
              <p className="settings-help">Client ID、Client Secret 和允许域名使用 AES-GCM 加密后保存在 D1。Client Secret 不会返回浏览器。</p>
              <div className="form-grid two-columns">
                <label><span>Client ID</span><input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder={google?.configured ? "已配置，输入新值可替换" : "OAuth Web Client ID"} autoComplete="off" required /></label>
                <label><span>Client Secret</span><input type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder={google?.configured ? "已配置，输入新值可替换" : "OAuth Client Secret"} autoComplete="new-password" required /></label>
                <label className="field-span-2"><span>允许的 Google Workspace 域名</span><input value={allowedDomain} onChange={(event) => setAllowedDomain(event.target.value)} placeholder="留空表示允许所有 Google 账号" autoComplete="off" /></label>
              </div>
              <div className="settings-footer">
                <span className="settings-meta"><ShieldCheck size={15} />{google?.configured ? `${google.clientIdHint ?? "已保存"}${google.updatedAt ? ` · 更新于 ${new Date(google.updatedAt).toLocaleString("zh-CN")}` : ""}` : "尚未保存 Google OAuth 配置"}</span>
                <button className="button primary" type="submit" disabled={saving || !clientId.trim() || !clientSecret.trim()}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? "保存中" : "保存 Google 配置"}</button>
              </div>
            </form>
          </section>

          <section className="settings-panel">
            <div className="settings-panel-header">
              <div className="settings-title"><span className="settings-icon"><KeyRound size={19} /></span><div><span>AI IMAGE FILTER</span><h2>商品图片智能识别</h2></div></div>
              <span className={`integration-status ${imageFilter?.configured ? "configured" : "not-configured"}`}><i />{imageFilter?.configured ? "已配置" : "未配置"}</span>
            </div>
            <form className="settings-form" onSubmit={submitAi}>
              <p className="settings-help">插件先通过 HTML 结构筛选候选图片，再调用兼容 OpenAI Responses 的多模态接口判断商品图和 SKU。API Key 只在 Worker 中加密保存。</p>
              <div className="form-grid two-columns">
                <label className="field-span-2"><span>模型服务 URL</span><input value={aiBaseUrl} onChange={(event) => setAiBaseUrl(event.target.value)} placeholder="例如 https://api.openai.com/v1" autoComplete="off" required /></label>
                <label><span>API Key</span><input type="password" value={aiApiKey} onChange={(event) => setAiApiKey(event.target.value)} placeholder={imageFilter?.configured ? "已配置，输入新 Key 可替换" : "输入模型服务 API Key"} autoComplete="new-password" required /></label>
                <label><span>模型 ID</span><input value={aiModelId} onChange={(event) => setAiModelId(event.target.value)} placeholder="例如 gpt-4o-mini" autoComplete="off" required /></label>
              </div>
              <div className="settings-footer">
                <span className="settings-meta"><ShieldCheck size={15} />{imageFilter?.configured ? `${imageFilter.apiKeyHint ?? "已加密保存"}${imageFilter.updatedAt ? ` · 更新于 ${new Date(imageFilter.updatedAt).toLocaleString("zh-CN")}` : ""}` : "尚未保存 AI 图片识别配置"}</span>
                <button className="button primary" type="submit" disabled={saving || !aiBaseUrl.trim() || !aiApiKey.trim() || !aiModelId.trim()}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? "保存中" : "保存 AI 配置"}</button>
              </div>
            </form>
          </section>

          <section className="settings-panel">
            <div className="settings-panel-header">
              <div className="settings-title"><span className="settings-icon"><KeyRound size={19} /></span><div><span>ONEBOUND</span><h2>1688 以图搜商品</h2></div></div>
              <span className={`integration-status ${onebound?.configured ? "configured" : "not-configured"}`}><i />{onebound?.configured ? "已配置" : "未配置"}</span>
            </div>
            <form className="settings-form" onSubmit={submitOneBound}>
              <p className="settings-help">凭据只在 Worker 服务端请求 OneBound，数据库保存的是加密值。</p>
              <div className="form-grid two-columns">
                <label><span>API Key</span><input value={key} onChange={(event) => setKey(event.target.value)} placeholder={onebound?.configured ? "已配置，输入新值可替换" : "输入 OneBound key"} autoComplete="off" required /></label>
                <label><span>API Secret</span><input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder={onebound?.configured ? "已配置，输入新值可替换" : "输入 OneBound secret"} autoComplete="new-password" required /></label>
              </div>
              <div className="settings-footer">
                <span className="settings-meta"><ShieldCheck size={15} />{onebound?.configured ? `${onebound.keyHint ?? "已保存"}${onebound.updatedAt ? ` · 更新于 ${new Date(onebound.updatedAt).toLocaleString("zh-CN")}` : ""}` : "尚未保存 OneBound 凭据"}</span>
                <button className="button primary" type="submit" disabled={saving || !key.trim() || !secret.trim()}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? "保存中" : "保存 OneBound 配置"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
