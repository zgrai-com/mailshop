import { ClipboardList, Coins, PackageSearch, Store } from "lucide-react";

import type { DashboardSummary, User } from "../types";

type Props = {
  user: User;
  summary: DashboardSummary | null;
  onTasks: () => void;
  onShopifyProducts: () => void;
  onStores: () => void;
  onCredits: () => void;
};

const statusLabels = { unqueried: "待搜图", queried: "已搜图", imported: "已导入 Shopify" } as const;

export function UserDashboard({ user, summary, onTasks, onShopifyProducts, onStores, onCredits }: Props) {
  return (
    <section className="dashboard-view">
      <header className="page-heading"><div><span>OVERVIEW</span><h1>仪表台</h1><p>{user.displayName}，这里是你的采集任务、Shopify 与积分概览</p></div></header>
      <section className="dashboard-metrics">
        <button type="button" onClick={onTasks}><ClipboardList size={20} /><span>采集任务</span><strong>{summary?.collectionTaskCount ?? 0}</strong><small>{summary?.unqueriedTaskCount ?? 0} 个待搜图</small></button>
        <button type="button" onClick={onShopifyProducts}><PackageSearch size={20} /><span>已导入 Shopify</span><strong>{summary?.shopifyProductCount ?? 0}</strong><small>查看 Shopify 商品</small></button>
        <button type="button" onClick={onStores}><Store size={20} /><span>可用店铺</span><strong>{summary?.activeShopifyStoreCount ?? 0}</strong><small>管理 Shopify 店铺</small></button>
        <button type="button" onClick={onCredits}><Coins size={20} /><span>可用积分</span><strong>{user.credits.toLocaleString()}</strong><small>查看积分流水</small></button>
      </section>
      <section className="dashboard-recent">
        <header><div><span>RECENT TASKS</span><h2>最近更新的采集任务</h2></div><button className="button quiet compact" type="button" onClick={onTasks}>查看全部</button></header>
        {summary?.recentCollectionTasks.length ? <div>{summary.recentCollectionTasks.map((task) => <button key={task.id} type="button" onClick={onTasks}><span>{task.thumbnailUrl ? <img src={task.thumbnailUrl} alt="" /> : <ClipboardList size={18} />}</span><strong>{task.name}</strong><small>{statusLabels[task.status]} · {new Date(task.updatedAt).toLocaleDateString("zh-CN")}</small></button>)}</div> : <p>暂无采集任务</p>}
      </section>
    </section>
  );
}
