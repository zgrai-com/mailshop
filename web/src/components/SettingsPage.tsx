import { KeyRound, LoaderCircle, Save, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import type { OneBoundSettings } from "../types";

type Props = {
  settings: OneBoundSettings | null;
  loading: boolean;
  saving: boolean;
  onSave: (key: string, secret: string) => Promise<void>;
};

export function SettingsPage({ settings, loading, saving, onSave }: Props) {
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");

  useEffect(() => {
    setKey("");
    setSecret("");
  }, [settings?.updatedAt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(key, secret);
    setKey("");
    setSecret("");
  }

  return (
    <section className="settings-view">
      <header className="page-heading">
        <div><span>INTEGRATIONS</span><h1>系统设置</h1><p>管理外部商品搜索服务和工作台连接</p></div>
      </header>

      <section className="settings-panel">
        <div className="settings-panel-header">
          <div className="settings-title"><span className="settings-icon"><KeyRound size={19} /></span><div><span>ONEBOUND</span><h2>1688 以图搜商品</h2></div></div>
          <span className={`integration-status ${settings?.configured ? "configured" : "not-configured"}`}><i />{settings?.configured ? "已配置" : "未配置"}</span>
        </div>

        {loading ? <div className="page-loading settings-loading"><LoaderCircle className="spin" size={21} />加载设置</div> : (
          <form className="settings-form" onSubmit={submit}>
            <p className="settings-help">凭据仅用于 Worker 服务端请求 OneBound，不会发送到浏览器。数据库保存的是加密值。</p>
            <div className="form-grid two-columns">
              <label><span>API Key</span><input value={key} onChange={(event) => setKey(event.target.value)} placeholder={settings?.configured ? "已配置，输入新值可替换" : "输入 OneBound key"} autoComplete="off" required /></label>
              <label><span>API Secret</span><input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder={settings?.configured ? "已配置，输入新值可替换" : "输入 OneBound secret"} autoComplete="new-password" required /></label>
            </div>
            <div className="settings-footer">
              <span className="settings-meta"><ShieldCheck size={15} />{settings?.configured ? `${settings.keyHint ?? "已保存"}${settings.updatedAt ? ` · 更新于 ${new Date(settings.updatedAt).toLocaleString("zh-CN")}` : ""}` : "尚未保存 OneBound 凭据"}</span>
              <button className="button primary" type="submit" disabled={saving || !key.trim() || !secret.trim()}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? "保存中" : "保存设置"}</button>
            </div>
          </form>
        )}
      </section>
    </section>
  );
}
