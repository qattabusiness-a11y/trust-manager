import type { PaymentMethod, Priority, RecurringFrequency } from "@/types";

/**
 * A draft is something the assistant understood but has NOT saved.
 * Every draft is shown to the person, can be edited, and is only written
 * after they confirm. All amounts are integers in the household currency.
 */
interface DraftBase {
  id: string;
  /** Original words this draft came from (shown for transparency). */
  source: string;
  /** Required fields the assistant couldn't find. */
  missing: string[];
  /** Pre-ticked for saving (false e.g. for possible duplicates). */
  include: boolean;
  note?: string;
}

export interface TransactionDraft extends DraftBase {
  kind: "transaction";
  type: "expense" | "income";
  title: string;
  amount: number | null;
  date: string; // yyyy-MM-dd (household time zone)
  time: string; // HH:mm
  categoryId: string;
  merchant: string;
  paymentMethod: PaymentMethod;
  essential: boolean;
  planned: boolean;
  reference?: string | null;
  recordedBalance?: number | null;
  duplicateOf?: string | null;
}

export interface SavingsDraft extends DraftBase {
  kind: "savings";
  amount: number | null;
  goalId: string | null;
  goalName: string | null;
  date: string;
}

export interface ShoppingDraft extends DraftBase {
  kind: "shopping";
  productName: string;
  marketProductId: string | null;
  category: string;
  quantity: number;
  unit: string;
  estimatedUnitPrice: number | null;
  priority: Priority;
}

export interface PriceDraft extends DraftBase {
  kind: "price";
  productName: string;
  marketProductId: string | null;
  unit: string;
  price: number | null;
  marketName: string;
  date: string;
}

export interface BillDraft extends DraftBase {
  kind: "bill";
  name: string;
  amount: number | null;
  billKind: "bill" | "subscription" | "loan";
  category: string;
  frequency: RecurringFrequency;
  nextDueDate: string;
  essential: boolean;
}

export type Draft = TransactionDraft | SavingsDraft | ShoppingDraft | PriceDraft | BillDraft;

export type QuestionTopic =
  | "spent_today"
  | "spent_week"
  | "spent_month"
  | "balance"
  | "budget_left"
  | "safe_today"
  | "savings"
  | "top_category"
  | "top_payee"
  | "bills_due"
  | "run_out"
  | "income_month"
  | "help";

export interface ParseResult {
  drafts: Draft[];
  questions: QuestionTopic[];
  /** The person asked for it to be saved ("put that in my database", "bika"). */
  saveRequested?: boolean;
}

export interface ParseContext {
  today: string; // yyyy-MM-dd in household time zone
  nowTime: string; // HH:mm
  goals: { id: string; name: string }[];
  products: { id: string; name: string; slug: string; unit: string; category: string }[];
  newId: () => string;
}
