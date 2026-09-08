import {
  ArrowLeft,
  ArrowRight,
  Bold,
  Check,
  CircleX,
  Clock3,
  ExternalLink,
  Eye,
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
import { applyPromptTemplate } from "../../../shared/prompt-templates";
import type {
  ShopifyDescriptionAiContext,
  ShopifyDescriptionAiResult,
  ShopifyDescriptionSource,
  ShopifyTitleAiResult,
  ShopifyProductTranslations,
  ShopifyRemoteProduct,
  ShopifyStore,
  ShopifyTranslationDraft,
  UserAiPromptSettings,
} from "../types";
import { draftFrom, draftPayload, statusLabels, type ShopifyProductDraft } from "./shopifyProductUtils";
import { DEFAULT_DESCRIPTION_PROMPT, ShopifyDescriptionModal } from "./ShopifyDescriptionModal";
import { DEFAULT_TITLE_PROMPT, ShopifyTitleModal } from "./ShopifyTitleModal";
import { ImageCompareModal } from "./ImageCompareModal";
import { ImagePreviewModal } from "./ImagePreviewModal";

type Props = {
  stores: ShopifyStore[];
  storeId: string;
  productId: string;
  returnPath: string;
  aiPrompts: UserAiPromptSettings | null;
  onBack: (returnPath: string) => void;
  onError: (error: unknown) => void;
  onNotify: (message: string) => void;
};

const DEFAULT_TRANSLATION_PROMPT = "请把商品中的普通文案自然翻译成目标语言，重点翻译标题、描述、Handle、商品类型、供应商、颜色和尺码；保留品牌、型号、SKU、数字和商品事实。";
const DEFAULT_IMAGE_TRANSLATION_PROMPT = "Translate every visible piece of text in this image into {Target Language}. Preserve the original meaning, brand names, product model numbers, prices, dimensions, logos, layout, typography style, image composition, clothing, product details, person identity, pose, and facial features. Replace only the text that needs translation. Do not add, remove, crop, or redesign any visual element.";
const PRIMARY_PRODUCT_TRANSLATION_KEYS = new Set(["title", "body_html", "handle", "product_type", "meta_title", "meta_description"]);

function projectDraftToLocale(draft: ShopifyProductDraft, productId: string, translation: ShopifyProductTranslations | null): ShopifyProductDraft {
  if (!translation || translation.locale === translation.sourceLocale) return draft;
  const translated = new Map(
    translation.translations
      .filter((item) => item.resourceId === productId)
      .map((item) => [item.key, item.value] as const),
  );
  return {
    ...draft,
    title: translated.get("title") ?? draft.title,
    descriptionHtml: translated.get("body_html") ?? draft.descriptionHtml,
    handle: translated.get("handle") ?? draft.handle,
    productType: translated.get("product_type") ?? draft.productType,
    seoTitle: translated.get("meta_title") ?? draft.seoTitle,
    seoDescription: translated.get("meta_description") ?? draft.seoDescription,
  };
}

type ImageJobStatus = "queued" | "waiting" | "failed";
type ImageJob = { id: string; imageId: string; operation: "translate" | "edit"; locale: string; status: ImageJobStatus; createdAt: number | string; updatedAt: number | string; prompt?: string | null; resultUrl?: string | null; message?: string | null };
type ImageResultDraft = ImageJob & { sourceUrl: string; discarded?: boolean; replacing?: boolean };
type ImageAnalysisDraft = { id: string; imageId: string; sourceUrl: string; status: "analyzing" | "generating" | "ready" | "failed"; failedStage?: "analysis" | "generation"; prompt?: string; analysis?: string; message?: string };
type ShopifyRemoteImage = NonNullable<ShopifyRemoteProduct["images"]>[number];

type DescriptionEditorProps = {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
};

function DescriptionEditor({ value, onChange, readOnly = false }: DescriptionEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const visualValue = DOMPurify.sanitize(value, { USE_PROFILES: { html: true }, ADD_ATTR: ["data-src", "data-lazyload-src", "data-original", "lazy-src"] });

  useEffect(() => {
    if (!sourceMode && editorRef.current && editorRef.current.innerHTML !== visualValue) {
      editorRef.current.innerHTML = visualValue;
    }
  }, [sourceMode, visualValue]);

  function runCommand(command: string, commandValue?: string) {
    if (readOnly) return;
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }

  function addLink() {
    if (readOnly) return;
    const url = window.prompt("请输入链接地址", "https://");
    if (url?.trim()) runCommand("createLink", url.trim());
  }

  function toggleSource() {
    if (readOnly) return;
    if (!sourceMode && editorRef.current) onChange(editorRef.current.innerHTML);
    setSourceMode((current) => !current);
  }

  return <div className={`html-editor ${readOnly ? "read-only" : ""}`}>
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

export function ShopifyProductEditorPage({ stores, storeId, productId, returnPath, aiPrompts, onBack, onError, onNotify }: Props) {
  const store = stores.find((item) => item.id === storeId);
  const defaultDescriptionPrompt = aiPrompts?.aiDescriptionPrompt || DEFAULT_DESCRIPTION_PROMPT;
  const defaultTitlePrompt = aiPrompts?.aiTitlePrompt || DEFAULT_TITLE_PROMPT;
  const defaultTranslationPrompt = aiPrompts?.translationPrompt || DEFAULT_TRANSLATION_PROMPT;
  const defaultImagePrompt = aiPrompts?.imagePrompt?.trim() ?? "";
  const [product, setProduct] = useState<ShopifyRemoteProduct | null>(null);
  const [draft, setDraft] = useState<ShopifyProductDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seoGenerating, setSeoGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [descriptionModalOpen, setDescriptionModalOpen] = useState(false);
  const [descriptionLoading, setDescriptionLoading] = useState(false);
  const [descriptionSaving, setDescriptionSaving] = useState(false);
  const [descriptionGenerating, setDescriptionGenerating] = useState(false);
  const [descriptionSource, setDescriptionSource] = useState<ShopifyDescriptionSource | null>(null);
  const [descriptionPrompt, setDescriptionPrompt] = useState(defaultDescriptionPrompt);
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [descriptionSelectedImageIds, setDescriptionSelectedImageIds] = useState<string[]>([]);
  const [descriptionCredits, setDescriptionCredits] = useState<{ balance: number; charged: number } | null>(null);
  const [descriptionPromptVersion, setDescriptionPromptVersion] = useState<string | null>(null);
  const [titleModalOpen, setTitleModalOpen] = useState(false);
  const [titleGenerating, setTitleGenerating] = useState(false);
  const [titleSaving, setTitleSaving] = useState(false);
  const [titlePrompt, setTitlePrompt] = useState(defaultTitlePrompt);
  const [titleValue, setTitleValue] = useState("");
  const [titleSelectedImageIds, setTitleSelectedImageIds] = useState<string[]>([]);
  const [titleCredits, setTitleCredits] = useState<{ balance: number; charged: number } | null>(null);
  const [titlePromptVersion, setTitlePromptVersion] = useState<string | null>(null);
  const [translation, setTranslation] = useState<ShopifyProductTranslations | null>(null);
  const [viewTranslation, setViewTranslation] = useState<ShopifyProductTranslations | null>(null);
  const [translationModalOpen, setTranslationModalOpen] = useState(false);
  const [locale, setLocale] = useState("");
  const [sourceLocale, setSourceLocale] = useState("");
  const [marketId, setMarketId] = useState("");
  const [viewLocale, setViewLocale] = useState("");
  const [translationPrompt, setTranslationPrompt] = useState(defaultTranslationPrompt);
  const [translationStyle, setTranslationStyle] = useState("自然、清晰、符合目标市场电商习惯");
  const [translationGlossary, setTranslationGlossary] = useState("");
  const [translationDrafts, setTranslationDrafts] = useState<ShopifyTranslationDraft[]>([]);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [viewTranslationLoading, setViewTranslationLoading] = useState(false);
  const [translationConflict, setTranslationConflict] = useState(false);
  const [translationNotice, setTranslationNotice] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [translationBatchProgress, setTranslationBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const translationRequestIdRef = useRef(0);
  const viewTranslationRequestIdRef = useRef(0);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [focusedImageId, setFocusedImageId] = useState<string | null>(null);
  const [detailImages, setDetailImages] = useState<ShopifyRemoteImage[]>([]);
  const [modalImages, setModalImages] = useState<ShopifyRemoteImage[]>([]);
  const [imageJobs, setImageJobs] = useState<ImageJob[]>([]);
  const [mediaSelectionActive, setMediaSelectionActive] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaSelectionDraft, setMediaSelectionDraft] = useState<string[]>([]);
  const [aiImageModalOpen, setAiImageModalOpen] = useState(false);
  const [imageTaskMode, setImageTaskMode] = useState<"edit" | "translate">("edit");
  const [imageAiStep, setImageAiStep] = useState<"select" | "analyzing" | "edit" | "generating">("select");
  const [imageAnalysis, setImageAnalysis] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageAnalysisDrafts, setImageAnalysisDrafts] = useState<ImageAnalysisDraft[]>([]);
  const [imageResultDrafts, setImageResultDrafts] = useState<ImageResultDraft[]>([]);
  const [imageModalSaving, setImageModalSaving] = useState(false);
  const [imagePreviewState, setImagePreviewState] = useState<{ url: string; title: string } | null>(null);
  const [imageCompareState, setImageCompareState] = useState<{ originalUrl: string; resultUrl: string; title: string } | null>(null);
  const imageModalInitialMediaSelectionRef = useRef<{ active: boolean; ids: string[] } | null>(null);
  const translationModalRef = useRef<HTMLElement>(null);
  const descriptionRequestIdRef = useRef(0);
  const descriptionModalRef = useRef<HTMLElement>(null);
  const titleModalRef = useRef<HTMLElement>(null);

  const loadProduct = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ product: ShopifyRemoteProduct }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}`);
      setProduct(result.product);
      setDetailImages(result.product.images ?? []);
      setModalImages((result.product.images ?? []).map((image) => ({ ...image })));
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

  useEffect(() => {
    const nextImages = product?.images ?? [];
    setDetailImages(nextImages);
    setModalImages(nextImages.map((image) => ({ ...image })));
  }, [product?.images]);

  const primaryLocale = translation?.locales.find((item) => item.primary)?.locale ?? "";

  const loadViewTranslation = useCallback(async (nextLocale?: string) => {
    const selectedLocale = nextLocale || primaryLocale;
    if (!storeId || !productId || !selectedLocale || !primaryLocale) return;
    const requestId = ++viewTranslationRequestIdRef.current;
    setViewTranslationLoading(true);
    try {
      const params = new URLSearchParams({ locale: selectedLocale, sourceLocale: primaryLocale });
      const result = await api<ShopifyProductTranslations & { locale: string }>(
        `/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/translations?${params.toString()}`,
      );
      if (requestId !== viewTranslationRequestIdRef.current) return;
      setViewTranslation(result);
      setViewLocale(result.locale);
    } catch (error) {
      if (requestId !== viewTranslationRequestIdRef.current) return;
      onError(error);
    } finally {
      if (requestId === viewTranslationRequestIdRef.current) setViewTranslationLoading(false);
    }
  }, [onError, primaryLocale, productId, storeId]);

  const loadTranslations = useCallback(async (nextLocale?: string, nextMarketId?: string, nextSourceLocale?: string) => {
    if (!storeId || !productId) return;
    const requestId = ++translationRequestIdRef.current;
    setTranslationLoading(true);
    setTranslationDrafts([]);
    setTranslationConflict(false);
    setTranslationNotice(null);
    try {
      const params = new URLSearchParams();
      if (nextLocale) params.set("locale", nextLocale);
      if (nextSourceLocale) params.set("sourceLocale", nextSourceLocale);
      if (nextMarketId) params.set("marketId", nextMarketId);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const result = await api<ShopifyProductTranslations & { locale: string }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/translations${suffix}`);
      if (requestId !== translationRequestIdRef.current) return;
      setTranslation(result);
      setLocale(result.locale);
      setSourceLocale(result.sourceLocale);
      setMarketId(result.marketId ?? "");
      const existing = new Map(result.translations.map((item) => [`${item.resourceId}\u0000${item.key}`, item] as const));
      const isPrimaryTarget = Boolean(result.locales.find((item) => item.locale === result.locale)?.primary);
      const fields = isPrimaryTarget
        ? result.translatableContent.filter((item) => item.resourceId === productId && item.resourceType === "Product" && PRIMARY_PRODUCT_TRANSLATION_KEYS.has(item.key))
        : result.translatableContent;
      setTranslationDrafts(fields.map((item) => {
        const current = existing.get(`${item.resourceId}\u0000${item.key}`);
        return { resourceId: item.resourceId, resourceType: item.resourceType, resourceLabel: item.resourceLabel, key: item.key, sourceValue: item.value, originalValue: current?.value ?? "", value: current?.value ?? "", digest: item.digest, changed: false, outdated: current?.outdated, marketId: nextMarketId || null };
      }));
    } catch (error) {
      if (requestId !== translationRequestIdRef.current) return;
      setTranslationNotice({ type: "error", message: error instanceof Error ? error.message : "读取翻译内容失败，请重试。" });
      onError(error);
    } finally {
      if (requestId === translationRequestIdRef.current) setTranslationLoading(false);
    }
  }, [onError, productId, storeId]);

  useEffect(() => { void loadTranslations(); }, [loadTranslations]);
  useEffect(() => {
    if (!primaryLocale) return;
    if (!viewLocale || !translation?.locales.some((item) => item.locale === viewLocale)) {
      void loadViewTranslation(primaryLocale);
    }
  }, [loadViewTranslation, primaryLocale, translation?.locales, viewLocale]);
  useEffect(() => {
    setDescriptionPrompt((current) => current === DEFAULT_DESCRIPTION_PROMPT || !current.trim() ? defaultDescriptionPrompt : current);
    setTitlePrompt((current) => current === DEFAULT_TITLE_PROMPT || !current.trim() ? defaultTitlePrompt : current);
    setTranslationPrompt((current) => current === DEFAULT_TRANSLATION_PROMPT || !current.trim() ? defaultTranslationPrompt : current);
  }, [defaultDescriptionPrompt, defaultTitlePrompt, defaultTranslationPrompt]);

  useEffect(() => {
    if (!translationModalOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const focusableSelector = "button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";
    const focusDialog = window.requestAnimationFrame(() => {
      const firstControl = translationModalRef.current?.querySelector<HTMLElement>(focusableSelector);
      (firstControl ?? translationModalRef.current)?.focus();
    });

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setTranslationModalOpen(false);
        return;
      }
      if (event.key !== "Tab" || !translationModalRef.current) return;
      const controls = Array.from(translationModalRef.current.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => element.offsetParent !== null);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusDialog);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleDialogKeyDown);
      previousFocus?.focus();
    };
  }, [translationModalOpen]);

  useEffect(() => {
    if (!descriptionModalOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const focusableSelector = "button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const focusDialog = window.requestAnimationFrame(() => {
      const firstControl = descriptionModalRef.current?.querySelector<HTMLElement>(focusableSelector);
      (firstControl ?? descriptionModalRef.current)?.focus();
    });

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setDescriptionModalOpen(false);
        return;
      }
      if (event.key !== "Tab" || !descriptionModalRef.current) return;
      const controls = Array.from(descriptionModalRef.current.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => element.offsetParent !== null);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusDialog);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleDialogKeyDown);
      previousFocus?.focus();
    };
  }, [descriptionModalOpen]);

  useEffect(() => {
    if (!titleModalOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const focusableSelector = "button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";
    const focusDialog = window.requestAnimationFrame(() => {
      const firstControl = titleModalRef.current?.querySelector<HTMLElement>(focusableSelector);
      (firstControl ?? titleModalRef.current)?.focus();
    });
    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setTitleModalOpen(false);
        return;
      }
      if (event.key !== "Tab" || !titleModalRef.current) return;
      const controls = Array.from(titleModalRef.current.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => element.offsetParent !== null);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusDialog);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleDialogKeyDown);
      previousFocus?.focus();
    };
  }, [titleModalOpen]);

  const updateDraft = <K extends keyof ShopifyProductDraft>(key: K, value: ShopifyProductDraft[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };

  async function generateSeo() {
    if (!draft || !product || seoGenerating) return;
    setSeoGenerating(true);
    try {
      const result = await api<{ seoTitle: string; seoDescription: string }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(product.id)}/ai/seo`, {
        method: "POST",
        body: JSON.stringify({ storeId, productId: product.id, locale: viewLocale || undefined, targetLanguage: viewLocaleName || undefined, title: draft.title, descriptionHtml: draft.descriptionHtml, productType: draft.productType, vendor: draft.vendor, tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean), seoTitle: draft.seoTitle, seoDescription: draft.seoDescription }),
      });
      setDraft((current) => current ? { ...current, seoTitle: result.seoTitle, seoDescription: result.seoDescription } : current);
      onNotify("AI 已生成 SEO 信息，请检查后保存");
    } catch (error) {
      onError(error);
    } finally {
      setSeoGenerating(false);
    }
  }

  async function loadDescriptionModalData(keepDrafts = false) {
    if (!product || !draft) return;
    const requestId = ++descriptionRequestIdRef.current;
    setDescriptionModalOpen(true);
    setDescriptionLoading(true);
    setDescriptionCredits(null);
    if (!keepDrafts) {
      setDescriptionPrompt(defaultDescriptionPrompt);
      setDescriptionHtml(draft.descriptionHtml ?? product.descriptionHtml ?? "");
      setDescriptionSelectedImageIds([]);
      setDescriptionSource(null);
      setDescriptionPromptVersion(null);
    }
    try {
      const result = await api<ShopifyDescriptionAiContext>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(product.id)}/ai/description`);
      if (descriptionRequestIdRef.current !== requestId) return;
      setDescriptionSource(result.source);
      setDescriptionPromptVersion(result.promptVersion);
      if (!keepDrafts) {
        setDescriptionHtml(draft.descriptionHtml ?? result.product.descriptionHtml ?? "");
        setDescriptionSelectedImageIds(result.recommendedImageIds.length ? result.recommendedImageIds : (result.source?.images ?? []).slice(0, 4).map((image) => image.id));
      } else {
        setDescriptionSelectedImageIds((current) => {
          const valid = current.filter((imageId) => result.source.images.some((image) => image.id === imageId));
          return valid.length ? valid.slice(0, 4) : result.recommendedImageIds.length ? result.recommendedImageIds : (result.source.images ?? []).slice(0, 4).map((image) => image.id);
        });
      }
    } catch (error) {
      if (descriptionRequestIdRef.current !== requestId) return;
      onError(error);
    } finally {
      if (descriptionRequestIdRef.current === requestId) setDescriptionLoading(false);
    }
  }

  function openDescriptionModal() {
    if (!product) {
      onError(new Error("该商品缺少店铺信息，无法生成描述"));
      return;
    }
    void loadDescriptionModalData(false);
  }

  function refreshDescriptionSource() {
    void loadDescriptionModalData(true);
  }

  function openTitleModal() {
    if (!product || !draft) {
      onError(new Error("该商品缺少店铺信息，无法生成标题"));
      return;
    }
    setTitlePrompt(defaultTitlePrompt);
    setTitleValue(draft.title);
    setTitleSelectedImageIds((product.images ?? []).slice(0, 4).map((image) => image.id));
    setTitleCredits(null);
    setTitlePromptVersion(null);
    setTitleModalOpen(true);
  }

  function toggleTitleImage(imageId: string) {
    setTitleSelectedImageIds((current) => {
      if (current.includes(imageId)) return current.filter((id) => id !== imageId);
      if (current.length >= 4) return current;
      return [...current, imageId];
    });
  }

  async function generateTitle() {
    if (!product || !draft || !titleSelectedImageIds.length) return;
    setTitleGenerating(true);
    setTitleCredits(null);
    try {
      const selectedImageJson = titleSelectedImageIds
        .map((imageId) => product.images?.find((image) => image.id === imageId))
        .filter(Boolean);
      const prompt = applyPromptTemplate(titlePrompt.trim() || defaultTitlePrompt, {
        "Target Language": viewLocaleName || "English",
        "Product Title": draft.title,
        "Product Handle": draft.handle,
        "Product Vendor": draft.vendor,
        "Product Type": draft.productType,
        "Product Tags": draft.tags,
        "Product Description HTML": draft.descriptionHtml,
        "Product Options JSON": product.options ?? [],
        "Product Variants JSON": product.variants ?? [],
        "Selected Image Count": titleSelectedImageIds.length,
        "Selected Images JSON": selectedImageJson,
      });
      const result = await api<ShopifyTitleAiResult>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(product.id)}/ai/title`, {
        method: "POST",
        body: JSON.stringify({ storeId, productId: product.id, locale: viewLocale || undefined, targetLanguage: viewLocaleName || undefined, prompt, imageIds: titleSelectedImageIds }),
      });
      setTitleValue(result.title);
      updateDraft("title", result.title);
      setTitleCredits(result.credits);
      setTitlePromptVersion(result.promptVersion);
      onNotify(`AI 已生成商品标题，使用 ${result.imageCount} 张图片`);
    } catch (error) {
      onError(error);
    } finally {
      setTitleGenerating(false);
    }
  }

  async function saveTitle() {
    if (!product || !draft || localizedEditingDisabled || !titleValue.trim()) return;
    const nextDraft = { ...draft, title: titleValue.trim() };
    setTitleSaving(true);
    try {
      const result = await api<{ product: ShopifyRemoteProduct }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ storeId, productId: product.id, ...draftPayload(nextDraft) }),
      });
      setProduct(result.product);
      setDraft(draftFrom(result.product));
      setTitleValue(result.product.title);
      onNotify("商品标题已保存到 Shopify");
    } catch (error) {
      onError(error);
    } finally {
      setTitleSaving(false);
    }
  }

  function toggleDescriptionImage(imageId: string) {
    setDescriptionSelectedImageIds((current) => {
      if (current.includes(imageId)) return current.filter((id) => id !== imageId);
      if (current.length >= 4) return current;
      return [...current, imageId];
    });
  }

  async function generateDescription() {
    if (!product || !draft || !descriptionSource || !descriptionSelectedImageIds.length) return;
    setDescriptionGenerating(true);
    setDescriptionCredits(null);
    try {
      const selectedImageJson = descriptionSelectedImageIds
        .map((imageId) => descriptionSource.images.find((image) => image.id === imageId))
        .filter(Boolean);
      const prompt = applyPromptTemplate(descriptionPrompt.trim() || defaultDescriptionPrompt, {
        "Target Language": viewLocaleName || "English",
        "Product Title": draft.title,
        "Product Vendor": draft.vendor,
        "Product Type": draft.productType,
        "Product Tags": draft.tags,
        "Product Description HTML": draft.descriptionHtml,
        "Source Offer Id": descriptionSource.offerId,
        "Source Title": descriptionSource.title,
        "Source Supplier Name": descriptionSource.supplierName ?? "",
        "Source Brand": descriptionSource.brand ?? "",
        "Source Category": descriptionSource.category ?? "",
        "Source Short Description": descriptionSource.shortDescription ?? "",
        "1688json": descriptionSource.rawResponse ?? descriptionSource.raw,
        "1688 Properties JSON": descriptionSource.properties,
        "1688 Variants JSON": descriptionSource.variants,
        "1688 Price Tiers JSON": descriptionSource.priceTiers,
        "Selected Image Count": descriptionSelectedImageIds.length,
        "Selected Images JSON": selectedImageJson,
      });
      const result = await api<ShopifyDescriptionAiResult>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(product.id)}/ai/description`, {
        method: "POST",
        body: JSON.stringify({
          storeId,
          productId: product.id,
          locale: viewLocale || undefined,
          targetLanguage: viewLocaleName || undefined,
          prompt,
          imageIds: descriptionSelectedImageIds,
        }),
      });
      setDescriptionHtml(result.descriptionHtml);
      updateDraft("descriptionHtml", result.descriptionHtml);
      setDescriptionCredits(result.credits);
      setDescriptionPromptVersion(result.promptVersion);
      onNotify(`AI 已生成商品描述，使用 ${result.imageCount} 张图片`);
    } catch (error) {
      onError(error);
    } finally {
      setDescriptionGenerating(false);
    }
  }

  async function saveDescription() {
    if (!product || !draft || localizedEditingDisabled) return;
    const nextDraft = { ...draft, descriptionHtml };
    setDescriptionSaving(true);
    try {
      const result = await api<{ product: ShopifyRemoteProduct }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          storeId,
          productId: product.id,
          ...draftPayload(nextDraft),
        }),
      });
      setProduct(result.product);
      setDraft(draftFrom(result.product));
      setDescriptionHtml(result.product.descriptionHtml ?? descriptionHtml);
      onNotify("商品描述已保存到 Shopify");
    } catch (error) {
      onError(error);
    } finally {
      setDescriptionSaving(false);
    }
  }

  async function saveProduct(): Promise<boolean> {
    if (!draft || !product || localizedEditingDisabled) return false;
    setSaving(true);
    try {
      const replacementResults = imageResultDrafts.filter((item) => item.replacing && item.resultUrl);
      const result = await api<{ product: ShopifyRemoteProduct; uploadedImages?: Array<{ sourceUrl: string; image: ShopifyRemoteImage }> }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          storeId,
          productId: product.id,
          ...draftPayload(draft),
          mediaSelectionActive,
          mediaIds: (product.images ?? []).flatMap((image) => image.mediaId && mediaSelectionDraft.includes(image.id) ? [image.mediaId] : []),
          mediaReplacementSourceIds: mediaSelectionActive ? replacementResults.flatMap((item) => { const image = product.images?.find((candidate) => candidate.id === item.imageId); return image?.mediaId ? [image.mediaId] : []; }) : [],
          mediaUrls: imageJobs
            .filter((job) => mediaSelectionDraft.includes(job.id) && job.status === "queued" && job.resultUrl && !(product.images ?? []).some((image) => image.url === job.resultUrl))
            .map((job) => job.resultUrl),
        }),
      });
      const uploadedBySourceUrl = new Map((result.uploadedImages ?? []).map((item) => [item.sourceUrl, item.image]));
      const replacements = new Map(replacementResults.map((item) => [item.imageId, item.resultUrl ? uploadedBySourceUrl.get(item.resultUrl) : undefined]));
      const uploadedReplacementIds = new Set([...replacements.values()].filter((image): image is ShopifyRemoteImage => Boolean(image)).map((image) => image.id));
      const updatedImages = (result.product.images ?? []).reduce<ShopifyRemoteImage[]>((images, image) => {
        const replacement = replacements.get(image.id);
        if (replacement) {
          images.push({ ...replacement, position: images.length });
        } else if (!uploadedReplacementIds.has(image.id)) {
          images.push({ ...image, position: images.length });
        }
        return images;
      }, []);
      const updatedProduct = { ...result.product, images: updatedImages };
      setProduct(updatedProduct);
      setDetailImages(updatedImages);
      setModalImages(updatedImages.map((image) => ({ ...image })));
      setDraft(draftFrom(result.product));
      setMediaSelectionActive(false);
      setMediaSelectionDraft([]);
      onNotify("商品已保存到 Shopify");
      return true;
    } catch (error) {
      onError(error);
      return false;
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
    if (!locale || !translationDrafts.length || locale === sourceLocale) {
      setTranslationNotice({ type: "error", message: "请选择与原文不同的目标语言。" });
      return;
    }
    setAiLoading(true);
    setTranslationNotice(null);
    setTranslationBatchProgress({ current: 0, total: Math.ceil(translationDrafts.length / 32) });
    try {
      const generated: ShopifyTranslationDraft[] = [];
      for (let index = 0; index < translationDrafts.length; index += 32) {
        const batch = translationDrafts.slice(index, index + 32);
        const prompt = applyPromptTemplate(translationPrompt.trim() || defaultTranslationPrompt, {
          "Target Language": targetLocaleName || locale,
          "Target Locale": locale,
          "Source Locale": sourceLocale,
          "Market Id": marketId,
          "Market Name": targetMarketName,
          "Product Title": draft?.title ?? product?.title ?? "",
          "Product Vendor": draft?.vendor ?? product?.vendor ?? "",
          "Product Type": draft?.productType ?? product?.productType ?? "",
          "Product Tags": draft?.tags ?? product?.tags.join(", ") ?? "",
          "Product Description HTML": draft?.descriptionHtml ?? product?.descriptionHtml ?? "",
          "Field Count": batch.length,
          "Fields JSON": batch,
          "Translation Style": translationStyle,
          "Glossary": translationGlossary,
        });
        const result = await api<{ translations: ShopifyTranslationDraft[] }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/translations/ai`, {
          method: "POST",
          body: JSON.stringify({ storeId, productId, locale, targetLanguage: targetLocaleName || locale, sourceLocale: sourceLocale || undefined, marketId: marketId || undefined, prompt, style: translationStyle, glossary: translationGlossary, fields: batch.map((field) => ({ resourceId: field.resourceId, resourceType: field.resourceType, resourceLabel: field.resourceLabel, key: field.key, sourceLocale: sourceLocale || undefined, sourceValue: field.sourceValue, existingValue: field.value || undefined, digest: field.digest })) }),
        });
        generated.push(...result.translations);
        setTranslationBatchProgress({ current: Math.min(Math.floor(index / 32) + 1, Math.ceil(translationDrafts.length / 32)), total: Math.ceil(translationDrafts.length / 32) });
      }
      const generatedByKey = new Map(generated.map((field) => [`${field.resourceId}\u0000${field.key}`, field] as const));
      setTranslationDrafts(translationDrafts.map((field) => {
        const generatedField = generatedByKey.get(`${field.resourceId}\u0000${field.key}`);
        return generatedField ? { ...generatedField, originalValue: field.originalValue, changed: generatedField.value !== field.originalValue, marketId: marketId || null } : field;
      }));
      onNotify("AI 已生成翻译草稿，请检查后发布");
      setTranslationNotice({ type: "success", message: `已生成 ${generated.length} 个翻译草稿，请检查目标语言内容后发布。` });
    } catch (error) {
      setTranslationNotice({ type: "error", message: error instanceof Error ? `AI 翻译失败：${error.message}` : "AI 翻译失败，请重试。" });
      onError(error);
    } finally {
      setAiLoading(false);
      setTranslationBatchProgress(null);
    }
  }

  async function publishTranslations() {
    const changed = translationDrafts.filter((field) => field.changed);
    if (!locale || !changed.length) return;
    const isPrimaryTarget = Boolean(translation?.locales.find((item) => item.locale === locale)?.primary);
    if (isPrimaryTarget) {
      await updatePrimaryProductFromTranslations(changed);
      return;
    }
    const matchingHandle = changed.find((field) => field.key === "handle" && field.value.trim() && field.value.trim().toLowerCase() === field.sourceValue.trim().toLowerCase());
    if (matchingHandle) {
      const error = new Error("多语言 Handle 不能与默认 Handle 一致，请填写一个未占用的目标语言 Handle");
      setTranslationNotice({ type: "error", message: error.message });
      onError(error);
      return;
    }
    setPublishLoading(true);
    setTranslationNotice(null);
    try {
      for (let index = 0; index < changed.length; index += 250) {
        const batch = changed.slice(index, index + 250);
        await api(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/translations`, {
          method: "PUT",
          body: JSON.stringify({ storeId, productId, locale, translations: batch.map((field) => ({ resourceId: field.resourceId, key: field.key, value: field.value, translatableContentDigest: field.digest, marketId: marketId || undefined })) }),
        });
      }
      onNotify("翻译已发布到 Shopify");
      await loadTranslations(locale, marketId, sourceLocale);
      if (viewLocale === locale) await loadViewTranslation(viewLocale);
      setTranslationNotice({ type: "success", message: `已发布 ${changed.length} 个字段到 Shopify。` });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) {
        setTranslationConflict(true);
        setTranslationNotice({ type: "error", message: "Shopify 内容已更新，请重新读取并保留当前草稿后再发布。" });
        return;
      }
      setTranslationNotice({ type: "error", message: error instanceof Error ? `发布失败：${error.message}` : "发布失败，请重试。" });
      onError(error);
    } finally {
      setPublishLoading(false);
    }
  }

  async function publishCurrentLanguage() {
    if (!viewLocale || viewTranslationLoading || publishLoading) return;
    if (viewLocale === primaryLocale) {
      await saveProduct();
      return;
    }
    await loadTranslations(viewLocale, "", primaryLocale);
    setTranslationModalOpen(true);
  }

  async function updatePrimaryProductFromTranslations(changed: ShopifyTranslationDraft[]) {
    if (!draft || !product) return;
    const unsupported = changed.filter((field) => field.resourceId !== product.id || field.resourceType !== "Product" || !PRIMARY_PRODUCT_TRANSLATION_KEYS.has(field.key));
    if (unsupported.length) {
      onError(new Error("主语言仅支持修改 title、body_html、handle、product_type、meta_title、meta_description"));
      return;
    }

    const nextDraft = { ...draft };
    const unsupportedKeys: string[] = [];
    for (const field of changed) {
      switch (field.key) {
        case "title":
          nextDraft.title = field.value;
          break;
        case "body_html":
          nextDraft.descriptionHtml = field.value;
          break;
        case "handle":
          nextDraft.handle = field.value;
          break;
        case "product_type":
          nextDraft.productType = field.value;
          break;
        case "meta_title":
          nextDraft.seoTitle = field.value;
          break;
        case "meta_description":
          nextDraft.seoDescription = field.value;
          break;
        default:
          unsupportedKeys.push(field.key);
      }
    }
    if (unsupportedKeys.length) {
      onError(new Error(`主语言商品信息暂不支持修改字段：${[...new Set(unsupportedKeys)].join("、")}，请在商品编辑区修改`));
      return;
    }
    if (!nextDraft.title.trim()) {
      onError(new Error("商品标题不能为空"));
      return;
    }

    setPublishLoading(true);
    try {
      const result = await api<{ product: ShopifyRemoteProduct }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ storeId, productId: product.id, ...draftPayload(nextDraft) }),
      });
      setProduct(result.product);
      setDraft(draftFrom(result.product));
      onNotify("主语言商品信息已修改");
      await loadTranslations(locale, marketId, sourceLocale);
      setTranslationNotice({ type: "success", message: `已修改 ${changed.length} 个主语言字段，商品信息已同步到 Shopify。` });
    } catch (error) {
      onError(error);
    } finally {
      setPublishLoading(false);
    }
  }

  async function reloadTranslationSourceKeepingDraft() {
    const savedDrafts = translationDrafts;
    await loadTranslations(locale, marketId, sourceLocale);
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
    const prompt = applyPromptTemplate(imagePrompt.trim() || DEFAULT_IMAGE_TRANSLATION_PROMPT, {
      "Product Title": product?.title ?? "",
      "Product Vendor": product?.vendor ?? "",
      "Product Type": product?.productType ?? "",
      "Selected Image Count": String(images.length),
      "Selected Image IDs": images.map((image) => image.id).join(", "),
      "Target Language": targetLocaleName || targetLocale,
      "Target Locale": targetLocale,
    });
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
    setImageResultDrafts((current) => [
      ...current.filter((item) => !jobs.some((job) => job.id === item.id)),
      ...jobs.map((job, index) => ({ ...job, sourceUrl: images[index].url })),
    ]);
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
    setImageResultDrafts((current) => current.map((item) => {
      const next = nextJobs.find((job) => job.id === item.id);
      return next ? { ...item, ...next } : item;
    }));
    await Promise.all(nextJobs.filter((item) => jobs.some((job) => job.id === item.id)).map((item) => api(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-jobs/${encodeURIComponent(item.id)}`, { method: "PATCH", body: JSON.stringify({ storeId, productId, status: item.status, resultUrl: item.resultUrl ?? null, message: item.message ?? null, prompt: item.prompt ?? null }) })));
    setImageJobs(nextJobs);
    setSelectedImages([]);
    setImageAiStep("edit");
    onNotify(failedCount ? `${successCount} 张图片翻译成功，${failedCount} 张失败` : `${successCount} 张图片翻译完成`);
  }

  function openImageAiModal() {
    imageModalInitialMediaSelectionRef.current = { active: mediaSelectionActive, ids: [...mediaSelectionDraft] };
    setSelectedImages([]);
    setImageTaskMode("edit");
    setImageAiStep("select");
    setImageAnalysis("");
    setImagePrompt(defaultImagePrompt);
    setImageAnalysisDrafts([]);
    setImageResultDrafts([]);
    setImageModalSaving(false);
    setImagePreviewState(null);
    setImageCompareState(null);
    setAiImageModalOpen(true);
  }

  function closeImageAiModal() {
    if (imageModalSaving || imageAiStep === "generating") return;
    const initialSelection = imageModalInitialMediaSelectionRef.current;
    if (initialSelection) {
      setMediaSelectionActive(initialSelection.active);
      setMediaSelectionDraft(initialSelection.ids);
    }
    imageModalInitialMediaSelectionRef.current = null;
    setAiImageModalOpen(false);
    setImageAnalysisDrafts([]);
    setImageResultDrafts([]);
    setImagePreviewState(null);
    setImageCompareState(null);
  }

  function replaceImageWithResult(result: ImageResultDraft) {
    if (!result.resultUrl) return;
    const currentIds = media.map((image) => image.id);
    setMediaSelectionActive(true);
    setMediaSelectionDraft((current) => {
      const base = current.length ? current : currentIds;
      const siblingJobIds = imageResultDrafts.filter((item) => item.imageId === result.imageId && item.id !== result.id).map((item) => item.id);
      return [...base.filter((id) => id !== result.imageId && id !== result.id && !siblingJobIds.includes(id)), result.id];
    });
    setImageResultDrafts((current) => current.map((item) => item.imageId === result.imageId ? { ...item, replacing: item.id === result.id } : item));
  }

  function discardImageResult(jobId: string) {
    setImageResultDrafts((current) => current.map((item) => item.id === jobId ? { ...item, discarded: true, replacing: false } : item));
    setMediaSelectionDraft((current) => {
      if (!current.includes(jobId)) return current;
      const discardedResult = imageResultDrafts.find((item) => item.id === jobId);
      return [...current.filter((id) => id !== jobId), ...(discardedResult && !current.includes(discardedResult.imageId) ? [discardedResult.imageId] : [])];
    });
  }

  async function retryImageResult(result: ImageResultDraft) {
    const image = media.find((item) => item.id === result.imageId);
    if (!image || !result.prompt) return;
    setImageResultDrafts((current) => current.map((item) => item.id === result.id ? { ...item, status: "waiting", message: null, replacing: false } : item));
    try {
      const updated = await api<{ imageUrl: string | null; prompt: string }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-edit`, {
        method: "POST",
        body: JSON.stringify({ storeId, productId, imageId: image.id, imageUrl: image.url, prompt: result.prompt, jobId: result.id }),
      });
      await api(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-jobs/${encodeURIComponent(result.id)}`, { method: "PATCH", body: JSON.stringify({ storeId, productId, status: "queued", resultUrl: updated.imageUrl, message: null, prompt: updated.prompt || result.prompt }) });
      setImageJobs((current) => current.map((item) => item.id === result.id ? { ...item, status: "queued", resultUrl: updated.imageUrl, message: null, prompt: updated.prompt || result.prompt } : item));
      setImageResultDrafts((current) => current.map((item) => item.id === result.id ? { ...item, status: "queued", resultUrl: updated.imageUrl, message: null, prompt: updated.prompt || result.prompt, discarded: false } : item));
    } catch (error) {
      setImageResultDrafts((current) => current.map((item) => item.id === result.id ? { ...item, status: "failed", message: error instanceof Error ? error.message : "生成失败", replacing: false } : item));
      onError(error);
    }
  }

  async function saveImageModalDraft() {
    if (!mediaSelectionActive) {
      closeImageAiModal();
      return;
    }
    setImageModalSaving(true);
    try {
      if (await saveProduct()) {
        imageModalInitialMediaSelectionRef.current = null;
        setAiImageModalOpen(false);
        setImageResultDrafts([]);
      }
    } finally {
      setImageModalSaving(false);
    }
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
    const images = selectedImages.flatMap((imageId) => {
      const image = media.find((item) => item.id === imageId);
      return image ? [image] : [];
    });
    if (!images.length) return;
    const batchId = `${Date.now()}`;
    const drafts: ImageAnalysisDraft[] = images.map((image, index) => ({ id: `${batchId}-${index}-${image.id}`, imageId: image.id, sourceUrl: image.url, status: "analyzing" }));
    setFocusedImageId(images[0].id);
    setImageAnalysis("");
    setImageAnalysisDrafts(drafts);
    setImageAiStep("analyzing");
    const results = await Promise.allSettled(images.map((image) => api<{ prompt: string; analysis: string }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-analyze`, { method: "POST", body: JSON.stringify({ storeId, productId, imageId: image.id, imageUrl: image.url }) })));
    const firstSuccess = results.find((result): result is PromiseFulfilledResult<{ prompt: string; analysis: string }> => result.status === "fulfilled");
    const firstAnalysis = firstSuccess?.value.analysis || "";
    setImageAnalysisDrafts((current) => current.map((draft, index) => {
      const result = results[index];
      if (result.status === "fulfilled") {
        return { ...draft, status: "ready", prompt: result.value.prompt, analysis: result.value.analysis };
      }
      return { ...draft, status: "failed", failedStage: "analysis", message: result.reason instanceof Error ? result.reason.message : "图片分析失败" };
    }));
    setImageAnalysis(firstAnalysis);
    setImageAiStep("edit");
    const failedCount = results.filter((result) => result.status === "rejected").length;
    if (failedCount) onNotify(`${images.length - failedCount} 张图片分析完成，${failedCount} 张失败`);
  }

  async function generateAnalyzedImage(draft: ImageAnalysisDraft) {
    if (draft.status !== "ready" || !draft.prompt) return;
    const image = media.find((item) => item.id === draft.imageId);
    if (!image) return;
    const job: ImageJob = { id: `${Date.now()}-${draft.imageId}`, imageId: image.id, operation: "edit", locale: "", status: "waiting", createdAt: Date.now(), updatedAt: Date.now(), prompt: draft.prompt };
    try {
      const created = await api<{ jobs: ImageJob[] }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-jobs`, { method: "POST", body: JSON.stringify({ storeId, productId, jobs: [job] }) });
      setImageJobs(created.jobs);
      setImageAiStep("generating");
      setImageAnalysisDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, status: "generating", message: "正在生成图片" } : item));
      const result = await api<{ imageUrl: string | null; prompt: string }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-edit`, { method: "POST", body: JSON.stringify({ storeId, productId, imageId: image.id, imageUrl: image.url, prompt: draft.prompt, jobId: job.id }) });
      const completed = { ...job, status: "queued" as const, updatedAt: Date.now(), resultUrl: result.imageUrl, prompt: result.prompt || draft.prompt };
      setImageJobs((current) => current.map((item) => item.id === job.id ? completed : item));
      setImageResultDrafts((current) => [...current.filter((item) => item.id !== job.id), { ...completed, sourceUrl: image.url }]);
      setImageAnalysisDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, status: "ready", failedStage: undefined, message: "已生成" } : item));
      await api(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-jobs/${encodeURIComponent(job.id)}`, { method: "PATCH", body: JSON.stringify({ storeId, productId, status: "queued", resultUrl: result.imageUrl, message: null, prompt: result.prompt || draft.prompt }) });
      onNotify("图片生成完成");
    } catch (error) {
      setImageAnalysisDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, status: "failed", failedStage: "generation", message: error instanceof Error ? error.message : "图片生成失败" } : item));
      onError(error);
    } finally {
      setImageAiStep("edit");
    }
  }

  async function retryImageAnalysis(draft: ImageAnalysisDraft) {
    if (draft.failedStage === "generation") {
      const readyDraft = { ...draft, status: "ready" as const, failedStage: undefined, message: undefined };
      setImageAnalysisDrafts((current) => current.map((item) => item.id === draft.id ? readyDraft : item));
      await generateAnalyzedImage(readyDraft);
      return;
    }
    const image = media.find((item) => item.id === draft.imageId);
    if (!image) return;
    setImageAnalysisDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, status: "analyzing", message: undefined } : item));
    try {
      const result = await api<{ prompt: string; analysis: string }>(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-analyze`, { method: "POST", body: JSON.stringify({ storeId, productId, imageId: image.id, imageUrl: image.url }) });
      setImageAnalysisDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, status: "ready", prompt: result.prompt, analysis: result.analysis, message: undefined } : item));
    } catch (error) {
      setImageAnalysisDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, status: "failed", failedStage: "analysis", message: error instanceof Error ? error.message : "图片分析失败" } : item));
      onError(error);
    }
  }

  async function generateImageTask() {
    const images = selectedImages.flatMap((imageId) => {
      const image = media.find((item) => item.id === imageId);
      return image ? [image] : [];
    });
    const prompt = applyPromptTemplate(imagePrompt.trim(), {
      "Product Title": product?.title ?? "",
      "Product Vendor": product?.vendor ?? "",
      "Product Type": product?.productType ?? "",
      "Selected Image Count": String(images.length),
      "Selected Image IDs": images.map((image) => image.id).join(", "),
      "Target Language": targetLocaleName || locale,
      "Target Locale": locale,
    });
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
    setImageResultDrafts((current) => [
      ...current.filter((item) => !jobs.some((job) => job.id === item.id)),
      ...jobs.map((job, index) => ({ ...job, ...(nextJobs.find((item) => item.id === job.id) ?? {}), sourceUrl: images[index].url })),
    ]);
    await Promise.all(nextJobs.filter((item) => jobs.some((job) => job.id === item.id)).map((item) => api(`/api/shopify/stores/${storeId}/products/${encodeURIComponent(productId)}/ai/image-jobs/${encodeURIComponent(item.id)}`, { method: "PATCH", body: JSON.stringify({ storeId, productId, status: item.status, resultUrl: item.resultUrl ?? null, message: item.message ?? null, prompt: item.prompt ?? null }) })));
    setImageJobs(nextJobs);
    setSelectedImages([]);
    setImageAiStep("edit");
    onNotify(failedCount ? `${successCount} 张图片生成成功，${failedCount} 张失败` : `${successCount} 张图片 AI 修改任务已生成`);
  }

  const media = detailImages;
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
  const viewLanguage = translation?.locales.find((item) => item.locale === viewLocale);
  const viewLocaleName = viewLanguage?.name ?? viewLocale;
  const localizedEditingDisabled = Boolean(viewLocale && primaryLocale && viewLocale !== primaryLocale);
  const displayDraft = draft && product
    ? projectDraftToLocale(draft, product.id, localizedEditingDisabled ? viewTranslation : null)
    : draft;
  const targetLocaleName = translation?.locales.find((item) => item.locale === locale)?.name ?? locale;
  const targetMarketName = marketId ? translation?.markets.find((item) => item.id === marketId)?.name ?? marketId : "默认市场";
  const hasTranslationChanges = translationDrafts.some((field) => field.changed);
  const isPrimaryTarget = Boolean(translation?.locales.find((item) => item.locale === locale)?.primary);
  const targetHandle = translationDrafts.find((field) => field.resourceId === product?.id && field.key === "handle")?.value ?? (isPrimaryTarget ? draft?.handle ?? "" : "");
  const translationPreviewUrl = store?.shopDomain && targetHandle.trim()
    ? `https://${store.shopDomain}${isPrimaryTarget ? "" : `/${encodeURIComponent(locale)}`}/products/${encodeURIComponent(targetHandle.trim())}`
    : null;

  return (
    <section className="shopify-editor-page">
      <header className="shopify-editor-page-header">
        <button className="button quiet" type="button" onClick={() => onBack(returnPath)}><ArrowLeft size={16} />返回商品列表</button>
        <div className="shopify-editor-title"><span>SHOPIFY PRODUCT</span><h1>{loading ? "加载商品" : displayDraft?.title || product?.title || "商品详情"}</h1><small>{store?.shopDomain || store?.displayName || storeId}</small></div>
        <div className="shopify-editor-header-actions">
          <span className={`shopify-status ${(draft?.status || "draft").toLowerCase()}`}><i />{currentStatus}</span>
          <button className="button primary" type="button" onClick={() => void saveProduct()} disabled={saving || loading || !draft || localizedEditingDisabled}><Save size={15} />{saving ? "保存中" : "保存"}</button>
        </div>
      </header>

      {loading || !draft || !product ? <div className="page-loading shopify-editor-loading"><LoaderCircle className="spin" size={22} />正在读取商品详情</div> : <div className="shopify-editor-page-grid">
        <main className="shopify-editor-main">
          <section className="shopify-editor-card">
            <div className="editor-section-heading">
              <div><span>GENERAL</span><h2>基本信息</h2></div>
              <div className="editor-section-actions">
                <button className="button quiet compact" type="button" onClick={() => void openDescriptionModal()} disabled={!product || !draft || localizedEditingDisabled}><Sparkles size={14} />AI 生成描述</button>
                <button className="button quiet compact" type="button" onClick={openTitleModal} disabled={!product || !draft || localizedEditingDisabled}><Sparkles size={14} />AI 生成标题</button>
              </div>
            </div>
            <label><span>标题</span><input value={displayDraft?.title ?? ""} onChange={(event) => updateDraft("title", event.target.value)} disabled={localizedEditingDisabled} /></label>
            <label><span>描述 HTML</span><DescriptionEditor value={displayDraft?.descriptionHtml ?? ""} onChange={(value) => updateDraft("descriptionHtml", value)} readOnly={localizedEditingDisabled} /></label>
            <div className="editor-two-columns"><label><span>Handle</span><input value={displayDraft?.handle ?? ""} onChange={(event) => updateDraft("handle", event.target.value)} disabled={localizedEditingDisabled} /></label><label><span>供应商</span><input value={displayDraft?.vendor ?? ""} onChange={(event) => updateDraft("vendor", event.target.value)} disabled={localizedEditingDisabled} /></label><label><span>商品类型</span><input value={displayDraft?.productType ?? ""} onChange={(event) => updateDraft("productType", event.target.value)} disabled={localizedEditingDisabled} /></label><label><span>模板后缀</span><input value={displayDraft?.templateSuffix ?? ""} onChange={(event) => updateDraft("templateSuffix", event.target.value)} placeholder="默认模板" disabled={localizedEditingDisabled} /></label></div>
            <label><span>标签</span><input value={displayDraft?.tags ?? ""} onChange={(event) => updateDraft("tags", event.target.value)} placeholder="用逗号分隔" disabled={localizedEditingDisabled} /></label>
          </section>

          <section className="shopify-editor-card"><div className="editor-section-heading"><div><span>VARIANTS</span><h2>变体与库存</h2></div><small>{draft.variants.length} 个变体</small></div><div className="shopify-variant-editor"><div className="shopify-variant-row header"><span>变体</span><span>价格</span><span>对比价</span><span>SKU</span><span>条码</span><span>库存</span></div>{draft.variants.map((variant, index) => <div className="shopify-variant-row" key={variant.id}><strong>{variant.title}</strong><input value={variant.price} disabled={localizedEditingDisabled} onChange={(event) => setDraft({ ...draft, variants: draft.variants.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value } : item) })} /><input value={variant.compareAtPrice} disabled={localizedEditingDisabled} onChange={(event) => setDraft({ ...draft, variants: draft.variants.map((item, itemIndex) => itemIndex === index ? { ...item, compareAtPrice: event.target.value } : item) })} /><input value={variant.sku} disabled={localizedEditingDisabled} onChange={(event) => setDraft({ ...draft, variants: draft.variants.map((item, itemIndex) => itemIndex === index ? { ...item, sku: event.target.value } : item) })} /><input value={variant.barcode} disabled={localizedEditingDisabled} onChange={(event) => setDraft({ ...draft, variants: draft.variants.map((item, itemIndex) => itemIndex === index ? { ...item, barcode: event.target.value } : item) })} /><span>{variant.inventoryQuantity ?? 0}</span></div>)}</div></section>

          <section className="shopify-editor-card"><div className="editor-section-heading"><div><span>SEO</span><h2>搜索引擎预览</h2></div><button className="button quiet compact" type="button" onClick={() => void generateSeo()} disabled={seoGenerating || localizedEditingDisabled}><Sparkles size={14} />{seoGenerating ? "生成中" : "AI 生成 SEO"}</button></div><label><span>SEO 标题</span><input value={displayDraft?.seoTitle ?? ""} onChange={(event) => updateDraft("seoTitle", event.target.value)} placeholder="不填写则使用商品标题" disabled={localizedEditingDisabled} /></label><label><span>SEO 描述</span><textarea rows={4} value={displayDraft?.seoDescription ?? ""} onChange={(event) => updateDraft("seoDescription", event.target.value)} disabled={localizedEditingDisabled} /></label><div className="seo-preview"><strong>{displayDraft?.seoTitle || displayDraft?.title}</strong><span>{store?.shopDomain}/{displayDraft?.handle}</span><p>{displayDraft?.seoDescription || "Shopify 会使用商品描述生成搜索摘要。"}</p></div></section>

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
          <section className="shopify-editor-card current-language-card">
            <div className="editor-section-heading"><div><span>CURRENT LANGUAGE</span><h2><Languages size={17} />当前语言</h2></div><span className="translation-card-state">{viewLocaleName || "读取中"}</span></div>
            <div className="current-language-summary">
              <select className="current-language-select" value={viewLocale} onChange={(event) => void loadViewTranslation(event.target.value)} disabled={viewTranslationLoading || !translation?.locales.length} aria-label="Current language">
                {translation?.locales.map((item) => <option key={item.locale} value={item.locale}>{item.name} ({item.locale})</option>)}
              </select>
              <strong>{viewLocaleName || "读取中"}</strong>
              <code>{viewLocale || "—"}</code>
              <span>{viewTranslationLoading ? "正在读取当前语言内容" : localizedEditingDisabled ? "当前语言为只读预览，可发布该语言文案" : "当前为商品主语言，可直接编辑并保存"}</span>
            </div>
            <button className="button primary translation-open-button" type="button" onClick={() => void publishCurrentLanguage()} disabled={viewTranslationLoading || loading || saving || publishLoading || !viewLocale}>
              {viewTranslationLoading || saving || publishLoading ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}
              {viewTranslationLoading ? "读取中" : saving ? "保存中" : publishLoading ? "发布中" : viewLocale === primaryLocale ? "发布当前语言" : "发布当前语言文案"}
            </button>
          </section>
          <section className="shopify-editor-card translation-card">
            <div className="editor-section-heading"><div><span>LOCALIZATION</span><h2><Languages size={17} />多语言翻译</h2></div><span className={`translation-card-state ${hasTranslationChanges ? "changed" : ""}`}>{hasTranslationChanges ? (isPrimaryTarget ? "有商品修改" : "有未发布修改") : `${translationDrafts.length} 个字段`}</span></div>
            <p className="translation-target">{targetMarketName} · 提示词、AI 翻译和双语内容已移至弹窗工作区。</p>
            <button className="button primary translation-open-button" type="button" onClick={() => setTranslationModalOpen(true)} disabled={translationLoading && !translation}><Languages size={15} />{translationLoading && !translation ? "正在读取翻译" : "打开翻译工作区"}</button>
          </section>
          <section className="shopify-editor-card publishing-card"><div className="editor-section-heading"><div><span>PUBLISHING</span><h2>发布状态</h2></div></div><label><span>状态</span><select value={draft.status} onChange={(event) => updateDraft("status", event.target.value as ShopifyProductDraft["status"])}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="button danger-text" type="button" onClick={() => void deleteProduct()} disabled={deleting}><Trash2 size={15} />{deleting ? "删除中" : "删除商品"}</button></section>
        </aside>
      </div>}
      <ShopifyDescriptionModal
        open={descriptionModalOpen}
        loading={descriptionLoading}
        saving={descriptionSaving}
        generating={descriptionGenerating}
        modalRef={descriptionModalRef}
        product={product}
        source={descriptionSource}
        prompt={descriptionPrompt}
        html={descriptionHtml}
        selectedImageIds={descriptionSelectedImageIds}
        credits={descriptionCredits}
        promptVersion={descriptionPromptVersion}
        onClose={() => setDescriptionModalOpen(false)}
        onPromptChange={setDescriptionPrompt}
        onHtmlChange={setDescriptionHtml}
        onSelectImage={toggleDescriptionImage}
        defaultPrompt={defaultDescriptionPrompt}
        onResetPrompt={() => setDescriptionPrompt(defaultDescriptionPrompt)}
        onGenerate={() => void generateDescription()}
        onSave={() => void saveDescription()}
        onRefreshSource={refreshDescriptionSource}
      />
      <ShopifyTitleModal
        open={titleModalOpen}
        generating={titleGenerating}
        saving={titleSaving}
        modalRef={titleModalRef}
        product={product}
        prompt={titlePrompt}
        defaultPrompt={defaultTitlePrompt}
        title={titleValue}
        selectedImageIds={titleSelectedImageIds}
        credits={titleCredits}
        promptVersion={titlePromptVersion}
        onClose={() => setTitleModalOpen(false)}
        onPromptChange={setTitlePrompt}
        onTitleChange={(value) => { setTitleValue(value); updateDraft("title", value); }}
        onSelectImage={toggleTitleImage}
        onResetPrompt={() => setTitlePrompt(defaultTitlePrompt)}
        onGenerate={() => void generateTitle()}
        onSave={() => void saveTitle()}
      />
      {translationModalOpen && product ? <div className="modal-backdrop translation-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setTranslationModalOpen(false)}>
        <section ref={translationModalRef} className="translation-modal" role="dialog" aria-modal="true" aria-labelledby="translation-modal-title" aria-describedby="translation-modal-description" tabIndex={-1}>
          <header className="modal-header"><div><span>PRODUCT LOCALIZATION</span><h2 id="translation-modal-title">多语言翻译</h2></div><button className="icon-button" type="button" onClick={() => setTranslationModalOpen(false)} aria-label="关闭多语言翻译" title="关闭"><X size={19} /></button></header>
          <div className="translation-modal-body" aria-busy={translationLoading}>
            <p id="translation-modal-description" className="translation-modal-intro">选择目标语言，按需要调整提示词，再对照源内容检查 AI 翻译草稿。目标语言为主语言时，提交会直接修改商品信息。</p>
            {translationNotice ? <div className={`translation-notice ${translationNotice.type}`} role={translationNotice.type === "error" ? "alert" : "status"} aria-live="polite"><span>{translationNotice.message}</span><button className="icon-button" type="button" onClick={() => setTranslationNotice(null)} aria-label="关闭提示" title="关闭提示"><X size={14} /></button></div> : null}
            <div className="translation-language-flow">
              <div className="translation-language-card target"><label htmlFor="translation-target-locale">目标语言</label><select id="translation-target-locale" value={locale} onChange={(event) => { setLocale(event.target.value); setMarketId(""); void loadTranslations(event.target.value, "", sourceLocale); }} disabled={translationLoading}>{translation?.locales.filter((item) => item.locale !== sourceLocale).map((item) => <option key={item.locale} value={item.locale}>{item.name} ({item.locale}){item.primary ? " · 主语言" : item.published ? "" : " · 未发布"}</option>)}</select><small>{targetLocaleName || "选择翻译语言"}{translation?.locales.find((item) => item.locale === locale)?.primary ? " · 主语言可作为查看目标" : ""}</small></div>
            </div>

            <section className="translation-modal-section translation-prompt-section">
              <div className="translation-modal-section-heading"><div><span>CUSTOM INSTRUCTIONS</span><h3>自定义提示词</h3></div><button className="button quiet compact" type="button" onClick={() => setTranslationPrompt(DEFAULT_TRANSLATION_PROMPT)} disabled={translationPrompt === DEFAULT_TRANSLATION_PROMPT}>恢复默认</button></div>
              <label className="translation-prompt-field"><span>本次翻译要求</span><textarea value={translationPrompt} onChange={(event) => setTranslationPrompt(event.target.value)} rows={4} maxLength={8_000} placeholder="例如：翻译成法国市场自然、简洁的法语；品牌名保持英文；语气偏高端。" /><small>可以定义语气、市场、品牌词和不应翻译的内容；留空时使用系统默认规则。</small></label>
              <details className="translation-options">
                <summary>更多 AI 翻译偏好</summary>
                <div className="translation-option-grid"><label><span>文案风格</span><select value={translationStyle} onChange={(event) => setTranslationStyle(event.target.value)}><option value="自然、清晰、符合目标市场电商习惯">自然电商</option><option value="简洁、克制、偏高端品牌表达">简洁高端</option><option value="亲切、有活力、适合社交电商表达">亲切活力</option><option value="专业、准确、突出规格与使用信息">专业说明</option></select></label><label><span>术语表</span><textarea rows={3} value={translationGlossary} onChange={(event) => setTranslationGlossary(event.target.value)} placeholder="例如：AirFlex 保持英文；连衣裙 = dress" /></label></div>
              </details>
              <label className="translation-market-field"><span>目标市场</span><select value={marketId} onChange={(event) => { setMarketId(event.target.value); void loadTranslations(locale, event.target.value, sourceLocale); }} disabled={translationLoading || !translation?.markets.length}><option value="">默认市场</option>{translation?.markets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              {translation?.missingScopes.includes("read_markets") ? <p className="translation-scope-note">当前应用缺少 read_markets 权限，默认市场翻译可正常使用；添加权限后可选择 Shopify Market。</p> : null}
            </section>

            <section className="translation-modal-section translation-content-section">
              <div className="translation-modal-section-heading"><div><span>BILINGUAL CONTENT</span><h3>两种语言的内容</h3></div><div className="translation-content-meta">{translationBatchProgress ? <span className="translation-batch-progress-label">正在翻译第 {translationBatchProgress.current} / {translationBatchProgress.total} 批</span> : null}<span className="translation-field-count">{translationDrafts.length} 个字段</span></div></div>
              {translationBatchProgress ? <div className="translation-batch-progress" role="status" aria-live="polite"><div><span>AI 翻译处理中</span><strong>{translationBatchProgress.current} / {translationBatchProgress.total}</strong></div><progress value={translationBatchProgress.current} max={translationBatchProgress.total}>第 {translationBatchProgress.current} / {translationBatchProgress.total} 批</progress></div> : null}
              {translationConflict ? <div className="translation-conflict" role="alert"><strong>Shopify 内容已更新</strong><span>重新读取会保留你当前草稿，并刷新字段版本。</span><button className="button quiet compact" type="button" onClick={() => void reloadTranslationSourceKeepingDraft()} disabled={translationLoading}><RefreshCw size={14} />重新读取并保留草稿</button></div> : null}
              <div className="translation-content-legend" aria-hidden="true"><span>原文</span><span>{targetLocaleName || "目标语言"}</span></div>
              <div className="translation-fields">{translationDrafts.length ? translationDrafts.map((field) => {
                const rows = field.key.includes("body") || field.key.includes("description") ? 8 : 3;
                return <article key={`${field.resourceId}:${field.key}`} className={`translation-field-row ${field.outdated ? "is-outdated" : ""}`}>
                  <header><strong>{field.resourceLabel}</strong><code>{field.key}</code>{field.outdated ? <em>源内容已更新</em> : null}</header>
                  <div className="translation-field-columns"><label><span>原文</span><textarea value={field.sourceValue} readOnly rows={rows} aria-label={`${field.resourceLabel} ${field.key} 的原文内容`} /></label><label><span>{targetLocaleName || "目标语言"}</span><textarea value={field.value} onChange={(event) => setTranslationDrafts((current) => current.map((item) => item.resourceId === field.resourceId && item.key === field.key ? { ...item, value: event.target.value, changed: event.target.value !== item.originalValue } : item))} placeholder="输入翻译，或使用 AI 翻译全部" rows={rows} aria-label={`${field.resourceLabel} ${field.key} 的目标语言内容`} /></label></div>
                </article>;
              }) : <div className="translation-empty">{translationLoading ? <><LoaderCircle className="spin" size={18} />正在读取可翻译字段</> : "当前商品没有可翻译字段"}</div>}</div>
            </section>
          </div>
          <footer className="modal-actions translation-modal-actions"><span className="translation-modal-status" aria-live="polite">{hasTranslationChanges ? (isPrimaryTarget ? "商品信息有未保存修改" : "草稿有未发布修改") : `当前目标语言：${targetLocaleName || "目标语言"}`}</span><button className="button quiet" type="button" onClick={() => setTranslationModalOpen(false)} disabled={aiLoading || publishLoading}>关闭</button>{translationPreviewUrl ? <a className="button quiet" href={translationPreviewUrl} target="_blank" rel="noreferrer" title={`预览 ${targetLocaleName || locale} 商品详情`} aria-disabled={aiLoading || publishLoading ? "true" : undefined}> <ExternalLink size={15} />预览</a> : <button className="button quiet" type="button" disabled title="当前目标语言没有可用 Handle"><ExternalLink size={15} />预览</button>}<button className="button quiet" type="button" onClick={() => void loadTranslations(locale, marketId, sourceLocale)} disabled={translationLoading || aiLoading || publishLoading}><RefreshCw className={translationLoading ? "spin" : ""} size={15} />刷新内容</button><button className="button quiet" type="button" onClick={() => void translateAll()} disabled={aiLoading || translationLoading || publishLoading || !translationDrafts.length}>{aiLoading ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}{aiLoading ? "翻译中" : "AI 翻译全部"}</button><button className="button primary" type="button" onClick={() => void publishTranslations()} disabled={publishLoading || aiLoading || translationLoading || !hasTranslationChanges}>{publishLoading ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{publishLoading ? (isPrimaryTarget ? "修改中" : "发布中") : (isPrimaryTarget ? "修改商品信息" : "发布翻译")}</button></footer>
        </section>
      </div> : null}
      {mediaPickerOpen && product ? <div className="modal-backdrop media-picker-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setMediaPickerOpen(false)}>
        <section className="media-picker-modal" role="dialog" aria-modal="true" aria-labelledby="media-picker-title">
          <header className="modal-header"><div><span>PRODUCT MEDIA</span><h2 id="media-picker-title">设置显示图片</h2></div><button className="icon-button" type="button" onClick={() => setMediaPickerOpen(false)} aria-label="关闭" title="关闭"><X size={19} /></button></header>
          <div className="media-picker-body">
            <p className="media-picker-note">勾选的图片会在点击页面顶部“保存”后设置为商品媒体。当前 Shopify 媒体默认已勾选，AI 草稿默认未勾选。</p>
            <div className="media-picker-grid">
              {modalImages.map((image) => {
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
      {aiImageModalOpen && product ? <div className="modal-backdrop ai-image-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeImageAiModal()}>
        <section className="ai-image-modal ai-image-workspace" role="dialog" aria-modal="true" aria-labelledby="ai-image-modal-title" aria-describedby="ai-image-modal-description">
          <header className="modal-header"><div><span>AI IMAGE WORKSPACE</span><h2 id="ai-image-modal-title">多选图片进行编辑</h2></div><button className="icon-button" type="button" onClick={closeImageAiModal} aria-label="关闭" title="关闭"><X size={19} /></button></header>
          <div className="ai-image-modal-body">
            <div className="ai-image-workspace-top"><div className="ai-image-workspace-selection"><div className="ai-image-workspace-toolbar"><div><strong>选择商品图片</strong><small>{selectedCount ? `已选择 ${selectedCount} 张` : "可以多选图片"}</small></div><button className="button quiet compact" type="button" onClick={() => setSelectedImages(selectedCount === media.length ? [] : media.map((image) => image.id))} disabled={!media.length}><ListChecks size={14} />{selectedCount === media.length ? "取消全选" : "全选"}</button></div><div className="ai-image-workspace-source-grid">{media.map((image) => { const selected = selectedImages.includes(image.id); return <div className={`ai-image-modal-image-wrap ${selected ? "selected" : ""}`} key={image.id}><button className="ai-image-modal-image" type="button" onClick={() => setImagePreviewState({ url: image.url, title: `图片 ${image.position + 1}` })} aria-label={`预览图片 ${image.position + 1}`}><img src={image.url} alt={image.altText || product.title} /><span>{image.position + 1}</span></button><button className="ai-image-preview-button" type="button" onClick={(event) => { event.stopPropagation(); setSelectedImages((current) => current.includes(image.id) ? current.filter((item) => item !== image.id) : [...current, image.id]); }} aria-label={`${selected ? "取消选择" : "选择"}图片 ${image.position + 1}`} title={selected ? "取消选择" : "选择"}>{selected ? <Check size={13} /> : null}</button></div>; })}</div></div><aside className="ai-image-workspace-help" id="ai-image-modal-description"><strong>说明：</strong><p>进来先显示原来的所有图片。<br />可以多选<br />这个弹窗里的所有图片，点击可以预览。<br />是类似组图人那种放大拖动，然后如果是生成的图片，可以对比预览。</p></aside></div>
            <div className="ai-image-mode-switch" role="tablist" aria-label="图片处理模式"><button className={`ai-image-mode-tab ${imageTaskMode === "edit" ? "active" : ""}`} type="button" role="tab" aria-selected={imageTaskMode === "edit"} onClick={() => { setImageTaskMode("edit"); setImagePrompt(defaultImagePrompt); setImageAiStep("select"); }}><Sparkles size={14} />反推改图</button><button className={`ai-image-mode-tab ${imageTaskMode === "translate" ? "active" : ""}`} type="button" role="tab" aria-selected={imageTaskMode === "translate"} onClick={() => { setImageTaskMode("translate"); setImagePrompt(defaultImagePrompt || DEFAULT_IMAGE_TRANSLATION_PROMPT); setImageAiStep("select"); }}><Languages size={14} />图片翻译</button></div>
            <label className="ai-image-prompt-field"><span>对应任务的提示词</span><textarea rows={5} value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)} disabled={imageAiStep === "generating"} placeholder={imageTaskMode === "translate" ? "输入图片翻译要求" : "输入想要生成的画面变化"} /></label>
            <div className="ai-image-task-actions">{imageTaskMode === "edit" && selectedCount > 0 && imageAiStep !== "generating" ? <button className="button quiet" type="button" onClick={() => void analyzeImageStyle()} disabled={imageAiStep === "analyzing"}>{imageAiStep === "analyzing" ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}{imageAiStep === "analyzing" ? "分析中" : "分析图片"}</button> : null}{imageTaskMode === "translate" ? <button className="button primary" type="button" onClick={() => void queueImageTranslation()} disabled={!selectedCount || !locale || imageAiStep === "generating"}>{imageAiStep === "generating" ? <LoaderCircle className="spin" size={15} /> : <Languages size={15} />}{imageAiStep === "generating" ? "翻译中" : "开始翻译"}</button> : null}</div>
            {imageAnalysis && imageTaskMode === "edit" ? <div className="ai-image-analysis"><strong>图片分析</strong><span>{imageAnalysis}</span></div> : null}
            <div className="ai-image-workspace-summary"><ImageIcon size={16} /><span>{selectedCount ? `已选择 ${selectedCount} 张图片` : "请先选择需要处理的图片"}{imageTaskMode === "translate" && !locale ? " · 翻译需要目标语言" : ""}</span></div>
            <div className="ai-image-workspace-result-list"><div className="ai-image-workspace-result-heading"><strong>{imageTaskMode === "edit" ? "反推改图结果" : "图片翻译结果"}</strong><small>{imageTaskMode === "edit" ? "分析成功或失败后都可以重试，修改提示词后再生成" : "翻译任务直接显示原图与翻译结果"}</small></div>{imageTaskMode === "edit" ? <>{imageResultDrafts.filter((item) => !item.discarded && item.operation === "edit").map((result) => <article className="ai-image-result-row" key={result.id}><button className="ai-image-result-media" type="button" onClick={() => setImagePreviewState({ url: result.sourceUrl, title: "原图预览" })} aria-label="预览原图"><img src={result.sourceUrl} alt="原图" /><span>原图</span><Eye size={13} /></button><div className="ai-image-result-arrow" aria-hidden="true"><ArrowRight size={18} /></div><label className="ai-image-result-prompt"><span>对应任务的提示词</span><textarea rows={5} defaultValue={result.prompt ?? ""} aria-label="对应任务的提示词" onChange={(event) => setImageResultDrafts((current) => current.map((item) => item.id === result.id ? { ...item, prompt: event.target.value } : item))} /></label><button className="ai-image-result-media" type="button" onClick={() => result.resultUrl ? setImageCompareState({ originalUrl: result.sourceUrl, resultUrl: result.resultUrl, title: "生成图片对比" }) : undefined} disabled={!result.resultUrl} aria-label="预览生成结果"><div className="ai-image-result-output">{result.resultUrl ? <img src={result.resultUrl} alt="AI 生成结果" /> : <div className="ai-image-result-placeholder">{result.status === "failed" ? "生成失败" : result.status === "waiting" ? "生成中" : "等待结果"}</div>}<span className={`ai-image-result-status ${result.status}`}>{result.status === "queued" ? "已完成" : result.status === "failed" ? "失败" : "生成中"}</span></div><span>生成结果</span>{result.resultUrl ? <Eye size={13} /> : null}</button><div className="ai-image-result-actions"><button className="button quiet compact" type="button" onClick={() => void retryImageResult(result)} disabled={result.status === "waiting"}><RefreshCw size={13} />重试</button><button className="button quiet compact" type="button" onClick={() => discardImageResult(result.id)}><Trash2 size={13} />弃用</button><button className={`button compact ${result.replacing ? "primary" : "quiet"}`} type="button" onClick={() => replaceImageWithResult(result)} disabled={!result.resultUrl || result.status !== "queued"}><Check size={13} />{result.replacing ? "已选替换" : "替换原图"}</button></div></article>)}{imageAnalysisDrafts.filter((analysis) => !imageResultDrafts.some((result) => result.imageId === analysis.imageId && result.resultUrl)).map((analysis) => <article className="ai-image-analysis-row" key={analysis.id}><img className="ai-image-analysis-source" src={analysis.sourceUrl} alt="待分析图片" /><div className="ai-image-analysis-copy"><strong>{analysis.status === "analyzing" ? "分析中" : analysis.status === "generating" ? "生成中" : analysis.status === "failed" ? "分析失败" : "反推提示词"}</strong>{analysis.status === "ready" || analysis.status === "generating" || analysis.failedStage === "generation" ? <textarea className="ai-image-analysis-prompt" rows={4} value={analysis.prompt || ""} disabled={analysis.status === "generating"} onChange={(event) => setImageAnalysisDrafts((current) => current.map((item) => item.id === analysis.id ? { ...item, prompt: event.target.value } : item))} /> : <p>{analysis.status === "analyzing" ? "AI 正在分析图片风格" : analysis.message}</p>}</div>{analysis.status === "ready" || analysis.status === "generating" || analysis.failedStage === "generation" ? <div className="ai-image-generation-preview"><div className="ai-image-result-placeholder">{analysis.status === "generating" ? <><LoaderCircle className="spin" size={18} />生成中的图片</> : analysis.failedStage === "generation" ? "生成失败" : "待生成"}</div></div> : null}<div className="ai-image-analysis-actions">{analysis.status === "ready" ? <button className="button primary compact" type="button" onClick={() => void generateAnalyzedImage(analysis)} disabled={imageAiStep === "generating"}><Sparkles size={13} />生成</button> : null}<button className="button quiet compact" type="button" onClick={() => void retryImageAnalysis(analysis)} disabled={analysis.status === "analyzing" || analysis.status === "generating"}><RefreshCw size={13} />重试</button></div></article>)}</> : imageResultDrafts.filter((item) => !item.discarded && item.operation === "translate").map((result) => <article className="ai-image-result-row" key={result.id}><button className="ai-image-result-media" type="button" onClick={() => setImagePreviewState({ url: result.sourceUrl, title: "原图预览" })} aria-label="预览原图"><img src={result.sourceUrl} alt="原图" /><span>原图</span><Eye size={13} /></button><div className="ai-image-result-arrow" aria-hidden="true"><ArrowRight size={18} /></div><button className="ai-image-result-media" type="button" onClick={() => result.resultUrl ? setImageCompareState({ originalUrl: result.sourceUrl, resultUrl: result.resultUrl, title: "翻译图片对比" }) : undefined} disabled={!result.resultUrl} aria-label="预览翻译结果"><div className="ai-image-result-output">{result.resultUrl ? <img src={result.resultUrl} alt="翻译结果" /> : <div className="ai-image-result-placeholder">{result.status === "failed" ? "翻译失败" : "翻译中"}</div>}<span className={`ai-image-result-status ${result.status}`}>{result.status === "queued" ? "已完成" : result.status === "failed" ? "失败" : "翻译中"}</span></div><span>翻译结果</span>{result.resultUrl ? <Eye size={13} /> : null}</button><div className="ai-image-result-actions"><button className="button quiet compact" type="button" onClick={() => void retryImageResult(result)} disabled={result.status === "waiting"}><RefreshCw size={13} />重试</button></div></article>)}</div>
          </div>
          <footer className="modal-actions ai-image-workspace-footer"><button className="button primary" type="button" onClick={() => void saveImageModalDraft()} disabled={imageModalSaving || imageAiStep === "generating"}>{imageModalSaving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}{imageModalSaving ? "保存中" : "保存"}</button><button className="button quiet" type="button" onClick={closeImageAiModal} disabled={imageModalSaving || imageAiStep === "generating"}>不保存</button></footer>
        </section>
      </div> : null}
      {imagePreviewState ? <ImagePreviewModal url={imagePreviewState.url} title={imagePreviewState.title} onClose={() => setImagePreviewState(null)} /> : null}
      {imageCompareState ? <ImageCompareModal originalUrl={imageCompareState.originalUrl} resultUrl={imageCompareState.resultUrl} title={imageCompareState.title} resultLabel="生成结果" onClose={() => setImageCompareState(null)} /> : null}
    </section>
  );
}
