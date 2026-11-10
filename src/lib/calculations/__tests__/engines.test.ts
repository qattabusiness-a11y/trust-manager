import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { CAT, DEFAULT_THRESHOLDS } from "@/constants";
import { buildDemoDb } from "@/lib/data/seed";
import { formatMoney, roundUpTo } from "@/lib/money";
import { effectivePermissions } from "@/lib/permissions";
import type { Budget, Household, MarketComparison, MarketProduct, Transaction } from "@/types";
import { availableBalance } from "../balance";
import { baseLimits, computeBudgetState, spendingStatus, validateCustomLimits } from "../budget";
import { evaluateBulkBuy } from "../bulkbuy";
import { classifyTransaction } from "../classification";
import { incomeSummary, sweepSuggestions, topPayees } from "../insights";
import { planVsMarket } from "../market";
import { predictZeroBalance } from "../prediction";
import { buildSnapshot } from "../snapshot";

const TZ = "Africa/Kigali";
const NOW = new Date("2026-11-10T12:00:00Z"); // Tue 10 Nov 2026, 14:00 Kigali

let n = 0;
function tx(p: Partial<Transaction>): Transaction {
  n++;
  return {
    id: `t${String(n).padStart(4, "0")}`, householdId: "h", type: "expense", title: "x", amount: 1000, currency: "RWF",
    occurredAt: NOW.toISOString(), categoryId: CAT.groceries, merchant: "Shop", paymentMethod: "momo", essential: true, planned: true,
    source: "manual", createdBy: "u", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), deletedAt: null, ...p,
  };
}
const budget: Budget = {
  id: "b", householdId: "h", month: "2026-11", monthlyBudget: 600_000, savingsTarget: 150_000, essentialAllocation: 470_000, flexibleAllocation: 130_000,
  customDailyLimit: null, customWeeklyLimit: null, thresholds: DEFAULT_THRESHOLDS, createdAt: "", updatedAt: "",
};
const household: Household = { id: "h", name: "H", ownerId: "u", currency: "RWF", country: "Rwanda", timezone: TZ, openingBalance: 100_000, openingBalanceDate: "2026-10-01T00:00:00Z", createdAt: "", updatedAt: "" };

describe("budget engine", () => {
  it("derives weekly and daily limits from the monthly budget", () => {
    expect(baseLimits(600_000, 30)).toEqual({ weekly: Math.round((600_000 * 12) / 52), daily: 20_000 });
  });
  it("applies configurable thresholds", () => {
    expect(spendingStatus(69)).toBe("healthy");
    expect(spendingStatus(70)).toBe("caution");
    expect(spendingStatus(85)).toBe("warning");
    expect(spendingStatus(100)).toBe("critical");
    expect(spendingStatus(60, { caution: 50, warning: 80, critical: 100 })).toBe("caution");
  });
  it("rejects custom limits that break the monthly budget", () => {
    expect(validateCustomLimits(600_000, 30, 25_000, null)).toHaveLength(1);
    expect(validateCustomLimits(600_000, 30, 15_000, 100_000)).toHaveLength(0);
  });
  it("updates immediately when a transaction is added (week starts Monday, Kigali time)", () => {
    const before = computeBudgetState(budget, [], TZ, [], NOW);
    const after = computeBudgetState(budget, [tx({ amount: 30_000, occurredAt: "2026-11-09T06:00:00Z" })], TZ, [], NOW);
    expect(before.week.spent).toBe(0);
    expect(after.week.spent).toBe(30_000);
    expect(after.month.spent).toBe(30_000);
    expect(after.day.spent).toBe(0); // it was yesterday
    // Sunday 8 Nov belongs to the previous week
    const sunday = computeBudgetState(budget, [tx({ amount: 9_000, occurredAt: "2026-11-08T20:00:00Z" })], TZ, [], NOW);
    expect(sunday.week.spent).toBe(0);
  });
});

