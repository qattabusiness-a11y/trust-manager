import type { Household, SavingsAccount, SavingsContribution, Transaction } from "@/types";

export const isLive = <T extends { deletedAt?: string | null }>(r: T) => !r.deletedAt;

/**
 * Effect of a transaction on the household's available (spendable) money.
 * Savings transfers move money out of the available balance into savings;
 * they are NOT spending and NOT income, so they never double count.
 */
export function availableDelta(tx: Transaction): number {
  switch (tx.type) {
    case "income":
      return tx.amount;
    case "expense":
      return -tx.amount;
    case "savings_transfer":
      return -tx.amount;
    case "savings_withdrawal":
      return tx.amount;
  }
}

export function availableBalance(household: Household, txs: Transaction[], at: Date = new Date()): number {
  const from = new Date(household.openingBalanceDate).getTime();
  const to = at.getTime();
  let balance = household.openingBalance;
  for (const tx of txs) {
    if (!isLive(tx)) continue;
    const t = new Date(tx.occurredAt).getTime();
    if (t < from || t > to) continue;
    balance += availableDelta(tx);
  }
  return balance;
}

export function savingsBalance(
  accounts: SavingsAccount[],
  contributions: SavingsContribution[],
  at: Date = new Date(),
): number {
  const live = accounts.filter(isLive);
  const ids = new Set(live.map((a) => a.id));
  let total = live.reduce((s, a) => s + a.openingBalance, 0);
  for (const c of contributions) {
    if (!isLive(c) || !ids.has(c.accountId)) continue;
    if (new Date(c.contributedAt).getTime() > at.getTime()) continue;
    total += c.amount;
  }
  return total;
}

export function goalBalance(goalId: string, accountOpening: number, contributions: SavingsContribution[]): number {
  return (
    accountOpening +
    contributions.filter((c) => isLive(c) && c.goalId === goalId).reduce((s, c) => s + c.amount, 0)
  );
}

/** Spending only — expenses, excluding savings movements and income. */
export function isSpending(tx: Transaction): boolean {
  return isLive(tx) && tx.type === "expense";
}
