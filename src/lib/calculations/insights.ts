import { inPeriod, localDate, monthPeriod, todayLocal, daysUntil, type Period } from "@/lib/dates";
import { roundUpTo } from "@/lib/money";
import type {
  IncomeSource,
  PaymentMethod,
  RecurringPayment,
  SavingsContribution,
  SubscriptionUsage,
  Transaction,
} from "@/types";
import { isSpending } from "./balance";
import { monthlyEquivalent } from "./budget";

/* ---------------------------------------------------------------- Income */

export function monthlyIncomeEquivalent(src: Pick<IncomeSource, "amount" | "frequency">): number {
  switch (src.frequency) {
    case "weekly":
      return Math.round((src.amount * 52) / 12);
    case "biweekly":
      return Math.round((src.amount * 26) / 12);
    case "monthly":
    case "irregular":
      return src.amount;
    case "quarterly":
      return Math.round(src.amount / 3);
    case "yearly":
      return Math.round(src.amount / 12);
    case "once":
      return 0;
  }
}

/**
 * Income totals. Savings allocations are a split of income, not extra income,
 * so `availableAfterSavings = total − allocated`.
 */
export function incomeSummary(sources: IncomeSource[]) {
  const live = sources.filter((s) => !s.deletedAt);
  const totalMonthly = live.reduce((s, src) => s + monthlyIncomeEquivalent(src), 0);
  const allocated = live.reduce(
    (s, src) =>
      s + (src.frequency === "once" ? 0 : Math.round(monthlyIncomeEquivalent({ ...src, amount: src.savingsAllocation }))),
    0,
  );
  return { totalMonthly, allocatedToSavings: allocated, availableAfterSavings: totalMonthly - allocated, count: live.length };
}

/* ---------------------------------------------------------- Micro-savings */

export interface SweepSuggestion {
  transactionId: string;
  title: string;
  amount: number;
  rounded: number;
  spare: number;
  occurredAt: string;
}

