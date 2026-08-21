import {
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Coins,
  ListChecks,
  Filter,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  PackageSearch,
  RefreshCw,
  Search,
  Settings,
  Store,
  Users,
  X,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { api, ApiClientError, toQuery } from "./api";
import { ErrorDialog } from "./components/ErrorDialog";
import { LoginScreen } from "./components/LoginScreen";
import { OfferModal } from "./components/OfferModal";
import { OfferDetailModal } from "./components/OfferDetailModal";
import { ProductDetail } from "./components/ProductDetail";
import { ImageSearchModal } from "./components/ImageSearchModal";
import { ProductModal } from "./components/ProductModal";
import { SettingsPage } from "./components/SettingsPage";
import { ShopifyStoresPage } from "./components/ShopifyStoresPage";
import { UserManager } from "./components/UserManager";
import { UserDashboard } from "./components/UserDashboard";
import { CreditsPage } from "./components/CreditsPage";
import { SearchTasksPage } from "./components/SearchTasksPage";
import type {
  DashboardSummary,
  ProductDetail as ProductDetailType,
  ProductInput,
  ProductImage,
  ProductStatus,
  ProductSummary,
  StoredOfferDetail,
  OneBoundSettings,
  GoogleSettings,
  AiSettings,
  ShopifyStore,
  User,
} from "./types";

type View = "dashboard" | "products" | "tasks" | "credits" | "accounts" | "settings" | "shopify";

const viewPaths: Record<View, string> = {
  dashboard: "/dashboard",
  products: "/products",
  tasks: "/tasks",
  credits: "/credits",
  shopify: "/shopify",
  accounts: "/accounts",
  settings: "/settings",
};

const pathViews = new Map(Object.entries(viewPaths).map(([view, path]) => [path, view as View]));

function viewFromPath(pathname: string): View | null {
  const normalized = pathname !== "/" ? pathname.replace(/\/$/u, "") : pathname;
  return pathViews.get(normalized) ?? null;
}

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readProductRouteState() {
  const params = new URLSearchParams(window.location.search);
  const statusValue = params.get("status") ?? "all";
  const sourceValue = params.get("source") ?? "all";
  return {
    search: params.get("search") ?? "",
    status: ["all", "new", "image_searching", "matched", "reviewed", "archived"].includes(statusValue) ? statusValue : "all",
    source: ["all", "1688", "shopify", "manual", "other"].includes(sourceValue) ? sourceValue : "all",
    page: positiveInteger(params.get("page"), 1),
  };
}

function readTaskRouteState() {
  const params = new URLSearchParams(window.location.search);
  const statusValue = params.get("status") ?? "all";
  const pageSizeValue = positiveInteger(params.get("pageSize"), 5);
  return {
    search: params.get("search") ?? "",
    status: (["all", "unqueried", "queried", "imported"].includes(statusValue) ? statusValue : "all") as import("./types").SearchTask["status"] | "all",
    page: positiveInteger(params.get("page"), 1),
    pageSize: [5, 10, 20].includes(pageSizeValue) ? pageSizeValue : 5,
  };
}

const statusLabels: Record<ProductStatus, string> = {
  new: "待整理",
  image_searching: "待图搜",
  matched: "已匹配",
  reviewed: "已审核",
  archived: "已归档",
};

function formatPrice(product: ProductSummary): string {
  if (product.priceMin == null && product.priceMax == null) return "—";
  const format = (value: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: product.currency, maximumFractionDigits: 2 }).format(value);
  if (product.priceMax == null || product.priceMin === product.priceMax) {
    return format(product.priceMin ?? product.priceMax ?? 0);
  }
  return `${format(product.priceMin ?? 0)} – ${format(product.priceMax)}`;
}

