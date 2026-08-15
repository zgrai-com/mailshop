import { AlertTriangle, Copy, X } from "lucide-react";
import { useMemo, useState } from "react";

import { ApiClientError } from "../api";

type Props = {
  error: unknown;
  onClose: () => void;
};

function formatDetails(value: unknown): string {
  if (value === undefined) return "没有更多响应内容";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ErrorDialog({ error, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const info = useMemo(() => {
    if (error instanceof ApiClientError) {
      return {
        message: error.message,
        status: error.status,
        code: error.code,
        requestId: error.requestId,
        path: error.path,
        details: formatDetails(error.details),
      };
    }
    return {
      message: error instanceof Error ? error.message : "未知错误",
      details: formatDetails(error instanceof Error ? { name: error.name, stack: error.stack } : error),
    };
  }, [error]);

  const report = [
    `Message: ${info.message}`,
    info.status ? `HTTP Status: ${info.status}` : null,
    info.code ? `Error Code: ${info.code}` : null,
    info.path ? `Request: ${info.path}` : null,
    info.requestId ? `Request ID: ${info.requestId}` : null,
    "",
    info.details,
  ].filter((line) => line !== null).join("\n");

  async function copyReport() {
    await navigator.clipboard.writeText(report);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <div className="modal-backdrop error-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal error-modal" role="dialog" aria-modal="true" aria-labelledby="error-dialog-title">
        <header className="modal-header error-modal-header">
          <div className="error-modal-title"><span className="error-modal-icon"><AlertTriangle size={19} /></span><div><span>API ERROR</span><h2 id="error-dialog-title">接口请求失败</h2></div></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭错误详情" title="关闭"><X size={19} /></button>
        </header>
        <div className="error-modal-body">
          <p className="error-message">{info.message}</p>
          <dl className="error-meta">
            {info.status && <div><dt>HTTP 状态</dt><dd>{info.status}</dd></div>}
            {info.code && <div><dt>错误代码</dt><dd className="mono">{info.code}</dd></div>}
            {info.path && <div><dt>请求接口</dt><dd className="mono">{info.path}</dd></div>}
            {info.requestId && <div><dt>请求 ID</dt><dd className="mono">{info.requestId}</dd></div>}
          </dl>
          <div className="error-response-heading"><span>响应详情</span><button className="button quiet compact" type="button" onClick={() => void copyReport()}><Copy size={15} />{copied ? "已复制" : "复制错误"}</button></div>
          <pre className="error-response">{info.details}</pre>
        </div>
        <footer className="error-modal-actions"><button className="button primary" type="button" onClick={onClose}>关闭</button></footer>
      </section>
    </div>
  );
}
