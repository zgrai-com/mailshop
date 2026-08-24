import {
  ArrowLeft,
  Bold,
  Check,
  CircleX,
  Clock3,
  Image as ImageIcon,
  Italic,
  Languages,
  Link as LinkIcon,
  ListChecks,
  ListTodo,
  List as ListIcon,
  LoaderCircle,
  ListOrdered,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Underline,
  Undo2,
  X,
  Redo2,
} from "lucide-react";
import DOMPurify from "dompurify";
import { useCallback, useEffect, useRef, useState } from "react";

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

const DEFAULT_TRANSLATION_PROMPT = "请把商品中的普通文案自然翻译成目标语言，重点翻译标题、描述、Handle、商品类型、供应商、颜色和尺码；保留品牌、型号、SKU、数字和商品事实。";

type ImageJobStatus = "queued" | "waiting" | "failed";
type ImageJob = { id: string; imageId: string; operation: "translate" | "edit"; locale: string; status: ImageJobStatus; createdAt: number | string; updatedAt: number | string; prompt?: string | null; resultUrl?: string | null; message?: string | null };

type DescriptionEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

function DescriptionEditor({ value, onChange }: DescriptionEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const visualValue = DOMPurify.sanitize(value, { USE_PROFILES: { html: true }, ADD_ATTR: ["data-src", "data-lazyload-src", "data-original", "lazy-src"] });

  useEffect(() => {
    if (!sourceMode && editorRef.current && editorRef.current.innerHTML !== visualValue) {
      editorRef.current.innerHTML = visualValue;
    }
  }, [sourceMode, visualValue]);

  function runCommand(command: string, commandValue?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }

  function addLink() {
    const url = window.prompt("请输入链接地址", "https://");
    if (url?.trim()) runCommand("createLink", url.trim());
  }

  function toggleSource() {
    if (!sourceMode && editorRef.current) onChange(editorRef.current.innerHTML);
    setSourceMode((current) => !current);
  }

  return <div className="html-editor">
    <div className="html-editor-toolbar" role="toolbar" aria-label="HTML 编辑工具栏">
      <select aria-label="文本样式" defaultValue="p" onChange={(event) => runCommand("formatBlock", event.target.value)} disabled={sourceMode}>
        <option value="p">正文</option><option value="h2">标题 2</option><option value="h3">标题 3</option>
      </select>
      <button type="button" className="icon-button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("bold")} disabled={sourceMode} aria-label="粗体" title="粗体"><Bold size={15} /></button>
      <button type="button" className="icon-button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("italic")} disabled={sourceMode} aria-label="斜体" title="斜体"><Italic size={15} /></button>
      <button type="button" className="icon-button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("underline")} disabled={sourceMode} aria-label="下划线" title="下划线"><Underline size={15} /></button>
      <button type="button" className="icon-button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertUnorderedList")} disabled={sourceMode} aria-label="无序列表" title="无序列表"><ListIcon size={15} /></button>
      <button type="button" className="icon-button" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertOrderedList")} disabled={sourceMode} aria-label="有序列表" title="有序列表"><ListOrdered size={15} /></button>
      <button type="button" className="icon-button" onMouseDown={(event) => event.preventDefault()} onClick={addLink} disabled={sourceMode} aria-label="插入链接" title="插入链接"><LinkIcon size={15} /></button>
      <span className="html-editor-toolbar-spacer" />
      <button type="button" className="icon-button" onClick={() => runCommand("undo")} disabled={sourceMode} aria-label="撤销" title="撤销"><Undo2 size={15} /></button>
      <button type="button" className="icon-button" onClick={() => runCommand("redo")} disabled={sourceMode} aria-label="重做" title="重做"><Redo2 size={15} /></button>
      <button type="button" className={`html-editor-source-toggle ${sourceMode ? "active" : ""}`} onClick={toggleSource}>{sourceMode ? "可视化编辑" : "HTML 源码"}</button>
    </div>
    {sourceMode
      ? <textarea className="html-editor-source" value={value} onChange={(event) => onChange(event.target.value)} aria-label="HTML 源码" spellCheck={false} />
      : <div ref={editorRef} className="html-editor-canvas" contentEditable suppressContentEditableWarning onInput={(event) => onChange(event.currentTarget.innerHTML)} aria-label="商品描述编辑器" />}
    <p className="editor-help">支持直接编辑 HTML；切换源码可查看和精确修改标签。</p>
  </div>;
}