describe("balance", () => {
  it("does not double count savings transfers as spending or income", () => {
    const txs = [tx({ type: "income", amount: 500_000 }), tx({ type: "savings_transfer", amount: 80_000 }), tx({ amount: 20_000 })];
    expect(availableBalance(household, txs, NOW)).toBe(100_000 + 500_000 - 80_000 - 20_000);
    const state = computeBudgetState(budget, txs, TZ, [], NOW);
    expect(state.month.spent).toBe(20_000);
  });
  it("income summary excludes savings allocations from available income", () => {
    const s = incomeSummary([{ amount: 650_000, frequency: "monthly", savingsAllocation: 80_000 } as never]);
    expect(s).toMatchObject({ totalMonthly: 650_000, allocatedToSavings: 80_000, availableAfterSavings: 570_000 });
  });
});

describe("behavioral classification", () => {
  it("never marks an expense red because of its amount alone", () => {
    const big = tx({ amount: 400_000, essential: false, planned: true, occurredAt: "2026-11-02T08:00:00Z" });
    const c = classifyTransaction(big, { tz: TZ, budget: { ...budget, monthlyBudget: 10_000_000 }, history: [big] });
    expect(c.behavior).not.toBe("red");
  });
  it("keeps essential spending out of red even over the limit", () => {
    const txs = [tx({ amount: 700_000, essential: true, occurredAt: "2026-11-02T08:00:00Z" })];
    expect(classifyTransaction(txs[0]!, { tz: TZ, budget, history: txs }).behavior).toBe("yellow");
  });
  it("flags unplanned non-essential spending past the weekly limit as red", () => {
    const a = tx({ amount: 140_000, essential: true, occurredAt: "2026-11-09T08:00:00Z" });
    const b = tx({ amount: 5_000, essential: false, planned: false, occurredAt: "2026-11-10T08:00:00Z" });
    expect(classifyTransaction(b, { tz: TZ, budget, history: [a, b] }).behavior).toBe("red");
  });
  it("respects user corrections", () => {
    const t = tx({ behaviorOverride: "green", essential: false, planned: false });
    expect(classifyTransaction(t, { tz: TZ, budget, history: [t] })).toMatchObject({ behavior: "green", overridden: true });
  });
});

describe("zero-balance prediction", () => {
  it("reports insufficient data", () => {
    const r = predictZeroBalance({ balance: 100_000, transactions: [tx({})], tz: TZ, now: NOW });
    expect(r.status).toBe("insufficient_data");
  });
  it("projects the date funds run out at the current burn rate", () => {
    const txs = Array.from({ length: 10 }, (_, i) => tx({ amount: 10_000, occurredAt: new Date(NOW.getTime() - i * 86_400_000).toISOString() }));
    const r = predictZeroBalance({ balance: 100_000, transactions: txs, tz: TZ, now: NOW });
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.dailyBurnRate).toBe(10_000);
    expect(r.basicDaysRemaining).toBe(10);
    expect(r.projectedZeroDate).toBe("2026-11-20");
  });
});

