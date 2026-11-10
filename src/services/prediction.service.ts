/** Prediction service facade — the engine lives in lib/calculations so it can be unit-tested. */
export { predictZeroBalance, MIN_OBSERVED_DAYS, MIN_OBSERVED_TRANSACTIONS } from "@/lib/calculations/prediction";
export type { ZeroBalanceResult, ZeroBalanceInput } from "@/lib/calculations/prediction";
export { scheduledFlows } from "@/lib/calculations/schedule";
