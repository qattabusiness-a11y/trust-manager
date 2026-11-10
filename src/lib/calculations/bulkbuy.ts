import type { MarketComparison, MarketProduct } from "@/types";

/**
 * Bulk-buy arbitrage. A price drop is necessary but never sufficient:
 * the recommendation also has to fit consumption, shelf life, storage,
 * upcoming obligations and the emergency reserve.
 */

export const MIN_DROP_PCT = 8;

export interface BulkBuyInput {
  product: MarketProduct;
  comparison: MarketComparison;
  /** Units consumed per month by this household. */
  monthlyConsumption: number;
  availableBalance: number;
  /** Bills and fixed obligations due in the next 30 days. */
  upcomingObligations: number;
  /** Money that must stay untouched (emergency reserve). */
  reserve: number;
  /** Months of stock the household can store. */
  storageMonths: number;
}

export type BulkBuyResult =
  | { recommended: false; productId: string; reason: string; dropPct: number }
  | {
      recommended: true;
      productId: string;
      productName: string;
      unit: string;
      currentPrice: number;
      thirtyDayAverage: number;
      dropPct: number;
      months: number;
      quantity: number;
      totalCost: number;
      estimatedSavings: number;
      remainingAfterPurchase: number;
      upcomingObligations: number;
      reserve: number;
      confidence: "high" | "medium" | "low";
      verified: boolean;
      rationale: string[];
    };

export function evaluateBulkBuy(input: BulkBuyInput): BulkBuyResult {
  const { product, comparison: c } = input;
  const dropPct = c.thirtyDayAverage > 0 ? ((c.thirtyDayAverage - c.average) / c.thirtyDayAverage) * 100 : 0;
  const base = { recommended: false as const, productId: product.id, dropPct };

  if (c.priceCount < 3) return { ...base, reason: "Not enough price history yet — record prices over a few weeks to unlock bulk-buy advice." };
  if (dropPct < MIN_DROP_PCT) return { ...base, reason: "Price is not meaningfully below its 30-day average." };
  if (input.monthlyConsumption <= 0) return { ...base, reason: "Your household does not regularly use this item." };

  const shelfMonths = Math.floor(product.shelfLifeDays / 30);
  if (product.perishable && shelfMonths < 2)
    return { ...base, reason: "Perishable — it would spoil before you could use a larger stock." };

  const safeFunds = input.availableBalance - input.upcomingObligations - input.reserve;
  if (safeFunds <= 0)
    return { ...base, reason: "Your available money is needed for upcoming bills and your emergency reserve." };

  const maxMonths = Math.max(0, Math.min(3, shelfMonths, input.storageMonths));
  // One month is normal consumption; the bulk portion is the extra months.
  let months = maxMonths;
  const unitPrice = c.average;
  let quantity = 0;
  let cost = 0;
  // Never spend more than half of the truly free money on stock-up.
  const spendCap = Math.floor(safeFunds * 0.5);
  while (months >= 2) {
    quantity = Math.ceil(input.monthlyConsumption * months);
    cost = quantity * unitPrice;
    if (cost <= spendCap) break;
    months--;
  }
  if (months < 2) return { ...base, reason: "A two-month supply would use too much of your free money right now." };

  const estimatedSavings = Math.round(quantity * (c.thirtyDayAverage - unitPrice));
  const affordability = cost / safeFunds;
  const confidence: "high" | "medium" | "low" =
    dropPct >= 15 && affordability < 0.25 ? "high" : dropPct >= 10 && affordability < 0.4 ? "medium" : "low";

  return {
    recommended: true,
    productId: product.id,
    productName: product.name,
    unit: product.unit,
    currentPrice: unitPrice,
    thirtyDayAverage: c.thirtyDayAverage,
    dropPct,
    months,
    quantity,
    totalCost: cost,
    estimatedSavings,
    remainingAfterPurchase: input.availableBalance - cost,
    upcomingObligations: input.upcomingObligations,
    reserve: input.reserve,
    confidence,
    verified: c.verified,
    rationale: [
      `Price is ${dropPct.toFixed(0)}% below the recorded 30-day average.`,
      `Your household uses about ${input.monthlyConsumption} ${product.unit} per month.`,
      `Fits within shelf life (${product.shelfLifeDays} days) and your storage (${input.storageMonths} months).`,
      `Leaves upcoming bills and your emergency reserve untouched.`,
    ],
  };
}

/** Default monthly consumption per person, keyed by product slug (illustrative). */
export const PER_PERSON_MONTHLY: Record<string, number> = {
  "rice": 2.5,
  "beans": 2,
  "maize-flour": 2,
  "cassava-flour": 1.5,
  "sugar": 0.8,
  "cooking-oil": 0.6,
  "irish-potatoes": 4,
  "tomatoes": 1.5,
  "onions": 0.8,
  "bananas": 0,
  "cooking-bananas": 4,
  "milk": 6,
  "eggs": 0.5,
  "beef": 0.8,
  "tilapia": 0.5,
  "soap": 1,
  "detergent": 0.4,
  "charcoal": 0.3,
  "toothpaste": 0.3,
  "salt": 0.2,
};
