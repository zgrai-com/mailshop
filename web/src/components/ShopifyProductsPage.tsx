import {
  Archive,
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Filter,
  LoaderCircle,
  Package,
  Pencil,
  RefreshCw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api, toQuery } from "../api";
import type { ShopifyRemoteProduct, ShopifyStore } from "../types";

type Props = {
  stores: ShopifyStore[];
  onError: (error: unknown) => void;
  onNotify: (message: string) => void;
  onOpenProduct: (productId: string, storeId: string, returnPath: string) => void;
};

const statusLabels: Record<string, string> = {
  ACTIVE: "在售",
  DRAFT: "草稿",
  ARCHIVED: "已归档",
  UNLISTED: "未上架",
};

function money(product: ShopifyRemoteProduct): string {
  if (product.priceMin == null && product.priceMax == null) return "未定价";
  const format = (value: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: product.currency, maximumFractionDigits: 2 }).format(value);
  return product.priceMax == null || product.priceMin === product.priceMax
    ? format(product.priceMin ?? product.priceMax ?? 0)
    : format(product.priceMin ?? 0) + " - " + format(product.priceMax);
}

function listReturnPath(state: { storeId: string; search: string; status: string; inventory: string; productType: string; vendor: string; sortKey: string; reverse: boolean; pageSize: number; page: number; after: string | null }): string {
  return "/shopify/products" + toQuery({ storeId: state.storeId, search: state.search, status: state.status, inventory: state.inventory, productType: state.productType, vendor: state.vendor, sortKey: state.sortKey, reverse: String(state.reverse), first: state.pageSize, page: state.page > 1 ? state.page : undefined, after: state.page > 1 ? state.after ?? undefined : undefined });
}

