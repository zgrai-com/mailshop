const MIN_IMAGE_SIZE = 72;
const MIN_PRODUCT_SCORE = 0.2;
const SUPPORTED_DROP_TYPES = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);

const state = {
  tab: null,
  pageImages: [],
  selectedPageImageIds: new Set(),
  filter: "",
  hideSmall: true,
  ignoreSvg: true,
  draft: null,
  tasks: [],
  activeView: "workspace",
  account: null,
  accountLoading: true,
  searchOptions: { sort: "_sale", limit: 30, cache: "no", lang: "cn" },
  productOnly: true,
  aiClassified: false,
  imageScanMode: "manual",
  pageSnapshot: null,
  aiLoading: false,
  pageScanDiagnostics: {},
  aiUsage: { mode: "server", baseUrl: "", apiKey: "", imageFilterModelId: "" },
  aiLogs: [],
  aiProductRegions: [],
  imageIdAliases: new Map(),
  stores: [],
  credits: null,
  managementLoading: new Set(),
  resultsTaskId: null,
  resultsStoreId: "",
  resultsImportingKey: "",
  resultsMessage: "",
  resultsMessageTone: "",
};

const elements = Object.fromEntries([
  "load-page-images", "ai-analyze-page", "task-workspace",
  "drop-zone", "file-picker", "draft-panel", "draft-preview", "task-name", "draft-meta",
  "search-sort", "search-limit", "search-cache", "search-lang",
  "ai-mode-server", "ai-mode-custom", "custom-ai-config", "custom-ai-url", "custom-ai-key", "custom-ai-model",
  "ai-usage-panel", "ai-settings-mount", "ai-config-status", "save-ai-config", "test-ai-config",
  "ai-request-log-summary", "ai-request-logs", "refresh-ai-logs", "clear-ai-logs",
  "discard-draft", "create-task", "notice", "account-notice", "queue-summary", "clear-finished", "task-list",
  "image-modal", "modal-backdrop", "close-image-modal", "image-modal-heading", "page-meta", "image-filter",
  "hide-small", "ignore-svg", "ignore-svg-field", "product-only", "product-only-field", "product-only-label", "refresh-images", "modal-state", "ai-analysis-loading", "ai-analysis-step", "ai-analysis-frames", "ai-analysis-dom-nodes", "ai-analysis-html-size", "ai-analysis-image-bindings", "ai-analysis-candidates", "ai-analysis-regions", "image-grid",
  "selected-count", "toggle-image-selection", "create-selected-tasks", "ai-product-info",
  "account-label", "account-meta", "account-balance", "account-refresh",
  "account-login", "account-logout",
  "view-workspace", "view-tasks", "view-stores", "view-credits", "view-settings",
  "workspace-view", "tasks-view", "stores-view", "credits-view", "settings-view", "settings-back",
  "stores-summary", "stores-list", "refresh-stores",
  "credits-balance-card", "credits-list", "refresh-credits",
  "results-modal", "results-modal-backdrop", "results-modal-close", "results-modal-heading", "results-modal-meta", "results-store", "results-import-all", "results-import-status", "results-modal-grid",
  "ai-error-modal", "ai-error-backdrop", "ai-error-close", "ai-error-log", "reload-extension",
  "ai-log-modal", "ai-log-modal-backdrop", "ai-log-modal-close", "ai-log-modal-heading", "ai-log-modal-meta", "ai-log-modal-content",
  "image-viewer", "viewer-backdrop", "viewer-title", "viewer-reset", "viewer-close", "viewer-stage",
  "viewer-original-image", "viewer-result-image",
].map((id) => [id.replaceAll("-", "_"), document.querySelector(`#${id}`)]));
elements.task_intake = document.querySelector(".task-intake");
elements.ai_settings_mount.append(elements.ai_usage_panel);
elements.ai_usage_panel.hidden = false;

function hasSearchCredits() {
  return Boolean(state.account?.authenticated && Number(state.account.credits?.balance) >= 20);
}

function hasAiUsageConfiguration() {
  return state.aiUsage.mode === "server"
    || Boolean(state.aiUsage.baseUrl && state.aiUsage.apiKey && state.aiUsage.imageFilterModelId);
}

function renderView() {
  const signedIn = Boolean(state.account?.authenticated);
  if (!signedIn && state.activeView !== "workspace") state.activeView = "workspace";
  const views = ["workspace", "tasks", "stores", "credits", "settings"];
  for (const view of views) {
    elements[`${view}_view`].hidden = state.activeView !== view;
    elements[`view_${view}`].classList.toggle("active", state.activeView === view);
  }
}

function renderAccount() {
  const signedIn = Boolean(state.account?.authenticated);
  const balance = Number(state.account?.credits?.balance || 0);
  elements.account_label.textContent = state.accountLoading
    ? "正在检查账号"
    : signedIn
      ? state.account.user?.displayName || state.account.user?.email || state.account.user?.username || "已登录"
      : "尚未登录 Mailshop";
  elements.account_meta.textContent = signedIn
    ? `${state.account.user?.email || "普通用户"} · 创建任务免费，搜索时扣 20 分`
    : "登录后可创建采集任务并管理 Shopify 数据";
  elements.account_balance.textContent = `${balance.toLocaleString("zh-CN")} 分`;
  elements.account_balance.hidden = !signedIn;
  elements.account_login.hidden = state.accountLoading || signedIn;
  elements.account_logout.hidden = state.accountLoading || !signedIn;
  elements.account_refresh.hidden = state.accountLoading || !signedIn;
  elements.account_refresh.disabled = state.accountLoading;
  elements.load_page_images.disabled = !signedIn;
  elements.ai_analyze_page.disabled = !signedIn || !hasAiUsageConfiguration();
  elements.drop_zone.setAttribute("aria-disabled", String(!signedIn));
  const showWorkspace = !state.accountLoading && signedIn;
  elements.task_intake.hidden = !showWorkspace;
  for (const view of ["tasks", "stores", "credits", "settings"]) {
    elements[`view_${view}`].hidden = state.accountLoading || !signedIn;
  }
  renderView();
}

let accountLoadPromise = null;
let accountNoticeTimer = null;

async function loadAccount({ quiet = false } = {}) {
  if (accountLoadPromise) return accountLoadPromise;

  const showLoadingState = !state.account;
  if (showLoadingState) {
    state.accountLoading = true;
    renderAccount();
  }

  accountLoadPromise = (async () => {
    try {
      state.account = await extensionMessage({ type: "GET_ACCOUNT" });
      showAccountNotice("");
    } catch (error) {
      // Keep the existing session visible during a transient background refresh failure.
      if (!state.account) state.account = { authenticated: false };
      if (!quiet) showAccountNotice(error instanceof Error ? error.message : String(error), "error");
    } finally {
      state.accountLoading = false;
      renderAccount();
    }
  })();

  try {
    await accountLoadPromise;
  } finally {
    accountLoadPromise = null;
  }
}

function requireAuthenticated() {
  if (!state.account?.authenticated) {
    showNotice("请先登录 Mailshop 账号", "error");
    return false;
  }
  return true;
}

function requireSearchAccess() {
  if (!requireAuthenticated()) return false;
  if (!hasSearchCredits()) {
    showNotice("积分不足，搜图需要 20 积分", "error");
    return false;
  }
  return true;
}

function showNotice(message, type = "info") {
  elements.notice.textContent = message;
  elements.notice.dataset.type = type;
  elements.notice.hidden = !message;
}

function showAccountNotice(message, type = "info") {
  if (accountNoticeTimer) {
    window.clearTimeout(accountNoticeTimer);
    accountNoticeTimer = null;
  }
  elements.account_notice.textContent = message;
  elements.account_notice.dataset.type = type;
  elements.account_notice.hidden = !message;
  if (message && type !== "info") {
    accountNoticeTimer = window.setTimeout(() => {
      elements.account_notice.textContent = "";
      elements.account_notice.hidden = true;
      accountNoticeTimer = null;
    }, 5_000);
  }
}

function formatMoney(value) {
  const amount = Number(value);
  return value === null || value === undefined || !Number.isFinite(amount) ? "价格待补充" : `¥${amount.toFixed(2)}`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "--";
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(2)} MB`;
}

function updateAiAnalysisDiagnostics(diagnostics = state.pageScanDiagnostics) {
  const value = diagnostics || {};
  if (elements.ai_analysis_frames) {
    elements.ai_analysis_frames.textContent = value.frameCount ? `${value.readableFrameCount || 0}/${value.frameCount}` : "--";
  }
  if (elements.ai_analysis_dom_nodes) {
    const retained = Number(value.domNodeCount || 0).toLocaleString("zh-CN");
    const raw = Number(value.rawDomNodeCount || 0).toLocaleString("zh-CN");
    elements.ai_analysis_dom_nodes.textContent = `${retained} / ${raw}`;
  }
  if (elements.ai_analysis_html_size) elements.ai_analysis_html_size.textContent = formatBytes(value.htmlByteLength || value.htmlLength);
  if (elements.ai_analysis_image_bindings) elements.ai_analysis_image_bindings.textContent = Number(value.imageBindingCount || 0).toLocaleString("zh-CN");
  if (elements.ai_analysis_candidates) elements.ai_analysis_candidates.textContent = Number(value.detectedImageCount || 0).toLocaleString("zh-CN");
  if (elements.ai_analysis_regions) elements.ai_analysis_regions.textContent = value.selectedRegionCount === undefined ? "--" : Number(value.selectedRegionCount || 0).toLocaleString("zh-CN");
}

function updateAiAnalysisStep(message) {
  if (elements.ai_analysis_step && message) elements.ai_analysis_step.textContent = message;
}

function clearAiPageHighlights() {
  const style = document.getElementById("mailshop-ai-region-highlight-style");
  for (const overlay of document.querySelectorAll("[data-mailshop-ai-overlay]")) overlay.remove();
  for (const element of document.querySelectorAll("[data-mailshop-ai-region-highlight], [data-mailshop-ai-title-highlight], [data-mailshop-ai-sku-highlight]")) {
    element.removeAttribute("data-mailshop-ai-region-highlight");
    element.removeAttribute("data-mailshop-ai-title-highlight");
    element.removeAttribute("data-mailshop-ai-sku-highlight");
  }
  style?.remove();
  return { cleared: true };
}

function markAiPageRegions(highlight = {}) {
  const rootIds = new Set(Array.isArray(highlight?.rootIds) ? highlight.rootIds.map(String) : []);
  const titleIds = new Set(Array.isArray(highlight?.titleIds) ? highlight.titleIds.map(String) : []);
  const skuIds = new Set(Array.isArray(highlight?.skuIds) ? highlight.skuIds.map(String) : []);
  const style = document.createElement("style");
  style.id = "mailshop-ai-region-highlight-style";
  style.textContent = [
    '[data-mailshop-ai-overlay] { position: absolute !important; z-index: 2147483646 !important; box-sizing: border-box !important; pointer-events: none !important; background: transparent !important; }',
    '[data-mailshop-ai-overlay="root"] { border: 3px solid #e11d48 !important; box-shadow: 0 0 0 4px rgb(225 29 72 / 20%) !important; }',
    '[data-mailshop-ai-overlay="title"] { border: 2px solid #2563eb !important; }',
    '[data-mailshop-ai-overlay="sku"] { border: 2px dashed #16a34a !important; }',
    '[data-mailshop-ai-overlay-label] { position: absolute !important; top: -25px !important; left: -3px !important; padding: 3px 6px !important; background: #e11d48 !important; color: #fff !important; font: 600 12px/18px system-ui, sans-serif !important; white-space: nowrap !important; }',
    '[data-mailshop-ai-overlay="title"] [data-mailshop-ai-overlay-label] { background: #2563eb !important; }',
    '[data-mailshop-ai-overlay="sku"] [data-mailshop-ai-overlay-label] { background: #16a34a !important; }',
  ].join("\n");
  (document.head || document.documentElement).append(style);
  const addOverlay = (element, kind, label = "") => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const overlay = document.createElement("div");
    overlay.setAttribute("data-mailshop-ai-overlay", kind);
    overlay.style.left = `${rect.left + window.scrollX}px`;
    overlay.style.top = `${rect.top + window.scrollY}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    if (label) {
      const badge = document.createElement("span");
      badge.setAttribute("data-mailshop-ai-overlay-label", "true");
      badge.textContent = label;
      overlay.append(badge);
    }
    document.documentElement.append(overlay);
    return true;
  };
  let roots = 0;
  let titles = 0;
  let skus = 0;
  for (const element of document.querySelectorAll("[data-mailshop-node-id]")) {
    const nodeId = element.getAttribute("data-mailshop-node-id");
    if (rootIds.has(nodeId)) { element.setAttribute("data-mailshop-ai-region-highlight", "root"); if (addOverlay(element, "root", `AI 商品区域 ${roots + 1}`)) roots += 1; }
    if (titleIds.has(nodeId)) { element.setAttribute("data-mailshop-ai-title-highlight", "title"); if (addOverlay(element, "title", "标题")) titles += 1; }
    if (skuIds.has(nodeId)) { element.setAttribute("data-mailshop-ai-sku-highlight", "sku"); if (addOverlay(element, "sku", "SKU")) skus += 1; }
  }
  return { roots, titles, skus };
}

