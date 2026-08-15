import { Link2, LoaderCircle, X } from "lucide-react";
import { FormEvent, useState } from "react";

type Props = {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (input: Record<string, unknown>) => Promise<void>;
};

function money(value: string): number | null {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
}

export function OfferModal({ open, saving, onClose, onSave }: Props) {
  const [offerId, setOfferId] = useState("");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [minOrderQuantity, setMinOrderQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [imageUrls, setImageUrls] = useState("");
  const [matchStatus, setMatchStatus] = useState("candidate");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await onSave({
        offer: {
          offerId,
          url: url || null,
          title,
          supplierName: supplierName || null,
          priceMin: money(priceMin),
          priceMax: money(priceMax),
          currency: "CNY",
          minOrderQuantity: money(minOrderQuantity),
          unit: unit || null,
          images: imageUrls.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean).map((value, position) => ({ url: value, position })),
          variants: [],
        },
        matchStatus,
        notes: notes || null,
        variantMap: {},
      });
      setOfferId("");
      setUrl("");
      setTitle("");
      setSupplierName("");
      setImageUrls("");
      setNotes("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "关联失败");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal offer-modal" role="dialog" aria-modal="true" aria-labelledby="offer-modal-title">
        <header className="modal-header"><div><span>1688 货源</span><h2 id="offer-modal-title">关联候选商品</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="关闭" title="关闭"><X size={19} /></button></header>
        <form onSubmit={submit}>
          <div className="form-grid two-columns">
            <label className="field-label"><span>Offer ID</span><input value={offerId} onChange={(event) => setOfferId(event.target.value)} required autoFocus /></label>
            <label className="field-label"><span>匹配状态</span><select value={matchStatus} onChange={(event) => setMatchStatus(event.target.value)}><option value="candidate">候选</option><option value="selected">已选定</option><option value="rejected">已排除</option></select></label>
            <label className="field-label field-span-2"><span>1688 商品标题</span><input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
            <label className="field-label field-span-2"><span>商品链接</span><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} /></label>
            <label className="field-label field-span-2"><span>供应商</span><input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} /></label>
            <label className="field-label"><span>最低批发价</span><input inputMode="decimal" value={priceMin} onChange={(event) => setPriceMin(event.target.value)} /></label>
            <label className="field-label"><span>最高批发价</span><input inputMode="decimal" value={priceMax} onChange={(event) => setPriceMax(event.target.value)} /></label>
            <label className="field-label"><span>起批量</span><input inputMode="decimal" value={minOrderQuantity} onChange={(event) => setMinOrderQuantity(event.target.value)} /></label>
            <label className="field-label"><span>单位</span><input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="件" /></label>
            <label className="field-label field-span-2"><span>图片 URL（每行一个）</span><textarea rows={3} value={imageUrls} onChange={(event) => setImageUrls(event.target.value)} /></label>
            <label className="field-label field-span-2"><span>匹配备注</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <footer className="modal-actions"><button className="button quiet" type="button" onClick={onClose}>取消</button><button className="button primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Link2 size={17} />}{saving ? "关联中" : "关联商品"}</button></footer>
        </form>
      </section>
    </div>
  );
}
