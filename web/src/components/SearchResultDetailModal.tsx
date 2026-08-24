import { Boxes, FileJson, ImageIcon, LoaderCircle, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { toQuery } from "../api";
import type { OneBoundItemPreview, SearchTask, SearchTaskResult } from "../types";
import { ImagePreviewModal } from "./ImagePreviewModal";

type Props = {
  result: SearchTaskResult;
  task: SearchTask;
  detail: OneBoundItemPreview | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onClose: () => void;
};

type PreviewState = { url: string; title: string };

function imageUrl(url: string): string {
  return url.startsWith("data:image/") || url.startsWith("/") ? url : `/api/image-proxy${toQuery({ url })}`;
}

function money(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(value);
}

function value(value: unknown): string {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function attributeText(attributes: Record<string, unknown> | undefined): string {
  if (!attributes) return "";
  const raw = attributes.propertiesName ?? attributes.properties ?? attributes.specId;
  return typeof raw === "string" ? raw : raw == null ? "" : JSON.stringify(raw);
}

function safeDescriptionHtml(html: string): string {
  return html
    .replace(/<\/?(?:script|style|iframe|object|embed|link|meta)[^>]*>/giu, "")
    .replace(/\s(?:on[a-z]+|style|srcdoc)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
    .replace(/javascript:/giu, "");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function descriptionValueToHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value);
    return /<\/?[a-z][^>]*>/iu.test(text) ? safeDescriptionHtml(text) : escapeHtml(text).replace(/\r?\n/g, "<br />");
  }
  if (Array.isArray(value)) return value.map(descriptionValueToHtml).join("");
  const record = asRecord(value);
  if (!record) return "";
  const imageSource = [record.url, record.src, record.image, record.imageUrl, record.picUrl, record.content].find((item) => typeof item === "string" && /^https?:\/\//iu.test(item));
  if (imageSource) return `<img src="${escapeHtml(String(imageSource))}" alt="商品详情图片" />`;
  if (record.html && typeof record.html === "string") return safeDescriptionHtml(record.html);
  const children = record.items ?? record.children ?? record.content ?? record.value ?? record.data;
  if (children !== undefined) return descriptionValueToHtml(children);
  const text = record.text ?? record.title ?? record.name;
  return text === undefined ? "" : descriptionValueToHtml(text);
}

function renderDescriptionHtml(value: string): string {
  const text = value.trim();
  const candidates = [
    text,
    text.replace(/\\r\\n/gu, "\n").replace(/\\n/gu, "\n").replace(/\\"/gu, '"'),
    text.replace(/^\uFEFF/u, ""),
  ];
  const marker = text.search(/[\[{]\s*"(?:styleType|items|type|content)"/iu);
  if (marker > 0) candidates.push(text.slice(marker));
  for (const candidate of candidates) {
    if (!/^[\[{]/u.test(candidate)) continue;
    try {
      let parsed: unknown = JSON.parse(candidate);
      for (let index = 0; index < 2 && typeof parsed === "string"; index += 1) parsed = JSON.parse(parsed);
      return descriptionValueToHtml(parsed);
    } catch {
      // Try the next common upstream encoding.
    }
  }
  return safeDescriptionHtml(text);
}

function extractDescriptionHtml(detail: OneBoundItemPreview): string | null {
  if (detail.descriptionHtml) return detail.descriptionHtml;
  const responseItem = asRecord(detail.rawResponse?.item) ?? asRecord(detail.rawResponse?.data);
  const raw = asRecord(detail.raw);
  const candidates = [
    responseItem?.desc,
    responseItem?.description,
    responseItem?.desc_html,
    responseItem?.description_html,
    responseItem?.detail_desc,
    responseItem?.detail_description,
    raw?.desc,
    raw?.description,
    raw?.desc_html,
    raw?.description_html,
    raw?.detail_desc,
    raw?.detail_description,
  ];
  const candidate = candidates.find((item) => item !== null && item !== undefined && item !== "");
  if (candidate === null || candidate === undefined) return null;
  if (typeof candidate === "string") return candidate.trim() || null;
  try {
    return JSON.stringify(candidate);
  } catch {
    return String(candidate);
  }
}

function relativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "刚刚";
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  if (elapsed < minute) return "刚刚";
  if (elapsed < hour) return `${Math.floor(elapsed / minute)} 分钟前`;
  if (elapsed < day) return `${Math.floor(elapsed / hour)} 小时前`;
  if (elapsed < month) return `${Math.floor(elapsed / day)} 天前`;
  return `${Math.floor(elapsed / month)} 个月前`;
}

export function SearchResultDetailModal({ result, task, detail, loading, error, onRefresh, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  function openImage(url: string, title: string) {
    setPreview({ url, title });
  }

  function imageButton(url: string, title: string, className = "") {
    return <button className={`task-detail-image-button ${className}`.trim()} type="button" onClick={() => openImage(url, title)} aria-label={`查看${title}大图`} title="查看大图">
      <img src={imageUrl(url)} alt={title} loading="lazy" />
    </button>;
  }

  const descriptionHtml = detail ? extractDescriptionHtml(detail) : null;
  const rawJson = detail ? JSON.stringify(detail.rawResponse || detail.raw, null, 2) : "";

  return <>
    <dialog
      ref={dialogRef}
      className="task-detail-dialog"
      aria-labelledby="task-detail-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
      <header className="task-dialog-header">
        <div><span>ITEM DETAIL COMPARISON</span><h2 id="task-detail-title">搜图详情对比</h2><small className="mono">{result.offerId}</small></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭" title="关闭"><X size={19} /></button>
      </header>
      <div className="task-detail-body">
        <div className="task-detail-columns">
          <section className="task-detail-column task-detail-database">
            <header><span>DATABASE TASK</span><h3>{task.productTitle || task.name}</h3><p>{task.description || "任务采集信息"}</p></header>
            <dl className="task-detail-info-list">
              <div><dt>任务名称</dt><dd>{task.name}</dd></div><div><dt>SKU</dt><dd>{task.sku || "-"}</dd></div>
              <div><dt>来源网站</dt><dd>{task.sourceSite || "-"}</dd></div><div><dt>搜图结果</dt><dd>{task.resultCount}</dd></div>
              <div><dt>采集图片</dt><dd>{task.images.length} 张</dd></div><div><dt>更新时间</dt><dd>{new Date(task.updatedAt).toLocaleString("zh-CN")}</dd></div>
            </dl>
            <div className="task-detail-image-grid task-detail-task-images">{task.images.map((image, index) => imageButton(image.url, image.alt || image.title || `任务图片 ${index + 1}`))}</div>
            <div className="task-detail-source-result"><span>本轮匹配商品</span><h4>{result.title || result.offerId || "未命名商品"}</h4><p>{result.supplierName || "1688"}{result.location ? ` · ${result.location}` : ""}</p></div>
          </section>

          <section className="task-detail-column task-detail-onebound">
            <div className="task-detail-cache-row">
              <span className="task-detail-cache-status">{detail?.fromCache && detail.cachedAt ? `缓存于 ${relativeTime(detail.cachedAt)}` : detail ? "刚刚获取最新数据" : "等待详情数据"}</span>
              <div className="task-detail-top-actions">
                <button className="button quiet compact" type="button" onClick={onRefresh} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={14} />获取最新数据</button>
                {detail && <button className="button quiet compact" type="button" onClick={() => setShowRaw((current) => !current)}><FileJson size={14} />{showRaw ? "隐藏返回 JSON" : "查看返回 JSON"}</button>}
              </div>
            </div>
            {showRaw && detail && <pre className="task-detail-raw task-detail-raw-top">{rawJson}</pre>}
            <header><span>1688 ITEM_GET</span><h3>{detail?.title || result.title || result.offerId || "1688 商品详情"}</h3><p className="mono">{result.offerId}</p></header>
            {loading ? <div className="task-detail-state"><LoaderCircle className="spin" size={22} />正在请求商品详情</div> : error ? <div className="task-detail-state error" role="alert">{error}</div> : detail ? <>
              <div className="task-detail-detail-hero">{detail.imageUrl ? imageButton(detail.imageUrl, detail.title, "task-detail-hero-image") : <ImageIcon size={28} />}<div><strong>{detail.title}</strong><p>{detail.supplierName || detail.sellerNick || "供应商信息未返回"}{detail.location ? ` · ${detail.location}` : ""}</p><b>{money(detail.priceMin)}{detail.priceMax != null && detail.priceMax !== detail.priceMin ? ` - ${money(detail.priceMax)}` : ""}</b></div></div>
              <dl className="task-detail-info-list task-detail-stats"><div><dt>起批量</dt><dd>{value(detail.minOrderQuantity)} {detail.unit || ""}</dd></div><div><dt>销量</dt><dd>{value(detail.soldQuantity)}</dd></div><div><dt>库存</dt><dd>{value(detail.stockQuantity)}</dd></div><div><dt>SKU</dt><dd>{detail.skuCount}</dd></div><div><dt>品牌</dt><dd>{value(detail.brand)}</dd></div><div><dt>类目</dt><dd>{value(detail.categoryId)}</dd></div><div><dt>重量</dt><dd>{value(detail.itemWeight)}</dd></div><div><dt>尺寸</dt><dd>{value(detail.itemSize)}</dd></div><div><dt>发货地</dt><dd>{value(detail.shippingTo || detail.location)}</dd></div></dl>
              {detail.images.length > 0 && <section className="task-detail-section"><div className="task-detail-section-heading"><span>IMAGES</span><strong>商品图片</strong></div><div className="task-detail-image-grid onebound-images">{detail.images.map((url, index) => imageButton(url, `${detail.title} 商品图片 ${index + 1}`))}</div></section>}
              {detail.descriptionImages.length > 0 && <section className="task-detail-section"><div className="task-detail-section-heading"><span>DESCRIPTION IMAGES</span><strong>详情图片</strong></div><div className="task-detail-image-grid onebound-images">{detail.descriptionImages.map((url, index) => imageButton(url, `${detail.title} 详情图片 ${index + 1}`))}</div></section>}
              {detail.propertyImages && detail.propertyImages.length > 0 && <section className="task-detail-section"><div className="task-detail-section-heading"><span>PROPERTY IMAGES</span><strong>属性图片</strong></div><div className="task-detail-image-grid onebound-images">{detail.propertyImages.map((item, index) => imageButton(item.url, item.propertiesKey || `属性图片 ${index + 1}`))}</div></section>}
              {detail.variants.length > 0 && <section className="task-detail-section"><div className="task-detail-section-heading"><span>SKU</span><strong>SKU 与对应图片</strong></div><div className="task-detail-variant-list">{detail.variants.map((variant, index) => <article key={`${variant.externalId || variant.sku || index}`}><div className="task-detail-variant-image">{variant.imageUrl ? imageButton(variant.imageUrl, variant.name || variant.sku || `SKU ${index + 1}`) : <Boxes size={18} />}</div><div><strong>{variant.name || attributeText(variant.attributes) || `SKU ${index + 1}`}</strong><small className="mono">{variant.sku || variant.externalId || "-"}</small><span>{variant.price == null ? "-" : money(variant.price)} · 库存 {value(variant.stock)}</span></div></article>)}</div></section>}
              {detail.priceTiers.length > 0 && <section className="task-detail-section"><div className="task-detail-section-heading"><span>PRICE TIERS</span><strong>价格阶梯</strong></div><div className="task-detail-price-tiers">{detail.priceTiers.map((tier, index) => <div key={index}><span>{tier.minQuantity ?? "-"} 件起</span><b>{money(tier.price)}</b><small>原价 {money(tier.originalPrice)}</small></div>)}</div></section>}
              {detail.videos && detail.videos.length > 0 && <section className="task-detail-section"><div className="task-detail-section-heading"><span>VIDEOS</span><strong>商品视频</strong></div><div className="task-detail-video-list">{detail.videos.map((video) => <a key={video.url} href={video.url} target="_blank" rel="noreferrer">{video.title || "打开商品视频"}</a>)}</div></section>}
              {detail.properties.length > 0 && <section className="task-detail-section"><div className="task-detail-section-heading"><span>PROPERTIES</span><strong>商品属性</strong></div><dl className="task-detail-properties-list">{detail.properties.map((item, index) => <div key={`${item.name}-${index}`}><dt>{item.name}</dt><dd>{item.value}</dd></div>)}</dl></section>}
              {descriptionHtml && <section className="task-detail-section"><div className="task-detail-section-heading"><span>DESCRIPTION</span><strong>详情简介</strong></div><div className="task-detail-description-html" dangerouslySetInnerHTML={{ __html: renderDescriptionHtml(descriptionHtml) }} /></section>}
            </> : null}
          </section>
        </div>
      </div>
    </dialog>
    {preview && <ImagePreviewModal url={preview.url} title={preview.title} onClose={() => setPreview(null)} />}
  </>;
}
