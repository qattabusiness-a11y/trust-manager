"use client";

import { useMemo } from "react";
import { buildSnapshot, type FinanceData } from "@/lib/calculations/snapshot";
import { monthKey } from "@/lib/dates";
import { useList } from "./use-data";
import { useSession } from "./use-session";

/** Loads every record the financial engines need and derives one snapshot. */
export function useFinance() {
  const session = useSession();
  const households = useList("households");
  const personas = useList("personas");
  const budgets = useList("budgets");
  const transactions = useList("transactions");
  const categories = useList("categories");
  const income = useList("incomeSources");
  const recurring = useList("recurringPayments");
  const usage = useList("subscriptionUsage");
  const accounts = useList("savingsAccounts");
  const goals = useList("savingsGoals");
  const contributions = useList("savingsContributions");
  const shopping = useList("shoppingItems");
  const products = useList("marketProducts");
  const history = useList("marketPriceHistory");

  const queries = [households, personas, budgets, transactions, categories, income, recurring, usage, accounts, goals, contributions, shopping, products, history];
  const loading = session.loading || queries.some((q) => q.isLoading);
  const error = queries.find((q) => q.error)?.error ?? null;

  const household = households.data?.[0] ?? null;
  const tz = household?.timezone ?? "Africa/Kigali";
  const persona = personas.data?.find((p) => p.householdId === household?.id) ?? personas.data?.[0] ?? null;
  const currentMonth = monthKey(tz);
  const sortedBudgets = [...(budgets.data ?? [])].sort((a, b) => b.month.localeCompare(a.month));
  const budget = sortedBudgets.find((b) => b.month === currentMonth) ?? sortedBudgets[0] ?? null;

  const data: FinanceData = useMemo(
    () => ({
      household,
      persona,
      budget,
      transactions: transactions.data ?? [],
      categories: categories.data ?? [],
      income: income.data ?? [],
      recurring: recurring.data ?? [],
      subscriptionUsage: usage.data ?? [],
      savingsAccounts: accounts.data ?? [],
      savingsGoals: goals.data ?? [],
      contributions: contributions.data ?? [],
      shoppingItems: shopping.data ?? [],
      marketProducts: products.data ?? [],
      marketHistory: history.data ?? [],
    }),
    [household, persona, budget, transactions.data, categories.data, income.data, recurring.data, usage.data, accounts.data, goals.data, contributions.data, shopping.data, products.data, history.data],
  );

  const snapshot = useMemo(() => buildSnapshot(data), [data]);
  return { ...session, loading, error, data, snapshot, household, persona, budget, budgetIsCurrentMonth: budget?.month === currentMonth };
}