function scanPageImages() {
  const MAX_DOM_DEPTH = 10;
  const MAX_HTML_NODES = 20_000;
  const MAX_PAGE_HTML_LENGTH = 180_000;
  const entries = [];
  const seen = new Map();
  const imageHosts = new Map();
  const nodeIds = new WeakMap();
  const frameKey = `f${Math.random().toString(36).slice(2, 8)}`;
  let nodeSequence = 0;
  const shortHash = (value) => {
    let hash = 2_166_136_261;
    for (const char of String(value || "")) {
      hash ^= char.codePointAt(0) || 0;
      hash = Math.imul(hash, 16_777_619);
    }
    return (hash >>> 0).toString(36);
  };
  const getNodeId = (element) => {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;
    if (!nodeIds.has(element)) {
      const id = `${frameKey}-n${++nodeSequence}`;
      nodeIds.set(element, id);
      element.setAttribute("data-mailshop-node-id", id);
    }
    return nodeIds.get(element);
  };
  for (const element of document.querySelectorAll("[data-mailshop-node-id]")) element.removeAttribute("data-mailshop-node-id");
  for (const element of document.querySelectorAll("[data-mailshop-image-ids]")) element.removeAttribute("data-mailshop-image-ids");
  const normalizeText = (value) => String(value || "").replace(/\s+/gu, " ").trim().slice(0, 1_000);
  const extractContext = (element) => {
    const link = element.closest?.("a[href]");
    const ancestors = [];
    let ancestor = element;
    for (let depth = 0; ancestor && depth < 7; depth += 1, ancestor = ancestor.parentElement) ancestors.push(ancestor);
    const container = ancestors.find((node) => {
      const text = normalizeText(node.innerText);
      const classText = `${node.className || ""} ${node.getAttribute?.("data-testid") || ""}`.toLowerCase();
      return text.length >= 12 && text.length <= 8_000 && (node.querySelectorAll?.("img").length <= 12) && /(product|商品|item|card|sku|offer|goods|tile)/iu.test(classText);
    }) || ancestors.find((node) => {
      const text = normalizeText(node.innerText);
      return text.length >= 12 && text.length <= 4_000 && node.querySelectorAll?.("img").length <= 12;
    }) || element.parentElement || element;
    const text = normalizeText(container?.innerText || link?.innerText || element.alt || element.title);
    const skuMatch = text.match(/(?:sku|货号|款号|商品编号|编码)\s*[:：#-]?\s*([A-Za-z0-9][A-Za-z0-9_-]{2,})/iu);
    const classText = `${container?.className || ""} ${element.className || ""}`.toLowerCase();
    const rect = element.getBoundingClientRect();
    let score = 0.12;
    if (rect.width >= 120 && rect.height >= 120) score += 0.2;
    if (rect.top >= -100 && rect.top <= window.innerHeight * 1.5) score += 0.12;
    if (link) score += 0.16;
    if (container && /(product|商品|item|card|sku|offer|goods|tile)/iu.test(classText)) score += 0.2;
    if (/(¥|￥|price|价格|购买|加入购物车|add to cart)/iu.test(text)) score += 0.16;
    if (/(logo|avatar|icon|sprite|banner|广告|广告位|推荐)/iu.test(`${element.alt || ""} ${element.title || ""} ${classText}`)) score -= 0.35;
    return { container, text, sku: skuMatch?.[1] || null, score: Math.max(0, Math.min(1, score)), rect };
  };
  const associateImage = (element, imageId) => {
    if (!element || !imageId) return;
    const hostImages = imageHosts.get(element) || new Set();
    hostImages.add(imageId);
    imageHosts.set(element, hostImages);
    element.setAttribute("data-mailshop-image-ids", [...hostImages].join(","));
  };
  const add = (value, meta = {}, element = null) => {
    if (!value) return;
    let url;
    try { url = new URL(value, location.href).href; } catch { return; }
    if (!/^https?:\/\//iu.test(url)) return;
    const current = seen.get(url);
    if (current && current.domScore >= Number(meta.domScore || 0)) {
      associateImage(element, current.id);
      return;
    }
    const item = {
      id: current?.id || `img-${shortHash(url)}`,
      url,
      width: Math.max(0, Number(meta.width) || 0),
      height: Math.max(0, Number(meta.height) || 0),
      alt: String(meta.alt || "").slice(0, 300),
      title: String(meta.title || "").slice(0, 300),
      source: meta.source || "image",
      sourcePage: location.href,
      context: String(meta.context || "").slice(0, 2_000),
      sku: meta.sku || null,
      domScore: Number(meta.domScore || 0),
    };
    const target = current ? Object.assign(current, item) : item;
    if (!current) entries.push(target);
    seen.set(url, target);
    associateImage(element, target.id);
  };
  const chooseSrcset = (value) => value.split(",").map((item) => item.trim().split(/\s+/u)[0]).filter(Boolean).at(-1);
  for (const image of document.images) {
    const info = extractContext(image);
    const meta = { width: image.naturalWidth || image.width || info.rect.width, height: image.naturalHeight || image.height || info.rect.height, alt: image.alt, title: image.title, context: info.text, sku: info.sku, domScore: info.score, container: info.container };
    for (const candidate of [image.currentSrc, image.src, image.dataset.src, image.dataset.original, image.dataset.lazySrc, chooseSrcset(image.srcset || ""), chooseSrcset(image.dataset.srcset || "")]) add(candidate, meta, image);
  }
  for (const element of document.querySelectorAll("*")) {
    const background = getComputedStyle(element).backgroundImage;
    if (!background || background === "none") continue;
    const info = extractContext(element);
    for (const match of background.matchAll(/url\(["']?(.*?)["']?\)/giu)) {
      if (match[1]) add(match[1], { width: element.clientWidth || info.rect.width, height: element.clientHeight || info.rect.height, source: "background", context: info.text, sku: info.sku, domScore: info.score, container: info.container }, element);
    }
  }

  const skippedTags = new Set(["script", "style", "noscript", "iframe", "canvas", "svg", "path", "meta", "link", "template", "source"]);
  const allowedTags = new Set(["a", "article", "aside", "body", "button", "dd", "details", "div", "dl", "dt", "em", "figcaption", "figure", "footer", "form", "head", "h1", "h2", "h3", "h4", "h5", "h6", "header", "html", "img", "label", "li", "main", "nav", "ol", "option", "p", "picture", "section", "select", "small", "span", "strong", "summary", "table", "tbody", "td", "th", "thead", "title", "tr", "ul"]);
  const voidTags = new Set(["img"]);
  const safeAttribute = (value, max = 240) => String(value || "").replace(/\s+/gu, " ").trim().slice(0, max);
  const compactClass = (value) => safeAttribute(value, 180).split(" ").filter((token) => token && token.length <= 64).slice(0, 6).join(" ");
  const collectImageIds = (element, includeDescendants = false) => {
    const ids = new Set(imageHosts.get(element) || []);
    if (includeDescendants) {
      for (const descendant of element.querySelectorAll("*")) {
        for (const imageId of imageHosts.get(descendant) || []) {
          ids.add(imageId);
          if (ids.size >= 24) return [...ids];
        }
      }
    }
    return [...ids];
  };
  const cloneCompactNode = (node, depth, budget) => {
    if (budget.nodes <= 0 || depth >= MAX_DOM_DEPTH) return null;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = safeAttribute(node.textContent, 320);
      return text ? document.createTextNode(text) : null;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const element = node;
    const originalTag = element.tagName.toLowerCase();
    if (skippedTags.has(originalTag) || element.getAttribute("aria-hidden") === "true") return null;
    const style = getComputedStyle(element);
    const skuHint = /(?:\bsku\b|货号|款号|商品编号|产品编号|编码|item[-_ ]?(?:no|number)|part[-_ ]?(?:no|number))/iu.test(
      `${element.innerText || element.textContent || ""} ${[...element.attributes].map((attribute) => `${attribute.name}=${attribute.value}`).join(" ")}`,
    );
    if ((style.display === "none" || style.visibility === "hidden") && !skuHint) return null;
    budget.nodes -= 1;
    const tag = allowedTags.has(originalTag) ? originalTag : "div";
    const clone = document.createElement(tag);
    clone.setAttribute("data-node-id", getNodeId(element));
    const atDepthLimit = depth === MAX_DOM_DEPTH - 1;
    const hostedImages = collectImageIds(element, atDepthLimit);
    if (hostedImages.length) clone.setAttribute("data-image-ids", hostedImages.join(","));
    const className = compactClass(element.className);
    if (className) clone.setAttribute("class", className);
    for (const name of ["id", "role", "aria-label", "itemprop", "data-testid", "name", "type"]) {
      const value = safeAttribute(element.getAttribute(name));
      if (value) clone.setAttribute(name, value);
    }
    if (tag === "a") {
      const href = safeAttribute(element.getAttribute("href"), 500);
      if (href) clone.setAttribute("href", href);
    }
    if (tag === "img") {
      const src = safeAttribute(element.currentSrc || element.getAttribute("src"), 500);
      const alt = safeAttribute(element.getAttribute("alt"), 300);
      if (src) clone.setAttribute("src", src);
      if (alt) clone.setAttribute("alt", alt);
    }
    if (!voidTags.has(tag) && atDepthLimit) {
      const summary = safeAttribute(element.innerText || element.textContent, 1_200);
      if (summary) clone.textContent = summary;
      if (element.childElementCount) clone.setAttribute("data-depth-truncated", "true");
    } else if (!voidTags.has(tag)) {
      for (const child of element.childNodes) {
        const childClone = cloneCompactNode(child, depth + 1, budget);
        if (childClone) clone.append(childClone);
        if (budget.nodes <= 0) break;
      }
    }
    return clone;
  };
  const root = document.documentElement || document.body;
  const budget = { nodes: MAX_HTML_NODES };
  const clone = root ? cloneCompactNode(root, 0, budget) : null;
  let html = clone?.outerHTML || "";
  if (html.length > MAX_PAGE_HTML_LENGTH) html = `${html.slice(0, MAX_PAGE_HTML_LENGTH - 60)}<!-- truncated -->`;
  return {
    title: document.title,
    url: location.href,
    images: entries,
    html,
    htmlNodeCount: MAX_HTML_NODES - budget.nodes,
    domElementCount: document.getElementsByTagName("*").length,
  };
}

function extractAiRegionSnapshots(rootIds = []) {
  const ids = new Set(Array.isArray(rootIds) ? rootIds.map(String).filter(Boolean) : []);
  const MAX_DOM_DEPTH = 20;
  const MAX_HTML_NODES = 8_000;
  const MAX_HTML_LENGTH = 80_000;
  const skippedTags = new Set(["script", "style", "noscript", "iframe", "canvas", "svg", "path", "meta", "link", "template", "source"]);
  const allowedTags = new Set(["a", "article", "aside", "body", "button", "dd", "details", "div", "dl", "dt", "em", "figcaption", "figure", "footer", "form", "head", "h1", "h2", "h3", "h4", "h5", "h6", "header", "img", "label", "li", "main", "nav", "ol", "option", "p", "picture", "section", "select", "small", "span", "strong", "summary", "table", "tbody", "td", "th", "thead", "title", "tr", "ul"]);
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  const safe = (value, max = 500) => String(value || "").replace(/\s+/gu, " ").trim().slice(0, max);
  const cloneNode = (node, depth, budget) => {
    if (budget.nodes <= 0 || depth >= MAX_DOM_DEPTH) return null;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = safe(node.textContent, 500);
      return text ? document.createTextNode(text) : null;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const element = node;
    const originalTag = element.tagName.toLowerCase();
    if (skippedTags.has(originalTag) || element.getAttribute("aria-hidden") === "true") return null;
    const style = getComputedStyle(element);
    const skuHint = /(?:\bsku\b|货号|款号|商品编号|产品编号|编码|item[-_ ]?(?:no|number)|part[-_ ]?(?:no|number))/iu.test(
      `${element.innerText || element.textContent || ""} ${[...element.attributes].map((attribute) => `${attribute.name}=${attribute.value}`).join(" ")}`,
    );
    if ((style.display === "none" || style.visibility === "hidden") && !skuHint) return null;
    budget.nodes -= 1;
    const tag = allowedTags.has(originalTag) ? originalTag : "div";
    const clone = document.createElement(tag);
    const nodeId = element.getAttribute("data-mailshop-node-id");
    if (nodeId) clone.setAttribute("data-node-id", nodeId);
    const imageIds = element.getAttribute("data-mailshop-image-ids");
    if (imageIds) clone.setAttribute("data-image-ids", imageIds);
    const className = safe(element.className, 180);
    if (className) clone.setAttribute("class", className);
    for (const name of ["id", "role", "aria-label", "itemprop", "data-testid", "name", "type"]) {
      const value = safe(element.getAttribute(name), 240);
      if (value) clone.setAttribute(name, value);
    }
    for (const attribute of [...element.attributes]) {
      if (!/(?:sku|货号|款号|商品编号|产品编号|编码)/iu.test(attribute.name)) continue;
      const value = safe(attribute.value, 240);
      if (value) clone.setAttribute(attribute.name, value);
    }
    for (const attribute of [...element.attributes]) {
      if (!/(?:sku|货号|款号|商品编号|产品编号|编码)/iu.test(attribute.name)) continue;
      const value = safe(attribute.value, 240);
      if (value) clone.setAttribute(attribute.name, value);
    }
    if (tag === "a") {
      const href = safe(element.getAttribute("href"), 500);
      if (href) clone.setAttribute("href", href);
    }
    if (tag === "img") {
      const src = safe(element.currentSrc || element.getAttribute("src"), 500);
      const alt = safe(element.getAttribute("alt"), 300);
      if (src) clone.setAttribute("src", src);
      if (alt) clone.setAttribute("alt", alt);
    }
    if (!voidTags.has(tag)) {
      for (const child of element.childNodes) {
        const childClone = cloneNode(child, depth + 1, budget);
        if (childClone) clone.append(childClone);
        if (budget.nodes <= 0) break;
      }
      if (element.childElementCount && depth >= MAX_DOM_DEPTH - 1) clone.setAttribute("data-depth-truncated", "true");
    }
    return clone;
  };
  const snapshots = [];
  for (const element of document.querySelectorAll("[data-mailshop-node-id]")) {
    const rootId = element.getAttribute("data-mailshop-node-id");
    if (!ids.has(rootId)) continue;
    const budget = { nodes: MAX_HTML_NODES };
    const clone = cloneNode(element, 0, budget);
    if (!clone) continue;
    let html = clone.outerHTML || "";
    if (html.length > MAX_HTML_LENGTH) html = `${html.slice(0, MAX_HTML_LENGTH - 60)}<!-- truncated -->`;
    const imageNodes = [element, ...element.querySelectorAll("[data-mailshop-image-ids]")];
    const imageIds = [...new Set(imageNodes.flatMap((node) => String(node.getAttribute("data-mailshop-image-ids") || "").split(",").filter(Boolean)))];
    const skuIds = [...element.querySelectorAll("*")]
      .filter((node) => /(?:\bsku\b|货号|款号|商品编号|产品编号|编码|item[-_ ]?(?:no|number)|part[-_ ]?(?:no|number))/iu.test(
        `${node.innerText || node.textContent || ""} ${[...node.attributes].map((attribute) => `${attribute.name}=${attribute.value}`).join(" ")}`,
      ))
      .map((node) => node.getAttribute("data-mailshop-node-id"))
      .filter(Boolean)
      .slice(0, 24);
    snapshots.push({ rootId, html, imageIds: imageIds.slice(0, 96), skuIds, htmlNodeCount: MAX_HTML_NODES - budget.nodes, depth: MAX_DOM_DEPTH });
  }
  return snapshots;
}

function strippedImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function canLoadImageUrl(url, timeoutMs = 8_000) {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.referrerPolicy = "no-referrer-when-downgrade";
    image.src = url;
  });
}

async function deduplicateImageUrls(images) {
  const aliases = new Map();
  const groups = new Map();
  for (const image of images) {
    const stripped = strippedImageUrl(image.url);
    const key = stripped || image.url;
    const group = groups.get(key) || [];
    group.push(image);
    groups.set(key, group);
  }
  const processed = await Promise.all([...groups.values()].map(async (group) => {
    if (group.length === 1) return group;
    const stripped = strippedImageUrl(group[0].url);
    const valid = stripped && await canLoadImageUrl(stripped, 5_000);
    if (!valid) return group;
    const representative = group.find((item) => item.url === stripped)
      || [...group].sort((left, right) => Number(right.domScore || 0) - Number(left.domScore || 0))[0];
    representative.url = stripped;
    for (const item of group) aliases.set(item.id, representative.id);
    return [representative];
  }));
  return { images: processed.flat(), aliases };
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] || null;
}

async function scanCurrentPage() {
  const useAi = state.imageScanMode === "ai";
  state.aiProductRegions = [];
  if (elements.ai_product_info) elements.ai_product_info.replaceChildren();
  state.aiLoading = useAi;
  elements.image_modal.classList.toggle("ai-loading", useAi);
  elements.ai_analysis_loading.hidden = !useAi;
  elements.image_grid.hidden = useAi;
  if (useAi) {
    updateAiAnalysisStep("正在读取当前页面 DOM…");
    updateAiAnalysisDiagnostics({});
  }
  elements.modal_state.textContent = "正在扫描当前页面…";
  if (!useAi) elements.image_grid.replaceChildren();
  try {
    state.tab = await getActiveTab();
    if (!state.tab?.id) throw new Error("没有找到当前浏览器页面");
    await chrome.scripting.executeScript({ target: { tabId: state.tab.id, allFrames: true }, func: clearAiPageHighlights }).catch(() => undefined);
    const frames = await chrome.scripting.executeScript({ target: { tabId: state.tab.id, allFrames: true }, func: scanPageImages });
    const images = new Map();
    const frameHtml = [];
    let readableFrameCount = 0;
    let rawDomNodeCount = 0;
    let domNodeCount = 0;
    for (const frame of frames) {
      if (frame.result) readableFrameCount += 1;
      rawDomNodeCount += Number(frame.result?.domElementCount || 0);
      domNodeCount += Number(frame.result?.htmlNodeCount || 0);
      for (const image of frame.result?.images || []) {
        const current = images.get(image.url);
        if (!current || Number(image.domScore || 0) > Number(current.domScore || 0)) images.set(image.url, image);
      }
      if (frame.result?.html) frameHtml.push({ frameId: Number(frame.frameId || 0), url: frame.result.url || "", html: frame.result.html });
    }
    const deduped = await deduplicateImageUrls([...images.values()]);
    state.imageIdAliases = deduped.aliases;
    state.pageImages = deduped.images;
    frameHtml.sort((left, right) => left.frameId - right.frameId);
    const pageHtml = frameHtml.map((frame) => `<section data-frame-id="${frame.frameId}" data-frame-url="${String(frame.url).replace(/&/gu, "&amp;").replace(/"/gu, "&quot;")}">${frame.html}</section>`).join("\n").slice(0, 180_000);
    const imageBindingCount = [...pageHtml.matchAll(/data-image-ids="[^"]+"/gu)].length;
    state.pageSnapshot = {
      url: state.tab.url || frames[0]?.result?.url || "",
      title: state.tab.title || frames[0]?.result?.title || "",
      html: pageHtml,
    };
    state.pageScanDiagnostics = {
      frameCount: frames.length,
      readableFrameCount,
      detectedImageCount: images.size,
      htmlFrameCount: frameHtml.length,
      htmlLength: pageHtml.length,
      htmlByteLength: new TextEncoder().encode(pageHtml).length,
      rawDomNodeCount,
      domNodeCount,
      imageBindingCount,
      pageUrl: state.pageSnapshot.url,
      pageTitle: state.pageSnapshot.title,
    };
    if (useAi) {
      updateAiAnalysisDiagnostics();
      updateAiAnalysisStep(`已整理 ${domNodeCount.toLocaleString("zh-CN")} 个 DOM 节点，正在请求 AI 识别商品区域…`);
    }
    if (useAi) state.pageImages.sort((left, right) => (right.domScore || 0) - (left.domScore || 0));
    state.aiClassified = false;
    const availableIds = new Set(state.pageImages.map((image) => image.id));
    state.selectedPageImageIds = new Set([...state.selectedPageImageIds].filter((id) => availableIds.has(id)));
    elements.page_meta.textContent = `${state.pageImages.length} 张图片 · ${state.tab.title || "当前页面"}`;
    elements.modal_state.textContent = state.pageImages.length ? (useAi ? "正在使用 AI 分析页面结构" : "已应用页面结构筛选，可关闭筛选查看全部图片") : "当前页面没有检测到可用图片";
    if (!useAi) { renderImageGrid(); renderAiProductInfo(); }
    if (useAi) await classifyPageImages();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.pageImages = [];
    state.pageSnapshot = null;
    state.pageScanDiagnostics = {};
    state.aiLoading = false;
    elements.image_modal.classList.remove("ai-loading");
    elements.ai_analysis_loading.hidden = true;
    elements.image_grid.hidden = false;
    elements.modal_state.textContent = useAi ? `AI 页面分析失败：${message}` : "当前页面禁止扩展读取内容，可以直接拖入图片。";
    elements.image_grid.replaceChildren();
    if (useAi) showAiErrorLog(error, "页面 HTML / AI 分析");
    else { renderImageGrid(); renderAiProductInfo(); }
  }
}

async function classifyPageImages() {
  try {
    const candidates = state.pageImages.slice(0, 120);
    const pageSnapshot = state.pageSnapshot?.html ? state.pageSnapshot : null;
    const regionResponse = await extensionMessage({ type: "CLASSIFY_PAGE_IMAGES", stage: "regions", candidates, pageSnapshot, diagnostics: state.pageScanDiagnostics });
    const detectedRegions = Array.isArray(regionResponse.regions) ? regionResponse.regions : [];
    if (!detectedRegions.length) throw new Error("第一阶段 AI 没有返回商品区域");
    const rootIds = detectedRegions.map((region) => region.rootId).filter(Boolean);
    const frameResults = state.tab?.id ? await chrome.scripting.executeScript({ target: { tabId: state.tab.id, allFrames: true }, func: extractAiRegionSnapshots, args: [rootIds] }) : [];
    const detectedByRoot = new Map(detectedRegions.map((region) => [region.rootId, region]));
    const regionSnapshots = frameResults.flatMap((frame) => Array.isArray(frame.result) ? frame.result : []).map((snapshot) => ({
      ...snapshot,
      titleIds: detectedByRoot.get(snapshot.rootId)?.titleIds || [],
      skuIds: snapshot.skuIds || detectedByRoot.get(snapshot.rootId)?.skuIds || [],
      imageIds: [...new Set((snapshot.imageIds || []).map((id) => state.imageIdAliases.get(id) || id))],
    }));
    if (!regionSnapshots.length) throw new Error(`无法提取有效商品区域 HTML：AI 返回 ${detectedRegions.length} 个区域，但 DOM 快照为 0`);
    state.pageScanDiagnostics = { ...state.pageScanDiagnostics, selectedRegionCount: detectedRegions.length, regionSnapshotCount: regionSnapshots.length, regionHtmlCharacters: regionSnapshots.reduce((sum, item) => sum + String(item.html || "").length, 0) };
    updateAiAnalysisDiagnostics();
    updateAiAnalysisStep(`AI 已返回 ${detectedRegions.length} 个商品区域，正在并行提取标题、简介和 SKU…`);
    let highlightedRegionCount = 0;
    if (state.tab?.id && detectedRegions.length) {
      const highlight = {
        rootIds: detectedRegions.map((region) => region.rootId).filter(Boolean),
        titleIds: detectedRegions.flatMap((region) => Array.isArray(region.titleIds) ? region.titleIds : []),
        skuIds: [],
      };
      const markerResults = await chrome.scripting.executeScript({ target: { tabId: state.tab.id, allFrames: true }, func: markAiPageRegions, args: [highlight] });
      highlightedRegionCount = markerResults.reduce((total, frame) => total + Number(frame.result?.roots || 0), 0);
    }
    const fieldsResponse = await extensionMessage({ type: "CLASSIFY_PAGE_IMAGES", stage: "fields", regionSnapshots, diagnostics: state.pageScanDiagnostics });
    const regions = Array.isArray(fieldsResponse.regions) ? fieldsResponse.regions : [];
    const aiRegionImageIds = new Set(regionSnapshots.flatMap((region) => Array.isArray(region.imageIds) ? region.imageIds : []));
    const regionByImageId = new Map();
    for (const region of regions) for (const imageId of Array.isArray(region.imageIds) ? region.imageIds : []) if (!regionByImageId.has(imageId)) regionByImageId.set(imageId, region);
    state.aiProductRegions = regions;
    state.pageImages = state.pageImages
      .filter((image) => aiRegionImageIds.has(image.id))
      .map((image) => {
        const region = regionByImageId.get(image.id) || {};
        return {
          ...image,
          regionRootId: region.rootId || null,
          aiKeep: true,
          aiRegion: true,
        };
      });
    state.selectedPageImageIds = new Set(state.pageImages.map((image) => image.id));
    state.aiClassified = true;
    elements.page_meta.textContent = `${state.pageImages.length} 张 AI 商品区域图片 · ${state.tab?.title || "当前页面"}`;
    state.aiLoading = false;
    elements.image_modal.classList.remove("ai-loading");
    elements.ai_analysis_loading.hidden = true;
    elements.image_grid.hidden = false;
    if (fieldsResponse.degraded) throw new Error(fieldsResponse.error || "AI 字段提取未完成，系统未生成可用结果");
    const sourceLabel = fieldsResponse.source === "custom" ? "自定义 AI" : "服务器 AI";
    const completedLabel = `${sourceLabel} 已完成商品区域识别、字段提取和图片收集`;
    const retainedDom = Number(state.pageScanDiagnostics.domNodeCount || 0).toLocaleString("zh-CN");
    const rawDom = Number(state.pageScanDiagnostics.rawDomNodeCount || 0).toLocaleString("zh-CN");
    const htmlSize = formatBytes(state.pageScanDiagnostics.htmlByteLength || state.pageScanDiagnostics.htmlLength);
    elements.modal_state.textContent = `${completedLabel} · DOM ${retainedDom}/${rawDom} · HTML ${htmlSize} · AI 返回 ${regions.length} 个区域，网页已标识 ${highlightedRegionCount} 个`;
    renderImageGrid();
    renderAiProductInfo();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.aiClassified = false;
    state.aiLoading = false;
    elements.image_modal.classList.remove("ai-loading");
    elements.ai_analysis_loading.hidden = true;
    elements.image_grid.hidden = false;
    elements.modal_state.textContent = `AI 页面分析失败：${message}`;
    elements.image_grid.replaceChildren();
    showAiErrorLog(error, "页面 HTML / AI 分析");
  }
}

function isSvgImage(image) {
  const value = String(image?.url || "").trim();
  if (/^data:image\/svg\+xml(?:[;,]|$)/iu.test(value)) return true;
  try {
    const url = new URL(value);
    if (/\.svgz?$/iu.test(url.pathname)) return true;
    return [...url.searchParams.values()].some((part) =>
      /(?:^svgz?$|\.svgz?$|image\/svg\+xml)/iu.test(part.trim()),
    );
  } catch {
    return /\.svgz?(?:[?#]|$)/iu.test(value);
  }
}

function visiblePageImages() {
  const query = state.filter.trim().toLowerCase();
  return state.pageImages.filter((image) => {
    if (state.hideSmall && (image.width < MIN_IMAGE_SIZE || image.height < MIN_IMAGE_SIZE)) return false;
    if (state.imageScanMode === "manual" && state.ignoreSvg && isSvgImage(image)) return false;
    if (state.imageScanMode === "manual" && state.productOnly && (image.domScore || 0) < MIN_PRODUCT_SCORE) return false;
    if (state.imageScanMode === "ai" && state.aiClassified && image.aiRegion !== true) return false;
    return !query || `${image.url} ${image.alt} ${image.title} ${image.productTitle || ""} ${image.sku || ""}`.toLowerCase().includes(query);
  });
}

function renderAiProductInfo() {
  if (!elements.ai_product_info) return;
  elements.ai_product_info.replaceChildren();
  if (state.imageScanMode !== "ai" || !state.aiProductRegions.length) return;
  const heading = document.createElement("h3");
  heading.textContent = "AI 识别的商品信息";
  elements.ai_product_info.append(heading);
  for (const [index, region] of state.aiProductRegions.entries()) {
    const article = document.createElement("article");
    article.className = "ai-product-region";
    const title = document.createElement("h4");
    title.textContent = region.productTitle || "标题未识别";
    const description = document.createElement("p");
    description.textContent = region.description || "简介未识别";
    const meta = document.createElement("dl");
    for (const [label, value] of [["SKU", region.sku], ["品牌", region.brand], ["价格", region.price ? `${region.price}${region.currency ? ` ${region.currency}` : ""}` : null]]) {
      const dt = document.createElement("dt"); dt.textContent = label;
      const dd = document.createElement("dd"); dd.textContent = value || "未识别";
      meta.append(dt, dd);
    }
    const regionLabel = document.createElement("small");
    regionLabel.textContent = `商品区域 ${index + 1} · ${region.imageCount || 0} 张图片`;
    article.append(regionLabel, title, description, meta);
    elements.ai_product_info.append(article);
  }
}

function renderImageGrid() {
  elements.image_grid.replaceChildren();
  const images = visiblePageImages();
  if (!images.length) {
    elements.image_grid.append(document.querySelector("#empty-image-template").content.cloneNode(true));
    renderImageSelection();
    return;
  }
  for (const image of images) {
    const button = document.createElement("button");
    button.className = "image-card";
    button.type = "button";
    const selected = state.selectedPageImageIds.has(image.id);
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("aria-label", `${selected ? "取消选择" : "选择"} 图片`);
    button.title = "选择图片";
    const previewFrame = document.createElement("span");
    previewFrame.className = "image-preview";
    const preview = document.createElement("img");
    preview.src = image.url;
    preview.alt = "";
    preview.loading = "lazy";
    const check = document.createElement("span");
    check.className = "image-check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = "✓";
    previewFrame.append(preview, check);
    const info = document.createElement("span");
    info.className = "image-info";
    const meta = document.createElement("small");
    meta.className = "image-product-meta";
    meta.textContent = `${image.width || "?"} × ${image.height || "?"}`;
    info.append(meta);
    button.append(previewFrame, info);
    button.addEventListener("click", () => {
      if (state.selectedPageImageIds.has(image.id)) {
        state.selectedPageImageIds.delete(image.id);
      } else {
        state.selectedPageImageIds.add(image.id);
      }
      renderImageGrid();
    });
    elements.image_grid.append(button);
  }
  renderImageSelection();
}

function renderImageSelection() {
  const count = state.selectedPageImageIds.size;
  const allSelected = state.pageImages.length > 0 && state.pageImages.every((image) => state.selectedPageImageIds.has(image.id));
  elements.selected_count.textContent = `已选 ${count} 张`;
  elements.toggle_image_selection.disabled = state.pageImages.length === 0;
  elements.toggle_image_selection.textContent = allSelected ? "取消全选" : "全选";
  elements.create_selected_tasks.disabled = count === 0;
  elements.create_selected_tasks.textContent = count ? `创建 1 个采集任务（${count} 张）` : "创建采集任务";
}

function openImageModal(mode = "manual") {
  if (!requireAuthenticated()) return;
  state.imageScanMode = mode;
  state.productOnly = true;
  if (mode === "manual") {
    state.hideSmall = true;
    state.ignoreSvg = true;
  }
  state.aiClassified = false;
  elements.product_only.checked = state.productOnly;
  elements.hide_small.checked = state.hideSmall;
  elements.ignore_svg.checked = state.ignoreSvg;
  elements.ignore_svg_field.hidden = mode !== "manual";
  elements.product_only_field.hidden = mode !== "manual";
  elements.product_only_label.textContent = "只显示疑似商品图";
  elements.image_modal_heading.textContent = mode === "ai" ? "AI 分析当前页面图片" : "选择当前页面图片";
  state.selectedPageImageIds.clear();
  renderImageSelection();
  elements.image_modal.hidden = false;
  state.aiLoading = mode === "ai";
  elements.image_modal.classList.toggle("ai-loading", mode === "ai");
  elements.ai_analysis_loading.hidden = mode !== "ai";
  elements.image_grid.hidden = mode === "ai";
  document.body.classList.add("modal-open");
  elements.image_filter.focus();
  void scanCurrentPage();
}

async function createSelectedTasks() {
  if (!requireAuthenticated()) return;
  const selectedImages = state.pageImages.filter((image) => state.selectedPageImageIds.has(image.id));
  if (!selectedImages.length) return;
  elements.create_selected_tasks.disabled = true;
  elements.toggle_image_selection.disabled = true;
  elements.create_selected_tasks.textContent = "正在保存采集任务…";
  const selectedIds = new Set(selectedImages.map((image) => image.id));
  const region = [...state.aiProductRegions].sort((left, right) => {
    const overlap = (value) => (value.imageIds || []).filter((id) => selectedIds.has(id)).length;
    return overlap(right) - overlap(left);
  })[0] || {};
  const productUrl = selectedImages.find((image) => image.sourcePage)?.sourcePage || state.tab?.url || null;
  let sourceSite = null;
  try { sourceSite = productUrl ? new URL(productUrl).hostname : null; } catch { sourceSite = null; }
  const productTitle = region.productTitle || selectedImages.find((image) => image.productTitle)?.productTitle || defaultTaskName(selectedImages[0]);
  try {
    await extensionMessage({
      type: "CREATE_TASK",
      task: {
        name: productTitle,
        productTitle,
        description: region.description || null,
        sku: region.sku || selectedImages.find((image) => image.sku)?.sku || null,
        sourceSite,
        productUrl,
        images: selectedImages.map((image) => ({
          id: image.id,
          url: image.url,
          width: image.width || 0,
          height: image.height || 0,
          alt: image.alt || "",
          title: image.title || "",
          source: image.source || "page",
        })),
        options: { ...state.searchOptions },
      },
    });
    state.selectedPageImageIds.clear();
    closeImageModal();
    await loadTasks();
    showNotice(`采集任务已保存，共 ${selectedImages.length} 张图片；请到采集任务中选择搜图图片`, "success");
  } catch (error) {
    renderImageSelection();
    showNotice(error instanceof Error ? error.message : String(error), "error");
  }
}

function closeImageModal() {
  elements.image_modal.hidden = true;
  elements.image_modal.classList.remove("ai-loading");
  state.aiLoading = false;
  if (elements.results_modal.hidden && elements.ai_error_modal.hidden && elements.ai_log_modal.hidden) document.body.classList.remove("modal-open");
  elements.load_page_images.focus();
}

function defaultTaskName(image) {
  const label = image.productTitle || image.sku || image.alt || image.title;
  if (label && !["拖入的网页图片", "拖入的本地图片"].includes(label)) return label.slice(0, 120);
  return `搜款任务 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
}

function sourceSiteFromUrl(value) {
  try {
    const url = new URL(value || "");
    return ["http:", "https:"].includes(url.protocol) ? url.hostname : null;
  } catch {
    return null;
  }
}

function setDraft(image) {
  state.draft = image;
  elements.draft_panel.hidden = false;
  elements.draft_preview.src = image.previewUrl || image.url;
  elements.task_name.value = defaultTaskName(image);
  const size = image.width && image.height ? `${image.width} × ${image.height}` : "图片尺寸待读取";
  elements.draft_meta.textContent = `${size} · ${image.source === "drop" ? "拖入图片" : "当前页面"}`;
  elements.task_name.focus();
  showNotice("图片已准备好，确认名称后创建任务", "success");
}

function discardDraft() {
  if (state.draft?.objectUrl) URL.revokeObjectURL(state.draft.objectUrl);
  state.draft = null;
  elements.draft_panel.hidden = true;
  elements.draft_preview.removeAttribute("src");
  elements.task_name.value = "";
  showNotice("", "info");
}

function imageFromDroppedUrl(url) {
  try {
    const parsed = new URL(url, state.tab?.url);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return { id: `drop-${Date.now()}`, url: parsed.href, previewUrl: parsed.href, width: 0, height: 0, alt: "拖入的网页图片", title: "", source: "drop", sourcePage: state.tab?.url || null };
  } catch { return null; }
}

function readDroppedFile(file) {
  return new Promise((resolve, reject) => {
    if (!SUPPORTED_DROP_TYPES.has(file.type.toLowerCase())) return reject(new Error("仅支持 JPG、PNG、WebP、GIF 或 AVIF 图片"));
    const reader = new FileReader();
    reader.onload = () => {
      const objectUrl = URL.createObjectURL(file);
      resolve({ id: `drop-file-${Date.now()}`, url: objectUrl, objectUrl, previewUrl: objectUrl, imageDataUrl: reader.result, width: 0, height: 0, alt: file.name || "拖入的本地图片", title: file.name || "", source: "drop", sourcePage: null });
    };
    reader.onerror = () => reject(new Error("无法读取图片文件"));
    reader.readAsDataURL(file);
  });
}

function droppedImageUrl(dataTransfer) {
  const html = dataTransfer?.getData("text/html") || "";
  if (html) {
    const source = new DOMParser().parseFromString(html, "text/html").querySelector("img")?.getAttribute("src");
    if (source) return source;
  }
  return dataTransfer?.getData("text/uri-list")?.split(/\r?\n/u).find((value) => value && !value.startsWith("#")) || dataTransfer?.getData("text/plain") || "";
}

async function acceptDroppedData(dataTransfer) {
  const file = [...(dataTransfer?.files || [])][0];
  const image = file ? await readDroppedFile(file) : imageFromDroppedUrl(droppedImageUrl(dataTransfer).trim());
  if (!image) throw new Error("没有识别到图片，请拖入图片本身");
  setDraft(image);
}

async function extensionMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "扩展操作失败");
  return response;
}

async function createTask() {
  if (!requireAuthenticated()) return;
  if (!state.draft) return;
  const name = elements.task_name.value.trim() || defaultTaskName(state.draft);
  elements.create_task.disabled = true;
  elements.create_task.textContent = "创建中…";
  try {
    await extensionMessage({
      type: "CREATE_TASK",
      task: {
        name,
        productTitle: name,
        description: null,
        sku: null,
        sourceSite: sourceSiteFromUrl(state.draft.sourcePage || state.tab?.url),
        productUrl: state.draft.sourcePage || state.tab?.url || null,
        images: [{ ...state.draft, url: state.draft.imageDataUrl || state.draft.url }],
        options: { ...state.searchOptions },
      },
    });
    discardDraft();
    showNotice(`采集任务“${name}”已保存，请到采集任务中选择搜图图片`, "success");
    await loadTasks();
    await loadAccount({ quiet: true });
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error), "error");
  } finally {
    elements.create_task.disabled = false;
    elements.create_task.textContent = "创建任务";
  }
}

async function loadTasks() {
  try {
    const response = await extensionMessage({ type: "GET_TASKS" });
    updateTasks(response.tasks);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    elements.queue_summary.textContent = "任务加载失败";
    elements.task_list.replaceChildren(managementEmpty("任务加载失败", message));
    return false;
  }
}

function taskStatus(task) {
  if (task.collectionStatus === "imported") {
    return { label: `已导入 ${task.importedCount || 0} 个`, className: "completed" };
  }
  return {
    queued: { label: "待选搜索图", className: "queued" },
    running: { label: "搜图中", className: "running" },
    completed: { label: `${task.resultCount || 0} 个结果`, className: "completed" },
    failed: { label: "搜图失败", className: "failed" },
  }[task.status] || { label: task.status, className: "queued" };
}

let viewerScale = 1;
let viewerX = 0;
let viewerY = 0;
let viewerDragging = false;
let viewerStartX = 0;
let viewerStartY = 0;

function renderViewer() {
  const transform = `translate(${viewerX}px, ${viewerY}px) scale(${viewerScale})`;
  elements.viewer_original_image.style.transform = transform;
  elements.viewer_result_image.style.transform = transform;
  elements.viewer_reset.textContent = `${Math.round(viewerScale * 100)}%`;
}

function openImageViewer(originalUrl, resultUrl, title) {
  elements.viewer_title.textContent = title || "图片预览";
  elements.viewer_original_image.src = originalUrl || resultUrl;
  elements.viewer_result_image.src = resultUrl || originalUrl;
  viewerScale = 1;
  viewerX = 0;
  viewerY = 0;
  renderViewer();
  elements.image_viewer.hidden = false;
  document.body.classList.add("viewer-open");
}

function closeImageViewer() {
  elements.image_viewer.hidden = true;
  elements.viewer_original_image.removeAttribute("src");
  elements.viewer_result_image.removeAttribute("src");
  document.body.classList.remove("viewer-open");
}

function availableImportStores() {
  return state.stores.filter((store) => store?.status === "active" && store?.configured);
}

function resultImportedToStore(result, storeId) {
  return Boolean(storeId && Array.isArray(result?.shopifyImports) && result.shopifyImports.some((item) => item?.storeId === storeId));
}

function currentResultsTask() {
  return state.tasks.find((task) => task.id === state.resultsTaskId) || null;
}

function currentResultsRun(task) {
  return Array.isArray(task?.runs) ? task.runs.find((run) => run?.status === "completed") || null : null;
}

function createResultCard(result, task, run) {
  const detailUrl = result.detailUrl || `https://detail.1688.com/offer/${encodeURIComponent(result.offerId)}.html`;
  const card = document.createElement("article");
  card.className = "result-row";
  const imported = resultImportedToStore(result, state.resultsStoreId);
  card.classList.toggle("imported", imported);
  const image = document.createElement("button");
  image.type = "button";
  image.className = "result-thumb";
  image.title = "查看大图";
  if (result.imageUrl) {
    const img = document.createElement("img");
    img.src = result.imageUrl;
    img.alt = "";
    img.loading = "lazy";
    image.append(img);
    image.addEventListener("click", async () => {
      const originalImageUrl = task.previewUrl || task.imageUrl || result.imageUrl;
      const viewerTitle = result.title || "图片预览";
      try {
        const response = await extensionMessage({
          type: "OPEN_IMAGE_VIEWER",
          originalImageUrl,
          resultImageUrl: result.imageUrl,
          title: viewerTitle,
        });
        if (!response.opened) openImageViewer(originalImageUrl, result.imageUrl, viewerTitle);
      } catch {
        openImageViewer(originalImageUrl, result.imageUrl, viewerTitle);
      }
    });
  }
  const copy = document.createElement("span");
  copy.className = "result-copy";
  const title = document.createElement("strong");
  const titleLink = document.createElement("a");
  titleLink.href = detailUrl;
  titleLink.target = "_blank";
  titleLink.rel = "noreferrer";
  titleLink.textContent = result.title;
  title.append(titleLink);
  const meta = document.createElement("small");
  meta.textContent = [formatMoney(result.promotionPrice ?? result.price), result.supplierName, result.sales ? `${result.sales} 销量` : null].filter(Boolean).join(" · ");
  const importButton = document.createElement("button");
  importButton.type = "button";
  importButton.className = `button ${imported ? "quiet" : "primary"} compact result-import-button`;
  importButton.textContent = imported
    ? "当前店铺已导入"
    : state.resultsImportingKey === String(result.offerId || "")
      ? "正在导入…"
      : "导入 Shopify";
  importButton.disabled = imported || !result.offerId || !run || !state.resultsStoreId || Boolean(state.resultsImportingKey);
  importButton.title = state.resultsStoreId ? "导入到当前 Shopify 店铺" : "请先选择 Shopify 店铺";
  importButton.addEventListener("click", () => void importResultsFromModal([result.offerId]));
  copy.append(title, meta, importButton);
  card.append(image, copy);
  return card;
}

function renderResultsModal() {
  const task = currentResultsTask();
  if (!task) return;
  const run = currentResultsRun(task);
  const stores = availableImportStores();
  if (!stores.some((store) => store.id === state.resultsStoreId)) state.resultsStoreId = stores[0]?.id || "";
  elements.results_modal_heading.textContent = task.name || "搜图结果";
  elements.results_modal_meta.textContent = `${task.resultCount || task.results?.length || 0} 个结果`;
  elements.results_store.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = stores.length ? "选择 Shopify 店铺" : "没有可用的 Shopify 店铺";
  elements.results_store.append(placeholder);
  for (const store of stores) {
    const option = document.createElement("option");
    option.value = store.id;
    option.textContent = store.displayName || store.shopDomain;
    elements.results_store.append(option);
  }
  elements.results_store.value = state.resultsStoreId;
  elements.results_store.disabled = Boolean(state.resultsImportingKey) || stores.length === 0;
  const pendingOfferIds = (task.results || []).flatMap((result) => result.offerId && !resultImportedToStore(result, state.resultsStoreId) ? [result.offerId] : []);
  elements.results_import_all.disabled = !run || !state.resultsStoreId || pendingOfferIds.length === 0 || Boolean(state.resultsImportingKey);
  elements.results_import_all.textContent = state.resultsImportingKey === "all" ? "正在导入…" : pendingOfferIds.length ? `全部导入 Shopify（${pendingOfferIds.length}）` : "当前店铺已全部导入";
  elements.results_import_status.className = `results-import-status${state.resultsMessageTone ? ` ${state.resultsMessageTone}` : ""}`;
  elements.results_import_status.textContent = state.resultsMessage || (stores.length ? "选择目标店铺后，可单条或批量导入搜图结果。" : "请先在 Mailshop 后台连接并验证 Shopify 店铺。");
  elements.results_modal_grid.replaceChildren();
  if (task.results?.length) {
    task.results.forEach((result) => elements.results_modal_grid.append(createResultCard(result, task, run)));
  } else {
    elements.results_modal_grid.innerHTML = '<div class="no-results">没有找到匹配货源，可以换一张图片重新创建任务。</div>';
  }
}

async function importResultsFromModal(offerIds) {
  const task = currentResultsTask();
  const run = currentResultsRun(task);
  const values = [...new Set((offerIds || []).filter(Boolean))];
  if (!task || !run || !state.resultsStoreId || !values.length || state.resultsImportingKey) return;
  state.resultsImportingKey = values.length === 1 ? values[0] : "all";
  state.resultsMessage = `正在导入 ${values.length} 个商品到 Shopify…`;
  state.resultsMessageTone = "";
  renderResultsModal();
  try {
    const response = await extensionMessage({
      type: "IMPORT_TASK_RESULTS",
      taskId: task.id,
      runId: run.id,
      storeId: state.resultsStoreId,
      offerIds: values,
    });
    const importedCount = Array.isArray(response.imported) ? response.imported.length : 0;
    const failureCount = Array.isArray(response.failures) ? response.failures.length : 0;
    state.resultsMessage = failureCount
      ? `已导入 ${importedCount} 个，${failureCount} 个失败。可重试失败项。`
      : `已导入 ${importedCount} 个 Shopify 商品。`;
    state.resultsMessageTone = failureCount ? "error" : "success";
    await loadTasks();
  } catch (error) {
    state.resultsMessage = error instanceof Error ? error.message : String(error);
    state.resultsMessageTone = "error";
  } finally {
    state.resultsImportingKey = "";
    renderResultsModal();
  }
}

async function openResultsModal(task) {
  state.resultsTaskId = task.id;
  state.resultsMessage = "";
  state.resultsMessageTone = "";
  elements.results_modal.hidden = false;
  document.body.classList.add("modal-open");
  renderResultsModal();
  await loadManagement("stores");
  renderResultsModal();
  elements.results_modal_close.focus();
}

function closeResultsModal() {
  elements.results_modal.hidden = true;
  elements.results_modal_grid.replaceChildren();
  state.resultsTaskId = null;
  state.resultsImportingKey = "";
  state.resultsMessage = "";
  state.resultsMessageTone = "";
  if (elements.image_modal.hidden && elements.ai_error_modal.hidden && elements.ai_log_modal.hidden) document.body.classList.remove("modal-open");
}

function createTaskCard(task) {
  const status = taskStatus(task);
  const article = document.createElement("article");
  article.className = `task-card ${status.className}`;
  article.dataset.taskId = task.id;
  let selectedImageId = task.selectedImageId || null;

  const main = document.createElement("div");
  main.className = "task-product-main";
  const copy = document.createElement("div");
  copy.className = "task-product-copy";
  const headline = document.createElement("div");
  headline.className = "task-headline";
  const title = document.createElement("h3");
  title.textContent = task.productTitle || task.name;
  const badge = document.createElement("span");
  badge.className = `status-badge ${status.className}`;
  badge.textContent = status.label;
  headline.append(title, badge);
  const metadata = document.createElement("p");
  metadata.className = "task-product-meta";
  metadata.textContent = [task.sku ? `SKU ${task.sku}` : null, task.sourceSite, formatTime(task.createdAt)].filter(Boolean).join(" · ");
  copy.append(headline, metadata);
  if (task.description) {
    const description = document.createElement("p");
    description.className = "task-description";
    description.textContent = task.description;
    copy.append(description);
  }
  if (task.productUrl || task.sourcePage) {
    const source = document.createElement("a");
    source.className = "task-source-link";
    source.href = task.productUrl || task.sourcePage;
    source.target = "_blank";
    source.rel = "noreferrer";
    source.textContent = "打开商品页面";
    copy.append(source);
  }
  main.append(copy);

  const actions = document.createElement("div");
  actions.className = "task-actions";
  if (task.status === "completed") {
    const toggle = document.createElement("button");
    toggle.className = "button quiet compact";
    toggle.type = "button";
    toggle.textContent = "查看结果";
    toggle.addEventListener("click", () => void openResultsModal(task));
    actions.append(toggle);
  }
  if (task.status === "failed" && task.error) {
    const error = document.createElement("p");
    error.className = "task-error";
    error.textContent = task.error || "搜图失败";
    copy.append(error);
  }
  const remove = document.createElement("button");
  remove.className = "icon-delete";
  remove.type = "button";
  remove.title = "删除任务";
  remove.setAttribute("aria-label", `删除任务 ${task.name}`);
  remove.textContent = "×";
  remove.addEventListener("click", async () => { await extensionMessage({ type: "DELETE_TASK", taskId: task.id }); await loadTasks(); });
  actions.append(remove);
  article.append(main, actions);

  const imageSection = document.createElement("section");
  imageSection.className = "task-image-section";
  const imageHeading = document.createElement("div");
  imageHeading.className = "task-image-heading";
  const imageTitle = document.createElement("strong");
  imageTitle.textContent = `源图片 ${(task.images || []).length} 张`;
  const imageHint = document.createElement("span");
  imageHint.textContent = selectedImageId ? "已选择搜索图" : "请选择一张图片用于 1688 搜索";
  imageHeading.append(imageTitle, imageHint);
  const imageStrip = document.createElement("div");
  imageStrip.className = "task-image-strip";
  const imageButtons = [];
  for (const [index, taskImage] of (task.images || []).entries()) {
    const button = document.createElement("button");
    button.className = "task-source-image";
    button.type = "button";
    button.title = `选择第 ${index + 1} 张图片`;
    button.setAttribute("aria-label", `选择第 ${index + 1} 张图片用于 1688 搜索`);
    button.setAttribute("aria-pressed", String(taskImage.id === selectedImageId));
    button.classList.toggle("selected", taskImage.id === selectedImageId);
    const image = document.createElement("img");
    image.src = taskImage.url;
    image.alt = "";
    image.loading = "lazy";
    const marker = document.createElement("span");
    marker.textContent = String(index + 1);
    button.append(image, marker);
    button.addEventListener("click", () => {
      if (task.status === "running") return;
      selectedImageId = taskImage.id;
      imageHint.textContent = `已选择第 ${index + 1} 张图片`;
      for (const candidate of imageButtons) {
        const selected = candidate.dataset.imageId === selectedImageId;
        candidate.classList.toggle("selected", selected);
        candidate.setAttribute("aria-pressed", String(selected));
      }
      searchButton.disabled = false;
    });
    button.dataset.imageId = taskImage.id;
    button.disabled = task.status === "running";
    imageButtons.push(button);
    imageStrip.append(button);
  }
  imageSection.append(imageHeading, imageStrip);

  const searchFooter = document.createElement("footer");
  searchFooter.className = "task-search-footer";
  const searchCost = document.createElement("span");
  searchCost.textContent = "执行搜索将扣除 20 积分";
  const searchButton = document.createElement("button");
  searchButton.className = "button primary compact";
  searchButton.type = "button";
  searchButton.textContent = task.status === "failed" ? "重新搜索 1688" : "使用此图搜索 1688";
  searchButton.disabled = !selectedImageId || task.status === "running";
  searchButton.addEventListener("click", async () => {
    if (!requireSearchAccess()) return;
    if (!selectedImageId) {
      showNotice("请先选择一张任务图片", "error");
      return;
    }
    searchButton.disabled = true;
    searchButton.textContent = "正在搜索…";
    try {
      await extensionMessage({ type: "SEARCH_TASK", taskId: task.id, imageId: selectedImageId });
      await Promise.all([loadTasks(), loadAccount({ quiet: true })]);
      showNotice("1688 搜索完成，结果已保存到任务", "success");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error), "error");
    }
  });
  searchFooter.append(searchCost, searchButton);
  article.append(imageSection, searchFooter);

  if (task.status === "running") {
    const progress = document.createElement("div");
    progress.className = "task-progress";
    progress.setAttribute("aria-label", "搜图进行中");
    article.append(progress);
  }
  return article;
}

function taskStateKey(tasks) {
  return tasks.map((task) => [
    task.id,
    task.status,
    task.collectionStatus || "",
    task.updatedAt,
    task.resultCount,
    task.importedCount || 0,
    task.error,
    task.results?.length || 0,
    task.selectedImageId || "",
    task.images?.length || 0,
  ].join("|")).join("||");
}

let taskListRendered = false;

function updateTasks(nextTasks) {
  const tasks = Array.isArray(nextTasks) ? nextTasks : [];
  if (taskListRendered && taskStateKey(tasks) === taskStateKey(state.tasks)) {
    state.tasks = tasks;
    return;
  }
  const scrollTop = document.scrollingElement?.scrollTop || 0;
  state.tasks = tasks;
  renderTasks();
  requestAnimationFrame(() => {
    if (document.scrollingElement) document.scrollingElement.scrollTop = scrollTop;
  });
}

function renderTasks() {
  taskListRendered = true;
  elements.task_list.replaceChildren();
  const pending = state.tasks.filter((task) => task.status === "queued").length;
  const running = state.tasks.filter((task) => task.status === "running").length;
  const completed = state.tasks.filter((task) => task.status === "completed").length;
  elements.queue_summary.textContent = state.tasks.length ? `${state.tasks.length} 个任务 · ${pending} 个待选图 · ${running} 个搜索中 · ${completed} 个已完成` : "还没有任务";
  elements.clear_finished.hidden = !state.tasks.some((task) => ["completed", "failed"].includes(task.status));
  if (!state.tasks.length) {
    elements.task_list.append(document.querySelector("#empty-task-template").content.cloneNode(true));
    return;
  }
  state.tasks.forEach((task) => elements.task_list.append(createTaskCard(task)));
}

function managementEmpty(title, detail) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const span = document.createElement("span");
  span.textContent = detail;
  empty.append(strong, span);
  return empty;
}

function renderStores() {
  elements.stores_list.replaceChildren();
  elements.stores_summary.textContent = state.stores.length ? `${state.stores.length} 个 Shopify 店铺` : "Shopify 店铺连接状态";
  if (!state.stores.length) {
    elements.stores_list.append(managementEmpty("暂无店铺", "请在服务器端店铺管理中添加 Shopify 店铺。"));
    return;
  }
  for (const store of state.stores) {
    const article = document.createElement("article"); article.className = "management-row store-row";
    const copy = document.createElement("div"); copy.className = "management-copy";
    const title = document.createElement("strong"); title.textContent = store.displayName || store.shopDomain;
    const meta = document.createElement("span"); meta.textContent = store.shopDomain;
    const detail = document.createElement("small"); detail.textContent = store.lastError || (store.lastVerifiedAt ? `最近验证 ${formatTime(store.lastVerifiedAt)}` : "尚未验证连接");
    const badge = document.createElement("span"); badge.className = `status-badge ${store.status === "active" ? "completed" : store.status === "error" ? "failed" : "queued"}`; badge.textContent = store.status;
    copy.append(title, meta, detail);
    article.append(copy, badge);
    elements.stores_list.append(article);
  }
}

function creditReason(reason) {
  return ({ "image_search.charge": "1688 图片搜索", "image_search.refund": "搜索失败退款", "ai.charge": "AI 请求", "ai.refund": "AI 请求失败退款", "product_detail.charge": "商品详情", "product_detail.refund": "详情请求失败退款", "admin.credit_adjust": "管理员调整" })[reason] || reason || "积分变动";
}

function renderCredits() {
  const credits = state.credits || { balance: 0, transactions: [] };
  elements.credits_balance_card.replaceChildren();
  const label = document.createElement("span"); label.textContent = "当前可用积分";
  const balance = document.createElement("strong"); balance.textContent = Number(credits.balance || 0).toLocaleString("zh-CN");
  const note = document.createElement("small"); note.textContent = `可执行 ${Math.floor(Number(credits.balance || 0) / 20)} 次 1688 图片搜索`;
  elements.credits_balance_card.append(label, balance, note);
  elements.credits_list.replaceChildren();
  const transactions = Array.isArray(credits.transactions) ? credits.transactions : [];
  if (!transactions.length) {
    elements.credits_list.append(managementEmpty("暂无积分记录", "积分消费和退款会显示在这里。"));
    return;
  }
  for (const transaction of transactions) {
    const article = document.createElement("article"); article.className = "management-row credit-row";
    const copy = document.createElement("div"); copy.className = "management-copy";
    const title = document.createElement("strong"); title.textContent = creditReason(transaction.reason);
    const meta = document.createElement("small"); meta.textContent = `${formatTime(transaction.createdAt)} · 余额 ${Number(transaction.balanceAfter || 0).toLocaleString("zh-CN")}`;
    const amount = document.createElement("span"); amount.className = `credit-amount ${Number(transaction.amount) >= 0 ? "positive" : "negative"}`; amount.textContent = `${Number(transaction.amount) > 0 ? "+" : ""}${Number(transaction.amount || 0)}`;
    copy.append(title, meta); article.append(copy, amount); elements.credits_list.append(article);
  }
}

async function loadManagement(resource) {
  if (!state.account?.authenticated || state.managementLoading.has(resource)) return;
  state.managementLoading.add(resource);
  try {
    const response = await extensionMessage({ type: "GET_MANAGEMENT_DATA", resource });
    if (resource === "stores") {
      state.stores = Array.isArray(response.stores) ? response.stores : [];
      renderStores();
      if (!elements.results_modal.hidden) renderResultsModal();
    }
    if (resource === "credits") { state.credits = response.credits || null; renderCredits(); }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const list = elements[`${resource}_list`];
    if (list) list.replaceChildren(managementEmpty("加载失败", message));
    if (resource === "credits") elements.credits_balance_card.replaceChildren();
  } finally {
    state.managementLoading.delete(resource);
  }
}

function openView(view) {
  showAccountNotice("");
  state.activeView = view;
  renderView();
  if (view === "tasks") void loadTasks();
  if (["stores", "credits"].includes(view)) void loadManagement(view);
  if (view === "settings") void loadAiLogs();
}

elements.account_login.addEventListener("click", async () => {
  try {
    showAccountNotice("正在打开后台登录页面", "info");
    await extensionMessage({ type: "OPEN_LOGIN" });
    await loadAccount({ quiet: true });
    showAccountNotice(state.account?.authenticated ? "登录成功，账号和积分已同步" : "登录未完成，请重试", state.account?.authenticated ? "success" : "error");
  } catch (error) {
    showAccountNotice(error instanceof Error ? error.message : String(error), "error");
  }
});
elements.account_refresh.addEventListener("click", () => void loadAccount());
elements.account_logout.addEventListener("click", async () => {
  try {
    await extensionMessage({ type: "LOGOUT" });
    await loadAccount({ quiet: true });
    showAccountNotice("已退出 Mailshop 账号", "success");
  } catch (error) {
    showAccountNotice(error instanceof Error ? error.message : String(error), "error");
  }
});
elements.view_workspace.addEventListener("click", () => openView("workspace"));
elements.view_tasks.addEventListener("click", () => openView("tasks"));
elements.view_stores.addEventListener("click", () => openView("stores"));
elements.view_credits.addEventListener("click", () => openView("credits"));
elements.view_settings.addEventListener("click", () => openView("settings"));
elements.settings_back.addEventListener("click", () => openView("workspace"));
elements.refresh_stores.addEventListener("click", () => void loadManagement("stores"));
elements.refresh_credits.addEventListener("click", () => void loadManagement("credits"));
elements.load_page_images.addEventListener("click", () => openImageModal("manual"));
elements.ai_analyze_page.addEventListener("click", () => openImageModal("ai"));
elements.close_image_modal.addEventListener("click", closeImageModal);
elements.modal_backdrop.addEventListener("click", closeImageModal);
elements.refresh_images.addEventListener("click", () => void scanCurrentPage());
elements.toggle_image_selection.addEventListener("click", () => {
  const allSelected = state.pageImages.length > 0 && state.pageImages.every((image) => state.selectedPageImageIds.has(image.id));
  state.selectedPageImageIds = allSelected ? new Set() : new Set(state.pageImages.map((image) => image.id));
  renderImageGrid();
});
elements.create_selected_tasks.addEventListener("click", () => void createSelectedTasks());
elements.image_filter.addEventListener("input", (event) => { state.filter = event.target.value; renderImageGrid(); });
elements.hide_small.addEventListener("change", (event) => { state.hideSmall = event.target.checked; renderImageGrid(); });
elements.ignore_svg.addEventListener("change", (event) => { state.ignoreSvg = event.target.checked; renderImageGrid(); });
elements.product_only.addEventListener("change", (event) => { state.productOnly = event.target.checked; renderImageGrid(); });
elements.discard_draft.addEventListener("click", discardDraft);
elements.create_task.addEventListener("click", () => void createTask());
elements.task_name.addEventListener("keydown", (event) => { if (event.key === "Enter") void createTask(); });
function renderAiUsage() {
  elements.ai_mode_server.checked = state.aiUsage.mode === "server";
  elements.ai_mode_custom.checked = state.aiUsage.mode === "custom";
  elements.custom_ai_config.hidden = state.aiUsage.mode !== "custom";
  renderAccount();
}

function aiLogActionLabel(action) {
  return action === "config_test" ? "配置测试" : action === "page_html_extraction" ? "页面 HTML 提取" : action === "page_image_analysis" ? "页面区域识别" : action === "page_region_extraction" ? "区域内容提取" : action || "AI 请求";
}

function formatAiLogJson(value) {
  try { return JSON.stringify(value ?? null, null, 2); } catch { return String(value); }
}

function createAiLogJsonBlock(label, value) {
  const block = document.createElement("section");
  block.className = "ai-log-json-block";
  const heading = document.createElement("div");
  heading.className = "ai-log-json-heading";
  const name = document.createElement("strong");
  name.textContent = label;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "button quiet compact";
  copy.textContent = "复制";
  const json = formatAiLogJson(value);
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(json);
      copy.textContent = "已复制";
      window.setTimeout(() => { copy.textContent = "复制"; }, 1_200);
    } catch {
      copy.textContent = "复制失败";
      window.setTimeout(() => { copy.textContent = "复制"; }, 1_200);
    }
  });
  heading.append(name, copy);
  const pre = document.createElement("pre");
  pre.textContent = json;
  block.append(heading, pre);
  return block;
}

