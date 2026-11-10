/**
 * Trust Manager domain types.
 *
 * Money convention: every monetary amount is an INTEGER in the currency's
 * minor unit (RWF has no minor unit, so 1 = RWF 1; USD 1.50 = 150).
 * Never store money as a floating-point value.
 *
 * Time convention: every timestamp is an ISO-8601 string in UTC.
 * Calendar dates (no time) are "yyyy-MM-dd" in the household timezone.
 */

export type ID = string;
export type ISODateTime = string;
export type ISODate = string;

export interface BaseRecord {
  id: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  deletedAt?: ISODateTime | null;
}

export interface HouseholdScoped extends BaseRecord {
  householdId: ID;
}

/* ---------------------------------------------------------------- Users */

export interface Profile extends BaseRecord {
  email: string;
  fullName: string;
  /** PBKDF2 hash in dev mode only. Supabase Auth owns passwords in production. */
  passwordHash?: string;
  passwordSalt?: string;
  onboardingCompleted: boolean;
  defaultHouseholdId?: ID | null;
}

export type EmploymentStatus = "student" | "employed" | "self-employed" | "unemployed";
export type RiskTolerance = "low" | "medium" | "high";
export type IncomeFrequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly" | "irregular" | "once";

export interface UserPersona extends HouseholdScoped {
  userId: ID;
  age: number;
  country: string;
  city: string;
  language: string;
  currency: string;
  occupation: string;
  employmentStatus: EmploymentStatus;
  householdSize: number;
  dependents: number;
  financialDependents: number;
  householdStatus: string;
  managesFinances: "alone" | "jointly";
  monthlyIncome: number;
  incomeFrequency: IncomeFrequency;
  additionalIncome: number;
  existingSavings: number;
  monthlyRent: number;
  debtObligations: number;
  otherRecurringExpenses: number;
  monthlySavings: number;
  financialGoals: string[];
  riskTolerance: RiskTolerance;
  planningApproach: "50-30-20" | "zero-based" | "envelope" | "custom";
}

/* ----------------------------------------------------------- Household */

export interface Household extends BaseRecord {
  name: string;
  ownerId: ID;
  currency: string;
  country: string;
  timezone: string;
  /** Cash on hand + MoMo + bank at the moment tracking started. */
  openingBalance: number;
  openingBalanceDate: ISODateTime;
}

export type HouseholdRole = "owner" | "admin" | "contributor" | "viewer";

