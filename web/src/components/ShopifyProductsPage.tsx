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
const STORE_PAGE_SIZE = 100;

function money(product: ShopifyRemoteProduct): string {
  if (product.priceMin == null && product.priceMax == null) return "未定价";
  const format = (value: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: product.currency, maximumFractionDigits: 2 }).format(value);
  return product.priceMax == null || product.priceMin === product.priceMax
    ? format(product.priceMin ?? product.priceMax ?? 0)
    : `${format(product.priceMin ?? 0)} - ${format(product.priceMax)}`;
}

function productKey(product: ShopifyRemoteProduct): string {
  return `${product.storeId ?? ""}:${product.id}`;
}

function sortProducts(products: ShopifyRemoteProduct[], sortKey: string, reverse: boolean): ShopifyRemoteProduct[] {
  const sorted = [...products].sort((left, right) => {
    let result = 0;
    if (sortKey === "TITLE") result = left.title.localeCompare(right.title, "zh-CN");
    else if (sortKey === "INVENTORY_TOTAL") result = (left.totalInventory ?? 0) - (right.totalInventory ?? 0);
    else if (sortKey === "PRODUCT_TYPE") result = (left.productType ?? "").localeCompare(right.productType ?? "", "zh-CN");
    else if (sortKey === "VENDOR") result = (left.vendor ?? "").localeCompare(right.vendor ?? "", "zh-CN");
    else if (sortKey === "PRICE") result = (left.priceMin ?? 0) - (right.priceMin ?? 0);
    else if (sortKey === "CREATED_AT") result = (left.createdAt ?? "").localeCompare(right.createdAt ?? "");
    else result = (left.updatedAt ?? "").localeCompare(right.updatedAt ?? "");
    return reverse ? -result : result;
  });
  return sorted;
}

function listReturnPath(state: { storeId: string; search: string; status: string; inventory: string; productType: string; vendor: string; sortKey: string; reverse: boolean; pageSize: number; page: number }): string {
  return "/shopify/products" + toQuery({
    storeId: state.storeId === "all" ? undefined : state.storeId,
    search: state.search,
    status: state.status !== "all" ? state.status : undefined,
    inventory: state.inventory !== "all" ? state.inventory : undefined,
    productType: state.productType,
    vendor: state.vendor,
    sortKey: state.sortKey,
    reverse: String(state.reverse),
    first: state.pageSize !== 25 ? state.pageSize : undefined,
    page: state.page > 1 ? state.page : undefined,
  });
}

