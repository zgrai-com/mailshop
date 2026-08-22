import {
  Archive,
  ArrowUpRight,
  Boxes,
  CloudUpload,
  Grid2X2,
  ImageIcon,
  Link2,
  LoaderCircle,
  PackageOpen,
  Save,
  ScanSearch,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { ChangeEvent, useEffect, useState } from "react";

import type { ProductDetail as ProductDetailType, ProductImage, ProductStatus, ShopifyStore } from "../types";
import { HtmlContent } from "./HtmlContent";
import { proxiedImageUrl } from "../media";

const statusLabels: Record<ProductStatus, string> = {
  new: "待整理",
  image_searching: "待图搜",
  matched: "已匹配",
  reviewed: "已审核",
  archived: "已归档",
};

type Props = {
  product: ProductDetailType | null;
  shopifyStores: ShopifyStore[];
  loading: boolean;
  saving: boolean;
  onClose: () => void;
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
  onOpenOffer: () => void;
  onRemoveOffer: (linkId: string) => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  onImageSearch: (image: ProductImage) => void;
  onPublishShopify: (storeId: string) => Promise<void>;
  onArchive: () => Promise<void>;
  onDelete: () => Promise<void>;
};

function formatMoney(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency }).format(value);
}

function priceRange(min: number | null | undefined, max: number | null | undefined, currency: string): string {
  if (min == null && max == null) return "价格待补充";
  if (min === max || max == null) return formatMoney(min, currency);
  return `${formatMoney(min, currency)} – ${formatMoney(max, currency)}`;
}

type AttributeRow = { label: string; value: string };

function objectRows(value: unknown, labelKey: string, valueKey: string): AttributeRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const label = String(record[labelKey] ?? "").trim();
    const itemValue = String(record[valueKey] ?? "").trim();
    return label && itemValue ? [{ label, value: itemValue }] : [];
  });
}

function categoryNames(value: unknown[]): string[] {
  return [...new Set(value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const name = String((item as Record<string, unknown>).name ?? "").trim();
    return name ? [name] : [];
  }))];
}

