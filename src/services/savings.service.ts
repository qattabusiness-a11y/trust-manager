import type { Api } from "@/lib/data/api";
import { CAT } from "@/constants";
import type { SavingsContribution } from "@/types";

export interface TransferRequest {
  amount: number;
  accountId: string;
  goalId: string | null;
  source: SavingsContribution["source"];
  note?: string;
  /** Spending transaction that generated a round-up sweep. */
  relatedTransactionId?: string | null;
  direction?: "deposit" | "withdraw";
}

export interface TransferResult {
  simulated: boolean;
  reference: string;
  message: string;
}

/**
 * Savings transfer contract. A real implementation would call a MoMo or bank
 * API after explicit user authorization. The mock ONLY records the movement
 * inside Trust Manager and says so.
 */
export interface SavingsTransferService {
  readonly simulated: boolean;
  transfer(api: Api, req: TransferRequest): Promise<TransferResult>;
}

export class MockSavingsTransferService implements SavingsTransferService {
  readonly simulated = true;

  async transfer(api: Api, req: TransferRequest): Promise<TransferResult> {
    if (req.amount <= 0) throw new Error("Amount must be greater than zero.");
    const householdId = api.actor.householdId!;
    const now = new Date().toISOString();
    const withdraw = req.direction === "withdraw";
    const tx = await api.create("transactions", {
      householdId,
      type: withdraw ? "savings_withdrawal" : "savings_transfer",
      title: withdraw ? `Withdrawal from savings` : req.source === "micro_sweep" ? "Spare-change sweep" : "Transfer to savings",
      amount: req.amount,
      currency: "RWF",
      occurredAt: now,
      categoryId: CAT.savings,
      merchant: "Trust Manager savings (simulated)",
      paymentMethod: "other",
      essential: true,
      planned: true,
      notes: req.note ?? "",
      source: req.source === "micro_sweep" ? "micro_savings" : "manual",
      reference: null,
      recordedBalance: null,
      shoppingItemId: null,
      savingsGoalId: req.goalId,
      behaviorOverride: null,
      createdBy: api.actor.userId,
    });
    await api.create("savingsContributions", {
      householdId,
      goalId: req.goalId,
      accountId: req.accountId,
      amount: withdraw ? -req.amount : req.amount,
      source: req.source,
      simulated: true,
      transactionId: req.relatedTransactionId ?? tx.id,
      note: req.note,
      contributedAt: now,
    });
    return {
      simulated: true,
      reference: `SIM-${tx.id.slice(0, 8).toUpperCase()}`,
      message: "Simulated transfer recorded in Trust Manager. No MoMo or bank money was moved.",
    };
  }
}

export const savingsTransferService: SavingsTransferService = new MockSavingsTransferService();
