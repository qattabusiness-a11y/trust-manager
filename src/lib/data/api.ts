import { assertCan, can, PermissionError } from "@/lib/permissions";
import type { AuditLog, Household, HouseholdMember, Permission } from "@/types";
import { uuid } from "@/lib/utils";
import { POLICIES, type CollectionKey, type Row } from "./collections";
import type { DataStore } from "./store";

export interface Actor {
  userId: string;
  householdId: string | null;
  member: HouseholdMember | null;
}

type BaseKeys = "id" | "createdAt" | "updatedAt";
export type NewRow<K extends CollectionKey> = Omit<Row<K>, BaseKeys | "deletedAt"> & { id?: string; deletedAt?: string | null };

/** Fields a member with only "mark_purchased" may change on a shopping item. */
const PURCHASE_FIELDS = new Set(["status", "actualCost", "purchasedAt", "merchant", "transactionId", "updatedAt"]);
const NEVER_AUDIT = new Set(["passwordHash", "passwordSalt", "tokenHash", "updatedAt"]);

function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (NEVER_AUDIT.has(key)) continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changes[key] = { from: before[key] ?? null, to: after[key] };
  }
  return changes;
}

/**
 * Permission-aware data API. Mirrors the RLS policies so that local
 * development mode enforces the same household boundaries and role rules
 * as the production database. UI hiding is never the only protection.
 */