export function ShopifyProductsPage({ stores, onError, onNotify, onOpenProduct }: Props) {
  const activeStores = useMemo(() => stores.filter((store) => store.status === "active" && store.configured), [stores]);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [storeFilter, setStoreFilter] = useState(params.get("storeId") ?? "all");
  const [allProducts, setAllProducts] = useState<ShopifyRemoteProduct[]>([]);
  const [storeCursors, setStoreCursors] = useState<Record<string, string | null>>({});
  const [storeHasNext, setStoreHasNext] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "all");
  const [inventory, setInventory] = useState(params.get("inventory") ?? "all");
  const [productType, setProductType] = useState(params.get("productType") ?? "");
  const [vendor, setVendor] = useState(params.get("vendor") ?? "");
  const [sortKey, setSortKey] = useState(params.get("sortKey") ?? "UPDATED_AT");
  const [reverse, setReverse] = useState(params.get("reverse") !== "false");
  const [pageSize, setPageSize] = useState(Number(params.get("first")) || 25);
  const [page, setPage] = useState(Math.max(1, Number(params.get("page")) || 1));
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectedStores = useMemo(() => activeStores.filter((store) => storeFilter === "all" || store.id === storeFilter), [activeStores, storeFilter]);
  const sortedProducts = useMemo(() => sortProducts(allProducts, sortKey, reverse), [allProducts, reverse, sortKey]);
  const products = useMemo(() => sortedProducts.slice((page - 1) * pageSize, page * pageSize), [page, pageSize, sortedProducts]);
  const canLoadMore = Object.values(storeHasNext).some(Boolean);
  const hasNext = sortedProducts.length > page * pageSize || canLoadMore;

  const resetPagination = useCallback(() => {
    setPage(1);
    setSelectedIds([]);
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setSelectedIds([]);
    try {
      const results = await Promise.all(selectedStores.map(async (store) => {
        const result = await api<{ products: ShopifyRemoteProduct[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }>(
          `/api/shopify/stores/${store.id}/products` + toQuery({ search, status, inventory, productType, vendor, sortKey, reverse: String(reverse), first: STORE_PAGE_SIZE }),
        );
        return { store, ...result };
      }));
      setAllProducts(results.flatMap((result) => result.products));
      setStoreCursors(Object.fromEntries(results.map((result) => [result.store.id, result.pageInfo.endCursor])));
      setStoreHasNext(Object.fromEntries(results.map((result) => [result.store.id, result.pageInfo.hasNextPage])));
      setPage(1);
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }, [inventory, onError, productType, reverse, search, selectedStores, sortKey, status, vendor]);

  const loadMore = useCallback(async () => {
    const nextStores = selectedStores.filter((store) => storeHasNext[store.id] && storeCursors[store.id]);
    if (!nextStores.length || loading) return;
    setLoading(true);
    try {
      const results = await Promise.all(nextStores.map(async (store) => {
        const result = await api<{ products: ShopifyRemoteProduct[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }>(
          `/api/shopify/stores/${store.id}/products` + toQuery({ search, status, inventory, productType, vendor, sortKey, reverse: String(reverse), first: STORE_PAGE_SIZE, after: storeCursors[store.id] ?? undefined }),
        );
        return { store, ...result };
      }));
      setAllProducts((current) => {
        const merged = new Map(current.map((product) => [productKey(product), product]));
        for (const result of results) for (const product of result.products) merged.set(productKey(product), product);
        return [...merged.values()];
      });
      setStoreCursors((current) => ({ ...current, ...Object.fromEntries(results.map((result) => [result.store.id, result.pageInfo.endCursor])) }));
      setStoreHasNext((current) => ({ ...current, ...Object.fromEntries(results.map((result) => [result.store.id, result.pageInfo.hasNextPage])) }));
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }, [inventory, loading, onError, productType, reverse, search, selectedStores, sortKey, status, storeCursors, storeHasNext, vendor]);

  useEffect(() => {
    if (storeFilter !== "all" && !activeStores.some((store) => store.id === storeFilter)) setStoreFilter("all");
  }, [activeStores, storeFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadInitial(), 220);
    return () => window.clearTimeout(timer);
  }, [loadInitial]);

  useEffect(() => {
    if (!loading && sortedProducts.length < page * pageSize && canLoadMore) void loadMore();
  }, [canLoadMore, loadMore, loading, page, pageSize, sortedProducts.length]);

  useEffect(() => {
    if (window.location.pathname !== "/shopify/products") return;
    const nextUrl = "/shopify/products" + toQuery({ storeId: storeFilter === "all" ? undefined : storeFilter, search, status: status !== "all" ? status : undefined, inventory: inventory !== "all" ? inventory : undefined, productType, vendor, sortKey, reverse: String(reverse), first: pageSize !== 25 ? pageSize : undefined, page: page > 1 ? page : undefined });
    const currentUrl = window.location.pathname + window.location.search;
    if (nextUrl !== currentUrl) window.history.replaceState({}, "", nextUrl);
  }, [inventory, page, pageSize, productType, reverse, search, sortKey, status, storeFilter, vendor]);

  async function archiveSelected() {
    const targets = products.filter((product) => selectedIds.includes(productKey(product)) && product.storeId);
    if (!targets.length) return;
    setLoading(true);
    try {
      for (const product of targets) {
        const storeId = product.storeId as string;
        const detail = await api<{ product: ShopifyRemoteProduct }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(product.id)}`);
        const current = detail.product;
        await api(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(product.id)}`, { method: "PATCH", body: JSON.stringify({ storeId, productId: product.id, title: current.title, descriptionHtml: current.descriptionHtml ?? "", handle: current.handle ?? "", vendor: current.vendor ?? "", productType: current.productType ?? "", tags: current.tags, status: "ARCHIVED", templateSuffix: current.templateSuffix ?? "", seoTitle: current.seo?.title ?? "", seoDescription: current.seo?.description ?? "", variants: (current.variants ?? []).map((variant) => ({ id: variant.id, price: variant.price == null ? "" : String(variant.price), compareAtPrice: variant.compareAtPrice == null ? "" : String(variant.compareAtPrice), sku: variant.sku ?? "", barcode: variant.barcode ?? "" })) }) });
      }
      onNotify(`${targets.length} 个商品已归档`);
      await loadInitial();
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }

  const returnPath = listReturnPath({ storeId: storeFilter, search, status, inventory, productType, vendor, sortKey, reverse, pageSize, page });
  const toggleAll = () => setSelectedIds(selectedIds.length === products.length ? [] : products.map(productKey));
  const toggleSelected = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return (
    <section className="shopify-products-view">
      <header className="page-heading shopify-products-heading"><div><span>SHOPIFY CATALOG</span><h1>Shopify 商品</h1><p>所有已绑定店铺的商品统一展示，店铺、状态和库存都可以在列表中筛选。</p></div><div className="shopify-products-heading-actions"><button className="button primary" type="button" onClick={() => void loadInitial()} disabled={loading || !selectedStores.length}><RefreshCw className={loading ? "spin" : ""} size={16} />刷新</button></div></header>
      {!activeStores.length ? <div className="shopify-products-empty"><CircleAlert size={28} /><strong>还没有可用的 Shopify 店铺</strong><p>先在 Shopify 店铺页面完成应用凭据配置并测试连接。</p></div> : <div className="shopify-products-list">
        <section className="shopify-products-toolbar"><label className="search-field"><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); resetPagination(); }} placeholder="搜索商品标题、SKU、handle 或标签" aria-label="搜索 Shopify 商品" /></label><div className="shopify-filter-row"><Filter size={15} /><select className="filter-store" value={storeFilter} onChange={(event) => { setStoreFilter(event.target.value); resetPagination(); }} aria-label="店铺"><option value="all">全部店铺</option>{activeStores.map((store) => <option key={store.id} value={store.id}>{store.displayName || store.shopDomain}</option>)}</select><select className="filter-status" value={status} onChange={(event) => { setStatus(event.target.value); resetPagination(); }} aria-label="商品状态"><option value="all">全部状态</option><option value="ACTIVE">在售</option><option value="DRAFT">草稿</option><option value="ARCHIVED">已归档</option><option value="UNLISTED">未上架</option></select><input className="filter-type" value={productType} onChange={(event) => { setProductType(event.target.value); resetPagination(); }} placeholder="商品类型" aria-label="商品类型" /><input className="filter-vendor" value={vendor} onChange={(event) => { setVendor(event.target.value); resetPagination(); }} placeholder="供应商" aria-label="供应商" /><select className="filter-inventory" value={inventory} onChange={(event) => { setInventory(event.target.value); resetPagination(); }} aria-label="库存"><option value="all">全部库存</option><option value="in_stock">有库存</option><option value="out_of_stock">缺货</option></select><select className="filter-sort" value={sortKey} onChange={(event) => { setSortKey(event.target.value); resetPagination(); }} aria-label="排序"><option value="UPDATED_AT">最近更新</option><option value="CREATED_AT">创建时间</option><option value="TITLE">标题</option><option value="INVENTORY_TOTAL">库存</option><option value="PRODUCT_TYPE">商品类型</option><option value="VENDOR">供应商</option></select><select className="filter-page-size" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); resetPagination(); }} aria-label="每页条数"><option value={25}>25 / 页</option><option value={50}>50 / 页</option><option value={100}>100 / 页</option></select><button className="icon-button filter-direction" type="button" onClick={() => { setReverse((value) => !value); resetPagination(); }} aria-label={reverse ? "降序" : "升序"} title={reverse ? "降序" : "升序"}><ArrowDownUp size={16} /></button></div></section>
        <div className="shopify-bulk-bar"><label className="shopify-bulk-select"><input type="checkbox" checked={products.length > 0 && selectedIds.length === products.length} onChange={toggleAll} />全选本页</label><span className="shopify-bulk-context">{selectedIds.length ? `已选 ${selectedIds.length} 个商品` : `${sortedProducts.length} 个商品`}</span>{selectedIds.length > 0 && <div><button className="button quiet compact" type="button" onClick={() => void archiveSelected()} disabled={loading}><Archive size={15} />批量归档</button></div>}</div>
        <div className="shopify-product-table-wrap"><table className="data-table shopify-product-table"><thead><tr><th className="checkbox-col" /><th>商品</th><th>店铺</th><th>状态</th><th>价格</th><th>库存</th><th>类型 / 供应商</th><th>已翻译语种</th><th>更新时间</th><th /></tr></thead><tbody>{loading && !products.length ? <tr><td colSpan={10}><div className="page-loading"><LoaderCircle className="spin" size={20} />正在读取 Shopify 商品</div></td></tr> : products.length ? products.map((product) => { const key = productKey(product); return <tr key={key} className="shopify-product-row"><td className="checkbox-col"><input type="checkbox" checked={selectedIds.includes(key)} onChange={() => toggleSelected(key)} aria-label={`选择 ${product.title}`} /></td><td><div className="shopify-product-cell"><span className="shopify-product-thumb">{product.featuredImage ? <img src={product.featuredImage.url} alt={product.featuredImage.altText || ""} loading="lazy" /> : <Package size={18} />}</span><div><strong>{product.title}</strong><small>{product.handle ? `/${product.handle}` : product.id}</small></div></div></td><td><div className="shopify-store-cell"><strong>{product.storeName || product.storeDomain || "-"}</strong><small>{product.storeDomain || ""}</small></div></td><td><span className={`shopify-status ${product.status.toLowerCase()}`}><i />{statusLabels[product.status] ?? product.status}</span></td><td>{money(product)}</td><td><b>{product.totalInventory ?? 0}</b><small className="cell-subtext">{product.variantCount} 个变体</small></td><td><strong>{product.productType || "未分类"}</strong><small className="cell-subtext">{product.vendor || "未填写供应商"}</small></td><td><div className="shopify-translation-cell">{product.translatedLocales?.length ? product.translatedLocales.map((locale) => <span key={locale.locale} title={locale.name}>{locale.locale}</span>) : <span className="shopify-translation-empty">未翻译</span>}</div></td><td>{product.updatedAt ? new Date(product.updatedAt).toLocaleDateString("zh-CN") : "-"}</td><td className="actions-cell"><button className="button quiet compact" type="button" onClick={() => onOpenProduct(product.id, product.storeId || "", returnPath)}><Pencil size={14} />编辑</button></td></tr>; }) : <tr><td colSpan={10}><div className="shopify-products-empty compact"><Package size={25} /><strong>没有符合条件的 Shopify 商品</strong><span>调整筛选条件或刷新店铺数据。</span></div></td></tr>}</tbody></table></div>
        <footer className="pagination"><button className="icon-button" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="上一页"><ChevronLeft size={18} /></button><span>第 {page} 页</span><button className="icon-button" type="button" disabled={!hasNext || loading} onClick={() => setPage((value) => value + 1)} aria-label="下一页"><ChevronRight size={18} /></button></footer>
      </div>}
    </section>
  );
}
