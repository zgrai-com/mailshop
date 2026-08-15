import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckSquare2,
  Copy,
  FileSearch,
  ImageIcon,
  LoaderCircle,
  RefreshCw,
  Save,
  Search,
  Square,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api, ApiClientError, toQuery } from "../api";
import type {
  OneBoundItemPreview,
  OneBoundSearchResult,
  OneBoundSettings,
  ProductDetail,
  ProductImage,
} from "../types";

type SearchOptions = {
  sort: "_sale" | "sale" | "price" | "_price";
  cache: "yes" | "no";
  lang: "cn" | "en" | "ru";
  limit: 10 | 20 | 50;
};

type Props = {
  product: ProductDetail;
  image: ProductImage;
  onClose: () => void;
  onSaved: (product: ProductDetail, savedCount: number, failureCount: number) => Promise<void>;
};

type ErrorInfo = {
  message: string;
  status?: number;
  code?: string;
  requestId?: string | null;
  path?: string;
  details?: unknown;
};

type SaveReport = {
  saved: Array<{ offerId: string; title: string; linkId: string }>;
  failures: Array<{ offerId: string; code: string; message: string; details?: unknown }>;
};

const DEFAULT_OPTIONS: SearchOptions = { sort: "_sale", cache: "no", lang: "cn", limit: 50 };

function normalizeError(error: unknown): ErrorInfo {
  if (error instanceof ApiClientError) {
    return {
      message: error.message,
      status: error.status,
      code: error.code,
      requestId: error.requestId,
      path: error.path,
      details: error.details,
    };
  }
  return {
    message: error instanceof Error ? error.message : "未知错误",
    details: error instanceof Error ? { name: error.name, stack: error.stack } : error,
  };
}