export function createApi(store: DataStore, actor: Actor) {
  const member = actor.member;
  const householdId = actor.householdId;

  function requireHousehold(): string {
    if (!householdId || !member || member.status !== "active") throw new PermissionError("member");
    return householdId;
  }

  async function audit(entry: Omit<AuditLog, "id" | "createdAt" | "updatedAt" | "actorId" | "householdId"> & { householdId?: string | null }) {
    const now = new Date().toISOString();
    await store.insert("auditLogs", {
      id: uuid(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      actorId: actor.userId,
      householdId: entry.householdId ?? householdId,
      ...entry,
    } as AuditLog);
  }

  function checkWrite(k: CollectionKey, op: "create" | "update" | "remove", patch?: Record<string, unknown>) {
    const policy = POLICIES[k];
    if (policy.scope === "household") {
      requireHousehold();
      if (k === "shoppingItems" && op === "update" && patch && Object.keys(patch).every((f) => PURCHASE_FIELDS.has(f))) {
        if (can(member, "mark_purchased") || can(member, "edit_shopping")) return;
        throw new PermissionError("mark_purchased");
      }
      if (k === "notifications") return; // members manage their own notification state
      const perm = policy[op];
      if (perm) assertCan(member, perm);
    }
    if (policy.scope === "public" && op !== "create") {
      // Reference data (categories, market index) is read-only from the app.
      throw new PermissionError("manage_settings");
    }
  }

  const api = {
    actor,
    store,
    can: (perm: Permission) => can(member, perm),

    async list<K extends CollectionKey>(k: K, opts: { includeDeleted?: boolean } = {}): Promise<Row<K>[]> {
      const policy = POLICIES[k];
      let rows: Row<K>[];
      switch (policy.scope) {
        case "public":
          rows = await store.select(k);
          break;
        case "user":
          rows = await store.select(k, { userId: actor.userId } as unknown as Partial<Row<K>>);
          break;
        case "household": {
          if (!householdId || !member || member.status !== "active") return [];
          if (policy.read && !can(member, policy.read)) return [];
          rows = await store.select(k, { householdId } as unknown as Partial<Row<K>>);
          if (k === "notifications") {
            rows = rows.filter((n) => {
              const r = n as unknown as { userId: string | null };
              return r.userId === null || r.userId === actor.userId;
            });
          }
          if (k === "householdMembers" && !can(member, "manage_members")) {
            rows = rows.filter((m) => (m as unknown as HouseholdMember).status === "active");
          }
          break;
        }
        case "special":
          if (k === "profiles") rows = await store.select(k, { id: actor.userId } as unknown as Partial<Row<K>>);
          else if (k === "households") {
            if (!householdId || !member) return [];
            const h = (await store.getById("households", householdId)) as Household | null;
            if (!h) return [];
            const visible = can(member, "view_balances") ? h : { ...h, openingBalance: 0 };
            rows = [visible as unknown as Row<K>];
          } else rows = [];
          break;
      }
      return opts.includeDeleted ? rows : rows.filter((r) => !(r as { deletedAt?: string | null }).deletedAt);
    },

    async create<K extends CollectionKey>(k: K, data: NewRow<K>): Promise<Row<K>> {
      checkWrite(k, "create");
      const now = new Date().toISOString();
      const row = { id: uuid(), createdAt: now, updatedAt: now, deletedAt: null, ...data } as unknown as Row<K>;
      const scoped = row as unknown as { householdId?: string; userId?: string };
      if (POLICIES[k].scope === "household" && scoped.householdId !== householdId) throw new PermissionError("member");
      if (POLICIES[k].scope === "user" && scoped.userId !== actor.userId) throw new PermissionError("own_record");
      const saved = await store.insert(k, row);
      if (POLICIES[k].audited) await audit({ action: "create", entity: k, entityId: row.id, changes: null });
      return saved;
    },

    async update<K extends CollectionKey>(k: K, id: string, patch: Partial<Row<K>>, note?: string): Promise<Row<K>> {
      const before = await store.getById(k, id);
      if (!before) throw new Error("Record not found.");
      const scoped = before as unknown as { householdId?: string; userId?: string };
      if (POLICIES[k].scope === "household" && scoped.householdId !== householdId) throw new PermissionError("member");
      if (POLICIES[k].scope === "user" && scoped.userId !== actor.userId) throw new PermissionError("own_record");
      if (k === "profiles" && before.id !== actor.userId) throw new PermissionError("own_record");
      if (k === "households") {
        requireHousehold();
        if (before.id !== householdId) throw new PermissionError("member");
        assertCan(member, "manage_settings");
        if ("openingBalance" in patch || "openingBalanceDate" in patch) assertCan(member, "view_balances");
      } else {
        checkWrite(k, "update", patch as Record<string, unknown>);
      }
      const { id: _i, householdId: _h, createdAt: _c, ...safe } = patch as Record<string, unknown>;
      void _i; void _h; void _c;
      const next = await store.update(k, id, { ...safe, updatedAt: new Date().toISOString() } as unknown as Partial<Row<K>>);
      if (POLICIES[k].audited) {
        const changes = diff(before as unknown as Record<string, unknown>, safe);
        if (Object.keys(changes).length) await audit({ action: "update", entity: k, entityId: id, changes, note });
      }
      return next;
    },

    async remove<K extends CollectionKey>(k: K, id: string, note?: string): Promise<void> {
      const before = await store.getById(k, id);
      if (!before) return;
      const scoped = before as unknown as { householdId?: string };
      if (POLICIES[k].scope === "household" && scoped.householdId !== householdId) throw new PermissionError("member");
      checkWrite(k, "remove");
      if (POLICIES[k].soft) {
        await store.update(k, id, { deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as unknown as Partial<Row<K>>);
      } else {
        await store.remove(k, id);
      }
      if (POLICIES[k].audited) await audit({ action: "delete", entity: k, entityId: id, changes: null, note });
    },

    async restore<K extends CollectionKey>(k: K, id: string): Promise<void> {
      checkWrite(k, "update");
      await store.update(k, id, { deletedAt: null, updatedAt: new Date().toISOString() } as unknown as Partial<Row<K>>);
      if (POLICIES[k].audited) await audit({ action: "restore", entity: k, entityId: id, changes: null });
    },

    audit,
  };
  return api;
}

export type Api = ReturnType<typeof createApi>;
