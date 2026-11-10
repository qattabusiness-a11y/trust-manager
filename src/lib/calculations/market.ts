import type { MarketComparison, MarketPrice, MarketPricePoint, MarketProduct } from "@/types";

const DAY = 86_400_000;

/** Latest and previous price per (product, market) derived from the history. */
export function latestPrices(products: MarketProduct[], history: MarketPricePoint[], currency: string): MarketPrice[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  const groups = new Map<string, MarketPricePoint[]>();
  for (const pt of history) {
    const k = `${pt.productId}|${pt.marketName}`;
    const arr = groups.get(k) ?? [];
    arr.push(pt);
    groups.set(k, arr);
  }
  const out: MarketPrice[] = [];
  for (const pts of groups.values()) {
    pts.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    const last = pts[pts.length - 1]!;
    const prev = pts.length > 1 ? pts[pts.length - 2]! : last;
    const product = productById.get(last.productId);
    if (!product) continue;
    out.push({
      id: last.id,
      productId: last.productId,
      productName: product.name,
      category: product.category,
      marketName: last.marketName,
      location: last.location,
      unit: product.unit,
      currentPrice: last.price,
      previousPrice: prev.price,
      currency: last.currency ?? currency,
      recordedAt: last.recordedAt,
      source: last.source,
    });
  }
  return out.sort((a, b) => a.productName.localeCompare(b.productName) || a.marketName.localeCompare(b.marketName));
}

export function changePct(current: number, previous: number): number {
  if (previous <= 0) return 0;
  return ((current - previous) / previous) * 100;
}

export function compareProduct(
  product: MarketProduct,
  current: MarketPrice[],
  history: MarketPricePoint[],
  now: Date = new Date(),
): MarketComparison | null {
  const rows = current.filter((p) => p.productId === product.id);
  if (!rows.length) return null;
  const average = Math.round(rows.reduce((s, r) => s + r.currentPrice, 0) / rows.length);
  const prevAverage = Math.round(rows.reduce((s, r) => s + r.previousPrice, 0) / rows.length);
  const sorted = [...rows].sort((a, b) => a.currentPrice - b.currentPrice);
  const lo = sorted[0]!;
  const hi = sorted[sorted.length - 1]!;
  const cutoff = now.getTime() - 30 * DAY;
  const window = history.filter((h) => h.productId === product.id && new Date(h.recordedAt).getTime() >= cutoff);
  const thirtyDayAverage = window.length
    ? Math.round(window.reduce((s, h) => s + h.price, 0) / window.length)
    : average;
  const latest = rows.map((r) => r.recordedAt).sort().at(-1)!;
  return {
    productId: product.id,
    productName: product.name,
    unit: product.unit,
    average,
    lowest: { price: lo.currentPrice, marketName: lo.marketName, location: lo.location },
    highest: { price: hi.currentPrice, marketName: hi.marketName, location: hi.location },
    thirtyDayAverage,
    changePct: changePct(average, prevAverage),
    source: rows[0]!.source,
    recordedAt: latest,
  };
}

/** Daily average price series for a product (across markets). */
export function priceSeries(productId: string, history: MarketPricePoint[]) {
  const byDay = new Map<string, number[]>();
  for (const h of history) {
    if (h.productId !== productId) continue;
    const d = h.recordedAt.slice(0, 10);
    const arr = byDay.get(d) ?? [];
    arr.push(h.price);
    byDay.set(d, arr);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, prices]) => ({ date, price: Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) }));
}

export interface PlanVsMarket {
  status: "saving_possible" | "plan_too_low" | "aligned" | "no_data";
  perUnitDifference: number;
  totalDifference: number;
  marketUnitPrice: number | null;
  message: string;
}

/** Compare a planned unit price with the market index. */
export function planVsMarket(
  plannedUnit: number,
  quantity: number,
  comparison: MarketComparison | null,
  fmt: (n: number) => string,
): PlanVsMarket {
  if (!comparison) {
    return { status: "no_data", perUnitDifference: 0, totalDifference: 0, marketUnitPrice: null, message: "No market data for this item yet." };
  }
  const market = comparison.average;
  const diff = plannedUnit - market;
  const tolerance = Math.max(1, Math.round(market * 0.03));
  if (diff > tolerance) {
    return {
      status: "saving_possible",
      perUnitDifference: diff,
      totalDifference: diff * quantity,
      marketUnitPrice: market,
      message: `You could save ${fmt(diff)} per ${comparison.unit} based on the available market data.`,
    };
  }
  if (diff < -tolerance) {
    return {
      status: "plan_too_low",
      perUnitDifference: diff,
      totalDifference: diff * quantity,
      marketUnitPrice: market,
      message: "Your planned budget may not be sufficient. Consider adjusting your shopping plan.",
    };
  }
  return {
    status: "aligned",
    perUnitDifference: diff,
    totalDifference: diff * quantity,
    marketUnitPrice: market,
    message: "Your planned price is in line with the market average.",
  };
}
