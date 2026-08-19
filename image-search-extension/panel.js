const MIN_IMAGE_SIZE = 72;
const MIN_PRODUCT_SCORE = 0.2;
const MAX_BATCH_TASKS = 20;
const SUPPORTED_DROP_TYPES = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);

const state = {
  tab: null,
  pageImages: [],
  selectedPageImageIds: new Set(),
  filter: "",
  hideSmall: true,
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
  aiUsage: { mode: "server", baseUrl: "", apiKey: "", modelId: "" },
  aiLogs: [],
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
  "hide-small", "product-only", "product-only-field", "product-only-label", "refresh-images", "modal-state", "image-grid",
  "selected-count", "clear-image-selection", "create-selected-tasks",
  "account-label", "account-meta", "account-balance", "account-refresh",
  "account-login", "account-logout",
  "view-workspace", "view-settings", "workspace-view", "settings-view", "settings-back",
  "results-modal", "results-modal-backdrop", "results-modal-close", "results-modal-heading", "results-modal-meta", "results-modal-grid",
  "ai-error-modal", "ai-error-backdrop", "ai-error-close", "ai-error-log", "reload-extension",
  "image-viewer", "viewer-backdrop", "viewer-title", "viewer-reset", "viewer-close", "viewer-stage",
  "viewer-original-image", "viewer-result-image",
].map((id) => [id.replaceAll("-", "_"), document.querySelector(`#${id}`)]));
elements.task_intake = document.querySelector(".task-intake");
elements.ai_settings_mount.append(elements.ai_usage_panel);
elements.ai_usage_panel.hidden = false;

function hasSearchCredits() {
  return Boolean(state.account?.authenticated && Number(state.account.credits?.balance) >= 10);
}

function hasAiUsageConfiguration() {
  return state.aiUsage.mode === "server" || Boolean(state.aiUsage.baseUrl && state.aiUsage.apiKey && state.aiUsage.modelId);
}

function renderView() {
  const signedIn = Boolean(state.account?.authenticated);
  if (!signedIn && state.activeView === "settings") state.activeView = "workspace";
  const settingsOpen = state.activeView === "settings" && signedIn;
  elements.workspace_view.hidden = settingsOpen;
  elements.settings_view.hidden = !settingsOpen;
  elements.view_workspace.classList.toggle("active", !settingsOpen);
  elements.view_settings.classList.toggle("active", settingsOpen);
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
    ? `${state.account.user?.email || "普通用户"} · 每次搜图消耗 10 积分`
    : "登录后可使用以图搜款，每次消耗 10 积分";
  elements.account_balance.textContent = `${balance.toLocaleString("zh-CN")} 分`;
  elements.account_balance.hidden = !signedIn;
  elements.account_login.hidden = state.accountLoading || signedIn;
  elements.account_logout.hidden = state.accountLoading || !signedIn;
  elements.account_refresh.hidden = state.accountLoading || !signedIn;
  elements.account_refresh.disabled = state.accountLoading;
  elements.load_page_images.disabled = !hasSearchCredits();
  elements.ai_analyze_page.disabled = !hasSearchCredits() || !hasAiUsageConfiguration();
  elements.drop_zone.setAttribute("aria-disabled", String(!hasSearchCredits()));
  const showWorkspace = !state.accountLoading && signedIn;
  elements.task_intake.hidden = !showWorkspace;
  elements.task_workspace.hidden = !showWorkspace;
  elements.view_settings.hidden = state.accountLoading || !signedIn;
  renderView();
}

let accountLoadPromise = null;

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

