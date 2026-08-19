import { KeyRound, LoaderCircle, Save, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import type { AiSettings, GoogleSettings, OneBoundSettings } from "../types";

type Props = {
  onebound: OneBoundSettings | null;
  google: GoogleSettings | null;
  ai: AiSettings | null;
  loading: boolean;
  saving: boolean;
  onSaveOneBound: (key: string, secret: string) => Promise<void>;
  onSaveGoogle: (clientId: string, clientSecret: string, allowedDomain: string) => Promise<void>;
  onSaveAi: (baseUrl: string, apiKey: string, modelId: string) => Promise<void>;
};

export function SettingsPage({ onebound, google, ai, loading, saving, onSaveOneBound, onSaveGoogle, onSaveAi }: Props) {
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [allowedDomain, setAllowedDomain] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModelId, setAiModelId] = useState("");

  useEffect(() => { setKey(""); setSecret(""); }, [onebound?.updatedAt]);
  useEffect(() => {
    setClientId("");
    setClientSecret("");
    setAllowedDomain(google?.allowedDomain ?? "");
  }, [google?.updatedAt, google?.allowedDomain]);
  useEffect(() => {
    setAiBaseUrl(ai?.baseUrl ?? "");
    setAiApiKey("");
    setAiModelId(ai?.modelId ?? "");
  }, [ai?.updatedAt, ai?.baseUrl, ai?.modelId]);

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
    await onSaveAi(aiBaseUrl, aiApiKey, aiModelId);
    setAiApiKey("");
  }

  return (
    <section className="settings-view">
      <header className="page-heading"><div><span>INTEGRATIONS</span><h1>系统设置</h1><p>管理登录认证与外部商品搜索服务</p></div></header>
      {loading ? <div className="page-loading settings-loading"><LoaderCircle className="spin" size={21} />加载设置</div> : (
        <div className="settings-stack">
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
              <span className={`integration-status ${ai?.configured ? "configured" : "not-configured"}`}><i />{ai?.configured ? "已配置" : "未配置"}</span>
            </div>
            <form className="settings-form" onSubmit={submitAi}>
              <p className="settings-help">插件先通过 HTML 结构筛选候选图片，再调用兼容 OpenAI Chat Completions 的多模态接口判断商品图和 SKU。API Key 只在 Worker 中加密保存。</p>
              <div className="form-grid two-columns">
                <label className="field-span-2"><span>模型服务 URL</span><input value={aiBaseUrl} onChange={(event) => setAiBaseUrl(event.target.value)} placeholder="例如 https://api.openai.com/v1" autoComplete="off" required /></label>
                <label><span>API Key</span><input type="password" value={aiApiKey} onChange={(event) => setAiApiKey(event.target.value)} placeholder={ai?.configured ? "已配置，输入新 Key 可替换" : "输入模型服务 API Key"} autoComplete="new-password" required /></label>
                <label><span>模型 ID</span><input value={aiModelId} onChange={(event) => setAiModelId(event.target.value)} placeholder="例如 gpt-4o-mini" autoComplete="off" required /></label>
              </div>
              <div className="settings-footer">
                <span className="settings-meta"><ShieldCheck size={15} />{ai?.configured ? `${ai.apiKeyHint ?? "已加密保存"}${ai.updatedAt ? ` · 更新于 ${new Date(ai.updatedAt).toLocaleString("zh-CN")}` : ""}` : "尚未保存 AI 模型配置"}</span>
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
