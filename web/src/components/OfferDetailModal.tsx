import { ArrowUpRight, Boxes, ImageIcon, LoaderCircle, PackageOpen, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { toQuery } from "../api";
import type { StoredOfferDetail } from "../types";

type Props = {
  detail: StoredOfferDetail | null;
  loading: boolean;
  onClose: () => void;
};

function money(value: number | null | undefined, currency = "CNY"): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function imageUrl(url: string): string {
  if (url.startsWith("/")) return url;
  return `/api/image-proxy${toQuery({ url })}`;
}

function attributeText(attributes: Record<string, unknown>): string {
  const values = Object.entries(attributes).map(([key, value]) => `${key}: ${String(value)}`);
  return values.join(" / ") || "默认规格";
}

export function OfferDetailModal({ detail, loading, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pagePreviewOpen, setPagePreviewOpen] = useState(false);
  const gallery = useMemo(() => detail?.images.filter((image) => image.displayUrl) ?? [], [detail]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  function closeFromBackdrop(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
    if (outside) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="offer-detail-dialog"
      aria-labelledby="offer-detail-title"
      onCancel={(event) => {
        event.preventDefault();
        pagePreviewOpen ? setPagePreviewOpen(false) : onClose();
      }}
      onMouseDown={closeFromBackdrop}
    >
      <header className="offer-detail-header">
        <div><span>1688 STORED PRODUCT</span><h2 id="offer-detail-title">候选货源详情</h2></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭" title="关闭"><X size={19} /></button>
      </header>

      <div className="offer-detail-scroll">
        {loading ? <div className="offer-detail-loading"><LoaderCircle className="spin" size={22} />读取已保存的商品详情</div> : detail ? <>
          <section className="offer-detail-hero">
            <div className="offer-detail-main-image">
              {gallery[0]?.displayUrl ? <img src={imageUrl(gallery[0].displayUrl!)} alt={detail.title} /> : <ImageIcon size={30} />}
            </div>
            <div className="offer-detail-title-block">
              <span className="mono">{detail.offerId}</span>
              <h3>{detail.title}</h3>
              <p>{detail.supplierName || detail.sellerNick || "供应商待补充"}{detail.location || detail.province || detail.city ? ` · ${detail.location || [detail.province, detail.city].filter(Boolean).join(" ")}` : ""}</p>
              <div className="offer-detail-price"><strong>{money(detail.priceMin ?? detail.totalPrice, detail.currency)}</strong>{detail.priceMax != null && detail.priceMax !== detail.priceMin ? <span>至 {money(detail.priceMax, detail.currency)}</span> : null}</div>
              {detail.url && <button className="button quiet compact" type="button" onClick={() => setPagePreviewOpen(true)}>查看1688 <ArrowUpRight size={14} /></button>}
            </div>
          </section>

          <dl className="offer-detail-stats">
            <div><dt>起批量</dt><dd>{detail.minOrderQuantity ?? "—"} {detail.unit || ""}</dd></div>
            <div><dt>SKU</dt><dd>{detail.variants.length}</dd></div>
            <div><dt>库存</dt><dd>{detail.stockQuantity ?? "—"}</dd></div>
            <div><dt>销量</dt><dd>{detail.soldQuantity ?? "—"}</dd></div>
            <div><dt>品牌</dt><dd>{detail.brand || "—"}</dd></div>
            <div><dt>类目 ID</dt><dd className="mono">{detail.categoryId || "—"}</dd></div>
          </dl>

          {gallery.length > 0 && <section className="offer-detail-section"><div className="offer-detail-section-heading"><div><span>IMAGES</span><h4>商品图片</h4></div><small>{gallery.length} 张</small></div><div className="offer-detail-gallery">{gallery.map((image, index) => <a href={imageUrl(image.displayUrl!)} target="_blank" rel="noreferrer" key={image.id}><img src={imageUrl(image.displayUrl!)} alt={`${detail.title} ${index + 1}`} loading="lazy" /></a>)}</div></section>}

          {detail.priceTiers.length > 0 && <section className="offer-detail-section"><div className="offer-detail-section-heading"><div><span>PRICE RANGE</span><h4>价格阶梯</h4></div></div><div className="compact-table-wrap"><table className="compact-table"><thead><tr><th>起订量</th><th>批发价</th><th>原价</th></tr></thead><tbody>{detail.priceTiers.map((tier) => <tr key={tier.id}><td>{tier.minQuantity ?? "—"}</td><td>{money(tier.price, detail.currency)}</td><td>{money(tier.originalPrice, detail.currency)}</td></tr>)}</tbody></table></div></section>}

          <section className="offer-detail-section"><div className="offer-detail-section-heading"><div><span>VARIANTS</span><h4>SKU 明细</h4></div><small>{detail.variants.length} 个</small></div>{detail.variants.length ? <div className="compact-table-wrap"><table className="compact-table"><thead><tr><th>SKU</th><th>规格</th><th>价格</th><th>库存</th></tr></thead><tbody>{detail.variants.map((variant) => <tr key={variant.id}><td className="mono">{variant.sku || variant.externalId}</td><td>{variant.name || attributeText(variant.attributes)}</td><td>{money(variant.price, detail.currency)}</td><td>{variant.stock ?? "—"}</td></tr>)}</tbody></table></div> : <div className="compact-empty"><Boxes size={18} />暂无 SKU 数据</div>}</section>

          {detail.properties.length > 0 && <section className="offer-detail-section"><div className="offer-detail-section-heading"><div><span>PROPERTIES</span><h4>商品属性</h4></div><small>{detail.properties.length} 项</small></div><dl className="offer-detail-properties">{detail.properties.map((property) => <div key={property.id}><dt>{property.name}</dt><dd>{property.value}</dd></div>)}</dl></section>}
        </> : <div className="offer-detail-loading"><PackageOpen size={22} />没有可显示的详情</div>}
      </div>

      {pagePreviewOpen && detail?.url && <div className="onebound-page-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPagePreviewOpen(false)}>
        <section className="onebound-page-modal" role="dialog" aria-modal="true" aria-labelledby="stored-offer-page-title">
          <header className="onebound-page-header"><div><span>1688 PAGE PREVIEW</span><h3 id="stored-offer-page-title">{detail.title}</h3><small>{detail.url}</small></div><div><a className="button quiet compact" href={detail.url} target="_blank" rel="noreferrer">新窗口打开</a><button className="button quiet compact" type="button" onClick={() => setPagePreviewOpen(false)}>关闭</button></div></header>
          <iframe src={detail.url} title={`1688 页面：${detail.title}`} referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts" />
        </section>
      </div>}
    </dialog>
  );
}