export function sweepSuggestions(
  txs: Transaction[],
  contributions: SavingsContribution[],
  increment: number,
  since: Date,
): SweepSuggestion[] {
  const swept = new Set(contributions.filter((c) => !c.deletedAt && c.source === "micro_sweep").map((c) => c.transactionId));
  return txs
    .filter((tx) => isSpending(tx) && !swept.has(tx.id) && new Date(tx.occurredAt) >= since)
    .map((tx) => {
      const rounded = roundUpTo(tx.amount, increment);
      return { transactionId: tx.id, title: tx.title, amount: tx.amount, rounded, spare: rounded - tx.amount, occurredAt: tx.occurredAt };
    })
    .filter((s) => s.spare > 0)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function microSavingsTotals(contributions: SavingsContribution[], tz: string, now = new Date()) {
  const micro = contributions.filter((c) => !c.deletedAt && c.source === "micro_sweep");
  const m = monthPeriod(tz, now);
  return {
    accumulated: micro.reduce((s, c) => s + c.amount, 0),
    thisMonth: micro.filter((c) => inPeriod(c.contributedAt, m)).reduce((s, c) => s + c.amount, 0),
    count: micro.length,
  };
}

/* ------------------------------------------------------------- Top payees */

export interface PayeeFilter {
  period?: Period | null;
  categoryId?: string | null;
  paymentMethod?: PaymentMethod | null;
}

export interface PayeeRow {
  merchant: string;
  total: number;
  count: number;
  average: number;
  share: number;
  lastPaidAt: string;
  monthly: Record<string, number>;
}

export function topPayees(txs: Transaction[], tz: string, filter: PayeeFilter = {}): PayeeRow[] {
  const rows = new Map<string, PayeeRow>();
  let grand = 0;
  for (const tx of txs) {
    if (!isSpending(tx)) continue;
    if (filter.period && !inPeriod(tx.occurredAt, filter.period)) continue;
    if (filter.categoryId && tx.categoryId !== filter.categoryId) continue;
    if (filter.paymentMethod && tx.paymentMethod !== filter.paymentMethod) continue;
    const key = tx.merchant.trim() || "Unknown";
    const norm = key.toLowerCase();
    const row = rows.get(norm) ?? { merchant: key, total: 0, count: 0, average: 0, share: 0, lastPaidAt: tx.occurredAt, monthly: {} };
    row.total += tx.amount;
    row.count += 1;
    if (tx.occurredAt > row.lastPaidAt) row.lastPaidAt = tx.occurredAt;
    const mk = localDate(tx.occurredAt, tz).slice(0, 7);
    row.monthly[mk] = (row.monthly[mk] ?? 0) + tx.amount;
    rows.set(norm, row);
    grand += tx.amount;
  }
  return [...rows.values()]
    .map((r) => ({ ...r, average: Math.round(r.total / r.count), share: grand ? (r.total / grand) * 100 : 0 }))
    .sort((a, b) => b.total - a.total || b.count - a.count);
}

/* ------------------------------------------------------ Bills & reminders */

export interface DueReminder {
  paymentId: string;
  name: string;
  amount: number;
  dueDate: string;
  daysUntil: number;
  dedupeKey: string;
  severity: "info" | "caution" | "warning" | "critical";
  message: string;
}

/** Reminders that should fire today (based on each payment's reminder days). */
export function dueReminders(payments: RecurringPayment[], tz: string, now = new Date(), fmt: (n: number) => string): DueReminder[] {
  const out: DueReminder[] = [];
  for (const p of payments) {
    if (p.deletedAt || p.status !== "active") continue;
    const d = daysUntil(p.nextDueDate, tz, now);
    const days = new Set([...p.reminderDays, 0]);
    if (d < 0 || days.has(d)) {
      const severity = d < 0 ? "critical" : d === 0 ? "warning" : d <= 1 ? "warning" : d <= 3 ? "caution" : "info";
      const when = d < 0 ? `was due ${-d} day${d === -1 ? "" : "s"} ago` : d === 0 ? "is due today" : `is due in ${d} day${d === 1 ? "" : "s"}`;
      out.push({
        paymentId: p.id,
        name: p.name,
        amount: p.amount,
        dueDate: p.nextDueDate,
        daysUntil: d,
        dedupeKey: `bill:${p.id}:${p.nextDueDate}:${d < 0 ? "overdue" : d}`,
        severity,
        message: `${p.name} (${fmt(p.amount)}) ${when}.`,
      });
    }
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}

export interface SubscriptionAudit {
  paymentId: string;
  name: string;
  monthlyCost: number;
  annualCost: number;
  lastUsedOn: string | null;
  usesLast30: number;
  daysSinceUse: number | null;
  verdict: "keep" | "review" | "unused";
  message: string;
}

export function auditSubscriptions(
  payments: RecurringPayment[],
  usage: SubscriptionUsage[],
  tz: string,
  fmt: (n: number) => string,
  now = new Date(),
): SubscriptionAudit[] {
  const today = todayLocal(tz, now);
  return payments
    .filter((p) => !p.deletedAt && p.kind === "subscription" && p.status !== "cancelled")
    .map((p) => {
      const uses = usage.filter((u) => !u.deletedAt && u.recurringPaymentId === p.id).map((u) => u.usedOn).sort();
      const last = uses.at(-1) ?? null;
      const daysSinceUse = last ? -daysUntil(last, tz, now) : null;
      const usesLast30 = uses.filter((d) => -daysUntil(d, tz, now) <= 30 && d <= today).length;
      const monthlyCost = monthlyEquivalent(p);
      let verdict: SubscriptionAudit["verdict"] = "keep";
      let message = `Used ${usesLast30} time${usesLast30 === 1 ? "" : "s"} in the last 30 days (based on usage you recorded).`;
      if (usesLast30 === 0) {
        verdict = "unused";
        message = "You have recorded no usage for this subscription during the last 30 days. Review whether you still need it.";
      } else if (usesLast30 <= 2) {
        verdict = "review";
        message = `Only ${usesLast30} recorded use${usesLast30 === 1 ? "" : "s"} in 30 days — about ${fmt(Math.round(monthlyCost / usesLast30))} per use.`;
      }
      return { paymentId: p.id, name: p.name, monthlyCost, annualCost: monthlyCost * 12, lastUsedOn: last, usesLast30, daysSinceUse, verdict, message };
    });
}