export const PERMISSIONS = [
  "view_shopping",
  "edit_shopping",
  "mark_purchased",
  "view_budget",
  "manage_budget",
  "view_transactions",
  "add_transactions",
  "edit_transactions",
  "view_income",
  "manage_income",
  "view_balances",
  "manage_recurring",
  "manage_savings",
  "manage_members",
  "manage_settings",
  "view_advisor",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface HouseholdMember extends HouseholdScoped {
  userId: ID;
  displayName: string;
  email: string;
  role: HouseholdRole;
  /** Explicit grants/revocations layered over the role defaults. */
  permissionOverrides: Partial<Record<Permission, boolean>>;
  status: "active" | "removed";
}

export interface HouseholdInvitation extends HouseholdScoped {
  email: string;
  role: HouseholdRole;
  /** SHA-256 hash of the token. The raw token is shown once and never stored. */
  tokenHash: string;
  expiresAt: ISODateTime;
  invitedBy: ID;
  status: "pending" | "accepted" | "revoked" | "expired";
  acceptedBy?: ID | null;
}

/* -------------------------------------------------------------- Income */

export type IncomeCategory = "salary" | "freelance" | "business" | "allowance" | "family_support" | "other";

export interface IncomeSource extends HouseholdScoped {
  name: string;
  amount: number;
  category: IncomeCategory;
  frequency: IncomeFrequency;
  expectedDate: ISODate;
  recurring: boolean;
  savingsAllocation: number;
  notes?: string;
  ownerUserId: ID;
}

/* -------------------------------------------------------------- Budget */

export interface Budget extends HouseholdScoped {
  /** "yyyy-MM" */
  month: string;
  monthlyBudget: number;
  savingsTarget: number;
  essentialAllocation: number;
  flexibleAllocation: number;
  customDailyLimit?: number | null;
  customWeeklyLimit?: number | null;
  thresholds: StatusThresholds;
}

export interface StatusThresholds {
  caution: number;
  warning: number;
  critical: number;
}

export interface BudgetAllocation extends HouseholdScoped {
  budgetId: ID;
  categoryId: ID;
  amount: number;
}

/* -------------------------------------------------------- Transactions */

export type TransactionType = "expense" | "income" | "savings_transfer" | "savings_withdrawal";
export type PaymentMethod = "momo" | "bank" | "cash" | "card" | "other";
export type Behavior = "green" | "yellow" | "red";

export interface TransactionCategory extends BaseRecord {
  householdId: ID | null;
  name: string;
  kind: "expense" | "income";
  essential: boolean;
  icon: string;
}

export interface Transaction extends HouseholdScoped {
  type: TransactionType;
  title: string;
  amount: number;
  currency: string;
  occurredAt: ISODateTime;
  categoryId: ID;
  merchant: string;
  paymentMethod: PaymentMethod;
  essential: boolean;
  planned: boolean;
  notes?: string;
  source: "manual" | "receipt_ocr" | "shopping_list" | "recurring" | "micro_savings";
  reference?: string | null;
  recordedBalance?: number | null;
  shoppingItemId?: ID | null;
  savingsGoalId?: ID | null;
  /** User correction of the behavioral classification. */
  behaviorOverride?: Behavior | null;
  createdBy: ID;
}

/* ------------------------------------------------------------- Savings */

export interface SavingsAccount extends HouseholdScoped {
  name: string;
  kind: "emergency" | "goal" | "general" | "micro";
  openingBalance: number;
}

export interface SavingsGoal extends HouseholdScoped {
  name: string;
  targetAmount: number;
  targetDate: ISODate | null;
  accountId: ID;
  priority: "low" | "medium" | "high";
  status: "active" | "achieved" | "paused";
  visionEntryId?: ID | null;
}

export interface SavingsContribution extends HouseholdScoped {
  goalId: ID | null;
  accountId: ID;
  amount: number;
  /** Positive = deposit; withdrawals use negative amounts. */
  source: "manual" | "micro_sweep" | "income_allocation";
  simulated: boolean;
  transactionId?: ID | null;
  note?: string;
  contributedAt: ISODateTime;
}

/* ------------------------------------------------------------ Shopping */

export interface ShoppingList extends HouseholdScoped {
  name: string;
}

export type Priority = "low" | "medium" | "high";

export interface ShoppingItem extends HouseholdScoped {
  listId: ID;
  productName: string;
  marketProductId?: ID | null;
  category: string;
  quantity: number;
  unit: string;
  estimatedUnitPrice: number;
  priority: Priority;
  expectedDate: ISODate | null;
  notes?: string;
  status: "needed" | "bought";
  actualCost?: number | null;
  purchasedAt?: ISODateTime | null;
  merchant?: string | null;
  transactionId?: ID | null;
  addedBy: ID;
}

/* -------------------------------------------------------------- Market */

export interface MarketProduct extends BaseRecord {
  /** null = shared catalogue item; otherwise a product added by this household. */
  householdId?: ID | null;
  slug: string;
  name: string;
  category: string;
  unit: string;
  perishable: boolean;
  shelfLifeDays: number;
}

export interface MarketPrice {
  id: ID;
  productId: ID;
  productName: string;
  category: string;
  marketName: string;
  location: string;
  unit: string;
  currentPrice: number;
  previousPrice: number;
  currency: string;
  recordedAt: ISODateTime;
  source: string;
  /** True when this price was recorded by the household (real), false for the demo index. */
  verified?: boolean;
}

export interface MarketPricePoint {
  id: ID;
  /** null = shared index; otherwise a price recorded by this household. */
  householdId?: ID | null;
  recordedBy?: ID | null;
  note?: string | null;
  deletedAt?: ISODateTime | null;
  productId: ID;
  marketName: string;
  location: string;
  price: number;
  currency: string;
  recordedAt: ISODateTime;
  source: string;
}

export interface MarketComparison {
  productId: ID;
  productName: string;
  unit: string;
  average: number;
  lowest: { price: number; marketName: string; location: string };
  highest: { price: number; marketName: string; location: string };
  thirtyDayAverage: number;
  changePct: number;
  source: string;
  recordedAt: ISODateTime;
  /** True when based only on prices recorded by the household. */
  verified: boolean;
  priceCount: number;
}

/* ---------------------------------------------- Bills & subscriptions */

export type RecurringFrequency = "weekly" | "monthly" | "quarterly" | "yearly";

export interface RecurringPayment extends HouseholdScoped {
  name: string;
  amount: number;
  category: string;
  kind: "bill" | "subscription" | "loan";
  frequency: RecurringFrequency;
  nextDueDate: ISODate;
  renewalDate?: ISODate | null;
  endDate?: ISODate | null;
  reminderDays: number[];
  status: "active" | "paused" | "cancelled";
  essential: boolean;
}

export interface SubscriptionUsage extends HouseholdScoped {
  recurringPaymentId: ID;
  usedOn: ISODate;
  note?: string;
}

/* -------------------------------------------------------- Notifications */

export type Severity = "info" | "success" | "caution" | "warning" | "critical";

export interface AppNotification extends HouseholdScoped {
  userId: ID | null;
  title: string;
  body: string;
  severity: Severity;
  channel: "in_app" | "email" | "push";
  deliveryStatus: "delivered" | "simulated" | "failed";
  actionHref?: string | null;
  dedupeKey?: string | null;
  readAt?: ISODateTime | null;
}

/* ----------------------------------------------------------- Vision */

export interface VisionLedgerEntry extends HouseholdScoped {
  title: string;
  description: string;
  category: "dream" | "business" | "long_term" | "purchase" | "milestone" | "investment_learning";
  targetAmount: number;
  targetDate: ISODate | null;
  priority: Priority;
  progress: number;
  status: "idea" | "planning" | "in_progress" | "achieved" | "archived";
  goalId?: ID | null;
  createdBy: ID;
}

/* ----------------------------------------------------------- Advisor */

export interface AdvisoryReport extends HouseholdScoped {
  kind: "weekly" | "monthly";
  periodLabel: string;
  generatedBy: string;
  content: AdvisorResponse;
}

export interface UserPreferences extends BaseRecord {
  userId: ID;
  roundingIncrement: number;
  autoSweep: boolean;
  /** Auto-sweep only applies to transactions recorded after this moment. */
  autoSweepSince?: ISODateTime | null;
  emailNotifications: boolean;
  pushNotifications: boolean;
  defaultReminderDays: number[];
  hideBalances: boolean;
}

export interface AuditLog extends BaseRecord {
  householdId: ID | null;
  actorId: ID | null;
  action: "create" | "update" | "delete" | "restore" | "login" | "permission_change" | "export" | "invite";
  entity: string;
  entityId: ID | null;
  /** Field-level diff. Never contains images or credentials. */
  changes?: Record<string, { from: unknown; to: unknown }> | null;
  note?: string;
}

/* -------------------------------------------------------- Advisor I/O */

export interface AdvisorInsight {
  id: string;
  kind: "spending" | "budget" | "savings" | "optimization" | "market" | "subscription" | "goal" | "education" | "risk";
  severity: Severity;
  title: string;
  message: string;
  /** Facts drawn directly from records. */
  facts: string[];
  /** Projections, clearly labeled as estimates. */
  estimates: string[];
  action?: { label: string; href: string };
}

export interface AdvisorResponse {
  generatedAt: ISODateTime;
  provider: string;
  summary: string;
  insights: AdvisorInsight[];
  disclaimer: string;
}

/* ------------------------------------------------------------- OCR */

export interface ReceiptExtraction {
  amount: number | null;
  remainingBalance: number | null;
  merchant: string | null;
  transactionDate: string | null;
  transactionReference: string | null;
  paymentMethod: string | null;
  confidence: number;
  /** Calendar date / wall-clock time exactly as printed on the receipt. */
  localDate?: string | null;
  localTime?: string | null;
  direction?: "expense" | "income";
  fee?: number | null;
}

export interface ReceiptProcessingResult {
  extraction: ReceiptExtraction;
  cleanup: { deleted: boolean; verified: boolean };
  processor: string;
}
