import {
  CheckCircle2,
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  ExternalLink,
  FileSearch,
  Filter,
  ImageIcon,
  Images,
  LoaderCircle,
  PackagePlus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

import { api, toQuery } from "../api";
import type { CollectionTaskBatchItem, CollectionTaskBatchResponse, OneBoundItemPreview, SearchTask, SearchTaskLifecycle, SearchTaskOptions, SearchTaskResult, SearchTaskRun, ShopifyStore } from "../types";
import { BatchCollectionTaskImport } from "./BatchCollectionTaskImport";
import { ImageCompareModal } from "./ImageCompareModal";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { SearchResultDetailModal } from "./SearchResultDetailModal";

const labels = { unqueried: "未搜图", queried: "已搜图", imported: "已导入 Shopify" } as const;

type SearchTaskStatus = SearchTask["status"] | "all";
type QueryDraft = SearchTaskOptions & {
  imageId: string;
};

type Props = {
  tasks: SearchTask[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  status: SearchTaskStatus;
  lifecycle: SearchTaskLifecycle;
  loading: boolean;
  stores: ShopifyStore[];
  onSearchChange: (value: string) => void;
  onStatusChange: (value: SearchTaskStatus) => void;
  onLifecycleChange: (value: SearchTaskLifecycle) => void;
  onPageChange: (value: number) => void;
  onPageSizeChange: (value: number) => void;
  onRefresh: () => void;
  onBatchImport: (items: CollectionTaskBatchItem[]) => Promise<CollectionTaskBatchResponse>;
  onRun: (taskId: string, input: SearchTaskOptions & { imageId: string }) => Promise<void>;
  onImport: (taskId: string, runId: string, storeId: string, offerIds?: string[]) => Promise<void>;
  onUpdateLifecycle: (taskId: string, input: { archived?: boolean; deleted?: boolean }) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
};

function proxiedImageUrl(url: string): string {
  if (url.startsWith("data:image/") || url.startsWith("/")) return url;
  return `/api/image-proxy${toQuery({ url })}`;
}

function resultDetailUrl(result: SearchTaskResult): string | undefined {
  if (result.detailUrl) return result.detailUrl;
  return result.offerId ? `https://detail.1688.com/offer/${encodeURIComponent(result.offerId)}.html` : undefined;
}

function formatPrice(result: SearchTaskResult): string {
  const price = result.promotionPrice ?? result.price;
  if (price == null) return "价格待补充";
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(price);
}

function importedToStore(result: SearchTaskResult, storeId: string): boolean {
  return Boolean(storeId && result.shopifyImports?.some((item) => item.storeId === storeId));
}

function paginationItems(current: number, total: number): Array<number | "start-gap" | "end-gap"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const items: Array<number | "start-gap" | "end-gap"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push("start-gap");
  for (let value = start; value <= end; value += 1) items.push(value);
  if (end < total - 1) items.push("end-gap");
  items.push(total);
  return items;
}

function draftForTask(task: SearchTask): QueryDraft {
  const options = task.options ?? {} as SearchTaskOptions;
  return {
    imageId: task.selectedImageId || task.images[0]?.id || "",
    sort: options.sort === "bid2" || options.sort === "_bid2" || options.sort === "sale" ? options.sort : "_sale",
    limit: Number(options.limit) || 30,
    page: Number(options.page) || 1,
    cache: options.cache === "yes" ? "yes" : "no",
    lang: ["en", "ru"].includes(options.lang) ? options.lang : "cn",
    version: options.version || "",
  };
}

function draftForRun(run: SearchTaskRun, page = run.page): QueryDraft {
  return {
    imageId: run.imageId,
    sort: run.options.sort,
    limit: run.options.limit,
    page,
    cache: run.options.cache,
    lang: run.options.lang,
    version: run.options.version || "",
  };
}

function queryInput(draft: QueryDraft): SearchTaskOptions & { imageId: string } {
  return {
    imageId: draft.imageId,
    sort: draft.sort,
    limit: draft.limit,
    page: draft.page,
    cache: draft.cache,
    lang: draft.lang,
    version: draft.version.trim(),
  };
}

function runParameterText(run: SearchTaskRun): string[] {
  const options = run.options;
  const sortLabels: Record<SearchTaskOptions["sort"], string> = {
    _sale: "销量高到低",
    sale: "销量低到高",
    bid2: "总价低到高",
    _bid2: "总价高到低",
  };
  return [
    sortLabels[options.sort] ?? options.sort,
    `${options.limit} 条/页`,
    options.cache === "yes" ? "使用缓存" : "最新数据",
  ].filter(Boolean);
}

type RunGroup = {
  key: string;
  imageId: string;
  imageUrl: string;
  runs: SearchTaskRun[];
};

function groupRuns(runs: SearchTaskRun[]): RunGroup[] {
  const groups = new Map<string, RunGroup>();
  for (const run of runs) {
    const key = run.imageId || run.imageUrl;
    const group = groups.get(key) ?? { key, imageId: run.imageId, imageUrl: run.imageUrl, runs: [] };
    group.runs.push(run);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    runs: [...group.runs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  }));
}

