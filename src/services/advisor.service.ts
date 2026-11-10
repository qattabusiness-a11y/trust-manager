import { differenceInCalendarMonths, parseISO } from "date-fns";
import { goalBalance } from "@/lib/calculations/balance";
import { monthlyEquivalent } from "@/lib/calculations/budget";
import type { FinanceData, FinanceSnapshot } from "@/lib/calculations/snapshot";
import { compareProduct, latestPrices, planVsMarket } from "@/lib/calculations/market";
import { fmtLocalDate, todayLocal } from "@/lib/dates";
import type { AdvisorInsight, AdvisorResponse, UserPersona } from "@/types";

export interface FinancialContext {
  persona: UserPersona | null;
  data: FinanceData;
  snapshot: FinanceSnapshot;
  now?: Date;
}

/** Provider-independent advisor contract (an LLM provider can implement it later). */
export interface FinancialAdvisor {
  readonly provider: string;
  analyzeSpending(context: FinancialContext): Promise<AdvisorResponse>;
  generateRecommendations(context: FinancialContext): Promise<AdvisorResponse>;
  generateMonthlyReport(context: FinancialContext): Promise<AdvisorResponse>;
  generateWeeklyReport(context: FinancialContext): Promise<AdvisorResponse>;
}

const DISCLAIMER =
  "Guidance generated from your own records by rules, not a licensed financial advisor. Facts come from your data; estimates are projections and may be wrong. Trust Manager never moves money or invests on your behalf.";

type Profile = "student" | "irregular" | "dependents" | "low_income" | "stable_surplus" | "standard";

export function personaProfile(p: UserPersona | null, surplus: number): Profile[] {
  if (!p) return ["standard"];
  const out: Profile[] = [];
  if (p.employmentStatus === "student") out.push("student");
  if (p.incomeFrequency === "irregular" || p.employmentStatus === "self-employed" || p.employmentStatus === "unemployed") out.push("irregular");
  if (p.dependents + p.financialDependents >= 1) out.push("dependents");
  const perPerson = p.monthlyIncome / Math.max(1, p.householdSize);
  if (perPerson < 100_000) out.push("low_income");
  if (surplus > 0 && p.incomeFrequency !== "irregular" && p.employmentStatus === "employed") out.push("stable_surplus");
  return out.length ? out : ["standard"];
}

/**
 * Deterministic rule-based advisor. Every insight is computed from the
 * household's records — no random or generic advice.
 */
export class MockFinancialAdvisor implements FinancialAdvisor {
  readonly provider = "Trust Manager rules engine (mock advisor)";

