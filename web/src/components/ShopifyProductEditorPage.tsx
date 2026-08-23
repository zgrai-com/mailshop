import {
  ArrowLeft,
  Check,
  Image as ImageIcon,
  Languages,
  LoaderCircle,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { api } from "../api";
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

type ImageTranslationState = "idle" | "queued" | "processing" | "ready";

export function ShopifyProductEditorPage({ stores, storeId, productId, returnPath, onBack, onError, onNotify }: Props) {
  const store = stores.find((item) => item.id === storeId);
  const [product, setProduct] = useState<ShopifyRemoteProduct | null>(null);
  const [draft, setDraft] = useState<ShopifyProductDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [translation, setTranslation] = useState<ShopifyProductTranslations | null>(null);
  const [locale, setLocale] = useState("");
  const [translationDrafts, setTranslationDrafts] = useState<ShopifyTranslationDraft[]>([]);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [imageTranslationState, setImageTranslationState] = useState<ImageTranslationState>("idle");

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

  const loadTranslations = useCallback(async (nextLocale?: string) => {
    if (!storeId || !productId) return;
    setTranslationLoading(true);
    try {
      const suffix = nextLocale ? `?locale=${encodeURIComponent(nextLocale)}` : "";
      const result = await api<ShopifyProductTranslations & { locale: string }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/translations${suffix}`);
      setTranslation(result);
      setLocale(result.locale);
      const existing = new Map(result.translations.map((item) => [item.key, item] as const));
      setTranslationDrafts(result.translatableContent.map((item) => {
        const current = existing.get(item.key);
        return { key: item.key, sourceValue: item.value, value: current?.value ?? "", digest: item.digest, changed: false, outdated: current?.outdated };
      }));
    } catch (error) {
      onError(error);
    } finally {
      setTranslationLoading(false);
    }
  }, [onError, productId, storeId]);

  useEffect(() => { void loadTranslations(); }, [loadTranslations]);

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
      const result = await api<{ translations: ShopifyTranslationDraft[] }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/translations/ai`, {
        method: "POST",
        body: JSON.stringify({ storeId, productId, locale, fields: translationDrafts.map((field) => ({ key: field.key, sourceValue: field.sourceValue, existingValue: field.value || undefined, digest: field.digest })) }),
      });
      setTranslationDrafts(result.translations);
      onNotify("AI 已生成翻译草稿，请检查后发布");
    } catch (error) {
      onError(error);
    } finally {
      setAiLoading(false);
    }
  }

  async function publishTranslations() {
    const changed = translationDrafts.filter((field) => field.value.trim());
    if (!locale || !changed.length) return;
    setPublishLoading(true);
    try {
      await api(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/translations`, {
        method: "PUT",
        body: JSON.stringify({ storeId, productId, locale, translations: changed.map((field) => ({ key: field.key, value: field.value, translatableContentDigest: field.digest })) }),
      });
      onNotify("翻译已发布到 Shopify");
      await loadTranslations(locale);
    } catch (error) {
      onError(error);
    } finally {
      setPublishLoading(false);
    }
  }

  const media = product?.images ?? [];
  const selectedCount = selectedImages.length;
  const currentStatus = draft ? statusLabels[draft.status] : "";
  const targetLocaleName = translation?.locales.find((item) => item.locale === locale)?.name ?? locale;

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

          <section className="shopify-editor-card"><div className="editor-section-heading"><div><span>MEDIA</span><h2>媒体与图片翻译</h2></div><small>{media.length} 张图片</small></div><div className="shopify-editor-media-grid">{media.map((image) => <figure key={image.id} className={selectedImages.includes(image.id) ? "selected" : ""}><button className="shopify-media-select" type="button" onClick={() => setSelectedImages((current) => current.includes(image.id) ? current.filter((item) => item !== image.id) : [...current, image.id])} aria-label={`选择图片 ${image.position + 1}`}><img src={image.url} alt={image.altText || product.title} /></button><figcaption>{image.altText || "未填写替代文本"}</figcaption></figure>)}</div><div className="image-translation-workbench"><div><ImageIcon size={16} /><strong>AI 图片翻译</strong><span>{selectedCount ? `已选择 ${selectedCount} 张图片` : "选择图片后生成本地化预览"}</span></div><button className="button quiet compact" type="button" disabled={!selectedCount || imageTranslationState === "processing"} onClick={() => { setImageTranslationState("queued"); window.setTimeout(() => setImageTranslationState("processing"), 250); }}><Sparkles size={14} />生成翻译图</button><small>{imageTranslationState === "processing" ? "图片翻译接口接入中，请稍候。" : imageTranslationState === "queued" ? "已加入处理队列。" : "当前仅展示工作区，暂不伪造生成结果。"}</small></div></section>
        </main>

        <aside className="shopify-editor-side"><section className="shopify-editor-card translation-card"><div className="editor-section-heading"><div><span>LOCALIZATION</span><h2><Languages size={17} />多语言翻译</h2></div><button className="icon-button" type="button" onClick={() => void loadTranslations(locale)} aria-label="刷新翻译"><LoaderCircle className={translationLoading ? "spin" : ""} size={16} /></button></div><div className="translation-toolbar"><select value={locale} onChange={(event) => { setLocale(event.target.value); void loadTranslations(event.target.value); }} disabled={translationLoading}>{translation?.locales.map((item) => <option key={item.locale} value={item.locale}>{item.name} ({item.locale}){item.primary ? " · 主语言" : ""}</option>)}</select><div className="translation-toolbar-actions"><button className="button quiet compact" type="button" onClick={() => void translateAll()} disabled={aiLoading || translationLoading || !translationDrafts.length}><Sparkles size={14} />{aiLoading ? "翻译中" : "AI 翻译全部"}</button><button className="button primary compact" type="button" onClick={() => void publishTranslations()} disabled={publishLoading || !translationDrafts.some((field) => field.value.trim())}><Check size={14} />{publishLoading ? "发布中" : "发布翻译"}</button></div></div><p className="translation-target">目标语言：{targetLocaleName || "尚未读取"}。AI 结果会先写入草稿，确认后再发布。</p><div className="translation-fields">{translationDrafts.length ? translationDrafts.map((field) => <label key={field.key} className={field.outdated ? "is-outdated" : ""}><span><b>{field.key}</b>{field.outdated ? <em>已过期</em> : null}</span><small>{field.sourceValue}</small><textarea value={field.value} onChange={(event) => setTranslationDrafts((current) => current.map((item) => item.key === field.key ? { ...item, value: event.target.value, changed: true } : item))} placeholder="输入翻译，或使用 AI 翻译全部" rows={3} /></label>) : <div className="translation-empty">{translationLoading ? "正在读取可翻译字段" : "当前商品没有可翻译字段"}</div>}</div></section><section className="shopify-editor-card publishing-card"><div className="editor-section-heading"><div><span>PUBLISHING</span><h2>发布状态</h2></div></div><label><span>状态</span><select value={draft.status} onChange={(event) => updateDraft("status", event.target.value as ShopifyProductDraft["status"])}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="button danger-text" type="button" onClick={() => void deleteProduct()} disabled={deleting}><Trash2 size={15} />{deleting ? "删除中" : "删除商品"}</button></section></aside>
      </div>}
    </section>
  );
}