export function SearchTasksPage({
  tasks,
  total,
  page,
  pageSize,
  search,
  status,
  lifecycle,
  loading,
  stores,
  onSearchChange,
  onStatusChange,
  onLifecycleChange,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  onBatchImport,
  onRun,
  onImport,
  onUpdateLifecycle,
  onDelete,
}: Props) {
  const [collapsedRunIds, setCollapsedRunIds] = useState<Set<string>>(() => new Set());
  const [selectedRunIds, setSelectedRunIds] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, QueryDraft>>({});
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [detailState, setDetailState] = useState<{ result: SearchTaskResult; task: SearchTask; run?: SearchTaskRun; detail: OneBoundItemPreview | null; loading: boolean; error: string | null } | null>(null);
  const [compareState, setCompareState] = useState<{ originalUrl: string; resultUrl: string; title: string } | null>(null);
  const [previewState, setPreviewState] = useState<{ url: string; title: string } | null>(null);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);
  const hasFilters = Boolean(search.trim()) || status !== "all" || lifecycle !== "active";

  useEffect(() => {
    const importStores = stores.filter((store) => store.status === "active" && store.configured);
    if (importStores.some((store) => store.id === selectedStoreId)) return;
    setSelectedStoreId(importStores[0]?.id ?? "");
  }, [selectedStoreId, stores]);

  function draft(task: SearchTask): QueryDraft {
    return drafts[task.id] ?? draftForTask(task);
  }

  function patchDraft(task: SearchTask, patch: Partial<QueryDraft>) {
    setDrafts((current) => ({ ...current, [task.id]: { ...(current[task.id] ?? draftForTask(task)), ...patch } }));
  }

  function toggleRun(runId: string) {
    setCollapsedRunIds((current) => {
      const next = new Set(current);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  }

  function selectRun(group: RunGroup, runId: string) {
    setSelectedRunIds((current) => ({ ...current, [group.key]: runId }));
  }

  async function runQuery(task: SearchTask, queryDraft = draft(task)) {
    if (task.archivedAt || task.deletedAt) return;
    if (!queryDraft.imageId) return;
    setRunningTaskId(task.id);
    try {
      await onRun(task.id, queryInput(queryDraft));
      setDrafts((current) => ({ ...current, [task.id]: queryDraft }));
    } finally {
      setRunningTaskId(null);
    }
  }

  async function importResults(taskId: string, runId: string, offerIds?: string[]) {
    const key = `${runId}:${offerIds?.length === 1 ? offerIds[0] : "all"}`;
    setImportingKey(key);
    try {
      if (!selectedStoreId) return;
      await onImport(taskId, runId, selectedStoreId, offerIds);
    } finally {
      setImportingKey(null);
    }
  }

  async function openDetail(taskForDetail: SearchTask, result: SearchTaskResult, run: SearchTaskRun, forceRefresh = false) {
    if (!result.offerId) return;
    setDetailState((current) => ({ result, task: taskForDetail, run, detail: forceRefresh ? current?.detail ?? null : null, loading: true, error: null }));
    try {
      const query = toQuery({ cache: run.options.cache, lang: run.options.lang, ...(forceRefresh ? { fresh: "1" } : {}) });
      const response = await api<{ item: OneBoundItemPreview }>(`/api/integrations/onebound/items/${encodeURIComponent(result.offerId)}${query}`);
      setDetailState({ result, task: taskForDetail, run, detail: response.item, loading: false, error: null });
    } catch (caught) {
      setDetailState({ result, task: taskForDetail, detail: null, loading: false, error: caught instanceof Error ? caught.message : "详情请求失败" });
    }
  }

  function clearFilters() {
    onSearchChange("");
    onStatusChange("all");
    onLifecycleChange("active");
  }

  return <section className="search-tasks-view">
    <header className="page-heading"><div><span>PRODUCT SOURCING</span><h1>采集任务</h1><p>从插件或批量文件保存商品信息与图片，执行 1688 搜图，并将选中结果直接导入 Shopify。</p></div><div className="search-task-heading-actions"><a className="search-task-guide-link" href="/batch-import-guide">如何用 AI 进行批量采集 <ExternalLink size={14} /></a><div className="search-task-count">{hasFilters ? `${total} 个匹配任务` : `${total} 个任务`}</div><BatchCollectionTaskImport onSubmit={onBatchImport} /></div></header>

    <section className="search-task-controls" aria-label="采集任务筛选">
      <label className="search-field search-task-search"><Search size={17} /><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="搜索任务名、商品标题、商品 ID 或供应商" aria-label="搜索采集任务" /></label>
      <div className="filter-group">
        <Filter size={16} />
        <select value={status} onChange={(event) => onStatusChange(event.target.value as SearchTaskStatus)} aria-label="按任务状态筛选"><option value="all">全部状态</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select value={lifecycle} onChange={(event) => onLifecycleChange(event.target.value as SearchTaskLifecycle)} aria-label="按任务生命周期筛选"><option value="active">未归档任务</option><option value="archived">已归档</option><option value="deleted">回收站</option><option value="all">全部任务</option></select>
        <select value={selectedStoreId} onChange={(event) => setSelectedStoreId(event.target.value)} aria-label="Shopify 导入店铺"><option value="">选择可用的 Shopify 店铺</option>{stores.filter((store) => store.status === "active" && store.configured).map((store) => <option key={store.id} value={store.id}>{store.displayName || store.shopDomain}</option>)}</select>
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} aria-label="每页任务数量"><option value={5}>每页 5 个</option><option value={10}>每页 10 个</option><option value={20}>每页 20 个</option></select>
        <button className="icon-button" type="button" onClick={onRefresh} disabled={loading} aria-label="刷新采集任务" title="刷新"><RefreshCw className={loading ? "spin" : ""} size={17} /></button>
      </div>
    </section>

    <div className="search-task-list-meta"><span>{total ? `显示 ${firstItem}-${lastItem}，共 ${total} 个任务` : "暂无匹配任务"}</span><span>第 {page} / {pageCount} 页</span></div>

    {loading && tasks.length === 0 ? <div className="search-task-state"><LoaderCircle className="spin" size={20} />正在加载采集任务</div> : tasks.length === 0 ? <div className="search-task-state"><Search size={22} /><strong>{hasFilters ? "没有符合条件的任务" : "暂无采集任务"}</strong><span>{hasFilters ? "尝试修改关键词或任务状态。" : "通过浏览器插件或批量导入创建采集任务后，会显示在这里。"}</span>{hasFilters && <button className="button quiet compact" type="button" onClick={clearFilters}>清除筛选</button>}</div> : <div className={`search-task-list ${loading ? "loading" : ""}`} aria-busy={loading}>{tasks.map((task) => {
      const queryDraft = draft(task);
      const selectedImage = task.images.find((image) => image.id === queryDraft.imageId) ?? task.images[0] ?? null;
      const isRunning = task.querying || runningTaskId === task.id;
      const isArchived = Boolean(task.archivedAt) && !task.deletedAt;
      const isDeleted = Boolean(task.deletedAt);
      const isInactive = isArchived || isDeleted;
      return <article className="search-task-card" key={task.id}>
        <div className="search-task-main"><div className={`search-task-status ${task.status}`}>{task.status === "unqueried" ? <Clock3 size={15} /> : <CheckCircle2 size={15} />}{labels[task.status]}</div>{isArchived && <span className="search-task-lifecycle archived">已归档</span>}{isDeleted && <span className="search-task-lifecycle deleted">已删除</span>}{isRunning && <span className="search-task-running"><LoaderCircle className="spin" size={14} />搜图中</span>}<h2 title={task.productTitle || task.name}>{task.productTitle || task.name}</h2><time dateTime={task.updatedAt}>{new Date(task.updatedAt).toLocaleString("zh-CN")}</time><div className="search-task-actions">{isDeleted ? <button className="icon-button" type="button" onClick={() => void onUpdateLifecycle(task.id, { deleted: false })} title="恢复任务" aria-label="恢复任务"><ArchiveRestore size={16} /></button> : isArchived ? <><button className="icon-button" type="button" onClick={() => void onUpdateLifecycle(task.id, { archived: false })} title="取消归档" aria-label="取消归档"><ArchiveRestore size={16} /></button><button className="icon-button danger" type="button" onClick={() => { if (window.confirm("确定将此任务移入回收站吗？")) void onDelete(task.id); }} title="删除任务" aria-label="删除任务"><Trash2 size={16} /></button></> : <><button className="icon-button" type="button" onClick={() => void onUpdateLifecycle(task.id, { archived: true })} title="归档任务" aria-label="归档任务"><Archive size={16} /></button><button className="icon-button danger" type="button" onClick={() => { if (window.confirm("确定将此任务移入回收站吗？")) void onDelete(task.id); }} title="删除任务" aria-label="删除任务"><Trash2 size={16} /></button></>}</div></div>
        <div className="search-task-meta">{task.sku && <span>SKU <b>{task.sku}</b></span>}{task.sourceSite && <span>网站 <b>{task.sourceSite}</b></span>}<span>图片 <b>{task.images.length}</b></span><span>搜图轮次 <b>{task.runs.length}</b></span><span>累计结果 <b>{task.resultCount}</b></span><span>已导入 Shopify <b>{task.importedCount}</b></span><span>消耗 <b>{task.chargedCredits}</b> 积分</span>{(task.productUrl || task.sourcePage) && <a href={task.productUrl || task.sourcePage || undefined} target="_blank" rel="noreferrer">商品页面 <ExternalLink size={13} /></a>}</div>
        {task.description && <p className="search-task-description">{task.description}</p>}

        <section className="task-query-workbench" aria-label={`${task.name} 搜图配置`}>
          <div className="task-query-images"><header><div><span>SOURCE IMAGES</span><strong>选择搜图图片</strong></div><small>{task.images.length} 张</small></header><div>{task.images.map((image, index) => <div className="task-query-image-item" key={image.id}><button className={image.id === queryDraft.imageId ? "selected" : ""} type="button" onClick={() => patchDraft(task, { imageId: image.id })} title={`选择第 ${index + 1} 张图片`} aria-label={`选择第 ${index + 1} 张图片`}><img src={proxiedImageUrl(image.url)} alt={image.alt || `源图片 ${index + 1}`} loading="lazy" /><span>{String(index + 1).padStart(2, "0")}</span></button></div>)}</div></div>
          <div className="task-query-preview"><header><div><span>IMAGE PREVIEW</span><strong>当前预览</strong></div>{selectedImage && <small>{task.images.findIndex((image) => image.id === selectedImage.id) + 1} / {task.images.length}</small>}</header>{selectedImage ? <button className="task-query-preview-image" type="button" onClick={() => setPreviewState({ url: selectedImage.url, title: selectedImage.alt || selectedImage.title || "搜图图片预览" })} aria-label="查看当前搜图图片大图" title="查看大图"><img src={proxiedImageUrl(selectedImage.url)} alt={selectedImage.alt || selectedImage.title || "当前搜图图片"} /></button> : <div className="task-query-preview-empty"><ImageIcon size={26} /><span>暂无图片</span></div>}</div>
          <div className="task-query-config"><header><div><span>SEARCH CONFIG</span><strong>搜图参数</strong></div><small>{isInactive ? "任务已暂停" : "本次消耗 20 积分"}</small></header><div className="task-query-fields">
            <label><span>排序</span><select value={queryDraft.sort} onChange={(event) => patchDraft(task, { sort: event.target.value as QueryDraft["sort"] })}><option value="_sale">销量高到低</option><option value="sale">销量低到高</option><option value="bid2">总价低到高</option><option value="_bid2">总价高到低</option></select></label>
            <label><span>页码</span><input type="number" min={1} max={1000} value={queryDraft.page} onChange={(event) => patchDraft(task, { page: Math.max(1, Number(event.target.value) || 1) })} /></label>
            <label><span>每页</span><select value={queryDraft.limit} onChange={(event) => patchDraft(task, { limit: Number(event.target.value) })}><option value={10}>10</option><option value={20}>20</option><option value={30}>30</option><option value={40}>40</option><option value={50}>50</option></select></label>
            <label><span>缓存</span><select value={queryDraft.cache} onChange={(event) => patchDraft(task, { cache: event.target.value as QueryDraft["cache"] })}><option value="no">最新数据</option><option value="yes">使用缓存</option></select></label>
          </div><button className="button primary task-query-submit" type="button" onClick={() => void runQuery(task)} disabled={isInactive || isRunning || !queryDraft.imageId}>{isRunning ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />}{isRunning ? "正在搜图" : task.runs.length ? "发起新一轮搜图" : "开始搜图"}</button></div>
        </section>

        <section className="task-run-history" aria-label={`${task.name} 搜图记录`}><header><div><span>SEARCH ROUNDS</span><strong>搜图记录</strong></div><small>{groupRuns(task.runs).length} 条图片记录</small></header>{task.runs.length === 0 ? <div className="task-run-empty"><Images size={20} /><span>尚未搜图，选择图片并填写参数后开始第一轮。</span></div> : <div className="task-run-list">{groupRuns(task.runs).map((group) => {
          const selectedRun = group.runs.find((item) => item.id === selectedRunIds[group.key]) ?? group.runs[0];
          const collapsed = collapsedRunIds.has(group.key);
          const completed = selectedRun.status === "completed";
          const originalUrl = group.imageUrl;
          const pendingOfferIds = selectedRun.results.flatMap((result) => !importedToStore(result, selectedStoreId) && result.offerId ? [result.offerId] : []);
          const pages = [...new Set(group.runs.map((item) => item.page))].sort((a, b) => a - b);
          const totalPages = Math.max(...group.runs.map((item) => item.totalResultCount && item.pageSize ? Math.ceil(item.totalResultCount / item.pageSize) : item.page), 0);
          const remainingPages = Math.max(0, totalPages - pages.length);
          return <section className={`task-run task-run-group ${selectedRun.status}`} key={group.key}>
            <header className="task-run-header"><div className="task-run-source"><button className="task-run-source-image" type="button" onClick={() => setPreviewState({ url: originalUrl, title: "搜图原图" })} aria-label="放大搜图原图" title="放大查看"><img src={proxiedImageUrl(originalUrl)} alt="搜图原图" /></button><div><span>已搜图 {pages.join("、")} 页{remainingPages > 0 ? ` · 还有 ${remainingPages} 页未搜图` : ""}</span><strong>{selectedRun.status === "running" ? "正在搜图" : selectedRun.status === "failed" ? "搜图失败" : `本页 ${selectedRun.resultCount} 条${selectedRun.totalResultCount != null ? ` / 共 ${selectedRun.totalResultCount} 条` : ""}`}</strong><small>{new Date(selectedRun.createdAt).toLocaleString("zh-CN")}</small><div className="task-run-params">{runParameterText(selectedRun).map((text) => <span key={text}>{text}</span>)}</div></div></div><div className="task-run-actions">{completed && <><button className="button quiet compact" type="button" onClick={() => void runQuery(task, draftForRun(selectedRun, Math.max(1, selectedRun.page - 1)))} disabled={isInactive || isRunning || selectedRun.page <= 1}><ChevronLeft size={15} />上一页</button><button className="button quiet compact" type="button" onClick={() => void runQuery(task, draftForRun(selectedRun, selectedRun.page + 1))} disabled={isInactive || isRunning}>下一页<ChevronRight size={15} /></button>{pendingOfferIds.length > 0 && <button className="button quiet compact" type="button" onClick={() => void importResults(task.id, selectedRun.id, pendingOfferIds)} disabled={isInactive || Boolean(importingKey) || !selectedStoreId} title={selectedStoreId ? "导入当前页到 Shopify" : "请先选择 Shopify 店铺"}><PackagePlus size={15} />{importingKey === `${selectedRun.id}:all` ? "导入中" : "导入 Shopify"}</button>}</>}<button className="button quiet compact" type="button" onClick={() => toggleRun(group.key)} aria-expanded={!collapsed}>{collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}{collapsed ? "展开" : "收起"}</button></div></header>
            {group.runs.length > 1 && <div className="task-run-page-tabs" role="tablist" aria-label="已搜图页码">{group.runs.map((run) => <button className={run.id === selectedRun.id ? "active" : ""} type="button" key={run.id} onClick={() => selectRun(group, run.id)} role="tab" aria-selected={run.id === selectedRun.id}>第 {run.page} 页</button>)}</div>}
            {selectedRun.error && <p className="search-task-error">{selectedRun.error}</p>}
            {!collapsed && completed && <div className="search-task-results">{selectedRun.results.map((result, resultIndex) => {
              const detailUrl = resultDetailUrl(result);
              const importKey = `${selectedRun.id}:${result.offerId}`;
              const resultImported = importedToStore(result, selectedStoreId);
              return <article className={`search-task-result ${resultImported ? "imported" : ""}`} key={`${selectedRun.id}-${result.offerId || resultIndex}`}>
                <button className="search-task-result-image" type="button" onClick={() => result.imageUrl && setCompareState({ originalUrl, resultUrl: result.imageUrl, title: result.title || result.offerId || "图片对比" })} disabled={!result.imageUrl} aria-label="对比图片"><ImageIcon size={24} aria-hidden="true" />{result.imageUrl && <img src={proxiedImageUrl(result.imageUrl)} alt={result.title || "1688 商品图片"} loading="lazy" />}{resultImported && <span>已进当前店铺</span>}</button>
                <div className="search-task-result-copy"><strong>{result.title || result.offerId || "未命名商品"}</strong><small>{result.supplierName || "1688"}{result.location ? ` · ${result.location}` : ""}</small><div><b>{formatPrice(result)}</b>{result.sales != null && <span>销量 {result.sales}</span>}{result.offerId && <code>{result.offerId}</code>}</div></div>
                <div className="search-task-result-actions"><button type="button" onClick={() => result.offerId && void importResults(task.id, selectedRun.id, [result.offerId])} disabled={isInactive || !result.offerId || resultImported || Boolean(importingKey) || !selectedStoreId} title={selectedStoreId ? "导入到 Shopify" : "请先选择 Shopify 店铺"}>{resultImported ? <CheckCircle2 size={14} /> : <PackagePlus size={14} />}{resultImported ? "当前店铺已导入" : importingKey === importKey ? "导入中" : "导入 Shopify"}</button><button type="button" onClick={() => void openDetail(task, result, selectedRun)} disabled={!result.offerId}><FileSearch size={14} />商品详情</button><button type="button" onClick={() => result.imageUrl && setCompareState({ originalUrl, resultUrl: result.imageUrl, title: result.title || result.offerId || "图片对比" })} disabled={!result.imageUrl}><Images size={14} />对比图片</button>{detailUrl && <a href={detailUrl} target="_blank" rel="noreferrer" aria-label="打开 1688 商品页" title="打开 1688 商品页"><ExternalLink size={14} />打开1688</a>}</div>
              </article>;
            })}{selectedRun.results.length === 0 && <div className="task-run-empty"><Search size={20} /><span>这一页没有搜到匹配商品。</span></div>}</div>}
          </section>;
        })}</div>}</section>
      </article>;
    })}</div>}

    {total > 0 && <footer className="search-task-pagination"><span>{firstItem}-{lastItem} / {total}</span><nav aria-label="采集任务分页"><button className="icon-button" type="button" disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)} aria-label="上一页" title="上一页"><ChevronLeft size={18} /></button><div className="search-task-page-numbers">{paginationItems(page, pageCount).map((item) => typeof item === "number" ? <button className={item === page ? "active" : ""} type="button" key={item} onClick={() => onPageChange(item)} disabled={loading} aria-label={`第 ${item} 页`} aria-current={item === page ? "page" : undefined}>{item}</button> : <span key={item}>...</span>)}</div><button className="icon-button" type="button" disabled={page >= pageCount || loading} onClick={() => onPageChange(page + 1)} aria-label="下一页" title="下一页"><ChevronRight size={18} /></button></nav></footer>}

    {detailState && <SearchResultDetailModal {...detailState} onRefresh={() => { const run = detailState.run ?? detailState.task.runs.find((item) => item.results.some((candidate) => candidate.offerId === detailState.result.offerId)); if (run) void openDetail(detailState.task, detailState.result, run, true); }} onClose={() => setDetailState(null)} />}
    {compareState && <ImageCompareModal {...compareState} onClose={() => setCompareState(null)} />}
    {previewState && <ImagePreviewModal {...previewState} onClose={() => setPreviewState(null)} />}
  </section>;
}
