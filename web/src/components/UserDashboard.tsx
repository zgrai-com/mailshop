import { Coins, PackageSearch, Search } from "lucide-react";

import type { DashboardSummary, User } from "../types";

type Props = { user: User; summary: DashboardSummary | null; onProducts: () => void; onCredits: () => void };

export function UserDashboard({ user, summary, onProducts, onCredits }: Props) {
  return (
    <section className="dashboard-view">
      <header className="page-heading"><div><span>OVERVIEW</span><h1>仪表台</h1><p>{user.displayName}，这里是你的商品与积分概览</p></div></header>
      <section className="dashboard-metrics">
        <button type="button" onClick={onProducts}><PackageSearch size={20} /><span>商品总数</span><strong>{summary?.total ?? 0}</strong><small>进入商品管理</small></button>
        <button type="button" onClick={onProducts}><Search size={20} /><span>待以图搜索</span><strong>{summary?.searchingCount ?? 0}</strong><small>继续处理商品</small></button>
        <button type="button" onClick={onCredits}><Coins size={20} /><span>可用积分</span><strong>{user.credits.toLocaleString()}</strong><small>查看积分流水</small></button>
      </section>
      <section className="dashboard-recent">
        <header><div><span>RECENT PRODUCTS</span><h2>最近更新的商品</h2></div><button className="button quiet compact" type="button" onClick={onProducts}>查看全部</button></header>
        {summary?.recentProducts.length ? <div>{summary.recentProducts.map((product) => <button key={product.id} type="button" onClick={onProducts}><span>{product.thumbnailUrl ? <img src={product.thumbnailUrl} alt="" /> : <PackageSearch size={18} />}</span><strong>{product.title}</strong><small>{new Date(product.updatedAt).toLocaleDateString("zh-CN")}</small></button>)}</div> : <p>暂无商品记录</p>}
      </section>
    </section>
  );
}
