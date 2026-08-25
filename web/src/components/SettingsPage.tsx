import { ImagePlus, KeyRound, Languages, LoaderCircle, MessageCircle, Save, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import type { AiSettings, AiSettingsInput, GoogleSettings, OneBoundSettings } from "../types";

type Props = {
  onebound: OneBoundSettings | null;
  google: GoogleSettings | null;
  ai: AiSettings | null;
  loading: boolean;
  saving: boolean;
  onSaveOneBound: (key: string, secret: string) => Promise<void>;
  onSaveGoogle: (clientId: string, clientSecret: string, allowedDomain: string) => Promise<void>;
  onSaveAi: (input: AiSettingsInput) => Promise<void>;
};

function updatedLabel(updatedAt: string | null | undefined): string {
  return updatedAt ? ` 更新于 ${new Date(updatedAt).toLocaleString("zh-CN")}` : "";
}

export function SettingsPage({ onebound, google, ai, loading, saving, onSaveOneBound, onSaveGoogle, onSaveAi }: Props) {
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [allowedDomain, setAllowedDomain] = useState("");
  const [conversationBaseUrl, setConversationBaseUrl] = useState("");
  const [conversationApiKey, setConversationApiKey] = useState("");
  const [imageFilterModelId, setImageFilterModelId] = useState("");
  const [imageAnalysisModelId, setImageAnalysisModelId] = useState("");
  const [chatModelId, setChatModelId] = useState("");
  const [translationModelId, setTranslationModelId] = useState("");
  const [imageGenerationBaseUrl, setImageGenerationBaseUrl] = useState("");
  const [imageGenerationApiKey, setImageGenerationApiKey] = useState("");
  const [imageGenerationModelId, setImageGenerationModelId] = useState("");

  useEffect(() => {
    setKey(onebound?.key ?? "");
    setSecret(onebound?.secret ?? "");
  }, [onebound?.updatedAt, onebound?.key, onebound?.secret]);

  useEffect(() => {
    setClientId(google?.clientId ?? "");
    setClientSecret(google?.clientSecret ?? "");
    setAllowedDomain(google?.allowedDomain ?? "");
  }, [google?.updatedAt, google?.clientId, google?.clientSecret, google?.allowedDomain]);

  useEffect(() => {
    setConversationBaseUrl(ai?.conversation.baseUrl ?? "");
    setConversationApiKey(ai?.conversation.apiKey ?? "");
    setImageFilterModelId(ai?.models.imageFilterModelId ?? "");
    setImageAnalysisModelId(ai?.models.imageAnalysisModelId ?? "");
    setChatModelId(ai?.models.chatModelId ?? "");
    setTranslationModelId(ai?.models.translationModelId ?? "");
    setImageGenerationBaseUrl(ai?.imageGeneration.baseUrl ?? "");
    setImageGenerationApiKey(ai?.imageGeneration.apiKey ?? "");
    setImageGenerationModelId(ai?.models.imageGenerationModelId ?? "");
  }, [ai]);

  async function submitOneBound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSaveOneBound(key, secret);
  }

  async function submitGoogle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSaveGoogle(clientId, clientSecret, allowedDomain);
  }

  async function submitAi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSaveAi({
      conversationBaseUrl,
      conversationApiKey,
      imageFilterModelId,
      imageAnalysisModelId,
      chatModelId,
      translationModelId,
      imageGenerationBaseUrl,
      imageGenerationApiKey,
      imageGenerationModelId,
    });
  }

  return (
    <section className="settings-view">
      <header className="page-heading"><div><span>INTEGRATIONS</span><h1>系统设置</h1><p>管理登录认证、AI 服务与外部商品搜索服务。</p></div></header>
      {loading ? <div className="page-loading settings-loading"><LoaderCircle className="spin" size={21} />加载设置</div> : (
        <div className="settings-stack">
          <form className="settings-ai-form" onSubmit={submitAi}>
            <section className="settings-panel">
              <div className="settings-panel-header">
                <div className="settings-title"><span className="settings-icon"><MessageCircle size={19} /></span><div><span>CONVERSATION AI</span><h2>对话接口</h2></div></div>
                <span className={`integration-status ${ai?.conversation.configured ? "configured" : "not-configured"}`}><i />{ai?.conversation.configured ? "已配置" : "未配置"}</span>
              </div>
              <div className="settings-panel-body">
                <p className="settings-help">图片识别、图片分析、AI 对话和 Shopify 翻译共用这一套 Base URL 与 API Key；每个任务可分别选择模型。</p>
                <div className="form-grid two-columns">
                  <label className="field-span-2"><span>服务 URL</span><input value={conversationBaseUrl} onChange={(event) => setConversationBaseUrl(event.target.value)} placeholder="例如 https://api.openai.com/v1" autoComplete="off" required /></label>
                  <label className="field-span-2"><span>API Key</span><input value={conversationApiKey} onChange={(event) => setConversationApiKey(event.target.value)} placeholder="输入对话接口 API Key" autoComplete="off" required /></label>
                  <label><span>图片识别模型</span><input value={imageFilterModelId} onChange={(event) => setImageFilterModelId(event.target.value)} placeholder="例如 gpt-4o-mini" autoComplete="off" required /></label>
                  <label><span>图片分析模型</span><input value={imageAnalysisModelId} onChange={(event) => setImageAnalysisModelId(event.target.value)} placeholder="例如 gpt-4o" autoComplete="off" required /></label>
                  <label><span>AI 对话 / SEO 模型</span><input value={chatModelId} onChange={(event) => setChatModelId(event.target.value)} placeholder="例如 gpt-4o-mini" autoComplete="off" required /></label>
                  <label><span>翻译模型</span><input value={translationModelId} onChange={(event) => setTranslationModelId(event.target.value)} placeholder="例如 gpt-4o-mini" autoComplete="off" required /></label>
                </div>
                <div className="settings-footer"><span className="settings-meta"><ShieldCheck size={15} />{ai?.conversation.configured ? `${ai.conversation.apiKeyHint ?? "已加密保存"}${updatedLabel(ai.updatedAt)}` : "尚未保存对话接口配置"}</span></div>
              </div>
            </section>

            <section className="settings-panel">
              <div className="settings-panel-header">
                <div className="settings-title"><span className="settings-icon"><ImagePlus size={19} /></span><div><span>IMAGE GENERATION</span><h2>生图接口</h2></div></div>
                <span className={`integration-status ${ai?.imageGeneration.configured ? "configured" : "not-configured"}`}><i />{ai?.imageGeneration.configured ? "已配置" : "未配置"}</span>
              </div>
              <div className="settings-panel-body">
                <p className="settings-help">商品图片生成和编辑使用单独的 Base URL、API Key 与模型，不会影响对话类任务。</p>
                <div className="form-grid two-columns">
                  <label className="field-span-2"><span>服务 URL</span><input value={imageGenerationBaseUrl} onChange={(event) => setImageGenerationBaseUrl(event.target.value)} placeholder="例如 https://api.openai.com/v1" autoComplete="off" required /></label>
                  <label><span>API Key</span><input value={imageGenerationApiKey} onChange={(event) => setImageGenerationApiKey(event.target.value)} placeholder="输入生图接口 API Key" autoComplete="off" required /></label>
                  <label><span>生图模型</span><input value={imageGenerationModelId} onChange={(event) => setImageGenerationModelId(event.target.value)} placeholder="例如 gpt-image-1" autoComplete="off" required /></label>
                </div>
                <div className="settings-footer"><span className="settings-meta"><ShieldCheck size={15} />{ai?.imageGeneration.configured ? `${ai.imageGeneration.apiKeyHint ?? "已加密保存"}${updatedLabel(ai.updatedAt)}` : "尚未保存生图接口配置"}</span><button className="button primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? "保存中" : "保存 AI 配置"}</button></div>
              </div>
            </section>
          </form>

          <section className="settings-panel">
            <div className="settings-panel-header">
              <div className="settings-title"><span className="settings-icon"><KeyRound size={19} /></span><div><span>GOOGLE OAUTH</span><h2>Google 账号登录</h2></div></div>
              <span className={`integration-status ${google?.configured ? "configured" : "not-configured"}`}><i />{google?.configured ? "已配置" : "未配置"}</span>
            </div>
            <form className="settings-form" onSubmit={submitGoogle}>
              <p className="settings-help">Client ID、Client Secret 和允许域名会加密保存，并在管理员设置页直接显示。</p>
              <div className="form-grid two-columns">
                <label><span>Client ID</span><input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="OAuth Web Client ID" autoComplete="off" required /></label>
                <label><span>Client Secret</span><input value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder="OAuth Client Secret" autoComplete="off" required /></label>
                <label className="field-span-2"><span>允许的 Google Workspace 域名</span><input value={allowedDomain} onChange={(event) => setAllowedDomain(event.target.value)} placeholder="留空表示允许所有 Google 账号" autoComplete="off" /></label>
              </div>
              <div className="settings-footer"><span className="settings-meta"><ShieldCheck size={15} />{google?.configured ? `${google.clientIdHint ?? "已保存"}${updatedLabel(google.updatedAt)}` : "尚未保存 Google OAuth 配置"}</span><button className="button primary" type="submit" disabled={saving || !clientId.trim() || !clientSecret.trim()}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? "保存中" : "保存 Google 配置"}</button></div>
            </form>
          </section>

          <section className="settings-panel">
            <div className="settings-panel-header">
              <div className="settings-title"><span className="settings-icon"><Languages size={19} /></span><div><span>ONEBOUND</span><h2>1688 以图搜商品</h2></div></div>
              <span className={`integration-status ${onebound?.configured ? "configured" : "not-configured"}`}><i />{onebound?.configured ? "已配置" : "未配置"}</span>
            </div>
            <form className="settings-form" onSubmit={submitOneBound}>
              <p className="settings-help">凭据由 Worker 服务端请求 OneBound，并加密保存。</p>
              <div className="form-grid two-columns">
                <label><span>API Key</span><input value={key} onChange={(event) => setKey(event.target.value)} placeholder="输入 OneBound key" autoComplete="off" required /></label>
                <label><span>API Secret</span><input value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="输入 OneBound secret" autoComplete="off" required /></label>
              </div>
              <div className="settings-footer"><span className="settings-meta"><ShieldCheck size={15} />{onebound?.configured ? `${onebound.keyHint ?? "已保存"}${updatedLabel(onebound.updatedAt)}` : "尚未保存 OneBound 凭据"}</span><button className="button primary" type="submit" disabled={saving || !key.trim() || !secret.trim()}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? "保存中" : "保存 OneBound 配置"}</button></div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
