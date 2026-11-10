import { DEFAULT_THRESHOLDS } from "@/constants";
import {
  dayPeriod,
  daysInCurrentMonth,
  daysLeftInMonth,
  inPeriod,
  monthPeriod,
  weekPeriod,
  type Period,
} from "@/lib/dates";
import type { Budget, RecurringPayment, StatusThresholds, Transaction } from "@/types";
import { isSpending } from "./balance";
import { pct } from "@/lib/utils";

export type SpendingStatus = "healthy" | "caution" | "warning" | "critical";

export const STATUS_META: Record<SpendingStatus, { label: string; tone: "green" | "yellow" | "red" }> = {
  healthy: { label: "Healthy", tone: "green" },
  caution: { label: "Caution", tone: "yellow" },
  warning: { label: "Warning", tone: "yellow" },
  critical: { label: "Critical", tone: "red" },
};

export function spendingStatus(usedPct: number, t: StatusThresholds = DEFAULT_THRESHOLDS): SpendingStatus {
  if (usedPct >= t.critical) return "critical";
  if (usedPct >= t.warning) return "warning";
  if (usedPct >= t.caution) return "caution";
  return "healthy";
}

/** weeklyLimit = monthly * 12 / 52 ; dailyLimit = monthly / daysInCurrentMonth. */
export function baseLimits(monthlyBudget: number, daysInMonth: number) {
  return {
    weekly: Math.round((monthlyBudget * 12) / 52),
    daily: Math.round(monthlyBudget / daysInMonth),
  };
}

export interface BudgetLimits {
  monthly: number;
  weekly: number;
  daily: number;
  baseWeekly: number;
  baseDaily: number;
  weeklyIsCustom: boolean;
  dailyIsCustom: boolean;
}

export function resolveLimits(budget: Budget, tz: string, now: Date = new Date()): BudgetLimits {
  const base = baseLimits(budget.monthlyBudget, daysInCurrentMonth(tz, now));
  return {
    monthly: budget.monthlyBudget,
    weekly: budget.customWeeklyLimit ?? base.weekly,
    daily: budget.customDailyLimit ?? base.daily,
    baseWeekly: base.weekly,
    baseDaily: base.daily,
    weeklyIsCustom: budget.customWeeklyLimit != null,
    dailyIsCustom: budget.customDailyLimit != null,
  };
}

/**
 * Custom limits may be tighter or looser than the defaults, but they must
 * still fit inside the monthly budget.
 */
export function validateCustomLimits(
  monthlyBudget: number,
  daysInMonth: number,
  daily?: number | null,
  weekly?: number | null,
): string[] {
  const errors: string[] = [];
  if (daily != null) {
    if (daily <= 0) errors.push("Daily limit must be greater than zero.");
    if (daily * daysInMonth > monthlyBudget * 1.0001)
      errors.push(`A daily limit this high would allow more than the monthly budget over ${daysInMonth} days.`);
  }
  if (weekly != null) {
    if (weekly <= 0) errors.push("Weekly limit must be greater than zero.");
    if (weekly > monthlyBudget) errors.push("Weekly limit cannot exceed the monthly budget.");
    if (daily != null && daily > weekly) errors.push("Daily limit cannot exceed the weekly limit.");
  }
  return errors;
}

export function spentIn(txs: Transaction[], period: Period, filter?: (tx: Transaction) => boolean): number {
  let total = 0;
  for (const tx of txs) {
    if (!isSpending(tx) || !inPeriod(tx.occurredAt, period)) continue;
    if (filter && !filter(tx)) continue;
    total += tx.amount;
  }
  return total;
}

export interface PeriodUsage {
  limit: number;
  spent: number;
  remaining: number;
  usedPct: number;
  over: number;
  status: SpendingStatus;
}

function usage(limit: number, spent: number, t: StatusThresholds): PeriodUsage {
  const usedPct = pct(spent, limit);
  return {
    limit,
    spent,
    remaining: Math.max(0, limit - spent),
    usedPct,
    over: Math.max(0, spent - limit),
    status: spendingStatus(usedPct, t),
  };
}

export interface BudgetState {
  limits: BudgetLimits;
  day: PeriodUsage;
  week: PeriodUsage;
  month: PeriodUsage;
  essentialSpent: number;
  flexibleSpent: number;
  essentialUsage: PeriodUsage;
  flexibleUsage: PeriodUsage;
  /** Remaining month budget spread across the days left (including today). */
  recommendedDaily: number;
  daysLeft: number;
  fixedObligations: number;
}

export function monthlyEquivalent(p: Pick<RecurringPayment, "amount" | "frequency">): number {
  switch (p.frequency) {
    case "weekly":
      return Math.round((p.amount * 52) / 12);
    case "monthly":
      return p.amount;
    case "quarterly":
      return Math.round(p.amount / 3);
    case "yearly":
      return Math.round(p.amount / 12);
  }
}

export function computeBudgetState(
  budget: Budget,
  txs: Transaction[],
  tz: string,
  recurring: RecurringPayment[] = [],
  now: Date = new Date(),
): BudgetState {
  const t = budget.thresholds ?? DEFAULT_THRESHOLDS;
  const limits = resolveLimits(budget, tz, now);
  const m = monthPeriod(tz, now);
  const monthSpent = spentIn(txs, m);
  const essentialSpent = spentIn(txs, m, (tx) => tx.essential);
  const flexibleSpent = monthSpent - essentialSpent;
  const today = dayPeriod(tz, now);
  const spentBeforeToday = monthSpent - spentIn(txs, today);
  const daysLeft = daysLeftInMonth(tz, now);
  const recommendedDaily = Math.max(0, Math.floor((budget.monthlyBudget - spentBeforeToday) / daysLeft));

  return {
    limits,
    day: usage(limits.daily, spentIn(txs, today), t),
    week: usage(limits.weekly, spentIn(txs, weekPeriod(tz, now)), t),
    month: usage(limits.monthly, monthSpent, t),
    essentialSpent,
    flexibleSpent,
    essentialUsage: usage(budget.essentialAllocation, essentialSpent, t),
    flexibleUsage: usage(budget.flexibleAllocation, flexibleSpent, t),
    recommendedDaily,
    daysLeft,
    fixedObligations: recurring
      .filter((r) => !r.deletedAt && r.status === "active")
      .reduce((s, r) => s + monthlyEquivalent(r), 0),
  };
}
