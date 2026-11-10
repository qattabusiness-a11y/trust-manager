import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { localDate, todayLocal } from "@/lib/dates";
import type { IncomeSource, RecurringPayment, ShoppingItem, Transaction } from "@/types";
import { isSpending } from "./balance";
import { scheduledFlows, type ScheduledFlow } from "./schedule";

export const MIN_OBSERVED_DAYS = 7;
export const MIN_OBSERVED_TRANSACTIONS = 5;
export const MAX_WINDOW_DAYS = 30;
export const HORIZON_DAYS = 120;

export interface ZeroBalanceInput {
  balance: number;
  transactions: Transaction[];
  tz: string;
  now?: Date;
  income?: IncomeSource[];
  bills?: RecurringPayment[];
  planned?: ShoppingItem[];
}

export type ZeroBalanceResult =
  | { status: "insufficient_data"; reason: string; observedDays: number; observedTransactions: number }
  | {
      status: "ok";
      dailyBurnRate: number;
      observedDays: number;
      /** Simple formula: balance / burn rate, ignoring scheduled flows. */
      basicDaysRemaining: number;
      basicZeroDate: string | null;
      /** Day-by-day projection including income, bills and planned purchases. */
      projectedZeroDate: string | null;
      projectedDaysRemaining: number | null;
      lowestProjectedBalance: number;
      lowestOn: string;
      flowsConsidered: ScheduledFlow[];
      /** Projected end-of-day balance for each day of the horizon. */
      series: { date: string; balance: number }[];
      excludedIrregularIncome: boolean;
    };

/**
 * Estimate when recorded available funds may reach zero. This is an estimate,
 * not a guarantee. Spending from bills is modeled through the bill schedule,
 * so recurring-bill transactions are excluded from the burn rate to avoid
 * counting them twice.
 */
export function predictZeroBalance(input: ZeroBalanceInput): ZeroBalanceResult {
  const now = input.now ?? new Date();
  const tz = input.tz;
  const today = todayLocal(tz, now);
  const windowStart = format(addDays(parseISO(today), -MAX_WINDOW_DAYS), "yyyy-MM-dd");

  const recent = input.transactions.filter(
    (tx) =>
      isSpending(tx) &&
      tx.source !== "recurring" &&
      localDate(tx.occurredAt, tz) > windowStart &&
      new Date(tx.occurredAt).getTime() <= now.getTime(),
  );

  if (!recent.length) {
    return { status: "insufficient_data", reason: "No recent spending recorded.", observedDays: 0, observedTransactions: 0 };
  }
  const earliest = recent.map((t) => localDate(t.occurredAt, tz)).sort()[0]!;
  const observedDays = Math.min(MAX_WINDOW_DAYS, differenceInCalendarDays(parseISO(today), parseISO(earliest)) + 1);

  if (observedDays < MIN_OBSERVED_DAYS || recent.length < MIN_OBSERVED_TRANSACTIONS) {
    return {
      status: "insufficient_data",
      reason: `Needs at least ${MIN_OBSERVED_DAYS} days and ${MIN_OBSERVED_TRANSACTIONS} transactions of history.`,
      observedDays,
      observedTransactions: recent.length,
    };
  }

  const total = recent.reduce((s, t) => s + t.amount, 0);
  const dailyBurnRate = total / observedDays;
  const basicDaysRemaining = dailyBurnRate > 0 ? Math.max(0, input.balance / dailyBurnRate) : Infinity;
  const basicZeroDate =
    Number.isFinite(basicDaysRemaining) && basicDaysRemaining <= HORIZON_DAYS
      ? format(addDays(parseISO(today), Math.floor(basicDaysRemaining)), "yyyy-MM-dd")
      : null;

  const horizonEnd = format(addDays(parseISO(today), HORIZON_DAYS), "yyyy-MM-dd");
  const tomorrow = format(addDays(parseISO(today), 1), "yyyy-MM-dd");
  const flows = scheduledFlows(tomorrow, horizonEnd, input.income ?? [], input.bills ?? [], input.planned ?? []);
  const byDate = new Map<string, number>();
  for (const f of flows) byDate.set(f.date, (byDate.get(f.date) ?? 0) + f.amount);

  let balance = input.balance;
  let projectedZeroDate: string | null = balance <= 0 ? today : null;
  let lowest = balance;
  let lowestOn = today;
  const series: { date: string; balance: number }[] = [{ date: today, balance: Math.round(balance) }];
  for (let i = 1; i <= 60 || (i <= HORIZON_DAYS && !projectedZeroDate); i++) {
    if (i > HORIZON_DAYS) break;
    const d = format(addDays(parseISO(today), i), "yyyy-MM-dd");
    balance -= dailyBurnRate;
    balance += byDate.get(d) ?? 0;
    if (i <= 60) series.push({ date: d, balance: Math.round(balance) });
    if (balance < lowest) {
      lowest = balance;
      lowestOn = d;
    }
    if (balance <= 0 && !projectedZeroDate) projectedZeroDate = d;
  }

  return {
    status: "ok",
    dailyBurnRate: Math.round(dailyBurnRate),
    observedDays,
    basicDaysRemaining: Number.isFinite(basicDaysRemaining) ? Math.floor(basicDaysRemaining) : Infinity,
    basicZeroDate,
    projectedZeroDate,
    projectedDaysRemaining: projectedZeroDate
      ? differenceInCalendarDays(parseISO(projectedZeroDate), parseISO(today))
      : null,
    lowestProjectedBalance: Math.round(lowest),
    lowestOn,
    flowsConsidered: flows,
    series,
    excludedIrregularIncome: (input.income ?? []).some((i) => !i.deletedAt && i.frequency === "irregular"),
  };
}