function jsonText(value: unknown): string {
  if (value === undefined) return "没有更多响应内容";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function money(value: number | null | undefined): string {
  if (value == null) return "价格待返回";
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(value);
}

function priceLabel(item: OneBoundSearchResult): string {
  return money(item.promotionPrice ?? item.price);
}

export function ImageSearchModal({ product, image, onClose, onSaved }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [settings, setSettings] = useState<OneBoundSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [options, setOptions] = useState<SearchOptions>(DEFAULT_OPTIONS);
  const [results, setResults] = useState<OneBoundSearchResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeView, setActiveView] = useState<"results" | "detail">("results");
  const [detail, setDetail] = useState<OneBoundItemPreview | null>(null);
  const [detailOfferId, setDetailOfferId] = useState<string | null>(null);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [errorAction, setErrorAction] = useState<"search" | "detail" | "save">("search");
  const [searchMeta, setSearchMeta] = useState<{ uploadedImageId: string; resultCount: number } | null>(null);
  const [saveReport, setSaveReport] = useState<SaveReport | null>(null);
  const [copied, setCopied] = useState(false);
  const [pagePreview, setPagePreview] = useState<{ url: string; title: string } | null>(null);

  const imageUrl = image.displayUrl ?? image.url ?? "";
  const existingOfferIds = useMemo(() => new Set(product.offers.map((offer) => offer.offerId)), [product.offers]);
  const availableResults = useMemo(
    () => results.filter((item) => !existingOfferIds.has(item.offerId)),
    [existingOfferIds, results],
  );
  const allSelected = availableResults.length > 0 && availableResults.every((item) => selected.has(item.offerId));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    setOptions(DEFAULT_OPTIONS);
    setResults([]);
    setSelected(new Set());
    setDetail(null);
    setDetailOfferId(null);
    setError(null);
    setSaveReport(null);
    setSearchMeta(null);
    setPagePreview(null);
    setActiveView("results");
    setSettingsLoading(true);
    api<{ settings: OneBoundSettings }>("/api/integrations/onebound")
      .then((response) => setSettings(response.settings))
      .catch((caught) => {
        setError(normalizeError(caught));
        setErrorAction("search");
      })
      .finally(() => setSettingsLoading(false));
  }, [image.id, product.id]);

  async function runSearch(searchOptions = options) {
    setSearching(true);
    setError(null);
    setSaveReport(null);
    setResults([]);
    setSelected(new Set());
    setSearchMeta(null);
    setActiveView("results");
    try {
      const response = await api<{
        results: OneBoundSearchResult[];
        resultCount: number;
        uploadedImageId: string;
      }>(`/api/products/${product.id}/images/${image.id}/search`, {
        method: "POST",
        body: JSON.stringify(searchOptions),
      });
      setResults(response.results);
      setSearchMeta({ uploadedImageId: response.uploadedImageId, resultCount: response.resultCount });
      setSelected(new Set());
    } catch (caught) {
      setError(normalizeError(caught));
      setErrorAction("search");
    } finally {
      setSearching(false);
    }
  }

  async function loadDetail(result: OneBoundSearchResult) {
    setDetailLoading(true);
    setDetail(null);
    setDetailOfferId(result.offerId);
    setError(null);
    setActiveView("detail");
    try {
      const response = await api<{ item: OneBoundItemPreview }>(
        `/api/integrations/onebound/items/${encodeURIComponent(result.offerId)}${toQuery({ cache: options.cache, lang: options.lang })}`,
      );
      setDetail(response.item);
    } catch (caught) {
      setError(normalizeError(caught));
      setErrorAction("detail");
    } finally {
      setDetailLoading(false);
    }
  }

  async function saveSelected() {
    if (selected.size === 0) return;
    setSaving(true);
    setError(null);
    setSaveReport(null);
    try {
      const response = await api<SaveReport & { product: ProductDetail }>(
        `/api/products/${product.id}/offers/onebound`,
        {
          method: "POST",
          body: JSON.stringify({ offerIds: [...selected], cache: options.cache, lang: options.lang }),
        },
      );
      setSaveReport({ saved: response.saved, failures: response.failures });
      setSelected(new Set(response.failures.map((failure) => failure.offerId)));
      await onSaved(response.product, response.saved.length, response.failures.length);
    } catch (caught) {
      setError(normalizeError(caught));
      setErrorAction("save");
    } finally {
      setSaving(false);
    }
  }

  function toggleResult(offerId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(offerId)) next.delete(offerId);
      else next.add(offerId);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(availableResults.map((item) => item.offerId)));
  }

  async function copyError() {
    if (!error) return;
    await navigator.clipboard.writeText(jsonText(error));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  function closeFromBackdrop(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
    if (outside) onClose();
  }

  function proxyImageUrl(url: string): string {
    return `/api/image-proxy${toQuery({ url })}`;
  }

  function openPagePreview(url: string, title: string) {
    setPagePreview({ url, title });
  }

  return (
    <dialog
      ref={dialogRef}
      className="image-search-dialog"
      aria-labelledby="image-search-title"
      onCancel={(event) => { event.preventDefault(); pagePreview ? setPagePreview(null) : onClose(); }}
      onMouseDown={closeFromBackdrop}
    >
      <header className="image-search-header">
        <div><span>1688 IMAGE SEARCH</span><h2 id="image-search-title">以图搜商品</h2></div>
        <div className="image-search-header-meta"><span className="mono">{product.externalId}</span><button className="icon-button" type="button" onClick={onClose} aria-label="关闭搜图弹窗" title="关闭"><X size={19} /></button></div>
      </header>

      <div className="image-search-layout">
        <aside className="image-search-config" aria-label="图片与接口配置">
          <div className="search-source-image">
            {imageUrl ? <img src={imageUrl} alt={image.altText || product.title} /> : <div><ImageIcon size={28} /><span>图片不可用</span></div>}
            <span className="search-image-id mono">IMG {image.position > 0 ? image.position : 1}</span>
          </div>
          <div className="search-product-copy"><strong>{product.title}</strong><span>{image.externalId || image.id}</span></div>

          <section className="search-config-section">
            <div className="search-config-heading"><span>SEARCH CONFIG</span><strong>搜索配置</strong></div>
            <label className="field-label"><span>结果排序</span><select autoFocus value={options.sort} onChange={(event) => setOptions((current) => ({ ...current, sort: event.target.value as SearchOptions["sort"] }))}><option value="_sale">销量从高到低</option><option value="sale">销量从低到高</option><option value="price">价格从低到高</option><option value="_price">价格从高到低</option></select></label>
            <div className="form-grid two-columns compact-config-grid">
              <label className="field-label"><span>返回数量</span><select value={options.limit} onChange={(event) => setOptions((current) => ({ ...current, limit: Number(event.target.value) as SearchOptions["limit"] }))}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label>
              <label className="field-label"><span>接口语言</span><select value={options.lang} onChange={(event) => setOptions((current) => ({ ...current, lang: event.target.value as SearchOptions["lang"] }))}><option value="cn">中文</option><option value="en">English</option><option value="ru">Русский</option></select></label>
            </div>
            <label className="field-label"><span>详情缓存</span><select value={options.cache} onChange={(event) => setOptions((current) => ({ ...current, cache: event.target.value as SearchOptions["cache"] }))}><option value="no">跳过缓存，获取最新数据</option><option value="yes">允许 OneBound 缓存</option></select></label>
          </section>

          <section className="search-config-section api-config-section">
            <div className="search-config-heading"><span>API STATUS</span><strong>接口状态</strong></div>
            <dl className="api-config-list">
              <div><dt>凭据</dt><dd>{settingsLoading ? <LoaderCircle className="spin" size={14} /> : settings?.configured ? <><Check size={14} />已加密保存</> : <><AlertTriangle size={14} />未配置</>}</dd></div>
              <div><dt>上传图片</dt><dd className="mono">1688/upload_img</dd></div>
              <div><dt>图片搜索</dt><dd className="mono">1688/item_search_img</dd></div>
              <div><dt>商品详情</dt><dd className="mono">1688/item_get</dd></div>
              <div><dt>响应格式</dt><dd className="mono">json</dd></div>
            </dl>
          </section>

          <button className="button primary search-run-button" type="button" onClick={() => void runSearch()} disabled={searching || !settings?.configured}>
            {searching ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />}{searching ? "正在搜索" : searchMeta ? "重新搜索" : "开始搜索"}
          </button>
        </aside>

        <section className="image-search-results" aria-label="搜索结果与商品详情">
          <div className="search-results-toolbar">
            <div>
              {activeView === "detail" && <button className="icon-button" type="button" onClick={() => { setActiveView("results"); setError(null); }} aria-label="返回搜索结果" title="返回结果"><ArrowLeft size={18} /></button>}
              <div><span>{activeView === "detail" ? "ITEM DETAIL" : "SEARCH RESULTS"}</span><strong>{activeView === "detail" ? "1688 商品详情" : searchMeta ? `${results.length} 个搜索结果` : "等待开始搜索"}</strong></div>
            </div>
            {activeView === "results" && results.length > 0 && <button className="button quiet compact select-all-button" type="button" onClick={toggleAll}>{allSelected ? <CheckSquare2 size={16} /> : <Square size={16} />}{allSelected ? "取消全选" : "全选"}</button>}
          </div>

          <div className="search-results-scroll">
            {error ? <div className="search-error-panel" role="alert">
              <div className="search-error-title"><span><AlertTriangle size={20} /></span><div><small>API ERROR</small><h3>{error.message}</h3></div></div>
              <dl className="search-error-meta">
                {error.status && <div><dt>HTTP 状态</dt><dd>{error.status}</dd></div>}
                {error.code && <div><dt>错误代码</dt><dd className="mono">{error.code}</dd></div>}
                {error.path && <div><dt>请求接口</dt><dd className="mono">{error.path}</dd></div>}
                {error.requestId && <div><dt>请求 ID</dt><dd className="mono">{error.requestId}</dd></div>}
              </dl>
              <div className="search-error-response"><div><span>完整响应</span><button className="button quiet compact" type="button" onClick={() => void copyError()}><Copy size={15} />{copied ? "已复制" : "复制错误"}</button></div><pre>{jsonText(error.details)}</pre></div>
              <div className="search-error-actions">
                {errorAction !== "search" && <button className="button quiet" type="button" onClick={() => { setError(null); setActiveView("results"); }}>返回结果</button>}
                <button className="button primary" type="button" onClick={() => errorAction === "search" ? void runSearch() : errorAction === "detail" && detailOfferId ? void loadDetail({ offerId: detailOfferId } as OneBoundSearchResult) : void saveSelected()}><RefreshCw size={16} />重试</button>
              </div>
            </div> : activeView === "detail" ? (
              detailLoading ? <div className="detail-preview-skeleton"><i /><i /><i /><i /></div> : detail ? <div className="onebound-detail-preview">
                <div className="onebound-detail-hero">
                  <div className="onebound-detail-image">{detail.imageUrl ? <img src={proxyImageUrl(detail.imageUrl)} alt={detail.title} /> : <ImageIcon size={28} />}</div>
                  <div className="onebound-detail-title"><span className="mono">{detail.offerId}</span><h3>{detail.title}</h3><p>{detail.supplierName || "供应商信息未返回"}{detail.location ? ` · ${detail.location}` : ""}</p><div><strong>{money(detail.priceMin)}</strong>{detail.priceMax != null && detail.priceMax !== detail.priceMin ? <span>至 {money(detail.priceMax)}</span> : null}</div></div>
                  <div className="onebound-detail-actions">
                    {detail.detailUrl && <button className="button quiet compact" type="button" onClick={() => openPagePreview(detail.detailUrl!, detail.title)}>查看1688</button>}
                    {existingOfferIds.has(detail.offerId) ? <span className="detail-saved-label"><Check size={15} />已在候选</span> : <button className="button quiet compact" type="button" onClick={() => toggleResult(detail.offerId)}>{selected.has(detail.offerId) ? <CheckSquare2 size={15} /> : <Square size={15} />}{selected.has(detail.offerId) ? "取消待保存" : "加入待保存"}</button>}
                  </div>
                </div>
                <dl className="onebound-detail-stats"><div><dt>起批量</dt><dd>{detail.minOrderQuantity ?? "—"} {detail.unit || ""}</dd></div><div><dt>SKU</dt><dd>{detail.skuCount}</dd></div><div><dt>库存</dt><dd>{detail.stockQuantity ?? "—"}</dd></div><div><dt>销量</dt><dd>{detail.soldQuantity ?? "—"}</dd></div><div><dt>品牌</dt><dd>{detail.brand || "—"}</dd></div><div><dt>类目 ID</dt><dd className="mono">{detail.categoryId || "—"}</dd></div></dl>
                {detail.images.length > 0 && <section className="onebound-preview-section"><div className="onebound-preview-heading"><span>IMAGES</span><strong>商品图片</strong><small>{detail.images.length}</small></div><div className="onebound-preview-gallery">{detail.images.slice(0, 12).map((url, index) => <a href={proxyImageUrl(url)} target="_blank" rel="noreferrer" key={`${url}-${index}`}><img src={proxyImageUrl(url)} alt={`${detail.title} ${index + 1}`} /></a>)}</div></section>}
                {detail.priceTiers.length > 0 && <section className="onebound-preview-section"><div className="onebound-preview-heading"><span>PRICE RANGE</span><strong>价格阶梯</strong></div><div className="compact-table-wrap"><table className="compact-table"><thead><tr><th>起订量</th><th>批发价</th><th>原价</th></tr></thead><tbody>{detail.priceTiers.map((tier, index) => <tr key={index}><td>{tier.minQuantity ?? "—"}</td><td>{money(tier.price)}</td><td>{tier.originalPrice == null ? "—" : money(tier.originalPrice)}</td></tr>)}</tbody></table></div></section>}
                {detail.properties.length > 0 && <section className="onebound-preview-section"><div className="onebound-preview-heading"><span>PROPERTIES</span><strong>商品属性</strong><small>{detail.properties.length}</small></div><dl className="onebound-property-list">{detail.properties.map((property, index) => <div key={`${property.name}-${index}`}><dt>{property.name}</dt><dd>{property.value}</dd></div>)}</dl></section>}
                <details className="onebound-raw-response"><summary>查看 item_get 原始数据</summary><pre>{jsonText(detail.raw)}</pre></details>
              </div> : null
            ) : searching ? <div className="search-result-skeletons">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</div> : results.length > 0 ? <>
              {searchMeta && <div className="search-request-strip"><span>IMGID</span><code>{searchMeta.uploadedImageId}</code><span>{searchMeta.resultCount} RESULTS</span></div>}
              {saveReport && <div className={saveReport.failures.length ? "search-save-report partial" : "search-save-report success"}><Check size={17} /><span>已保存 {saveReport.saved.length} 个候选{saveReport.failures.length ? `，${saveReport.failures.length} 个失败` : ""}</span>{saveReport.failures.length > 0 && <details><summary>查看失败详情</summary><pre>{jsonText({ failures: saveReport.failures })}</pre></details>}</div>}
              <div className="search-result-grid">{results.map((result) => {
                const checked = selected.has(result.offerId);
                const existing = existingOfferIds.has(result.offerId);
                return <article className={`search-result-card ${checked ? "selected" : ""} ${existing ? "saved" : ""}`} key={result.offerId}>
                  <label className="search-result-check" title={existing ? "已在候选列表" : "选择商品"}><input type="checkbox" checked={checked || existing} onChange={() => toggleResult(result.offerId)} disabled={existing} aria-label={`选择 ${result.title}`} /><span>{existing ? <Check size={15} /> : checked ? <Check size={15} /> : null}</span></label>
                  <div className="search-result-image">{result.imageUrl ? <img src={proxyImageUrl(result.imageUrl)} alt={result.title} /> : <ImageIcon size={26} />}{existing && <span className="search-result-saved-badge">已保存</span>}</div>
                  <div className="search-result-content"><span className="mono">{result.offerId}</span><h3>{result.title}</h3><div className="search-result-price"><strong>{priceLabel(result)}</strong><small>{result.sales == null ? "销量未返回" : `销量 ${result.sales}`}</small></div><div className="search-result-actions"><button className="button quiet compact" type="button" onClick={() => void loadDetail(result)}><FileSearch size={15} />获取商品详情</button>{result.detailUrl && <button className="button quiet compact" type="button" onClick={() => openPagePreview(result.detailUrl!, result.title)}>查看1688</button>}</div></div>
                </article>;
              })}</div>
            </> : searchMeta ? <div className="search-empty-state"><Search size={28} /><strong>没有找到匹配商品</strong><span>可以调整左侧排序、缓存或返回数量后重新搜索。</span><button className="button quiet" type="button" onClick={() => void runSearch()}><RefreshCw size={16} />重新搜索</button></div> : <div className="search-empty-state search-ready-state"><Search size={28} /><strong>准备开始搜图</strong><span>确认左侧图片和接口配置后，手动点击“开始搜索”。</span><button className="button primary" type="button" onClick={() => void runSearch()} disabled={searching || !settings?.configured}><Search size={16} />开始搜索</button></div>}
          </div>

          {activeView === "results" && <footer className="search-selection-bar"><div><strong>{selected.size}</strong><span>个商品待保存</span></div><button className="button primary" type="button" onClick={() => void saveSelected()} disabled={selected.size === 0 || saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}{saving ? "正在获取详情并保存" : "保存到候选列表"}</button></footer>}
        </section>
      </div>
      {pagePreview && <div className="onebound-page-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPagePreview(null)}>
        <section className="onebound-page-modal" role="dialog" aria-modal="true" aria-labelledby="onebound-page-title">
          <header className="onebound-page-header">
            <div><span>1688 PAGE PREVIEW</span><h3 id="onebound-page-title">{pagePreview.title}</h3><small>{pagePreview.url}</small></div>
            <div><a className="button quiet compact" href={pagePreview.url} target="_blank" rel="noreferrer">新窗口打开</a><button className="button quiet compact" type="button" onClick={() => setPagePreview(null)}>关闭</button></div>
          </header>
          <iframe src={pagePreview.url} title={`1688 页面：${pagePreview.title}`} referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts" />
        </section>
      </div>}
    </dialog>
  );
}
