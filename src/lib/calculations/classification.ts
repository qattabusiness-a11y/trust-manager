import { DEFAULT_THRESHOLDS } from "@/constants";
import { daysInMonthOf, localDate, weekKeyOf } from "@/lib/dates";
import type { Behavior, Budget, ShoppingItem, Transaction, TransactionCategory } from "@/types";
import { baseLimits } from "./budget";
import { isSpending } from "./balance";

/**
 * Centralized behavioral color-coding engine.
 *
 * Principles (from the product spec):
 *  - Context first: category, budget position, planned status, shopping list, history.
 *  - A non-essential purchase is NOT automatically irresponsible.
 *  - Amount alone never makes something an impulse purchase.
 *  - Essential spending is never marked red; at worst it is a caution.
 *  - The user can always override the result.
 *
 * Performance: `classifyAll` walks the history once in time order, keeping
 * running totals per day / week / month, so cost grows linearly with the
 * number of transactions.
 */

export interface Classification {
  behavior: Behavior;
  reasons: string[];
  overridden: boolean;
}

export interface ClassificationContext {
  category?: TransactionCategory;
  budget?: Budget | null;
  tz: string;
  /** All household transactions, used to compute budget position at the time of `tx`. */
  history: Transaction[];
  shoppingItem?: ShoppingItem | null;
}

export interface BatchContext {
  budget?: Budget | null;
  tz: string;
  shoppingItems?: Map<string, ShoppingItem>;
}

const UNUSUAL_MULTIPLIER = 2.5;
const REPEAT_WINDOW = 3; // unplanned non-essential purchases in the same week

/** Median of a sorted array with the element at `skip` removed. */
function medianWithout(sorted: number[], skip: number): number {
  const n = sorted.length - 1;
  if (n <= 0) return 0;
  const at = (j: number) => (j < skip ? sorted[j]! : sorted[j + 1]!);
  const mid = Math.floor(n / 2);
  return n % 2 ? at(mid) : (at(mid - 1) + at(mid)) / 2;
}

function lowerBound(sorted: number[], v: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (sorted[m]! < v) lo = m + 1;
    else hi = m;
  }
  return lo;
}

