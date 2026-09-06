import { Check, CircleAlert, Image as ImageIcon, LoaderCircle, RefreshCw, Save, Sparkles, X } from "lucide-react";
import DOMPurify from "dompurify";
import { useMemo } from "react";

import { proxiedImageUrl } from "../media";
import type { ShopifyDescriptionSource, ShopifyRemoteProduct } from "../types";

export const DEFAULT_DESCRIPTION_PROMPT = "请根据 1688 商品 JSON、属性、详情图和主图，生成适合海外电商 Shopify 的商品描述 HTML。内容要自然、可信、面向海外买家，重点写清核心卖点、材质、规格、适用场景和包装信息；不要编造不存在的参数，不要出现 1688、批发价、供应商内部信息或人民币价格。只输出可直接粘贴的完整 HTML，优先使用 h2/h3/p/ul/li/strong/br。";

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

export function ShopifyDescriptionModal({
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
  const activeImage = imageButtons.find((image) => selectedImageIds.includes(image.id)) ?? imageButtons[0] ?? null;
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
          <p id="shopify-description-modal-description" className="shopify-description-modal-intro">把 1688 JSON 和图片一起交给 AI，生成适合海外电商的 Shopify 商品描述 HTML。你可以先改提示词，再选图生成，最后手动微调 HTML 后保存。</p>

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

                {activeImage ? (
                  <div className="shopify-description-image-preview">
                    <img src={proxiedImageUrl(activeImage.url)} alt={activeImage.altText || source.title} loading="lazy" />
                    <div className="shopify-description-image-preview-meta">
                      <strong>{activeImage.altText || sourceImageLabel(activeImage.group)}</strong>
                      <small>{sourceImageLabel(activeImage.group)} · 已选 {selectedImageIds.includes(activeImage.id) ? "中" : "未选"}</small>
                    </div>
                  </div>
                ) : null}

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
                        <img src={proxiedImageUrl(image.url)} alt={image.altText || source.title} loading="lazy" />
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
              <small>可以补充目标市场、语气、品牌词和必须避免的内容。</small>
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
