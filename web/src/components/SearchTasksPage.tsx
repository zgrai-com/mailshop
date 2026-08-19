import { ExternalLink, LoaderCircle, Search, XCircle, CheckCircle2, Clock3 } from "lucide-react";
import type { SearchTask } from "../types";

const labels = { queued: "排队中", running: "查询中", completed: "已完成", failed: "失败" } as const;

export function SearchTasksPage({ tasks, loading }: { tasks: SearchTask[]; loading: boolean }) {
  return <section className="search-tasks-view">
    <header className="page-heading"><div><span>IMAGE SEARCH HISTORY</span><h1>查询任务</h1><p>查看浏览器插件提交的以图搜产品任务与结果。</p></div><div className="search-task-count">{tasks.length} 个任务</div></header>
    {loading ? <div className="search-task-state"><LoaderCircle className="spin" size={20} />正在加载查询任务</div> : tasks.length === 0 ? <div className="search-task-state"><Search size={22} /><strong>暂无查询任务</strong><span>从浏览器插件提交任务后，会同步显示在这里。</span></div> : <div className="search-task-list">{tasks.map((task) => <article className="search-task-card" key={task.id}>
      <div className="search-task-main"><div className={`search-task-status ${task.status}`}>{task.status === "completed" ? <CheckCircle2 size={15} /> : task.status === "failed" ? <XCircle size={15} /> : task.status === "running" ? <LoaderCircle className="spin" size={15} /> : <Clock3 size={15} />}{labels[task.status]}</div><h2>{task.name}</h2><time dateTime={task.updatedAt}>{new Date(task.updatedAt).toLocaleString("zh-CN")}</time></div>
      <div className="search-task-meta"><span>结果 <b>{task.resultCount}</b></span><span>消耗 <b>{task.chargedCredits}</b> 积分</span><span>参数 {task.options?.sort || "_sale"} / {task.options?.limit || 30}</span>{task.sourcePage && <a href={task.sourcePage} target="_blank" rel="noreferrer">来源页面 <ExternalLink size={13} /></a>}</div>
      {task.error && <p className="search-task-error">{task.error}</p>}
      {task.results?.length ? <div className="search-task-results">{task.results.slice(0, 8).map((result, index) => <a key={`${result.offerId || index}`} href={result.detailUrl || "#"} target="_blank" rel="noreferrer"><span>{result.title || result.offerId || "未命名商品"}</span><small>{result.supplierName || "1688"}</small></a>)}</div> : null}
    </article>)}</div>}
  </section>;
}
