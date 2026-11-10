"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Language = "en" | "rw";

export interface RateTable {
  base: string;
  /** Units of each currency per 1 unit of `base`. */
  rates: Record<string, number>;
  /** When the provider last updated the rates (ISO). */
  updatedAt: string;
  /** When this device fetched them (ISO). */
  fetchedAt: string;
  source: string;
}

interface DisplayState {
  language: Language;
  /** Currency amounts are shown in. null = the household's own currency. */
  displayCurrency: string | null;
  rates: RateTable | null;
  /** Rates typed by the person, used when no provider rate is available. key = `${base}->${target}` */
  manualRates: Record<string, number>;
  setLanguage: (l: Language) => void;
  setDisplayCurrency: (c: string | null) => void;
  setRates: (r: RateTable) => void;
  setManualRate: (base: string, target: string, rate: number | null) => void;
}

/** Per-device display preferences. No financial records are kept here. */
export const useDisplayStore = create<DisplayState>()(
  persist(
    (set) => ({
      language: "en",
      displayCurrency: null,
      rates: null,
      manualRates: {},
      setLanguage: (language) => set({ language }),
      setDisplayCurrency: (displayCurrency) => set({ displayCurrency }),
      setRates: (rates) => set({ rates }),
      setManualRate: (base, target, rate) =>
        set((s) => {
          const manualRates = { ...s.manualRates };
          const key = `${base}->${target}`;
          if (rate && rate > 0) manualRates[key] = rate;
          else delete manualRates[key];
          return { manualRates };
        }),
    }),
    { name: "tm:display" },
  ),
);
