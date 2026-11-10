import type { CollectionKey, CollectionMap, Row } from "./collections";
import { matches, type DataStore } from "./store";

export const LOCAL_DB_KEY = "tm:db:v1";
export const LOCAL_DB_VERSION = 1;

export type LocalDB = { [K in CollectionKey]: CollectionMap[K][] } & { __version: number; __seededAt: string };

const EMPTY: Omit<LocalDB, "__version" | "__seededAt"> = {
  profiles: [],
  households: [],
  householdMembers: [],
  invitations: [],
  personas: [],
  incomeSources: [],
  budgets: [],
  budgetAllocations: [],
  transactions: [],
  categories: [],
  savingsAccounts: [],
  savingsGoals: [],
  savingsContributions: [],
  shoppingLists: [],
  shoppingItems: [],
  marketProducts: [],
  marketPriceHistory: [],
  recurringPayments: [],
  subscriptionUsage: [],
  notifications: [],
  visionEntries: [],
  advisoryReports: [],
  preferences: [],
  auditLogs: [],
};

export function emptyDb(): LocalDB {
  return { ...structuredClone(EMPTY), __version: LOCAL_DB_VERSION, __seededAt: new Date().toISOString() };
}

/**
 * Development-mode store backed by localStorage.
 * Receipt images are never written here — only structured, confirmed data.
 */
export class LocalStore implements DataStore {
  readonly mode = "local" as const;
  private db: LocalDB;

  constructor(db: LocalDB, private persistFn: (db: LocalDB) => void) {
    this.db = db;
  }

  snapshot(): LocalDB {
    return this.db;
  }

  replace(db: LocalDB) {
    this.db = db;
    this.persistFn(db);
  }

  private persist() {
    this.persistFn(this.db);
  }

  async select<K extends CollectionKey>(k: K, match?: Partial<Row<K>>): Promise<Row<K>[]> {
    return structuredClone((this.db[k] as Row<K>[]).filter((r) => matches(r, match)));
  }

  async getById<K extends CollectionKey>(k: K, id: string): Promise<Row<K> | null> {
    const row = (this.db[k] as Row<K>[]).find((r) => r.id === id);
    return row ? structuredClone(row) : null;
  }

  async insert<K extends CollectionKey>(k: K, row: Row<K>): Promise<Row<K>> {
    (this.db[k] as Row<K>[]).push(structuredClone(row));
    this.persist();
    return structuredClone(row);
  }

  async insertMany<K extends CollectionKey>(k: K, rows: Row<K>[]): Promise<void> {
    (this.db[k] as Row<K>[]).push(...structuredClone(rows));
    this.persist();
  }

  async update<K extends CollectionKey>(k: K, id: string, patch: Partial<Row<K>>): Promise<Row<K>> {
    const list = this.db[k] as Row<K>[];
    const idx = list.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error("Record not found.");
    list[idx] = { ...list[idx]!, ...structuredClone(patch) };
    this.persist();
    return structuredClone(list[idx]!);
  }

  async remove<K extends CollectionKey>(k: K, id: string): Promise<void> {
    const list = this.db[k] as Row<K>[];
    const idx = list.findIndex((r) => r.id === id);
    if (idx >= 0) list.splice(idx, 1);
    this.persist();
  }
}

export function readLocalDb(): LocalDB | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_DB_KEY);
    if (!raw) return null;
    const db = JSON.parse(raw) as LocalDB;
    if (db.__version !== LOCAL_DB_VERSION) return null;
    return { ...emptyDb(), ...db };
  } catch {
    return null;
  }
}

export function writeLocalDb(db: LocalDB) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
  } catch (e) {
    // Quota or privacy mode — keep working in memory.
    console.warn("Trust Manager: could not persist local data.", (e as Error).name);
  }
}
