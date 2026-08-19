import { ApiError } from "./http";

export const IMAGE_SEARCH_COST = 10;

export type CreditCharge = {
  transactionId: string;
  balance: number;
  cost: number;
};

export async function getCreditBalance(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare("SELECT balance FROM credit_wallets WHERE user_id = ?")
    .bind(userId)
    .first<{ balance: number }>();
  if (!row) throw new ApiError(500, "积分账户不存在", "credit_wallet_missing");
  return row.balance;
}

export async function listCreditTransactions(env: Env, userId: string): Promise<Array<{
  id: string; amount: number; balanceAfter: number; reason: string; createdAt: string;
}>> {
  const result = await env.DB.prepare(
    `SELECT id, amount, balance_after AS balanceAfter, reason, created_at AS createdAt
       FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
  ).bind(userId).all<{ id: string; amount: number; balanceAfter: number; reason: string; createdAt: string }>();
  return result.results;
}

export async function chargeImageSearch(
  env: Env,
  userId: string,
  detail: Record<string, unknown>,
): Promise<CreditCharge> {
  const transactionId = crypto.randomUUID();
  const ledger = env.DB.prepare(
    `INSERT INTO credit_transactions (id, user_id, amount, balance_after, reason, reference_id, detail_json)
     SELECT ?, ?, ?, balance - ?, 'image_search.charge', ?, ? FROM credit_wallets
      WHERE user_id = ? AND balance >= ?`,
  ).bind(
    transactionId,
    userId,
    -IMAGE_SEARCH_COST,
    IMAGE_SEARCH_COST,
    transactionId,
    JSON.stringify(detail),
    userId,
    IMAGE_SEARCH_COST,
  );
  const update = env.DB.prepare(
    `UPDATE credit_wallets
        SET balance = balance - ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE user_id = ? AND balance >= ?`,
  ).bind(IMAGE_SEARCH_COST, userId, IMAGE_SEARCH_COST);
  const [, updateResult] = await env.DB.batch([ledger, update]);
  if (updateResult.meta.changes !== 1) {
    const balance = await getCreditBalance(env, userId);
    throw new ApiError(402, `积分不足，当前剩余 ${balance} 分`, "insufficient_credits", {
      balance,
      required: IMAGE_SEARCH_COST,
    });
  }
  return { transactionId, balance: await getCreditBalance(env, userId), cost: IMAGE_SEARCH_COST };
}

export async function refundImageSearch(env: Env, userId: string, charge: CreditCharge): Promise<number> {
  const refundId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE credit_wallets SET balance = balance + ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE user_id = ?`,
    ).bind(charge.cost, userId),
    env.DB.prepare(
      `INSERT INTO credit_transactions (id, user_id, amount, balance_after, reason, reference_id, detail_json)
       SELECT ?, ?, ?, balance, 'image_search.refund', ?, ? FROM credit_wallets WHERE user_id = ?`,
    ).bind(
      refundId,
      userId,
      charge.cost,
      charge.transactionId,
      JSON.stringify({ chargeTransactionId: charge.transactionId }),
      userId,
    ),
  ]);
  return getCreditBalance(env, userId);
}
