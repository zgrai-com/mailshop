import { Check, Copy, KeyRound, LoaderCircle, Pencil, Plus, RefreshCw, Save, Store, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import type { ShopifyStore } from "../types";

type Props = {
  stores: ShopifyStore[];
  loading: boolean;
  saving: boolean;
  onSave: (shopDomain: string, displayName: string, clientId: string, clientSecret: string) => Promise<void>;
  onTest: (storeId: string) => Promise<void>;
  onDelete: (storeId: string) => Promise<void>;
};

type EditorMode = "new" | "edit" | null;

const statusLabels: Record<ShopifyStore["status"], string> = {
  planned: "待测试",
  installing: "连接中",
  active: "连接正常",
  disabled: "已停用",
  error: "连接异常",
};

function CredentialValue({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    if (!value) return;
    if (!navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_600);
  }

  return (
    <div className="shopify-credential">
      <span>{label}</span>
      <div><code>{value || "未配置"}</code>{value && <button className="icon-button" type="button" onClick={() => void copyValue()} aria-label={`复制 ${label}`} title={`复制 ${label}`}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>}</div>
    </div>
  );
}

export function ShopifyStoresPage({ stores, loading, saving, onSave, onTest, onDelete }: Props) {
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [shopDomain, setShopDomain] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [testing, setTesting] = useState(false);
  const editingStore = stores.find((store) => store.id === editingStoreId) ?? null;
  const canTestConnection = editorMode === "edit"
    && Boolean(editingStoreId && editingStore?.configured && editingStore.clientId === clientId && editingStore.clientSecret === clientSecret);

  useEffect(() => {
    if (editorMode !== "edit") return;
    if (!editingStore) {
      setEditorMode(null);
      setEditingStoreId(null);
      return;
    }
    setShopDomain(editingStore.shopDomain);
    setDisplayName(editingStore.displayName ?? "");
    setClientId(editingStore.clientId ?? "");
    setClientSecret(editingStore.clientSecret ?? "");
  }, [editorMode, editingStore]);

  useEffect(() => {
    if (!editorMode) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) closeEditor();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editorMode, saving]);

  useEffect(() => {
    if (!editorMode) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [editorMode]);

  function startNewStore() {
    setEditorMode("new");
    setEditingStoreId(null);
    setShopDomain("");
    setDisplayName("");
    setClientId("");
    setClientSecret("");
  }

  function startEditing(store: ShopifyStore) {
    setEditorMode("edit");
    setEditingStoreId(store.id);
    setShopDomain(store.shopDomain);
    setDisplayName(store.displayName ?? "");
    setClientId(store.clientId ?? "");
    setClientSecret(store.clientSecret ?? "");
  }

  function closeEditor() {
    setEditorMode(null);
    setEditingStoreId(null);
  }

  async function testEditingStore() {
    if (!editingStoreId || !canTestConnection || testing) return;
    setTesting(true);
    try {
      await onTest(editingStoreId);
    } finally {
      setTesting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(shopDomain, displayName, clientId, clientSecret);
    closeEditor();
  }

  async function removeStore(store: ShopifyStore) {
    if (!window.confirm(`确定删除店铺“${store.displayName || store.shopDomain}”吗？`)) return;
    await onDelete(store.id);
    if (editingStoreId === store.id) closeEditor();
  }

  return (
    <section className="settings-view shopify-stores-view">
      <header className="page-heading shopify-stores-heading">
        <div><span>SHOPIFY CHANNELS</span><h1>Shopify 店铺</h1><p>管理已绑定的 Shopify 店铺，并选择商品发布目标。</p></div>
        <div className="shopify-stores-heading-actions">
          <span>{stores.length ? `${stores.length} 个店铺` : "尚未连接店铺"}</span>
          <button className="button primary" type="button" onClick={startNewStore}><Plus size={17} />新增店铺</button>
        </div>
      </header>

      {loading ? <div className="page-loading settings-loading"><LoaderCircle className="spin" size={21} />加载店铺</div> : (
        <div className="shopify-store-sections">
          <section className="shopify-store-list-section">
            <header>
              <div><span className="settings-icon"><Store size={19} /></span><div><h2>店铺列表</h2><p>{stores.length} 个店铺连接</p></div></div>
            </header>

            {stores.length ? <div className="shopify-store-cards">{stores.map((store) => (
              <article className="shopify-store-card" key={store.id}>
                <header>
                  <div className="shopify-store-identity"><span className={`shopify-store-status ${store.status}`} /><div><h3>{store.displayName || store.shopDomain}</h3><p>{store.shopDomain}</p></div></div>
                  <span className={`integration-status ${store.status === "active" ? "configured" : "not-configured"}`}><i />{statusLabels[store.status]}</span>
                </header>
                <div className="shopify-credentials-grid">
                  <CredentialValue label="Client ID" value={store.clientId} />
                  <CredentialValue label="Client Secret" value={store.clientSecret} />
                </div>
                {store.lastError && <p className="settings-error">{store.lastError}</p>}
                <footer>
                  <span>{store.lastVerifiedAt ? `上次验证：${new Date(store.lastVerifiedAt).toLocaleString("zh-CN")}` : "尚未完成连接测试"}</span>
                  <div>
                    <button className="button quiet compact" type="button" onClick={() => void onTest(store.id)} disabled={saving || !store.configured}><RefreshCw size={15} />测试连接</button>
                    <button className="button quiet compact" type="button" onClick={() => startEditing(store)} disabled={saving}><Pencil size={15} />编辑</button>
                    <button className="icon-button danger" type="button" onClick={() => void removeStore(store)} disabled={saving} aria-label={`删除 ${store.displayName || store.shopDomain}`} title="删除店铺"><Trash2 size={16} /></button>
                  </div>
                </footer>
              </article>
            ))}</div> : <div className="shopify-empty-state"><Store size={24} /><strong>还没有 Shopify 店铺</strong><p>添加店铺并完成连接测试后，即可发布商品草稿。</p><button className="button primary" type="button" onClick={startNewStore}><Plus size={16} />添加第一个店铺</button></div>}
          </section>

        </div>
      )}

      {editorMode && <div className="modal-backdrop shopify-store-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && closeEditor()}>
        <section className="modal shopify-store-modal" role="dialog" aria-modal="true" aria-labelledby="shopify-store-modal-title" aria-describedby="shopify-store-modal-description">
          <header className="modal-header shopify-store-modal-header">
            <div className="shopify-store-modal-title"><span className="settings-icon"><KeyRound size={18} /></span><div><span>SHOPIFY ADMIN API</span><h2 id="shopify-store-modal-title">{editorMode === "new" ? "添加店铺" : "编辑店铺"}</h2></div></div>
            <button className="icon-button" type="button" onClick={closeEditor} disabled={saving} aria-label="关闭表单" title="关闭"><X size={18} /></button>
          </header>
          <form className="settings-form shopify-store-form" onSubmit={submit}>
            <div id="shopify-store-modal-description" className="shopify-store-modal-intro"><span className="shopify-store-modal-intro-icon"><KeyRound size={16} /></span><p>填写 Shopify Dev Dashboard 应用的 Client ID 和 Client Secret。凭据在页面直接显示，在数据库中仍使用加密方式保存。</p></div>
            <section className="shopify-store-form-section">
              <div className="shopify-store-form-section-heading"><div><span>STORE DETAILS</span><strong>店铺信息</strong></div><small>用于识别和连接目标店铺</small></div>
              <div className="form-grid two-columns">
                <label><span>店铺域名</span><input value={shopDomain} onChange={(event) => setShopDomain(event.target.value)} placeholder="example.myshopify.com" autoComplete="off" readOnly={editorMode === "edit"} autoFocus required /></label>
                <label><span>店铺名称</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="选填" autoComplete="off" /></label>
              </div>
            </section>
            <section className="shopify-store-form-section">
              <div className="shopify-store-form-section-heading"><div><span>APP CREDENTIALS</span><strong>应用凭据</strong></div><small>来自 Shopify Dev Dashboard</small></div>
              <div className="form-grid two-columns">
                <label><span>Client ID</span><input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="Shopify App Client ID" autoComplete="off" spellCheck={false} required /></label>
                <label><span>Client Secret</span><input value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder="Shopify App Client Secret" autoComplete="off" spellCheck={false} required /></label>
              </div>
            </section>
            <div className="settings-footer">
              <span className="settings-meta">{editorMode === "edit" ? "店铺域名不可修改；如需更换域名，请新建店铺。" : "保存后请测试连接。"}</span>
              <div className="settings-actions">
                <button className="button quiet" type="button" onClick={() => void testEditingStore()} disabled={saving || testing || !canTestConnection} title={editorMode === "new" ? "保存店铺后才能测试连接" : canTestConnection ? "测试当前店铺连接" : "请先保存最新凭据"}><RefreshCw className={testing ? "spin" : ""} size={16} />{testing ? "测试中" : "测试连接"}</button>
                <button className="button quiet" type="button" onClick={closeEditor} disabled={saving}>取消</button>
                <button className="button primary" type="submit" disabled={saving || !shopDomain.trim() || !clientId.trim() || !clientSecret.trim()}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? "保存中" : "保存店铺"}</button>
              </div>
            </div>
          </form>
        </section>
      </div>}
    </section>
  );
}
