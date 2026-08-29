import { KeyRound, LoaderCircle, ShieldCheck, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";

import type { User } from "../types";

type Props = {
  user: User;
  saving: boolean;
  onChangePassword: (currentPassword: string, password: string) => Promise<void>;
};

export function ProfileSettingsPage({ user, saving, onChangePassword }: Props) {
  const hasPassword = user.hasPassword ?? user.authProvider !== "google";
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("两次输入的新密码不一致");
      return;
    }
    try {
      await onChangePassword(currentPassword, password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "密码修改失败");
    }
  }

  return (
    <section className="profile-view">
      <header className="page-heading">
        <div>
          <span>PERSONAL SETTINGS</span>
          <h1>个人设置</h1>
          <p>管理你的账号信息和登录密码</p>
        </div>
      </header>

      <div className="profile-settings-grid">
        <section className="settings-panel profile-summary-panel">
          <header className="settings-panel-header">
            <div className="settings-title">
              <span className="settings-icon"><UserRound size={19} /></span>
              <div><span>ACCOUNT</span><h2>账号信息</h2></div>
            </div>
          </header>
          <div className="profile-summary-body">
            <div className="profile-avatar">{user.displayName.slice(0, 1).toUpperCase()}</div>
            <div className="profile-summary-copy">
              <strong>{user.displayName}</strong>
              <span>{user.email || user.username}</span>
              <small>{user.role === "admin" ? "系统管理员" : "普通用户"}</small>
            </div>
            <dl className="profile-details">
              <div><dt>登录账号</dt><dd>{user.username}</dd></div>
              <div><dt>登录方式</dt><dd>{user.authProvider === "google" ? (hasPassword ? "Google / 账号密码" : "Google 账号") : "账号密码"}</dd></div>
            </dl>
          </div>
        </section>

        <section className="settings-panel profile-password-panel">
          <header className="settings-panel-header">
            <div className="settings-title">
              <span className="settings-icon"><KeyRound size={19} /></span>
              <div><span>SECURITY</span><h2>修改登录密码</h2></div>
            </div>
            <span className="integration-status configured"><i />{hasPassword ? "已设置" : "首次设置"}</span>
          </header>
          <form className="settings-form" onSubmit={submit}>
            <p className="settings-help">
              {hasPassword ? "修改密码后，当前登录会话会失效，请使用新密码重新登录。" : "设置密码后，可以使用登录账号或 Google 邮箱配合密码登录。"}
            </p>
            <div className="form-grid">
              {hasPassword && <label><span>当前密码</span><input type="password" minLength={8} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>}
              <label><span>新密码</span><input type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required /></label>
              <label><span>确认新密码</span><input type="password" minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required /></label>
            </div>
            {error && <div className="settings-error" role="alert">{error}</div>}
            <footer className="settings-footer">
              <span className="settings-meta"><ShieldCheck size={15} />密码使用加密哈希保存</span>
              <button className="button primary" type="submit" disabled={saving}>
                {saving ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}
                {saving ? "保存中" : "保存新密码"}
              </button>
            </footer>
          </form>
        </section>
      </div>
    </section>
  );
}