function openAiLogModal(log) {
  const status = log.status ? `HTTP ${log.status}` : "请求失败";
  elements.ai_log_modal_heading.textContent = `${aiLogActionLabel(log.action)} · ${log.source === "custom" ? "自定义 AI" : "服务器 AI"}`;
  elements.ai_log_modal_meta.textContent = `${status} · ${Number(log.elapsedMs || 0)}ms · ${formatTime(log.createdAt)}`;
  elements.ai_log_modal_content.replaceChildren(
    createAiLogJsonBlock("请求 JSON", log.request),
    createAiLogJsonBlock("服务器返回 JSON", log.response),
  );
  elements.ai_log_modal.hidden = false;
  document.body.classList.add("modal-open");
  elements.ai_log_modal_close.focus();
}

function closeAiLogModal() {
  elements.ai_log_modal.hidden = true;
  elements.ai_log_modal_content.replaceChildren();
  if (elements.image_modal.hidden && elements.results_modal.hidden && elements.ai_error_modal.hidden) document.body.classList.remove("modal-open");
}

function renderAiLogs() {
  elements.ai_request_log_summary.textContent = `最近 ${state.aiLogs.length} 条`;
  elements.clear_ai_logs.disabled = state.aiLogs.length === 0;
  elements.ai_request_logs.replaceChildren();
  if (!state.aiLogs.length) {
    const empty = document.createElement("div");
    empty.className = "ai-log-empty";
    empty.textContent = "还没有 AI 请求日志";
    elements.ai_request_logs.append(empty);
    return;
  }
  for (const log of state.aiLogs) {
    const item = document.createElement("article");
    item.className = `ai-log-item ${log.ok ? "success" : "failed"}`;
    const summary = document.createElement("button");
    summary.type = "button";
    summary.className = "ai-log-summary";
    summary.setAttribute("aria-haspopup", "dialog");
    summary.setAttribute("aria-controls", "ai-log-modal");
    const main = document.createElement("span");
    main.className = "ai-log-main";
    const title = document.createElement("strong");
    title.textContent = `${aiLogActionLabel(log.action)} · ${log.source === "custom" ? "自定义 AI" : "服务器 AI"}`;
    const url = document.createElement("small");
    url.textContent = log.url || "";
    main.append(title, url);
    const meta = document.createElement("span");
    meta.className = "ai-log-meta";
    const status = log.status ? `HTTP ${log.status}` : "请求失败";
    meta.textContent = `${status} · ${Number(log.elapsedMs || 0)}ms · ${formatTime(log.createdAt)}`;
    summary.append(main, meta);
    item.append(summary);
    summary.addEventListener("click", () => {
      openAiLogModal(log);
    });
    elements.ai_request_logs.append(item);
  }
}

