import {
  ArrowLeft,
  Check,
  CircleX,
  Clock3,
  Image as ImageIcon,
  Languages,
  ListChecks,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { api, ApiClientError } from "../api";
import type {
  ShopifyProductTranslations,
  ShopifyRemoteProduct,
  ShopifyStore,
  ShopifyTranslationDraft,
} from "../types";
import { draftFrom, draftPayload, statusLabels, type ShopifyProductDraft } from "./shopifyProductUtils";

type Props = {
  stores: ShopifyStore[];
  storeId: string;
  productId: string;
  returnPath: string;
  onBack: (returnPath: string) => void;
  onError: (error: unknown) => void;
  onNotify: (message: string) => void;
};

type ImageJobStatus = "queued" | "waiting" | "failed";
type ImageJob = { status: ImageJobStatus; updatedAt: number; message?: string };

export function ShopifyProductEditorPage({ stores, storeId, productId, returnPath, onBack, onError, onNotify }: Props) {
  const store = stores.find((item) => item.id === storeId);
  const [product, setProduct] = useState<ShopifyRemoteProduct | null>(null);
  const [draft, setDraft] = useState<ShopifyProductDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [translation, setTranslation] = useState<ShopifyProductTranslations | null>(null);
  const [locale, setLocale] = useState("");
  const [marketId, setMarketId] = useState("");
  const [translationStyle, setTranslationStyle] = useState("自然、清晰、符合目标市场电商习惯");
  const [translationGlossary, setTranslationGlossary] = useState("");
  const [translationDrafts, setTranslationDrafts] = useState<ShopifyTranslationDraft[]>([]);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationConflict, setTranslationConflict] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [focusedImageId, setFocusedImageId] = useState<string | null>(null);
  const [imageLocale, setImageLocale] = useState("");
  const [imageJobs, setImageJobs] = useState<Record<string, ImageJob>>({});

  const loadProduct = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ product: ShopifyRemoteProduct }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}`);
      setProduct(result.product);
      setDraft(draftFrom(result.product));
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }, [onError, productId, storeId]);

  useEffect(() => { void loadProduct(); }, [loadProduct]);

  const loadTranslations = useCallback(async (nextLocale?: string, nextMarketId?: string) => {
    if (!storeId || !productId) return;
    setTranslationLoading(true);
    try {
      const params = new URLSearchParams();
      if (nextLocale) params.set("locale", nextLocale);
      if (nextMarketId) params.set("marketId", nextMarketId);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const result = await api<ShopifyProductTranslations & { locale: string }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/translations${suffix}`);
      setTranslation(result);
      setLocale(result.locale);
      setMarketId(result.marketId ?? "");
      const existing = new Map(result.translations.map((item) => [`${item.resourceId}\u0000${item.key}`, item] as const));
      setTranslationDrafts(result.translatableContent.map((item) => {
        const current = existing.get(`${item.resourceId}\u0000${item.key}`);
        return { resourceId: item.resourceId, resourceType: item.resourceType, resourceLabel: item.resourceLabel, key: item.key, sourceValue: item.value, originalValue: current?.value ?? "", value: current?.value ?? "", digest: item.digest, changed: false, outdated: current?.outdated, marketId: nextMarketId || null };
      }));
      setTranslationConflict(false);
    } catch (error) {
      onError(error);
    } finally {
      setTranslationLoading(false);
    }
  }, [onError, productId, storeId]);

  useEffect(() => { void loadTranslations(); }, [loadTranslations]);

  useEffect(() => {
    if (!imageLocale && translation?.locales.length) {
      setImageLocale(translation.locales.find((item) => !item.primary)?.locale ?? translation.locales[0].locale);
    }
  }, [imageLocale, translation]);

  const updateDraft = <K extends keyof ShopifyProductDraft>(key: K, value: ShopifyProductDraft[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };

  async function saveProduct() {
    if (!draft || !product) return;
    setSaving(true);
    try {
      const result = await api<{ product: ShopifyRemoteProduct }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ storeId, productId: product.id, ...draftPayload(draft) }),
      });
      setProduct(result.product);
      setDraft(draftFrom(result.product));
      onNotify("商品已保存到 Shopify");
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct() {
    if (!product || !window.confirm(`确定删除“${product.title}”吗？此操作会直接删除 Shopify 商品。`)) return;
    setDeleting(true);
    try {
      await api(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(product.id)}`, { method: "DELETE" });
      onNotify("商品已删除");
      onBack(returnPath);
    } catch (error) {
      onError(error);
    } finally {
      setDeleting(false);
    }
  }

  async function translateAll() {
    if (!locale || !translationDrafts.length) return;
    setAiLoading(true);
    try {
      const generated: ShopifyTranslationDraft[] = [];
      for (let index = 0; index < translationDrafts.length; index += 32) {
        const batch = translationDrafts.slice(index, index + 32);
        const result = await api<{ translations: ShopifyTranslationDraft[] }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/translations/ai`, {
          method: "POST",
          body: JSON.stringify({ storeId, productId, locale, marketId: marketId || undefined, style: translationStyle, glossary: translationGlossary, fields: batch.map((field) => ({ resourceId: field.resourceId, resourceType: field.resourceType, resourceLabel: field.resourceLabel, key: field.key, sourceValue: field.sourceValue, existingValue: field.value || undefined, digest: field.digest })) }),
        });
        generated.push(...result.translations);
      }
      const generatedByKey = new Map(generated.map((field) => [`${field.resourceId}\u0000${field.key}`, field] as const));
      setTranslationDrafts(translationDrafts.map((field) => {
        const generatedField = generatedByKey.get(`${field.resourceId}\u0000${field.key}`);
        return generatedField ? { ...generatedField, originalValue: field.originalValue, changed: generatedField.value !== field.originalValue, marketId: marketId || null } : field;
      }));
      onNotify("AI 已生成翻译草稿，请检查后发布");
    } catch (error) {
      onError(error);
    } finally {
      setAiLoading(false);
    }
  }

  async function publishTranslations() {
    const changed = translationDrafts.filter((field) => field.changed);
    if (!locale || !changed.length) return;
    setPublishLoading(true);
    try {
      for (let index = 0; index < changed.length; index += 250) {
        const batch = changed.slice(index, index + 250);
        await api(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/translations`, {
          method: "PUT",
          body: JSON.stringify({ storeId, productId, locale, translations: batch.map((field) => ({ resourceId: field.resourceId, key: field.key, value: field.value, translatableContentDigest: field.digest, marketId: marketId || undefined })) }),
        });
      }
      onNotify("翻译已发布到 Shopify");
      await loadTranslations(locale, marketId);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) {
        setTranslationConflict(true);
        return;
      }
      onError(error);
    } finally {
      setPublishLoading(false);
    }
  }

  async function reloadTranslationSourceKeepingDraft() {
    const savedDrafts = translationDrafts;
    await loadTranslations(locale, marketId);
    setTranslationDrafts((fresh) => fresh.map((field) => {
      const saved = savedDrafts.find((item) => item.resourceId === field.resourceId && item.key === field.key);
      if (!saved) return field;
      return { ...field, value: saved.value, changed: saved.value !== field.originalValue, marketId: marketId || null };
    }));
    setTranslationConflict(false);
  }

  function queueImageTranslation() {
    if (!imageLocale || !selectedImages.length) return;
    const now = Date.now();
    setImageJobs((current) => ({
      ...current,
      ...Object.fromEntries(selectedImages.map((id) => [id, { status: "queued" as const, updatedAt: now }])),
    }));
    onNotify(`${selectedImages.length} 张图片已保存到本地待处理列表`);
  }

  function cancelImageTranslation() {
    setImageJobs((current) => {
      const next = { ...current };
      for (const id of selectedImages) delete next[id];
      return next;
    });
  }

  function retryImageTranslation(id: string) {
    setImageJobs((current) => ({ ...current, [id]: { status: "queued", updatedAt: Date.now() } }));
  }

  const media = product?.images ?? [];
  const selectedCount = selectedImages.length;
  const focusedImage = media.find((image) => image.id === focusedImageId) ?? media[0] ?? null;
  const queuedImageCount = Object.values(imageJobs).filter((job) => job.status === "queued").length;
  const currentStatus = draft ? statusLabels[draft.status] : "";
  const targetLocaleName = translation?.locales.find((item) => item.locale === locale)?.name ?? locale;
  const targetMarketName = marketId ? translation?.markets.find((item) => item.id === marketId)?.name ?? marketId : "默认市场";
  const hasTranslationChanges = translationDrafts.some((field) => field.changed);

  return (
    <section className="shopify-editor-page">
      <header className="shopify-editor-page-header">
        <button className="button quiet" type="button" onClick={() => onBack(returnPath)}><ArrowLeft size={16} />返回商品列表</button>
        <div className="shopify-editor-title"><span>SHOPIFY PRODUCT</span><h1>{loading ? "加载商品" : draft?.title || product?.title || "商品详情"}</h1><small>{store?.shopDomain || store?.displayName || storeId}</small></div>
        <div className="shopify-editor-header-actions"><span className={`shopify-status ${(draft?.status || "draft").toLowerCase()}`}><i />{currentStatus}</span><button className="button primary" type="button" onClick={() => void saveProduct()} disabled={saving || loading || !draft}><Save size={15} />{saving ? "保存中" : "保存"}</button></div>
      </header>

      {loading || !draft || !product ? <div className="page-loading shopify-editor-loading"><LoaderCircle className="spin" size={22} />正在读取商品详情</div> : <div className="shopify-editor-page-grid">
        <main className="shopify-editor-main">
          <section className="shopify-editor-card"><div className="editor-section-heading"><div><span>GENERAL</span><h2>基本信息</h2></div></div><label><span>标题</span><input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} /></label><label><span>描述 HTML</span><textarea rows={9} value={draft.descriptionHtml} onChange={(event) => updateDraft("descriptionHtml", event.target.value)} /></label><div className="editor-two-columns"><label><span>Handle</span><input value={draft.handle} onChange={(event) => updateDraft("handle", event.target.value)} /></label><label><span>供应商</span><input value={draft.vendor} onChange={(event) => updateDraft("vendor", event.target.value)} /></label><label><span>商品类型</span><input value={draft.productType} onChange={(event) => updateDraft("productType", event.target.value)} /></label><label><span>模板后缀</span><input value={draft.templateSuffix} onChange={(event) => updateDraft("templateSuffix", event.target.value)} placeholder="默认模板" /></label></div><label><span>标签</span><input value={draft.tags} onChange={(event) => updateDraft("tags", event.target.value)} placeholder="用逗号分隔" /></label></section>

          <section className="shopify-editor-card"><div className="editor-section-heading"><div><span>VARIANTS</span><h2>变体与库存</h2></div><small>{draft.variants.length} 个变体</small></div><div className="shopify-variant-editor"><div className="shopify-variant-row header"><span>变体</span><span>价格</span><span>对比价</span><span>SKU</span><span>条码</span><span>库存</span></div>{draft.variants.map((variant, index) => <div className="shopify-variant-row" key={variant.id}><strong>{variant.title}</strong><input value={variant.price} onChange={(event) => setDraft({ ...draft, variants: draft.variants.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value } : item) })} /><input value={variant.compareAtPrice} onChange={(event) => setDraft({ ...draft, variants: draft.variants.map((item, itemIndex) => itemIndex === index ? { ...item, compareAtPrice: event.target.value } : item) })} /><input value={variant.sku} onChange={(event) => setDraft({ ...draft, variants: draft.variants.map((item, itemIndex) => itemIndex === index ? { ...item, sku: event.target.value } : item) })} /><input value={variant.barcode} onChange={(event) => setDraft({ ...draft, variants: draft.variants.map((item, itemIndex) => itemIndex === index ? { ...item, barcode: event.target.value } : item) })} /><span>{variant.inventoryQuantity ?? 0}</span></div>)}</div></section>

          <section className="shopify-editor-card"><div className="editor-section-heading"><div><span>SEO</span><h2>搜索引擎预览</h2></div></div><label><span>SEO 标题</span><input value={draft.seoTitle} onChange={(event) => updateDraft("seoTitle", event.target.value)} placeholder="不填写则使用商品标题" /></label><label><span>SEO 描述</span><textarea rows={4} value={draft.seoDescription} onChange={(event) => updateDraft("seoDescription", event.target.value)} /></label><div className="seo-preview"><strong>{draft.seoTitle || draft.title}</strong><span>{store?.shopDomain}/{draft.handle}</span><p>{draft.seoDescription || "Shopify 会使用商品描述生成搜索摘要。"}</p></div></section>

          <section className="shopify-editor-card">
            <div className="editor-section-heading"><div><span>MEDIA</span><h2>媒体与图片翻译</h2></div><div className="media-selection-actions"><small>{media.length} 张图片</small><button className="icon-button" type="button" onClick={() => setSelectedImages(media.map((image) => image.id))} disabled={!media.length || selectedCount === media.length} aria-label="全选图片" title="全选图片"><ListChecks size={15} /></button><button className="icon-button" type="button" onClick={() => setSelectedImages([])} disabled={!selectedCount} aria-label="清空图片选择" title="清空图片选择"><X size={15} /></button></div></div>
            <div className="shopify-editor-media-grid">{media.map((image) => {
              const job = imageJobs[image.id];
              return <figure key={image.id} className={`${selectedImages.includes(image.id) ? "selected" : ""} ${focusedImage?.id === image.id ? "focused" : ""}`}>
                <button className="shopify-media-select" type="button" onClick={() => { setFocusedImageId(image.id); setSelectedImages((current) => current.includes(image.id) ? current.filter((item) => item !== image.id) : [...current, image.id]); }} aria-label={`选择图片 ${image.position + 1}`}>
                  <img src={image.url} alt={image.altText || product.title} />
                  {job ? <span className={`image-job-badge ${job.status}`}><Clock3 size={13} /></span> : null}
                </button>
                <figcaption>{image.altText || "未填写替代文本"}</figcaption>
              </figure>;
            })}</div>
            <div className="image-translation-workbench">
              <div className="image-translation-controls">
                <label><span>目标语言</span><select value={imageLocale} onChange={(event) => setImageLocale(event.target.value)} disabled={!translation?.locales.length}>{translation?.locales.filter((item) => !item.primary).map((item) => <option key={item.locale} value={item.locale}>{item.name} ({item.locale})</option>)}</select></label>
                <div className="image-translation-summary"><ImageIcon size={16} /><strong>AI 图片翻译</strong><span>{selectedCount ? `已选择 ${selectedCount} 张图片` : "选择图片后加入待处理列表"}{queuedImageCount ? ` · ${queuedImageCount} 张待处理` : ""}</span></div>
              </div>
              <div className="image-translation-preview">
                <div className="image-translation-preview-pane">{focusedImage ? <img src={focusedImage.url} alt={focusedImage.altText || product.title} /> : <span>暂无图片</span>}<div><strong>原图</strong><small>{focusedImage?.altText || "等待选择图片"}</small></div></div>
                <div className="image-translation-preview-pane result"><span className="image-result-placeholder"><ImageIcon size={22} /></span><div><strong>翻译结果</strong><small>{focusedImage && imageJobs[focusedImage.id] ? "任务已在本地待处理；OCR 文字区域和生成结果将在接口接入后显示" : "加入待处理列表后在这里审核结果"}</small></div></div>
              </div>
              <ol className="image-translation-steps"><li className={queuedImageCount ? "active" : ""}>文字识别</li><li>翻译与排版</li><li>结果审核</li></ol>
              <div className="image-translation-progress"><span>批量进度</span><strong>0 / {queuedImageCount}</strong><progress value={0} max={Math.max(1, queuedImageCount)} /></div>
              <div className="image-translation-actions"><button className="button quiet compact" type="button" disabled={!selectedCount || !imageLocale} onClick={queueImageTranslation}><Sparkles size={14} />加入待处理列表</button><button className="button quiet compact" type="button" disabled={!selectedCount || !queuedImageCount} onClick={cancelImageTranslation}><CircleX size={14} />取消待处理</button>{focusedImage && imageJobs[focusedImage.id]?.status === "failed" ? <button className="button quiet compact" type="button" onClick={() => retryImageTranslation(focusedImage.id)}><RotateCcw size={14} />重试</button> : null}</div>
              <small>图片翻译接口尚未接入；当前只保存本地任务状态和原图预览，不伪造生成图片结果。</small>
            </div>
          </section>
        </main>

        <aside className="shopify-editor-side">
          <section className="shopify-editor-card translation-card">
            <div className="editor-section-heading"><div><span>LOCALIZATION</span><h2><Languages size={17} />多语言翻译</h2></div><button className="icon-button" type="button" onClick={() => void loadTranslations(locale, marketId)} aria-label="刷新翻译"><LoaderCircle className={translationLoading ? "spin" : ""} size={16} /></button></div>
            <div className="translation-toolbar">
              <select value={locale} onChange={(event) => { setLocale(event.target.value); setMarketId(""); void loadTranslations(event.target.value); }} disabled={translationLoading}>{translation?.locales.map((item) => <option key={item.locale} value={item.locale} disabled={item.primary}>{item.name} ({item.locale}){item.primary ? " · 主语言" : item.published ? "" : " · 未发布"}</option>)}</select>
              <select value={marketId} onChange={(event) => { setMarketId(event.target.value); void loadTranslations(locale, event.target.value); }} disabled={translationLoading || !translation?.markets.length}><option value="">默认市场</option>{translation?.markets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <div className="translation-toolbar-actions"><button className="button quiet compact" type="button" onClick={() => void translateAll()} disabled={aiLoading || translationLoading || !translationDrafts.length}><Sparkles size={14} />{aiLoading ? "翻译中" : "AI 翻译全部"}</button><button className="button primary compact" type="button" onClick={() => void publishTranslations()} disabled={publishLoading || !hasTranslationChanges}><Check size={14} />{publishLoading ? "发布中" : "发布翻译"}</button></div>
            </div>
            <details className="translation-options">
              <summary>AI 翻译偏好</summary>
              <label><span>文案风格</span><select value={translationStyle} onChange={(event) => setTranslationStyle(event.target.value)}><option value="自然、清晰、符合目标市场电商习惯">自然电商</option><option value="简洁、克制、偏高端品牌表达">简洁高端</option><option value="亲切、有活力、适合社交电商表达">亲切活力</option><option value="专业、准确、突出规格与使用信息">专业说明</option></select></label>
              <label><span>术语表</span><textarea rows={3} value={translationGlossary} onChange={(event) => setTranslationGlossary(event.target.value)} placeholder="例如：AirFlex 保持英文；连衣裙 = dress" /></label>
            </details>
            {translation?.missingScopes.includes("read_markets") ? <p className="translation-scope-note">当前应用缺少 read_markets 权限，默认市场翻译可正常使用；添加权限后可选择 Shopify Market。</p> : null}
            {translationConflict ? <div className="translation-conflict" role="alert"><strong>Shopify 内容已更新</strong><span>重新读取会保留你当前草稿，并刷新字段版本。</span><button className="button quiet compact" type="button" onClick={() => void reloadTranslationSourceKeepingDraft()} disabled={translationLoading}><RefreshCw size={14} />重新读取并保留草稿</button></div> : null}
            <p className="translation-target">目标语言：{targetLocaleName || "尚未读取"} · {targetMarketName}。AI 结果会先写入草稿，确认后再发布。</p>
            <div className="translation-fields">{translationDrafts.length ? translationDrafts.map((field) => <label key={`${field.resourceId}:${field.key}`} className={field.outdated ? "is-outdated" : ""}><span><b>{field.resourceLabel} · {field.key}</b>{field.outdated ? <em>已过期</em> : null}</span><small>{field.sourceValue}</small><textarea value={field.value} onChange={(event) => setTranslationDrafts((current) => current.map((item) => item.resourceId === field.resourceId && item.key === field.key ? { ...item, value: event.target.value, changed: event.target.value !== item.originalValue } : item))} placeholder="输入翻译，或使用 AI 翻译全部" rows={3} /></label>) : <div className="translation-empty">{translationLoading ? "正在读取可翻译字段" : "当前商品没有可翻译字段"}</div>}</div>
          </section>
          <section className="shopify-editor-card publishing-card"><div className="editor-section-heading"><div><span>PUBLISHING</span><h2>发布状态</h2></div></div><label><span>状态</span><select value={draft.status} onChange={(event) => updateDraft("status", event.target.value as ShopifyProductDraft["status"])}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="button danger-text" type="button" onClick={() => void deleteProduct()} disabled={deleting}><Trash2 size={15} />{deleting ? "删除中" : "删除商品"}</button></section>
        </aside>
      </div>}
    </section>
  );
}
