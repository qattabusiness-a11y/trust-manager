import type { Api } from "@/lib/data/api";
import { localToUtcIso } from "@/lib/dates";
import type { TransactionInput } from "@/lib/validations";
import type { Transaction } from "@/types";

export class ValidationError extends Error {
  constructor(public issues: { path: string; message: string }[]) {
    super(issues[0]?.message ?? "Please check the form.");
  }
}

/** Every transaction is validated by the server before it is persisted. */
export async function validateOnServer(input: TransactionInput): Promise<TransactionInput> {
  let res: Response;
  try {
    res = await fetch("/api/transactions/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    });
  } catch {
    throw new Error("Couldn't reach the server to validate this transaction. Check your connection and retry.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ValidationError(json.issues ?? [{ path: "", message: json.error ?? "Validation failed." }]);
  return json.data as TransactionInput;
}

export interface SaveOptions {
  id?: string;
  tz: string;
  currency: string;
  source?: Transaction["source"];
  shoppingItemId?: string | null;
  note?: string;
}

export async function saveTransaction(api: Api, input: TransactionInput, opts: SaveOptions): Promise<Transaction> {
  const v = await validateOnServer(input);
  const fields = {
    type: v.type,
    title: v.title,
    amount: v.amount,
    currency: opts.currency,
    occurredAt: localToUtcIso(v.date, v.time, opts.tz),
    categoryId: v.categoryId,
    merchant: v.merchant,
    paymentMethod: v.paymentMethod,
    essential: v.essential,
    planned: v.planned,
    notes: v.notes,
    reference: v.reference ?? null,
    recordedBalance: v.recordedBalance ?? null,
  };
  if (opts.id) return api.update("transactions", opts.id, fields, opts.note ?? "Edited by user");
  return api.create("transactions", {
    householdId: api.actor.householdId!,
    ...fields,
    source: opts.source ?? "manual",
    shoppingItemId: opts.shoppingItemId ?? null,
    savingsGoalId: null,
    behaviorOverride: null,
    createdBy: api.actor.userId,
  });
}

const isSavingsMove = (tx: Transaction) => tx.type === "savings_transfer" || tx.type === "savings_withdrawal";

/** Savings contributions that were created together with a savings transaction. */
async function linkedContributions(api: Api, tx: Transaction, deleted: boolean) {
  if (!isSavingsMove(tx)) return [];
  const all = await api.list("savingsContributions", { includeDeleted: true });
  const at = new Date(tx.occurredAt).getTime();
  return all.filter(
    (c) => !!c.deletedAt === deleted && Math.abs(c.amount) === tx.amount && (c.transactionId === tx.id || new Date(c.contributedAt).getTime() === at),
  );
}

/**
 * Delete a transaction (soft delete, audited). Deleting a savings transfer
 * also removes its savings contribution so the available balance and the
 * savings total stay consistent.
 */
export async function removeTransaction(api: Api, tx: Transaction): Promise<void> {
  for (const c of await linkedContributions(api, tx, false)) await api.remove("savingsContributions", c.id, "Removed with its transaction");
  await api.remove("transactions", tx.id, "Deleted by user");
}

export async function restoreTransaction(api: Api, tx: Transaction): Promise<void> {
  await api.restore("transactions", tx.id);
  for (const c of await linkedContributions(api, tx, true)) await api.restore("savingsContributions", c.id);
}