async function loadAiLogs() {
  const response = await extensionMessage({ type: "GET_AI_LOGS" });
  state.aiLogs = Array.isArray(response.logs) ? response.logs : [];
  renderAiLogs();
}

function readAiUsageForm() {
  return {
    mode: elements.ai_mode_custom.checked ? "custom" : "server",
    baseUrl: elements.custom_ai_url.value.trim(),
    apiKey: elements.custom_ai_key.value.trim(),
    imageFilterModelId: elements.custom_ai_model.value.trim(),
  };
}

async function saveAiUsage() {
  window.clearTimeout(aiUsageSaveTimer);
  aiUsageSaveTimer = null;
  state.aiUsage = readAiUsageForm();
  const response = await extensionMessage({ type: "SAVE_AI_USAGE", config: state.aiUsage });
  state.aiUsage = response.config;
  renderAiUsage();
  return response.config;
}

let aiUsageSaveTimer = null;
function scheduleAiUsageSave() {
  state.aiUsage = readAiUsageForm();
  renderAiUsage();
  window.clearTimeout(aiUsageSaveTimer);
  aiUsageSaveTimer = window.setTimeout(async () => {
    try {
      await saveAiUsage();
    } catch (error) {
      elements.ai_config_status.textContent = "自动保存失败";
      showAiErrorLog(error, "保存配置");
    }
  }, 250);
}

