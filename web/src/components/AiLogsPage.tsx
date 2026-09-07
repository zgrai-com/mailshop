import { ChevronDown, Cpu, LoaderCircle, RefreshCw } from "lucide-react";
import { Fragment, useState } from "react";

import type { AiRequestLog } from "../types";

type Props = { logs: AiRequestLog[]; loading: boolean; onRefresh: () => void };

export function AiLogsPage({ logs, loading, onRefresh }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <section className="audit-logs-view">
      <header className="page-heading">
        <div>
          <span>AI REQUEST LOGS</span>
          <h1>AI 日志</h1>
          <p>记录每次 AI 请求的模型、状态、耗时以及完整请求和响应内容。</p>
        </div>
        <button className="button quiet" type="button" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={loading ? "spin" : ""} size={16} />刷新日志
        </button>
      </header>

      <section className="audit-log-panel">
        <header>
          <div><span>AI ACTIVITY</span><h2>最近 {logs.length} 条 AI 请求</h2></div>
          <small>按时间倒序记录，仅管理员可见</small>
        </header>

        {loading ? (
          <div className="page-loading"><LoaderCircle className="spin" size={21} />正在读取 AI 日志</div>
        ) : logs.length ? (
          <div className="table-scroll">
            <table className="data-table audit-log-table ai-log-table">
              <thead><tr><th>时间</th><th>调用人</th><th>操作 / 模型</th><th>状态</th><th>耗时</th><th>对象</th><th><span className="sr-only">详情</span></th></tr></thead>
              <tbody>
                {logs.map((log) => (
                  <Fragment key={log.id}>
                    <tr>
                      <td>{new Date(log.createdAt).toLocaleString("zh-CN")}</td>
                      <td><strong>{log.userName || "系统任务"}</strong><small>{log.userId || "system"}</small></td>
                      <td><strong>{log.operation}</strong><small className="mono">{log.scope} / {log.modelId || "-"}</small></td>
                      <td><span className={`ai-log-status ${log.status}`}>{log.status === "success" ? "成功" : "失败"}{log.httpStatus ? ` / ${log.httpStatus}` : ""}</span></td>
                      <td className="mono">{log.durationMs} ms</td>
                      <td><span>{log.entityType || "-"}</span><small className="mono">{log.entityId || "-"}</small></td>
                      <td>
                        <button className="icon-button" type="button" onClick={() => setExpandedId((current) => current === log.id ? null : log.id)} aria-label="查看 AI 请求详情" title="查看 AI 请求详情">
                          <ChevronDown size={15} />
                        </button>
                      </td>
                    </tr>
                    {expandedId === log.id ? (
                      <tr className="audit-log-detail-row">
                        <td colSpan={7}>
                          <div className="ai-log-detail">
                            <div><strong>完整请求</strong><pre>{JSON.stringify(log.requestPayload, null, 2)}</pre></div>
                            <div><strong>完整响应</strong><pre>{JSON.stringify(log.responsePayload, null, 2)}</pre></div>
                            {log.errorMessage ? <div><strong>错误</strong><pre>{log.errorMessage}</pre></div> : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty-state"><Cpu size={22} /><span>暂无 AI 请求日志</span></div>
        )}
      </section>
    </section>
  );
}
