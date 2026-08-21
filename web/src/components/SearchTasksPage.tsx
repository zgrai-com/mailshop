import {
  CheckCircle2,
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
} from "lucide-react";
import { useState } from "react";

import { api, toQuery } from "../api";
import type { OneBoundItemPreview, SearchTask, SearchTaskOptions, SearchTaskResult, SearchTaskRun } from "../types";
import { ImageCompareModal } from "./ImageCompareModal";
import { SearchResultDetailModal } from "./SearchResultDetailModal";

const labels = { unqueried: "未查询", queried: "已查询", imported: "已导入" } as const;

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
  loading: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: SearchTaskStatus) => void;
  onPageChange: (value: number) => void;
  onPageSizeChange: (value: number) => void;
  onRefresh: () => void;
  onRun: (taskId: string, input: SearchTaskOptions & { imageId: string }) => Promise<void>;
  onImport: (taskId: string, runId: string, offerIds?: string[]) => Promise<void>;
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
  return [
    options.sort,
    `${options.limit} 条/页`,
    options.lang.toUpperCase(),
    options.cache === "yes" ? "使用缓存" : "最新数据",
    options.version ? `版本 ${options.version}` : "",
  ].filter(Boolean);
}

export function SearchTasksPage({
  tasks,
  total,
  page,
  pageSize,
  search,
  status,
  loading,
  onSearchChange,
  onStatusChange,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  onRun,
  onImport,
}: Props) {
  const [collapsedRunIds, setCollapsedRunIds] = useState<Set<string>>(() => new Set());
  const [drafts, setDrafts] = useState<Record<string, QueryDraft>>({});
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<{ result: SearchTaskResult; detail: OneBoundItemPreview | null; loading: boolean; error: string | null } | null>(null);
  const [compareState, setCompareState] = useState<{ originalUrl: string; resultUrl: string; title: string } | null>(null);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);
  const hasFilters = Boolean(search.trim()) || status !== "all";

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

  async function runQuery(task: SearchTask, queryDraft = draft(task)) {
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
      await onImport(taskId, runId, offerIds);
    } finally {
      setImportingKey(null);
    }
  }

  async function openDetail(result: SearchTaskResult, run: SearchTaskRun) {
    if (!result.offerId) return;
    setDetailState({ result, detail: null, loading: true, error: null });
    try {
      const response = await api<{ item: OneBoundItemPreview }>(`/api/integrations/onebound/items/${encodeURIComponent(result.offerId)}${toQuery({ cache: run.options.cache, lang: run.options.lang })}`);
      setDetailState({ result, detail: response.item, loading: false, error: null });
    } catch (caught) {
      setDetailState({ result, detail: null, loading: false, error: caught instanceof Error ? caught.message : "详情请求失败" });
    }
  }

  function clearFilters() {
    onSearchChange("");
    onStatusChange("all");
  }

  return <section className="search-tasks-view">
    <header className="page-heading"><div><span>IMAGE SEARCH HISTORY</span><h1>查询任务</h1><p>从插件采集的商品图片发起多轮 1688 查询，并管理查询结果。</p></div><div className="search-task-count">{hasFilters ? `${total} 个匹配任务` : `${total} 个任务`}</div></header>

    <section className="search-task-controls" aria-label="查询任务筛选">
      <label className="search-field search-task-search"><Search size={17} /><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="搜索任务名、商品标题、商品 ID 或供应商" aria-label="搜索查询任务" /></label>
      <div className="filter-group">
        <Filter size={16} />
        <select value={status} onChange={(event) => onStatusChange(event.target.value as SearchTaskStatus)} aria-label="按任务状态筛选"><option value="all">全部状态</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} aria-label="每页任务数量"><option value={5}>每页 5 个</option><option value={10}>每页 10 个</option><option value={20}>每页 20 个</option></select>
        <button className="icon-button" type="button" onClick={onRefresh} disabled={loading} aria-label="刷新查询任务" title="刷新"><RefreshCw className={loading ? "spin" : ""} size={17} /></button>
      </div>
    </section>

    <div className="search-task-list-meta"><span>{total ? `显示 ${firstItem}-${lastItem}，共 ${total} 个任务` : "暂无匹配任务"}</span><span>第 {page} / {pageCount} 页</span></div>

    {loading && tasks.length === 0 ? <div className="search-task-state"><LoaderCircle className="spin" size={20} />正在加载查询任务</div> : tasks.length === 0 ? <div className="search-task-state"><Search size={22} /><strong>{hasFilters ? "没有符合条件的任务" : "暂无查询任务"}</strong><span>{hasFilters ? "尝试修改关键词或任务状态。" : "从浏览器插件提交任务后，会同步显示在这里。"}</span>{hasFilters && <button className="button quiet compact" type="button" onClick={clearFilters}>清除筛选</button>}</div> : <div className={`search-task-list ${loading ? "loading" : ""}`} aria-busy={loading}>{tasks.map((task) => {
      const queryDraft = draft(task);
      const isRunning = task.querying || runningTaskId === task.id;
      return <article className="search-task-card" key={task.id}>
        <div className="search-task-main"><div className={`search-task-status ${task.status}`}>{task.status === "unqueried" ? <Clock3 size={15} /> : <CheckCircle2 size={15} />}{labels[task.status]}</div>{isRunning && <span className="search-task-running"><LoaderCircle className="spin" size={14} />查询中</span>}<h2 title={task.productTitle || task.name}>{task.productTitle || task.name}</h2><time dateTime={task.updatedAt}>{new Date(task.updatedAt).toLocaleString("zh-CN")}</time></div>
        <div className="search-task-meta">{task.sku && <span>SKU <b>{task.sku}</b></span>}{task.sourceSite && <span>网站 <b>{task.sourceSite}</b></span>}<span>图片 <b>{task.images.length}</b></span><span>查询轮次 <b>{task.runs.length}</b></span><span>累计结果 <b>{task.resultCount}</b></span><span>已导入 <b>{task.importedCount}</b></span><span>消耗 <b>{task.chargedCredits}</b> 积分</span>{(task.productUrl || task.sourcePage) && <a href={task.productUrl || task.sourcePage || undefined} target="_blank" rel="noreferrer">商品页面 <ExternalLink size={13} /></a>}</div>
        {task.description && <p className="search-task-description">{task.description}</p>}

        <section className="task-query-workbench" aria-label={`${task.name} 查询配置`}>
          <div className="task-query-images"><header><div><span>SOURCE IMAGES</span><strong>选择查询图片</strong></div><small>{task.images.length} 张</small></header><div>{task.images.map((image, index) => <button className={image.id === queryDraft.imageId ? "selected" : ""} type="button" key={image.id} onClick={() => patchDraft(task, { imageId: image.id })} title={`选择第 ${index + 1} 张图片`} aria-label={`选择第 ${index + 1} 张图片`}><img src={proxiedImageUrl(image.url)} alt={image.alt || `源图片 ${index + 1}`} loading="lazy" /><span>{String(index + 1).padStart(2, "0")}</span></button>)}</div></div>
          <div className="task-query-config"><header><div><span>SEARCH CONFIG</span><strong>查询参数</strong></div><small>本次消耗 10 积分</small></header><div className="task-query-fields">
            <label><span>排序</span><select value={queryDraft.sort} onChange={(event) => patchDraft(task, { sort: event.target.value as QueryDraft["sort"] })}><option value="_sale">销量高到低</option><option value="sale">销量低到高</option><option value="bid2">总价低到高</option><option value="_bid2">总价高到低</option></select></label>
            <label><span>页码</span><input type="number" min={1} max={1000} value={queryDraft.page} onChange={(event) => patchDraft(task, { page: Math.max(1, Number(event.target.value) || 1) })} /></label>
            <label><span>每页</span><select value={queryDraft.limit} onChange={(event) => patchDraft(task, { limit: Number(event.target.value) })}><option value={10}>10</option><option value={20}>20</option><option value={30}>30</option><option value={40}>40</option><option value={50}>50</option></select></label>
            <label><span>语言</span><select value={queryDraft.lang} onChange={(event) => patchDraft(task, { lang: event.target.value as QueryDraft["lang"] })}><option value="cn">中文</option><option value="en">English</option><option value="ru">Русский</option></select></label>
            <label><span>缓存</span><select value={queryDraft.cache} onChange={(event) => patchDraft(task, { cache: event.target.value as QueryDraft["cache"] })}><option value="no">最新数据</option><option value="yes">使用缓存</option></select></label>
            <label><span>API 版本</span><input value={queryDraft.version} onChange={(event) => patchDraft(task, { version: event.target.value })} placeholder="可留空" /></label>
          </div><button className="button primary task-query-submit" type="button" onClick={() => void runQuery(task)} disabled={isRunning || !queryDraft.imageId}>{isRunning ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />}{isRunning ? "正在查询" : task.runs.length ? "发起新一轮查询" : "开始查询"}</button></div>
        </section>

        <section className="task-run-history" aria-label={`${task.name} 查询轮次`}><header><div><span>QUERY ROUNDS</span><strong>查询记录</strong></div><small>{task.runs.length} 轮</small></header>{task.runs.length === 0 ? <div className="task-run-empty"><Images size={20} /><span>尚未查询，选择图片并填写参数后开始第一轮。</span></div> : <div className="task-run-list">{task.runs.map((run, index) => {
          const collapsed = collapsedRunIds.has(run.id);
          const completed = run.status === "completed";
          const originalUrl = run.imageUrl;
          const pendingOfferIds = run.results.flatMap((result) => !result.imported && result.offerId ? [result.offerId] : []);
          return <section className={`task-run ${run.status}`} key={run.id}>
            <header className="task-run-header"><div className="task-run-source"><img src={proxiedImageUrl(originalUrl)} alt={`第 ${task.runs.length - index} 轮查询原图`} /><div><span>第 {task.runs.length - index} 轮 · 第 {run.page} 页</span><strong>{run.status === "running" ? "正在查询" : run.status === "failed" ? "查询失败" : `本页 ${run.resultCount} 条${run.totalResultCount != null ? ` / 共 ${run.totalResultCount} 条` : ""}`}</strong><small>{new Date(run.createdAt).toLocaleString("zh-CN")}</small></div></div><div className="task-run-actions">{completed && <><button className="button quiet compact" type="button" onClick={() => void runQuery(task, draftForRun(run, Math.max(1, run.page - 1)))} disabled={isRunning || run.page <= 1}><ChevronLeft size={15} />上一页</button><button className="button quiet compact" type="button" onClick={() => void runQuery(task, draftForRun(run, run.page + 1))} disabled={isRunning}>下一页<ChevronRight size={15} /></button>{pendingOfferIds.length > 0 && <button className="button quiet compact" type="button" onClick={() => void importResults(task.id, run.id, pendingOfferIds)} disabled={Boolean(importingKey)}><PackagePlus size={15} />{importingKey === `${run.id}:all` ? "导入中" : "导入本页"}</button>}</>}<button className="button quiet compact" type="button" onClick={() => toggleRun(run.id)} aria-expanded={!collapsed}>{collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}{collapsed ? "展开" : "收起"}</button></div></header>
            <div className="task-run-params">{runParameterText(run).map((text) => <span key={text}>{text}</span>)}</div>
            {run.error && <p className="search-task-error">{run.error}</p>}
            {!collapsed && completed && <div className="search-task-results">{run.results.map((result, resultIndex) => {
              const detailUrl = resultDetailUrl(result);
              const importKey = `${run.id}:${result.offerId}`;
              return <article className={`search-task-result ${result.imported ? "imported" : ""}`} key={`${run.id}-${result.offerId || resultIndex}`}>
                <button className="search-task-result-image" type="button" onClick={() => result.imageUrl && setCompareState({ originalUrl, resultUrl: result.imageUrl, title: result.title || result.offerId || "图片对比" })} disabled={!result.imageUrl} aria-label="对比图片"><ImageIcon size={24} aria-hidden="true" />{result.imageUrl && <img src={proxiedImageUrl(result.imageUrl)} alt={result.title || "1688 商品图片"} loading="lazy" />}{result.imported && <span>已导入</span>}</button>
                <div className="search-task-result-copy"><strong>{result.title || result.offerId || "未命名商品"}</strong><small>{result.supplierName || "1688"}{result.location ? ` · ${result.location}` : ""}</small><div><b>{formatPrice(result)}</b>{result.sales != null && <span>销量 {result.sales}</span>}{result.offerId && <code>{result.offerId}</code>}</div></div>
                <div className="search-task-result-actions"><button type="button" onClick={() => result.offerId && void importResults(task.id, run.id, [result.offerId])} disabled={!result.offerId || result.imported || Boolean(importingKey)}>{result.imported ? <CheckCircle2 size={14} /> : <PackagePlus size={14} />}{result.imported ? "已导入" : importingKey === importKey ? "导入中" : "导入到商品库"}</button><button type="button" onClick={() => void openDetail(result, run)} disabled={!result.offerId}><FileSearch size={14} />查询详情</button><button type="button" onClick={() => result.imageUrl && setCompareState({ originalUrl, resultUrl: result.imageUrl, title: result.title || result.offerId || "图片对比" })} disabled={!result.imageUrl}><Images size={14} />对比图片</button>{detailUrl && <a href={detailUrl} target="_blank" rel="noreferrer" aria-label="打开 1688 商品页" title="打开 1688 商品页"><ExternalLink size={14} /></a>}</div>
              </article>;
            })}{run.results.length === 0 && <div className="task-run-empty"><Search size={20} /><span>这一页没有查询到匹配商品。</span></div>}</div>}
          </section>;
        })}</div>}</section>
      </article>;
    })}</div>}

    {total > 0 && <footer className="search-task-pagination"><span>{firstItem}-{lastItem} / {total}</span><nav aria-label="查询任务分页"><button className="icon-button" type="button" disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)} aria-label="上一页" title="上一页"><ChevronLeft size={18} /></button><div className="search-task-page-numbers">{paginationItems(page, pageCount).map((item) => typeof item === "number" ? <button className={item === page ? "active" : ""} type="button" key={item} onClick={() => onPageChange(item)} disabled={loading} aria-label={`第 ${item} 页`} aria-current={item === page ? "page" : undefined}>{item}</button> : <span key={item}>...</span>)}</div><button className="icon-button" type="button" disabled={page >= pageCount || loading} onClick={() => onPageChange(page + 1)} aria-label="下一页" title="下一页"><ChevronRight size={18} /></button></nav></footer>}

    {detailState && <SearchResultDetailModal {...detailState} onClose={() => setDetailState(null)} />}
    {compareState && <ImageCompareModal {...compareState} onClose={() => setCompareState(null)} />}
  </section>;
}
