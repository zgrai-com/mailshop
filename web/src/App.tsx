import {
  ClipboardList, Coins, LayoutDashboard, ListChecks, LoaderCircle, LogOut, Menu,
  PackageSearch, Settings, Store, Users, X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { api, ApiClientError, toQuery } from "./api";
import { AdminDashboard } from "./components/AdminDashboard";
import { AuditLogsPage } from "./components/AuditLogsPage";
import { CreditsPage } from "./components/CreditsPage";
import { ErrorDialog } from "./components/ErrorDialog";
import { LoginScreen } from "./components/LoginScreen";
import { SearchTasksPage } from "./components/SearchTasksPage";
import { SettingsPage } from "./components/SettingsPage";
import { ShopifyProductEditorPage } from "./components/ShopifyProductEditorPage";
import { ShopifyProductsPage } from "./components/ShopifyProductsPage";
import { ShopifyStoresPage } from "./components/ShopifyStoresPage";
import { UserDashboard } from "./components/UserDashboard";
import { UserManager } from "./components/UserManager";
import type {
  AiSettings, AiSettingsInput, AuditLog, DashboardSummary,
  GoogleSettings, OneBoundSettings, ShopifyStore, User,
} from "./types";

type View = "dashboard" | "tasks" | "shopify-products" | "shopify" | "credits"
  | "audit-logs" | "accounts" | "settings";

const viewPaths: Record<View, string> = {
  dashboard: "/dashboard",
  tasks: "/tasks",
  "shopify-products": "/shopify/products",
  shopify: "/shopify",
  credits: "/credits",
  "audit-logs": "/audit-logs",
  accounts: "/accounts",
  settings: "/settings",
};

function viewFromPath(pathname: string): View {
  const normalized = pathname.replace(/\/$/u, "") || "/dashboard";
  if (normalized === "/products") return "tasks";
  if (/^\/shopify\/products(?:\/[^/]+)?$/u.test(normalized)) return "shopify-products";
  return (Object.entries(viewPaths).find(([, path]) => path === normalized)?.[0] as View | undefined) ?? "dashboard";
}

function readTaskRoute() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("status");
  const pageSize = Number(params.get("pageSize"));
  return {
    search: params.get("search") ?? "",
    status: (["unqueried", "queried", "imported"].includes(status || "") ? status : "all") as "all" | "unqueried" | "queried" | "imported",
    page: Math.max(1, Number(params.get("page")) || 1),
    pageSize: [5, 10, 20].includes(pageSize) ? pageSize : 5,
  };
}

function readProductRoute() {
  const match = window.location.pathname.match(/^\/shopify\/products\/([^/]+)$/u);
  if (!match) return { productId: null, storeId: "", returnPath: "/shopify/products" };
  const params = new URLSearchParams(window.location.search);
  return {
    productId: decodeURIComponent(match[1]),
    storeId: params.get("storeId") ?? "",
    returnPath: params.get("returnPath") || "/shopify/products",
  };
}

