import type {
  AdvisoryReport,
  AppNotification,
  AuditLog,
  Budget,
  BudgetAllocation,
  Household,
  HouseholdInvitation,
  HouseholdMember,
  IncomeSource,
  MarketPricePoint,
  MarketProduct,
  Permission,
  Profile,
  RecurringPayment,
  SavingsAccount,
  SavingsContribution,
  SavingsGoal,
  ShoppingItem,
  ShoppingList,
  SubscriptionUsage,
  Transaction,
  TransactionCategory,
  UserPersona,
  UserPreferences,
  VisionLedgerEntry,
} from "@/types";

export interface CollectionMap {
  profiles: Profile;
  households: Household;
  householdMembers: HouseholdMember;
  invitations: HouseholdInvitation;
  personas: UserPersona;
  incomeSources: IncomeSource;
  budgets: Budget;
  budgetAllocations: BudgetAllocation;
  transactions: Transaction;
  categories: TransactionCategory;
  savingsAccounts: SavingsAccount;
  savingsGoals: SavingsGoal;
  savingsContributions: SavingsContribution;
  shoppingLists: ShoppingList;
  shoppingItems: ShoppingItem;
  marketProducts: MarketProduct;
  marketPriceHistory: MarketPricePoint;
  recurringPayments: RecurringPayment;
  subscriptionUsage: SubscriptionUsage;
  notifications: AppNotification;
  visionEntries: VisionLedgerEntry;
  advisoryReports: AdvisoryReport;
  preferences: UserPreferences;
  auditLogs: AuditLog;
}

export type CollectionKey = keyof CollectionMap;
export type Row<K extends CollectionKey> = CollectionMap[K];

/** Supabase table for each collection. */
export const TABLES: Record<CollectionKey, string> = {
  profiles: "profiles",
  households: "households",
  householdMembers: "household_members",
  invitations: "household_invitations",
  personas: "user_personas",
  incomeSources: "income_sources",
  budgets: "budgets",
  budgetAllocations: "budget_allocations",
  transactions: "transactions",
  categories: "transaction_categories",
  savingsAccounts: "savings_accounts",
  savingsGoals: "savings_goals",
  savingsContributions: "savings_contributions",
  shoppingLists: "shopping_lists",
  shoppingItems: "shopping_items",
  marketProducts: "market_products",
  marketPriceHistory: "market_price_history",
  recurringPayments: "recurring_payments",
  subscriptionUsage: "subscription_usage",
  notifications: "notifications",
  visionEntries: "vision_ledger_entries",
  advisoryReports: "financial_advisory_reports",
  preferences: "user_preferences",
  auditLogs: "audit_logs",
};

/**
 * "shared" = reference rows everyone can read (householdId null) plus rows a
 * household added for itself (householdId set), which only it can see or change.
 */
type Scope = "household" | "user" | "public" | "shared" | "special";

export interface CollectionPolicy {
  scope: Scope;
  read?: Permission;
  create?: Permission;
  update?: Permission;
  remove?: Permission;
  /** Write an audit entry for every change. */
  audited?: boolean;
  /** Soft delete instead of removing the row. */
  soft?: boolean;
}

/**
 * Client-side mirror of the database RLS policies (supabase/migrations).
 * In local mode this is the enforcement layer; with Supabase, RLS enforces
 * the same rules in the database and this layer gives early, friendly errors.
 */
export const POLICIES: Record<CollectionKey, CollectionPolicy> = {
  profiles: { scope: "special" },
  households: { scope: "special", update: "manage_settings", audited: true },
  householdMembers: { scope: "household", create: "manage_members", update: "manage_members", remove: "manage_members", audited: true, soft: true },
  invitations: { scope: "household", read: "manage_members", create: "manage_members", update: "manage_members", remove: "manage_members", audited: true },
  personas: { scope: "user" },
  incomeSources: { scope: "household", read: "view_income", create: "manage_income", update: "manage_income", remove: "manage_income", audited: true, soft: true },
  budgets: { scope: "household", read: "view_budget", create: "manage_budget", update: "manage_budget", remove: "manage_budget", audited: true },
  budgetAllocations: { scope: "household", read: "view_budget", create: "manage_budget", update: "manage_budget", remove: "manage_budget", audited: true },
  transactions: { scope: "household", read: "view_transactions", create: "add_transactions", update: "edit_transactions", remove: "edit_transactions", audited: true, soft: true },
  categories: { scope: "public" },
  savingsAccounts: { scope: "household", read: "view_balances", create: "manage_savings", update: "manage_savings", remove: "manage_savings", audited: true, soft: true },
  savingsGoals: { scope: "household", read: "view_balances", create: "manage_savings", update: "manage_savings", remove: "manage_savings", audited: true, soft: true },
  savingsContributions: { scope: "household", read: "view_balances", create: "manage_savings", update: "manage_savings", remove: "manage_savings", audited: true, soft: true },
  shoppingLists: { scope: "household", read: "view_shopping", create: "edit_shopping", update: "edit_shopping", remove: "edit_shopping", soft: true },
  shoppingItems: { scope: "household", read: "view_shopping", create: "edit_shopping", update: "edit_shopping", remove: "edit_shopping", audited: true, soft: true },
  marketProducts: { scope: "shared", create: "edit_shopping", update: "edit_shopping", remove: "edit_shopping" },
  marketPriceHistory: { scope: "shared", create: "edit_shopping", update: "edit_shopping", remove: "edit_shopping" },
  recurringPayments: { scope: "household", read: "view_budget", create: "manage_recurring", update: "manage_recurring", remove: "manage_recurring", audited: true, soft: true },
  subscriptionUsage: { scope: "household", read: "view_budget", create: "manage_recurring", update: "manage_recurring", remove: "manage_recurring" },
  notifications: { scope: "household" },
  visionEntries: { scope: "household", read: "view_budget", create: "manage_savings", update: "manage_savings", remove: "manage_savings", soft: true },
  advisoryReports: { scope: "household", read: "view_advisor", create: "view_advisor" },
  preferences: { scope: "user" },
  auditLogs: { scope: "household", read: "manage_members" },
};
