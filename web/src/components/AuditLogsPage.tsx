import { ChevronDown, ClipboardList, LoaderCircle, RefreshCw } from "lucide-react";
import { Fragment, useState } from "react";

import type { AuditLog } from "../types";

const actionLabels: Record<string, string> = {
  "auth.login": "账号登录",
  "auth.logout": "退出登录",
  "auth.bootstrap": "初始化管理员",
  "user.create": "创建账号",
  "user.update": "更新账号",
  "user.password_reset": "重置密码",
  "integration.onebound.update": "更新 OneBound 配置",
  "integration.google.update": "更新 Google 配置",
  "integration.ai.update": "更新 AI 配置",
  "integration.shopify.update": "更新 Shopify 店铺",
  "integration.shopify.test": "测试 Shopify 连接",
  "integration.shopify.delete": "删除 Shopify 店铺",
  "product.create": "创建商品",
  "product.update": "更新商品",
  "product.delete": "删除商品",
  "product.shopify.publish": "发布 Shopify 商品",
  "collection_task.search": "执行采集任务搜图",
  "collection_task.shopify.import": "导入采集结果到 Shopify",
  "search_task.query": "执行采集任务搜图（旧事件）",
  "search_task.products.import": "导入本地商品（旧事件）",
};

type Props = { logs: AuditLog[]; loading: boolean; onRefresh: () => void };

export function AuditLogsPage({ logs, loading, onRefresh }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return <section className="audit-logs-view">
    <header className="page-heading"><div><span>SYSTEM AUDIT</span><h1>操作日志</h1><p>追踪登录、账号、配置、采集任务和 Shopify 管理操作。</p></div><button className="button quiet" type="button" onClick={onRefresh} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={16} />刷新日志</button></header>
    <section className="audit-log-panel">
      <header><div><span>AUDIT TRAIL</span><h2>最近 {logs.length} 条系统操作</h2></div><small>按时间倒序记录管理员与用户操作</small></header>
      {loading ? <div className="page-loading"><LoaderCircle className="spin" size={21} />正在读取操作日志</div> : logs.length ? <div className="table-scroll"><table className="data-table audit-log-table"><thead><tr><th>时间</th><th>操作者</th><th>操作</th><th>对象</th><th>IP</th><th><span className="sr-only">详情</span></th></tr></thead><tbody>{logs.map((log) => <Fragment key={log.id}><tr><td>{new Date(log.createdAt).toLocaleString("zh-CN")}</td><td><strong>{log.userName || "系统任务"}</strong><small>{log.username || log.userId || "system"}</small></td><td><strong>{actionLabels[log.action] || log.action}</strong></td><td><span>{log.entityType}</span><small className="mono">{log.entityId || "—"}</small></td><td className="mono">{log.ipAddress || "—"}</td><td><button className="icon-button" type="button" onClick={() => setExpandedId((current) => current === log.id ? null : log.id)} aria-label="查看操作详情" title="查看操作详情"><ChevronDown size={15} /></button></td></tr>{expandedId === log.id ? <tr className="audit-log-detail-row"><td colSpan={6}><pre>{JSON.stringify(log.detail, null, 2)}</pre></td></tr> : null}</Fragment>)}</tbody></table></div> : <div className="admin-empty-state"><ClipboardList size={22} /><span>暂无操作日志</span></div>}
    </section>
  </section>;
}
