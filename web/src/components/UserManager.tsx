import { KeyRound, LoaderCircle, Plus, UserRoundPlus, X } from "lucide-react";
import { FormEvent, useState } from "react";

import type { User } from "../types";

type Props = {
  currentUser: User;
  users: User[];
  loading: boolean;
  onCreate: (input: { username: string; displayName: string; password: string }) => Promise<void>;
  onPatch: (userId: string, patch: { isActive?: boolean; displayName?: string }) => Promise<void>;
  onPassword: (userId: string, password: string) => Promise<void>;
};

export function UserManager({ currentUser, users, loading, onCreate, onPatch, onPassword }: Props) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onCreate({ username, displayName, password });
      setUsername("");
      setDisplayName("");
      setPassword("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="account-view">
      <header className="page-heading"><div><span>ACCESS CONTROL</span><h1>账号管理</h1><p>所有账号拥有相同的商品操作权限</p></div></header>

      <section className="account-create-band">
        <div className="band-title"><UserRoundPlus size={19} /><div><span>新账号</span><strong>添加员工</strong></div></div>
        <form onSubmit={create} className="inline-create-form">
          <label className="field-label"><span>登录账号</span><input value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
          <label className="field-label"><span>显示名称</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></label>
          <label className="field-label"><span>初始密码</span><input type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button className="button primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}{saving ? "创建中" : "创建账号"}</button>
        </form>
        {error && <div className="form-error" role="alert">{error}</div>}
      </section>

      <section className="account-table-section">
        <div className="table-title-row"><div><h2>员工账号</h2><span>{users.length} 个账号</span></div></div>
      {loading ? <div className="page-loading"><LoaderCircle className="spin" size={22} />加载账号</div> : <div className="table-scroll"><table className="data-table accounts-table"><thead><tr><th>员工</th><th>账号</th><th>积分</th><th>最近登录</th><th>状态</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><div className="user-cell"><span className="avatar-small">{user.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{user.displayName}</strong><small>{user.authProvider === "google" ? "Google 账号" : user.id === currentUser.id ? "当前账号" : "密码账号"}</small></div></div></td><td className="mono">{user.email || user.username}</td><td><strong className="account-credit-value">{user.credits.toLocaleString()}</strong></td><td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("zh-CN") : "从未登录"}</td><td><label className="toggle-control"><input type="checkbox" checked={user.isActive !== false} disabled={user.id === currentUser.id} onChange={(event) => onPatch(user.id, { isActive: event.target.checked })} /><span aria-hidden="true" /><em>{user.isActive !== false ? "启用" : "停用"}</em></label></td><td className="actions-cell">{(user.authProvider !== "google" || user.hasPassword) && <button className="button quiet compact" type="button" onClick={() => setResetUser(user)}><KeyRound size={15} />重置密码</button>}</td></tr>)}</tbody></table></div>}
      </section>

      {resetUser && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setResetUser(null)}><section className="modal password-modal" role="dialog" aria-modal="true" aria-labelledby="password-modal-title"><header className="modal-header"><div><span>账号安全</span><h2 id="password-modal-title">重置 {resetUser.displayName} 的密码</h2></div><button className="icon-button" type="button" onClick={() => setResetUser(null)} aria-label="关闭" title="关闭"><X size={19} /></button></header><form onSubmit={async (event) => { event.preventDefault(); setSaving(true); setError(""); try { await onPassword(resetUser.id, resetPassword); setResetUser(null); setResetPassword(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "重置失败"); } finally { setSaving(false); } }}><label className="field-label"><span>新密码</span><input type="password" minLength={12} value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} required autoFocus /></label>{error && <div className="form-error" role="alert">{error}</div>}<footer className="modal-actions"><button className="button quiet" type="button" onClick={() => setResetUser(null)}>取消</button><button className="button primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <KeyRound size={17} />}{saving ? "重置中" : "确认重置"}</button></footer></form></section></div>}
    </section>
  );
}
