import { ChevronDown, Cpu, LoaderCircle, RefreshCw } from "lucide-react";
import { Fragment, useState } from "react";

import type { AiRequestLog } from "../types";

type Props = { logs: AiRequestLog[]; loading: boolean; isAdmin: boolean; onRefresh: () => void };

const operationLabels: Record<string, string> = {
  "extension.image_classify": "浏览器插件图片识别",
  "shopify.description": "生成商品描述",
  "shopify.title": "生成商品标题",
  "shopify.seo": "生成 SEO 信息",
  "shopify.image_analyze": "分析商品图片",
  "shopify.image_edit": "编辑商品图片",
  "shopify.translation": "翻译商品内容",
};

const scopeLabels: Record<string, string> = {
  image_filter: "图片筛选",
  image_analysis: "图片分析",
  chat: "文本生成",
  translation: "内容翻译",
  image_generation: "图片生成",
};

const entityLabels: Record<string, string> = {
  shopify_product: "Shopify 商品",
};

function operationLabel(operation: string): string {
  return operationLabels[operation] || "其他 AI 操作";
}

function scopeLabel(scope: string): string {
  return scopeLabels[scope] || "其他 AI 类型";
}

function modelLabel(modelId: string | null): string {
  if (!modelId) return "模型未记录";
  if (/image/iu.test(modelId)) return `图片生成模型（${modelId}）`;
  if (/vision/iu.test(modelId)) return `图片理解模型（${modelId}）`;
  if (/gpt|claude|gemini|qwen|deepseek/iu.test(modelId)) return `文本生成模型（${modelId}）`;
  return `自定义 AI 模型（${modelId}）`;
}

function entityIdLabel(entityId: string | null): string {
  if (!entityId) return "未关联业务对象";
  const productId = entityId.match(/^gid:\/\/shopify\/Product\/(.+)$/u)?.[1];
  return productId ? `商品 ID：${productId}` : entityId;
}

function isEmptyPayload(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === "object" && Object.keys(value as Record<string, unknown>).length === 0;
}

function isEmptyResponseMarker(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.bodyPresent === false && record.rawText === "";
}

function payloadMessage(value: unknown, available: boolean, providerRequest: boolean, kind: "request" | "response"): string {
  if (!available && !providerRequest) {
    return `这条历史记录只保存了业务摘要，未保存完整的模型内容。\n\n业务摘要：\n${JSON.stringify(value, null, 2)}`;
  }
  if (kind === "response" && isEmptyResponseMarker(value)) return "模型服务返回 HTTP 成功状态，但响应正文为空。";
  if (kind === "response" && isEmptyPayload(value)) return "模型服务已返回成功状态，但响应正文为空。";
  if (kind === "request" && isEmptyPayload(value)) return "请求正文为空。";
  return JSON.stringify(value, null, 2);
}

function isAvailable(log: AiRequestLog, kind: "request" | "response"): boolean {
  const explicit = kind === "request" ? log.requestPayloadAvailable : log.responsePayloadAvailable;
  if (typeof explicit === "boolean") return explicit;
  return !isEmptyPayload(kind === "request" ? log.requestPayload : log.responsePayload);
}

export function AiLogsPage({ logs, loading, isAdmin, onRefresh }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <section className="audit-logs-view">
      <header className="page-heading">
        <div>
          <span>AI REQUEST LOGS</span>
          <h1>{isAdmin ? "AI 日志" : "我的 AI 日志"}</h1>
          <p>{isAdmin ? "记录全部用户的 AI 请求，支持查看完整请求和响应内容。" : "仅显示当前账号发起的 AI 请求，支持查看完整请求和响应内容。"}</p>
        </div>
        <button className="button quiet" type="button" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={loading ? "spin" : ""} size={16} />刷新日志
        </button>
      </header>

      <section className="audit-log-panel">
        <header>
          <div><span>AI ACTIVITY</span><h2>{isAdmin ? "最近" : "我的"} {logs.length} 条 AI 请求</h2></div>
          <small>{isAdmin ? "按时间倒序记录，管理员可查看全部用户" : "按时间倒序记录，仅当前账号可见"}</small>
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
                      <td><strong>{log.userName || "系统任务"}</strong><small className="mono">{log.userId ? `账号 ID：${log.userId}` : "系统任务"}</small></td>
                      <td><strong>{operationLabel(log.operation)}</strong><small>{scopeLabel(log.scope)} · {modelLabel(log.modelId)}</small></td>
                      <td><span className={`ai-log-status ${log.status}`}>{log.status === "success" ? "成功" : "失败"}{log.httpStatus ? ` / ${log.httpStatus}` : ""}</span></td>
                      <td className="mono">{log.durationMs} ms</td>
                      <td><strong>{entityLabels[log.entityType || ""] || "业务对象"}</strong><small className="mono">{entityIdLabel(log.entityId)}</small></td>
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
                            <div><strong>完整请求</strong><pre>{payloadMessage(log.requestPayload, isAvailable(log, "request"), Boolean(log.providerRequest), "request")}</pre></div>
                            <div><strong>完整响应</strong><pre>{payloadMessage(log.responsePayload, isAvailable(log, "response"), Boolean(log.providerRequest), "response")}</pre></div>
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