export function ShopifyProductEditorPage({ stores, storeId, productId, returnPath, onBack, onError, onNotify }: Props) {
  const store = stores.find((item) => item.id === storeId);
  const [product, setProduct] = useState<ShopifyRemoteProduct | null>(null);
  const [draft, setDraft] = useState<ShopifyProductDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seoGenerating, setSeoGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [translation, setTranslation] = useState<ShopifyProductTranslations | null>(null);
  const [locale, setLocale] = useState("");
  const [marketId, setMarketId] = useState("");
  const [translationPrompt, setTranslationPrompt] = useState(DEFAULT_TRANSLATION_PROMPT);
  const [translationStyle, setTranslationStyle] = useState("自然、清晰、符合目标市场电商习惯");
  const [translationGlossary, setTranslationGlossary] = useState("");
  const [translationDrafts, setTranslationDrafts] = useState<ShopifyTranslationDraft[]>([]);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationConflict, setTranslationConflict] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [focusedImageId, setFocusedImageId] = useState<string | null>(null);
  const [imageJobs, setImageJobs] = useState<ImageJob[]>([]);
  const [mediaSelectionActive, setMediaSelectionActive] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaSelectionDraft, setMediaSelectionDraft] = useState<string[]>([]);
  const [aiImageModalOpen, setAiImageModalOpen] = useState(false);
  const [imageTaskMode, setImageTaskMode] = useState<"edit" | "translate">("edit");
  const [imageAiStep, setImageAiStep] = useState<"select" | "analyzing" | "edit" | "generating">("select");
  const [imageAnalysis, setImageAnalysis] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");

  const loadProduct = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ product: ShopifyRemoteProduct }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}`);
      setProduct(result.product);
      setDraft(draftFrom(result.product));
      const jobsResult = await api<{ jobs: ImageJob[] }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-jobs`);
      setImageJobs(jobsResult.jobs);
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

  const updateDraft = <K extends keyof ShopifyProductDraft>(key: K, value: ShopifyProductDraft[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };

  async function generateSeo() {
    if (!draft || !product || seoGenerating) return;
    setSeoGenerating(true);
    try {
      const result = await api<{ seoTitle: string; seoDescription: string }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(product.id)}/ai/seo`, {
        method: "POST",
        body: JSON.stringify({ storeId, productId: product.id, title: draft.title, descriptionHtml: draft.descriptionHtml, productType: draft.productType, vendor: draft.vendor, tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean), seoTitle: draft.seoTitle, seoDescription: draft.seoDescription }),
      });
      setDraft((current) => current ? { ...current, seoTitle: result.seoTitle, seoDescription: result.seoDescription } : current);
      onNotify("AI 已生成 SEO 信息，请检查后保存");
    } catch (error) {
      onError(error);
    } finally {
      setSeoGenerating(false);
    }
  }

  async function saveProduct() {
    if (!draft || !product) return;
    setSaving(true);
    try {
      const result = await api<{ product: ShopifyRemoteProduct }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          storeId,
          productId: product.id,
          ...draftPayload(draft),
          mediaSelectionActive,
          mediaIds: (product.images ?? []).map((image) => image.id).filter((id) => mediaSelectionDraft.includes(id)),
          mediaUrls: imageJobs
            .filter((job) => mediaSelectionDraft.includes(job.id) && job.status === "queued" && job.resultUrl && !(product.images ?? []).some((image) => image.url === job.resultUrl))
            .map((job) => job.resultUrl),
        }),
      });
      setProduct(result.product);
      setDraft(draftFrom(result.product));
      setMediaSelectionActive(false);
      setMediaSelectionDraft([]);
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
          body: JSON.stringify({ storeId, productId, locale, marketId: marketId || undefined, prompt: translationPrompt, style: translationStyle, glossary: translationGlossary, fields: batch.map((field) => ({ resourceId: field.resourceId, resourceType: field.resourceType, resourceLabel: field.resourceLabel, key: field.key, sourceValue: field.sourceValue, existingValue: field.value || undefined, digest: field.digest })) }),
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
    const matchingHandle = changed.find((field) => field.key === "handle" && field.value.trim() && field.value.trim().toLowerCase() === field.sourceValue.trim().toLowerCase());
    if (matchingHandle) {
      onError(new Error("多语言 Handle 不能与默认 Handle 一致，请填写一个未占用的目标语言 Handle"));
      return;
    }
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

  async function queueImageTranslation() {
    const targetLocale = locale;
    const images = selectedImages.flatMap((imageId) => {
      const image = media.find((item) => item.id === imageId);
      return image ? [image] : [];
    });
    if (!targetLocale || !images.length) return;
    const prompt = `Translate every visible piece of text in this image into ${targetLocale}. Preserve the original meaning, brand names, product model numbers, prices, dimensions, logos, layout, typography style, image composition, clothing, product details, person identity, pose, and facial features. Replace only the text that needs translation. Do not add, remove, crop, or redesign any visual element.`;
    const now = Date.now();
    const jobs: ImageJob[] = images.map((image, index) => ({
      id: `${now}-${index}-${image.id}`,
      imageId: image.id,
      operation: "translate",
      locale: targetLocale,
      status: "waiting",
      createdAt: now,
      updatedAt: now,
      prompt,
    }));
    let currentJobs = imageJobs;
    try {
      const created = await api<{ jobs: ImageJob[] }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-jobs`, { method: "POST", body: JSON.stringify({ storeId, productId, jobs }) });
      setImageJobs(created.jobs);
      currentJobs = created.jobs;
    } catch (error) { onError(error); return; }
    setImageAiStep("generating");
    const results = await Promise.allSettled(images.map((image, index) => api<{ imageUrl: string | null; prompt: string }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-edit`, {
      method: "POST",
      body: JSON.stringify({ storeId, productId, imageId: image.id, imageUrl: image.url, prompt, jobId: jobs[index].id }),
    })));
    const successCount = results.filter((result) => result.status === "fulfilled").length;
    const failedCount = results.length - successCount;
    const nextJobs = currentJobs.map((item) => {
      const jobIndex = jobs.findIndex((job) => job.id === item.id);
      if (jobIndex < 0) return item;
      const result = results[jobIndex];
      if (result.status === "fulfilled") {
        return { ...item, status: "queued" as const, updatedAt: Date.now(), resultUrl: result.value.imageUrl, prompt: result.value.prompt || prompt };
      }
      return { ...item, status: "failed" as const, updatedAt: Date.now(), message: result.reason instanceof Error ? result.reason.message : "图片翻译失败" };
    });
    await Promise.all(nextJobs.filter((item) => jobs.some((job) => job.id === item.id)).map((item) => api(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-jobs/${encodeURIComponent(item.id)}`, { method: "PATCH", body: JSON.stringify({ storeId, productId, status: item.status, resultUrl: item.resultUrl ?? null, message: item.message ?? null, prompt: item.prompt ?? null }) })));
    setImageJobs(nextJobs);
    setSelectedImages([]);
    setAiImageModalOpen(false);
    setImageAiStep("select");
    onNotify(failedCount ? `${successCount} 张图片翻译成功，${failedCount} 张失败` : `${successCount} 张图片翻译完成`);
  }

  function openImageAiModal() {
    setSelectedImages([]);
    setImageTaskMode("edit");
    setImageAiStep("select");
    setImageAnalysis("");
    setImagePrompt("");
    setAiImageModalOpen(true);
  }

  function openMediaPicker() {
    const currentMediaIds = media.map((image) => image.id);
    const completedDraftIds = mediaDraftJobs.map((job) => job.id);
    setMediaSelectionActive(true);
    setMediaSelectionDraft((current) => current.length ? current.filter((id) => currentMediaIds.includes(id) || completedDraftIds.includes(id)) : currentMediaIds);
    setMediaPickerOpen(true);
  }

  async function cancelImageTranslation(id: string) {
    try {
      await api(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
      setImageJobs((current) => current.filter((job) => job.id !== id));
    } catch (error) { onError(error); }
  }

  async function retryImageTranslation(id: string) {
    const job = imageJobs.find((item) => item.id === id);
    if (!job) return;
    try {
      if (!job.prompt) throw new Error("此旧任务没有保存提示词，请重新创建图片翻译任务");
      const image = media.find((item) => item.id === job.imageId);
      if (!image) throw new Error("原图已不存在，无法重试");
      setImageJobs((current) => current.map((item) => item.id === id ? { ...item, status: "waiting" as const, message: null } : item));
      await api(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-jobs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ storeId, productId, status: "waiting", message: null, resultUrl: null }) });
      const result = await api<{ imageUrl: string | null; prompt: string }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-edit`, { method: "POST", body: JSON.stringify({ storeId, productId, imageId: image.id, imageUrl: image.url, prompt: job.prompt, jobId: id }) });
      const updated = await api<{ job: ImageJob }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-jobs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ storeId, productId, status: "queued", resultUrl: result.imageUrl, message: null, prompt: result.prompt || job.prompt }) });
      setImageJobs((current) => current.map((item) => item.id === id ? updated.job : item));
      onNotify("图片任务重试成功");
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成失败";
      await api(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-jobs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ storeId, productId, status: "failed", message }) }).catch(() => undefined);
      setImageJobs((current) => current.map((item) => item.id === id ? { ...item, status: "failed" as const, message } : item));
      onError(error);
    }
  }

  async function analyzeImageStyle() {
    if (!selectedImages.length) return;
    const image = media.find((item) => item.id === selectedImages[0]);
    if (!image) return;
    setFocusedImageId(image.id);
    setImageAiStep("analyzing");
    try {
      const result = await api<{ prompt: string; analysis: string }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-analyze`, { method: "POST", body: JSON.stringify({ storeId, productId, imageId: image.id, imageUrl: image.url }) });
      setImageAnalysis(result.analysis);
      setImagePrompt(result.prompt);
      setImageAiStep("edit");
    } catch (error) {
      setImageAiStep("select");
      onError(error);
    }
  }

  async function generateImageTask() {
    const images = selectedImages.flatMap((imageId) => {
      const image = media.find((item) => item.id === imageId);
      return image ? [image] : [];
    });
    const prompt = imagePrompt.trim();
    if (!images.length || !prompt) return;
    const now = Date.now();
    const jobs: ImageJob[] = images.map((image, index) => ({
      id: `${now}-${index}-${image.id}`,
      imageId: image.id,
      operation: "edit",
      locale: "",
      status: "waiting",
      createdAt: now,
      updatedAt: now,
      prompt,
    }));
    let currentJobs = imageJobs;
    try {
      const created = await api<{ jobs: ImageJob[] }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-jobs`, { method: "POST", body: JSON.stringify({ storeId, productId, jobs }) });
      setImageJobs(created.jobs);
      currentJobs = created.jobs;
    } catch (error) { onError(error); return; }
    setImageAiStep("generating");
    const results = await Promise.allSettled(images.map((image, index) => api<{ imageUrl: string | null; prompt: string }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-edit`, {
      method: "POST",
      body: JSON.stringify({ storeId, productId, imageId: image.id, imageUrl: image.url, prompt, jobId: jobs[index].id }),
    })));
    const successCount = results.filter((result) => result.status === "fulfilled").length;
    const failedCount = results.length - successCount;
    const nextJobs = currentJobs.map((item) => {
      const jobIndex = jobs.findIndex((job) => job.id === item.id);
      if (jobIndex < 0) return item;
      const result = results[jobIndex];
      if (result.status === "fulfilled") {
        return { ...item, status: "queued" as const, updatedAt: Date.now(), resultUrl: result.value.imageUrl, prompt: result.value.prompt || prompt };
      }
      return { ...item, status: "failed" as const, updatedAt: Date.now(), message: result.reason instanceof Error ? result.reason.message : "生成失败" };
    });
    await Promise.all(nextJobs.filter((item) => jobs.some((job) => job.id === item.id)).map((item) => api(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-jobs/${encodeURIComponent(item.id)}`, { method: "PATCH", body: JSON.stringify({ storeId, productId, status: item.status, resultUrl: item.resultUrl ?? null, message: item.message ?? null, prompt: item.prompt ?? null }) })));
    setImageJobs(nextJobs);
    setAiImageModalOpen(false);
    setSelectedImages([]);
    setImageAiStep("select");
    onNotify(failedCount ? `${successCount} 张图片生成成功，${failedCount} 张失败` : `${successCount} 张图片 AI 修改任务已生成`);
  }

  const media = product?.images ?? [];
  const selectedCount = selectedImages.length;
  const focusedImage = media.find((image) => image.id === focusedImageId) ?? media[0] ?? null;
  const queuedImageCount = imageJobs.filter((job) => job.status === "queued").length;
  const mediaDraftJobs = imageJobs.filter((job) => job.status === "queued" && job.resultUrl && !media.some((image) => image.url === job.resultUrl));
  const selectedMediaCount = mediaSelectionDraft.length;
  const displayMedia = mediaSelectionActive
    ? [
        ...media.filter((image) => mediaSelectionDraft.includes(image.id)),
        ...mediaDraftJobs.filter((job) => mediaSelectionDraft.includes(job.id)).map((job, index) => ({ id: job.id, url: job.resultUrl as string, altText: "AI 图片草稿", position: media.length + index })),
      ]
    : media;
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
          <section className="shopify-editor-card"><div className="editor-section-heading"><div><span>GENERAL</span><h2>基本信息</h2></div></div><label><span>标题</span><input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} /></label><label><span>描述 HTML</span><DescriptionEditor value={draft.descriptionHtml} onChange={(value) => updateDraft("descriptionHtml", value)} /></label><div className="editor-two-columns"><label><span>Handle</span><input value={draft.handle} onChange={(event) => updateDraft("handle", event.target.value)} /></label><label><span>供应商</span><input value={draft.vendor} onChange={(event) => updateDraft("vendor", event.target.value)} /></label><label><span>商品类型</span><input value={draft.productType} onChange={(event) => updateDraft("productType", event.target.value)} /></label><label><span>模板后缀</span><input value={draft.templateSuffix} onChange={(event) => updateDraft("templateSuffix", event.target.value)} placeholder="默认模板" /></label></div><label><span>标签</span><input value={draft.tags} onChange={(event) => updateDraft("tags", event.target.value)} placeholder="用逗号分隔" /></label></section>

          <section className="shopify-editor-card"><div className="editor-section-heading"><div><span>VARIANTS</span><h2>变体与库存</h2></div><small>{draft.variants.length} 个变体</small></div><div className="shopify-variant-editor"><div className="shopify-variant-row header"><span>变体</span><span>价格</span><span>对比价</span><span>SKU</span><span>条码</span><span>库存</span></div>{draft.variants.map((variant, index) => <div className="shopify-variant-row" key={variant.id}><strong>{variant.title}</strong><input value={variant.price} onChange={(event) => setDraft({ ...draft, variants: draft.variants.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value } : item) })} /><input value={variant.compareAtPrice} onChange={(event) => setDraft({ ...draft, variants: draft.variants.map((item, itemIndex) => itemIndex === index ? { ...item, compareAtPrice: event.target.value } : item) })} /><input value={variant.sku} onChange={(event) => setDraft({ ...draft, variants: draft.variants.map((item, itemIndex) => itemIndex === index ? { ...item, sku: event.target.value } : item) })} /><input value={variant.barcode} onChange={(event) => setDraft({ ...draft, variants: draft.variants.map((item, itemIndex) => itemIndex === index ? { ...item, barcode: event.target.value } : item) })} /><span>{variant.inventoryQuantity ?? 0}</span></div>)}</div></section>

          <section className="shopify-editor-card"><div className="editor-section-heading"><div><span>SEO</span><h2>搜索引擎预览</h2></div><button className="button quiet compact" type="button" onClick={() => void generateSeo()} disabled={seoGenerating}><Sparkles size={14} />{seoGenerating ? "生成中" : "AI 生成 SEO"}</button></div><label><span>SEO 标题</span><input value={draft.seoTitle} onChange={(event) => updateDraft("seoTitle", event.target.value)} placeholder="不填写则使用商品标题" /></label><label><span>SEO 描述</span><textarea rows={4} value={draft.seoDescription} onChange={(event) => updateDraft("seoDescription", event.target.value)} /></label><div className="seo-preview"><strong>{draft.seoTitle || draft.title}</strong><span>{store?.shopDomain}/{draft.handle}</span><p>{draft.seoDescription || "Shopify 会使用商品描述生成搜索摘要。"}</p></div></section>

          <section className="shopify-editor-card">
            <div className="editor-section-heading"><div><span>MEDIA</span><h2>媒体与图片</h2></div><div className="media-selection-actions"><small>{displayMedia.length} 张图片</small><button className="button quiet compact" type="button" onClick={openMediaPicker}><ImageIcon size={14} />设置显示图片</button><button className="button quiet compact" type="button" onClick={openImageAiModal} disabled={!media.length}><Sparkles size={14} />使用 AI 处理图片</button></div></div>
            <div className="shopify-editor-media-grid">{displayMedia.map((image) => {
              const job = imageJobs.find((item) => item.imageId === image.id);
              return <figure key={image.id} className={focusedImage?.id === image.id ? "focused" : ""}>
                <button className="shopify-media-select" type="button" onClick={() => setFocusedImageId(image.id)} aria-label={`预览图片 ${image.position + 1}`}>
                  <img src={image.url} alt={image.altText || product.title} />
                  {job ? <span className={`image-job-badge ${job.status}`}><Clock3 size={13} /></span> : null}
                </button>
                <figcaption>{image.altText || "未填写替代文本"}</figcaption>
              </figure>;
             })}</div>
            <div className="image-task-panel">
              <div className="image-task-panel-heading"><div><strong><ListTodo size={15} />AI 图片任务</strong><small>{imageJobs.length ? `${imageJobs.length} 个任务 · ${queuedImageCount} 个待处理` : "还没有生成任务"}</small></div><button className="button quiet compact" type="button" onClick={openImageAiModal} disabled={!media.length}><Sparkles size={14} />新建任务</button></div>
              {imageJobs.length ? <div className="image-task-list">{imageJobs.map((job) => {
                const taskImage = media.find((image) => image.id === job.imageId);
                const canRetry = Boolean(job.prompt) && (job.status === "failed" || job.resultUrl?.startsWith("http"));
                return <div className="image-task-row" key={job.id}><img src={job.resultUrl || taskImage?.url} alt={taskImage?.altText || product.title} /><div className="image-task-row-main"><strong>{taskImage?.altText || `图片 ${taskImage?.position ?? ""}`}</strong><span>{job.operation === "edit" ? "AI 风格修改" : "图片文字翻译"}{job.locale ? ` · ${job.locale}` : ""} · {new Date(job.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div><span className={`image-task-status ${job.status}`}>{job.status === "queued" ? "已生成" : job.status === "waiting" ? "处理中" : "失败"}</span><div className="image-task-row-actions">{canRetry ? <button className="icon-button" type="button" onClick={() => retryImageTranslation(job.id)} aria-label="手动重新生成" title="手动重新生成"><RotateCcw size={14} /></button> : null}<button className="icon-button" type="button" onClick={() => cancelImageTranslation(job.id)} aria-label="移除任务" title="移除任务"><CircleX size={14} /></button></div></div>;
              })}</div> : <p className="image-task-empty">选择商品图片后，使用 AI 处理图片即可生成任务。</p>}
              <small className="image-task-note">任务列表显示在当前商品页面，生成完成后可直接预览 AI 返回的图片结果。</small>
            </div>
          </section>
        </main>

        <aside className="shopify-editor-side">
          <section className="shopify-editor-card translation-card">
            <div className="editor-section-heading"><div><span>LOCALIZATION</span><h2><Languages size={17} />多语言翻译</h2></div><button className="icon-button" type="button" onClick={() => void loadTranslations(locale, marketId)} aria-label="刷新翻译"><LoaderCircle className={translationLoading ? "spin" : ""} size={16} /></button></div>
            <label className="translation-prompt-field"><span>翻译提示词</span><textarea value={translationPrompt} onChange={(event) => setTranslationPrompt(event.target.value)} rows={5} maxLength={8_000} placeholder="例如：翻译成法国市场自然、简洁的法语；品牌名保持英文；语气偏高端。" /><small>填写本次翻译的语气、市场、术语或其他文案要求，可留空使用系统默认处理。</small></label>
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
      {mediaPickerOpen && product ? <div className="modal-backdrop media-picker-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setMediaPickerOpen(false)}>
        <section className="media-picker-modal" role="dialog" aria-modal="true" aria-labelledby="media-picker-title">
          <header className="modal-header"><div><span>PRODUCT MEDIA</span><h2 id="media-picker-title">设置显示图片</h2></div><button className="icon-button" type="button" onClick={() => setMediaPickerOpen(false)} aria-label="关闭" title="关闭"><X size={19} /></button></header>
          <div className="media-picker-body">
            <p className="media-picker-note">勾选的图片会在点击页面顶部“保存”后设置为商品媒体。当前 Shopify 媒体默认已勾选，AI 草稿默认未勾选。</p>
            <div className="media-picker-grid">
              {media.map((image) => {
                const selected = mediaSelectionDraft.includes(image.id);
                return <label className={`media-picker-card ${selected ? "selected" : ""}`} key={image.id}>
                  <input type="checkbox" checked={selected} onChange={() => setMediaSelectionDraft((current) => selected ? current.filter((id) => id !== image.id) : [...current, image.id])} />
                  <img src={image.url} alt={image.altText || product.title} />
                  <span className="media-picker-check">{selected ? <Check size={14} /> : null}</span>
                  <small>当前媒体 · {image.position + 1}</small>
                </label>;
              })}
              {mediaDraftJobs.map((job) => {
                const selected = mediaSelectionDraft.includes(job.id);
                return <label className={`media-picker-card ${selected ? "selected" : ""}`} key={job.id}>
                  <input type="checkbox" checked={selected} onChange={() => setMediaSelectionDraft((current) => selected ? current.filter((id) => id !== job.id) : [...current, job.id])} />
                  <img src={job.resultUrl ?? undefined} alt="AI 图片草稿" />
                  <span className="media-picker-check">{selected ? <Check size={14} /> : null}</span>
                  <small>AI 草稿 · {job.operation === "translate" ? "图片翻译" : "风格修改"}</small>
                </label>;
              })}
            </div>
            {!media.length && !mediaDraftJobs.length ? <p className="media-picker-empty">当前没有可选图片。</p> : null}
          </div>
          <footer className="modal-actions"><span className="media-picker-count">已选择 {selectedMediaCount} 张</span><button className="button quiet" type="button" onClick={() => setMediaPickerOpen(false)}>完成</button></footer>
        </section>
      </div> : null}
      {aiImageModalOpen && product ? <div className="modal-backdrop ai-image-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setAiImageModalOpen(false)}>
        <section className="ai-image-modal" role="dialog" aria-modal="true" aria-labelledby="ai-image-modal-title">
          <header className="modal-header"><div><span>AI IMAGE TASK</span><h2 id="ai-image-modal-title">使用 AI 处理图片</h2></div><button className="icon-button" type="button" onClick={() => setAiImageModalOpen(false)} aria-label="关闭" title="关闭"><X size={19} /></button></header>
          <div className="ai-image-modal-body">
            <div className="ai-image-mode-switch" role="group" aria-label="图片任务类型"><button className={`button quiet compact ${imageTaskMode === "edit" ? "active" : ""}`} type="button" onClick={() => { setImageTaskMode("edit"); setImageAiStep("select"); }} aria-pressed={imageTaskMode === "edit"}><Sparkles size={14} />AI 风格修改</button><button className={`button quiet compact ${imageTaskMode === "translate" ? "active" : ""}`} type="button" onClick={() => { setImageTaskMode("translate"); setImageAiStep("select"); }} aria-pressed={imageTaskMode === "translate"}><Languages size={14} />翻译图片</button></div>
            {imageTaskMode === "translate" ? <><div className="ai-image-modal-toolbar"><div><strong>选择要翻译的商品图片</strong><small>根据当前页面选择的语言翻译图片文字：{targetLocaleName || "尚未选择语言"}</small></div><button className="button quiet compact" type="button" onClick={() => setSelectedImages(selectedCount === media.length ? [] : media.map((image) => image.id))} disabled={!media.length}><ListChecks size={14} />全选</button></div><div className="ai-image-modal-grid">{media.map((image) => <button key={image.id} className={`ai-image-modal-image ${selectedImages.includes(image.id) ? "selected" : ""}`} type="button" onClick={() => { setFocusedImageId(image.id); setSelectedImages((current) => current.includes(image.id) ? current.filter((item) => item !== image.id) : [...current, image.id]); }}><img src={image.url} alt={image.altText || product.title} /><span>{selectedImages.includes(image.id) ? <Check size={15} /> : image.position + 1}</span></button>)}</div><div className="ai-image-modal-preview"><Languages size={16} /><span>{selectedCount ? `将翻译 ${selectedCount} 张图片中的文字为 ${targetLocaleName || locale}` : "选择图片后开始翻译"}</span></div><p className="ai-image-modal-note">翻译仅替换图片中的文字，保留商品、人物、构图和版式；失败后可在任务列表中手动重试。</p></> : null}
            {imageTaskMode === "edit" && (imageAiStep === "select" || imageAiStep === "analyzing") ? <><div className="ai-image-modal-toolbar"><div><strong>选择要处理的商品图片</strong><small>第一步：可多选图片，AI 将分析第一张并生成可编辑的统一提示词</small></div><button className="button quiet compact" type="button" onClick={() => setSelectedImages(selectedCount === media.length ? [] : media.map((image) => image.id))} disabled={!media.length}><ListChecks size={14} />全选</button></div><div className="ai-image-modal-grid">{media.map((image) => <button key={image.id} className={`ai-image-modal-image ${selectedImages.includes(image.id) ? "selected" : ""}`} type="button" onClick={() => { setFocusedImageId(image.id); setSelectedImages((current) => current.includes(image.id) ? current.filter((item) => item !== image.id) : [...current, image.id]); }}><img src={image.url} alt={image.altText || product.title} /><span>{selectedImages.includes(image.id) ? <Check size={15} /> : image.position + 1}</span></button>)}</div><div className="ai-image-modal-preview"><ImageIcon size={16} /><span>{selectedCount ? `已选择 ${selectedCount} 张图片，分析第一张生成统一提示词` : "选择图片后开始分析"}</span></div><p className="ai-image-modal-note">AI 会识别背景、光线、构图与摄影质感，并自动加入“保留衣服和模特”的约束。</p></> : null}
            {imageAiStep === "edit" || imageAiStep === "generating" ? <><div className="ai-image-modal-toolbar"><div><strong>编辑图片提示词</strong><small>第二步：提示词会应用到已选的 {selectedCount} 张图片，衣服和模特会被保留</small></div><button className="button quiet compact" type="button" onClick={() => setImageAiStep("select")}><ArrowLeft size={14} />重新选择</button></div>{imageAnalysis ? <div className="ai-image-analysis">{imageAnalysis}</div> : null}<label className="ai-image-prompt-field"><span>图片修改提示词</span><textarea rows={8} value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)} disabled={imageAiStep === "generating"} /></label><div className="ai-image-modal-preview"><ImageIcon size={16} /><span>{selectedCount ? `将修改 ${selectedCount} 张图片` : ""}</span></div></> : null}
          </div>
          <footer className="modal-actions"><button className="button quiet" type="button" onClick={() => setAiImageModalOpen(false)}>取消</button>{imageTaskMode === "translate" ? <button className="button primary" type="button" onClick={() => void queueImageTranslation()} disabled={selectedCount < 1 || !locale || imageAiStep === "generating"}>{imageAiStep === "generating" ? <LoaderCircle className="spin" size={15} /> : <Languages size={15} />}{imageAiStep === "generating" ? "翻译中" : "创建翻译任务"}</button> : imageAiStep === "select" || imageAiStep === "analyzing" ? <button className="button primary" type="button" onClick={() => void analyzeImageStyle()} disabled={selectedCount < 1 || imageAiStep === "analyzing"}>{imageAiStep === "analyzing" ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}{imageAiStep === "analyzing" ? "分析中" : "分析图片并生成提示词"}</button> : <button className="button primary" type="button" onClick={() => void generateImageTask()} disabled={!imagePrompt.trim() || imageAiStep === "generating"}>{imageAiStep === "generating" ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}{imageAiStep === "generating" ? "生成中" : "生成修改后的图片"}</button>}</footer>
        </section>
      </div> : null}
    </section>
  );
}
