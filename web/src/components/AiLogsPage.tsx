import { CheckCircle2, ChevronDown, CircleAlert, Clock3, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { Fragment, useState } from "react";

import type { AiRequestLog } from "../types";

const operationLabels: Record<string, string> = {
  "shopify.seo": "Shopify SEO",
  "shopify.image_analyze": "图片风格分析",
  "shopify.image_edit": "图片生成",
  "shopify.translation": "商品翻译",
  "extension.image_classify": "插件图片识别",
};

const scopeLabels: Record<string, string> = {
  chat: "AI 对话",
  image_analysis: "图片分析",
  translation: "AI 翻译",
  image_generation: "图片生成",
  image_filter: "图片识别",
};

type Props = { logs: AiRequestLog[]; loading: boolean; onRefresh: () => void };

function summaryText(value: Record<string, unknown>): string {
  return Object.entries(value).map(([key, item]) => `${key}: ${typeof item === "string" ? item : JSON.stringify(item)}`).join(" · ");
}

export function AiLogsPage({ logs, loading, onRefresh }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return <section className="ai-logs-view">
    <header className="page-heading"><div><span>AI OBSERVABILITY</span><h1>AI 请求日志</h1><p>查看 AI 请求的状态、耗时和模型返回摘要，定位失败原因。</p></div><button className="button quiet" type="button" onClick={onRefresh} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={16} />刷新日志</button></header>
    <section className="ai-log-summary"><div><Sparkles size={18} /><strong>{logs.length}</strong><span>最近请求</span></div><div><CheckCircle2 size={18} /><strong>{logs.filter((item) => item.status === "success").length}</strong><span>成功</span></div><div><CircleAlert size={18} /><strong>{logs.filter((item) => item.status === "failed").length}</strong><span>失败</span></div><div><Clock3 size={18} /><strong>{logs.length ? Math.round(logs.reduce((total, item) => total + item.durationMs, 0) / logs.length) : 0}ms</strong><span>平均耗时</span></div></section>
    <section className="ai-log-panel"><header><div><span>REQUEST LOG</span><h2>最近 100 条 AI 请求</h2></div><small>请求摘要已脱敏，不记录 API Key 和完整图片响应</small></header>
      {loading ? <div className="page-loading"><LoaderCircle className="spin" size={21} />正在读取 AI 日志</div> : logs.length ? <div className="table-scroll"><table className="data-table ai-log-table"><thead><tr><th>时间</th><th>功能</th><th>状态</th><th>HTTP</th><th>耗时</th><th>请求摘要</th><th>模型</th><th><span className="sr-only">详情</span></th></tr></thead><tbody>{logs.map((log) => <Fragment key={log.id}><tr className={expandedId === log.id ? "expanded" : ""}><td>{new Date(log.createdAt).toLocaleString("zh-CN")}</td><td><strong>{operationLabels[log.operation] ?? log.operation}</strong><small>{scopeLabels[log.scope] ?? log.scope}</small></td><td><span className={`ai-log-status ${log.status}`}>{log.status === "success" ? "成功" : "失败"}</span></td><td>{log.httpStatus ?? "—"}</td><td>{log.durationMs}ms</td><td className="ai-log-summary-cell" title={summaryText(log.requestSummary)}>{summaryText(log.requestSummary) || "—"}</td><td className="mono">{log.modelId || "—"}</td><td><button className="icon-button" type="button" onClick={() => setExpandedId((current) => current === log.id ? null : log.id)} aria-label="查看日志详情" title="查看日志详情"><ChevronDown size={15} /></button></td></tr>{expandedId === log.id ? <tr className="ai-log-detail-row"><td colSpan={8} className="ai-log-detail"><div><strong>请求摘要</strong><pre>{JSON.stringify(log.requestSummary, null, 2)}</pre></div><div><strong>{log.status === "failed" ? "错误信息" : "返回摘要"}</strong><pre>{log.status === "failed" ? log.errorMessage || "未知错误" : JSON.stringify(log.responseSummary, null, 2)}</pre></div></td></tr> : null}</Fragment>)}</tbody></table></div> : <div className="ai-log-empty"><Sparkles size={24} /><strong>暂无 AI 请求日志</strong><span>使用 SEO、图片处理或多语言翻译后，日志会显示在这里。</span></div>}
    </section>
  </section>;
}
