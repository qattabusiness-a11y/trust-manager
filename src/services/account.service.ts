"use client";

import { isSupabaseConfigured } from "@/config/env";
import type { Api } from "@/lib/data/api";
import { POLICIES, type CollectionKey } from "@/lib/data/collections";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** Everything this user is allowed to read, as one JSON document (passwords excluded). */
export async function exportMyData(api: Api) {
  const keys = (Object.keys(POLICIES) as CollectionKey[]).filter((k) => !["marketProducts", "marketPriceHistory", "categories"].includes(k));
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), format: "trust-manager-export/v1" };
  for (const k of keys) {
    const rows = await api.list(k, { includeDeleted: true });
    out[k] = rows.map((r) => {
      const { passwordHash: _h, passwordSalt: _s, tokenHash: _t, ...rest } = r as unknown as Record<string, unknown>;
      void _h; void _s; void _t;
      return rest;
    });
  }
  await api.audit({ action: "export", entity: "profiles", entityId: api.actor.userId, changes: null, note: "Data export downloaded" });
  return out;
}

/**
 * Account deletion. Local mode removes the user's personal records and
 * membership immediately (and the whole household if they were its only
 * member). Supabase mode calls `request_account_deletion`, which an
 * operator-run job completes (auth users can only be deleted server-side).
 */
export async function deleteMyAccount(api: Api): Promise<"deleted" | "requested"> {
  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseBrowserClient().rpc("request_account_deletion");
    if (error) throw new Error(error.message);
    return "requested";
  }
  const store = api.store;
  const userId = api.actor.userId;
  const memberships = await store.select("householdMembers", { userId });
  for (const m of memberships) {
    const others = (await store.select("householdMembers", { householdId: m.householdId })).filter((x) => x.userId !== userId && x.status === "active");
    if (others.length === 0) {
      // Sole member: remove every household-scoped record.
      for (const k of Object.keys(POLICIES) as CollectionKey[]) {
        if (POLICIES[k].scope !== "household") continue;
        for (const row of await store.select(k, { householdId: m.householdId } as never)) await store.remove(k, (row as { id: string }).id);
      }
      await store.remove("households", m.householdId);
    } else {
      if (m.role === "owner") throw new Error("Transfer ownership or remove the other members before deleting your account.");
      await store.remove("householdMembers", m.id);
    }
  }
  for (const k of ["personas", "preferences"] as const) for (const r of await store.select(k, { userId })) await store.remove(k, r.id);
  await store.remove("profiles", userId);
  return "deleted";
}
