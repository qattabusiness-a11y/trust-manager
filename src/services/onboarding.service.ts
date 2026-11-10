"use client";

import { addMonths, format, startOfMonth } from "date-fns";
import { DEFAULT_THRESHOLDS } from "@/constants";
import { createApi } from "@/lib/data/api";
import { getStore } from "@/lib/data/runtime";
import { monthKey, todayLocal } from "@/lib/dates";
import type { EmploymentStatus, IncomeFrequency, RiskTolerance, UserPersona } from "@/types";
import { createHousehold } from "./auth.service";

export interface OnboardingData {
  // Step 1
  fullName: string;
  age: number;
  country: string;
  city: string;
  language: string;
  currency: string;
  timezone: string;
  occupation: string;
  employmentStatus: EmploymentStatus;
  // Step 2
  householdName: string;
  householdSize: number;
  dependents: number;
  householdStatus: string;
  managesFinances: "alone" | "jointly";
  financialDependents: number;
  // Step 3
  monthlyIncome: number;
  incomeFrequency: IncomeFrequency;
  additionalIncome: number;
  additionalIncomeLabel: string;
  availableNow: number;
  existingSavings: number;
  monthlyRent: number;
  debtObligations: number;
  otherRecurringExpenses: number;
  // Step 4
  goals: string[];
  customGoal: string;
  // Step 5
  monthlyBudget: number;
  savingsTarget: number;
  essentialAllocation: number;
  flexibleAllocation: number;
  planningApproach: UserPersona["planningApproach"];
  riskTolerance: RiskTolerance;
}

/**
 * Persists the onboarding profile. Users who joined a household by invitation
 * get a personal persona only; new users get a fully set-up household.
 */
export async function completeOnboarding(userId: string, d: OnboardingData): Promise<string> {
  const store = await getStore();
  const memberships = (await store.select("householdMembers", { userId })).filter((m) => m.status === "active");
  const joined = memberships[0] ?? null;

  const householdId =
    joined?.householdId ??
    (await createHousehold(userId, {
      name: d.householdName.trim() || `${d.fullName.split(" ").at(-1)} Household`,
      currency: d.currency,
      country: d.country,
      timezone: d.timezone,
      openingBalance: d.availableNow,
    }));

  const member = (await store.select("householdMembers", { userId, householdId }))[0]!;
  const api = createApi(store, { userId, householdId, member });
  const tz = d.timezone;
  const today = todayLocal(tz);
  const goals = [...d.goals, ...(d.customGoal.trim() ? [d.customGoal.trim()] : [])];

  await api.create("personas", {
    householdId,
    userId,
    age: d.age,
    country: d.country,
    city: d.city,
    language: d.language,
    currency: d.currency,
    occupation: d.occupation,
    employmentStatus: d.employmentStatus,
    householdSize: d.householdSize,
    dependents: d.dependents,
    financialDependents: d.financialDependents,
    householdStatus: d.householdStatus,
    managesFinances: d.managesFinances,
    monthlyIncome: d.monthlyIncome,
    incomeFrequency: d.incomeFrequency,
    additionalIncome: d.additionalIncome,
    existingSavings: d.existingSavings,
    monthlyRent: d.monthlyRent,
    debtObligations: d.debtObligations,
    otherRecurringExpenses: d.otherRecurringExpenses,
    monthlySavings: d.savingsTarget,
    financialGoals: goals,
    riskTolerance: d.riskTolerance,
    planningApproach: d.planningApproach,
  });

  await api.create("preferences", {
    userId,
    roundingIncrement: d.currency === "RWF" ? 500 : 100,
    autoSweep: false,
    emailNotifications: true,
    pushNotifications: false,
    defaultReminderDays: [7, 3, 1],
    hideBalances: false,
  });

  if (!joined) {
    const nextMonthFirst = format(startOfMonth(addMonths(new Date(), 1)), "yyyy-MM-dd");
    if (d.monthlyIncome > 0) {
      await api.create("incomeSources", {
        householdId,
        name: d.employmentStatus === "student" ? "Allowance / support" : "Main income",
        amount: d.monthlyIncome,
        category: d.employmentStatus === "student" ? "allowance" : d.employmentStatus === "self-employed" ? "business" : "salary",
        frequency: d.incomeFrequency,
        expectedDate: today,
        recurring: d.incomeFrequency !== "once" && d.incomeFrequency !== "irregular",
        savingsAllocation: Math.min(d.savingsTarget, d.monthlyIncome),
        notes: "Added during onboarding",
        ownerUserId: userId,
      });
    }
    if (d.additionalIncome > 0) {
      await api.create("incomeSources", {
        householdId,
        name: d.additionalIncomeLabel.trim() || "Additional income",
        amount: d.additionalIncome,
        category: "other",
        frequency: "irregular",
        expectedDate: today,
        recurring: false,
        savingsAllocation: 0,
        notes: "Added during onboarding",
        ownerUserId: userId,
      });
    }
    await api.create("budgets", {
      householdId,
      month: monthKey(tz),
      monthlyBudget: d.monthlyBudget,
      savingsTarget: d.savingsTarget,
      essentialAllocation: d.essentialAllocation,
      flexibleAllocation: d.flexibleAllocation,
      customDailyLimit: null,
      customWeeklyLimit: null,
      thresholds: DEFAULT_THRESHOLDS,
    });
    const emergency = await api.create("savingsAccounts", { householdId, name: "Emergency fund", kind: "emergency", openingBalance: d.existingSavings });
    await api.create("savingsAccounts", { householdId, name: "Spare change jar", kind: "micro", openingBalance: 0 });
    if (goals.includes("Emergency fund")) {
      await api.create("savingsGoals", {
        householdId,
        name: "Emergency fund — 3 months of essentials",
        targetAmount: Math.max(d.essentialAllocation * 3, d.savingsTarget * 6, 1),
        targetDate: null,
        accountId: emergency.id,
        priority: "high",
        status: "active",
        visionEntryId: null,
      });
    }
    for (const g of goals.filter((g) => g !== "Emergency fund")) {
      await api.create("visionEntries", {
        householdId,
        title: g,
        description: "Added during onboarding. Set a target amount and date when you're ready.",
        category: /business/i.test(g) ? "business" : /invest/i.test(g) ? "investment_learning" : /house|land|retire/i.test(g) ? "long_term" : "purchase",
        targetAmount: 0,
        targetDate: null,
        priority: "medium",
        progress: 0,
        status: "idea",
        goalId: null,
        createdBy: userId,
      });
    }
    if (d.monthlyRent > 0) {
      await api.create("recurringPayments", { householdId, name: "Rent", amount: d.monthlyRent, category: "Rent & Housing", kind: "bill", frequency: "monthly", nextDueDate: nextMonthFirst, reminderDays: [7, 3, 1], status: "active", essential: true });
    }
    if (d.debtObligations > 0) {
      await api.create("recurringPayments", { householdId, name: "Loan repayment", amount: d.debtObligations, category: "Loans", kind: "loan", frequency: "monthly", nextDueDate: nextMonthFirst, reminderDays: [7, 3, 1], status: "active", essential: true });
    }
    await api.create("shoppingLists", { householdId, name: "Household essentials" });
  }

  await store.update("profiles", userId, { fullName: d.fullName.trim(), onboardingCompleted: true, defaultHouseholdId: householdId, updatedAt: new Date().toISOString() });
  return householdId;
}