function requireSearchAccess() {
  if (!state.account?.authenticated) {
    showNotice("请先登录 Mailshop 账号", "error");
    return false;
  }
  if (!hasSearchCredits()) {
    showNotice("积分不足，搜图需要 10 积分", "error");
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
  elements.account_notice.textContent = message;
  elements.account_notice.dataset.type = type;
  elements.account_notice.hidden = !message;
}

function formatMoney(value) {
  const amount = Number(value);
  return value === null || value === undefined || !Number.isFinite(amount) ? "价格待补充" : `¥${amount.toFixed(2)}`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function scanPageImages() {
  const entries = [];
  const seen = new Map();
  const imageHosts = new Map();
  const regionRoots = new Map();
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
    if (!nodeIds.has(element)) nodeIds.set(element, `${frameKey}-n${++nodeSequence}`);
    return nodeIds.get(element);
  };
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
  const associateImage = (element, container, imageId) => {
    if (!element || !imageId) return;
    const hostImages = imageHosts.get(element) || new Set();
    hostImages.add(imageId);
    imageHosts.set(element, hostImages);
    const root = container || element.parentElement || element;
    const regionImages = regionRoots.get(root) || new Set();
    regionImages.add(imageId);
    regionRoots.set(root, regionImages);
  };
  const add = (value, meta = {}, element = null) => {
    if (!value) return;
    let url;
    try { url = new URL(value, location.href).href; } catch { return; }
    if (!/^https?:\/\//iu.test(url)) return;
    const current = seen.get(url);
    if (current && current.domScore >= Number(meta.domScore || 0)) {
      associateImage(element, meta.container, current.id);
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
    associateImage(element, meta.container, target.id);
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

  const skippedTags = new Set(["script", "style", "noscript", "iframe", "canvas", "svg", "path", "meta", "link"]);
  const allowedTags = new Set(["a", "article", "aside", "button", "dd", "details", "div", "dl", "dt", "em", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "img", "label", "li", "main", "nav", "ol", "option", "p", "picture", "section", "select", "small", "source", "span", "strong", "summary", "table", "tbody", "td", "th", "thead", "tr", "ul"]);
  const voidTags = new Set(["img", "source"]);
  const safeAttribute = (value, max = 240) => String(value || "").replace(/\s+/gu, " ").trim().slice(0, max);
  const compactClass = (value) => safeAttribute(value, 180).split(" ").filter((token) => token && token.length <= 64).slice(0, 6).join(" ");
  const cloneCompactNode = (node, depth, budget) => {
    if (budget.nodes <= 0 || depth > 8) return null;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = safeAttribute(node.textContent, 320);
      return text ? document.createTextNode(text) : null;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const element = node;
    const originalTag = element.tagName.toLowerCase();
    if (skippedTags.has(originalTag) || element.getAttribute("aria-hidden") === "true") return null;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return null;
    budget.nodes -= 1;
    const tag = allowedTags.has(originalTag) ? originalTag : "div";
    const clone = document.createElement(tag);
    clone.setAttribute("data-node-id", getNodeId(element));
    const hostedImages = imageHosts.get(element);
    if (hostedImages?.size) clone.setAttribute("data-image-ids", [...hostedImages].join(","));
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
    if (tag === "img" || tag === "source") {
      const src = safeAttribute(element.currentSrc || element.getAttribute("src") || element.getAttribute("srcset"), 500);
      const alt = safeAttribute(element.getAttribute("alt"), 300);
      if (src) clone.setAttribute("src", src);
      if (alt) clone.setAttribute("alt", alt);
    }
    if (!voidTags.has(tag)) {
      for (const child of element.childNodes) {
        const childClone = cloneCompactNode(child, depth + 1, budget);
        if (childClone) clone.append(childClone);
        if (budget.nodes <= 0) break;
      }
    }
    return clone;
  };
  const regions = [];
  for (const [root, imageIds] of regionRoots) {
    const clone = cloneCompactNode(root, 0, { nodes: 140 });
    if (!clone) continue;
    let html = clone.outerHTML;
    if (html.length > 6_000) html = `${html.slice(0, 5_960)}<!-- truncated -->`;
    regions.push({
      id: getNodeId(root),
      imageIds: [...imageIds].slice(0, 24),
      text: normalizeText(root.innerText).slice(0, 2_000),
      html,
    });
  }
  return { title: document.title, url: location.href, images: entries, regions: regions.slice(0, 48) };
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] || null;
}

async function scanCurrentPage() {
  const useAi = state.imageScanMode === "ai";
  elements.modal_state.textContent = "正在扫描当前页面…";
  elements.image_grid.replaceChildren();
  state.tab = await getActiveTab();
  if (!state.tab?.id) throw new Error("没有找到当前浏览器页面");
  try {
    const frames = await chrome.scripting.executeScript({ target: { tabId: state.tab.id, allFrames: true }, func: scanPageImages });
    const images = new Map();
    const regions = new Map();
    for (const frame of frames) {
      for (const image of frame.result?.images || []) {
        const current = images.get(image.url);
        if (!current || Number(image.domScore || 0) > Number(current.domScore || 0)) images.set(image.url, image);
      }
      for (const region of frame.result?.regions || []) if (!regions.has(region.id)) regions.set(region.id, region);
    }
    state.pageImages = [...images.values()];
    state.pageSnapshot = {
      url: state.tab.url || frames[0]?.result?.url || "",
      title: state.tab.title || frames[0]?.result?.title || "",
      regions: [...regions.values()],
    };
    if (useAi) state.pageImages.sort((left, right) => (right.domScore || 0) - (left.domScore || 0));
    state.aiClassified = false;
    const availableIds = new Set(state.pageImages.map((image) => image.id));
    state.selectedPageImageIds = new Set([...state.selectedPageImageIds].filter((id) => availableIds.has(id)));
    elements.page_meta.textContent = `${state.pageImages.length} 张图片 · ${state.tab.title || "当前页面"}`;
    elements.modal_state.textContent = state.pageImages.length ? (useAi ? "正在使用 AI 筛选商品图片" : "已应用页面结构筛选，可关闭筛选查看全部图片") : "当前页面没有检测到可用图片";
    renderImageGrid();
    if (useAi && state.pageImages.length) await classifyPageImages();
  } catch {
    state.pageImages = [];
    state.pageSnapshot = null;
    elements.modal_state.textContent = "当前页面禁止扩展读取内容，可以直接拖入图片。";
    renderImageGrid();
  }
}

async function classifyPageImages() {
  try {
    const candidates = state.pageImages.slice(0, 24);
    const candidateIds = new Set(candidates.map((candidate) => candidate.id));
    const regions = (state.pageSnapshot?.regions || [])
      .map((region) => ({ ...region, imageIds: region.imageIds.filter((id) => candidateIds.has(id)) }))
      .filter((region) => region.imageIds.length)
      .sort((left, right) => {
        const score = (region) => Math.max(...region.imageIds.map((id) => Number(candidates.find((candidate) => candidate.id === id)?.domScore || 0)));
        return score(right) - score(left);
      })
      .slice(0, 24);
    const pageSnapshot = state.pageSnapshot && regions.length ? { ...state.pageSnapshot, regions } : null;
    const response = await extensionMessage({ type: "CLASSIFY_PAGE_IMAGES", candidates, pageSnapshot });
    const resultMap = new Map((response.results || []).map((result) => [result.id, result]));
    state.pageImages = state.pageImages.map((image) => ({ ...image, ...(resultMap.get(image.id) || {}), aiKeep: resultMap.get(image.id)?.keep ?? image.domScore >= 0.35 }));
    state.aiClassified = true;
    const sourceLabel = response.source === "custom" ? "自定义 AI" : "服务器 AI";
    const completedLabel = response.pipeline === "html_two_stage" ? `${sourceLabel} 已完成页面区域识别与内容提取` : `${sourceLabel} 已完成商品图片筛选`;
    elements.modal_state.textContent = response.configured ? (response.degraded ? `${sourceLabel} 暂时不可用，已使用页面结构筛选${response.error ? `：${response.error}` : ""}` : completedLabel) : "服务器 AI 未配置，已使用页面结构筛选";
    renderImageGrid();
  } catch {
    state.aiClassified = true;
    state.pageImages = state.pageImages.map((image) => ({ ...image, aiKeep: (image.domScore || 0) >= 0.35 }));
    elements.modal_state.textContent = "AI 暂时不可用，已使用页面结构筛选";
    renderImageGrid();
  }
}

function visiblePageImages() {
  const query = state.filter.trim().toLowerCase();
  return state.pageImages.filter((image) => {
    if (state.hideSmall && (image.width < MIN_IMAGE_SIZE || image.height < MIN_IMAGE_SIZE)) return false;
    if (state.imageScanMode === "manual" && state.productOnly && (image.domScore || 0) < MIN_PRODUCT_SCORE) return false;
    if (state.imageScanMode === "ai" && state.productOnly && state.aiClassified && image.aiKeep === false) return false;
    return !query || `${image.url} ${image.alt} ${image.title}`.toLowerCase().includes(query);
  });
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
    button.setAttribute("aria-label", `${selected ? "取消选择" : "选择"} ${image.alt || image.title || "网页图片"}`);
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
    info.innerHTML = `<strong>${image.width || "?"} × ${image.height || "?"}</strong><small></small>`;
    info.querySelector("small").textContent = image.sku ? `SKU: ${image.sku}` : (image.productTitle || image.title || image.alt || "商品图片");
    button.append(previewFrame, info);
    button.addEventListener("click", () => {
      if (state.selectedPageImageIds.has(image.id)) {
        state.selectedPageImageIds.delete(image.id);
      } else if (state.selectedPageImageIds.size < MAX_BATCH_TASKS) {
        state.selectedPageImageIds.add(image.id);
      } else {
        elements.modal_state.textContent = `一次最多创建 ${MAX_BATCH_TASKS} 个任务`;
      }
      renderImageGrid();
    });
    elements.image_grid.append(button);
  }
  renderImageSelection();
}

function renderImageSelection() {
  const count = state.selectedPageImageIds.size;
  elements.selected_count.textContent = `已选 ${count} 张`;
  elements.clear_image_selection.disabled = count === 0;
  elements.create_selected_tasks.disabled = count === 0;
  elements.create_selected_tasks.textContent = count ? `创建 ${count} 个任务` : "创建任务";
}

function openImageModal(mode = "manual") {
  if (!requireSearchAccess()) return;
  state.imageScanMode = mode;
  state.productOnly = true;
  if (mode === "manual") state.hideSmall = true;
  state.aiClassified = false;
  elements.product_only.checked = state.productOnly;
  elements.hide_small.checked = state.hideSmall;
  elements.product_only_field.hidden = false;
  elements.product_only_label.textContent = mode === "ai" ? "只显示 AI 商品图" : "只显示疑似商品图";
  elements.image_modal_heading.textContent = mode === "ai" ? "AI 分析当前页面图片" : "选择当前页面图片";
  state.selectedPageImageIds.clear();
  renderImageSelection();
  elements.image_modal.hidden = false;
  document.body.classList.add("modal-open");
  elements.image_filter.focus();
  void scanCurrentPage();
}

async function createSelectedTasks() {
  if (!requireSearchAccess()) return;
  const selectedImages = state.pageImages.filter((image) => state.selectedPageImageIds.has(image.id));
  if (!selectedImages.length) return;
  const affordableTasks = Math.floor(Number(state.account?.credits?.balance || 0) / 10);
  if (selectedImages.length > affordableTasks) {
    showNotice(`当前积分最多可创建 ${affordableTasks} 个搜图任务`, "error");
    return;
  }

  elements.create_selected_tasks.disabled = true;
  elements.clear_image_selection.disabled = true;
  elements.create_selected_tasks.textContent = `正在创建 0/${selectedImages.length}`;
  let created = 0;
  const failures = [];
  for (const [index, image] of selectedImages.entries()) {
    const baseName = defaultTaskName(image);
    const name = selectedImages.length > 1 && !image.alt && !image.title ? `${baseName} #${index + 1}` : baseName;
    try {
      await extensionMessage({
        type: "CREATE_TASK",
        task: {
          name,
          imageUrl: image.url,
          sourcePage: image.sourcePage || state.tab?.url || null,
          options: { ...state.searchOptions },
        },
      });
      created += 1;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
    elements.create_selected_tasks.textContent = `正在创建 ${index + 1}/${selectedImages.length}`;
  }

  if (created) {
    state.selectedPageImageIds.clear();
    closeImageModal();
    await loadTasks();
  } else {
    renderImageSelection();
  }
  if (failures.length) {
    showNotice(`已创建 ${created} 个任务，${failures.length} 个失败：${failures[0]}`, "error");
  } else {
    showNotice(`已创建 ${created} 个图片查询任务，可继续添加其他产品`, "success");
  }
}

function closeImageModal() {
  elements.image_modal.hidden = true;
  document.body.classList.remove("modal-open");
  elements.load_page_images.focus();
}

function defaultTaskName(image) {
  const label = image.productTitle || image.sku || image.alt || image.title;
  if (label && !["拖入的网页图片", "拖入的本地图片"].includes(label)) return label.slice(0, 120);
  return `搜款任务 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
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
  if (!requireSearchAccess()) return;
  if (!state.draft) return;
  const name = elements.task_name.value.trim() || defaultTaskName(state.draft);
  elements.create_task.disabled = true;
  elements.create_task.textContent = "创建中…";
  try {
    await extensionMessage({
      type: "CREATE_TASK",
      task: {
        name,
        imageUrl: state.draft.url,
        imageDataUrl: state.draft.imageDataUrl,
        sourcePage: state.draft.sourcePage || state.tab?.url || null,
        options: { ...state.searchOptions },
      },
    });
    discardDraft();
    showNotice(`任务“${name}”已创建，可以继续添加下一张图片`, "success");
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
  const response = await extensionMessage({ type: "GET_TASKS" });
  updateTasks(response.tasks);
}

function taskStatus(task) {
  return {
    queued: { label: "排队中", className: "queued" },
    running: { label: "查询中", className: "running" },
    completed: { label: `${task.resultCount || 0} 个结果`, className: "completed" },
    failed: { label: "查询失败", className: "failed" },
  }[task.status] || { label: task.status, className: "queued" };
}

function legacyResultCard(result) {
  const detailUrl = result.detailUrl || `https://detail.1688.com/offer/${encodeURIComponent(result.offerId)}.html`;
  const card = document.createElement("a");
  card.className = "result-row";
  card.href = detailUrl;
  card.target = "_blank";
  card.rel = "noreferrer";
  const image = document.createElement("span");
  image.className = "result-thumb";
  if (result.imageUrl) {
    const img = document.createElement("img");
    img.src = result.imageUrl;
    img.alt = "";
    img.loading = "lazy";
    image.append(img);
  }
  const copy = document.createElement("span");
  copy.className = "result-copy";
  const title = document.createElement("strong");
  title.textContent = result.title;
  const meta = document.createElement("small");
  meta.textContent = [formatMoney(result.promotionPrice ?? result.price), result.supplierName, result.sales ? `${result.sales} 销量` : null].filter(Boolean).join(" · ");
  copy.append(title, meta);
  const arrow = document.createElement("span");
  arrow.className = "result-arrow";
  arrow.textContent = "↗";
  card.append(image, copy, arrow);
  return card;
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

function createResultCard(result, task) {
  const detailUrl = result.detailUrl || `https://detail.1688.com/offer/${encodeURIComponent(result.offerId)}.html`;
  const card = document.createElement("article");
  card.className = "result-row";
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
  copy.append(title, meta);
  card.append(image, copy);
  return card;
}

function openResultsModal(task) {
  elements.results_modal_heading.textContent = task.name || "查询结果";
  elements.results_modal_meta.textContent = `${task.resultCount || task.results?.length || 0} 个结果`;
  elements.results_modal_grid.replaceChildren();
  if (task.results?.length) {
    task.results.forEach((result) => elements.results_modal_grid.append(createResultCard(result, task)));
  } else {
    elements.results_modal_grid.innerHTML = '<div class="no-results">没有找到匹配货源，可以换一张图片重新创建任务。</div>';
  }
  elements.results_modal.hidden = false;
  document.body.classList.add("modal-open");
  elements.results_modal_close.focus();
}

function closeResultsModal() {
  elements.results_modal.hidden = true;
  elements.results_modal_grid.replaceChildren();
  if (elements.image_modal.hidden && elements.ai_error_modal.hidden) document.body.classList.remove("modal-open");
}

function createTaskCard(task) {
  const status = taskStatus(task);
  const article = document.createElement("article");
  article.className = `task-card ${status.className}`;
  article.dataset.taskId = task.id;
  const main = document.createElement("div");
  main.className = "task-main";
  const preview = document.createElement("span");
  preview.className = "task-preview";
  if (task.previewUrl) {
    const image = document.createElement("img");
    image.src = task.previewUrl;
    image.alt = "";
    preview.append(image);
  }
  const copy = document.createElement("div");
  copy.className = "task-copy";
  const headline = document.createElement("div");
  headline.className = "task-headline";
  const title = document.createElement("h3");
  title.textContent = task.name;
  const badge = document.createElement("span");
  badge.className = `status-badge ${status.className}`;
  badge.textContent = status.label;
  headline.append(title, badge);
  const time = document.createElement("p");
  time.textContent = `创建于 ${formatTime(task.createdAt)}`;
  copy.append(headline, time);
  main.append(preview, copy);

  const actions = document.createElement("div");
  actions.className = "task-actions";
  if (task.status === "completed") {
    const toggle = document.createElement("button");
    toggle.className = "button quiet compact";
    toggle.type = "button";
    toggle.textContent = "查看结果";
    toggle.addEventListener("click", () => openResultsModal(task));
    actions.append(toggle);
  }
  if (task.status === "failed") {
    const error = document.createElement("p");
    error.className = "task-error";
    error.textContent = task.error || "查询失败";
    copy.append(error);
    const retry = document.createElement("button");
    retry.className = "button quiet compact";
    retry.type = "button";
    retry.textContent = "重试";
    retry.addEventListener("click", async () => {
      if (!requireSearchAccess()) return;
      retry.disabled = true;
      retry.textContent = "重试中";
      try {
        await extensionMessage({ type: "RETRY_TASK", taskId: task.id });
        await loadTasks();
        showNotice("任务已重新提交", "success");
      } catch (error) {
        showNotice(error instanceof Error ? error.message : String(error), "error");
        retry.disabled = false;
        retry.textContent = "重试";
      }
    });
    actions.append(retry);
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

  if (task.status === "running" || task.status === "queued") {
    const progress = document.createElement("div");
    progress.className = "task-progress";
    progress.setAttribute("aria-label", "查询进行中");
    article.append(progress);
  }
  return article;
}

function taskStateKey(tasks) {
  return tasks.map((task) => [
    task.id,
    task.status,
    task.updatedAt,
    task.resultCount,
    task.error,
    task.results?.length || 0,
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
  const active = state.tasks.filter((task) => ["queued", "running"].includes(task.status)).length;
  const completed = state.tasks.filter((task) => task.status === "completed").length;
  elements.queue_summary.textContent = state.tasks.length ? `${state.tasks.length} 个任务 · ${active} 个进行中 · ${completed} 个已完成` : "还没有任务";
  elements.clear_finished.hidden = !state.tasks.some((task) => ["completed", "failed"].includes(task.status));
  if (!state.tasks.length) {
    elements.task_list.append(document.querySelector("#empty-task-template").content.cloneNode(true));
    return;
  }
  state.tasks.forEach((task) => elements.task_list.append(createTaskCard(task)));
}

elements.account_login.addEventListener("click", async () => {
  try {
    showAccountNotice("正在打开 Google 登录窗口", "info");
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
elements.view_workspace.addEventListener("click", () => { state.activeView = "workspace"; renderView(); });
elements.view_settings.addEventListener("click", () => { state.activeView = "settings"; renderView(); void loadAiLogs(); });
elements.settings_back.addEventListener("click", () => { state.activeView = "workspace"; renderView(); });
elements.load_page_images.addEventListener("click", () => openImageModal("manual"));
elements.ai_analyze_page.addEventListener("click", () => openImageModal("ai"));
elements.close_image_modal.addEventListener("click", closeImageModal);
elements.modal_backdrop.addEventListener("click", closeImageModal);
elements.refresh_images.addEventListener("click", () => void scanCurrentPage());
elements.clear_image_selection.addEventListener("click", () => { state.selectedPageImageIds.clear(); renderImageGrid(); });
elements.create_selected_tasks.addEventListener("click", () => void createSelectedTasks());
elements.image_filter.addEventListener("input", (event) => { state.filter = event.target.value; renderImageGrid(); });
elements.hide_small.addEventListener("change", (event) => { state.hideSmall = event.target.checked; renderImageGrid(); });
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
  return action === "config_test" ? "配置测试" : action === "page_image_analysis" ? "页面图片分析" : action || "AI 请求";
}

function formatAiLogJson(value) {
  try { return JSON.stringify(value ?? null, null, 2); } catch { return String(value); }
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
    const item = document.createElement("details");
    item.className = `ai-log-item ${log.ok ? "success" : "failed"}`;
    const summary = document.createElement("summary");
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

    const content = document.createElement("div");
    content.className = "ai-log-content";
    for (const [label, value] of [["请求 JSON", log.request], ["服务器返回 JSON", log.response]]) {
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
      copy.addEventListener("click", async (event) => {
        event.preventDefault();
        await navigator.clipboard.writeText(json);
        copy.textContent = "已复制";
        window.setTimeout(() => { copy.textContent = "复制"; }, 1_200);
      });
      heading.append(name, copy);
      const pre = document.createElement("pre");
      pre.textContent = json;
      block.append(heading, pre);
      content.append(block);
    }
    item.append(summary, content);
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
    modelId: elements.custom_ai_model.value.trim(),
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
    modelId: state.aiUsage.modelId || "服务器托管模型",
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
  if (elements.image_modal.hidden && elements.results_modal.hidden) document.body.classList.remove("modal-open");
}

async function testAiUsage() {
  const config = readAiUsageForm();
  state.aiUsage = config;
  elements.test_ai_config.disabled = true;
  elements.save_ai_config.disabled = true;
  elements.ai_config_status.textContent = "正在测试连接…";
  try {
    await extensionMessage({ type: "TEST_AI_USAGE", config, candidates: state.pageImages.slice(0, 1) });
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
elements.ai_error_close.addEventListener("click", closeAiErrorLog);
elements.ai_error_backdrop.addEventListener("click", closeAiErrorLog);
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
  state.aiUsage = { mode: "server", baseUrl: "", apiKey: "", modelId: "" };
}
elements.custom_ai_url.value = state.aiUsage.baseUrl;
elements.custom_ai_key.value = state.aiUsage.apiKey;
elements.custom_ai_model.value = state.aiUsage.modelId;
renderAiUsage();
renderAiLogs();
await loadAccount({ quiet: true });
await loadTasks();
