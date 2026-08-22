import { ApiError } from "./http";

export const IMAGE_SEARCH_COST = 20;
export const AI_REQUEST_COST = 5;
export const PRODUCT_DETAIL_COST = 5;

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

async function chargeCredits(
  env: Env,
  userId: string,
  cost: number,
  reason: string,
  detail: Record<string, unknown>,
): Promise<CreditCharge> {
  const transactionId = crypto.randomUUID();
  const ledger = env.DB.prepare(
    `INSERT INTO credit_transactions (id, user_id, amount, balance_after, reason, reference_id, detail_json)
     SELECT ?, ?, ?, balance - ?, ?, ?, ? FROM credit_wallets
      WHERE user_id = ? AND balance >= ?`,
  ).bind(
    transactionId,
    userId,
    -cost,
    cost,
    reason,
    transactionId,
    JSON.stringify(detail),
    userId,
    cost,
  );
  const update = env.DB.prepare(
    `UPDATE credit_wallets
        SET balance = balance - ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE user_id = ? AND balance >= ?`,
  ).bind(cost, userId, cost);
  const [, updateResult] = await env.DB.batch([ledger, update]);
  if (updateResult.meta.changes !== 1) {
    const balance = await getCreditBalance(env, userId);
    throw new ApiError(402, `积分不足，当前剩余 ${balance} 分`, "insufficient_credits", {
      balance,
      required: cost,
    });
  }
  return { transactionId, balance: await getCreditBalance(env, userId), cost };
}

async function refundCredits(env: Env, userId: string, charge: CreditCharge, reason: string): Promise<number> {
  const refundId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE credit_wallets SET balance = balance + ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE user_id = ?`,
    ).bind(charge.cost, userId),
    env.DB.prepare(
      `INSERT INTO credit_transactions (id, user_id, amount, balance_after, reason, reference_id, detail_json)
       SELECT ?, ?, ?, balance, ?, ?, ? FROM credit_wallets WHERE user_id = ?`,
    ).bind(
      refundId,
      userId,
      charge.cost,
      reason,
      charge.transactionId,
      JSON.stringify({ chargeTransactionId: charge.transactionId }),
      userId,
    ),
  ]);
  return getCreditBalance(env, userId);
}

export function chargeImageSearch(env: Env, userId: string, detail: Record<string, unknown>): Promise<CreditCharge> {
  return chargeCredits(env, userId, IMAGE_SEARCH_COST, "image_search.charge", detail);
}

export function refundImageSearch(env: Env, userId: string, charge: CreditCharge): Promise<number> {
  return refundCredits(env, userId, charge, "image_search.refund");
}

export function chargeAiRequest(env: Env, userId: string, detail: Record<string, unknown>): Promise<CreditCharge> {
  return chargeCredits(env, userId, AI_REQUEST_COST, "ai.charge", detail);
}

export function refundAiRequest(env: Env, userId: string, charge: CreditCharge): Promise<number> {
  return refundCredits(env, userId, charge, "ai.refund");
}

export function chargeProductDetail(env: Env, userId: string, detail: Record<string, unknown>): Promise<CreditCharge> {
  return chargeCredits(env, userId, PRODUCT_DETAIL_COST, "product_detail.charge", detail);
}

export function refundProductDetail(env: Env, userId: string, charge: CreditCharge): Promise<number> {
  return refundCredits(env, userId, charge, "product_detail.refund");
}
