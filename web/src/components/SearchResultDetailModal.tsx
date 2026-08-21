import { ArrowUpRight, ImageIcon, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { toQuery } from "../api";
import type { OneBoundItemPreview, SearchTaskResult } from "../types";

type Props = {
  result: SearchTaskResult;
  detail: OneBoundItemPreview | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
};

function imageUrl(url: string): string {
  return url.startsWith("/") ? url : `/api/image-proxy${toQuery({ url })}`;
}

function money(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(value);
}

function value(value: unknown): string {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

export function SearchResultDetailModal({ result, detail, loading, error, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  const rows = [
    ["商品标题", result.title, detail?.title],
    ["价格", money(result.promotionPrice ?? result.price), detail ? `${money(detail.priceMin)}${detail.priceMax != null && detail.priceMax !== detail.priceMin ? ` - ${money(detail.priceMax)}` : ""}` : null],
    ["供应商", result.supplierName, detail?.supplierName],
    ["所在地", result.location, detail?.location],
    ["销量", result.sales, detail?.soldQuantity],
    ["起批量", null, detail ? `${value(detail.minOrderQuantity)} ${detail.unit || ""}`.trim() : null],
    ["库存", null, detail?.stockQuantity],
    ["SKU 数量", null, detail?.skuCount],
    ["品牌", null, detail?.brand],
    ["类目 ID", null, detail?.categoryId],
  ];

  return <dialog
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
      <div><span>ITEM DETAIL COMPARISON</span><h2 id="task-detail-title">查询详情对比</h2><small className="mono">{result.offerId}</small></div>
      <button className="icon-button" type="button" onClick={onClose} aria-label="关闭" title="关闭"><X size={19} /></button>
    </header>
    <div className="task-detail-body">
      <section className="task-detail-source">
        <div className="task-detail-source-image">{result.imageUrl ? <img src={imageUrl(result.imageUrl)} alt={result.title || "查询结果"} /> : <ImageIcon size={28} />}</div>
        <div><span>SEARCH RESULT</span><h3>{result.title || result.offerId || "未命名商品"}</h3><p>左侧数据来自本轮图片查询；右侧数据来自刚刚请求的 item_get 商品详情。</p></div>
      </section>

      {loading ? <div className="task-detail-state"><LoaderCircle className="spin" size={22} />正在请求最新商品详情</div> : error ? <div className="task-detail-state error" role="alert">{error}</div> : detail ? <>
        <div className="task-compare-table-wrap">
          <table className="task-compare-table"><thead><tr><th>字段</th><th>本轮查询结果</th><th>最新详情</th></tr></thead><tbody>{rows.map(([label, current, latest]) => <tr key={String(label)}><th>{label}</th><td>{value(current)}</td><td>{value(latest)}</td></tr>)}</tbody></table>
        </div>
        {detail.shortDescription && <section className="task-detail-description"><span>DETAIL DESCRIPTION</span><h3>详情简介</h3><p>{detail.shortDescription}</p></section>}
        {detail.properties.length > 0 && <section className="task-detail-properties"><div><span>PROPERTIES</span><h3>商品属性</h3></div><dl>{detail.properties.map((item, index) => <div key={`${item.name}-${index}`}><dt>{item.name}</dt><dd>{item.value}</dd></div>)}</dl></section>}
      </> : null}
    </div>
    <footer className="task-dialog-footer">
      {detail?.detailUrl && <a className="button quiet" href={detail.detailUrl} target="_blank" rel="noreferrer">打开 1688 <ArrowUpRight size={15} /></a>}
      <button className="button primary" type="button" onClick={onClose}>关闭</button>
    </footer>
  </dialog>;
}
