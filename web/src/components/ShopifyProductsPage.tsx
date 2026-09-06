import {
  Archive,
  ArrowDownUp,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Filter,
  Image as ImageIcon,
  LoaderCircle,
  Package,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import DOMPurify from "dompurify";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, toQuery } from "../api";
import type {
  ShopifyDescriptionAiContext,
  ShopifyDescriptionAiResult,
  ShopifyDescriptionSource,
  ShopifyRemoteProduct,
  ShopifyStore,
} from "../types";
import { draftFrom, draftPayload } from "./shopifyProductUtils";

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

const DEFAULT_DESCRIPTION_PROMPT = "请根据 1688 商品 JSON、属性、详情图和主图，生成适合海外电商 Shopify 的商品描述 HTML。内容要自然、可信、面向海外买家，重点写清核心卖点、材质、规格、适用场景和包装信息；不要编造不存在的参数，不要出现 1688、批发价、供应商内部信息或人民币价格。只输出可直接粘贴的完整 HTML，优先使用 h2/h3/p/ul/li/strong/br。";
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

function previewJson(value: unknown, maxLength = 12_000): string {
  if (value == null) return "";
  try {
    const json = JSON.stringify(value, null, 2);
    if (!json) return "";
    return json.length > maxLength ? `${json.slice(0, maxLength)}\n…` : json;
  } catch {
    return "";
  }
}

function sourceImageLabel(group: ShopifyDescriptionSource["images"][number]["group"] | undefined): string {
  return group === "detail" ? "详情图" : "主图";
}

type ShopifyDescriptionModalProps = {
  open: boolean;
  loading: boolean;
  saving: boolean;
  generating: boolean;
  modalRef: { current: HTMLElement | null };
  product: ShopifyRemoteProduct | null;
  source: ShopifyDescriptionSource | null;
  prompt: string;
  html: string;
  selectedImageIds: string[];
  credits: { balance: number; charged: number } | null;
  promptVersion: string | null;
  onClose: () => void;
  onPromptChange: (value: string) => void;
  onHtmlChange: (value: string) => void;
  onSelectImage: (imageId: string) => void;
  onResetPrompt: () => void;
  onGenerate: () => void;
  onSave: () => void;
  onRefreshSource: () => void;
};

