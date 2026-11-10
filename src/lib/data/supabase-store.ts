import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLES, type CollectionKey, type Row } from "./collections";
import type { DataStore } from "./store";

const toSnake = (s: string) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function mapKeys(obj: Record<string, unknown>, fn: (k: string) => string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[fn(k)] = v;
  }
  return out;
}

/**
 * Supabase-backed store. Rows are mapped camelCase <-> snake_case.
 * Row Level Security in the database is the authority on access.
 */
export class SupabaseStore implements DataStore {
  readonly mode = "supabase" as const;
  constructor(private sb: SupabaseClient) {}

  private fail(error: { message: string } | null): never | void {
    if (error) throw new Error(error.message);
  }

  /**
   * The households table does not hold the opening balance: it lives in
   * household_balances, readable only with the view_balances permission.
   * When RLS hides it, the balance comes back as 0, as in local mode.
   */
  private async withBalances(rows: Record<string, unknown>[]) {
    if (!rows.length) return rows;
    const { data } = await this.sb.from("household_balances").select("*").in("household_id", rows.map((r) => r.id as string));
    const byId = new Map((data ?? []).map((b) => [b.household_id as string, b]));
    return rows.map((r) => {
      const b = byId.get(r.id as string);
      return { ...r, openingBalance: (b?.opening_balance as number) ?? 0, openingBalanceDate: (b?.opening_balance_date as string) ?? r.createdAt };
    });
  }

  async select<K extends CollectionKey>(k: K, match?: Partial<Row<K>>): Promise<Row<K>[]> {
    if (k === "households") {
      const rows = await this.rawSelect(k, match);
      return (await this.withBalances(rows as unknown as Record<string, unknown>[])) as unknown as Row<K>[];
    }
    return this.rawSelect(k, match);
  }

  private async rawSelect<K extends CollectionKey>(k: K, match?: Partial<Row<K>>): Promise<Row<K>[]> {
    // PostgREST caps each response (1,000 rows by default), so page through results.
    const PAGE = 1000;
    const out: Row<K>[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = this.sb.from(TABLES[k]).select("*");
      if (match) {
        for (const [key, value] of Object.entries(match)) {
          if (value === undefined) continue;
          q = value === null ? q.is(toSnake(key), null) : q.eq(toSnake(key), value as string);
        }
      }
      const { data, error } = await q.order("id").range(from, from + PAGE - 1);
      this.fail(error);
      const rows = data ?? [];
      out.push(...rows.map((r) => mapKeys(r, toCamel) as unknown as Row<K>));
      if (rows.length < PAGE) break;
    }
    return out;
  }

  async getById<K extends CollectionKey>(k: K, id: string): Promise<Row<K> | null> {
    const { data, error } = await this.sb.from(TABLES[k]).select("*").eq("id", id).maybeSingle();
    this.fail(error);
    if (!data) return null;
    const row = mapKeys(data, toCamel);
    if (k === "households") return (await this.withBalances([row]))[0] as unknown as Row<K>;
    return row as unknown as Row<K>;
  }

  async insert<K extends CollectionKey>(k: K, row: Row<K>): Promise<Row<K>> {
    const { data, error } = await this.sb
      .from(TABLES[k])
      .insert(mapKeys(row as unknown as Record<string, unknown>, toSnake))
      .select("*")
      .single();
    this.fail(error);
    return mapKeys(data!, toCamel) as unknown as Row<K>;
  }

  async insertMany<K extends CollectionKey>(k: K, rows: Row<K>[]): Promise<void> {
    if (!rows.length) return;
    const { error } = await this.sb
      .from(TABLES[k])
      .insert(rows.map((r) => mapKeys(r as unknown as Record<string, unknown>, toSnake)));
    this.fail(error);
  }

  async update<K extends CollectionKey>(k: K, id: string, patch: Partial<Row<K>>): Promise<Row<K>> {
    if (k === "households") {
      const { openingBalance, openingBalanceDate, ...rest } = patch as Record<string, unknown>;
      if (openingBalance !== undefined || openingBalanceDate !== undefined) {
        const { error } = await this.sb
          .from("household_balances")
          .update(mapKeys({ openingBalance, openingBalanceDate }, toSnake))
          .eq("household_id", id);
        this.fail(error);
      }
      patch = rest as Partial<Row<K>>;
      if (!Object.keys(patch).length) return (await this.getById(k, id))!;
    }
    const { data, error } = await this.sb
      .from(TABLES[k])
      .update(mapKeys(patch as Record<string, unknown>, toSnake))
      .eq("id", id)
      .select("*")
      .single();
    this.fail(error);
    return mapKeys(data!, toCamel) as unknown as Row<K>;
  }

  async remove<K extends CollectionKey>(k: K, id: string): Promise<void> {
    const { error } = await this.sb.from(TABLES[k]).delete().eq("id", id);
    this.fail(error);
  }
}
