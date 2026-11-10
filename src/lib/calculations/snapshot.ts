import { addDays, format, parseISO, subMonths } from "date-fns";
import { DEFAULT_THRESHOLDS, EMERGENCY_RESERVE_DAYS } from "@/constants";
import { dayPeriod, fmtLocalDate, inPeriod, localDate, monthPeriod, weekKeyOf, todayLocal, weekPeriod } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type {
  Behavior,
  Budget,
  Household,
  IncomeSource,
  MarketPricePoint,
  MarketProduct,
  RecurringPayment,
  SavingsAccount,
  SavingsContribution,
  SavingsGoal,
  ShoppingItem,
  SubscriptionUsage,
  Transaction,
  TransactionCategory,
  UserPersona,
} from "@/types";
import { availableBalance, isSpending, savingsBalance } from "./balance";
import { computeBudgetState, type BudgetState, type SpendingStatus } from "./budget";
import { evaluateBulkBuy, PER_PERSON_MONTHLY, type BulkBuyResult } from "./bulkbuy";
import { classifyAll, type Classification } from "./classification";
import { auditSubscriptions, dueReminders, incomeSummary, type DueReminder, type SubscriptionAudit } from "./insights";
import { compareProduct, latestPrices } from "./market";
import { predictZeroBalance, type ZeroBalanceResult } from "./prediction";
import { obligationsBetween } from "./schedule";

export interface FinanceData {
  household: Household | null;
  persona: UserPersona | null;
  budget: Budget | null;
  transactions: Transaction[];
  categories: TransactionCategory[];
  income: IncomeSource[];
  recurring: RecurringPayment[];
  subscriptionUsage: SubscriptionUsage[];
  savingsAccounts: SavingsAccount[];
  savingsGoals: SavingsGoal[];
  contributions: SavingsContribution[];
  shoppingItems: ShoppingItem[];
  marketProducts: MarketProduct[];
  marketHistory: MarketPricePoint[];
}

export interface Alert {
  id: string;
  severity: "info" | "success" | "caution" | "warning" | "critical";
  title: string;
  explanation: string;
  action?: { label: string; href: string };
}

export interface HardStop {
  period: "daily" | "weekly";
  over: number;
  limit: number;
  spent: number;
  remainingMonth: number;
  breakdown: { category: string; amount: number }[];
  correctiveAction: string;
}

export interface FinanceSnapshot {
  tz: string;
  currency: string;
  fmt: (n: number, opts?: { compact?: boolean; sign?: boolean }) => string;
  balance: number;
  previousBalance: number;
  lastUpdated: string | null;
  savings: number;
  savingsThisMonth: number;
  budget: BudgetState | null;
  monthStatus: SpendingStatus;
  income: ReturnType<typeof incomeSummary>;
  prediction: ZeroBalanceResult;
  classifications: Map<string, Classification>;
  behaviorCounts: Record<Behavior, number>;
  categoryBreakdown: { categoryId: string; name: string; amount: number; essential: boolean }[];
  dailyTrend: { date: string; label: string; spent: number; limit: number }[];
  incomeVsExpenses: { month: string; label: string; income: number; expenses: number }[];
  savingsGrowth: { date: string; label: string; savings: number }[];
  weeklyUtilization: { week: string; label: string; spent: number; limit: number; pct: number }[];
  reminders: DueReminder[];
  subscriptions: SubscriptionAudit[];
  bulkBuys: BulkBuyResult[];
  upcomingObligations30: number;
  reserve: number;
  alerts: Alert[];
  hardStop: HardStop | null;
  health: { status: SpendingStatus; score: number; label: string; spendingBehavior: string; warnings: number };
}