function ShopifyDescriptionModal({
  open,
  loading,
  saving,
  generating,
  modalRef,
  product,
  source,
  prompt,
  html,
  selectedImageIds,
  credits,
  promptVersion,
  onClose,
  onPromptChange,
  onHtmlChange,
  onSelectImage,
  onResetPrompt,
  onGenerate,
  onSave,
  onRefreshSource,
}: ShopifyDescriptionModalProps) {
  const sourceJson = useMemo(() => previewJson(source ? source.rawResponse ?? source.raw : null), [source]);
  const generatedPreviewHtml = useMemo(() => DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }), [html]);
  const selectedCount = selectedImageIds.length;
  const dirty = Boolean(product) && html !== (product?.descriptionHtml ?? "");
  const imageButtons = source?.images ?? [];
  const statusText = loading
    ? "正在读取 1688 来源"
    : credits
      ? `已生成，消耗 ${credits.charged} 积分，余额 ${credits.balance}`
      : dirty
        ? "描述有未保存修改"
        : source
          ? `已选 ${selectedCount} 张图片`
          : "当前商品没有可用的 1688 来源";

  if (!open) return null;

  return (
    <div className="modal-backdrop shopify-description-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && !generating && onClose()}>
      <section ref={modalRef} className="modal shopify-description-modal" role="dialog" aria-modal="true" aria-labelledby="shopify-description-modal-title" aria-describedby="shopify-description-modal-description" tabIndex={-1}>
        <header className="modal-header">
          <div>
            <span>AI PRODUCT DESCRIPTION</span>
            <h2 id="shopify-description-modal-title">{product?.title || source?.title || "生成商品描述"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭" title="关闭"><X size={19} /></button>
        </header>
        <div className="shopify-description-modal-body" aria-busy={loading || generating || saving}>
          <p id="shopify-description-modal-description" className="shopify-description-modal-intro">把 1688 JSON 和图片一起送给 AI，生成适合海外电商的 Shopify 商品描述 HTML。你可以先改提示词，再选图生成，最后手动微调 HTML 后保存。</p>

          <section className="translation-modal-section">
            <div className="translation-modal-section-heading">
              <div>
                <span>1688 SOURCE</span>
                <h3>{source?.title || "来源信息"}</h3>
              </div>
              <button className="button quiet compact" type="button" onClick={onRefreshSource} disabled={loading || generating || saving || !product}><RefreshCw className={loading ? "spin" : ""} size={14} />刷新来源</button>
            </div>
            {source ? (
              <>
                <div className="shopify-description-modal-summary">
                  <span>{source.offerId}</span>
                  {source.supplierName ? <span>{source.supplierName}</span> : null}
                  {source.brand ? <span>{source.brand}</span> : null}
                  {source.category ? <span>{source.category}</span> : null}
                  {source.shortDescription ? <span>{source.shortDescription}</span> : null}
                </div>
                <div className="ai-image-modal-grid shopify-description-image-grid">
                  {imageButtons.map((image, index) => {
                    const selected = selectedImageIds.includes(image.id);
                    const disabled = !selected && selectedCount >= 4;
                    return (
                      <button
                        key={image.id}
                        className={`ai-image-modal-image ${selected ? "selected" : ""}`}
                        type="button"
                        onClick={() => !disabled && onSelectImage(image.id)}
                        disabled={disabled}
                        title={`${sourceImageLabel(image.group)} ${index + 1}`}
                      >
                        <img src={image.url} alt={image.altText || source.title} loading="lazy" />
                        <span>{selected ? <Check size={15} /> : index + 1}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="ai-image-modal-preview"><ImageIcon size={16} /><span>{selectedCount ? `已选择 ${selectedCount} 张图片，最多 4 张` : "选择图片后再生成描述"}</span></div>
                <p className="ai-image-modal-note">模型会直接看到所选图片内容，不只是图片链接。</p>
                <details className="shopify-description-json">
                  <summary>1688 JSON</summary>
                  <pre>{sourceJson || "{}"}</pre>
                </details>
              </>
            ) : (
              <div className="shopify-description-source-empty">
                <CircleAlert size={18} />
                <span>当前商品没有可用的 1688 来源，仍可手动编辑 HTML。</span>
              </div>
            )}
          </section>

          <section className="translation-modal-section">
            <div className="translation-modal-section-heading">
              <div>
                <span>CUSTOM INSTRUCTIONS</span>
                <h3>提示词</h3>
              </div>
              <button className="button quiet compact" type="button" onClick={onResetPrompt} disabled={prompt === DEFAULT_DESCRIPTION_PROMPT}>恢复默认</button>
            </div>
            <label className="shopify-description-prompt-field">
              <span>本次描述要求</span>
              <textarea rows={5} value={prompt} onChange={(event) => onPromptChange(event.target.value)} placeholder={DEFAULT_DESCRIPTION_PROMPT} />
              <small>可以补充目标市场、语气、品牌词和必须/禁止出现的内容。</small>
            </label>
          </section>

          <section className="translation-modal-section">
            <div className="translation-modal-section-heading">
              <div>
                <span>HTML RESULT</span>
                <h3>生成结果</h3>
              </div>
              <span className="shopify-description-modal-meta">{promptVersion ? `Prompt ${promptVersion}` : "等待生成"}</span>
            </div>
            <label className="shopify-description-html-field">
              <span>描述 HTML</span>
              <textarea className="shopify-description-input" rows={10} value={html} onChange={(event) => onHtmlChange(event.target.value)} placeholder="生成后会出现在这里，也可以手动修改。" />
            </label>
            <div className="shopify-description-preview-wrap">
              <div className="shopify-description-preview-heading"><span>PREVIEW</span><strong>预览</strong></div>
              <div className="product-description-html" dangerouslySetInnerHTML={{ __html: generatedPreviewHtml || "<p></p>" }} />
            </div>
          </section>
        </div>
        <footer className="modal-actions shopify-description-modal-actions">
          <span className="shopify-description-modal-status" aria-live="polite">{statusText}</span>
          <button className="button quiet" type="button" onClick={onClose}>关闭</button>
          <button className="button quiet" type="button" onClick={onGenerate} disabled={loading || generating || !source || selectedCount < 1}>{generating ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}{generating ? "生成中" : "生成描述"}</button>
          <button className="button primary" type="button" onClick={onSave} disabled={saving || loading || !dirty}>{saving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}{saving ? "保存中" : "保存到 Shopify"}</button>
        </footer>
      </section>
    </div>
  );
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

  const [descriptionModalOpen, setDescriptionModalOpen] = useState(false);
  const [descriptionLoading, setDescriptionLoading] = useState(false);
  const [descriptionSaving, setDescriptionSaving] = useState(false);
  const [descriptionGenerating, setDescriptionGenerating] = useState(false);
  const [descriptionStoreId, setDescriptionStoreId] = useState<string | null>(null);
  const [descriptionProduct, setDescriptionProduct] = useState<ShopifyRemoteProduct | null>(null);
  const [descriptionSource, setDescriptionSource] = useState<ShopifyDescriptionSource | null>(null);
  const [descriptionPrompt, setDescriptionPrompt] = useState(DEFAULT_DESCRIPTION_PROMPT);
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [descriptionSelectedImageIds, setDescriptionSelectedImageIds] = useState<string[]>([]);
  const [descriptionCredits, setDescriptionCredits] = useState<{ balance: number; charged: number } | null>(null);
  const [descriptionPromptVersion, setDescriptionPromptVersion] = useState<string | null>(null);
  const descriptionRequestIdRef = useRef(0);
  const descriptionModalRef = useRef<HTMLElement | null>(null);

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

  const loadDescriptionModalData = useCallback(async (targetProduct: ShopifyRemoteProduct, targetStoreId: string, keepDrafts = false) => {
    const requestId = ++descriptionRequestIdRef.current;
    setDescriptionModalOpen(true);
    setDescriptionLoading(true);
    setDescriptionStoreId(targetStoreId);
    setDescriptionProduct(targetProduct);
    setDescriptionCredits(null);
    if (!keepDrafts) {
      setDescriptionPrompt(DEFAULT_DESCRIPTION_PROMPT);
      setDescriptionHtml(targetProduct.descriptionHtml ?? "");
      setDescriptionSelectedImageIds([]);
      setDescriptionSource(null);
      setDescriptionPromptVersion(null);
    }
    try {
      const result = await api<ShopifyDescriptionAiContext>(`/api/shopify/stores/${targetStoreId}/products/${encodeURIComponent(targetProduct.id)}/ai/description`);
      if (descriptionRequestIdRef.current !== requestId) return;
      setDescriptionProduct(result.product);
      setDescriptionSource(result.source);
      setDescriptionPromptVersion(result.promptVersion);
      if (!keepDrafts) {
        setDescriptionHtml(result.product.descriptionHtml ?? "");
        setDescriptionSelectedImageIds(result.recommendedImageIds.length ? result.recommendedImageIds : (result.source?.images ?? []).slice(0, 4).map((image) => image.id));
      } else {
        setDescriptionSelectedImageIds((current) => {
          const valid = current.filter((imageId) => result.source?.images.some((image) => image.id === imageId));
          return valid.length ? valid.slice(0, 4) : result.recommendedImageIds.length ? result.recommendedImageIds : (result.source?.images ?? []).slice(0, 4).map((image) => image.id);
        });
      }
    } catch (error) {
      if (descriptionRequestIdRef.current !== requestId) return;
      onError(error);
    } finally {
      if (descriptionRequestIdRef.current === requestId) setDescriptionLoading(false);
    }
  }, [onError]);

  const openDescriptionModal = useCallback((product: ShopifyRemoteProduct) => {
    if (!product.storeId) {
      onError(new Error("该商品缺少店铺信息，无法生成描述"));
      return;
    }
    void loadDescriptionModalData(product, product.storeId, false);
  }, [loadDescriptionModalData, onError]);

  const refreshDescriptionSource = useCallback(() => {
    if (!descriptionProduct || !descriptionStoreId) return;
    void loadDescriptionModalData(descriptionProduct, descriptionStoreId, true);
  }, [descriptionProduct, descriptionStoreId, loadDescriptionModalData]);

  const toggleDescriptionImage = useCallback((imageId: string) => {
    setDescriptionSelectedImageIds((current) => {
      if (current.includes(imageId)) return current.filter((id) => id !== imageId);
      if (current.length >= 4) return current;
      return [...current, imageId];
    });
  }, []);

  const generateDescription = useCallback(async () => {
    if (!descriptionProduct || !descriptionSource || !descriptionStoreId || !descriptionSelectedImageIds.length) return;
    setDescriptionGenerating(true);
    setDescriptionCredits(null);
    try {
      const result = await api<ShopifyDescriptionAiResult>(`/api/shopify/stores/${descriptionStoreId}/products/${encodeURIComponent(descriptionProduct.id)}/ai/description`, {
        method: "POST",
        body: JSON.stringify({
          storeId: descriptionStoreId,
          productId: descriptionProduct.id,
          prompt: descriptionPrompt,
          imageIds: descriptionSelectedImageIds,
        }),
      });
      setDescriptionHtml(result.descriptionHtml);
      setDescriptionCredits(result.credits);
      setDescriptionPromptVersion(result.promptVersion);
      onNotify(`AI 已生成商品描述，使用 ${result.imageCount} 张图片`);
    } catch (error) {
      onError(error);
    } finally {
      setDescriptionGenerating(false);
    }
  }, [descriptionProduct, descriptionPrompt, descriptionSelectedImageIds, descriptionSource, descriptionStoreId, onError, onNotify]);

  const saveDescription = useCallback(async () => {
    if (!descriptionProduct || !descriptionStoreId) return;
    const draft = draftFrom(descriptionProduct);
    draft.descriptionHtml = descriptionHtml;
    setDescriptionSaving(true);
    try {
      const result = await api<{ product: ShopifyRemoteProduct }>(`/api/shopify/stores/${descriptionStoreId}/products/${encodeURIComponent(descriptionProduct.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          storeId: descriptionStoreId,
          productId: descriptionProduct.id,
          ...draftPayload(draft),
        }),
      });
      setDescriptionProduct(result.product);
      setDescriptionHtml(result.product.descriptionHtml ?? descriptionHtml);
      setAllProducts((current) => current.map((item) => productKey(item) === productKey(result.product) ? result.product : item));
      onNotify("商品描述已保存到 Shopify");
    } catch (error) {
      onError(error);
    } finally {
      setDescriptionSaving(false);
    }
  }, [descriptionHtml, descriptionProduct, descriptionStoreId, onError, onNotify]);

  const closeDescriptionModal = useCallback(() => {
    setDescriptionModalOpen(false);
  }, []);

  useEffect(() => {
    if (descriptionModalOpen && descriptionModalRef.current) descriptionModalRef.current.focus();
  }, [descriptionModalOpen]);

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
    const nextUrl = "/shopify/products" + toQuery({
      storeId: storeFilter === "all" ? undefined : storeFilter,
      search,
      status: status !== "all" ? status : undefined,
      inventory: inventory !== "all" ? inventory : undefined,
      productType,
      vendor,
      sortKey,
      reverse: String(reverse),
      first: pageSize !== 25 ? pageSize : undefined,
      page: page > 1 ? page : undefined,
    });
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
        const draft = draftFrom(current);
        draft.status = "ARCHIVED";
        await api(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(product.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            storeId,
            productId: product.id,
            ...draftPayload(draft),
          }),
        });
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
    <>
      <section className="shopify-products-view">
        <header className="page-heading shopify-products-heading">
          <div>
            <span>SHOPIFY CATALOG</span>
            <h1>Shopify 商品</h1>
            <p>所有已绑定店铺的商品统一展示，店铺、状态和库存都可以在列表中筛选。</p>
          </div>
          <div className="shopify-products-heading-actions">
            <button className="button primary" type="button" onClick={() => void loadInitial()} disabled={loading || !selectedStores.length}><RefreshCw className={loading ? "spin" : ""} size={16} />刷新</button>
          </div>
        </header>

        {!activeStores.length ? (
          <div className="shopify-products-empty">
            <CircleAlert size={28} />
            <strong>还没有可用的 Shopify 店铺</strong>
            <p>先在 Shopify 店铺页面完成应用凭据配置并测试连接。</p>
          </div>
        ) : (
          <div className="shopify-products-list">
            <section className="shopify-products-toolbar">
              <label className="search-field">
                <Search size={17} />
                <input value={search} onChange={(event) => { setSearch(event.target.value); resetPagination(); }} placeholder="搜索商品标题、SKU、handle 或标签" aria-label="搜索 Shopify 商品" />
              </label>
              <div className="shopify-filter-row">
                <Filter size={15} />
                <select className="filter-store" value={storeFilter} onChange={(event) => { setStoreFilter(event.target.value); resetPagination(); }} aria-label="店铺">
                  <option value="all">全部店铺</option>
                  {activeStores.map((store) => <option key={store.id} value={store.id}>{store.displayName || store.shopDomain}</option>)}
                </select>
                <select className="filter-status" value={status} onChange={(event) => { setStatus(event.target.value); resetPagination(); }} aria-label="商品状态">
                  <option value="all">全部状态</option>
                  <option value="ACTIVE">在售</option>
                  <option value="DRAFT">草稿</option>
                  <option value="ARCHIVED">已归档</option>
                  <option value="UNLISTED">未上架</option>
                </select>
                <input className="filter-type" value={productType} onChange={(event) => { setProductType(event.target.value); resetPagination(); }} placeholder="商品类型" aria-label="商品类型" />
                <input className="filter-vendor" value={vendor} onChange={(event) => { setVendor(event.target.value); resetPagination(); }} placeholder="供应商" aria-label="供应商" />
                <select className="filter-inventory" value={inventory} onChange={(event) => { setInventory(event.target.value); resetPagination(); }} aria-label="库存">
                  <option value="all">全部库存</option>
                  <option value="in_stock">有库存</option>
                  <option value="out_of_stock">缺货</option>
                </select>
                <select className="filter-sort" value={sortKey} onChange={(event) => { setSortKey(event.target.value); resetPagination(); }} aria-label="排序">
                  <option value="UPDATED_AT">最近更新</option>
                  <option value="CREATED_AT">创建时间</option>
                  <option value="TITLE">标题</option>
                  <option value="INVENTORY_TOTAL">库存</option>
                  <option value="PRODUCT_TYPE">商品类型</option>
                  <option value="VENDOR">供应商</option>
                </select>
                <select className="filter-page-size" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); resetPagination(); }} aria-label="每页条数">
                  <option value={25}>25 / 页</option>
                  <option value={50}>50 / 页</option>
                  <option value={100}>100 / 页</option>
                </select>
                <button className="icon-button filter-direction" type="button" onClick={() => { setReverse((value) => !value); resetPagination(); }} aria-label={reverse ? "降序" : "升序"} title={reverse ? "降序" : "升序"}><ArrowDownUp size={16} /></button>
              </div>
            </section>

            <div className="shopify-bulk-bar">
              <label className="shopify-bulk-select">
                <input type="checkbox" checked={products.length > 0 && selectedIds.length === products.length} onChange={toggleAll} />
                全选本页
              </label>
              <span className="shopify-bulk-context">{selectedIds.length ? `已选 ${selectedIds.length} 个商品` : `${sortedProducts.length} 个商品`}</span>
              {selectedIds.length > 0 && <div><button className="button quiet compact" type="button" onClick={() => void archiveSelected()} disabled={loading}><Archive size={15} />批量归档</button></div>}
            </div>

            <div className="shopify-product-table-wrap">
              <table className="data-table shopify-product-table">
                <thead>
                  <tr>
                    <th className="checkbox-col" />
                    <th>商品</th>
                    <th>店铺</th>
                    <th>状态</th>
                    <th>价格</th>
                    <th>库存</th>
                    <th>类型 / 供应商</th>
                    <th>已翻译语种</th>
                    <th>更新时间</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {loading && !products.length ? (
                    <tr>
                      <td colSpan={10}><div className="page-loading"><LoaderCircle className="spin" size={20} />正在读取 Shopify 商品</div></td>
                    </tr>
                  ) : products.length ? products.map((product) => {
                    const key = productKey(product);
                    return (
                      <tr key={key} className="shopify-product-row">
                        <td className="checkbox-col">
                          <input type="checkbox" checked={selectedIds.includes(key)} onChange={() => toggleSelected(key)} aria-label={`选择 ${product.title}`} />
                        </td>
                        <td>
                          <div className="shopify-product-cell">
                            <span className="shopify-product-thumb">{product.featuredImage ? <img src={product.featuredImage.url} alt={product.featuredImage.altText || ""} loading="lazy" /> : <Package size={18} />}</span>
                            <div>
                              <strong>{product.title}</strong>
                              <small>{product.handle ? `/${product.handle}` : product.id}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="shopify-store-cell">
                            <strong>{product.storeName || product.storeDomain || "-"}</strong>
                            <small>{product.storeDomain || ""}</small>
                          </div>
                        </td>
                        <td><span className={`shopify-status ${product.status.toLowerCase()}`}><i />{statusLabels[product.status] ?? product.status}</span></td>
                        <td>{money(product)}</td>
                        <td><b>{product.totalInventory ?? 0}</b><small className="cell-subtext">{product.variantCount} 个变体</small></td>
                        <td><strong>{product.productType || "未分类"}</strong><small className="cell-subtext">{product.vendor || "未填写供应商"}</small></td>
                        <td><div className="shopify-translation-cell">{product.translatedLocales?.length ? product.translatedLocales.map((locale) => <span key={locale.locale} title={locale.name}>{locale.locale}</span>) : <span className="shopify-translation-empty">未翻译</span>}</div></td>
                        <td>{product.updatedAt ? new Date(product.updatedAt).toLocaleDateString("zh-CN") : "-"}</td>
                        <td className="actions-cell">
                          <div className="shopify-product-actions">
                            <button className="button quiet compact" type="button" onClick={() => onOpenProduct(product.id, product.storeId || "", returnPath)}><Pencil size={14} />编辑</button>
                          </div>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={10}>
                        <div className="shopify-products-empty compact">
                          <Package size={25} />
                          <strong>没有符合条件的 Shopify 商品</strong>
                          <span>调整筛选条件或刷新店铺数据。</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <footer className="pagination">
              <button className="icon-button" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="上一页"><ChevronLeft size={18} /></button>
              <span>第 {page} 页</span>
              <button className="icon-button" type="button" disabled={!hasNext || loading} onClick={() => setPage((value) => value + 1)} aria-label="下一页"><ChevronRight size={18} /></button>
            </footer>
          </div>
        )}
      </section>

    </>
  );
}