export function classifyAll(transactions: Transaction[], ctx: BatchContext): Map<string, Classification> {
  const out = new Map<string, Classification>();
  const { tz, budget } = ctx;
  const t = budget?.thresholds ?? DEFAULT_THRESHOLDS;

  const rows = transactions
    .filter((tx) => !tx.deletedAt)
    .map((tx) => ({ tx, time: new Date(tx.occurredAt).getTime() }))
    .sort((a, b) => a.time - b.time || (a.tx.id < b.tx.id ? -1 : a.tx.id > b.tx.id ? 1 : 0));

  // Category amounts (sorted) for the "unusually high" signal.
  const byCategory = new Map<string, number[]>();
  for (const { tx } of rows) {
    if (!isSpending(tx)) continue;
    const arr = byCategory.get(tx.categoryId);
    if (arr) arr.push(tx.amount);
    else byCategory.set(tx.categoryId, [tx.amount]);
  }
  for (const arr of byCategory.values()) arr.sort((a, b) => a - b);

  const daySpent = new Map<string, number>();
  const weekSpent = new Map<string, number>();
  const monthSpent = new Map<string, number>();
  const weekUnplanned = new Map<string, number>();
  const weekKeys = new Map<string, string>();
  const limitsByMonth = new Map<string, { weekly: number; daily: number }>();

  for (const { tx } of rows) {
    if (tx.type === "savings_transfer") {
      out.set(tx.id, tx.behaviorOverride ? overridden(tx.behaviorOverride) : { behavior: "green", reasons: ["Savings contribution."], overridden: false });
      continue;
    }
    if (tx.type === "income") {
      out.set(tx.id, tx.behaviorOverride ? overridden(tx.behaviorOverride) : { behavior: "green", reasons: ["Income received."], overridden: false });
      continue;
    }
    if (tx.type === "savings_withdrawal") {
      out.set(tx.id, tx.behaviorOverride ? overridden(tx.behaviorOverride) : { behavior: "yellow", reasons: ["Money taken out of savings."], overridden: false });
      continue;
    }

    const day = localDate(tx.occurredAt, tz);
    const month = day.slice(0, 7);
    let week = weekKeys.get(day);
    if (!week) {
      week = weekKeyOf(day);
      weekKeys.set(day, week);
    }
    // Running totals include this transaction.
    const dSpent = (daySpent.get(day) ?? 0) + tx.amount;
    const wSpent = (weekSpent.get(week) ?? 0) + tx.amount;
    const mSpent = (monthSpent.get(month) ?? 0) + tx.amount;
    daySpent.set(day, dSpent);
    weekSpent.set(week, wSpent);
    monthSpent.set(month, mSpent);
    const unplanned = !tx.essential && !tx.planned;
    const repeats = (weekUnplanned.get(week) ?? 0) + (unplanned ? 1 : 0);
    if (unplanned) weekUnplanned.set(week, repeats);

    if (tx.behaviorOverride) {
      out.set(tx.id, overridden(tx.behaviorOverride));
      continue;
    }

    const reasons: string[] = [];
    const essential = tx.essential;
    let red = false;
    let yellow = false;

    if (budget) {
      let base = limitsByMonth.get(month);
      if (!base) {
        base = baseLimits(budget.monthlyBudget, daysInMonthOf(month));
        limitsByMonth.set(month, base);
      }
      const weekly = budget.customWeeklyLimit ?? base.weekly;
      const daily = budget.customDailyLimit ?? base.daily;
      const weekPct = (wSpent / Math.max(1, weekly)) * 100;
      const monthPct = (mSpent / Math.max(1, budget.monthlyBudget)) * 100;

      if (monthPct >= t.critical) {
        if (essential) {
          yellow = true;
          reasons.push("Monthly budget is already exceeded, but this is an essential expense.");
        } else {
          red = true;
          reasons.push("Non-essential purchase made after the monthly budget was exceeded.");
        }
      } else if (wSpent > weekly) {
        if (essential) {
          yellow = true;
          reasons.push("Weekly limit exceeded — essential expense.");
        } else if (!tx.planned) {
          red = true;
          reasons.push("Unplanned non-essential purchase beyond the weekly limit.");
        } else {
          yellow = true;
          reasons.push("Planned purchase, but it pushed spending past the weekly limit.");
        }
      } else if (dSpent > daily && !essential) {
        yellow = true;
        reasons.push("Today's spending is above the daily limit.");
      } else if (weekPct >= t.caution) {
        yellow = true;
        reasons.push(`Weekly spending is at ${Math.round(weekPct)}% of the limit.`);
      }
    }

    // Shopping list purchases: green unless they exceeded the plan.
    const item = tx.shoppingItemId ? ctx.shoppingItems?.get(tx.shoppingItemId) : null;
    if (item) {
      const planned = item.estimatedUnitPrice * item.quantity;
      if (tx.amount > planned) {
        yellow = true;
        reasons.push("Cost more than the planned amount on your shopping list.");
      } else {
        reasons.push("Bought from your approved shopping list.");
      }
    }

    // Repeated unplanned, non-essential purchases (pattern, not amount).
    if (unplanned && repeats >= REPEAT_WINDOW) {
      red = true;
      reasons.push(`${repeats} unplanned non-essential purchases this week — a repeating pattern.`);
    }

    // Unusually high for its category: a caution signal only.
    const amounts = byCategory.get(tx.categoryId);
    if (amounts && amounts.length - 1 >= 4) {
      const med = medianWithout(amounts, lowerBound(amounts, tx.amount));
      if (med > 0 && tx.amount > med * UNUSUAL_MULTIPLIER) {
        yellow = true;
        reasons.push("Much higher than your usual amount in this category.");
      }
    }

    if (red) out.set(tx.id, { behavior: "red", reasons, overridden: false });
    else if (yellow) out.set(tx.id, { behavior: "yellow", reasons, overridden: false });
    else {
      if (!reasons.length) reasons.push(essential ? "Essential expense within budget." : "Within budget.");
      out.set(tx.id, { behavior: "green", reasons, overridden: false });
    }
  }
  return out;
}

function overridden(behavior: Behavior): Classification {
  return { behavior, reasons: ["Classification set by you."], overridden: true };
}

/** Classify a single transaction in the context of a history (convenience wrapper). */
export function classifyTransaction(tx: Transaction, ctx: ClassificationContext): Classification {
  const history = ctx.history.some((h) => h.id === tx.id) ? ctx.history : [...ctx.history, tx];
  const items = ctx.shoppingItem ? new Map([[ctx.shoppingItem.id, ctx.shoppingItem]]) : undefined;
  return classifyAll(history, { budget: ctx.budget, tz: ctx.tz, shoppingItems: items }).get(tx.id)!;
}

export const BEHAVIOR_META: Record<Behavior, { label: string; description: string }> = {
  green: { label: "Healthy", description: "Essential or within plan and budget." },
  yellow: { label: "Caution", description: "Approaching limits or above plan." },
  red: { label: "Critical", description: "Beyond limits or a repeating unplanned pattern." },
};
