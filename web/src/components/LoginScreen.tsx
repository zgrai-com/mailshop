import { ArrowRight, KeyRound, LoaderCircle, LogIn, PackageSearch, UserRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { api } from "../api";
import type { User } from "../types";

type Props = {
  onLogin: (user: User) => void;
};

export function LoginScreen({ onLogin }: Props) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    api<{ googleEnabled: boolean }>("/api/auth/config")
      .then((result) => setGoogleEnabled(result.googleEnabled))
      .catch(() => setGoogleEnabled(false));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await api<{ user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      onLogin(result.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-brand">
        <div className="login-brand-mark" aria-hidden="true"><PackageSearch size={26} /></div>
        <p>MAILSHOP / OPERATIONS</p>
        <h1>采集与 Shopify</h1>
        <div className="login-rule" />
        <dl>
          <div><dt>来源</dt><dd>Shopify / 1688</dd></div>
          <div><dt>工作流</dt><dd>采集 · 图搜 · 匹配 · 审核</dd></div>
          <div><dt>存储</dt><dd>Cloudflare D1 / R2</dd></div>
        </dl>
      </section>

      <section className="login-panel">
        <div className="login-form-wrap">
          <header>
            <span>内部工作台</span>
            <h2>登录</h2>
          </header>
          <form onSubmit={submit}>
            <label className="field-label">
              <span>账号</span>
              <span className="input-with-icon"><UserRound size={17} /><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></span>
            </label>
            <label className="field-label">
              <span>密码</span>
              <span className="input-with-icon"><KeyRound size={17} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></span>
            </label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button primary login-button" type="submit" disabled={loading}>
              {loading ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
              {loading ? "正在登录" : "进入工作台"}
            </button>
            {googleEnabled && <div className="login-divider"><span>或</span></div>}
            {googleEnabled && <a className="button google-login-button" href="/api/auth/google"><LogIn size={18} />使用 Google 账号登录</a>}
          </form>
        </div>
      </section>
    </main>
  );
}
