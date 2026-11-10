import { addDays, format, parseISO } from "date-fns";
import { advanceDate } from "@/lib/dates";
import type { IncomeSource, RecurringPayment, ShoppingItem } from "@/types";

export interface ScheduledFlow {
  date: string; // local yyyy-MM-dd
  amount: number; // positive = money in, negative = money out
  label: string;
  kind: "income" | "bill" | "planned_purchase";
}

function rollForward(start: string, freq: "weekly" | "monthly" | "quarterly" | "yearly", from: string) {
  let d = start;
  let guard = 0;
  while (d < from && guard++ < 600) d = advanceDate(d, freq);
  return d;
}

function incomeFreq(f: IncomeSource["frequency"]): "weekly" | "monthly" | "quarterly" | "yearly" | null {
  if (f === "weekly" || f === "monthly" || f === "quarterly" || f === "yearly") return f;
  if (f === "biweekly") return "weekly"; // handled with step of 2 below
  return null;
}

/** Expected future cash flows between `from` and `to` (inclusive, local dates). */
export function scheduledFlows(
  from: string,
  to: string,
  income: IncomeSource[],
  bills: RecurringPayment[],
  planned: ShoppingItem[] = [],
): ScheduledFlow[] {
  const flows: ScheduledFlow[] = [];

  for (const src of income) {
    if (src.deletedAt) continue;
    // Irregular income is excluded from projections on purpose: it is not guaranteed.
    if (src.frequency === "irregular") continue;
    // The savings allocation leaves the available balance as soon as income arrives.
    const net = src.amount - (src.savingsAllocation ?? 0);
    if (src.frequency === "once" || !src.recurring) {
      if (src.expectedDate >= from && src.expectedDate <= to)
        flows.push({ date: src.expectedDate, amount: net, label: src.name, kind: "income" });
      continue;
    }
    const f = incomeFreq(src.frequency);
    if (!f) continue;
    let d = rollForward(src.expectedDate, f, from);
    let guard = 0;
    while (d <= to && guard++ < 200) {
      flows.push({ date: d, amount: net, label: src.name, kind: "income" });
      d = src.frequency === "biweekly" ? format(addDays(parseISO(d), 14), "yyyy-MM-dd") : advanceDate(d, f);
    }
  }

  for (const bill of bills) {
    if (bill.deletedAt || bill.status !== "active") continue;
    let d = rollForward(bill.nextDueDate, bill.frequency, from);
    let guard = 0;
    while (d <= to && guard++ < 200) {
      if (bill.endDate && d > bill.endDate) break;
      flows.push({ date: d, amount: -bill.amount, label: bill.name, kind: "bill" });
      d = advanceDate(d, bill.frequency);
    }
  }

  for (const item of planned) {
    if (item.deletedAt || item.status !== "needed" || !item.expectedDate) continue;
    if (item.expectedDate < from || item.expectedDate > to) continue;
    flows.push({
      date: item.expectedDate,
      amount: -(item.estimatedUnitPrice * item.quantity),
      label: item.productName,
      kind: "planned_purchase",
    });
  }

  return flows.sort((a, b) => a.date.localeCompare(b.date));
}

/** Sum of bills due between from and to (positive number). */
export function obligationsBetween(from: string, to: string, bills: RecurringPayment[]): number {
  return -scheduledFlows(from, to, [], bills).reduce((s, f) => s + f.amount, 0);
}
