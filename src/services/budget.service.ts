import { validateCustomLimits } from "@/lib/calculations/budget";
import type { Api } from "@/lib/data/api";
import { daysInCurrentMonth, monthKey } from "@/lib/dates";
import { budgetSchema, type BudgetInput } from "@/lib/validations";
import type { Budget } from "@/types";

export { computeBudgetState, resolveLimits, spendingStatus } from "@/lib/calculations/budget";

/** Validate and save the current month's budget (creates it if missing). */
export async function saveBudget(api: Api, existing: Budget | null, input: BudgetInput, tz: string): Promise<Budget> {
  const v = budgetSchema.parse(input);
  const errors = validateCustomLimits(v.monthlyBudget, daysInCurrentMonth(tz), v.customDailyLimit, v.customWeeklyLimit);
  if (errors.length) throw new Error(errors[0]);
  const fields = {
    monthlyBudget: v.monthlyBudget,
    savingsTarget: v.savingsTarget,
    essentialAllocation: v.essentialAllocation,
    flexibleAllocation: v.flexibleAllocation,
    customDailyLimit: v.customDailyLimit,
    customWeeklyLimit: v.customWeeklyLimit,
    thresholds: { caution: v.caution, warning: v.warning, critical: v.critical },
  };
  if (existing) return api.update("budgets", existing.id, fields);
  return api.create("budgets", { householdId: api.actor.householdId!, month: monthKey(tz), ...fields });
}
