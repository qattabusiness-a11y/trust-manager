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
interface BatchItem {
  table: string;
  column: string | null;
  value: string | null;
  resolve: (rows: Record<string, unknown>[]) => void;
  reject: (e: unknown) => void;
}

/** How long to wait for other reads that belong to the same page load. */
const BATCH_WINDOW_MS = 8;

export class SupabaseStore implements DataStore {
  readonly mode = "supabase" as const;
  constructor(private sb: SupabaseClient) {}

  private fail(error: { message: string } | null): never | void {
    if (error) throw new Error(error.message);
  }

  /* --------------------------------------------------------------------
   * Read batching. A page asks for ~15 tables at once; instead of 15 HTTP
   * requests they are sent as ONE call to the `batch_select` function,
   * which runs as the signed-in user so Row Level Security still applies.
   * If the function isn't installed yet, reads fall back to one request
   * per table automatically.
   * ------------------------------------------------------------------ */
  private queue: BatchItem[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private batchAvailable = true;

  private batchable(match?: object): { column: string | null; value: string | null } | null {
    if (!this.batchAvailable) return null;
    const entries = Object.entries(match ?? {}).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return { column: null, value: null };
    if (entries.length === 1) {
      const [key, value] = entries[0]!;
      if ((key === "householdId" || key === "userId") && typeof value === "string") return { column: toSnake(key), value };
    }
    return null;
  }

  private enqueue(table: string, column: string | null, value: string | null): Promise<Record<string, unknown>[]> {
    return new Promise((resolve, reject) => {
      this.queue.push({ table, column, value, resolve, reject });
      this.timer ??= setTimeout(() => void this.flush(), BATCH_WINDOW_MS);
    });
  }

  private async flush() {
    const items = this.queue.splice(0, this.queue.length);
    this.timer = null;
    if (!items.length) return;
    const { data, error } = await this.sb.rpc("batch_select", {
      p_requests: items.map(({ table, column, value }) => ({ table, column, value })),
    });
    if (error) {
      // Function not installed yet (older database): read each table separately from now on.
      if (/batch_select|PGRST202|function .* does not exist|Could not find the function/i.test(`${error.code ?? ""} ${error.message}`)) this.batchAvailable = false;
      for (const it of items) {
        this.pagedSelect(it.table, it.column, it.value).then(it.resolve, it.reject);
      }
      return;
    }
    const results = (data ?? []) as Record<string, unknown>[][];
    items.forEach((it, i) => it.resolve(results[i] ?? []));
  }

  private async pagedSelect(table: string, column: string | null, value: string | null): Promise<Record<string, unknown>[]> {
    // PostgREST caps each response (1,000 rows by default), so page through results.
    const PAGE = 1000;
    const out: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = this.sb.from(table).select("*");
      if (column) q = q.eq(column, value as string);
      const { data, error } = await q.order("id").range(from, from + PAGE - 1);
      this.fail(error);
      const rows = (data ?? []) as Record<string, unknown>[];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out;
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
    const b = this.batchable(match);
    if (b) {
      const rows = await this.enqueue(TABLES[k], b.column, b.value);
      return rows.map((r) => mapKeys(r, toCamel) as unknown as Row<K>);
    }
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
    if (k === "households") {
      // Household and its (permission-protected) balance are fetched together: one round trip.
      const [h, b] = await Promise.all([
        this.sb.from(TABLES[k]).select("*").eq("id", id).maybeSingle(),
        this.sb.from("household_balances").select("*").eq("household_id", id).maybeSingle(),
      ]);
      this.fail(h.error);
      if (!h.data) return null;
      const row = mapKeys(h.data, toCamel);
      return {
        ...row,
        openingBalance: (b.data?.opening_balance as number) ?? 0,
        openingBalanceDate: (b.data?.opening_balance_date as string) ?? row.createdAt,
      } as unknown as Row<K>;
    }
    const { data, error } = await this.sb.from(TABLES[k]).select("*").eq("id", id).maybeSingle();
    this.fail(error);
    if (!data) return null;
    return mapKeys(data, toCamel) as unknown as Row<K>;
  }

  /**
   * Inserts without asking the database to return the row: a member may be
   * allowed to add a record they cannot read back (for example an audit-log
   * entry, or an expense added by someone who can't view transactions).
   * Ids and timestamps are generated by the app, so the sent row is complete.
   */
  async insert<K extends CollectionKey>(k: K, row: Row<K>): Promise<Row<K>> {
    const { error } = await this.sb.from(TABLES[k]).insert(mapKeys(row as unknown as Record<string, unknown>, toSnake));
    this.fail(error);
    return row;
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
