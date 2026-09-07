import { Check, Image as ImageIcon, LoaderCircle, RefreshCw, Save, Sparkles, X } from "lucide-react";

import { proxiedImageUrl } from "../media";
import type { ShopifyRemoteProduct } from "../types";

export const DEFAULT_TITLE_PROMPT = "Generate one concise, natural Shopify product title for overseas ecommerce. Use only the current Shopify product information and selected product images. Preserve supported product type, material, style, color, key features, and audience. Do not invent specifications, certifications, discounts, supplier claims, or promises. Do not mention 1688, suppliers, RMB, internal IDs, raw URLs, or keyword stuffing. Keep the title clear and readable, under 120 characters. Return strict JSON only: {\"title\":\"\"}.";

type ShopifyTitleModalProps = {
  open: boolean;
  generating: boolean;
  saving: boolean;
  modalRef: { current: HTMLElement | null };
  product: ShopifyRemoteProduct | null;
  prompt: string;
  defaultPrompt: string;
  title: string;
  selectedImageIds: string[];
  credits: { balance: number; charged: number } | null;
  promptVersion: string | null;
  onClose: () => void;
  onPromptChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onSelectImage: (imageId: string) => void;
  onResetPrompt: () => void;
  onGenerate: () => void;
  onSave: () => void;
};

function previewJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? [], null, 2) || "[]";
  } catch {
    return "[]";
  }
}

export function ShopifyTitleModal({
  open,
  generating,
  saving,
  modalRef,
  product,
  prompt,
  defaultPrompt,
  title,
  selectedImageIds,
  credits,
  promptVersion,
  onClose,
  onPromptChange,
  onTitleChange,
  onSelectImage,
  onResetPrompt,
  onGenerate,
  onSave,
}: ShopifyTitleModalProps) {
  if (!open || !product) return null;
  const images = product.images ?? [];
  const selectedCount = selectedImageIds.length;
  const dirty = title.trim() !== product.title.trim();
  const statusText = generating
    ? "AI 正在生成标题"
    : saving
      ? "正在保存到 Shopify"
      : credits
        ? `已生成，消耗 ${credits.charged} 积分，余额 ${credits.balance}`
        : dirty
          ? "标题有未保存修改"
          : `已选 ${selectedCount} 张当前商品图片`;

  return (
    <div className="modal-backdrop shopify-title-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && !generating && onClose()}>
      <section ref={modalRef} className="modal shopify-title-modal" role="dialog" aria-modal="true" aria-labelledby="shopify-title-modal-title" aria-describedby="shopify-title-modal-description" tabIndex={-1}>
        <header className="modal-header">
          <div><span>AI PRODUCT TITLE</span><h2 id="shopify-title-modal-title">生成 Shopify 商品标题</h2></div>
          <button className="icon-button" type="button" onClick={onClose} disabled={saving || generating} aria-label="关闭" title="关闭"><X size={19} /></button>
        </header>
        <div className="shopify-title-modal-body" aria-busy={generating || saving}>
          <p id="shopify-title-modal-description" className="shopify-title-modal-intro">使用当前 Shopify 商品信息和当前商品图片生成标题。1688 来源不会参与本次生成。</p>

          <section className="translation-modal-section">
            <div className="translation-modal-section-heading"><div><span>SHOPIFY PRODUCT</span><h3>{product.title}</h3></div><span className="shopify-description-modal-meta">{product.status}</span></div>
            <div className="shopify-title-product-facts">
              <div><span>Handle</span><strong>{product.handle || "未设置"}</strong></div>
              <div><span>供应商</span><strong>{product.vendor || "未设置"}</strong></div>
              <div><span>商品类型</span><strong>{product.productType || "未设置"}</strong></div>
              <div><span>标签</span><strong>{product.tags.length ? product.tags.join(", ") : "未设置"}</strong></div>
            </div>
            <details className="shopify-title-product-details">
              <summary>查看描述、选项和变体</summary>
              <div className="shopify-title-detail-grid">
                <div><span>描述 HTML</span><pre>{product.descriptionHtml || ""}</pre></div>
                <div><span>选项 JSON</span><pre>{previewJson(product.options)}</pre></div>
                <div><span>变体 JSON</span><pre>{previewJson(product.variants)}</pre></div>
              </div>
            </details>
          </section>

          <section className="translation-modal-section">
            <div className="translation-modal-section-heading"><div><span>PRODUCT IMAGES</span><h3>选择当前商品图片</h3></div><span className="shopify-description-modal-meta">最多 4 张</span></div>
            <div className="ai-image-modal-grid shopify-title-image-grid">
              {images.map((image, index) => {
                const selected = selectedImageIds.includes(image.id);
                const disabled = !selected && selectedCount >= 4;
                return <button key={image.id} className={`ai-image-modal-image ${selected ? "selected" : ""}`} type="button" onClick={() => !disabled && onSelectImage(image.id)} disabled={disabled} title={`当前商品图片 ${index + 1}`}>
                  <img src={proxiedImageUrl(image.url)} alt={image.altText || product.title} loading="lazy" />
                  <span>{selected ? <Check size={15} /> : image.position + 1}</span>
                </button>;
              })}
            </div>
            <div className="ai-image-modal-preview"><ImageIcon size={16} /><span>{selectedCount ? `已选择 ${selectedCount} 张图片，最多 4 张` : "至少选择 1 张当前商品图片"}</span></div>
          </section>

          <section className="translation-modal-section">
            <div className="translation-modal-section-heading"><div><span>CUSTOM INSTRUCTIONS</span><h3>提示词</h3></div><button className="button quiet compact" type="button" onClick={onResetPrompt} disabled={prompt === defaultPrompt}><RefreshCw size={13} />恢复默认</button></div>
            <label className="shopify-title-prompt-field"><span>本次标题要求</span><textarea rows={5} maxLength={8_000} value={prompt} onChange={(event) => onPromptChange(event.target.value)} placeholder={defaultPrompt || DEFAULT_TITLE_PROMPT} /><small>可以补充目标市场、品牌词、语气和必须避免的词；当前商品事实与系统规则优先。</small></label>
          </section>

          <section className="translation-modal-section">
            <div className="translation-modal-section-heading"><div><span>TITLE RESULT</span><h3>生成结果</h3></div><span className="shopify-description-modal-meta">{promptVersion ? `Prompt ${promptVersion}` : "等待生成"}</span></div>
            <label className="shopify-title-result-field"><span>商品标题</span><input value={title} maxLength={255} onChange={(event) => onTitleChange(event.target.value)} placeholder="生成后会出现在这里，也可以手动修改。" /></label>
          </section>
        </div>
        <footer className="modal-actions shopify-title-modal-actions"><span className="shopify-description-modal-status" aria-live="polite">{statusText}</span><button className="button quiet" type="button" onClick={onClose} disabled={saving || generating}>关闭</button><button className="button quiet" type="button" onClick={onGenerate} disabled={generating || saving || selectedCount < 1}>{generating ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}{generating ? "生成中" : "生成标题"}</button><button className="button primary" type="button" onClick={onSave} disabled={saving || generating || !dirty || !title.trim()}>{saving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}{saving ? "保存中" : "保存到 Shopify"}</button></footer>
      </section>
    </div>
  );
}