describe("market & bulk-buy", () => {
  const cmp: MarketComparison = { productId: "p", productName: "Rice", unit: "kg", average: 1_300, lowest: { price: 1200, marketName: "A", location: "x" }, highest: { price: 1400, marketName: "B", location: "y" }, thirtyDayAverage: 1_530, changePct: -10, source: "demo", recordedAt: "", verified: false, priceCount: 20 };
  const rice: MarketProduct = { id: "p", slug: "rice", name: "Rice", category: "Grains", unit: "kg", perishable: false, shelfLifeDays: 365, createdAt: "", updatedAt: "" };
  it("explains savings vs plan (RWF 1,500 planned, 1,300 market)", () => {
    const r = planVsMarket(1_500, 10, cmp, (v) => formatMoney(v, "RWF"));
    expect(r.status).toBe("saving_possible");
    expect(r.message).toBe("You could save RWF 200 per kg based on the available market data.");
  });
  it("recommends bulk buying only when funds and obligations allow", () => {
    const ok = evaluateBulkBuy({ product: rice, comparison: cmp, monthlyConsumption: 5, availableBalance: 500_000, upcomingObligations: 100_000, reserve: 50_000, storageMonths: 3 });
    expect(ok.recommended).toBe(true);
    const tight = evaluateBulkBuy({ product: rice, comparison: cmp, monthlyConsumption: 5, availableBalance: 120_000, upcomingObligations: 100_000, reserve: 50_000, storageMonths: 3 });
    expect(tight.recommended).toBe(false);
    const perishable = evaluateBulkBuy({ product: { ...rice, perishable: true, shelfLifeDays: 7 }, comparison: cmp, monthlyConsumption: 5, availableBalance: 900_000, upcomingObligations: 0, reserve: 0, storageMonths: 3 });
    expect(perishable.recommended).toBe(false);
  });
});

describe("micro-savings & payees", () => {
  it("rounds RWF 1,850 to 2,000 and suggests 150", () => {
    expect(roundUpTo(1_850, 1_000)).toBe(2_000);
    const s = sweepSuggestions([tx({ amount: 1_850 })], [], 1_000, new Date(0));
    expect(s[0]).toMatchObject({ rounded: 2_000, spare: 150 });
  });
  it("ranks payees by total", () => {
    const rows = topPayees([tx({ merchant: "Simba", amount: 5_000 }), tx({ merchant: "simba", amount: 7_000 }), tx({ merchant: "Kimironko", amount: 9_000 })], TZ);
    expect(rows[0]).toMatchObject({ merchant: "Simba", total: 12_000, count: 2 });
  });
});

describe("permissions", () => {
  it("never lets a viewer gain write permissions", () => {
    const p = effectivePermissions({ role: "viewer", status: "active", permissionOverrides: { edit_shopping: true, view_income: true } });
    expect(p.has("edit_shopping")).toBe(false);
    expect(p.has("view_income")).toBe(true);
  });
  it("lets the owner restrict a contributor", () => {
    const p = effectivePermissions({ role: "contributor", status: "active", permissionOverrides: { view_transactions: false } });
    expect(p.has("view_transactions")).toBe(false);
    expect(p.has("edit_shopping")).toBe(true);
    expect(p.has("view_balances")).toBe(false);
  });
});

describe("demo seed", () => {
  it("is deterministic, internally consistent and large enough", async () => {
    const a = await buildDemoDb(NOW);
    const b = await buildDemoDb(NOW);
    const strip = (db: typeof a) => db.transactions.map(({ id, amount, occurredAt }) => ({ id, amount, occurredAt }));
    expect(strip(a)).toEqual(strip(b));
    expect(a.transactions.length).toBeGreaterThanOrEqual(20);
    expect(a.householdMembers).toHaveLength(3);
    expect(a.recurringPayments.length).toBeGreaterThanOrEqual(3);
    expect(a.savingsGoals).toHaveLength(2);
    // no receipt images anywhere
    expect(JSON.stringify(a)).not.toMatch(/data:image|base64/);
    const snap = buildSnapshot({
      household: a.households[0]!, persona: a.personas[0]!, budget: a.budgets[0]!, transactions: a.transactions, categories: a.categories, income: a.incomeSources,
      recurring: a.recurringPayments, subscriptionUsage: a.subscriptionUsage, savingsAccounts: a.savingsAccounts, savingsGoals: a.savingsGoals, contributions: a.savingsContributions,
      shoppingItems: a.shoppingItems, marketProducts: a.marketProducts, marketHistory: a.marketPriceHistory,
    }, NOW);
    expect(snap.balance).toBeGreaterThan(0);
    expect(snap.subscriptions.find((s) => s.name === "Showmax")?.verdict).toBe("unused");
  }, 30_000);
});
