import { z } from "zod";

/** Shared Zod schemas — used by forms on the client AND by API routes on the server. */

const money = z.number({ message: "Enter an amount" }).int("Amount must be a whole number").nonnegative("Amount can't be negative");
const positiveMoney = money.refine((n) => n > 0, "Amount must be greater than zero");
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const timeStr = z.string().regex(/^\d{2}:\d{2}$/, "Choose a time");
const MAX_AMOUNT = 10_000_000_000;

export const transactionInputSchema = z.object({
  type: z.enum(["expense", "income", "savings_transfer", "savings_withdrawal"]),
  title: z.string().trim().min(2, "Give it a short title").max(80),
  amount: positiveMoney.refine((n) => n <= MAX_AMOUNT, "That amount looks too large"),
  date: dateStr,
  time: timeStr,
  categoryId: z.string().min(1, "Choose a category"),
  merchant: z.string().trim().max(80),
  paymentMethod: z.enum(["momo", "bank", "cash", "card", "other"]),
  essential: z.boolean(),
  planned: z.boolean(),
  notes: z.string().max(500).optional(),
  reference: z.string().max(60).nullable().optional(),
  recordedBalance: money.nullable().optional(),
});
export type TransactionInput = z.infer<typeof transactionInputSchema>;

export const incomeSourceSchema = z.object({
  name: z.string().trim().min(2).max(60),
  amount: positiveMoney,
  category: z.enum(["salary", "freelance", "business", "allowance", "family_support", "other"]),
  frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "yearly", "irregular", "once"]),
  expectedDate: dateStr,
  recurring: z.boolean(),
  savingsAllocation: money,
  notes: z.string().max(300).optional().default(""),
}).refine((v) => v.savingsAllocation <= v.amount, { message: "Savings allocation can't be more than the income", path: ["savingsAllocation"] });
export type IncomeSourceInput = z.infer<typeof incomeSourceSchema>;

export const budgetSchema = z.object({
  monthlyBudget: positiveMoney,
  savingsTarget: money,
  essentialAllocation: money,
  flexibleAllocation: money,
  customDailyLimit: money.nullable(),
  customWeeklyLimit: money.nullable(),
  caution: z.number().min(1).max(99),
  warning: z.number().min(1).max(99),
  critical: z.number().min(50).max(200),
}).refine((v) => v.essentialAllocation + v.flexibleAllocation <= v.monthlyBudget, {
  message: "Essential + flexible allocations can't exceed the monthly budget",
  path: ["flexibleAllocation"],
}).refine((v) => v.caution < v.warning && v.warning < v.critical, { message: "Thresholds must increase: caution < warning < critical", path: ["warning"] });
export type BudgetInput = z.infer<typeof budgetSchema>;

export const shoppingItemSchema = z.object({
  productName: z.string().trim().min(2).max(60),
  marketProductId: z.string().nullable().optional(),
  category: z.string().min(1),
  quantity: z.number().positive("Quantity must be more than zero").max(10_000),
  unit: z.string().trim().min(1).max(20),
  estimatedUnitPrice: positiveMoney,
  priority: z.enum(["low", "medium", "high"]),
  expectedDate: dateStr.nullable(),
  notes: z.string().max(300).optional().default(""),
});
export type ShoppingItemInput = z.infer<typeof shoppingItemSchema>;

export const purchaseSchema = z.object({
  actualCost: positiveMoney,
  merchant: z.string().trim().min(1, "Where did you buy it?").max(80),
  date: dateStr,
  paymentMethod: z.enum(["momo", "bank", "cash", "card", "other"]),
  recordTransaction: z.boolean(),
  recordPrice: z.boolean(),
});

export const recurringSchema = z.object({
  name: z.string().trim().min(2).max(60),
  amount: positiveMoney,
  category: z.string().min(1),
  kind: z.enum(["bill", "subscription", "loan"]),
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  nextDueDate: dateStr,
  endDate: dateStr.nullable().optional(),
  reminderDays: z.array(z.number().int().min(0).max(60)).max(6),
  essential: z.boolean(),
});
export type RecurringInput = z.infer<typeof recurringSchema>;

export const goalSchema = z.object({
  name: z.string().trim().min(2).max(60),
  targetAmount: positiveMoney,
  targetDate: dateStr.nullable(),
  priority: z.enum(["low", "medium", "high"]),
  startingAmount: money,
});

export const visionSchema = z.object({
  title: z.string().trim().min(2).max(80),
  description: z.string().max(600).default(""),
  category: z.enum(["dream", "business", "long_term", "purchase", "milestone", "investment_learning"]),
  targetAmount: money,
  targetDate: dateStr.nullable(),
  priority: z.enum(["low", "medium", "high"]),
  progress: z.number().min(0).max(100),
  status: z.enum(["idea", "planning", "in_progress", "achieved", "archived"]),
});

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["admin", "contributor", "viewer"]),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(80),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters").max(128).regex(/[A-Za-z]/, "Include a letter").regex(/\d/, "Include a number"),
});
