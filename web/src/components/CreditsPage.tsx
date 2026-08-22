import { Coins, LoaderCircle } from "lucide-react";

import type { CreditTransaction } from "../types";

const reasonLabels: Record<string, string> = {
  "account.signup": "新用户赠送",
  "account.migration": "初始积分",
  "image_search.charge": "以图搜商品",
  "image_search.refund": "搜图失败退还",
  "ai.charge": "AI 请求",
  "ai.refund": "AI 请求失败退还",
  "product_detail.charge": "商品详情",
  "product_detail.refund": "详情请求失败退还",
};

type Props = { balance: number; transactions: CreditTransaction[]; loading: boolean };

export function CreditsPage({ balance, transactions, loading }: Props) {
  return (
    <section className="credits-view">
      <header className="page-heading"><div><span>CREDITS</span><h1>积分管理</h1><p>查看可用积分与最近收支记录</p></div></header>
      <section className="credit-summary-band">
        <div><span className="credit-summary-icon"><Coins size={22} /></span><div><small>当前可用</small><strong>{balance.toLocaleString()}</strong><span>积分</span></div></div>
        <dl><div><dt>以图搜商品</dt><dd>20 积分 / 次</dd></div><div><dt>AI 请求</dt><dd>5 积分 / 次</dd></div><div><dt>商品详情</dt><dd>5 积分 / 次</dd></div><div><dt>失败请求</dt><dd>自动退还</dd></div></dl>
      </section>
      <section className="credit-ledger">
        <header><div><span>TRANSACTIONS</span><h2>积分流水</h2></div><small>最近 100 条</small></header>
        {loading ? <div className="page-loading"><LoaderCircle className="spin" size={20} />加载积分流水</div> : transactions.length ? <div className="table-scroll"><table className="data-table credit-table"><thead><tr><th>时间</th><th>类型</th><th>变动</th><th>余额</th></tr></thead><tbody>{transactions.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString("zh-CN")}</td><td>{reasonLabels[item.reason] ?? item.reason}</td><td><strong className={item.amount > 0 ? "credit-positive" : "credit-negative"}>{item.amount > 0 ? "+" : ""}{item.amount}</strong></td><td>{item.balanceAfter.toLocaleString()}</td></tr>)}</tbody></table></div> : <div className="credit-empty"><Coins size={22} /><strong>暂无积分流水</strong></div>}
      </section>
    </section>
  );
}
