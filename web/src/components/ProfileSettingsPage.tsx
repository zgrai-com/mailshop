import { FileText, ImagePlus, KeyRound, Languages, LoaderCircle, Save, ShieldCheck, UserRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { PROMPT_VARIABLE_GROUPS } from "../../../shared/prompt-templates";
import type { User, UserAiPromptSettings, UserAiPromptSettingsInput } from "../types";

type Props = {
  user: User;
  saving: boolean;
  aiPrompts: UserAiPromptSettings | null;
  loadingAiPrompts: boolean;
  onChangePassword: (currentPassword: string, password: string) => Promise<void>;
  onSaveAiPrompts: (input: UserAiPromptSettingsInput) => Promise<void>;
};

function updatedLabel(updatedAt: string | null | undefined): string {
  return updatedAt ? `更新于 ${new Date(updatedAt).toLocaleString("zh-CN")}` : "尚未保存";
}

export function ProfileSettingsPage({ user, saving, aiPrompts, loadingAiPrompts, onChangePassword, onSaveAiPrompts }: Props) {
  const hasPassword = user.hasPassword ?? user.authProvider !== "google";
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [aiDescriptionPrompt, setAiDescriptionPrompt] = useState("");
  const [translationPrompt, setTranslationPrompt] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [aiPromptError, setAiPromptError] = useState("");

  useEffect(() => {
    setAiDescriptionPrompt(aiPrompts?.aiDescriptionPrompt ?? "");
    setTranslationPrompt(aiPrompts?.translationPrompt ?? "");
    setImagePrompt(aiPrompts?.imagePrompt ?? "");
  }, [aiPrompts]);

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

  async function submitAiPrompts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAiPromptError("");
    try {
      await onSaveAiPrompts({ aiDescriptionPrompt, translationPrompt, imagePrompt });
    } catch (caught) {
      setAiPromptError(caught instanceof Error ? caught.message : "AI 提示词保存失败");
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

        <section className="settings-panel profile-ai-panel">
          <header className="settings-panel-header">
            <div className="settings-title">
              <span className="settings-icon"><FileText size={19} /></span>
              <div><span>AI PROMPTS</span><h2>AI 提示词偏好</h2></div>
            </div>
            <span className={`integration-status ${aiPrompts?.updatedAt ? "configured" : "not-configured"}`}><i />{loadingAiPrompts ? "读取中" : aiPrompts?.updatedAt ? "已设置" : "使用默认"}</span>
          </header>
          <form className="settings-form profile-ai-prompt-form" onSubmit={submitAiPrompts}>
            <p className="settings-help">这些提示词会作为你在 Shopify 商品里生成描述、多语言翻译和处理图片时的默认要求；每次执行前仍然可以临时修改。</p>
            <div className="profile-ai-prompt-grid">
              <label>
                <span><FileText size={15} />AI 生成描述提示词</span>
                <textarea rows={7} maxLength={12_000} value={aiDescriptionPrompt} onChange={(event) => setAiDescriptionPrompt(event.target.value)} placeholder="留空时使用系统默认的 Shopify 商品描述生成规则。" />
              </label>
              <label>
                <span><Languages size={15} />多语言翻译提示词</span>
                <textarea rows={7} maxLength={8_000} value={translationPrompt} onChange={(event) => setTranslationPrompt(event.target.value)} placeholder="留空时使用系统默认的自然电商本地化规则。" />
              </label>
              <label>
                <span><ImagePlus size={15} />AI 处理图片提示词</span>
                <textarea rows={7} maxLength={12_000} value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)} placeholder="留空时使用图片分析生成的提示词。" />
              </label>
            </div>
            <section className="profile-ai-variables">
              <div className="profile-ai-variables-heading">
                <div>
                  <span>SUPPORTED VARIABLES</span>
                  <h3>可用占位符</h3>
                </div>
                <small>括号里的名字会按当前页面上下文自动替换，未提供的变量会保留原样。</small>
              </div>
              <div className="profile-ai-variable-groups">
                {PROMPT_VARIABLE_GROUPS.map((group) => (
                  <div key={group.id} className="profile-ai-variable-group">
                    <div className="profile-ai-variable-group-head">
                      <strong>{group.title}</strong>
                      <span>{group.description}</span>
                    </div>
                    <div className="profile-ai-variable-list">
                      {group.variables.map((variable) => (
                        <div key={`${group.id}:${variable.token}`} className="profile-ai-variable-item">
                          <code>{`{${variable.token}}`}</code>
                          <span>{variable.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            {aiPromptError && <div className="settings-error" role="alert">{aiPromptError}</div>}
            <footer className="settings-footer">
              <span className="settings-meta"><ShieldCheck size={15} />{loadingAiPrompts ? "正在读取提示词" : updatedLabel(aiPrompts?.updatedAt)}</span>
              <button className="button primary" type="submit" disabled={saving || loadingAiPrompts}>
                {saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
                {saving ? "保存中" : "保存提示词"}
              </button>
            </footer>
          </form>
        </section>
      </div>
    </section>
  );
}