function showAiErrorLog(error, action = "AI 测试") {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const backgroundOutdated = /未知扩展消息|unknown extension message/iu.test(rawMessage);
  const message = backgroundOutdated
    ? "插件后台仍在运行旧版本。请点击“重新加载插件”，然后重新打开插件并再次测试。"
    : rawMessage;
  elements.reload_extension.hidden = !backgroundOutdated;
  elements.ai_error_log.textContent = JSON.stringify({
    time: new Date().toISOString(),
    action,
    mode: state.aiUsage.mode,
    baseUrl: state.aiUsage.baseUrl || "服务器配置",
    imageFilterModelId: state.aiUsage.imageFilterModelId || "服务器托管模型",
    extensionVersion: chrome.runtime.getManifest().version,
    errorCode: backgroundOutdated ? "extension_background_outdated" : "ai_test_failed",
    error: message,
  }, null, 2);
  elements.ai_error_modal.hidden = false;
  document.body.classList.add("modal-open");
  elements.ai_error_close.focus();
}

function closeAiErrorLog() {
  elements.ai_error_modal.hidden = true;
  elements.reload_extension.hidden = true;
  if (elements.image_modal.hidden && elements.results_modal.hidden && elements.ai_log_modal.hidden) document.body.classList.remove("modal-open");
}