export default function App() {
  const initialTask = readTaskRoute();
  const initialProduct = readProductRoute();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [view, setView] = useState<View>(viewFromPath(window.location.pathname));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [stores, setStores] = useState<ShopifyStore[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [errorDialog, setErrorDialog] = useState<unknown>(null);
  const [creditTransactions, setCreditTransactions] = useState<import("./types").CreditTransaction[]>([]);
  const [loadingCredits, setLoadingCredits] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [onebound, setOnebound] = useState<OneBoundSettings | null>(null);
  const [google, setGoogle] = useState<GoogleSettings | null>(null);
  const [ai, setAi] = useState<AiSettings | null>(null);
  const [tasks, setTasks] = useState<import("./types").SearchTask[]>([]);
  const [taskTotal, setTaskTotal] = useState(0);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskSearch, setTaskSearch] = useState(initialTask.search);
  const [debouncedTaskSearch, setDebouncedTaskSearch] = useState(initialTask.search);
  const [taskStatus, setTaskStatus] = useState(initialTask.status);
  const [taskPage, setTaskPage] = useState(initialTask.page);
  const [taskPageSize, setTaskPageSize] = useState(initialTask.pageSize);
  const [productId, setProductId] = useState<string | null>(initialProduct.productId);
  const [productStoreId, setProductStoreId] = useState(initialProduct.storeId);
  const [productReturnPath, setProductReturnPath] = useState(initialProduct.returnPath);

  const notify = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const handleApiError = useCallback((error: unknown) => {
    if (error instanceof ApiClientError && error.status === 401) {
      setUser(null);
      return;
    }
    setErrorDialog(error);
  }, []);

  const navigate = useCallback((next: View, replace = false) => {
    window.history[replace ? "replaceState" : "pushState"]({}, "", viewPaths[next]);
    setView(next);
    setSidebarOpen(false);
    setProductId(null);
    setProductStoreId("");
    setProductReturnPath("/shopify/products");
  }, []);

  const handleNavigation = useCallback((event: ReactMouseEvent<HTMLAnchorElement>, next: View) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(next);
  }, [navigate]);

  const loadSummary = useCallback(async () => {
    try { setSummary((await api<{ summary: DashboardSummary }>("/api/dashboard")).summary); }
    catch (error) { handleApiError(error); }
  }, [handleApiError]);

  const loadStores = useCallback(async () => {
    if (!user || user.role === "admin") return;
    try { setStores((await api<{ stores: ShopifyStore[] }>("/api/integrations/shopify")).stores); }
    catch (error) { handleApiError(error); }
  }, [handleApiError, user]);

  const loadTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const result = await api<{ tasks: import("./types").SearchTask[]; total: number }>(
        `/api/collection-tasks${toQuery({ search: debouncedTaskSearch, status: taskStatus, page: taskPage, pageSize: taskPageSize })}`,
      );
      setTasks(result.tasks);
      setTaskTotal(result.total);
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoadingTasks(false);
    }
  }, [debouncedTaskSearch, handleApiError, taskPage, taskPageSize, taskStatus]);

  const loadCredits = useCallback(async () => {
    setLoadingCredits(true);
    try {
      const result = await api<{ credits: { balance: number; transactions: import("./types").CreditTransaction[] } }>("/api/credits");
      setCreditTransactions(result.credits.transactions);
      setUser((current) => current ? { ...current, credits: result.credits.balance } : current);
    } catch (error) { handleApiError(error); } finally { setLoadingCredits(false); }
  }, [handleApiError]);

  const loadAuditLogs = useCallback(async () => {
    setLoadingAuditLogs(true);
    try { setAuditLogs((await api<{ logs: AuditLog[] }>("/api/audit-logs?limit=100")).logs); }
    catch (error) { handleApiError(error); } finally { setLoadingAuditLogs(false); }
  }, [handleApiError]);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try { setUsers((await api<{ users: User[] }>("/api/users")).users); }
    catch (error) { handleApiError(error); } finally { setLoadingUsers(false); }
  }, [handleApiError]);

  const loadSettings = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const [oneboundResult, googleResult, aiResult] = await Promise.all([
        api<{ settings: OneBoundSettings }>("/api/integrations/onebound"),
        api<{ settings: GoogleSettings }>("/api/integrations/google"),
        api<{ settings: AiSettings }>("/api/integrations/ai"),
      ]);
      setOnebound(oneboundResult.settings);
      setGoogle(googleResult.settings);
      setAi(aiResult.settings);
    } catch (error) { handleApiError(error); } finally { setLoadingSettings(false); }
  }, [handleApiError]);

  useEffect(() => {
    api<{ user: User }>("/api/auth/me").then((result) => setUser(result.user)).catch(() => setUser(null));
  }, []);
  useEffect(() => { if (user) { void loadSummary(); void loadStores(); } }, [loadStores, loadSummary, user]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedTaskSearch(taskSearch), 260);
    return () => window.clearTimeout(timer);
  }, [taskSearch]);
  useEffect(() => { if (user && view === "tasks") void loadTasks(); }, [loadTasks, user, view]);
  useEffect(() => {
    if (view !== "tasks") return;
    window.history.replaceState({}, "", `${viewPaths.tasks}${toQuery({
      search: taskSearch,
      status: taskStatus !== "all" ? taskStatus : undefined,
      page: taskPage > 1 ? taskPage : undefined,
      pageSize: taskPageSize !== 5 ? taskPageSize : undefined,
    })}`);
  }, [taskPage, taskPageSize, taskSearch, taskStatus, view]);
  useEffect(() => {
    if (user?.id && view === "credits") void loadCredits();
    if (user?.role === "admin" && view === "audit-logs") void loadAuditLogs();
    if (user?.role === "admin" && view === "accounts") void loadUsers();
    if (user?.role === "admin" && view === "settings") void loadSettings();
  }, [loadAuditLogs, loadCredits, loadSettings, loadUsers, user?.id, user?.role, view]);
  useEffect(() => {
    if (!user) return;
    const adminOnlyViews: View[] = ["audit-logs", "accounts", "settings"];
    const userOnlyViews: View[] = ["tasks", "shopify-products", "shopify", "credits"];
    if ((user.role === "admin" && userOnlyViews.includes(view)) || (user.role !== "admin" && adminOnlyViews.includes(view))) {
      navigate("dashboard", true);
    }
  }, [navigate, user, view]);
  useEffect(() => {
    const onPopState = () => {
      setView(viewFromPath(window.location.pathname));
      const task = readTaskRoute();
      setTaskSearch(task.search);
      setDebouncedTaskSearch(task.search);
      setTaskStatus(task.status);
      setTaskPage(task.page);
      setTaskPageSize(task.pageSize);
      const product = readProductRoute();
      setProductId(product.productId);
      setProductStoreId(product.storeId);
      setProductReturnPath(product.returnPath);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  async function runTask(taskId: string, input: import("./types").SearchTaskOptions & { imageId: string }) {
    setSaving(true);
    try {
      await api(`/api/collection-tasks/${taskId}/search`, { method: "POST", body: JSON.stringify(input) });
      await loadTasks();
      notify("success", `第 ${input.page} 页搜图完成`);
    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setSaving(false);
    }
  }

  async function importTask(taskId: string, runId: string, storeId: string, offerIds?: string[]) {
    setSaving(true);
    try {
      const result = await api<{ imported: Array<{ title: string }>; failures: Array<{ message: string }> }>(
        `/api/collection-tasks/${taskId}/import`,
        { method: "POST", body: JSON.stringify({ runId, storeId, ...(offerIds?.length ? { offerIds } : {}) }) },
      );
      await loadTasks();
      notify(result.failures.length ? "error" : "success", result.failures.length
        ? `已导入 ${result.imported.length} 个 Shopify 商品，${result.failures.length} 个失败`
        : `已导入 ${result.imported.length} 个 Shopify 商品`);
    } catch (error) { handleApiError(error); } finally { setSaving(false); }
  }

  async function saveOneBound(key: string, secret: string) {
    setSaving(true);
    try {
      setOnebound((await api<{ settings: OneBoundSettings }>("/api/integrations/onebound", {
        method: "PUT", body: JSON.stringify({ key, secret }),
      })).settings);
      notify("success", "OneBound 设置已保存");
    } catch (error) { handleApiError(error); throw error; } finally { setSaving(false); }
  }

  async function saveGoogle(clientId: string, clientSecret: string, allowedDomain: string) {
    setSaving(true);
    try {
      setGoogle((await api<{ settings: GoogleSettings }>("/api/integrations/google", {
        method: "PUT", body: JSON.stringify({ clientId, clientSecret, allowedDomain }),
      })).settings);
      notify("success", "Google 登录配置已保存");
    } catch (error) { handleApiError(error); throw error; } finally { setSaving(false); }
  }

  async function saveAi(input: AiSettingsInput) {
    setSaving(true);
    try {
      setAi((await api<{ settings: AiSettings }>("/api/integrations/ai", {
        method: "PUT", body: JSON.stringify(input),
      })).settings);
      notify("success", "AI 配置已保存");
    } catch (error) { handleApiError(error); throw error; } finally { setSaving(false); }
  }

  async function saveStore(shopDomain: string, displayName: string, clientId: string, clientSecret: string) {
    setSaving(true);
    try {
      const result = await api<{ store: ShopifyStore }>("/api/integrations/shopify", {
        method: "PUT", body: JSON.stringify({ shopDomain, displayName, clientId, clientSecret }),
      });
      setStores((current) => [result.store, ...current.filter((store) => store.id !== result.store.id)]);
      notify("success", "Shopify 配置已保存");
    } catch (error) { handleApiError(error); throw error; } finally { setSaving(false); }
  }

  async function testStore(storeId: string) {
    setSaving(true);
    try {
      const result = await api<{ store: ShopifyStore }>(`/api/integrations/shopify/stores/${storeId}/test`, { method: "POST" });
      setStores((current) => current.map((store) => store.id === storeId ? result.store : store));
      notify("success", "Shopify 店铺连接正常");
    } catch (error) { handleApiError(error); throw error; } finally { setSaving(false); }
  }

  async function deleteStore(storeId: string) {
    setSaving(true);
    try {
      await api(`/api/integrations/shopify/stores/${storeId}`, { method: "DELETE" });
      setStores((current) => current.filter((store) => store.id !== storeId));
      notify("success", "Shopify 店铺已删除");
    } catch (error) { handleApiError(error); throw error; } finally { setSaving(false); }
  }

  async function logout() {
    try { await api("/api/auth/logout", { method: "POST" }); } finally { setUser(null); }
  }

  const openProduct = useCallback((nextProductId: string, storeId: string, returnPath: string) => {
    window.history.pushState({}, "", `/shopify/products/${encodeURIComponent(nextProductId)}${toQuery({ storeId, returnPath })}`);
    setView("shopify-products");
    setProductId(nextProductId);
    setProductStoreId(storeId);
    setProductReturnPath(returnPath);
  }, []);

  const backFromProduct = useCallback((returnPath: string) => {
    window.history.replaceState({}, "", returnPath || "/shopify/products");
    setView("shopify-products");
    setProductId(null);
    setProductStoreId("");
  }, []);

  if (user === undefined) {
    return <main className="boot-screen"><PackageSearch size={28} /><LoaderCircle className="spin" size={18} /><span>正在连接 Mailshop</span></main>;
  }
  if (!user) return <LoginScreen onLogin={setUser} />;
  const isAdmin = user.role === "admin";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "mobile-open" : ""}`}>
        <header className="sidebar-brand"><span className="sidebar-mark"><PackageSearch size={20} /></span><div><strong>MAILSHOP</strong><small>采集与 Shopify</small></div><button className="icon-button mobile-only" type="button" onClick={() => setSidebarOpen(false)} aria-label="关闭导航"><X size={18} /></button></header>
        <nav className="sidebar-nav" aria-label="主导航">
          <a className={view === "dashboard" ? "active" : ""} href={viewPaths.dashboard} onClick={(event) => handleNavigation(event, "dashboard")}><LayoutDashboard size={18} /><span>仪表台</span></a>
          {!isAdmin && <>
            <a className={view === "tasks" ? "active" : ""} href={viewPaths.tasks} onClick={(event) => handleNavigation(event, "tasks")}><ListChecks size={18} /><span>采集任务</span></a>
            <a className={view === "shopify-products" ? "active" : ""} href={viewPaths["shopify-products"]} onClick={(event) => handleNavigation(event, "shopify-products")}><Store size={18} /><span>Shopify 商品</span></a>
            <a className={view === "shopify" ? "active" : ""} href={viewPaths.shopify} onClick={(event) => handleNavigation(event, "shopify")}><Store size={18} /><span>Shopify 店铺</span></a>
            <a className={view === "credits" ? "active" : ""} href={viewPaths.credits} onClick={(event) => handleNavigation(event, "credits")}><Coins size={18} /><span>积分管理</span></a>
          </>}
          {isAdmin && <>
            <a className={view === "accounts" ? "active" : ""} href={viewPaths.accounts} onClick={(event) => handleNavigation(event, "accounts")}><Users size={18} /><span>账号管理</span></a>
            <a className={view === "settings" ? "active" : ""} href={viewPaths.settings} onClick={(event) => handleNavigation(event, "settings")}><Settings size={18} /><span>系统设置</span></a>
            <a className={view === "audit-logs" ? "active" : ""} href={viewPaths["audit-logs"]} onClick={(event) => handleNavigation(event, "audit-logs")}><ClipboardList size={18} /><span>操作日志</span></a>
          </>}
        </nav>
        <footer className="sidebar-footer"><div className="sidebar-user"><span>{user.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{user.displayName}</strong><small>{user.email || user.username}</small><small className="credit-balance">{isAdmin ? "系统管理员" : `${user.credits.toLocaleString()} 积分`}</small></div></div><button className="icon-button" type="button" onClick={logout} aria-label="退出登录" title="退出登录"><LogOut size={18} /></button></footer>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" type="button" onClick={() => setSidebarOpen(false)} aria-label="关闭导航" />}
      <main className="main-content">
        <header className="mobile-topbar"><button className="icon-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="打开导航"><Menu size={20} /></button><strong>MAILSHOP</strong><span className="mobile-credit-badge">{isAdmin ? "管理员" : `${user.credits.toLocaleString()} 积分`}</span><span className="avatar-small">{user.displayName.slice(0, 1).toUpperCase()}</span></header>
        {view === "dashboard" ? (
          isAdmin
            ? <AdminDashboard user={user} summary={summary} auditLogs={auditLogs} onAuditLogs={() => navigate("audit-logs")} onAccounts={() => navigate("accounts")} onSettings={() => navigate("settings")} />
            : <UserDashboard user={user} summary={summary} onTasks={() => navigate("tasks")} onShopifyProducts={() => navigate("shopify-products")} onStores={() => navigate("shopify")} onCredits={() => navigate("credits")} />
        ) : view === "tasks" ? (
          <SearchTasksPage tasks={tasks} total={taskTotal} page={taskPage} pageSize={taskPageSize} search={taskSearch} status={taskStatus} loading={loadingTasks} stores={stores} onSearchChange={(value) => { setTaskSearch(value); setTaskPage(1); }} onStatusChange={(value) => { setTaskStatus(value); setTaskPage(1); }} onPageChange={setTaskPage} onPageSizeChange={(value) => { setTaskPageSize(value); setTaskPage(1); }} onRefresh={() => void loadTasks()} onRun={runTask} onImport={importTask} />
        ) : view === "shopify-products" ? (
          productId
            ? <ShopifyProductEditorPage stores={stores} storeId={productStoreId} productId={productId} returnPath={productReturnPath} onBack={backFromProduct} onError={handleApiError} onNotify={(message) => notify("success", message)} />
            : <ShopifyProductsPage stores={stores} onError={handleApiError} onNotify={(message) => notify("success", message)} onOpenProduct={openProduct} />
        ) : view === "shopify" ? (
          <ShopifyStoresPage stores={stores} loading={loadingSettings} saving={saving} onSave={saveStore} onTest={testStore} onDelete={deleteStore} />
        ) : view === "credits" ? (
          <CreditsPage balance={user.credits} transactions={creditTransactions} loading={loadingCredits} />
        ) : view === "audit-logs" && isAdmin ? (
          <AuditLogsPage logs={auditLogs} loading={loadingAuditLogs} onRefresh={() => void loadAuditLogs()} />
        ) : view === "accounts" && isAdmin ? (
          <UserManager
            currentUser={user}
            users={users}
            loading={loadingUsers}
            onCreate={async (input) => setUsers((await api<{ users: User[] }>("/api/users", { method: "POST", body: JSON.stringify(input) })).users)}
            onPatch={async (userId, input) => setUsers((await api<{ users: User[] }>(`/api/users/${userId}`, { method: "PATCH", body: JSON.stringify(input) })).users)}
            onPassword={async (userId, password) => { await api(`/api/users/${userId}/password`, { method: "POST", body: JSON.stringify({ password }) }); if (userId === user.id) setUser(null); }}
          />
        ) : (
          <SettingsPage onebound={onebound} google={google} ai={ai} loading={loadingSettings} saving={saving} onSaveOneBound={saveOneBound} onSaveGoogle={saveGoogle} onSaveAi={saveAi} />
        )}
      </main>
      {errorDialog !== null && <ErrorDialog error={errorDialog} onClose={() => setErrorDialog(null)} />}
      {toast && <div className={`toast ${toast.type}`} role="status"><span>{toast.message}</span></div>}
    </div>
  );
}