export function buildSnapshot(d: FinanceData, now: Date = new Date()): FinanceSnapshot {
  const tz = d.household?.timezone ?? "Africa/Kigali";
  const currency = d.household?.currency ?? "RWF";
  const fmt = (n: number, opts?: { compact?: boolean; sign?: boolean }) => formatMoney(n, currency, opts);
  const txs = d.transactions.filter((t) => !t.deletedAt);
  const catById = new Map(d.categories.map((c) => [c.id, c]));
  const today = todayLocal(tz, now);

  const balance = d.household ? availableBalance(d.household, txs, now) : 0;
  const weekAgo = addDays(now, -7);
  const previousBalance = d.household ? availableBalance(d.household, txs, weekAgo) : 0;
  const lastUpdated = txs.map((t) => t.updatedAt).sort().at(-1) ?? null;
  const savings = savingsBalance(d.savingsAccounts, d.contributions, now);
  const m = monthPeriod(tz, now);
  const savingsThisMonth = d.contributions.filter((c) => !c.deletedAt && inPeriod(c.contributedAt, m)).reduce((s, c) => s + c.amount, 0);

  const budget = d.budget ? computeBudgetState(d.budget, txs, tz, d.recurring, now) : null;
  const thresholds = d.budget?.thresholds ?? DEFAULT_THRESHOLDS;

  /* ------------------------------------------------ Classifications */
  const itemById = new Map(d.shoppingItems.map((i) => [i.id, i]));
  const classifications = classifyAll(txs, { budget: d.budget, tz, shoppingItems: itemById });
  const behaviorCounts: Record<Behavior, number> = { green: 0, yellow: 0, red: 0 };
  for (const tx of txs) {
    if (isSpending(tx) && inPeriod(tx.occurredAt, m)) behaviorCounts[classifications.get(tx.id)!.behavior]++;
  }

  /* --------------------------------------------------- Breakdown */
  const byCat = new Map<string, number>();
  for (const tx of txs) if (isSpending(tx) && inPeriod(tx.occurredAt, m)) byCat.set(tx.categoryId, (byCat.get(tx.categoryId) ?? 0) + tx.amount);
  const categoryBreakdown = [...byCat.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount, name: catById.get(categoryId)?.name ?? "Other", essential: catById.get(categoryId)?.essential ?? false }))
    .sort((a, b) => b.amount - a.amount);

  /* --------------------------------------------------- Daily trend (30 days) */
  const dailyMap = new Map<string, number>();
  for (const tx of txs) if (isSpending(tx)) { const k = localDate(tx.occurredAt, tz); dailyMap.set(k, (dailyMap.get(k) ?? 0) + tx.amount); }
  const dailyTrend = Array.from({ length: 30 }, (_, i) => {
    const date = format(addDays(parseISO(today), i - 29), "yyyy-MM-dd");
    return { date, label: fmtLocalDate(date, "d MMM"), spent: dailyMap.get(date) ?? 0, limit: budget?.limits.daily ?? 0 };
  });

  /* ------------------------------------------- Income vs expenses (6 months) */
  const monthTotals = new Map<string, { income: number; expenses: number }>();
  for (const tx of txs) {
    if (tx.type !== "income" && tx.type !== "expense") continue;
    const key = localDate(tx.occurredAt, tz).slice(0, 7);
    const row = monthTotals.get(key) ?? { income: 0, expenses: 0 };
    if (tx.type === "income") row.income += tx.amount;
    else row.expenses += tx.amount;
    monthTotals.set(key, row);
  }
  const incomeVsExpenses = Array.from({ length: 6 }, (_, i) => {
    const month = format(subMonths(parseISO(today), 5 - i), "yyyy-MM");
    const row = monthTotals.get(month) ?? { income: 0, expenses: 0 };
    return { month, label: fmtLocalDate(`${month}-01`, "MMM"), income: row.income, expenses: row.expenses };
  }).filter((r, i, arr) => r.income || r.expenses || i === arr.length - 1);

  /* --------------------------------------------- Savings growth (8 weeks) */
  const savingsGrowth = Array.from({ length: 9 }, (_, i) => {
    const at = addDays(now, (i - 8) * 7);
    const date = localDate(at, tz);
    return { date, label: fmtLocalDate(date, "d MMM"), savings: savingsBalance(d.savingsAccounts, d.contributions, at) };
  });

  /* ------------------------------------------ Weekly utilization (6 weeks) */
  const weekTotals = new Map<string, number>();
  for (const [day, amount] of dailyMap) {
    const wk = weekKeyOf(day);
    weekTotals.set(wk, (weekTotals.get(wk) ?? 0) + amount);
  }
  const thisWeekKey = weekKeyOf(today);
  const weeklyUtilization = Array.from({ length: 6 }, (_, i) => {
    const start = format(addDays(parseISO(thisWeekKey), (i - 5) * 7), "yyyy-MM-dd");
    const spent = weekTotals.get(start) ?? 0;
    const limit = budget?.limits.weekly ?? 0;
    return { week: start, label: fmtLocalDate(start, "d MMM"), spent, limit, pct: limit ? Math.round((spent / limit) * 100) : 0 };
  });

  /* ----------------------------------------------------- Prediction */
  const prediction = predictZeroBalance({ balance, transactions: txs, tz, now, income: d.income, bills: d.recurring, planned: d.shoppingItems });

  /* ------------------------------------------------- Bills & subs */
  const reminders = dueReminders(d.recurring, tz, now, fmt);
  const subscriptions = auditSubscriptions(d.recurring, d.subscriptionUsage, tz, fmt, now);
  const in30 = format(addDays(parseISO(today), 30), "yyyy-MM-dd");
  const upcomingObligations30 = obligationsBetween(today, in30, d.recurring);

  /* ----------------------------------------------------- Bulk-buy */
  const essentialDaily = budget ? budget.essentialSpent / Math.max(1, parseISO(today).getDate()) : 0;
  const reserve = Math.round(essentialDaily * EMERGENCY_RESERVE_DAYS);
  const current = latestPrices(d.marketProducts, d.marketHistory, currency);
  const people = d.persona?.householdSize ?? 1;
  const bulkBuys = d.marketProducts
    .map((product) => {
      const comparison = compareProduct(product, current, d.marketHistory, now);
      if (!comparison) return null;
      return evaluateBulkBuy({
        product,
        comparison,
        monthlyConsumption: Math.round((PER_PERSON_MONTHLY[product.slug] ?? 0) * people * 10) / 10,
        availableBalance: balance,
        upcomingObligations: upcomingObligations30,
        reserve,
        storageMonths: 3,
      });
    })
    .filter((r): r is BulkBuyResult => r !== null);

  /* --------------------------------------------------- Hard stop */
  let hardStop: HardStop | null = null;
  if (budget && (budget.week.over > 0 || budget.day.over > 0)) {
    const isWeek = budget.week.over > 0;
    const usage = isWeek ? budget.week : budget.day;
    const p = isWeek ? weekPeriod(tz, now) : dayPeriod(tz, now);
    const breakdownMap = new Map<string, number>();
    for (const t of txs) if (isSpending(t) && inPeriod(t.occurredAt, p)) {
      const name = catById.get(t.categoryId)?.name ?? "Other";
      breakdownMap.set(name, (breakdownMap.get(name) ?? 0) + t.amount);
    }
    hardStop = {
      period: isWeek ? "weekly" : "daily",
      over: usage.over,
      limit: usage.limit,
      spent: usage.spent,
      remainingMonth: budget.month.remaining,
      breakdown: [...breakdownMap.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5),
      correctiveAction: isWeek
        ? `Pause non-essential purchases until next week. Keep essentials within about ${fmt(budget.recommendedDaily)} per day.`
        : `Hold off on further non-essential spending today. Tomorrow's recommended limit is about ${fmt(budget.recommendedDaily)}.`,
    };
  }

  /* ------------------------------------------------------- Alerts */
  const alerts: Alert[] = [];
  if (budget) {
    const w = budget.week;
    if (w.usedPct >= thresholds.caution) {
      alerts.push({
        id: "week-usage",
        severity: w.status === "critical" ? "critical" : w.status === "warning" ? "warning" : "caution",
        title: `You have spent ${Math.round(w.usedPct)}% of your weekly budget.`,
        explanation: `${fmt(w.spent)} of ${fmt(w.limit)} used this week (weeks start on Monday).`,
        action: { label: "See this week's spending", href: "/transactions?period=week" },
      });
    }
    if (budget.month.usedPct >= thresholds.caution) {
      alerts.push({
        id: "month-usage",
        severity: budget.month.status === "critical" ? "critical" : budget.month.status === "warning" ? "warning" : "caution",
        title: `${Math.round(budget.month.usedPct)}% of this month's budget is used.`,
        explanation: `${budget.daysLeft} day${budget.daysLeft === 1 ? "" : "s"} left this month with ${fmt(budget.month.remaining)} remaining.`,
        action: { label: "Review budget", href: "/budget" },
      });
    }
  }
  // Category week-over-week change (food).
  const thisWeek = weekPeriod(tz, now);
  const lastWeek = weekPeriod(tz, addDays(now, -7));
  const foodIds = new Set(d.categories.filter((c) => /grocer|dining/i.test(c.name)).map((c) => c.id));
  const elapsed = Math.max(1, Math.round((now.getTime() - thisWeek.start.getTime()) / 86_400_000));
  const foodThis = txs.filter((t) => isSpending(t) && foodIds.has(t.categoryId) && inPeriod(t.occurredAt, thisWeek)).reduce((s, t) => s + t.amount, 0);
  const lastWeekSameDays = { start: lastWeek.start, end: new Date(lastWeek.start.getTime() + elapsed * 86_400_000) };
  const foodLast = txs.filter((t) => isSpending(t) && foodIds.has(t.categoryId) && inPeriod(t.occurredAt, lastWeekSameDays)).reduce((s, t) => s + t.amount, 0);
  if (foodLast > 0 && foodThis > foodLast * 1.15) {
    alerts.push({
      id: "food-up",
      severity: "caution",
      title: `Your food expenses are ${Math.round(((foodThis - foodLast) / foodLast) * 100)}% higher than last week.`,
      explanation: `${fmt(foodThis)} so far this week vs ${fmt(foodLast)} over the same days last week.`,
      action: { label: "Compare market prices", href: "/market" },
    });
  }
  // Planned groceries affordability.
  const plannedTotal = d.shoppingItems.filter((i) => !i.deletedAt && i.status === "needed").reduce((s, i) => s + i.estimatedUnitPrice * i.quantity, 0);
  if (plannedTotal > 0 && budget) {
    const fits = plannedTotal <= budget.month.remaining && plannedTotal <= balance;
    alerts.push({
      id: "shopping-fit",
      severity: fits ? "success" : "warning",
      title: fits ? "You have enough remaining money to purchase your planned groceries." : "Your planned shopping may not fit your remaining budget.",
      explanation: `Planned items total ${fmt(plannedTotal)}; ${fmt(budget.month.remaining)} remains in this month's budget.`,
      action: { label: "Open shopping list", href: "/shopping" },
    });
  }
  if (prediction.status === "ok" && prediction.projectedZeroDate && prediction.projectedDaysRemaining !== null && prediction.projectedDaysRemaining <= 45) {
    alerts.push({
      id: "zero-balance",
      severity: prediction.projectedDaysRemaining <= 14 ? "critical" : "warning",
      title: `Your current spending rate may exhaust your available funds by ${fmtLocalDate(prediction.projectedZeroDate, "MMMM d")}.`,
      explanation: `Estimate based on ${fmt(prediction.dailyBurnRate)}/day over the last ${prediction.observedDays} days, plus scheduled bills and expected regular income. Not a guarantee.`,
      action: { label: "See the projection", href: "/analytics#forecast" },
    });
  }
  const bestDeal = bulkBuys.filter((b): b is Extract<BulkBuyResult, { recommended: true }> => b.recommended).sort((a, b) => b.estimatedSavings - a.estimatedSavings)[0];
  if (bestDeal) {
    alerts.push({
      id: `bulk-${bestDeal.productId}`,
      severity: "info",
      title: `${bestDeal.productName} prices have decreased by ${Math.round(bestDeal.dropPct)}%. Consider checking your bulk-buy opportunities.`,
      explanation: `Compared with the recorded 30-day average${bestDeal.verified ? " of prices your household recorded" : " in the simulated development index"}.`,
      action: { label: "View bulk-buy suggestion", href: "/market#bulk" },
    });
  }
  for (const r of reminders.filter((r) => r.daysUntil <= 3)) {
    alerts.push({ id: r.dedupeKey, severity: r.severity, title: r.message, explanation: "Make sure the money is set aside before the due date.", action: { label: "Open bills", href: "/bills" } });
  }
  for (const s of subscriptions.filter((s) => s.verdict === "unused")) {
    alerts.push({ id: `sub-${s.paymentId}`, severity: "caution", title: `${s.name}: no usage recorded in 30 days.`, explanation: `${fmt(s.monthlyCost)}/month (${fmt(s.annualCost)}/year). Based on usage you recorded.`, action: { label: "Review subscriptions", href: "/bills#audit" } });
  }

  /* ------------------------------------------------------- Health */
  const warnings = alerts.filter((a) => a.severity === "warning" || a.severity === "critical").length + (hardStop ? 1 : 0);
  const monthStatus = budget ? budget.month.status : "healthy";
  let score = 100;
  if (budget) {
    const daysIn = parseISO(today).getDate();
    const totalDays = daysIn + budget.daysLeft - 1;
    const expectedPct = (daysIn / totalDays) * 100;
    score -= Math.max(0, Math.min(35, (budget.month.usedPct - expectedPct) * 0.8));
    score -= budget.week.over > 0 ? 15 : budget.week.usedPct >= thresholds.warning ? 8 : 0;
  }
  score -= behaviorCounts.red * 4;
  if (prediction.status === "ok" && prediction.projectedDaysRemaining !== null) score -= prediction.projectedDaysRemaining <= 14 ? 20 : 8;
  if (d.budget && savingsThisMonth >= d.budget.savingsTarget) score += 5;
  score = Math.round(Math.max(0, Math.min(100, score)));
  const status: SpendingStatus = score >= 75 ? "healthy" : score >= 55 ? "caution" : score >= 35 ? "warning" : "critical";
  const spendingBehavior =
    behaviorCounts.red >= 3 ? "Several critical purchases this month" : behaviorCounts.red > 0 ? "Mostly on track, a few critical purchases" : behaviorCounts.yellow > 3 ? "Some caution signals" : "Healthy spending pattern";

  return {
    tz,
    currency,
    fmt,
    balance,
    previousBalance,
    lastUpdated,
    savings,
    savingsThisMonth,
    budget,
    monthStatus,
    income: incomeSummary(d.income),
    prediction,
    classifications,
    behaviorCounts,
    categoryBreakdown,
    dailyTrend,
    incomeVsExpenses,
    savingsGrowth,
    weeklyUtilization,
    reminders,
    subscriptions,
    bulkBuys,
    upcomingObligations30,
    reserve,
    alerts,
    hardStop,
    health: {
      status,
      score,
      label: status === "healthy" ? "Healthy" : status === "caution" ? "Needs attention" : status === "warning" ? "At risk" : "Critical",
      spendingBehavior,
      warnings,
    },
  };
}

