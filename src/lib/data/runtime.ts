"use client";

import { isSupabaseConfigured } from "@/config/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { LocalStore, readLocalDb, writeLocalDb, type LocalDB } from "./local-store";
import { buildDemoDb } from "./seed";
import type { DataStore } from "./store";
import { SupabaseStore } from "./supabase-store";

let storePromise: Promise<DataStore> | null = null;
let localStore: LocalStore | null = null;

/** Returns the active data store, seeding demo data on first local run. */
export function getStore(): Promise<DataStore> {
  storePromise ??= (async () => {
    if (isSupabaseConfigured()) return new SupabaseStore(getSupabaseBrowserClient());
    let db: LocalDB | null = readLocalDb();
    if (!db) {
      db = await buildDemoDb(new Date());
      writeLocalDb(db);
    }
    localStore = new LocalStore(db, writeLocalDb);
    return localStore;
  })();
  return storePromise;
}

/** Development mode only: wipe local data and reseed the deterministic demo. */
export async function resetDemoData(): Promise<void> {
  if (isSupabaseConfigured()) throw new Error("Demo reset is only available in development mode.");
  const db = await buildDemoDb(new Date());
  await getStore();
  localStore!.replace(db);
}

/** Development mode only: full local export. */
export async function exportLocalSnapshot(): Promise<LocalDB | null> {
  await getStore();
  return localStore ? localStore.snapshot() : null;
}
