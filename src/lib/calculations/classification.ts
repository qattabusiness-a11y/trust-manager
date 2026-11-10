import { DEFAULT_THRESHOLDS } from "@/constants";
import { inPeriod, monthPeriod, weekPeriod, dayPeriod } from "@/lib/dates";
import type { Behavior, Budget, ShoppingItem, Transaction, TransactionCategory } from "@/types";
import { resolveLimits } from "./budget";
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

const UNUSUAL_MULTIPLIER = 2.5;
const REPEAT_WINDOW = 3; // unplanned non-essential purchases in the same week

function spentUpTo(txs: Transaction[], tx: Transaction, period: { start: Date; end: Date }): number {
  const t = new Date(tx.occurredAt).getTime();
  let total = 0;
  for (const other of txs) {
    if (!isSpending(other) || !inPeriod(other.occurredAt, period)) continue;
    const ot = new Date(other.occurredAt).getTime();
    if (other.id === tx.id || ot < t || (ot === t && other.id < tx.id)) total += other.amount;
  }
  if (!txs.some((o) => o.id === tx.id) && isSpending(tx)) total += tx.amount;
  return total;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function classifyTransaction(tx: Transaction, ctx: ClassificationContext): Classification {
  if (tx.behaviorOverride) {
    return { behavior: tx.behaviorOverride, reasons: ["Classification set by you."], overridden: true };
  }
  if (tx.type === "savings_transfer") return { behavior: "green", reasons: ["Savings contribution."], overridden: false };
  if (tx.type === "income") return { behavior: "green", reasons: ["Income received."], overridden: false };
  if (tx.type === "savings_withdrawal")
    return { behavior: "yellow", reasons: ["Money taken out of savings."], overridden: false };

  const reasons: string[] = [];
  const at = new Date(tx.occurredAt);
  const essential = tx.essential;
  let red = false;
  let yellow = false;

  // Budget position at the moment of this transaction.
  if (ctx.budget) {
    const limits = resolveLimits(ctx.budget, ctx.tz, at);
    const t = ctx.budget.thresholds ?? DEFAULT_THRESHOLDS;
    const weekSpent = spentUpTo(ctx.history, tx, weekPeriod(ctx.tz, at));
    const daySpent = spentUpTo(ctx.history, tx, dayPeriod(ctx.tz, at));
    const monthSpent = spentUpTo(ctx.history, tx, monthPeriod(ctx.tz, at));
    const weekPct = (weekSpent / Math.max(1, limits.weekly)) * 100;
    const monthPct = (monthSpent / Math.max(1, limits.monthly)) * 100;

    if (monthPct >= t.critical) {
      if (essential) {
        yellow = true;
        reasons.push("Monthly budget is already exceeded, but this is an essential expense.");
      } else {
        red = true;
        reasons.push("Non-essential purchase made after the monthly budget was exceeded.");
      }
    } else if (weekSpent > limits.weekly) {
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
    } else if (daySpent > limits.daily && !essential) {
      yellow = true;
      reasons.push("Today's spending is above the daily limit.");
    } else if (weekPct >= t.caution) {
      yellow = true;
      reasons.push(`Weekly spending is at ${Math.round(weekPct)}% of the limit.`);
    }
  }

  // Shopping list purchases: green unless they exceeded the plan.
  if (ctx.shoppingItem) {
    const planned = ctx.shoppingItem.estimatedUnitPrice * ctx.shoppingItem.quantity;
    if (tx.amount > planned) {
      yellow = true;
      reasons.push("Cost more than the planned amount on your shopping list.");
    } else {
      reasons.push("Bought from your approved shopping list.");
    }
  }

  // Repeated unplanned, non-essential purchases (pattern, not amount).
  if (!essential && !tx.planned) {
    const week = weekPeriod(ctx.tz, at);
    const repeats = ctx.history.filter(
      (o) =>
        isSpending(o) &&
        !o.essential &&
        !o.planned &&
        inPeriod(o.occurredAt, week) &&
        new Date(o.occurredAt).getTime() <= at.getTime(),
    ).length;
    if (repeats >= REPEAT_WINDOW) {
      red = true;
      reasons.push(`${repeats} unplanned non-essential purchases this week — a repeating pattern.`);
    }
  }

  // Unusually high for its category: a caution signal only.
  const sameCategory = ctx.history
    .filter((o) => isSpending(o) && o.categoryId === tx.categoryId && o.id !== tx.id)
    .map((o) => o.amount);
  if (sameCategory.length >= 4) {
    const med = median(sameCategory);
    if (med > 0 && tx.amount > med * UNUSUAL_MULTIPLIER) {
      yellow = true;
      reasons.push("Much higher than your usual amount in this category.");
    }
  }

  if (red) return { behavior: "red", reasons, overridden: false };
  if (yellow) return { behavior: "yellow", reasons, overridden: false };
  if (!reasons.length) {
    reasons.push(essential ? "Essential expense within budget." : "Within budget.");
  }
  return { behavior: "green", reasons, overridden: false };
}

export const BEHAVIOR_META: Record<Behavior, { label: string; description: string }> = {
  green: { label: "Healthy", description: "Essential or within plan and budget." },
  yellow: { label: "Caution", description: "Approaching limits or above plan." },
  red: { label: "Critical", description: "Beyond limits or a repeating unplanned pattern." },
};
