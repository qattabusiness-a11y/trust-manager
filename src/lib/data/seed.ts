import { addDays, format, parseISO } from "date-fns";
import { CAT, DEFAULT_THRESHOLDS, SYSTEM_CATEGORIES } from "@/constants";
import { DEFAULT_TIMEZONE, localToUtcIso, monthKey, todayLocal } from "@/lib/dates";
import { hashPassword } from "@/lib/crypto";
import type {
  AppNotification,
  HouseholdMember,
  IncomeSource,
  PaymentMethod,
  RecurringPayment,
  SavingsContribution,
  ShoppingItem,
  SubscriptionUsage,
  Transaction,
  UserPersona,
  UserPreferences,
  VisionLedgerEntry,
} from "@/types";
import { emptyDb, type LocalDB } from "./local-store";
import { buildMarketSeed, productId } from "./seed-market";

/**
 * Deterministic demo data for a household of three in Kigali.
 * Every value is fixed; dates are relative to the moment the demo is seeded
 * so the dashboard always shows a "current" month. Same anchor => same data.
 */

export const DEMO_PASSWORD = "demo1234";
export const DEMO_USERS = {
  owner: { id: "00000000-0000-4000-8000-0000000000a1", email: "aline@demo.trustmanager.rw", name: "Aline Uwase" },
  admin: { id: "00000000-0000-4000-8000-0000000000a2", email: "eric@demo.trustmanager.rw", name: "Eric Mugisha" },
  contributor: { id: "00000000-0000-4000-8000-0000000000a3", email: "keza@demo.trustmanager.rw", name: "Keza Ingabire" },
} as const;

export const DEMO_HOUSEHOLD_ID = "00000000-0000-4000-8000-0000000000b1";
const TZ = DEFAULT_TIMEZONE;

const sid = (prefix: string, n: number) => `00000000-0000-4000-8000-${prefix}${String(n).padStart(12 - prefix.length, "0")}`;

