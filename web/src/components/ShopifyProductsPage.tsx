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
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api, toQuery } from "../api";
import type { ShopifyRemoteProduct, ShopifyStore } from "../types";

type Props = {
  stores: ShopifyStore[];
  onError: (error: unknown) => void;
  onNotify: (message: string) => void;
};

type Draft = {
  title: string;
  descriptionHtml: string;
  handle: string;
  vendor: string;
  productType: string;
  tags: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED" | "UNLISTED";
  templateSuffix: string;
  seoTitle: string;
  seoDescription: string;
  variants: Array<{ id: string; title: string; price: string; compareAtPrice: string; sku: string; barcode: string; inventoryQuantity: number | null }>;
};

const statusLabels: Record<string, string> = { ACTIVE: "在售", DRAFT: "草稿", ARCHIVED: "已归档", UNLISTED: "未上架" };

function money(product: ShopifyRemoteProduct): string {
  if (product.priceMin == null && product.priceMax == null) return "未定价";
  const format = (value: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: product.currency, maximumFractionDigits: 2 }).format(value);
  return product.priceMax == null || product.priceMin === product.priceMax ? format(product.priceMin ?? product.priceMax ?? 0) : `${format(product.priceMin ?? 0)} - ${format(product.priceMax)}`;
}

function draftFrom(product: ShopifyRemoteProduct): Draft {
  return {
    title: product.title,
    descriptionHtml: product.descriptionHtml ?? "",
    handle: product.handle ?? "",
    vendor: product.vendor ?? "",
    productType: product.productType ?? "",
    tags: product.tags.join(", "),
    status: (product.status in statusLabels ? product.status : "DRAFT") as Draft["status"],
    templateSuffix: product.templateSuffix ?? "",
    seoTitle: product.seo?.title ?? "",
    seoDescription: product.seo?.description ?? "",
    variants: (product.variants ?? []).map((variant) => ({
      id: variant.id,
      title: variant.title,
      price: variant.price == null ? "" : String(variant.price),
      compareAtPrice: variant.compareAtPrice == null ? "" : String(variant.compareAtPrice),
      sku: variant.sku ?? "",
      barcode: variant.barcode ?? "",
      inventoryQuantity: variant.inventoryQuantity,
    })),
  };
}

