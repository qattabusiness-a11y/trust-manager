import { addDays } from "date-fns";
import type { MarketPricePoint, MarketProduct } from "@/types";
import { DEMO_MARKET_SOURCE } from "@/constants";
import { stableHash } from "@/lib/utils";

/**
 * Illustrative market index for Rwanda. These are SIMULATED prices for
 * development and demos — not verified live market prices.
 */
export { DEMO_MARKET_SOURCE };

interface ProductSeed {
  slug: string;
  name: string;
  category: string;
  unit: string;
  perishable: boolean;
  shelfLifeDays: number;
  base: number;
  /** Total change applied over the last weeks (e.g. -0.2 = 20% cheaper). */
  trend: number;
  /** Week index (0–9) from which the trend starts. */
  trendFrom: number;
  rounding: number;
}

const PRODUCTS: ProductSeed[] = [
  { slug: "rice", name: "Rice (local)", category: "Grains", unit: "kg", perishable: false, shelfLifeDays: 365, base: 1450, trend: -0.2, trendFrom: 7, rounding: 10 },
  { slug: "beans", name: "Beans", category: "Grains", unit: "kg", perishable: false, shelfLifeDays: 270, base: 1100, trend: 0.02, trendFrom: 5, rounding: 10 },
  { slug: "maize-flour", name: "Maize flour", category: "Grains", unit: "kg", perishable: false, shelfLifeDays: 120, base: 950, trend: -0.12, trendFrom: 6, rounding: 10 },
  { slug: "cassava-flour", name: "Cassava flour", category: "Grains", unit: "kg", perishable: false, shelfLifeDays: 120, base: 800, trend: 0.03, trendFrom: 4, rounding: 10 },
  { slug: "sugar", name: "Sugar", category: "Food", unit: "kg", perishable: false, shelfLifeDays: 365, base: 1650, trend: 0.04, trendFrom: 6, rounding: 10 },
  { slug: "salt", name: "Salt", category: "Food", unit: "kg", perishable: false, shelfLifeDays: 1000, base: 400, trend: 0, trendFrom: 9, rounding: 10 },
  { slug: "cooking-oil", name: "Cooking oil", category: "Cooking oil", unit: "litre", perishable: false, shelfLifeDays: 270, base: 3000, trend: 0.07, trendFrom: 5, rounding: 50 },
  { slug: "irish-potatoes", name: "Irish potatoes", category: "Vegetables", unit: "kg", perishable: true, shelfLifeDays: 30, base: 650, trend: -0.06, trendFrom: 6, rounding: 10 },
  { slug: "tomatoes", name: "Tomatoes", category: "Vegetables", unit: "kg", perishable: true, shelfLifeDays: 7, base: 900, trend: 0.24, trendFrom: 6, rounding: 10 },
  { slug: "onions", name: "Onions", category: "Vegetables", unit: "kg", perishable: true, shelfLifeDays: 45, base: 1200, trend: 0.05, trendFrom: 6, rounding: 10 },
  { slug: "cooking-bananas", name: "Cooking bananas (matoke)", category: "Vegetables", unit: "kg", perishable: true, shelfLifeDays: 7, base: 400, trend: -0.03, trendFrom: 6, rounding: 10 },
  { slug: "avocados", name: "Avocados", category: "Fruits", unit: "piece", perishable: true, shelfLifeDays: 7, base: 250, trend: -0.1, trendFrom: 6, rounding: 10 },
  { slug: "passion-fruit", name: "Passion fruit", category: "Fruits", unit: "kg", perishable: true, shelfLifeDays: 10, base: 1500, trend: 0.08, trendFrom: 6, rounding: 50 },
  { slug: "milk", name: "Fresh milk", category: "Food", unit: "litre", perishable: true, shelfLifeDays: 3, base: 600, trend: 0, trendFrom: 9, rounding: 10 },
  { slug: "eggs", name: "Eggs (tray of 30)", category: "Food", unit: "tray", perishable: true, shelfLifeDays: 21, base: 4500, trend: 0.05, trendFrom: 6, rounding: 50 },
  { slug: "beef", name: "Beef", category: "Meat and fish", unit: "kg", perishable: true, shelfLifeDays: 3, base: 6000, trend: 0.03, trendFrom: 5, rounding: 50 },
  { slug: "tilapia", name: "Tilapia", category: "Meat and fish", unit: "kg", perishable: true, shelfLifeDays: 2, base: 5000, trend: 0, trendFrom: 9, rounding: 50 },
  { slug: "soap", name: "Bar soap", category: "Cleaning products", unit: "bar", perishable: false, shelfLifeDays: 730, base: 800, trend: 0, trendFrom: 9, rounding: 10 },
  { slug: "detergent", name: "Washing powder", category: "Cleaning products", unit: "kg", perishable: false, shelfLifeDays: 730, base: 2600, trend: -0.09, trendFrom: 7, rounding: 50 },
  { slug: "charcoal", name: "Charcoal", category: "Household supplies", unit: "sack", perishable: false, shelfLifeDays: 365, base: 16000, trend: 0.06, trendFrom: 5, rounding: 500 },
  { slug: "toothpaste", name: "Toothpaste", category: "Personal care", unit: "tube", perishable: false, shelfLifeDays: 730, base: 1500, trend: 0, trendFrom: 9, rounding: 50 },
];

const MARKETS = [
  { name: "Kimironko Market", location: "Gasabo, Kigali", factor: 1.0 },
  { name: "Nyabugogo Market", location: "Nyarugenge, Kigali", factor: 0.95 },
  { name: "Kicukiro Centre Market", location: "Kicukiro, Kigali", factor: 1.03 },
  { name: "Simba Supermarket", location: "Kigali Heights, Kigali", factor: 1.12 },
  { name: "Musanze Market", location: "Musanze", factor: 0.92 },
];

const WEEKS = 10;

export function productId(n: number) {
  return `00000000-0000-4000-8000-ab${String(n).padStart(10, "0")}`;
}

export function buildMarketSeed(anchor: Date): { products: MarketProduct[]; history: MarketPricePoint[] } {
  const ts = anchor.toISOString();
  const products: MarketProduct[] = PRODUCTS.map((p, i) => ({
    id: productId(i + 1),
    slug: p.slug,
    name: p.name,
    category: p.category,
    unit: p.unit,
    perishable: p.perishable,
    shelfLifeDays: p.shelfLifeDays,
    createdAt: ts,
    updatedAt: ts,
  }));

  const history: MarketPricePoint[] = [];
  let n = 0;
  PRODUCTS.forEach((p, i) => {
    for (const m of MARKETS) {
      for (let w = 0; w < WEEKS; w++) {
        // Latest point: yesterday 08:00 Kigali (06:00 UTC); then weekly back.
        const day = addDays(anchor, -1 - (WEEKS - 1 - w) * 7);
        const recordedAt = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 6, 0, 0)).toISOString();
        const span = WEEKS - 1 - p.trendFrom;
        const progress = w < p.trendFrom ? 0 : span <= 0 ? 1 : (w - p.trendFrom + 1) / (span + 1);
        const wobble = ((stableHash(`${p.slug}|${m.name}|${w}`) % 1000) / 1000 - 0.5) * 0.03;
        const raw = p.base * m.factor * (1 + p.trend * progress) * (1 + wobble);
        const price = Math.max(p.rounding, Math.round(raw / p.rounding) * p.rounding);
        history.push({
          id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
          productId: productId(i + 1),
          marketName: m.name,
          location: m.location,
          price,
          currency: "RWF",
          recordedAt,
          source: DEMO_MARKET_SOURCE,
        });
      }
    }
  });
  return { products, history };
}
