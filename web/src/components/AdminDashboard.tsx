import { Activity, AlertTriangle, CheckCircle2, ClipboardList, FileText, Gauge, ListChecks, Settings, Store, Users } from "lucide-react";

import type { AiRequestLog, AuditLog, DashboardSummary, User } from "../types";

type Props = {
  user: User;
  summary: DashboardSummary | null;
  logs: AiRequestLog[];
  auditLogs: AuditLog[];
  onLogs: () => void;
  onAuditLogs: () => void;
  onAccounts: () => void;
  onSettings: () => void;
};

function percent(value: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export function AdminDashboard({ user, summary, logs, auditLogs, onLogs, onAuditLogs, onAccounts, onSettings }: Props) {
  const successCount = logs.filter((log) => log.status === "success").length;
  const failedCount = logs.filter((log) => log.status === "failed").length;
  const averageDuration = logs.length ? Math.round(logs.reduce((total, log) => total + log.durationMs, 0) / logs.length) : 0;
  const healthItems = [
    { label: "AI 服务", value: logs.length ? `${percent(successCount, logs.length)} 成功率` : "暂无请求", tone: failedCount ? "warn" : "good", icon: failedCount ? AlertTriangle : CheckCircle2 },
    { label: "采集任务", value: `${summary?.collectionTaskCount ?? 0} 个任务`, tone: "neutral", icon: ListChecks },
  ];

  return (
    <section className="admin-dashboard-view">
      <header className="page-heading admin-dashboard-heading">
        <div><span>CONTROL CENTER</span><h1>管理概览</h1><p>{user.displayName}，这里集中查看系统运行状态、账号和集成服务。</p></div>
        <span className="admin-role-chip"><Gauge size={15} />ADMIN CONTROL</span>
      </header>

      <section className="admin-metrics" aria-label="系统统计">
        <div><Users size={19} /><span>活跃账号</span><strong>{summary?.activeUsers ?? 0}</strong><small>用户访问权限与状态</small></div>
        <div><ListChecks size={19} /><span>采集任务</span><strong>{summary?.collectionTaskCount ?? 0}</strong><small>{summary?.importedTaskCount ?? 0} 个已导入</small></div>
        <div><Store size={19} /><span>Shopify 店铺</span><strong>{summary?.activeShopifyStoreCount ?? 0}</strong><small>{summary?.shopifyProductCount ?? 0} 个货源已导入</small></div>
        <div><Activity size={19} /><span>AI 请求</span><strong>{logs.length}</strong><small>{averageDuration}ms 平均耗时</small></div>
      </section>

      <div className="admin-dashboard-grid">
        <section className="admin-health-panel">
          <header><div><span>SYSTEM HEALTH</span><h2>系统状态</h2></div><span className="admin-live-status"><i />实时概览</span></header>
          <div className="admin-health-list">
            {healthItems.map(({ label, value, tone, icon: Icon }) => <div key={label} className={`admin-health-item ${tone}`}><Icon size={17} /><div><strong>{label}</strong><span>{value}</span></div><CheckCircle2 size={15} /></div>)}
          </div>
        </section>

        <section className="admin-actions-panel">
          <header><div><span>ADMIN TOOLS</span><h2>常用管理</h2></div><Settings size={17} /></header>
          <div className="admin-action-list">
            <button type="button" onClick={onAccounts}><Users size={17} /><span><strong>账号管理</strong><small>创建、停用和重置用户密码</small></span></button>
            <button type="button" onClick={onAuditLogs}><ClipboardList size={17} /><span><strong>操作日志</strong><small>追踪登录、配置和管理操作</small></span></button>
            <button type="button" onClick={onLogs}><FileText size={17} /><span><strong>AI 请求日志</strong><small>查看失败请求、模型与耗时</small></span></button>
            <button type="button" onClick={onSettings}><Settings size={17} /><span><strong>系统设置</strong><small>AI、Google 与 OneBound 集成</small></span></button>
          </div>
        </section>
      </div>

      <section className="admin-recent-panel">
        <header><div><span>RECENT ACTIVITY</span><h2>最近系统操作</h2></div><button className="button quiet compact" type="button" onClick={onAuditLogs}>查看完整日志</button></header>
        {auditLogs.length ? <div className="admin-activity-table"><table className="data-table"><thead><tr><th>时间</th><th>操作者</th><th>操作</th><th>对象</th><th>IP</th></tr></thead><tbody>{auditLogs.slice(0, 6).map((log) => <tr key={log.id}><td>{new Date(log.createdAt).toLocaleString("zh-CN")}</td><td><strong>{log.userName || "系统任务"}</strong><small>{log.username || "system"}</small></td><td>{log.action}</td><td><strong>{log.entityType}</strong><small className="mono">{log.entityId || "—"}</small></td><td className="mono">{log.ipAddress || "—"}</td></tr>)}</tbody></table></div> : <div className="admin-empty-state"><Activity size={21} /><span>暂无系统操作记录</span></div>}
      </section>
    </section>
  );
}