export function ShopifyProductsPage({ stores, onError, onNotify }: Props) {
  const activeStores = useMemo(() => stores.filter((store) => store.status === "active" && store.configured), [stores]);
  const [storeId, setStoreId] = useState("");
  const [products, setProducts] = useState<ShopifyRemoteProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ShopifyRemoteProduct | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [inventory, setInventory] = useState("all");
  const [productType, setProductType] = useState("");
  const [vendor, setVendor] = useState("");
  const [sortKey, setSortKey] = useState("UPDATED_AT");
  const [reverse, setReverse] = useState(true);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<Record<number, string | null>>({ 1: null });
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!storeId && activeStores[0]) setStoreId(activeStores[0].id);
    if (storeId && !activeStores.some((store) => store.id === storeId)) setStoreId(activeStores[0]?.id ?? "");
  }, [activeStores, storeId]);

  const fetchList = useCallback(async (targetPage: number, after: string | null) => {
    if (!storeId) return;
    setLoading(true);
    try {
      const result = await api<{ products: ShopifyRemoteProduct[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }>(`/api/shopify/stores/${storeId}/products${toQuery({ storeId, search, status, inventory, productType, vendor, sortKey, reverse: String(reverse), first: pageSize, after: after ?? undefined })}`);
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
    const timer = window.setTimeout(() => {
      setPage(1);
      setCursors({ 1: null });
      void fetchList(1, null);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [fetchList, storeId]);

  const openProduct = useCallback(async (product: ShopifyRemoteProduct) => {
    setSelectedProduct(product);
    setDraft(null);
    setLoadingDetail(true);
    try {
      const result = await api<{ product: ShopifyRemoteProduct }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(product.id)}`);
      setSelectedProduct(result.product);
      setDraft(draftFrom(result.product));
    } catch (error) {
      onError(error);
    } finally {
      setLoadingDetail(false);
    }
  }, [onError, storeId]);

  async function saveProduct() {
    if (!draft || !selectedProduct) return;
    setSaving(true);
    try {
      const result = await api<{ product: ShopifyRemoteProduct }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(selectedProduct.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          storeId,
          productId: selectedProduct.id,
          title: draft.title,
          descriptionHtml: draft.descriptionHtml,
          handle: draft.handle,
          vendor: draft.vendor,
          productType: draft.productType,
          tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          status: draft.status,
          templateSuffix: draft.templateSuffix,
          seoTitle: draft.seoTitle,
          seoDescription: draft.seoDescription,
          variants: draft.variants.map((variant) => ({ id: variant.id, price: variant.price, compareAtPrice: variant.compareAtPrice, sku: variant.sku, barcode: variant.barcode })),
        }),
      });
      setSelectedProduct(result.product);
      setDraft(draftFrom(result.product));
      setProducts((current) => current.map((item) => item.id === result.product.id ? { ...item, ...result.product } : item));
      onNotify("商品已保存到 Shopify");
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(product: ShopifyRemoteProduct) {
    if (!window.confirm(`确定删除“${product.title}”吗？此操作会直接删除 Shopify 商品。`)) return;
    try {
      await api(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(product.id)}`, { method: "DELETE" });
      setProducts((current) => current.filter((item) => item.id !== product.id));
      setSelectedProduct(null);
      setDraft(null);
      onNotify("商品已删除");
    } catch (error) {
      onError(error);
    }
  }

  async function archiveSelected() {
    const targets = products.filter((product) => selectedIds.includes(product.id));
    for (const product of targets) {
      try {
        const detail = await api<{ product: ShopifyRemoteProduct }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(product.id)}`);
        const current = draftFrom(detail.product);
        await api(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(product.id)}`, { method: "PATCH", body: JSON.stringify({ storeId, productId: product.id, ...current, tags: current.tags.split(",").map((tag) => tag.trim()).filter(Boolean), variants: current.variants.map((variant) => ({ id: variant.id, price: variant.price, compareAtPrice: variant.compareAtPrice, sku: variant.sku, barcode: variant.barcode })) }) });
      } catch (error) {
        onError(error);
        return;
      }
    }
    onNotify(`${targets.length} 个商品已归档`);
    void fetchList(page, cursors[page] ?? null);
  }

  const toggleAll = () => setSelectedIds(selectedIds.length === products.length ? [] : products.map((product) => product.id));
  const toggleSelected = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const currentStore = activeStores.find((store) => store.id === storeId);

  return (
    <section className="shopify-products-view">
      <header className="page-heading shopify-products-heading">
        <div><span>SHOPIFY CATALOG</span><h1>Shopify 商品</h1><p>管理已绑定店铺中的全部商品，编辑后直接写回 Shopify Admin。</p></div>
        <div className="shopify-products-heading-actions">
          <label className="shopify-store-picker"><span>当前店铺</span><select value={storeId} onChange={(event) => { setStoreId(event.target.value); setPage(1); }} disabled={!activeStores.length}>{activeStores.map((store) => <option key={store.id} value={store.id}>{store.displayName || store.shopDomain}</option>)}</select></label>
          <button className="button primary" type="button" onClick={() => void fetchList(page, cursors[page] ?? null)} disabled={loading || !storeId}><RefreshCw className={loading ? "spin" : ""} size={16} />刷新</button>
        </div>
      </header>

      {!activeStores.length ? <div className="shopify-products-empty"><CircleAlert size={28} /><strong>还没有可用的 Shopify 店铺</strong><p>先在 Shopify 店铺页面完成应用凭据配置并测试连接。</p></div> : (
        <div className={`shopify-products-workspace ${selectedProduct ? "has-editor" : ""}`}>
          <div className="shopify-products-list">
            <section className="shopify-products-toolbar">
              <label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索商品标题、SKU、handle 或标签" aria-label="搜索 Shopify 商品" /></label>
              <div className="shopify-filter-row"><Filter size={15} /><select className="filter-status" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="商品状态"><option value="all">全部状态</option><option value="ACTIVE">在售</option><option value="DRAFT">草稿</option><option value="ARCHIVED">已归档</option><option value="UNLISTED">未上架</option></select><input className="filter-type" value={productType} onChange={(event) => setProductType(event.target.value)} placeholder="商品类型" aria-label="商品类型" /><input className="filter-vendor" value={vendor} onChange={(event) => setVendor(event.target.value)} placeholder="供应商" aria-label="供应商" /><select className="filter-inventory" value={inventory} onChange={(event) => setInventory(event.target.value)} aria-label="库存"><option value="all">全部库存</option><option value="in_stock">有库存</option><option value="out_of_stock">缺货</option></select><select className="filter-sort" value={sortKey} onChange={(event) => setSortKey(event.target.value)} aria-label="排序"><option value="UPDATED_AT">最近更新</option><option value="CREATED_AT">创建时间</option><option value="TITLE">标题</option><option value="PRICE">价格</option><option value="INVENTORY_TOTAL">库存</option><option value="VENDOR">供应商</option></select><select className="filter-page-size" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="每页条数"><option value={25}>25 / 页</option><option value={50}>50 / 页</option><option value={100}>100 / 页</option></select><button className="icon-button filter-direction" type="button" onClick={() => setReverse((value) => !value)} aria-label={reverse ? "降序" : "升序"} title={reverse ? "降序" : "升序"}><ArrowDownUp size={16} /></button></div>
            </section>
            <div className="shopify-bulk-bar"><label className="shopify-bulk-select"><input type="checkbox" checked={products.length > 0 && selectedIds.length === products.length} onChange={toggleAll} />全选本页</label><span className="shopify-bulk-context">{selectedIds.length ? `已选 ${selectedIds.length} 个商品` : `${currentStore?.shopDomain ?? ""}`}</span>{selectedIds.length > 0 && <div><button className="button quiet compact" type="button" onClick={() => void archiveSelected()}><Archive size={15} />批量归档</button></div>}</div>
            <div className="shopify-product-table-wrap"><table className="data-table shopify-product-table"><thead><tr><th className="checkbox-col"></th><th>商品</th><th>状态</th><th>价格</th><th>库存</th><th>类型 / 供应商</th><th>更新时间</th><th></th></tr></thead><tbody>{loading ? <tr><td colSpan={8}><div className="page-loading"><LoaderCircle className="spin" size={20} />正在读取 Shopify 商品</div></td></tr> : products.length ? products.map((product) => <tr key={product.id} className={selectedProduct?.id === product.id ? "selected" : ""} onDoubleClick={() => void openProduct(product)}><td className="checkbox-col"><input type="checkbox" checked={selectedIds.includes(product.id)} onChange={() => toggleSelected(product.id)} aria-label={`选择 ${product.title}`} /></td><td><div className="shopify-product-cell"><span className="shopify-product-thumb">{product.featuredImage ? <img src={product.featuredImage.url} alt={product.featuredImage.altText || ""} loading="lazy" /> : <Package size={18} />}</span><div><strong>{product.title}</strong><small>{product.handle ? `/${product.handle}` : product.id}</small></div></div></td><td><span className={`shopify-status ${product.status.toLowerCase()}`}><i />{statusLabels[product.status] ?? product.status}</span></td><td>{money(product)}</td><td><b>{product.totalInventory ?? 0}</b><small className="cell-subtext">{product.variantCount} 个变体</small></td><td><strong>{product.productType || "未分类"}</strong><small className="cell-subtext">{product.vendor || "未填写供应商"}</small></td><td>{product.updatedAt ? new Date(product.updatedAt).toLocaleDateString("zh-CN") : "-"}</td><td className="actions-cell"><button className="button quiet compact" type="button" onClick={() => void openProduct(product)}><Pencil size={14} />编辑</button></td></tr>) : <tr><td colSpan={8}><div className="shopify-products-empty compact"><Package size={25} /><strong>没有符合条件的 Shopify 商品</strong><span>调整筛选条件或刷新店铺数据。</span></div></td></tr>}</tbody></table></div>
            <footer className="pagination"><button className="icon-button" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="上一页"><ChevronLeft size={18} /></button><span>第 {page} 页</span><button className="icon-button" type="button" disabled={!hasNext || loading} onClick={() => setPage((value) => value + 1)} aria-label="下一页"><ChevronRight size={18} /></button></footer>
          </div>

          {selectedProduct && <aside className="shopify-product-editor"><header className="shopify-editor-header"><div><span>SHOPIFY ADMIN</span><h2>{loadingDetail ? "加载商品" : draft?.title || selectedProduct.title}</h2><small>{currentStore?.shopDomain}</small></div><button className="icon-button" type="button" onClick={() => { setSelectedProduct(null); setDraft(null); }} aria-label="关闭编辑器" title="关闭"><X size={18} /></button></header>{loadingDetail || !draft ? <div className="page-loading"><LoaderCircle className="spin" size={20} />正在读取商品详情</div> : <div className="shopify-editor-scroll"><section className="shopify-editor-section"><div className="editor-section-heading"><div><span>GENERAL</span><h3>基本信息</h3></div><span className={`shopify-status ${draft.status.toLowerCase()}`}><i />{statusLabels[draft.status]}</span></div><label><span>标题</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label><span>描述 HTML</span><textarea className="shopify-description-input" value={draft.descriptionHtml} onChange={(event) => setDraft({ ...draft, descriptionHtml: event.target.value })} rows={8} /></label><div className="editor-two-columns"><label><span>Handle</span><input value={draft.handle} onChange={(event) => setDraft({ ...draft, handle: event.target.value })} /></label><label><span>供应商</span><input value={draft.vendor} onChange={(event) => setDraft({ ...draft, vendor: event.target.value })} /></label><label><span>商品类型</span><input value={draft.productType} onChange={(event) => setDraft({ ...draft, productType: event.target.value })} /></label><label><span>模板后缀</span><input value={draft.templateSuffix} onChange={(event) => setDraft({ ...draft, templateSuffix: event.target.value })} placeholder="默认模板" /></label></div><label><span>标签</span><input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="用逗号分隔" /></label></section><section className="shopify-editor-section"><div className="editor-section-heading"><div><span>MEDIA</span><h3>媒体</h3></div><span className="section-meta">{selectedProduct.images?.length ?? 0} 张图片</span></div><div className="shopify-editor-media-grid">{selectedProduct.images?.map((image) => <figure key={image.id}><img src={image.url} alt={image.altText || selectedProduct.title} /><figcaption>{image.altText || "未填写替代文本"}</figcaption></figure>)}</div><p className="editor-help">图片管理沿用 Shopify CDN 资源；如需上传新图，请在 Shopify 后台媒体区域上传后刷新此页。</p></section><section className="shopify-editor-section"><div className="editor-section-heading"><div><span>VARIANTS</span><h3>变体与库存</h3></div><span className="section-meta">{draft.variants.length} 个变体</span></div><div className="shopify-variant-editor"><div className="shopify-variant-row header"><span>变体</span><span>价格</span><span>对比价</span><span>SKU</span><span>条码</span><span>库存</span></div>{draft.variants.map((variant, index) => <div className="shopify-variant-row" key={variant.id}><strong>{variant.title}</strong><input value={variant.price} onChange={(event) => { const variants = [...draft.variants]; variants[index] = { ...variant, price: event.target.value }; setDraft({ ...draft, variants }); }} /><input value={variant.compareAtPrice} onChange={(event) => { const variants = [...draft.variants]; variants[index] = { ...variant, compareAtPrice: event.target.value }; setDraft({ ...draft, variants }); }} /><input value={variant.sku} onChange={(event) => { const variants = [...draft.variants]; variants[index] = { ...variant, sku: event.target.value }; setDraft({ ...draft, variants }); }} /><input value={variant.barcode} onChange={(event) => { const variants = [...draft.variants]; variants[index] = { ...variant, barcode: event.target.value }; setDraft({ ...draft, variants }); }} /><span>{variant.inventoryQuantity ?? 0}</span></div>)}</div></section><section className="shopify-editor-section"><div className="editor-section-heading"><div><span>SEO</span><h3>搜索引擎预览</h3></div></div><label><span>SEO 标题</span><input value={draft.seoTitle} onChange={(event) => setDraft({ ...draft, seoTitle: event.target.value })} placeholder="不填写则使用商品标题" /></label><label><span>SEO 描述</span><textarea value={draft.seoDescription} onChange={(event) => setDraft({ ...draft, seoDescription: event.target.value })} rows={4} /></label><div className="seo-preview"><strong>{draft.seoTitle || draft.title}</strong><span>{currentStore?.shopDomain}/{draft.handle}</span><p>{draft.seoDescription || "Shopify 会使用商品描述生成搜索摘要。"}</p></div></section><section className="shopify-editor-section"><div className="editor-section-heading"><div><span>PUBLISHING</span><h3>发布状态</h3></div></div><label><span>状态</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Draft["status"] })}><option value="ACTIVE">在售</option><option value="DRAFT">草稿</option><option value="ARCHIVED">已归档</option><option value="UNLISTED">未上架</option></select></label></section></div>}<footer className="shopify-editor-footer"><button className="button danger-text" type="button" onClick={() => void deleteProduct(selectedProduct)} disabled={saving}><Trash2 size={15} />删除</button><div><button className="button quiet" type="button" onClick={() => { setSelectedProduct(null); setDraft(null); }} disabled={saving}>取消</button><button className="button primary" type="button" onClick={() => void saveProduct()} disabled={saving || loadingDetail}>{saving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}{saving ? "保存中" : "保存更改"}</button></div></footer></aside>}
        </div>
      )}
    </section>
  );
}