async function testAiUsage() {
  const config = readAiUsageForm();
  state.aiUsage = config;
  elements.test_ai_config.disabled = true;
  elements.save_ai_config.disabled = true;
  elements.ai_config_status.textContent = "正在测试连接…";
  try {
    await extensionMessage({ type: "TEST_AI_USAGE", config });
    elements.ai_config_status.textContent = "连接成功";
    await loadAiLogs();
  } catch (error) {
    elements.ai_config_status.textContent = "测试失败";
    await loadAiLogs().catch(() => undefined);
    showAiErrorLog(error, "测试配置");
  } finally {
    elements.test_ai_config.disabled = false;
    elements.save_ai_config.disabled = false;
  }
}

for (const element of [elements.ai_mode_server, elements.ai_mode_custom]) element.addEventListener("change", scheduleAiUsageSave);
for (const element of [elements.custom_ai_url, elements.custom_ai_key, elements.custom_ai_model]) {
  element.addEventListener("input", scheduleAiUsageSave);
  element.addEventListener("change", scheduleAiUsageSave);
}
elements.save_ai_config.addEventListener("click", async () => {
  elements.save_ai_config.disabled = true;
  try {
    await saveAiUsage();
    elements.ai_config_status.textContent = "配置已保存";
  } catch (error) {
    elements.ai_config_status.textContent = "保存失败";
    showAiErrorLog(error, "保存配置");
  } finally {
    elements.save_ai_config.disabled = false;
  }
});
elements.test_ai_config.addEventListener("click", () => void testAiUsage());
elements.refresh_ai_logs.addEventListener("click", () => void loadAiLogs());
elements.clear_ai_logs.addEventListener("click", async () => {
  elements.clear_ai_logs.disabled = true;
  try {
    await extensionMessage({ type: "CLEAR_AI_LOGS" });
    state.aiLogs = [];
    renderAiLogs();
  } catch (error) {
    showAiErrorLog(error, "清空 AI 日志");
  }
});

