import type { CollectionKey, Row } from "./collections";

/**
 * Storage adapter. Two implementations share this contract:
 *  - LocalStore    — browser persistence for development / demo mode
 *  - SupabaseStore — PostgreSQL via Supabase, protected by RLS
 */
export interface DataStore {
  readonly mode: "local" | "supabase";
  select<K extends CollectionKey>(k: K, match?: Partial<Row<K>>): Promise<Row<K>[]>;
  getById<K extends CollectionKey>(k: K, id: string): Promise<Row<K> | null>;
  insert<K extends CollectionKey>(k: K, row: Row<K>): Promise<Row<K>>;
  insertMany<K extends CollectionKey>(k: K, rows: Row<K>[]): Promise<void>;
  update<K extends CollectionKey>(k: K, id: string, patch: Partial<Row<K>>): Promise<Row<K>>;
  remove<K extends CollectionKey>(k: K, id: string): Promise<void>;
}

export function matches<T extends object>(row: T, match?: Partial<T>): boolean {
  if (!match) return true;
  for (const [key, value] of Object.entries(match)) {
    if (value === undefined) continue;
    if ((row as Record<string, unknown>)[key] !== value) return false;
  }
  return true;
}
