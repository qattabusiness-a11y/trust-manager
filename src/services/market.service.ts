import { compareProduct, latestPrices } from "@/lib/calculations/market";
import type { MarketComparison, MarketPrice, MarketPricePoint, MarketProduct } from "@/types";

/**
 * Market price provider contract. Future implementations:
 * local market surveys, retailer APIs, authorized supplier feeds,
 * manually submitted vendor prices, verified data providers.
 */
export interface MarketPriceProvider {
  readonly isLive: boolean;
  readonly label: string;
  getPrices(location?: string): Promise<MarketPrice[]>;
  getPriceHistory(productId: string): Promise<MarketPrice[]>;
  comparePrices(productId: string): Promise<MarketComparison>;
}

/** Simulated index seeded with illustrative RWF prices. NOT live data. */
export class MockMarketPriceService implements MarketPriceProvider {
  readonly isLive = false;
  readonly label = "DEMO DATA — Not verified live market prices.";

  constructor(private products: MarketProduct[], private history: MarketPricePoint[], private currency = "RWF") {}

  async getPrices(location?: string): Promise<MarketPrice[]> {
    const all = latestPrices(this.products, this.history, this.currency);
    return location ? all.filter((p) => p.location.toLowerCase().includes(location.toLowerCase())) : all;
  }

  async getPriceHistory(productId: string): Promise<MarketPrice[]> {
    const product = this.products.find((p) => p.id === productId);
    if (!product) return [];
    return this.history
      .filter((h) => h.productId === productId)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
      .map((h) => ({
        id: h.id,
        productId,
        productName: product.name,
        category: product.category,
        marketName: h.marketName,
        location: h.location,
        unit: product.unit,
        currentPrice: h.price,
        previousPrice: h.price,
        currency: h.currency,
        recordedAt: h.recordedAt,
        source: h.source,
      }));
  }

  async comparePrices(productId: string): Promise<MarketComparison> {
    const product = this.products.find((p) => p.id === productId);
    if (!product) throw new Error("Unknown product");
    const result = compareProduct(product, latestPrices(this.products, this.history, this.currency), this.history);
    if (!result) throw new Error("No prices recorded for this product");
    return result;
  }
}