export async function buildDemoDb(anchor: Date = new Date()): Promise<LocalDB> {
  const db = emptyDb();
  const ts = anchor.toISOString();
  const today = todayLocal(TZ, anchor);
  const dayStr = (offset: number) => format(addDays(parseISO(today), offset), "yyyy-MM-dd");
  const at = (offset: number, time: string) => localToUtcIso(dayStr(offset), time, TZ);
  const base = { createdAt: ts, updatedAt: ts, deletedAt: null };
  const hid = DEMO_HOUSEHOLD_ID;
  const { owner, admin, contributor } = DEMO_USERS;

  /* ------------------------------------------------------------ People */
  for (const u of [owner, admin, contributor]) {
    const { hash, salt } = await hashPassword(DEMO_PASSWORD);
    db.profiles.push({ ...base, id: u.id, email: u.email, fullName: u.name, passwordHash: hash, passwordSalt: salt, onboardingCompleted: true, defaultHouseholdId: hid });
  }

  db.households.push({
    ...base,
    id: hid,
    name: "Uwase Household",
    ownerId: owner.id,
    currency: "RWF",
    country: "Rwanda",
    timezone: TZ,
    openingBalance: 120_000,
    openingBalanceDate: at(-45, "08:00"),
  });

  const members: HouseholdMember[] = [
    { ...base, id: sid("bb", 1), householdId: hid, userId: owner.id, displayName: owner.name, email: owner.email, role: "owner", permissionOverrides: {}, status: "active" },
    { ...base, id: sid("bb", 2), householdId: hid, userId: admin.id, displayName: admin.name, email: admin.email, role: "admin", permissionOverrides: { view_income: true }, status: "active" },
    {
      ...base,
      id: sid("bb", 3),
      householdId: hid,
      userId: contributor.id,
      displayName: contributor.name,
      email: contributor.email,
      role: "contributor",
      // Can add grocery items and mark them bought, but cannot see transactions or balances.
      permissionOverrides: { view_transactions: false, add_transactions: false },
      status: "active",
    },
  ];
  db.householdMembers.push(...members);

  const personaBase = { ...base, householdId: hid, country: "Rwanda", city: "Kigali", language: "English", currency: "RWF", householdSize: 3, dependents: 1, financialDependents: 1, householdStatus: "Married", managesFinances: "jointly" as const };
  const personas: UserPersona[] = [
    { ...personaBase, id: sid("pe", 1), userId: owner.id, age: 34, occupation: "Accountant", employmentStatus: "employed", monthlyIncome: 650_000, incomeFrequency: "monthly", additionalIncome: 120_000, existingSavings: 750_000, monthlyRent: 200_000, debtObligations: 0, otherRecurringExpenses: 45_000, monthlySavings: 150_000, financialGoals: ["Emergency fund", "Buying land", "Buying equipment"], riskTolerance: "medium", planningApproach: "50-30-20" },
    { ...personaBase, id: sid("pe", 2), userId: admin.id, age: 37, occupation: "Shop owner", employmentStatus: "self-employed", monthlyIncome: 250_000, incomeFrequency: "monthly", additionalIncome: 0, existingSavings: 0, monthlyRent: 0, debtObligations: 0, otherRecurringExpenses: 0, monthlySavings: 50_000, financialGoals: ["Starting a business"], riskTolerance: "medium", planningApproach: "50-30-20" },
    { ...personaBase, id: sid("pe", 3), userId: contributor.id, age: 20, occupation: "University student", employmentStatus: "student", householdStatus: "Lives with relatives", monthlyIncome: 30_000, incomeFrequency: "irregular", additionalIncome: 0, existingSavings: 15_000, monthlyRent: 0, debtObligations: 0, otherRecurringExpenses: 0, monthlySavings: 5_000, financialGoals: ["Education"], riskTolerance: "low", planningApproach: "envelope", dependents: 0, financialDependents: 0 },
  ];
  db.personas.push(...personas);

  const prefs = (userId: string, n: number): UserPreferences => ({ ...base, id: sid("pf", n), userId, roundingIncrement: 500, autoSweep: false, emailNotifications: true, pushNotifications: false, defaultReminderDays: [7, 3, 1], hideBalances: false });
  db.preferences.push(prefs(owner.id, 1), prefs(admin.id, 2), prefs(contributor.id, 3));

  /* ------------------------------------------------------- Categories */
  db.categories.push(...SYSTEM_CATEGORIES.map((c) => ({ ...c, createdAt: ts, updatedAt: ts })));

  /* ----------------------------------------------------------- Income */
  const income: IncomeSource[] = [
    { ...base, id: sid("in", 1), householdId: hid, name: "Salary — Aline", amount: 650_000, category: "salary", frequency: "monthly", expectedDate: dayStr(-16), recurring: true, savingsAllocation: 80_000, notes: "Paid by bank transfer", ownerUserId: owner.id },
    { ...base, id: sid("in", 2), householdId: hid, name: "Shop income — Eric", amount: 250_000, category: "business", frequency: "monthly", expectedDate: dayStr(-5), recurring: true, savingsAllocation: 20_000, notes: "Net profit drawn monthly", ownerUserId: admin.id },
    { ...base, id: sid("in", 3), householdId: hid, name: "Freelance bookkeeping", amount: 120_000, category: "freelance", frequency: "irregular", expectedDate: dayStr(-22), recurring: false, savingsAllocation: 0, notes: "Varies month to month", ownerUserId: owner.id },
  ];
  db.incomeSources.push(...income);

  /* ----------------------------------------------------------- Budget */
  db.budgets.push({
    ...base,
    id: sid("bu", 1),
    householdId: hid,
    month: monthKey(TZ, anchor),
    monthlyBudget: 600_000,
    savingsTarget: 150_000,
    essentialAllocation: 470_000,
    flexibleAllocation: 130_000,
    customDailyLimit: null,
    customWeeklyLimit: null,
    thresholds: DEFAULT_THRESHOLDS,
  });

  /* ----------------------------------------------------- Transactions */
  type T = [offset: number, time: string, title: string, amount: number, cat: string, merchant: string, method: PaymentMethod, essential: boolean, planned: boolean, source?: Transaction["source"], type?: Transaction["type"]];
  const rows: T[] = [
    [-38, "17:20", "Monthly groceries", 44_000, CAT.groceries, "Simba Supermarket", "card", true, true],
    [-35, "08:10", "Moto rides", 5_000, CAT.transport, "Yego Moto", "momo", true, true],
    [-33, "19:30", "Dinner out", 9_000, CAT.dining, "Repub Lounge", "momo", false, true],
    [-30, "16:45", "Groceries top-up", 41_000, CAT.groceries, "Simba Supermarket", "card", true, true],
    [-28, "10:00", "Home internet", 25_000, CAT.communication, "Canal+ Box", "momo", true, true, "recurring"],
    [-25, "11:15", "Groceries", 39_000, CAT.groceries, "Kimironko Market", "cash", true, true],
    [-22, "09:00", "Freelance bookkeeping payment", 120_000, CAT.freelance, "Ikaze Traders Ltd", "momo", true, true, "manual", "income"],
    [-16, "09:30", "Salary", 650_000, CAT.salary, "Employer — Isange Accounting", "bank", true, true, "manual", "income"],
    [-16, "09:45", "Transfer to emergency fund", 80_000, CAT.savings, "Emergency fund", "bank", true, true, "manual", "savings_transfer"],
    [-15, "10:00", "House rent", 200_000, CAT.rent, "Landlord — Mr. Habimana", "bank", true, true, "recurring"],
    [-14, "17:40", "Weekly groceries", 48_500, CAT.groceries, "Simba Supermarket", "card", true, true],
    [-13, "08:20", "Electricity tokens", 15_000, CAT.utilities, "REG Cash Power", "momo", true, true],
    [-12, "07:50", "Moto to work", 3_500, CAT.transport, "Yego Moto", "momo", true, true],
    [-11, "12:10", "Vegetables & fruit", 12_800, CAT.groceries, "Kimironko Market", "cash", true, true],
    [-10, "15:00", "School supplies", 18_000, CAT.education, "Librairie Caritas", "momo", true, true],
    [-9, "10:30", "Pharmacy", 9_500, CAT.health, "Pharmacie Conseil", "momo", true, false],
    [-9, "20:00", "Dinner with friends", 14_000, CAT.dining, "Brioche Café", "momo", false, true],
    [-8, "09:00", "Mobile data bundle", 10_000, CAT.communication, "MTN Rwanda", "momo", true, true],
    [-8, "21:00", "Showmax subscription", 7_500, CAT.subscriptions, "Showmax", "card", false, true, "recurring"],
    [-7, "18:10", "Weekly groceries", 36_200, CAT.groceries, "Simba Supermarket", "card", true, true],
    [-6, "11:00", "Vegetables", 15_400, CAT.groceries, "Kimironko Market", "cash", true, true],
    [-6, "16:30", "New shoes", 35_000, CAT.clothing, "Kigali Heights Boutique", "card", false, false],
    [-5, "09:00", "Shop income", 250_000, CAT.business, "Mugisha General Store", "momo", true, true, "manual", "income"],
    [-5, "09:20", "Water bill", 8_200, CAT.utilities, "WASAC", "momo", true, true, "recurring"],
    [-5, "13:00", "Fuel for generator", 6_000, CAT.transport, "SP Station Remera", "cash", true, true],
    [-4, "19:45", "Restaurant", 18_500, CAT.dining, "Khana Khazana", "momo", false, false],
    [-3, "17:30", "Weekly groceries", 42_300, CAT.groceries, "Simba Supermarket", "card", true, true],
    [-3, "14:00", "Wedding contribution", 20_000, CAT.gifts, "Family — Ubukwe", "momo", false, true],
    [-2, "20:30", "Cinema", 12_000, CAT.entertainment, "Century Cinema", "momo", false, false],
    [-2, "08:00", "Moto rides", 4_000, CAT.transport, "Yego Moto", "momo", true, true],
    [-1, "12:30", "Market vegetables", 11_600, CAT.groceries, "Kimironko Market", "cash", true, true],
    [-1, "16:00", "Coffee & snacks", 6_500, CAT.dining, "Question Coffee", "momo", false, false],
    [0, "07:30", "Bread & milk", 5_800, CAT.groceries, "Simba Supermarket", "momo", true, true, "shopping_list"],
    [0, "08:05", "Moto to office", 2_000, CAT.transport, "Yego Moto", "momo", true, true],
  ];
  const txIds: string[] = [];
  rows.forEach(([offset, time, title, amount, categoryId, merchant, paymentMethod, essential, planned, source = "manual", type = "expense"], i) => {
    const id = sid("tx", i + 1);
    txIds.push(id);
    const createdBy = merchant.startsWith("Mugisha") || title === "Fuel for generator" ? admin.id : owner.id;
    db.transactions.push({
      ...base,
      id,
      householdId: hid,
      type,
      title,
      amount,
      currency: "RWF",
      occurredAt: at(offset, time),
      categoryId,
      merchant,
      paymentMethod,
      essential,
      planned,
      notes: "",
      source,
      reference: paymentMethod === "momo" ? `MP${String(2_410_000 + i * 137).padStart(9, "0")}` : null,
      recordedBalance: null,
      shoppingItemId: null,
      savingsGoalId: type === "savings_transfer" ? sid("sg", 1) : null,
      behaviorOverride: null,
      createdBy,
    });
  });
  // The wedding contribution was a family obligation — the owner marked it healthy.
  const wedding = db.transactions.find((t) => t.title === "Wedding contribution")!;
  wedding.behaviorOverride = "green";

  /* ---------------------------------------------------------- Savings */
  db.savingsAccounts.push(
    { ...base, id: sid("sa", 1), householdId: hid, name: "Emergency fund (bank savings)", kind: "emergency", openingBalance: 300_000 },
    { ...base, id: sid("sa", 2), householdId: hid, name: "Laptop fund", kind: "goal", openingBalance: 450_000 },
    { ...base, id: sid("sa", 3), householdId: hid, name: "Spare change jar", kind: "micro", openingBalance: 0 },
  );
  db.savingsGoals.push(
    { ...base, id: sid("sg", 1), householdId: hid, name: "Emergency fund — 3 months of essentials", targetAmount: 1_200_000, targetDate: dayStr(240), accountId: sid("sa", 1), priority: "high", status: "active", visionEntryId: null },
    { ...base, id: sid("sg", 2), householdId: hid, name: "Purchase a laptop", targetAmount: 1_500_000, targetDate: dayStr(150), accountId: sid("sa", 2), priority: "medium", status: "active", visionEntryId: sid("vl", 3) },
  );
  const contributions: SavingsContribution[] = [
    { ...base, id: sid("sc", 1), householdId: hid, goalId: sid("sg", 1), accountId: sid("sa", 1), amount: 80_000, source: "income_allocation", simulated: true, transactionId: sid("tx", 9), note: "From salary", contributedAt: at(-16, "09:45") },
    { ...base, id: sid("sc", 2), householdId: hid, goalId: null, accountId: sid("sa", 3), amount: 500, source: "micro_sweep", simulated: true, transactionId: sid("tx", 11), note: "Round-up", contributedAt: at(-14, "18:00") },
    { ...base, id: sid("sc", 3), householdId: hid, goalId: null, accountId: sid("sa", 3), amount: 200, source: "micro_sweep", simulated: true, transactionId: sid("tx", 14), note: "Round-up", contributedAt: at(-11, "13:00") },
    { ...base, id: sid("sc", 4), householdId: hid, goalId: null, accountId: sid("sa", 3), amount: 300, source: "micro_sweep", simulated: true, transactionId: sid("tx", 20), note: "Round-up", contributedAt: at(-7, "18:30") },
  ];
  db.savingsContributions.push(...contributions);

  /* ---------------------------------------------------------- Market */
  const market = buildMarketSeed(anchor);
  db.marketProducts.push(...market.products);
  db.marketPriceHistory.push(...market.history);
  const pid = (slug: string) => market.products.find((p) => p.slug === slug)?.id ?? productId(0);

  /* -------------------------------------------------------- Shopping */
  db.shoppingLists.push({ ...base, id: sid("sl", 1), householdId: hid, name: "Household essentials" });
  const item = (n: number, p: Partial<ShoppingItem> & Pick<ShoppingItem, "productName" | "category" | "quantity" | "unit" | "estimatedUnitPrice">): ShoppingItem => ({
    ...base,
    id: sid("si", n),
    householdId: hid,
    listId: sid("sl", 1),
    marketProductId: null,
    priority: "medium",
    expectedDate: dayStr(2),
    notes: "",
    status: "needed",
    actualCost: null,
    purchasedAt: null,
    merchant: null,
    transactionId: null,
    addedBy: owner.id,
    ...p,
  });
  db.shoppingItems.push(
    item(1, { productName: "Rice", marketProductId: pid("rice"), category: "Grains", quantity: 10, unit: "kg", estimatedUnitPrice: 1_500, priority: "high", expectedDate: dayStr(3) }),
    item(2, { productName: "Beans", marketProductId: pid("beans"), category: "Grains", quantity: 5, unit: "kg", estimatedUnitPrice: 950, priority: "high", expectedDate: dayStr(3) }),
    item(3, { productName: "Cooking oil", marketProductId: pid("cooking-oil"), category: "Cooking oil", quantity: 3, unit: "litre", estimatedUnitPrice: 3_100, priority: "medium", expectedDate: dayStr(5) }),
    item(4, { productName: "Tomatoes", marketProductId: pid("tomatoes"), category: "Vegetables", quantity: 3, unit: "kg", estimatedUnitPrice: 900, priority: "medium", expectedDate: dayStr(1), addedBy: contributor.id }),
    item(5, { productName: "Bar soap", marketProductId: pid("soap"), category: "Cleaning products", quantity: 4, unit: "bar", estimatedUnitPrice: 800, priority: "low", expectedDate: dayStr(6), addedBy: contributor.id }),
    item(6, { productName: "Sugar", marketProductId: pid("sugar"), category: "Food", quantity: 2, unit: "kg", estimatedUnitPrice: 1_700, priority: "low", expectedDate: dayStr(6) }),
    item(7, { productName: "Fresh milk", marketProductId: pid("milk"), category: "Food", quantity: 5, unit: "litre", estimatedUnitPrice: 650, status: "bought", actualCost: 3_000, purchasedAt: at(0, "07:30"), merchant: "Simba Supermarket", transactionId: sid("tx", 33), expectedDate: dayStr(0) }),
    item(8, { productName: "Irish potatoes", marketProductId: pid("irish-potatoes"), category: "Vegetables", quantity: 10, unit: "kg", estimatedUnitPrice: 650, status: "bought", actualCost: 7_200, purchasedAt: at(-1, "12:30"), merchant: "Kimironko Market", transactionId: sid("tx", 31), expectedDate: dayStr(-1), addedBy: contributor.id }),
  );
  db.transactions.find((t) => t.id === sid("tx", 33))!.shoppingItemId = sid("si", 7);
  db.transactions.find((t) => t.id === sid("tx", 31))!.shoppingItemId = sid("si", 8);

  /* ---------------------------------------- Bills & subscriptions */
  const bill = (n: number, p: Omit<RecurringPayment, "id" | "householdId" | "createdAt" | "updatedAt" | "deletedAt">): RecurringPayment => ({ ...base, id: sid("rp", n), householdId: hid, ...p });
  db.recurringPayments.push(
    bill(1, { name: "House rent", amount: 200_000, category: "Rent & Housing", kind: "bill", frequency: "monthly", nextDueDate: dayStr(15), reminderDays: [7, 3, 1], status: "active", essential: true }),
    bill(2, { name: "Home internet (Canal+ Box)", amount: 25_000, category: "Airtime & Internet", kind: "bill", frequency: "monthly", nextDueDate: dayStr(2), reminderDays: [7, 3, 1], status: "active", essential: true }),
    bill(3, { name: "Water (WASAC)", amount: 8_200, category: "Utilities", kind: "bill", frequency: "monthly", nextDueDate: dayStr(25), reminderDays: [3, 1], status: "active", essential: true }),
    bill(4, { name: "School fees — Term 1", amount: 150_000, category: "Education", kind: "bill", frequency: "quarterly", nextDueDate: dayStr(7), reminderDays: [7, 3, 1], status: "active", essential: true }),
    bill(5, { name: "Showmax", amount: 7_500, category: "Subscriptions", kind: "subscription", frequency: "monthly", nextDueDate: dayStr(22), renewalDate: dayStr(22), reminderDays: [3], status: "active", essential: false }),
    bill(6, { name: "Gym membership", amount: 20_000, category: "Subscriptions", kind: "subscription", frequency: "monthly", nextDueDate: dayStr(12), renewalDate: dayStr(12), reminderDays: [3, 1], status: "active", essential: false }),
  );
  const usage: SubscriptionUsage[] = [
    { ...base, id: sid("su", 1), householdId: hid, recurringPaymentId: sid("rp", 5), usedOn: dayStr(-41), note: "Watched a series" },
    ...[-2, -5, -9, -12, -16, -19, -23, -27].map((o, i) => ({ ...base, id: sid("su", i + 2), householdId: hid, recurringPaymentId: sid("rp", 6), usedOn: dayStr(o), note: "Gym session" })),
  ];
  db.subscriptionUsage.push(...usage);

  /* ------------------------------------------------------ Vision */
  const vision: VisionLedgerEntry[] = [
    { ...base, id: sid("vl", 1), householdId: hid, title: "Open a tailoring workshop", description: "Two sewing machines and a small space in Kicukiro for school uniforms.", category: "business", targetAmount: 3_000_000, targetDate: dayStr(540), priority: "medium", progress: 10, status: "planning", goalId: null, createdBy: owner.id },
    { ...base, id: sid("vl", 2), householdId: hid, title: "Buy a plot in Bugesera", description: "A residential plot for building a family home in the long term.", category: "long_term", targetAmount: 8_000_000, targetDate: dayStr(1460), priority: "high", progress: 0, status: "idea", goalId: null, createdBy: owner.id },
    { ...base, id: sid("vl", 3), householdId: hid, title: "Purchase a laptop", description: "Laptop for freelance bookkeeping work.", category: "purchase", targetAmount: 1_500_000, targetDate: dayStr(150), priority: "medium", progress: 30, status: "in_progress", goalId: sid("sg", 2), createdBy: owner.id },
    { ...base, id: sid("vl", 4), householdId: hid, title: "Learn about treasury bonds", description: "Understand how Rwandan government bonds work before investing anything.", category: "investment_learning", targetAmount: 0, targetDate: dayStr(90), priority: "low", progress: 20, status: "in_progress", goalId: null, createdBy: owner.id },
  ];
  db.visionEntries.push(...vision);

  /* ---------------------------------------------------- Notifications */
  const note = (n: number, p: Omit<AppNotification, "id" | "householdId" | "createdAt" | "updatedAt" | "deletedAt" | "channel" | "deliveryStatus">, hoursAgo: number): AppNotification => ({
    ...base,
    createdAt: new Date(anchor.getTime() - hoursAgo * 3_600_000).toISOString(),
    id: sid("nt", n),
    householdId: hid,
    channel: "in_app",
    deliveryStatus: "delivered",
    ...p,
  });
  db.notifications.push(
    note(1, { userId: null, title: "Rice is cheaper this week", body: "Rice prices in the demo market index dropped below their 30-day average. Check the bulk-buy suggestion before your next shop.", severity: "info", actionHref: "/market", dedupeKey: "seed:rice", readAt: null }, 20),
    note(2, { userId: owner.id, title: "Unplanned spending is adding up", body: "You recorded 4 unplanned non-essential purchases in the last 7 days.", severity: "caution", actionHref: "/transactions?behavior=red", dedupeKey: "seed:unplanned", readAt: null }, 6),
    note(3, { userId: owner.id, title: "Showmax looks unused", body: "No usage recorded in the last 30 days. Review whether you still need it.", severity: "caution", actionHref: "/bills", dedupeKey: "seed:showmax", readAt: null }, 30),
    note(4, { userId: owner.id, title: "Salary allocated to savings", body: "RWF 80,000 moved to your emergency fund (recorded in Trust Manager).", severity: "success", actionHref: "/savings", dedupeKey: "seed:salary", readAt: ts }, 380),
  );

  /* ---------------------------------------------------------- Audit */
  db.auditLogs.push({ ...base, id: sid("al", 1), householdId: hid, actorId: owner.id, action: "create", entity: "households", entityId: hid, changes: null, note: "Demo household created" });

  db.__seededAt = ts;
  return db;
}