function updateSearchOptions() {
  state.searchOptions = {
    sort: elements.search_sort.value,
    limit: Math.min(50, Math.max(10, Number(elements.search_limit.value) || 30)),
    cache: elements.search_cache.value,
    lang: elements.search_lang.value,
  };
  elements.search_limit.value = String(state.searchOptions.limit);
  void chrome.storage.local.set({ searchOptions: state.searchOptions });
}
for (const element of [elements.search_sort, elements.search_limit, elements.search_cache, elements.search_lang]) {
  element.addEventListener("change", updateSearchOptions);
  element.addEventListener("input", updateSearchOptions);
}
elements.clear_finished.addEventListener("click", async () => { await extensionMessage({ type: "CLEAR_FINISHED_TASKS" }); await loadTasks(); });
elements.results_modal_close.addEventListener("click", closeResultsModal);
elements.results_modal_backdrop.addEventListener("click", closeResultsModal);
elements.results_store.addEventListener("change", () => {
  state.resultsStoreId = elements.results_store.value;
  state.resultsMessage = "";
  state.resultsMessageTone = "";
  renderResultsModal();
});
elements.results_import_all.addEventListener("click", () => {
  const task = currentResultsTask();
  const pendingOfferIds = (task?.results || []).flatMap((result) => result.offerId && !resultImportedToStore(result, state.resultsStoreId) ? [result.offerId] : []);
  void importResultsFromModal(pendingOfferIds);
});
elements.ai_error_close.addEventListener("click", closeAiErrorLog);
elements.ai_error_backdrop.addEventListener("click", closeAiErrorLog);
elements.ai_log_modal_close.addEventListener("click", closeAiLogModal);
elements.ai_log_modal_backdrop.addEventListener("click", closeAiLogModal);
elements.reload_extension.addEventListener("click", () => chrome.runtime.reload());
elements.viewer_close.addEventListener("click", closeImageViewer);
elements.viewer_backdrop.addEventListener("click", closeImageViewer);
elements.viewer_reset.addEventListener("click", () => { viewerScale = 1; viewerX = 0; viewerY = 0; renderViewer(); });
elements.viewer_stage.addEventListener("pointerdown", (event) => {
  viewerDragging = true;
  viewerStartX = event.clientX - viewerX;
  viewerStartY = event.clientY - viewerY;
  elements.viewer_stage.classList.add("dragging");
  elements.viewer_stage.setPointerCapture(event.pointerId);
});
elements.viewer_stage.addEventListener("pointermove", (event) => {
  if (!viewerDragging) return;
  viewerX = event.clientX - viewerStartX;
  viewerY = event.clientY - viewerStartY;
  renderViewer();
});
elements.viewer_stage.addEventListener("pointerup", () => { viewerDragging = false; elements.viewer_stage.classList.remove("dragging"); });
elements.viewer_stage.addEventListener("pointercancel", () => { viewerDragging = false; elements.viewer_stage.classList.remove("dragging"); });
elements.viewer_stage.addEventListener("wheel", (event) => {
  event.preventDefault();
  viewerScale = Math.min(5, Math.max(.25, viewerScale * (event.deltaY < 0 ? 1.12 : .89)));
  renderViewer();
}, { passive: false });