function formatOfferPrice(priceMin: number | null | undefined, priceMax: number | null | undefined, currency: string): string {
  if (priceMin == null && priceMax == null) return "价格待补充";
  const format = (value: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  if (priceMax == null || priceMin === priceMax) return format(priceMin ?? priceMax ?? 0);
  return `${format(priceMin ?? 0)} – ${format(priceMax)}`;
}

function proxiedImageUrl(url: string): string {
  return url.startsWith("/") ? url : `/api/image-proxy${toQuery({ url })}`;
}

export default function App() {
  const initialView = viewFromPath(window.location.pathname) ?? "dashboard";
  const initialProductRoute = readProductRouteState();
  const initialTaskRoute = readTaskRouteState();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [view, setView] = useState<View>(initialView);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialView === "products" ? initialProductRoute.page : 1);
  const [pageSize] = useState(25);
  const [search, setSearch] = useState(initialView === "products" ? initialProductRoute.search : "");
  const [debouncedSearch, setDebouncedSearch] = useState(initialView === "products" ? initialProductRoute.search : "");
  const [status, setStatus] = useState(initialView === "products" ? initialProductRoute.status : "all");
  const [source, setSource] = useState(initialView === "products" ? initialProductRoute.source : "all");
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductDetailType | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [expandedProducts, setExpandedProducts] = useState<Record<string, ProductDetailType>>({});
  const [loadingExpandedProductId, setLoadingExpandedProductId] = useState<string | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<StoredOfferDetail | null>(null);
  const [offerDetailOpen, setOfferDetailOpen] = useState(false);
  const [loadingOfferDetail, setLoadingOfferDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [imageSearchTarget, setImageSearchTarget] = useState<ProductImage | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [oneboundSettings, setOneboundSettings] = useState<OneBoundSettings | null>(null);
  const [googleSettings, setGoogleSettings] = useState<GoogleSettings | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [shopifyStores, setShopifyStores] = useState<ShopifyStore[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [errorDialog, setErrorDialog] = useState<unknown>(null);
  const [creditTransactions, setCreditTransactions] = useState<import("./types").CreditTransaction[]>([]);
  const [loadingCredits, setLoadingCredits] = useState(false);
  const [searchTasks, setSearchTasks] = useState<import("./types").SearchTask[]>([]);
  const [loadingSearchTasks, setLoadingSearchTasks] = useState(false);
  const [searchTasksTotal, setSearchTasksTotal] = useState(0);
  const [searchTaskSearch, setSearchTaskSearch] = useState(initialView === "tasks" ? initialTaskRoute.search : "");
  const [debouncedSearchTaskSearch, setDebouncedSearchTaskSearch] = useState(initialView === "tasks" ? initialTaskRoute.search : "");
  const [searchTaskStatus, setSearchTaskStatus] = useState<import("./types").SearchTask["status"] | "all">(initialView === "tasks" ? initialTaskRoute.status : "all");
  const [searchTaskPage, setSearchTaskPage] = useState(initialView === "tasks" ? initialTaskRoute.page : 1);
  const [searchTaskPageSize, setSearchTaskPageSize] = useState(initialView === "tasks" ? initialTaskRoute.pageSize : 5);

  const navigate = useCallback((nextView: View, options?: { replace?: boolean }) => {
    const nextPath = viewPaths[nextView];
    const currentLocation = `${window.location.pathname}${window.location.search}`;
    if (currentLocation !== nextPath) {
      window.history[options?.replace ? "replaceState" : "pushState"]({}, "", nextPath);
    }
    setView(nextView);
    setSidebarOpen(false);
    setSelectedProduct(null);
    setExpandedProductId(null);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const handleNavigation = useCallback((event: ReactMouseEvent<HTMLAnchorElement>, nextView: View) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(nextView);
  }, [navigate]);

  const notify = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2_800);
  }, []);

  const handleApiError = useCallback((caught: unknown) => {
    if (caught instanceof ApiClientError && caught.status === 401) {
      setUser(null);
      setSelectedProduct(null);
      return;
    }
    setErrorDialog(caught);
  }, []);

  useEffect(() => {
    api<{ user: User }>("/api/auth/me")
      .then((result) => setUser(result.user))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    const routeView = viewFromPath(window.location.pathname);
    if (!routeView) navigate("dashboard", { replace: true });

    const handlePopState = () => {
      const nextView = viewFromPath(window.location.pathname) ?? "dashboard";
      if (!viewFromPath(window.location.pathname)) {
        window.history.replaceState({}, "", viewPaths.dashboard);
      }
      if (nextView === "products") {
        const route = readProductRouteState();
        setSearch(route.search);
        setDebouncedSearch(route.search);
        setStatus(route.status);
        setSource(route.source);
        setPage(route.page);
      } else if (nextView === "tasks") {
        const route = readTaskRouteState();
        setSearchTaskSearch(route.search);
        setDebouncedSearchTaskSearch(route.search);
        setSearchTaskStatus(route.status);
        setSearchTaskPage(route.page);
        setSearchTaskPageSize(route.pageSize);
      }
      setSelectedProduct(null);
      setExpandedProductId(null);
      setSidebarOpen(false);
      setView(nextView);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [navigate]);

  useEffect(() => {
    if (user?.role === "user" && (view === "accounts" || view === "settings")) navigate("dashboard", { replace: true });
  }, [navigate, user, view]);

  useEffect(() => {
    const titles: Record<View, string> = {
      dashboard: "仪表台",
      products: "商品管理",
      tasks: "查询任务",
      credits: "积分管理",
      shopify: "Shopify 店铺",
      accounts: "账号管理",
      settings: "系统设置",
    };
    document.title = `${titles[view]} | Mailshop 商品中台`;
  }, [view]);

  useEffect(() => {
    const updateCredits = (event: Event) => {
      const balance = (event as CustomEvent<number>).detail;
      setUser((current) => current ? { ...current, credits: balance } : current);
    };
    window.addEventListener("mailshop:credits", updateCredits);
    return () => window.removeEventListener("mailshop:credits", updateCredits);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (view !== "products" || window.location.pathname !== viewPaths.products) return;
    const nextUrl = `${viewPaths.products}${toQuery({
      search,
      status: status !== "all" ? status : undefined,
      source: source !== "all" ? source : undefined,
      page: page > 1 ? page : undefined,
    })}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl !== nextUrl) window.history.replaceState({}, "", nextUrl);
  }, [page, search, source, status, view]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchTaskSearch(searchTaskSearch);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [searchTaskSearch]);

  useEffect(() => {
    if (view !== "tasks" || window.location.pathname !== viewPaths.tasks) return;
    const nextUrl = `${viewPaths.tasks}${toQuery({
      search: searchTaskSearch,
      status: searchTaskStatus !== "all" ? searchTaskStatus : undefined,
      page: searchTaskPage > 1 ? searchTaskPage : undefined,
      pageSize: searchTaskPageSize !== 5 ? searchTaskPageSize : undefined,
    })}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl !== nextUrl) window.history.replaceState({}, "", nextUrl);
  }, [searchTaskPage, searchTaskPageSize, searchTaskSearch, searchTaskStatus, view]);

  const loadSummary = useCallback(async () => {
    try {
      const result = await api<{ summary: DashboardSummary }>("/api/dashboard");
      setSummary(result.summary);
    } catch (caught) {
      handleApiError(caught);
    }
  }, [handleApiError]);

  const loadCredits = useCallback(async () => {
    setLoadingCredits(true);
    try {
      const result = await api<{ credits: { balance: number; transactions: import("./types").CreditTransaction[] } }>("/api/credits");
      setCreditTransactions(result.credits.transactions);
      setUser((current) => current ? { ...current, credits: result.credits.balance } : current);
    } catch (caught) {
      handleApiError(caught);
    } finally {
      setLoadingCredits(false);
    }
  }, [handleApiError]);

  const loadSearchTasks = useCallback(async () => {
    setLoadingSearchTasks(true);
    try {
      const result = await api<{
        tasks: import("./types").SearchTask[];
        total: number;
        page: number;
        pageSize: number;
      }>(`/api/search-tasks${toQuery({
        search: debouncedSearchTaskSearch,
        status: searchTaskStatus,
        page: searchTaskPage,
        pageSize: searchTaskPageSize,
      })}`);
      setSearchTasks(result.tasks);
      setSearchTasksTotal(result.total);
    } catch (caught) {
      handleApiError(caught);
    } finally {
      setLoadingSearchTasks(false);
    }
  }, [debouncedSearchTaskSearch, handleApiError, searchTaskPage, searchTaskPageSize, searchTaskStatus]);

  useEffect(() => {
    if (!user || view !== "tasks") return;
    const pageCount = Math.max(1, Math.ceil(searchTasksTotal / searchTaskPageSize));
    if (searchTaskPage > pageCount) setSearchTaskPage(pageCount);
  }, [searchTaskPage, searchTaskPageSize, searchTasksTotal, user, view]);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const result = await api<{ items: ProductSummary[]; total: number }>(
        `/api/products${toQuery({ search: debouncedSearch, status, source, page, pageSize })}`,
      );
      setProducts(result.items);
      setTotal(result.total);
    } catch (caught) {
      handleApiError(caught);
    } finally {
      setLoadingProducts(false);
    }
  }, [debouncedSearch, handleApiError, page, pageSize, source, status]);

  useEffect(() => {
    if (!user || view !== "products") return;
    void loadProducts();
  }, [loadProducts, user, view]);

  useEffect(() => {
    if (!user) return;
    void loadSummary();
  }, [loadSummary, user]);

  useEffect(() => {
    if (!user) return;
    api<{ stores: ShopifyStore[] }>("/api/integrations/shopify")
      .then((result) => setShopifyStores(result.stores))
      .catch(handleApiError);
  }, [handleApiError, user]);

  useEffect(() => {
    if (user && view === "credits") void loadCredits();
  }, [loadCredits, user, view]);

  useEffect(() => {
    if (user && view === "tasks") void loadSearchTasks();
  }, [loadSearchTasks, user, view]);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const result = await api<{ users: User[] }>("/api/users");
      setUsers(result.users);
    } catch (caught) {
      handleApiError(caught);
    } finally {
      setLoadingUsers(false);
    }
  }, [handleApiError]);

  useEffect(() => {
    if (user && view === "accounts") void loadUsers();
  }, [loadUsers, user, view]);

  const loadOneBoundSettings = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const [onebound, google, ai, shopify] = await Promise.all([
        api<{ settings: OneBoundSettings }>("/api/integrations/onebound"),
        api<{ settings: GoogleSettings }>("/api/integrations/google"),
        api<{ settings: AiSettings }>("/api/integrations/ai"),
        api<{ stores: ShopifyStore[] }>("/api/integrations/shopify"),
      ]);
      setOneboundSettings(onebound.settings);
      setGoogleSettings(google.settings);
      setAiSettings(ai.settings);
      setShopifyStores(shopify.stores);
    } catch (caught) {
      handleApiError(caught);
    } finally {
      setLoadingSettings(false);
    }
  }, [handleApiError]);

  useEffect(() => {
    if (user && view === "settings") void loadOneBoundSettings();
  }, [loadOneBoundSettings, user, view]);

  async function selectProduct(productId: string) {
    setLoadingDetail(true);
    try {
      const result = await api<{ product: ProductDetailType }>(`/api/products/${productId}`);
      setSelectedProduct(result.product);
    } catch (caught) {
      handleApiError(caught);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function toggleProductRow(productId: string) {
    if (expandedProductId === productId) {
      setExpandedProductId(null);
      return;
    }
    setExpandedProductId(productId);
    if (expandedProducts[productId]) return;
    setLoadingExpandedProductId(productId);
    try {
      const result = await api<{ product: ProductDetailType }>(`/api/products/${productId}`);
      setExpandedProducts((current) => ({ ...current, [productId]: result.product }));
    } catch (caught) {
      setExpandedProductId(null);
      handleApiError(caught);
    } finally {
      setLoadingExpandedProductId((current) => current === productId ? null : current);
    }
  }

  async function openOfferDetail(offerId: string) {
    setOfferDetailOpen(true);
    setSelectedOffer(null);
    setLoadingOfferDetail(true);
    try {
      const result = await api<{ offer: StoredOfferDetail }>(`/api/offers/${encodeURIComponent(offerId)}`);
      setSelectedOffer(result.offer);
    } catch (caught) {
      setOfferDetailOpen(false);
      handleApiError(caught);
    } finally {
      setLoadingOfferDetail(false);
    }
  }

  async function runSearchTask(taskId: string, input: import("./types").SearchTaskOptions & { imageId: string }) {
    setSaving(true);
    try {
      await api(`/api/search-tasks/${taskId}/search`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      await loadSearchTasks();
      notify("success", `第 ${input.page} 页查询完成`);
    } catch (caught) {
      handleApiError(caught);
      throw caught;
    } finally {
      setSaving(false);
    }
  }

  async function importSearchTaskProducts(taskId: string, runId: string, offerIds?: string[]) {
    setSaving(true);
    try {
      const result = await api<{ imported: Array<{ title: string }>; failures: Array<{ message: string }> }>("/api/search-tasks/" + taskId + "/import", {
        method: "POST",
        body: JSON.stringify({ runId, ...(offerIds?.length ? { offerIds } : {}) }),
      });
      await Promise.all([loadSearchTasks(), loadProducts(), loadSummary()]);
      notify(result.failures.length ? "error" : "success", result.failures.length ? "已导入 " + result.imported.length + " 个商品，" + result.failures.length + " 个失败" : "已导入 " + result.imported.length + " 个 1688 商品");
    } catch (caught) {
      handleApiError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function createProduct(input: ProductInput) {
    setSaving(true);
    try {
      const result = await api<{ product: ProductDetailType }>("/api/products", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setProductModalOpen(false);
      setSelectedProduct(result.product);
      setExpandedProducts((current) => ({ ...current, [result.product.id]: result.product }));
      await Promise.all([loadProducts(), loadSummary()]);
      notify("success", "商品已创建");
    } finally {
      setSaving(false);
    }
  }

  async function patchSelected(patch: Record<string, unknown>) {
    if (!selectedProduct) return;
    setSaving(true);
    try {
      const result = await api<{ product: ProductDetailType }>(`/api/products/${selectedProduct.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setSelectedProduct(result.product);
      setExpandedProducts((current) => ({ ...current, [result.product.id]: result.product }));
      await Promise.all([loadProducts(), loadSummary()]);
      notify("success", "商品已更新");
    } catch (caught) {
      handleApiError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function addOffer(input: Record<string, unknown>) {
    if (!selectedProduct) return;
    setSaving(true);
    try {
      const result = await api<{ product: ProductDetailType }>(`/api/products/${selectedProduct.id}/offers`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      setSelectedProduct(result.product);
      setExpandedProducts((current) => ({ ...current, [result.product.id]: result.product }));
      setOfferModalOpen(false);
      await Promise.all([loadProducts(), loadSummary()]);
      notify("success", "1688 候选已关联");
    } finally {
      setSaving(false);
    }
  }

  async function removeOffer(linkId: string) {
    if (!selectedProduct) return;
    try {
      const result = await api<{ product: ProductDetailType }>(`/api/products/${selectedProduct.id}/offers/${linkId}`, { method: "DELETE" });
      setSelectedProduct(result.product);
      setExpandedProducts((current) => ({ ...current, [result.product.id]: result.product }));
      await Promise.all([loadProducts(), loadSummary()]);
      notify("success", "关联已移除");
    } catch (caught) {
      handleApiError(caught);
    }
  }

  async function uploadImage(file: File) {
    if (!selectedProduct) return;
    const form = new FormData();
    form.set("productId", selectedProduct.id);
    form.set("file", file);
    try {
      await api("/api/uploads", { method: "POST", body: form });
      await selectProduct(selectedProduct.id);
      await loadProducts();
      notify("success", "图片已上传");
    } catch (caught) {
      handleApiError(caught);
    }
  }

  function searchImage(image: ProductImage) {
    setImageSearchTarget(image);
  }

  async function handleCandidatesSaved(product: ProductDetailType, savedCount: number, failureCount: number) {
    setSelectedProduct(product);
    setExpandedProducts((current) => ({ ...current, [product.id]: product }));
    await Promise.all([loadProducts(), loadSummary()]);
    notify(
      failureCount ? "error" : "success",
      failureCount ? `已保存 ${savedCount} 个候选，${failureCount} 个失败` : `已保存 ${savedCount} 个 1688 候选`,
    );
  }

  async function saveOneBoundSettings(key: string, secret: string) {
    setSaving(true);
    try {
      const result = await api<{ settings: OneBoundSettings }>("/api/integrations/onebound", {
        method: "PUT",
        body: JSON.stringify({ key, secret }),
      });
      setOneboundSettings(result.settings);
      notify("success", "OneBound 设置已保存");
    } catch (caught) {
      handleApiError(caught);
      throw caught;
    } finally {
      setSaving(false);
    }
  }

  async function saveGoogleSettings(clientId: string, clientSecret: string, allowedDomain: string) {
    setSaving(true);
    try {
      const result = await api<{ settings: GoogleSettings }>("/api/integrations/google", {
        method: "PUT",
        body: JSON.stringify({ clientId, clientSecret, allowedDomain }),
      });
      setGoogleSettings(result.settings);
      notify("success", "Google 登录配置已保存");
    } catch (caught) {
      handleApiError(caught);
      throw caught;
    } finally {
      setSaving(false);
    }
  }

  async function saveAiSettings(baseUrl: string, apiKey: string, modelId: string) {
    setSaving(true);
    try {
      const result = await api<{ settings: AiSettings }>("/api/integrations/ai", {
        method: "PUT",
        body: JSON.stringify({ baseUrl, apiKey, modelId }),
      });
      setAiSettings(result.settings);
      notify("success", "AI 模型配置已保存");
    } catch (caught) {
      handleApiError(caught);
      throw caught;
    } finally {
      setSaving(false);
    }
  }

  async function saveShopifySettings(shopDomain: string, displayName: string, clientId: string, clientSecret: string) {
    setSaving(true);
    try {
      const result = await api<{ store: ShopifyStore }>("/api/integrations/shopify", {
        method: "PUT",
        body: JSON.stringify({ shopDomain, displayName, clientId, clientSecret }),
      });
      setShopifyStores((stores) => [result.store, ...stores.filter((store) => store.id !== result.store.id)]);
      notify("success", "Shopify 配置已保存");
    } catch (caught) {
      handleApiError(caught);
      throw caught;
    } finally {
      setSaving(false);
    }
  }

  async function testShopifyStore(storeId: string) {
    setSaving(true);
    try {
      const result = await api<{ store: ShopifyStore }>(`/api/integrations/shopify/stores/${storeId}/test`, { method: "POST" });
      setShopifyStores((stores) => stores.map((store) => store.id === storeId ? result.store : store));
      notify("success", "Shopify 店铺连接正常");
    } catch (caught) {
      handleApiError(caught);
      throw caught;
    } finally {
      setSaving(false);
    }
  }

  async function deleteShopifyStore(storeId: string) {
    setSaving(true);
    try {
      await api(`/api/integrations/shopify/stores/${storeId}`, { method: "DELETE" });
      setShopifyStores((stores) => stores.filter((store) => store.id !== storeId));
      notify("success", "Shopify 店铺已删除");
    } catch (caught) {
      handleApiError(caught);
      throw caught;
    } finally {
      setSaving(false);
    }
  }

  async function publishSelectedToShopify(storeId: string) {
    if (!selectedProduct) return;
    setSaving(true);
    try {
      const result = await api<{ product: ProductDetailType; publication: { warnings: string[] } }>(`/api/products/${selectedProduct.id}/shopify`, {
        method: "POST",
        body: JSON.stringify({ storeId }),
      });
      setSelectedProduct(result.product);
      setExpandedProducts((current) => ({ ...current, [result.product.id]: result.product }));
      await Promise.all([loadProducts(), loadSummary()]);
      notify(result.publication.warnings.length ? "error" : "success", result.publication.warnings.length ? `商品已上传，${result.publication.warnings.length} 张图片需要检查` : "商品已上传到 Shopify 草稿");
    } catch (caught) {
      handleApiError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function archiveProduct() {
    if (!selectedProduct) return;
    try {
      await api(`/api/products/${selectedProduct.id}`, { method: "DELETE" });
      setSelectedProduct(null);
      await Promise.all([loadProducts(), loadSummary()]);
      notify("success", "商品已归档");
    } catch (caught) {
      handleApiError(caught);
    }
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      setSelectedProduct(null);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const statusCounts = useMemo(() => [
    { label: "商品总数", value: summary?.total ?? 0, key: "total" },
    { label: "待图搜", value: summary?.searchingCount ?? 0, key: "searching" },
    { label: "已匹配", value: summary?.matchedCount ?? 0, key: "matched" },
    { label: "1688 商品", value: summary?.offerCount ?? 0, key: "offers" },
  ], [summary]);

  if (user === undefined) {
    return <main className="boot-screen"><PackageSearch size={28} /><LoaderCircle className="spin" size={18} /><span>正在连接商品中台</span></main>;
  }
  if (!user) return <LoginScreen onLogin={setUser} />;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "mobile-open" : ""}`}>
        <header className="sidebar-brand"><span className="sidebar-mark"><PackageSearch size={20} /></span><div><strong>MAILSHOP</strong><small>商品中台</small></div><button className="icon-button mobile-only" type="button" onClick={() => setSidebarOpen(false)} aria-label="关闭导航"><X size={18} /></button></header>
        <nav className="sidebar-nav" aria-label="主导航">
          <a className={view === "dashboard" ? "active" : ""} href={viewPaths.dashboard} onClick={(event) => handleNavigation(event, "dashboard")}><LayoutDashboard size={18} /><span>仪表台</span></a>
          <a className={view === "products" ? "active" : ""} href={viewPaths.products} onClick={(event) => handleNavigation(event, "products")}><PackageSearch size={18} /><span>商品管理</span>{summary?.searchingCount ? <em>{summary.searchingCount}</em> : null}</a>
          <a className={view === "credits" ? "active" : ""} href={viewPaths.credits} onClick={(event) => handleNavigation(event, "credits")}><Coins size={18} /><span>积分管理</span></a>
          <a className={view === "tasks" ? "active" : ""} href={viewPaths.tasks} onClick={(event) => handleNavigation(event, "tasks")}><ListChecks size={18} /><span>查询任务</span></a>
          <a className={view === "shopify" ? "active" : ""} href={viewPaths.shopify} onClick={(event) => handleNavigation(event, "shopify")}><Store size={18} /><span>Shopify 店铺</span>{shopifyStores.length ? <em>{shopifyStores.length}</em> : null}</a>
          {user.role === "admin" && <><a className={view === "accounts" ? "active" : ""} href={viewPaths.accounts} onClick={(event) => handleNavigation(event, "accounts")}><Users size={18} /><span>账号管理</span></a><a className={view === "settings" ? "active" : ""} href={viewPaths.settings} onClick={(event) => handleNavigation(event, "settings")}><Settings size={18} /><span>系统设置</span></a></>}
        </nav>
        <footer className="sidebar-footer"><div className="sidebar-user"><span>{user.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{user.displayName}</strong><small>{user.email || user.username}</small><small className="credit-balance">{user.credits.toLocaleString()} 积分</small></div></div><button className="icon-button" type="button" onClick={logout} aria-label="退出登录" title="退出登录"><LogOut size={18} /></button></footer>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" type="button" onClick={() => setSidebarOpen(false)} aria-label="关闭导航" />}

      <main className="main-content">
        <header className="mobile-topbar"><button className="icon-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="打开导航"><Menu size={20} /></button><strong>MAILSHOP</strong><span className="mobile-credit-badge">{user.credits.toLocaleString()} 积分</span><span className="avatar-small">{user.displayName.slice(0, 1).toUpperCase()}</span></header>

        {view === "dashboard" ? (
          <UserDashboard user={user} summary={summary} onProducts={() => navigate("products")} onCredits={() => navigate("credits")} />
        ) : view === "credits" ? (
          <CreditsPage balance={user.credits} transactions={creditTransactions} loading={loadingCredits} />
        ) : view === "tasks" ? (
          <SearchTasksPage
            tasks={searchTasks}
            total={searchTasksTotal}
            page={searchTaskPage}
            pageSize={searchTaskPageSize}
            search={searchTaskSearch}
            status={searchTaskStatus}
            loading={loadingSearchTasks}
            onSearchChange={(value) => { setSearchTaskSearch(value); setSearchTaskPage(1); }}
            onStatusChange={(value) => { setSearchTaskStatus(value); setSearchTaskPage(1); }}
            onPageChange={setSearchTaskPage}
            onPageSizeChange={(value) => { setSearchTaskPageSize(value); setSearchTaskPage(1); }}
            onRefresh={() => void loadSearchTasks()}
            onRun={runSearchTask}
            onImport={importSearchTaskProducts}
          />
        ) : view === "products" ? (
          <section className="products-view">
            <header className="page-heading products-heading">
              <div><span>PRODUCT OPERATIONS</span><h1>商品管理</h1><p>管理从查询任务导入的 1688 商品，并发布到 Shopify 店铺</p></div>
              <button className="button primary" type="button" onClick={() => navigate("tasks")}><PackageSearch size={17} />从查询任务导入</button>
            </header>

            <section className="stats-band" aria-label="商品统计">{statusCounts.map((item) => <div key={item.key} className={`stat-item ${item.key}`}><span>{item.label}</span><strong>{item.value}</strong></div>)}</section>

            <section className={`workspace ${selectedProduct || loadingDetail ? "has-detail" : ""}`}>
              <div className="product-list-panel">
                <div className="toolbar">
                  <label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索标题、供应商、商品 ID 或 SKU" aria-label="搜索商品" /></label>
                  <div className="filter-group"><Filter size={16} /><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="按状态筛选"><option value="all">全部状态</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={source} onChange={(event) => { setSource(event.target.value); setPage(1); }} aria-label="按来源筛选"><option value="all">全部来源</option><option value="1688">1688</option><option value="shopify">Shopify</option><option value="manual">手动录入</option><option value="other">其他</option></select><button className="icon-button" type="button" onClick={() => { void loadProducts(); void loadSummary(); }} aria-label="刷新" title="刷新"><RefreshCw className={loadingProducts ? "spin" : ""} size={17} /></button></div>
                </div>

                <div className="table-meta"><span>{total} 个商品</span><span>第 {page} / {pageCount} 页</span></div>
                <div className="table-scroll product-table-scroll">
                  <table className="data-table product-table">
                    <thead><tr><th>商品</th><th>来源</th><th>售价</th><th>SKU / 图片</th><th>1688</th><th>状态</th><th>更新</th><th><span className="sr-only">操作</span></th></tr></thead>
                    <tbody>
                      {loadingProducts ? <tr><td colSpan={8}><div className="page-loading"><LoaderCircle className="spin" size={21} />加载商品</div></td></tr> : products.length ? products.map((product) => {
                        const expanded = expandedProductId === product.id;
                        const expandedProduct = expandedProducts[product.id];
                        return <Fragment key={product.id}>
                          <tr
                            className={`product-row ${selectedProduct?.id === product.id ? "selected" : ""} ${expanded ? "expanded" : ""}`}
                            tabIndex={0}
                            aria-expanded={expanded}
                            onClick={() => product.sourcePlatform === "1688" ? void selectProduct(product.id) : void toggleProductRow(product.id)}
                            onKeyDown={(event) => {
                              if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
                              event.preventDefault();
                              if (product.sourcePlatform === "1688") void selectProduct(product.id);
                              else void toggleProductRow(product.id);
                            }}
                          >
                            <td><div className="product-cell"><span className={`row-chevron ${expanded ? "expanded" : ""}`}>{product.sourcePlatform !== "1688" && <ChevronDown size={15} />}</span><span className="product-thumb">{product.thumbnailUrl ? <img src={product.thumbnailUrl} alt="" /> : <Boxes size={19} />}</span><span className="product-primary"><strong>{product.title}</strong><small>{product.vendor || product.externalId}</small></span><button className="button quiet compact mobile-row-detail-button" type="button" onClick={(event) => { event.stopPropagation(); void selectProduct(product.id); }}>详情</button></div></td>
                            <td><span className={`source-badge ${product.sourcePlatform}`}>{product.sourcePlatform}</span><small className="cell-subtext">{product.sourceStore || "—"}</small></td>
                            <td>{formatPrice(product)}</td>
                            <td><span className="count-pair"><b>{product.variantCount}</b> SKU</span><small className="cell-subtext">{product.imageCount} 张图</small></td>
                            <td>{product.sourcePlatform === "1688" ? <><span className="mono">{product.offerId1688 || product.externalId}</span><small className="cell-subtext">{product.supplierName1688 || product.vendor || "1688"}</small></> : <span className={product.offerCount ? "offer-count active" : "offer-count"}>{product.offerCount}</span>}</td>
                            <td><span className={`status-label ${product.status}`}><i />{statusLabels[product.status]}</span></td>
                            <td><time dateTime={product.updatedAt}>{new Date(product.updatedAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}</time></td>
                            <td className="actions-cell"><button className="button quiet compact product-detail-button" type="button" onClick={(event) => { event.stopPropagation(); void selectProduct(product.id); }}>商品详情</button></td>
                          </tr>
                          {product.sourcePlatform !== "1688" && expanded && <tr className="candidate-child-row"><td colSpan={8}>
                            <div className="candidate-child-panel">
                              <header><div><span>1688 SOURCING</span><strong>候选货源</strong></div><small>{expandedProduct ? `${expandedProduct.offers.length} 个候选` : "正在读取"}</small></header>
                              {loadingExpandedProductId === product.id ? <div className="candidate-child-state"><LoaderCircle className="spin" size={18} />加载候选货源</div> : expandedProduct?.offers.length ? <div className="candidate-list-wrap"><table className="candidate-table"><thead><tr><th>货源商品</th><th>供应商</th><th>价格 / 起批</th><th>SKU</th><th>匹配状态</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{expandedProduct.offers.map((offer) => <tr key={offer.linkId}><td><div className="candidate-product"><span className="candidate-thumb">{offer.thumbnailUrl ? <img src={proxiedImageUrl(offer.thumbnailUrl)} alt="" loading="lazy" /> : <PackageSearch size={18} />}</span><div className="candidate-product-copy"><strong>{offer.title}</strong><small className="mono">{offer.offerId}</small></div><button className="button quiet compact mobile-candidate-detail-button" type="button" onClick={() => void openOfferDetail(offer.offerId)}>详情</button></div></td><td><strong className="candidate-supplier">{offer.supplierName || "待补充"}</strong><small>{[offer.province, offer.city].filter(Boolean).join(" ") || "—"}</small></td><td><strong className="candidate-price">{formatOfferPrice(offer.priceMin, offer.priceMax, offer.currency)}</strong><small>{offer.minOrderQuantity ? `${offer.minOrderQuantity}${offer.unit || "件"}起批` : "起批量待补充"}</small></td><td><span className="count-pair"><b>{offer.variantCount}</b> SKU</span></td><td><span className={`match-badge ${offer.matchStatus}`}>{offer.matchStatus === "selected" ? "已选定" : offer.matchStatus === "rejected" ? "已排除" : "候选"}</span></td><td className="actions-cell"><button className="button quiet compact" type="button" onClick={() => void openOfferDetail(offer.offerId)}>查看详情</button></td></tr>)}</tbody></table></div> : <div className="candidate-child-state"><PackageSearch size={19} /><span>这个商品还没有 1688 候选货源</span></div>}
                            </div>
                          </td></tr>}
                        </Fragment>;
                      }) : <tr><td colSpan={8}><div className="empty-table"><PackageSearch size={25} /><strong>没有符合条件的商品</strong><button className="button quiet" type="button" onClick={() => navigate("tasks")}>前往查询任务</button></div></td></tr>}
                    </tbody>
                  </table>
                </div>
                <footer className="pagination"><button className="icon-button" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} aria-label="上一页"><ChevronLeft size={18} /></button><span>{page} / {pageCount}</span><button className="icon-button" type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)} aria-label="下一页"><ChevronRight size={18} /></button></footer>
              </div>

              <ProductDetail product={selectedProduct} shopifyStores={shopifyStores} loading={loadingDetail} saving={saving} onClose={() => setSelectedProduct(null)} onPatch={patchSelected} onOpenOffer={() => setOfferModalOpen(true)} onRemoveOffer={removeOffer} onUpload={uploadImage} onImageSearch={searchImage} onPublishShopify={publishSelectedToShopify} onArchive={archiveProduct} />
            </section>
          </section>
        ) : view === "shopify" ? (
          <ShopifyStoresPage stores={shopifyStores} loading={loadingSettings} saving={saving} onSave={saveShopifySettings} onTest={testShopifyStore} onDelete={deleteShopifyStore} />
        ) : view === "accounts" && user.role === "admin" ? (
          <UserManager
            currentUser={user}
            users={users}
            loading={loadingUsers}
            onCreate={async (input) => { const result = await api<{ users: User[] }>("/api/users", { method: "POST", body: JSON.stringify(input) }); setUsers(result.users); notify("success", "账号已创建"); }}
            onPatch={async (userId, patch) => { try { const result = await api<{ users: User[] }>(`/api/users/${userId}`, { method: "PATCH", body: JSON.stringify(patch) }); setUsers(result.users); notify("success", "账号状态已更新"); } catch (caught) { handleApiError(caught); } }}
            onPassword={async (userId, password) => { try { await api(`/api/users/${userId}/password`, { method: "POST", body: JSON.stringify({ password }) }); notify("success", "密码已重置"); if (userId === user.id) setUser(null); } catch (caught) { handleApiError(caught); throw caught; } }}
          />
        ) : user.role === "admin" ? (
          <SettingsPage onebound={oneboundSettings} google={googleSettings} ai={aiSettings} shopifyStores={shopifyStores} loading={loadingSettings} saving={saving} onSaveOneBound={saveOneBoundSettings} onSaveGoogle={saveGoogleSettings} onSaveAi={saveAiSettings} onSaveShopify={saveShopifySettings} onTestShopify={testShopifyStore} />
        ) : (
          <UserDashboard user={user} summary={summary} onProducts={() => navigate("products")} onCredits={() => navigate("credits")} />
        )}
      </main>

      <ProductModal open={productModalOpen} saving={saving} onClose={() => setProductModalOpen(false)} onSave={createProduct} />
      <OfferModal open={offerModalOpen} saving={saving} onClose={() => setOfferModalOpen(false)} onSave={addOffer} />
      {offerDetailOpen && <OfferDetailModal detail={selectedOffer} loading={loadingOfferDetail} onClose={() => { setOfferDetailOpen(false); setSelectedOffer(null); }} />}
      {selectedProduct && imageSearchTarget && <ImageSearchModal
        product={selectedProduct}
        image={imageSearchTarget}
        onClose={() => setImageSearchTarget(null)}
        onSaved={handleCandidatesSaved}
      />}
      {errorDialog !== null && <ErrorDialog error={errorDialog} onClose={() => setErrorDialog(null)} />}
      {toast && <div className={`toast ${toast.type}`} role="status"><span>{toast.message}</span></div>}
    </div>
  );
}