export function ShopifyProductsPage({ stores, onError, onNotify, onOpenProduct }: Props) {
  const activeStores = useMemo(() => stores.filter((store) => store.status === "active" && store.configured), [stores]);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [storeId, setStoreId] = useState(params.get("storeId") ?? "");
  const [products, setProducts] = useState<ShopifyRemoteProduct[]>([]);
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "all");
  const [inventory, setInventory] = useState(params.get("inventory") ?? "all");
  const [productType, setProductType] = useState(params.get("productType") ?? "");
  const [vendor, setVendor] = useState(params.get("vendor") ?? "");
  const [sortKey, setSortKey] = useState(params.get("sortKey") ?? "UPDATED_AT");
  const [reverse, setReverse] = useState(params.get("reverse") !== "false");
  const [pageSize, setPageSize] = useState(Number(params.get("first")) || 25);
  const requestedPage = Math.max(1, Number(params.get("page")) || 1);
  const initialAfter = params.get("after");
  const initialPage = requestedPage > 1 && !initialAfter ? 1 : requestedPage;
  const [page, setPage] = useState(initialPage);
  const [cursors, setCursors] = useState<Record<number, string | null>>({ 1: null, ...(initialPage > 1 && initialAfter ? { [initialPage]: initialAfter } : {}) });
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!storeId && activeStores[0]) setStoreId(activeStores[0].id);
    if (storeId && !activeStores.some((store) => store.id === storeId)) setStoreId(activeStores[0]?.id ?? "");
  }, [activeStores, storeId]);

  const resetPagination = useCallback(() => {
    setPage(1);
    setCursors({ 1: null });
  }, []);

  const fetchList = useCallback(async (targetPage: number, after: string | null) => {
    if (!storeId) return;
    setLoading(true);
    try {
      const result = await api<{ products: ShopifyRemoteProduct[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }>(
        "/api/shopify/stores/" + storeId + "/products" + toQuery({ storeId, search, status, inventory, productType, vendor, sortKey, reverse: String(reverse), first: pageSize, after: after ?? undefined }),
      );
      setProducts(result.products);
      setHasNext(result.pageInfo.hasNextPage);
      if (result.pageInfo.endCursor) setCursors((current) => ({ ...current, [targetPage + 1]: result.pageInfo.endCursor }));
      setSelectedIds([]);
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }, [inventory, onError, pageSize, productType, reverse, search, sortKey, status, storeId, vendor]);

  useEffect(() => {
    if (!storeId) return;
    const after = page === 1 ? null : cursors[page];
    if (after === undefined) {
      resetPagination();
      return;
    }
    const timer = window.setTimeout(() => void fetchList(page, after), 220);
    return () => window.clearTimeout(timer);
  }, [fetchList, page, resetPagination, storeId]);

  useEffect(() => {
    if (!storeId || window.location.pathname !== "/shopify/products") return;
    const nextUrl = "/shopify/products" + toQuery({ storeId, search, status: status !== "all" ? status : undefined, inventory: inventory !== "all" ? inventory : undefined, productType, vendor, sortKey, reverse: String(reverse), first: pageSize !== 25 ? pageSize : undefined, page: page > 1 ? page : undefined, after: page > 1 ? cursors[page] ?? undefined : undefined });
    const currentUrl = window.location.pathname + window.location.search;
    if (nextUrl !== currentUrl) window.history.replaceState({}, "", nextUrl);
  }, [cursors, inventory, page, pageSize, productType, reverse, search, sortKey, status, storeId, vendor]);

  async function archiveSelected() {
    const targets = products.filter((product) => selectedIds.includes(product.id));
    if (!targets.length) return;
    setLoading(true);
    try {
      for (const product of targets) {
        const detail = await api<{ product: ShopifyRemoteProduct }>("/api/shopify/stores/" + storeId + "/products/" + encodeURIComponent(product.id));
        const current = detail.product;
        await api("/api/shopify/stores/" + storeId + "/products/" + encodeURIComponent(product.id), {
          method: "PATCH",
          body: JSON.stringify({ storeId, productId: product.id, title: current.title, descriptionHtml: current.descriptionHtml ?? "", handle: current.handle ?? "", vendor: current.vendor ?? "", productType: current.productType ?? "", tags: current.tags, status: "ARCHIVED", templateSuffix: current.templateSuffix ?? "", seoTitle: current.seo?.title ?? "", seoDescription: current.seo?.description ?? "", variants: (current.variants ?? []).map((variant) => ({ id: variant.id, price: variant.price == null ? "" : String(variant.price), compareAtPrice: variant.compareAtPrice == null ? "" : String(variant.compareAtPrice), sku: variant.sku ?? "", barcode: variant.barcode ?? "" })) }),
        });
      }
      onNotify(String(targets.length) + " 个商品已归档");
      await fetchList(page, cursors[page] ?? null);
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }

  const currentStore = activeStores.find((store) => store.id === storeId);
  const returnPath = listReturnPath({ storeId, search, status, inventory, productType, vendor, sortKey, reverse, pageSize, page, after: page === 1 ? null : cursors[page] ?? null });
  const toggleAll = () => setSelectedIds(selectedIds.length === products.length ? [] : products.map((product) => product.id));
  const toggleSelected = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return (
    <section className="shopify-products-view">
      <header className="page-heading shopify-products-heading"><div><span>SHOPIFY CATALOG</span><h1>Shopify 商品</h1><p>浏览已绑定店铺的全部商品；编辑、翻译和媒体处理在独立详情页完成。</p></div><div className="shopify-products-heading-actions"><label className="shopify-store-picker"><span>当前店铺</span><select value={storeId} onChange={(event) => { setStoreId(event.target.value); resetPagination(); }} disabled={!activeStores.length}>{activeStores.map((store) => <option key={store.id} value={store.id}>{store.displayName || store.shopDomain}</option>)}</select></label><button className="button primary" type="button" onClick={() => void fetchList(page, page === 1 ? null : cursors[page] ?? null)} disabled={loading || !storeId}><RefreshCw className={loading ? "spin" : ""} size={16} />刷新</button></div></header>
      {!activeStores.length ? <div className="shopify-products-empty"><CircleAlert size={28} /><strong>还没有可用的 Shopify 店铺</strong><p>先在 Shopify 店铺页面完成应用凭据配置并测试连接。</p></div> : <div className="shopify-products-list">
        <section className="shopify-products-toolbar"><label className="search-field"><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); resetPagination(); }} placeholder="搜索商品标题、SKU、handle 或标签" aria-label="搜索 Shopify 商品" /></label><div className="shopify-filter-row"><Filter size={15} /><select className="filter-status" value={status} onChange={(event) => { setStatus(event.target.value); resetPagination(); }} aria-label="商品状态"><option value="all">全部状态</option><option value="ACTIVE">在售</option><option value="DRAFT">草稿</option><option value="ARCHIVED">已归档</option><option value="UNLISTED">未上架</option></select><input className="filter-type" value={productType} onChange={(event) => { setProductType(event.target.value); resetPagination(); }} placeholder="商品类型" aria-label="商品类型" /><input className="filter-vendor" value={vendor} onChange={(event) => { setVendor(event.target.value); resetPagination(); }} placeholder="供应商" aria-label="供应商" /><select className="filter-inventory" value={inventory} onChange={(event) => { setInventory(event.target.value); resetPagination(); }} aria-label="库存"><option value="all">全部库存</option><option value="in_stock">有库存</option><option value="out_of_stock">缺货</option></select><select className="filter-sort" value={sortKey} onChange={(event) => { setSortKey(event.target.value); resetPagination(); }} aria-label="排序"><option value="UPDATED_AT">最近更新</option><option value="CREATED_AT">创建时间</option><option value="TITLE">标题</option><option value="INVENTORY_TOTAL">库存</option><option value="PRODUCT_TYPE">商品类型</option><option value="VENDOR">供应商</option></select><select className="filter-page-size" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); resetPagination(); }} aria-label="每页条数"><option value={25}>25 / 页</option><option value={50}>50 / 页</option><option value={100}>100 / 页</option></select><button className="icon-button filter-direction" type="button" onClick={() => { setReverse((value) => !value); resetPagination(); }} aria-label={reverse ? "降序" : "升序"} title={reverse ? "降序" : "升序"}><ArrowDownUp size={16} /></button></div></section>
        <div className="shopify-bulk-bar"><label className="shopify-bulk-select"><input type="checkbox" checked={products.length > 0 && selectedIds.length === products.length} onChange={toggleAll} />全选本页</label><span className="shopify-bulk-context">{selectedIds.length ? "已选 " + selectedIds.length + " 个商品" : (currentStore?.shopDomain ?? "")}</span>{selectedIds.length > 0 && <div><button className="button quiet compact" type="button" onClick={() => void archiveSelected()} disabled={loading}><Archive size={15} />批量归档</button></div>}</div>
        <div className="shopify-product-table-wrap"><table className="data-table shopify-product-table"><thead><tr><th className="checkbox-col" /><th>商品</th><th>状态</th><th>价格</th><th>库存</th><th>类型 / 供应商</th><th>更新时间</th><th /></tr></thead><tbody>{loading ? <tr><td colSpan={8}><div className="page-loading"><LoaderCircle className="spin" size={20} />正在读取 Shopify 商品</div></td></tr> : products.length ? products.map((product) => <tr key={product.id} className="shopify-product-row"><td className="checkbox-col"><input type="checkbox" checked={selectedIds.includes(product.id)} onChange={() => toggleSelected(product.id)} aria-label={"选择 " + product.title} /></td><td><div className="shopify-product-cell"><span className="shopify-product-thumb">{product.featuredImage ? <img src={product.featuredImage.url} alt={product.featuredImage.altText || ""} loading="lazy" /> : <Package size={18} />}</span><div><strong>{product.title}</strong><small>{product.handle ? "/" + product.handle : product.id}</small></div></div></td><td><span className={"shopify-status " + product.status.toLowerCase()}><i />{statusLabels[product.status] ?? product.status}</span></td><td>{money(product)}</td><td><b>{product.totalInventory ?? 0}</b><small className="cell-subtext">{product.variantCount} 个变体</small></td><td><strong>{product.productType || "未分类"}</strong><small className="cell-subtext">{product.vendor || "未填写供应商"}</small></td><td>{product.updatedAt ? new Date(product.updatedAt).toLocaleDateString("zh-CN") : "-"}</td><td className="actions-cell"><button className="button quiet compact" type="button" onClick={() => onOpenProduct(product.id, storeId, returnPath)}><Pencil size={14} />编辑</button></td></tr>) : <tr><td colSpan={8}><div className="shopify-products-empty compact"><Package size={25} /><strong>没有符合条件的 Shopify 商品</strong><span>调整筛选条件或刷新店铺数据。</span></div></td></tr>}</tbody></table></div>
        <footer className="pagination"><button className="icon-button" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="上一页"><ChevronLeft size={18} /></button><span>第 {page} 页</span><button className="icon-button" type="button" disabled={!hasNext || loading} onClick={() => setPage((value) => value + 1)} aria-label="下一页"><ChevronRight size={18} /></button></footer>
      </div>}
    </section>
  );
}
