import { LoaderCircle, Plus, X } from "lucide-react";
import { FormEvent, useState } from "react";

import type { ProductInput } from "../types";

type Props = {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (input: ProductInput) => Promise<void>;
};

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ProductModal({ open, saving, onClose, onSave }: Props) {
  const [title, setTitle] = useState("");
  const [sourcePlatform, setSourcePlatform] = useState<ProductInput["sourcePlatform"]>("1688");
  const [sourceStore, setSourceStore] = useState("");
  const [externalId, setExternalId] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [shopDomain, setShopDomain] = useState("");
  const [vendor, setVendor] = useState("");
  const [productType, setProductType] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [tags, setTags] = useState("");
  const [imageUrls, setImageUrls] = useState("");
  const [variantRows, setVariantRows] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const images = imageUrls
        .split(/\r?\n/u)
        .map((url) => url.trim())
        .filter(Boolean)
        .map((url, position) => ({ url, position }));
      const variants = variantRows
        .split(/\r?\n/u)
        .map((row) => row.trim())
        .filter(Boolean)
        .map((row, index) => {
          const [sku = "", variantTitle = "", price = "", inventory = ""] = row.split("|").map((cell) => cell.trim());
          return {
            externalId: sku || `manual-${index + 1}`,
            sku: sku || undefined,
            title: variantTitle || undefined,
            price: optionalNumber(price),
            inventoryQuantity: optionalNumber(inventory),
          };
        });
      await onSave({
        sourcePlatform,
        sourceStore,
        externalId: externalId || undefined,
        sourceUrl: sourceUrl || undefined,
        shopDomain: shopDomain || undefined,
        title,
        vendor: vendor || undefined,
        productType: productType || undefined,
        currency: currency.toUpperCase(),
        status: images.length ? "image_searching" : "new",
        priceMin: optionalNumber(priceMin),
        priceMax: optionalNumber(priceMax),
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        notes: notes || undefined,
        images,
        variants,
      });
      setTitle("");
      setExternalId("");
      setSourceUrl("");
      setImageUrls("");
      setVariantRows("");
      setNotes("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
        <header className="modal-header">
          <div><span>商品档案</span><h2 id="product-modal-title">新增商品</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭" title="关闭"><X size={19} /></button>
        </header>
        <form onSubmit={submit}>
          <div className="form-grid two-columns">
            <label className="field-label field-span-2"><span>商品标题</span><input value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus /></label>
            <label className="field-label"><span>来源</span><select value={sourcePlatform} onChange={(event) => setSourcePlatform(event.target.value as ProductInput["sourcePlatform"])}><option value="1688">1688</option><option value="shopify">Shopify</option><option value="manual">手动录入</option><option value="other">其他</option></select></label>
            <label className="field-label"><span>店铺 / 来源标识</span><input value={sourceStore} onChange={(event) => setSourceStore(event.target.value)} placeholder="example.myshopify.com" /></label>
            <label className="field-label"><span>外部商品 ID</span><input value={externalId} onChange={(event) => setExternalId(event.target.value)} /></label>
            <label className="field-label"><span>Shopify 域名</span><input value={shopDomain} onChange={(event) => setShopDomain(event.target.value)} placeholder="example.myshopify.com" /></label>
            <label className="field-label field-span-2"><span>来源页面</span><input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></label>
            <label className="field-label"><span>供应商 / 品牌</span><input value={vendor} onChange={(event) => setVendor(event.target.value)} /></label>
            <label className="field-label"><span>商品类型</span><input value={productType} onChange={(event) => setProductType(event.target.value)} /></label>
            <label className="field-label"><span>最低售价</span><input inputMode="decimal" value={priceMin} onChange={(event) => setPriceMin(event.target.value)} /></label>
            <label className="field-label"><span>最高售价</span><input inputMode="decimal" value={priceMax} onChange={(event) => setPriceMax(event.target.value)} /></label>
            <label className="field-label"><span>币种</span><input value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value)} /></label>
            <label className="field-label"><span>标签</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="dress, summer" /></label>
            <label className="field-label field-span-2"><span>图片 URL（每行一个）</span><textarea rows={4} value={imageUrls} onChange={(event) => setImageUrls(event.target.value)} /></label>
            <label className="field-label field-span-2"><span>SKU（每行：SKU | 规格名 | 售价 | 库存）</span><textarea rows={4} value={variantRows} onChange={(event) => setVariantRows(event.target.value)} /></label>
            <label className="field-label field-span-2"><span>内部备注</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <footer className="modal-actions"><button className="button quiet" type="button" onClick={onClose}>取消</button><button className="button primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}{saving ? "保存中" : "创建商品"}</button></footer>
        </form>
      </section>
    </div>
  );
}