export function ProductDetail({
  product,
  shopifyStores,
  loading,
  saving,
  onClose,
  onPatch,
  onOpenOffer,
  onRemoveOffer,
  onUpload,
  onImageSearch,
  onPublishShopify,
  onArchive,
  onDelete,
}: Props) {
  const [activeImage, setActiveImage] = useState(0);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [removingLink, setRemovingLink] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(true);
  const [selectedShopifyStoreId, setSelectedShopifyStoreId] = useState<string | null>(null);

  useEffect(() => {
    setActiveImage(0);
    setNotes(product?.notes ?? "");
    setGalleryOpen(true);
  }, [product?.id, product?.notes]);

  const activeShopifyStores = shopifyStores.filter((store) => store.status === "active");
  useEffect(() => {
    setSelectedShopifyStoreId((current) => activeShopifyStores.some((store) => store.id === current)
      ? current
      : activeShopifyStores[0]?.id ?? null);
  }, [shopifyStores]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      await onUpload(file);
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return <aside className="detail-panel open"><div className="detail-loading"><LoaderCircle className="spin" size={24} /><span>加载商品详情</span></div></aside>;
  }
  if (!product) return null;

  const activeProductImage = product.images[activeImage];
  const currentImage = proxiedImageUrl(activeProductImage?.displayUrl ?? activeProductImage?.url);
  const specificationRows = objectRows(product.attributes.specifications, "name", "value_name");
  const customFieldRows = objectRows(product.attributes.customFields, "field", "value");
  const propertyRows = objectRows(product.attributes.properties, "name", "value");
  const productCategories = categoryNames(product.categories);
  const descriptionImages = Array.isArray(product.content.descriptionImages)
    ? product.content.descriptionImages.filter((item): item is string => typeof item === "string")
    : [];
  const shopifyStore = activeShopifyStores.find((store) => store.id === selectedShopifyStoreId) ?? null;
  const shopifySyncLabel = product.syncState === "synced" ? "已同步" : product.syncState === "pending" ? "同步中" : product.syncState === "failed" ? "失败" : "未同步";

  return (
    <>
      <aside className={`image-panel ${galleryOpen ? "open" : ""}`} aria-label="商品图片">
        <header className="image-panel-header">
          <div><span>IMAGES</span><strong>商品图片</strong><small>{product.images.length} 张</small></div>
          <div className="image-panel-header-actions">
            <label className="icon-button upload-icon-button" title="上传图片" aria-label="上传图片">
              {uploading ? <LoaderCircle className="spin" size={17} /> : <Upload size={17} />}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={upload} disabled={uploading} />
            </label>
            <button className="icon-button" type="button" onClick={() => setGalleryOpen(false)} aria-label="收起图片栏" title="收起图片栏"><X size={18} /></button>
          </div>
        </header>
        <div className="image-panel-scroll">
          {product.images.length ? <div className="image-card-grid">{product.images.map((image, index) => {
            const imageUrl = proxiedImageUrl(image.displayUrl ?? image.url);
            return <article className={`image-card ${activeImage === index ? "active" : ""}`} key={image.id}>
              <button className="image-card-preview" type="button" onClick={() => setActiveImage(index)} aria-label={`查看第 ${index + 1} 张图片`}>
                <img src={imageUrl} alt={image.altText || `${product.title} ${index + 1}`} />
              </button>
              <span className="image-card-index">{String(index + 1).padStart(2, "0")}</span>
              {product.sourcePlatform !== "1688" && <button className="image-card-search" type="button" onClick={() => onImageSearch(image)} aria-label={`用第 ${index + 1} 张图片搜索 1688`} title="以图搜 1688">
                <ScanSearch size={16} />
              </button>}
            </article>;
          })}</div> : <div className="image-panel-empty"><ImageIcon size={28} /><span>暂无商品图片</span></div>}
        </div>
      </aside>

      <aside className="detail-panel open" aria-label="商品详情">
      <header className="detail-header">
        <div className="detail-source"><span className={`source-badge ${product.sourcePlatform}`}>{product.sourcePlatform}</span><span>{product.externalId}</span></div>
        <div className="detail-header-actions">
          {!galleryOpen && <button className="icon-button" type="button" onClick={() => setGalleryOpen(true)} aria-label="打开图片栏" title="打开图片栏"><Grid2X2 size={18} /></button>}
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭详情" title="关闭详情"><X size={19} /></button>
        </div>
      </header>

      <div className="detail-scroll">
        <section className="detail-title-block">
          {activeShopifyStores.length > 0 && <label className="shopify-target-select"><span>发布到店铺</span><select value={selectedShopifyStoreId ?? ""} onChange={(event) => setSelectedShopifyStoreId(event.target.value || null)} aria-label="选择 Shopify 发布店铺">{activeShopifyStores.map((store) => <option key={store.id} value={store.id}>{store.displayName || store.shopDomain}</option>)}</select></label>}
          <h2>{product.title}</h2>
          <div className="detail-title-meta"><span>{product.vendor || "未填写供应商"}</span><span>{product.productType || "未分类"}</span></div>
          <div className="detail-actions-row">
            <label className="status-select-wrap"><span className={`status-dot ${product.status}`} /><select value={product.status} onChange={(event) => onPatch({ status: event.target.value })} aria-label="商品状态">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {product.sourceUrl && <a className="button icon-text quiet" href={product.sourceUrl} target="_blank" rel="noreferrer"><ArrowUpRight size={16} />来源页</a>}
          </div>
          <button className="button primary shopify-publish-button" type="button" onClick={() => shopifyStore && onPublishShopify(shopifyStore.id)} disabled={saving || !shopifyStore} title={shopifyStore ? `上传到 ${shopifyStore.displayName || shopifyStore.shopDomain}` : "请先在系统设置中配置并测试 Shopify 店铺"}>
            {saving ? <LoaderCircle className="spin" size={16} /> : <CloudUpload size={16} />}
            {saving ? "上传中" : product.syncState === "synced" ? "更新 Shopify 草稿" : "上传到 Shopify 草稿"}
          </button>
        </section>

        <section className="image-workbench">
          <div className="primary-image">
            {currentImage ? <img src={currentImage} alt={activeProductImage?.altText || product.title} /> : <div className="image-placeholder"><ImageIcon size={30} /><span>暂无图片</span></div>}
            <div className="primary-image-toolbar">
              <button className="image-overlay-button" type="button" onClick={() => setGalleryOpen(true)} aria-label="查看全部图片" title="查看全部图片"><Grid2X2 size={16} /><span>{product.images.length}</span></button>
              {product.sourcePlatform !== "1688" && activeProductImage && <button className="image-overlay-button accent" type="button" onClick={() => onImageSearch(activeProductImage)} aria-label="用当前图片搜索 1688" title="以图搜 1688"><ScanSearch size={16} /><span>以图搜</span></button>}
            </div>
            <div className="primary-image-actions">
              <label className="image-overlay-button upload-button">{uploading ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}<span>{uploading ? "上传中" : "上传图片"}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={upload} disabled={uploading} /></label>
              {product.sourcePlatform !== "1688" && <button className="image-overlay-button solid" type="button" onClick={onOpenOffer}><Link2 size={16} /><span>关联 1688</span></button>}
            </div>
          </div>
          {product.media.length > 0 && <div className="media-links">{product.media.map((media) => media.url ? <a className="button quiet compact" key={media.id} href={media.url} target="_blank" rel="noreferrer"><Video size={15} />{media.title || "商品视频"}</a> : null)}</div>}
        </section>

        <section className="detail-section">
          <div className="section-heading"><div><span>PRODUCT DATA</span><h3>商品信息</h3></div></div>
          <dl className="data-list">
            <div><dt>售价</dt><dd>{priceRange(product.priceMin, product.priceMax, product.currency)}</dd></div>
            <div><dt>SPU</dt><dd className="mono">{product.spu || "—"}</dd></div>
            <div><dt>商品库存</dt><dd>{product.inventoryQuantity ?? "—"}</dd></div>
            <div><dt>SKU 数</dt><dd>{product.variants.length}</dd></div>
            <div><dt>图片数</dt><dd>{product.images.length}</dd></div>
            <div><dt>视频数</dt><dd>{product.media.filter((media) => media.mediaType === "video").length}</dd></div>
            {product.sourcePlatform === "1688" ? <div><dt>1688 商品 ID</dt><dd className="mono">{product.offerId1688 || product.externalId}</dd></div> : <div><dt>1688 候选</dt><dd>{product.offers.filter((offer) => offer.matchStatus !== "rejected").length}</dd></div>}
            <div><dt>店铺</dt><dd>{product.shopDomain || product.sourceStore || "—"}</dd></div>
            <div><dt>Shopify 同步</dt><dd className={`sync-state ${product.syncState}`}>{shopifySyncLabel}</dd></div>
            <div><dt>来源发布时间</dt><dd>{product.publishedAt || "—"}</dd></div>
            <div><dt>更新时间</dt><dd>{new Date(product.updatedAt).toLocaleString("zh-CN")}</dd></div>
          </dl>
          {(product.tags.length > 0 || productCategories.length > 0) && <div className="tag-list">{[...productCategories, ...product.tags].map((tag) => <span key={tag}>{tag}</span>)}</div>}
        </section>

        {product.sourcePlatform === "1688" && <section className="detail-section">
          <div className="section-heading"><div><span>1688 CATALOG</span><h3>1688 商品主档</h3></div></div>
          <dl className="data-list">
            <div><dt>供应商</dt><dd>{product.supplierName1688 || product.vendor || "—"}</dd></div>
            <div><dt>供应商 ID</dt><dd className="mono">{product.supplierId1688 || "—"}</dd></div>
            <div><dt>起订量</dt><dd>{product.minOrderQuantity1688 == null ? "—" : `${product.minOrderQuantity1688}${product.unit1688 || "件"}`}</dd></div>
            <div><dt>库存</dt><dd>{product.stockQuantity1688 ?? product.inventoryQuantity ?? "—"}</dd></div>
            <div><dt>销量</dt><dd>{product.soldQuantity1688 ?? "—"}</dd></div>
            <div><dt>品牌</dt><dd>{product.brand1688 || "—"}</dd></div>
            <div><dt>类目 ID</dt><dd className="mono">{product.categoryId1688 || "—"}</dd></div>
            <div><dt>所在地</dt><dd>{product.location1688 || [product.province1688, product.city1688].filter(Boolean).join(" ") || "—"}</dd></div>
            <div><dt>重量</dt><dd>{product.itemWeight1688 || "—"}</dd></div>
            <div><dt>尺寸</dt><dd>{product.itemSize1688 || "—"}</dd></div>
            <div><dt>采集时间</dt><dd>{product.fetchedAt1688 ? new Date(product.fetchedAt1688).toLocaleString("zh-CN") : "—"}</dd></div>
          </dl>
          {product.shortDescription1688 && <p>{product.shortDescription1688}</p>}
        </section>}

        {(product.descriptionHtml || descriptionImages.length > 0) && <section className="detail-section">
          <div className="section-heading"><div><span>DESCRIPTION</span><h3>商品详情</h3></div></div>
          <HtmlContent className="product-description-html" html={product.descriptionHtml} images={descriptionImages} />
        </section>}

        {(propertyRows.length > 0 || specificationRows.length > 0 || customFieldRows.length > 0) && <section className="detail-section">
          <div className="section-heading"><div><span>ATTRIBUTES</span><h3>商品属性与尺码</h3></div><span className="section-count">{propertyRows.length + specificationRows.length + customFieldRows.length}</span></div>
          {propertyRows.length > 0 && <dl className="attribute-list">{propertyRows.map((row, index) => <div key={`${row.label}-${index}`}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>}
          {specificationRows.length > 0 && <dl className="attribute-list">{specificationRows.map((row, index) => <div key={`${row.label}-${index}`}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>}
          {customFieldRows.length > 0 && <div className="measurement-list">{customFieldRows.map((row, index) => <div key={`${row.label}-${index}`}><strong>{row.label}</strong><span>{row.value}</span></div>)}</div>}
        </section>
        }

        <section className="detail-section">
          <div className="section-heading"><div><span>VARIANTS</span><h3>SKU 与规格</h3></div><span className="section-count">{product.variants.length}</span></div>
          {product.variants.length ? <div className="compact-table-wrap"><table className="compact-table variant-table"><thead><tr><th>SKU</th><th>规格</th><th>售价</th><th>库存</th><th>克重</th></tr></thead><tbody>{product.variants.map((variant) => <tr key={variant.id}><td className="mono">{variant.sku || "—"}</td><td>{variant.title || [variant.option1, variant.option2, variant.option3].filter(Boolean).join(" / ") || "默认"}</td><td>{formatMoney(variant.price, product.currency)}</td><td>{variant.inventoryQuantity ?? "—"}</td><td>{variant.grams ?? variant.weight ?? "—"}{variant.grams != null || variant.weight != null ? "g" : ""}</td></tr>)}</tbody></table></div> : <div className="compact-empty"><Boxes size={18} />暂无 SKU</div>}
        </section>

        {product.sourcePlatform !== "1688" && <section className="detail-section">
          <div className="section-heading"><div><span>SOURCING</span><h3>1688 候选货源</h3></div><button className="icon-button" type="button" onClick={onOpenOffer} aria-label="添加候选货源" title="添加候选货源"><Link2 size={18} /></button></div>
          {product.offers.length ? <div className="offer-list">{product.offers.map((offer) => <article className="offer-item" key={offer.linkId}><div className="offer-thumb">{offer.thumbnailUrl ? <img src={proxiedImageUrl(offer.thumbnailUrl)} alt="" /> : <PackageOpen size={20} />}</div><div className="offer-content"><div className="offer-topline"><span className={`match-badge ${offer.matchStatus}`}>{offer.matchStatus === "selected" ? "已选定" : offer.matchStatus === "rejected" ? "已排除" : "候选"}</span><span className="mono">{offer.offerId}</span></div><h4>{offer.title}</h4><p>{offer.supplierName || "供应商待补充"}</p><div className="offer-price">{priceRange(offer.priceMin, offer.priceMax, offer.currency)}{offer.minOrderQuantity ? <small>{offer.minOrderQuantity}{offer.unit || "件"}起批</small> : null}</div><div className="offer-footer">{offer.url ? <a href={offer.url} target="_blank" rel="noreferrer">查看 1688 <ArrowUpRight size={13} /></a> : <span /> }<button className="icon-button danger" type="button" onClick={async () => { setRemovingLink(offer.linkId); try { await onRemoveOffer(offer.linkId); } finally { setRemovingLink(null); } }} disabled={removingLink === offer.linkId} aria-label="移除关联" title="移除关联">{removingLink === offer.linkId ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}</button></div></div></article>)}</div> : <div className="compact-empty"><PackageOpen size={18} />尚未关联 1688 商品</div>}
        </section>}

        <section className="detail-section notes-section">
          <div className="section-heading"><div><span>NOTES</span><h3>内部备注</h3></div></div>
          <textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="记录选品判断、供应商沟通或需要复核的事项" />
          <div className="notes-actions"><button className="button quiet" type="button" onClick={() => onPatch({ notes })} disabled={saving}><Save size={16} />保存备注</button></div>
        </section>

        <section className="detail-danger-zone">
          <button className="button quiet" type="button" onClick={onArchive}><Archive size={16} />归档商品</button>
          <button className="button danger-text" type="button" onClick={onDelete}><Trash2 size={16} />删除商品</button>
        </section>
      </div>
      </aside>
    </>
  );
}
