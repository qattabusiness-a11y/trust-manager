import type { HouseholdRole, Permission, StatusThresholds, TransactionCategory } from "@/types";

export const APP_NAME = "Trust Manager";

export const DEFAULT_THRESHOLDS: StatusThresholds = { caution: 70, warning: 85, critical: 100 };

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"] as const;

/** Source label of the simulated price index used only in development mode. */
export const DEMO_MARKET_SOURCE = "Trust Manager demo index (simulated)";

export const DEMO_DATA_LABEL = "DEMO DATA — Not verified live market prices.";

/** Months of essential spending to keep untouched as an emergency reserve. */
export const EMERGENCY_RESERVE_DAYS = 14;

export const ROLE_LABELS: Record<HouseholdRole, string> = {
  owner: "Owner",
  admin: "Administrator",
  contributor: "Contributor",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<HouseholdRole, string> = {
  owner: "Full access, manages members and permissions.",
  admin: "Manages shared expenses, shopping and household settings.",
  contributor: "Adds transactions and keeps shopping lists up to date.",
  viewer: "Can only view what the owner allows. Cannot edit records.",
};

export const ROLE_PERMISSIONS: Record<HouseholdRole, Permission[]> = {
  owner: [
    "view_shopping", "edit_shopping", "mark_purchased", "view_budget", "manage_budget",
    "view_transactions", "add_transactions", "edit_transactions", "view_income", "manage_income",
    "view_balances", "manage_recurring", "manage_savings", "manage_members", "manage_settings", "view_advisor",
  ],
  admin: [
    "view_shopping", "edit_shopping", "mark_purchased", "view_budget", "view_transactions",
    "add_transactions", "edit_transactions", "manage_recurring", "manage_settings", "view_advisor",
  ],
  contributor: ["view_shopping", "edit_shopping", "mark_purchased", "view_transactions", "add_transactions"],
  viewer: ["view_shopping", "view_budget"],
};

/** Permissions that can never be granted to a viewer (they cannot modify records). */
export const WRITE_PERMISSIONS: Permission[] = [
  "edit_shopping", "mark_purchased", "manage_budget", "add_transactions", "edit_transactions",
  "manage_income", "manage_recurring", "manage_savings", "manage_members", "manage_settings",
];

export const PERMISSION_LABELS: Record<Permission, string> = {
  view_shopping: "View grocery & shopping lists",
  edit_shopping: "Add grocery items",
  mark_purchased: "Mark items as purchased",
  view_budget: "View household budgets",
  manage_budget: "Change budgets and limits",
  view_transactions: "View transactions",
  add_transactions: "Add expenses",
  edit_transactions: "Edit or delete transactions",
  view_income: "View income",
  manage_income: "Manage income sources",
  view_balances: "View total account balances & savings",
  manage_recurring: "Manage bills & subscriptions",
  manage_savings: "Manage savings & goals",
  manage_members: "Invite and remove members",
  manage_settings: "Manage household settings",
  view_advisor: "Use the financial advisor",
};

export const CAT = {
  groceries: "00000000-0000-4000-8000-ca0000000001",
  rent: "00000000-0000-4000-8000-ca0000000002",
  utilities: "00000000-0000-4000-8000-ca0000000003",
  transport: "00000000-0000-4000-8000-ca0000000004",
  health: "00000000-0000-4000-8000-ca0000000005",
  education: "00000000-0000-4000-8000-ca0000000006",
  communication: "00000000-0000-4000-8000-ca0000000007",
  household: "00000000-0000-4000-8000-ca0000000008",
  family: "00000000-0000-4000-8000-ca0000000009",
  dining: "00000000-0000-4000-8000-ca0000000010",
  entertainment: "00000000-0000-4000-8000-ca0000000011",
  subscriptions: "00000000-0000-4000-8000-ca0000000012",
  clothing: "00000000-0000-4000-8000-ca0000000013",
  personal: "00000000-0000-4000-8000-ca0000000014",
  gifts: "00000000-0000-4000-8000-ca0000000015",
  other: "00000000-0000-4000-8000-ca0000000016",
  salary: "00000000-0000-4000-8000-ca0000000017",
  freelance: "00000000-0000-4000-8000-ca0000000018",
  business: "00000000-0000-4000-8000-ca0000000019",
  incomeOther: "00000000-0000-4000-8000-ca0000000020",
  savings: "00000000-0000-4000-8000-ca0000000021",
} as const;

type SeedCategory = Omit<TransactionCategory, "createdAt" | "updatedAt">;

export const SYSTEM_CATEGORIES: SeedCategory[] = [
  { id: "00000000-0000-4000-8000-ca0000000001", householdId: null, name: "Groceries", kind: "expense", essential: true, icon: "ShoppingBasket" },
  { id: "00000000-0000-4000-8000-ca0000000002", householdId: null, name: "Rent & Housing", kind: "expense", essential: true, icon: "Home" },
  { id: "00000000-0000-4000-8000-ca0000000003", householdId: null, name: "Utilities", kind: "expense", essential: true, icon: "Zap" },
  { id: "00000000-0000-4000-8000-ca0000000004", householdId: null, name: "Transport", kind: "expense", essential: true, icon: "Bus" },
  { id: "00000000-0000-4000-8000-ca0000000005", householdId: null, name: "Health & Medical", kind: "expense", essential: true, icon: "HeartPulse" },
  { id: "00000000-0000-4000-8000-ca0000000006", householdId: null, name: "Education", kind: "expense", essential: true, icon: "GraduationCap" },
  { id: "00000000-0000-4000-8000-ca0000000007", householdId: null, name: "Airtime & Internet", kind: "expense", essential: true, icon: "Wifi" },
  { id: "00000000-0000-4000-8000-ca0000000008", householdId: null, name: "Household Supplies", kind: "expense", essential: true, icon: "SprayCan" },
  { id: "00000000-0000-4000-8000-ca0000000009", householdId: null, name: "Family Support", kind: "expense", essential: true, icon: "Users" },
  { id: "00000000-0000-4000-8000-ca0000000010", householdId: null, name: "Eating Out", kind: "expense", essential: false, icon: "UtensilsCrossed" },
  { id: "00000000-0000-4000-8000-ca0000000011", householdId: null, name: "Entertainment", kind: "expense", essential: false, icon: "Clapperboard" },
  { id: "00000000-0000-4000-8000-ca0000000012", householdId: null, name: "Subscriptions", kind: "expense", essential: false, icon: "Repeat" },
  { id: "00000000-0000-4000-8000-ca0000000013", householdId: null, name: "Clothing", kind: "expense", essential: false, icon: "Shirt" },
  { id: "00000000-0000-4000-8000-ca0000000014", householdId: null, name: "Personal Care", kind: "expense", essential: false, icon: "Sparkles" },
  { id: "00000000-0000-4000-8000-ca0000000015", householdId: null, name: "Gifts & Events", kind: "expense", essential: false, icon: "Gift" },
  { id: "00000000-0000-4000-8000-ca0000000016", householdId: null, name: "Other", kind: "expense", essential: false, icon: "Circle" },
  { id: "00000000-0000-4000-8000-ca0000000017", householdId: null, name: "Salary", kind: "income", essential: true, icon: "Briefcase" },
  { id: "00000000-0000-4000-8000-ca0000000018", householdId: null, name: "Freelance", kind: "income", essential: true, icon: "Laptop" },
  { id: "00000000-0000-4000-8000-ca0000000019", householdId: null, name: "Business", kind: "income", essential: true, icon: "Store" },
  { id: "00000000-0000-4000-8000-ca0000000020", householdId: null, name: "Other Income", kind: "income", essential: true, icon: "Coins" },
  { id: "00000000-0000-4000-8000-ca0000000021", householdId: null, name: "Savings", kind: "expense", essential: true, icon: "PiggyBank" },
];

export const PAYMENT_METHOD_LABELS = {
  momo: "Mobile Money (MoMo)",
  bank: "Bank transfer",
  cash: "Cash",
  card: "Card",
  other: "Other",
} as const;

export const FINANCIAL_GOAL_OPTIONS = [
  "Emergency fund",
  "Education",
  "Starting a business",
  "Buying land",
  "Buying a house",
  "Buying equipment",
  "Investing",
  "Family support",
  "Retirement",
];

export const MARKET_CATEGORIES = [
  "Grains",
  "Vegetables",
  "Fruits",
  "Meat and fish",
  "Cooking oil",
  "Food",
  "Household supplies",
  "Cleaning products",
  "Personal care",
  "Other essentials",
];

export const COUNTRIES = [
  { name: "Rwanda", currency: "RWF", timezone: "Africa/Kigali" },
  { name: "Uganda", currency: "UGX", timezone: "Africa/Kampala" },
  { name: "Kenya", currency: "KES", timezone: "Africa/Nairobi" },
  { name: "Tanzania", currency: "TZS", timezone: "Africa/Dar_es_Salaam" },
  { name: "Burundi", currency: "BIF", timezone: "Africa/Bujumbura" },
  { name: "Other", currency: "USD", timezone: "UTC" },
];

export const LANGUAGES = ["English", "Kinyarwanda", "French", "Swahili"];