elements.drop_zone.addEventListener("click", () => elements.file_picker.click());
elements.drop_zone.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); elements.file_picker.click(); } });
elements.drop_zone.addEventListener("dragenter", (event) => { event.preventDefault(); elements.drop_zone.classList.add("dragging"); });
elements.drop_zone.addEventListener("dragover", (event) => { event.preventDefault(); elements.drop_zone.classList.add("dragging"); });
elements.drop_zone.addEventListener("dragleave", (event) => { if (!elements.drop_zone.contains(event.relatedTarget)) elements.drop_zone.classList.remove("dragging"); });
elements.drop_zone.addEventListener("drop", async (event) => {
  event.preventDefault();
  elements.drop_zone.classList.remove("dragging");
  try { await acceptDroppedData(event.dataTransfer); } catch (error) { showNotice(error instanceof Error ? error.message : String(error), "error"); }
});
elements.file_picker.addEventListener("change", async () => {
  const file = elements.file_picker.files?.[0];
  if (!file) return;
  try { setDraft(await readDroppedFile(file)); } catch (error) { showNotice(error instanceof Error ? error.message : String(error), "error"); }
  finally { elements.file_picker.value = ""; }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!elements.image_modal.hidden) closeImageModal();
  if (!elements.results_modal.hidden) closeResultsModal();
  if (!elements.ai_error_modal.hidden) closeAiErrorLog();
  if (!elements.ai_log_modal.hidden) closeAiLogModal();
  if (!elements.image_viewer.hidden) closeImageViewer();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.searchTasks) {
    updateTasks(changes.searchTasks.newValue);
  }
  if (area === "local" && changes.mailshopSession) void loadAccount({ quiet: true });
  if (area === "local" && changes.aiRequestLogs) {
    state.aiLogs = Array.isArray(changes.aiRequestLogs.newValue) ? changes.aiRequestLogs.newValue : [];
    renderAiLogs();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "ACCOUNT_CHANGED") void loadAccount({ quiet: true });
  if (message?.type === "AI_ANALYSIS_PROGRESS" && state.aiLoading) {
    updateAiAnalysisStep(message.message);
    state.pageScanDiagnostics = { ...state.pageScanDiagnostics, ...(message.details || {}) };
    updateAiAnalysisDiagnostics();
  }
});

window.addEventListener("focus", () => void loadAccount({ quiet: true }));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void loadAccount({ quiet: true });
});

const storedOptions = await chrome.storage.local.get({ searchOptions: state.searchOptions });
state.searchOptions = { ...state.searchOptions, ...(storedOptions.searchOptions || {}) };
elements.search_sort.value = state.searchOptions.sort;
elements.search_limit.value = String(state.searchOptions.limit);
elements.search_cache.value = state.searchOptions.cache;
elements.search_lang.value = state.searchOptions.lang;
try {
  const aiUsageResponse = await extensionMessage({ type: "GET_AI_USAGE" });
  state.aiUsage = { ...state.aiUsage, ...(aiUsageResponse.config || {}) };
} catch {
  state.aiUsage = { mode: "server", baseUrl: "", apiKey: "", imageFilterModelId: "" };
}
elements.custom_ai_url.value = state.aiUsage.baseUrl;
elements.custom_ai_key.value = state.aiUsage.apiKey;
elements.custom_ai_model.value = state.aiUsage.imageFilterModelId;
renderAiUsage();
renderAiLogs();
await loadAccount({ quiet: true });
await loadTasks();
