"use client";

import type { RateTable } from "@/stores/display.store";

/**
 * Exchange rates for DISPLAY only — records stay in the household currency.
 *
 * Source: ExchangeRate-API open access endpoint (free, no key, updated
 * daily). The source and its last-update time are always shown next to
 * converted amounts. If the service can't be reached, the person can type
 * a rate themselves.
 */
export const FX_SOURCE_NAME = "ExchangeRate-API (open.er-api.com)";
export const FX_SOURCE_URL = "https://www.exchangerate-api.com";
const ENDPOINT = (base: string) => `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function ratesAreFresh(r: RateTable | null, base: string): boolean {
  return !!r && r.base === base && Date.now() - new Date(r.fetchedAt).getTime() < MAX_AGE_MS;
}

export async function fetchRates(base: string, signal?: AbortSignal): Promise<RateTable> {
  const res = await fetch(ENDPOINT(base), { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`Exchange-rate service answered ${res.status}`);
  const json = (await res.json()) as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string; base_code?: string };
  if (json.result !== "success" || !json.rates) throw new Error("Exchange-rate service returned no rates");
  return {
    base: json.base_code ?? base,
    rates: json.rates,
    updatedAt: json.time_last_update_utc ? new Date(json.time_last_update_utc).toISOString() : new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    source: FX_SOURCE_NAME,
  };
}

export interface ResolvedRate {
  rate: number;
  source: "provider" | "manual";
  updatedAt: string | null;
}

/** Rate to convert 1 unit of `base` into `target`, preferring a rate the person typed. */
export function resolveRate(base: string, target: string, table: RateTable | null, manual: Record<string, number>): ResolvedRate | null {
  if (base === target) return { rate: 1, source: "provider", updatedAt: null };
  const typed = manual[`${base}->${target}`];
  if (typed && typed > 0) return { rate: typed, source: "manual", updatedAt: null };
  if (table && table.base === base && table.rates[target] && table.rates[target]! > 0) {
    return { rate: table.rates[target]!, source: "provider", updatedAt: table.updatedAt };
  }
  return null;
}
