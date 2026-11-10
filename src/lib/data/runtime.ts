"use client";

import { isSupabaseConfigured } from "@/config/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SYSTEM_CATEGORIES } from "@/constants";
import { emptyDb, LocalStore, readLocalDb, writeLocalDb, type LocalDB } from "./local-store";
import { buildMarketSeed } from "./seed-market";
import type { DataStore } from "./store";
import { SupabaseStore } from "./supabase-store";

let storePromise: Promise<DataStore> | null = null;
let localStore: LocalStore | null = null;

/**
 * A fresh, empty database for offline mode: only the spending categories and
 * the shared product list (no prices, no people, no transactions).
 */
export function buildStarterDb(now: Date = new Date()): LocalDB {
  const db = emptyDb();
  const ts = now.toISOString();
  db.categories.push(...SYSTEM_CATEGORIES.map((c) => ({ ...c, createdAt: ts, updatedAt: ts })));
  db.marketProducts.push(...buildMarketSeed(now).products);
  return db;
}

/** Returns the active data store (Supabase when configured, otherwise this device). */
export function getStore(): Promise<DataStore> {
  storePromise ??= (async () => {
    if (isSupabaseConfigured()) return new SupabaseStore(getSupabaseBrowserClient());
    let db: LocalDB | null = readLocalDb();
    if (!db) {
      db = buildStarterDb();
      writeLocalDb(db);
    }
    localStore = new LocalStore(db, writeLocalDb);
    return localStore;
  })();
  return storePromise;
}

/** Offline mode only: erase everything stored on this device. */
export async function clearLocalData(): Promise<void> {
  if (isSupabaseConfigured()) throw new Error("Only available in offline mode.");
  await getStore();
  localStore!.replace(buildStarterDb());
}

/** Development mode only: full local export. */
export async function exportLocalSnapshot(): Promise<LocalDB | null> {
  await getStore();
  return localStore ? localStore.snapshot() : null;
}