  private build(ctx: FinancialContext, kinds?: AdvisorInsight["kind"][]): AdvisorResponse {
    const { snapshot: s, data: d, persona } = ctx;
    const now = ctx.now ?? new Date();
    const fmt = s.fmt;
    const insights: AdvisorInsight[] = [];
    const essentials = s.budget?.essentialSpent ?? 0;
    const monthlyIncome = s.income.totalMonthly;
    const obligations = d.recurring.filter((r) => !r.deletedAt && r.status === "active").reduce((sum, r) => sum + monthlyEquivalent(r), 0);
    const surplus = monthlyIncome - (d.budget?.monthlyBudget ?? 0);
    const profiles = personaProfile(persona, surplus);
    const add = (i: AdvisorInsight) => {
      if (!kinds || kinds.includes(i.kind)) insights.push(i);
    };

    /* 1. Spending analysis */
    if (s.budget) {
      const b = s.budget;
      const daysSoFar = Number(todayLocal(s.tz, now).slice(8, 10));
      const totalDays = daysSoFar + b.daysLeft - 1;
      const expected = (daysSoFar / totalDays) * 100;
      const top = s.categoryBreakdown[0];
      const ahead = b.month.usedPct - expected;
      add({
        id: "spending-pace",
        kind: "spending",
        severity: ahead > 15 ? "warning" : ahead > 5 ? "caution" : "success",
        title: ahead > 5 ? "You are spending faster than your month is passing" : "Your spending pace matches the month",
        message:
          ahead > 5
            ? `You've used ${Math.round(b.month.usedPct)}% of the budget with ${Math.round(expected)}% of the month gone. Slowing flexible purchases now protects the last ${b.daysLeft} days.`
            : `You've used ${Math.round(b.month.usedPct)}% of the budget and ${Math.round(expected)}% of the month has passed.`,
        facts: [
          `Spent this month: ${fmt(b.month.spent)} of ${fmt(b.month.limit)}.`,
          top ? `Largest category: ${top.name} (${fmt(top.amount)}).` : "No spending recorded yet this month.",
          `${s.behaviorCounts.red} critical, ${s.behaviorCounts.yellow} caution and ${s.behaviorCounts.green} healthy transactions this month.`,
        ],
        estimates: [`At today's pace the month would end near ${fmt(Math.round((b.month.spent / Math.max(1, daysSoFar)) * totalDays))} (estimate).`],
        action: { label: "Review transactions", href: "/transactions" },
      });
    }

    /* 2. Budget recommendations */
    if (s.hardStop) {
      add({
        id: "hard-stop",
        kind: "budget",
        severity: "critical",
        title: `You are over your ${s.hardStop.period} limit by ${fmt(s.hardStop.over)}`,
        message: s.hardStop.correctiveAction,
        facts: [`Limit ${fmt(s.hardStop.limit)}, spent ${fmt(s.hardStop.spent)}.`, ...s.hardStop.breakdown.slice(0, 3).map((b) => `${b.category}: ${fmt(b.amount)}`)],
        estimates: [],
        action: { label: "Adjust budget", href: "/budget" },
      });
    }
    if (s.budget && d.budget && s.budget.essentialUsage.usedPct > 90) {
      add({
        id: "essential-allocation",
        kind: "budget",
        severity: "caution",
        title: "Essential spending is close to its allocation",
        message: profiles.includes("dependents")
          ? "With dependents in the household, essentials come first. Consider moving part of the flexible allocation to essentials rather than cutting food or school costs."
          : "Consider moving part of the flexible allocation to essentials for the rest of this month.",
        facts: [`Essentials: ${fmt(s.budget.essentialSpent)} of ${fmt(d.budget.essentialAllocation)}.`, `Flexible: ${fmt(s.budget.flexibleSpent)} of ${fmt(d.budget.flexibleAllocation)}.`],
        estimates: [],
        action: { label: "Edit allocations", href: "/budget" },
      });
    }

    /* 3. Savings planning */
    const essentialMonthly = Math.max(essentials, obligations);
    const emergencyMonths = essentialMonthly ? s.savings / essentialMonthly : 0;
    const savingsRate = monthlyIncome ? (s.savingsThisMonth / monthlyIncome) * 100 : 0;
    add({
      id: "savings-plan",
      kind: "savings",
      severity: emergencyMonths < 1 ? "warning" : emergencyMonths < 3 ? "caution" : "success",
      title:
        profiles.includes("student") || profiles.includes("irregular")
          ? "Your income is irregular, so build an emergency reserve first"
          : emergencyMonths < 3
            ? "Grow your emergency reserve to three months of essentials"
            : profiles.includes("stable_surplus")
              ? "You have a consistent surplus — split it between reserves and long-term goals"
              : "Your emergency reserve is in good shape",
      message:
        profiles.includes("student") || profiles.includes("irregular")
          ? "Your income is irregular, so consider maintaining an emergency reserve before committing to long-term investments."
          : profiles.includes("stable_surplus") && emergencyMonths >= 1
            ? "You have a consistent monthly surplus. Consider dividing it between emergency savings and your longer-term financial goals."
            : profiles.includes("low_income")
              ? "Prioritize liquidity: keep savings where you can reach them quickly (for example a SACCO or mobile savings account) before locking money away."
              : `Aim to set aside ${fmt(d.budget?.savingsTarget ?? 0)} each month until you reach about three months of essential spending.`,
      facts: [
        `Total savings: ${fmt(s.savings)}.`,
        `Saved this month: ${fmt(s.savingsThisMonth)} (${savingsRate.toFixed(0)}% of monthly income).`,
        d.budget ? `Monthly savings target: ${fmt(d.budget.savingsTarget)}.` : "No savings target set.",
      ],
      estimates: [`Your savings cover about ${emergencyMonths.toFixed(1)} months of essential spending (estimate based on this month).`],
      action: { label: "Open savings", href: "/savings" },
    });

    /* 4. Household optimization + 5. Market */
    const current = latestPrices(d.marketProducts, d.marketHistory, s.currency);
    const overPlanned = d.shoppingItems
      .filter((i) => !i.deletedAt && i.status === "needed" && i.marketProductId)
      .map((i) => {
        const product = d.marketProducts.find((p) => p.id === i.marketProductId);
        const cmp = product ? compareProduct(product, current, d.marketHistory, now) : null;
        return { item: i, result: planVsMarket(i.estimatedUnitPrice, i.quantity, cmp, (n) => fmt(n)) };
      });
    const savingsPossible = overPlanned.filter((o) => o.result.status === "saving_possible");
    const underPlanned = overPlanned.filter((o) => o.result.status === "plan_too_low");
    const groceries = s.categoryBreakdown.find((c) => /grocer/i.test(c.name));
    if (groceries && persona) {
      add({
        id: "household-food",
        kind: "optimization",
        severity: s.alerts.some((a) => a.id === "food-up") ? "caution" : "info",
        title: s.alerts.some((a) => a.id === "food-up") ? "Your food expenses have increased" : "Food is your main household cost",
        message: profiles.includes("dependents")
          ? "Your food expenses have increased. Review your grocery list and compare available market prices before making your next purchase."
          : "Compare your grocery list with the market index before shopping — markets like Nyabugogo are usually cheaper than supermarkets.",
        facts: [
          `Groceries this month: ${fmt(groceries.amount)} for ${persona.householdSize} people (${fmt(Math.round(groceries.amount / Math.max(1, persona.householdSize)))} per person).`,
        ],
        estimates: [],
        action: { label: "Open shopping list", href: "/shopping" },
      });
    }
    if (savingsPossible.length || underPlanned.length) {
      const total = savingsPossible.reduce((sum, o) => sum + o.result.totalDifference, 0);
      add({
        id: "market-plan",
        kind: "market",
        severity: underPlanned.length ? "caution" : "info",
        title: savingsPossible.length ? `Your shopping plan could cost ${fmt(total)} less` : "Some planned prices are below the market",
        message: [
          ...savingsPossible.map((o) => `${o.item.productName}: ${o.result.message}`),
          ...underPlanned.map((o) => `${o.item.productName}: ${o.result.message}`),
        ].join(" "),
        facts: overPlanned.filter((o) => o.result.marketUnitPrice).map((o) => `${o.item.productName}: planned ${fmt(o.item.estimatedUnitPrice)} vs market avg ${fmt(o.result.marketUnitPrice!)} per ${o.item.unit}.`),
        estimates: ["Market figures come from the demo index — not verified live prices."],
        action: { label: "Compare prices", href: "/market" },
      });
    }
    const deal = s.bulkBuys.find((b) => b.recommended);
    if (deal && deal.recommended) {
      add({
        id: "bulk-buy",
        kind: "market",
        severity: "info",
        title: `Consider a ${deal.months}-month supply of ${deal.productName}`,
        message: `${deal.productName} is ${Math.round(deal.dropPct)}% below its 30-day average. Buying ${deal.quantity} ${deal.unit} could save about ${fmt(deal.estimatedSavings)} and still leaves your bills and emergency reserve covered.`,
        facts: [`Current avg ${fmt(deal.currentPrice)}/${deal.unit}; 30-day avg ${fmt(deal.thirtyDayAverage)}.`, `Bills due in 30 days: ${fmt(deal.upcomingObligations)}.`],
        estimates: [`Estimated savings ${fmt(deal.estimatedSavings)}; confidence ${deal.confidence}.`],
        action: { label: "See bulk-buy details", href: "/market#bulk" },
      });
    }

    /* 6. Subscriptions */
    const unused = s.subscriptions.filter((x) => x.verdict !== "keep");
    if (unused.length) {
      const annual = unused.reduce((sum, x) => sum + x.annualCost, 0);
      add({
        id: "subscriptions",
        kind: "subscription",
        severity: "caution",
        title: `Review ${unused.length} subscription${unused.length > 1 ? "s" : ""} worth ${fmt(annual)} a year`,
        message: unused.map((u) => `${u.name}: ${u.message}`).join(" "),
        facts: unused.map((u) => `${u.name}: ${fmt(u.monthlyCost)}/month, ${u.usesLast30} recorded uses in 30 days.`),
        estimates: [],
        action: { label: "Open subscription audit", href: "/bills#audit" },
      });
    }

    /* 7. Goals */
    const accountOpening = new Map(d.savingsAccounts.map((a) => [a.id, a.openingBalance]));
    for (const g of d.savingsGoals.filter((g) => !g.deletedAt && g.status === "active")) {
      const saved = goalBalance(g.id, accountOpening.get(g.accountId) ?? 0, d.contributions);
      const remaining = Math.max(0, g.targetAmount - saved);
      const months = g.targetDate ? Math.max(1, differenceInCalendarMonths(parseISO(g.targetDate), now)) : null;
      const perMonth = months ? Math.ceil(remaining / months) : null;
      add({
        id: `goal-${g.id}`,
        kind: "goal",
        severity: perMonth && d.budget && perMonth > d.budget.savingsTarget ? "caution" : "info",
        title: `${g.name}: ${Math.round((saved / g.targetAmount) * 100)}% funded`,
        message: perMonth
          ? `To reach it by ${fmtLocalDate(g.targetDate!, "MMMM yyyy")}, save about ${fmt(perMonth)} per month.${d.budget && perMonth > d.budget.savingsTarget ? " That's more than your whole monthly savings target — consider a later date." : ""}`
          : `${fmt(remaining)} to go. Add a target date to get a monthly plan.`,
        facts: [`Saved ${fmt(saved)} of ${fmt(g.targetAmount)}.`],
        estimates: perMonth ? [`${fmt(perMonth)}/month over ${months} months (estimate).`] : [],
        action: { label: "View goal", href: "/savings" },
      });
    }

    /* 8. Investment education */
    const readyToLearn = emergencyMonths >= 3 && profiles.includes("stable_surplus");
    add({
      id: "education",
      kind: "education",
      severity: "info",
      title: readyToLearn ? "Learn before you invest: options to explore" : "Investing can wait until your reserve is ready",
      message: readyToLearn
        ? "With a reserve in place you could learn about Rwanda government Treasury bonds, regulated collective investment schemes, or SACCO fixed deposits. Every investment carries risk — returns are never guaranteed and money can be locked up. Speak to a licensed advisor before committing, and only invest money you won't need soon."
        : "Long-term investing makes more sense once you hold about three months of essential spending in savings you can reach quickly. Until then, focus on your emergency reserve. No investment can promise guaranteed returns.",
      facts: [`Emergency reserve: about ${emergencyMonths.toFixed(1)} months of essentials.`, `Risk tolerance on your profile: ${persona?.riskTolerance ?? "not set"}.`],
      estimates: [],
      action: { label: "Add a learning goal", href: "/vision" },
    });

    /* 9. Risk warnings */
    if (s.prediction.status === "ok" && s.prediction.projectedZeroDate) {
      add({
        id: "zero-balance",
        kind: "risk",
        severity: (s.prediction.projectedDaysRemaining ?? 99) <= 14 ? "critical" : "warning",
        title: `You may run out of available funds around ${fmtLocalDate(s.prediction.projectedZeroDate, "MMMM d")}`,
        message: "This happens if your current spending pattern continues. Reducing flexible spending or moving a bill date can push this date back.",
        facts: [`Available now: ${fmt(s.balance)}.`, `Average spending: ${fmt(s.prediction.dailyBurnRate)}/day over ${s.prediction.observedDays} days.`],
        estimates: ["Projection includes scheduled bills and regular income; irregular income is excluded. It is an estimate, not a guarantee."],
        action: { label: "See forecast", href: "/analytics#forecast" },
      });
    }
    if (persona && persona.debtObligations > 0 && monthlyIncome > 0) {
      const ratio = (persona.debtObligations / monthlyIncome) * 100;
      add({
        id: "debt",
        kind: "risk",
        severity: ratio > 35 ? "warning" : "info",
        title: `Debt repayments take ${ratio.toFixed(0)}% of income`,
        message: ratio > 35 ? "That's high. Avoid new borrowing and prioritize the most expensive debt." : "Keep repayments on schedule and avoid new borrowing for non-essentials.",
        facts: [`Monthly debt obligations: ${fmt(persona.debtObligations)}.`],
        estimates: [],
      });
    }

    const critical = insights.filter((i) => i.severity === "critical" || i.severity === "warning").length;
    const who = persona
      ? `${persona.employmentStatus === "student" ? "a student" : persona.employmentStatus === "self-employed" ? "a self-employed earner" : "a working professional"} in a household of ${persona.householdSize}`
      : "your household";
    return {
      generatedAt: now.toISOString(),
      provider: this.provider,
      summary: critical
        ? `As ${who}, you have ${critical} item${critical > 1 ? "s that need" : " that needs"} attention now. Start with the first one below.`
        : `As ${who}, your finances look stable. Here are ways to keep improving.`,
      insights: insights.sort((a, b) => rank(a.severity) - rank(b.severity)),
      disclaimer: DISCLAIMER,
    };
  }

  async analyzeSpending(ctx: FinancialContext) {
    return this.build(ctx, ["spending", "budget", "optimization"]);
  }
  async generateRecommendations(ctx: FinancialContext) {
    return this.build(ctx);
  }
  async generateMonthlyReport(ctx: FinancialContext) {
    return this.build(ctx);
  }
  async generateWeeklyReport(ctx: FinancialContext) {
    return this.build(ctx, ["spending", "budget", "market", "risk", "subscription"]);
  }
}

function rank(s: AdvisorInsight["severity"]) {
  return { critical: 0, warning: 1, caution: 2, info: 3, success: 4 }[s];
}

export const financialAdvisor: FinancialAdvisor = new MockFinancialAdvisor();
